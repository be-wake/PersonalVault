using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using PersonalDataVault.Api.Data.Repositories;
using PersonalDataVault.Api.Models;
using PersonalDataVault.Api.Models.Requests;
using PersonalDataVault.Api.Services;

namespace PersonalDataVault.Api.Controllers;

/// <summary>
/// Relying-party API — the core PDV premise (F2).
///   POST /v1/rp/token               — client-credentials grant (F20)
///   GET  /v1/rp/grants/:id/data     — scoped, masked vault read (F1+F2+F4)
/// </summary>
[ApiController]
[Route("v1/rp")]
public class RpController(
    IRelyingPartyRepository relyingParties,
    IConsentRepository consents,
    IVaultRepository vault,
    IAuditRepository audit,
    IRevocationCacheService revocationCache,
    ITokenService tokens,
    ICryptoService crypto,
    IScopeEngineService scopeEngine,
    ILogger<RpController> logger) : ControllerBase
{
    private string RequestId => HttpContext.Items["RequestId"]?.ToString() ?? "unknown";

    // ── POST /v1/rp/token ─────────────────────────────────────────────────────

    [HttpPost("token")]
    public async Task<IActionResult> GetToken([FromBody] RpTokenRequest req)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        if (req.GrantType != "client_credentials")
            return BadRequest(ApiError.Of("UNSUPPORTED_GRANT_TYPE", "Only client_credentials is supported."));

        var rp = await relyingParties.FindByClientIdAsync(req.ClientId);

        // Compare the secret hashes in constant time so a partial-match doesn't leak via
        // timing (plain string != short-circuits on the first differing character).
        var providedHash = crypto.Sha256Hex(req.ClientSecret);
        if (rp is null || string.IsNullOrEmpty(rp.ClientSecretHash)
            || !System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(
                   System.Text.Encoding.UTF8.GetBytes(rp.ClientSecretHash),
                   System.Text.Encoding.UTF8.GetBytes(providedHash)))
        {
            logger.LogWarning("RP token request — invalid client credentials for {ClientId}", req.ClientId);
            return Unauthorized(ApiError.Unauthorized("INVALID_CLIENT", "Invalid client credentials."));
        }

        var accessToken = tokens.IssueRpToken(rp.Id, req.ClientId);
        logger.LogInformation("RP access token issued for {RpId}", rp.Id);
        return Ok(new { access_token = accessToken, token_type = "Bearer", expires_in = 600 });
    }

    // ── GET /v1/rp/grants/:grantId/data ──────────────────────────────────────

    [HttpGet("grants/{grantId}/data")]
    public async Task<IActionResult> ReadData(string grantId)
    {
        // Verify RP bearer token
        var authHeader = Request.Headers.Authorization.FirstOrDefault();
        if (authHeader is null || !authHeader.StartsWith("Bearer "))
            return Unauthorized(ApiError.Unauthorized("TOKEN_INVALID", "RP authorization header missing or malformed."));

        ClaimsPrincipal rpPrincipal;
        string rpId;
        try
        {
            rpPrincipal = tokens.VerifyRpToken(authHeader[7..]);
            rpId = rpPrincipal.FindFirstValue(ClaimTypes.NameIdentifier)
                   ?? rpPrincipal.FindFirstValue("sub") ?? string.Empty;
        }
        catch
        {
            return Unauthorized(ApiError.Unauthorized("TOKEN_INVALID", "RP token is invalid or expired."));
        }

        var grant = await consents.GetGrantByIdAsync(grantId);
        if (grant is null)
            return NotFound(ApiError.NotFound("Grant not found.", RequestId));

        if (grant.RelyingPartyId != rpId)
        {
            logger.LogWarning("RP {RpId} tried to read grant {GrantId} owned by {Owner}", rpId, grantId, grant.RelyingPartyId);
            return StatusCode(403, ApiError.Forbidden("This grant does not belong to your application."));
        }

        if (grant.Status != "ACTIVE")
            return StatusCode(403, ApiError.Of("CONSENT_INACTIVE", $"Consent is {grant.Status}."));

        if (grant.ExpiresAt.HasValue && grant.ExpiresAt.Value < DateTime.UtcNow)
            return StatusCode(403, ApiError.Of("CONSENT_EXPIRED", "Consent has expired."));

        // Near-real-time revocation check (F4)
        if (await revocationCache.IsRevokedAsync(grantId))
            return StatusCode(403, ApiError.Of("CONSENT_REVOKED", "Consent was revoked."));

        // Hydrate vault bundle and mask to granted scopes
        var bundle = await vault.GetVaultBundleAsync(grant.UserId);
        var data   = scopeEngine.ProjectForScopes(bundle, grant.Scopes);

        // Audit the RP read
        await audit.InsertEventAsync(grantId, grant.UserId, "ACCESS", "rp", rpId,
            new { scopes = grant.Scopes, via = "rp_read" });

        logger.LogInformation("RP {RpId} scoped read served for grant {GrantId}", rpId, grantId);
        return Ok(new { grantId, scopes = grant.Scopes, data });
    }
}
