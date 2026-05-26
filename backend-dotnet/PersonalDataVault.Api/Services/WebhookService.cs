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
}
