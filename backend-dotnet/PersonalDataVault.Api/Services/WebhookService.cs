using System.Net;
using System.Net.Sockets;
using PersonalDataVault.Api.Data.Models;

namespace PersonalDataVault.Api.Services;

/// <summary>
/// HMAC-signed webhook delivery to relying parties.
///
/// POST &lt;rp.webhook_url&gt; with:
///   X-PDV-Event:      consent.revoked | consent.expired | consent.granted
///   X-PDV-Signature:  sha256=&lt;hex&gt;
///   X-PDV-Timestamp:  ISO 8601
///   X-PDV-Delivery:   UUID
///
/// Delivery is best-effort with exponential backoff (3 retries).
/// </summary>
public interface IWebhookService
{
    Task<WebhookResult> SendRevocationWebhookAsync(RelyingParty rp, string grantId, string userId);
    void AttachInProcessListener(IServiceBusService bus, Func<string, Task<RelyingParty?>> getRelyingParty);
}

public record WebhookResult(bool Ok, bool Skipped = false, string? Error = null);

public class WebhookService(
    IConfiguration config,
    ICryptoService crypto,
    ILogger<WebhookService> logger,
    IHttpClientFactory httpClientFactory) : IWebhookService
{
    private static readonly int[] RetryDelaysMs = [500, 2000, 5000];

    public async Task<WebhookResult> SendRevocationWebhookAsync(RelyingParty rp, string grantId, string userId)
    {
        var url = rp.WebhookUrl;
        if (string.IsNullOrEmpty(url))
        {
            logger.LogDebug("No webhook_url for RP {RpId} — skipping", rp.Id);
            return new WebhookResult(true, Skipped: true);
        }

        return await DeliverAsync(url, new
        {
            @event         = "consent.revoked",
            grantId,
            userId,
            relyingPartyId = rp.Id,
            occurredAt     = DateTime.UtcNow.ToString("o"),
        }, new Dictionary<string, string> { ["X-PDV-Event"] = "consent.revoked" });
    }

    public void AttachInProcessListener(IServiceBusService bus, Func<string, Task<RelyingParty?>> getRelyingParty)
    {
        if (bus.ImplName != "memory") return;

        bus.Subscribe("consent.revoked", async body =>
        {
            if (body is not RevocationEvent evt) return;
            try
            {
                var rp = await getRelyingParty(evt.RelyingPartyId);
                if (rp is not null)
                    await SendRevocationWebhookAsync(rp, evt.GrantId, evt.UserId);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "In-process webhook delivery failed for grant {GrantId}", ((RevocationEvent)body).GrantId);
            }
        });

        logger.LogInformation("Attached in-process webhook listener (dev / memory event bus)");
    }

    private async Task<WebhookResult> DeliverAsync(string url, object payload, Dictionary<string, string> extraHeaders)
    {
        // SSRF guard: the webhook URL is attacker-influenced (set at RP registration).
        // Require https and refuse any host that resolves to a non-public address so we
        // can't be coerced into hitting cloud metadata, loopback, or internal services.
        var urlCheck = await ValidateWebhookUrlAsync(url);
        if (urlCheck is not null)
        {
            logger.LogWarning("Webhook URL rejected: {Url} ({Reason})", url, urlCheck);
            return new WebhookResult(false, Error: urlCheck);
        }

        var secret      = Environment.GetEnvironmentVariable("WEBHOOK_HMAC_SECRET") ?? config["WEBHOOK_HMAC_SECRET"] ?? "";
        var body        = System.Text.Json.JsonSerializer.Serialize(payload);
        var sig         = $"sha256={crypto.HmacSha256Hex(secret, body)}";
        var deliveryId  = Guid.NewGuid().ToString();

        Exception? lastErr = null;
        for (var attempt = 0; attempt <= RetryDelaysMs.Length; attempt++)
        {
            try
            {
                var client = httpClientFactory.CreateClient("webhook");
                using var req = new HttpRequestMessage(HttpMethod.Post, url)
                {
                    Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json"),
                };
                req.Headers.TryAddWithoutValidation("X-PDV-Signature",  sig);
                req.Headers.TryAddWithoutValidation("X-PDV-Timestamp",  DateTime.UtcNow.ToString("o"));
                req.Headers.TryAddWithoutValidation("X-PDV-Delivery",   deliveryId);
                foreach (var h in extraHeaders) req.Headers.TryAddWithoutValidation(h.Key, h.Value);

                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
                var resp = await client.SendAsync(req, cts.Token);

                if (resp.IsSuccessStatusCode)
                {
                    logger.LogDebug("Webhook delivered to {Url} attempt {Attempt} status {Status}", url, attempt, (int)resp.StatusCode);
                    return new WebhookResult(true);
                }
                lastErr = new HttpRequestException($"HTTP {(int)resp.StatusCode}");
                logger.LogWarning("Webhook non-2xx {Url} attempt {Attempt} status {Status}", url, attempt, (int)resp.StatusCode);
            }
            catch (Exception ex)
            {
                lastErr = ex;
                logger.LogWarning(ex, "Webhook delivery error {Url} attempt {Attempt}", url, attempt);
            }

            if (attempt < RetryDelaysMs.Length)
                await Task.Delay(RetryDelaysMs[attempt]);
        }

        return new WebhookResult(false, Error: lastErr?.Message ?? "unknown");
    }

    /// <summary>
    /// Returns null if the URL is a safe webhook target, otherwise a rejection reason.
    /// Requires https and that every resolved IP is a routable public address. Set
    /// Webhook:AllowPrivateTargets=true (dev/test only) to permit loopback/private hosts.
    /// </summary>
    private async Task<string?> ValidateWebhookUrlAsync(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
            return "malformed url";
        if (uri.Scheme != Uri.UriSchemeHttps)
            return "scheme must be https";

        if (config.GetValue<bool>("Webhook:AllowPrivateTargets", false))
            return null;

        IPAddress[] addresses;
        try
        {
            addresses = await Dns.GetHostAddressesAsync(uri.DnsSafeHost);
        }
        catch (SocketException)
        {
            return "host does not resolve";
        }
        if (addresses.Length == 0)
            return "host does not resolve";

        foreach (var ip in addresses)
            if (IsPrivateOrReserved(ip))
                return "host resolves to a non-public address";

        return null;
    }

    private static bool IsPrivateOrReserved(IPAddress ip)
    {
        if (IPAddress.IsLoopback(ip)) return true;

        if (ip.AddressFamily == AddressFamily.InterNetwork)
        {
            var b = ip.GetAddressBytes();
            // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 (private)
            if (b[0] == 10) return true;
            if (b[0] == 172 && b[1] >= 16 && b[1] <= 31) return true;
            if (b[0] == 192 && b[1] == 168) return true;
            // 169.254.0.0/16 link-local (incl. 169.254.169.254 cloud metadata)
            if (b[0] == 169 && b[1] == 254) return true;
            // 127.0.0.0/8 loopback, 0.0.0.0/8 "this network"
            if (b[0] == 127 || b[0] == 0) return true;
            // 100.64.0.0/10 carrier-grade NAT
            if (b[0] == 100 && b[1] >= 64 && b[1] <= 127) return true;
            return false;
        }

        if (ip.AddressFamily == AddressFamily.InterNetworkV6)
        {
            if (ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal || ip.IsIPv6Multicast) return true;
            var b = ip.GetAddressBytes();
            // fc00::/7 unique-local
            if ((b[0] & 0xFE) == 0xFC) return true;
            // ::ffff:0:0/96 IPv4-mapped — re-check the embedded IPv4
            if (ip.IsIPv4MappedToIPv6) return IsPrivateOrReserved(ip.MapToIPv4());
            return false;
        }

        return true;   // unknown address family — reject
    }
}
