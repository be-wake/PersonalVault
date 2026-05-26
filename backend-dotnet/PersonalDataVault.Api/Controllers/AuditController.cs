using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PersonalDataVault.Api.Data.Repositories;
using PersonalDataVault.Api.Models;

namespace PersonalDataVault.Api.Controllers;

[ApiController]
[Route("v1/audit")]
[Authorize]
public class AuditController(IAuditRepository audit) : ControllerBase
{
    private string UserId =>
        User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? string.Empty;

    private string RequestId => HttpContext.Items["RequestId"]?.ToString() ?? "unknown";

    // ── GET /v1/audit/:userId?from=&to=&limit=&resource= ─────────────────────

    [HttpGet("{userId}")]
    public async Task<IActionResult> List(
        string userId,
        [FromQuery] string? from,
        [FromQuery] string? to,
        [FromQuery] int limit = 50,
        [FromQuery] string? resource = null)
    {
        if (userId != UserId) return Forbid();

        var events = await audit.GetEventsAsync(userId, new(from, to, limit, resource));
        var labelled = events.Select(e => new
        {
            e.Id,
            e.GrantId,
            e.UserId,
            e.EventType,
            e.ActorType,
            e.ActorId,
            Timestamp = e.Ts,
            Metadata  = e.MetadataJson is not null
                ? System.Text.Json.JsonSerializer.Deserialize<object>(e.MetadataJson)
                : null,
            Label     = BuildLabel(e),
            RelyingParty = e.RpName is null ? null : new { Name = e.RpName, Domain = e.RpDomain },
        });

        return Ok(new { events = labelled });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static string BuildLabel(Data.Models.AuditEvent e)
    {
        var rp = e.RpName is not null ? $" for {e.RpName}" : "";
        return e.EventType switch
        {
            "GRANT_CREATED" => $"Consent granted{rp}",
            "REVOKED"       => $"Consent revoked{rp}",
            "EXPIRED"       => $"Consent expired{rp}",
            "ACCESS"        => e.ActorType == "rp"
                               ? $"{e.RpName ?? "Relying party"} accessed your data"
                               : "You accessed your data",
            "REGISTER"      => "Account created",
            "LOGIN"         => "Logged in",
            "LOGOUT"        => "Logged out",
            "DELETE"        => "Account deleted",
            "VAULT_ERASE"   => "Vault data erased",
            "WEBHOOK_FAILED" => $"Webhook delivery failed{rp}",
            _               => e.EventType.Replace("_", " ").ToLower() is var s
                               => char.ToUpper(s[0]) + s[1..],
        };
    }
}
