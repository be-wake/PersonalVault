using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PersonalDataVault.Api.Data.Repositories;
using PersonalDataVault.Api.Models;
using PersonalDataVault.Api.Models.Requests;
using PersonalDataVault.Api.Services;

namespace PersonalDataVault.Api.Controllers;

[ApiController]
[Route("v1/consents")]
[Authorize]
public class ConsentsController(
    IConsentRepository consents,
    IRelyingPartyRepository relyingParties,
    IAuditRepository audit,
    IRevocationCacheService revocationCache,
    IServiceBusService serviceBus,
    IWebSocketConnectionManager wsManager) : VaultControllerBase
{
    // ── GET /v1/consents/:userId ──────────────────────────────────────────────

    [HttpGet("{userId}")]
    public async Task<IActionResult> List(string userId)
    {
        if (userId != UserId) return Forbid();
        var grants = await consents.GetGrantsByUserAsync(userId);
        return Ok(new { grants = grants.Select(GrantDto) });
    }

    // ── GET /v1/consents/:userId/:grantId ─────────────────────────────────────

    [HttpGet("{userId}/{grantId}")]
    public async Task<IActionResult> GetOne(string userId, string grantId)
    {
        if (userId != UserId) return Forbid();
        var grant = await consents.GetGrantByIdAsync(grantId);
        if (grant is null || grant.UserId != userId)
            return NotFound(ApiError.NotFound("Grant not found.", RequestId));
        return Ok(new { grant = GrantDto(grant) });
    }

    // ── POST /v1/consents ─────────────────────────────────────────────────────

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateGrantRequest req)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var stepUpResult = RequireStepUp("consent:grant");
        if (stepUpResult is not null) return stepUpResult;

        var rp = await relyingParties.GetByIdAsync(req.RelyingPartyId);
        if (rp is null)
            return NotFound(ApiError.NotFound("Relying party not found.", RequestId));

        // Validate scopes against RP's allow-list
        var scopeEngine = HttpContext.RequestServices.GetRequiredService<IScopeEngineService>();
        var (allowed, denied) = scopeEngine.PartitionByRpAllowlist(req.Scopes, rp.AllowedScopesList);

        if (allowed.Count == 0)
            return BadRequest(ApiError.Validation("None of the requested scopes are permitted for this relying party."));

        var (grantId, created) = await consents.CreateGrantAsync(
            UserId, req.RelyingPartyId, allowed, req.Purpose, req.ExpiresAt, req.IdempotencyKey);

        if (created)
        {
            await audit.InsertEventAsync(grantId, UserId, "GRANT_CREATED", "user", UserId,
                new { relyingPartyId = req.RelyingPartyId, scopes = allowed });
        }

        var grant = await consents.GetGrantByIdAsync(grantId);
        var status = created ? 201 : 200;
        return StatusCode(status, new { grant = GrantDto(grant!), denied });
    }

    // ── DELETE /v1/consents/:grantId ──────────────────────────────────────────

    [HttpDelete("{grantId}")]
    public async Task<IActionResult> Revoke(string grantId)
    {
        var stepUpResult = RequireStepUp("consent:revoke");
        if (stepUpResult is not null) return stepUpResult;

        var grant = await consents.GetGrantByIdAsync(grantId);
        if (grant is null || grant.UserId != UserId)
            return NotFound(ApiError.NotFound("Grant not found.", RequestId));

        if (grant.Status != "ACTIVE")
            return BadRequest(ApiError.Of("CONSENT_NOT_ACTIVE", $"Grant is already {grant.Status}."));

        var revoked = await consents.RevokeGrantAsync(grantId, UserId);
        if (!revoked) return NotFound(ApiError.NotFound("Grant not found or already revoked.", RequestId));

        // Write audit event
        await audit.InsertEventAsync(grantId, UserId, "REVOKED", "user", UserId,
            new { relyingPartyId = grant.RelyingPartyId });

        // Near-real-time cache (blocks RP reads within seconds)
        await revocationCache.RevokeGrantAsync(grantId);

        // Async revocation event (Service Bus or in-process)
        await serviceBus.PublishAsync("consent.revoked",
            new RevocationEvent(grantId, UserId, grant.RelyingPartyId));

        // Real-time push to connected clients (wire-compatible JSON format)
        await wsManager.BroadcastToUserAsync(UserId, "CONSENT_REVOKED",
            new { grantId, relyingPartyId = grant.RelyingPartyId, revokedAt = DateTime.UtcNow });

        return Ok(new { message = "Consent revoked.", grantId });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static object GrantDto(Data.Models.ConsentGrant g) => new
    {
        g.Id, g.UserId, g.RelyingPartyId, g.Status,
        g.Purpose, g.GrantedAt, g.ExpiresAt, g.RevokedAt,
        Scopes = g.Scopes,
        Rp = g.RpName is null ? null : new
        {
            Id     = g.RelyingPartyId,
            Name   = g.RpName,
            Domain = g.RpDomain,
            Description = g.RpDescription,
            PciScope    = g.RpPciScope,
        },
    };
}
