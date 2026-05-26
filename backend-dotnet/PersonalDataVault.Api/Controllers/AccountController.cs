using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PersonalDataVault.Api.Data;
using PersonalDataVault.Api.Data.Repositories;
using PersonalDataVault.Api.Models;
using PersonalDataVault.Api.Services;

namespace PersonalDataVault.Api.Controllers;

/// <summary>
/// GDPR Art.17/20 + DPDPA S.11/12 data-subject rights.
///   GET  /v1/account/export           — full data portability export
///   GET  /v1/account/audit/verify     — tamper-evident audit chain verify
///   DELETE /v1/account                — full erasure
///   DELETE /v1/account/vault/:resource — per-resource erasure
/// </summary>
[ApiController]
[Route("v1/account")]
[Authorize]
public class AccountController(
    AppDbContext db,
    IUserRepository users,
    IVaultRepository vault,
    IConsentRepository consents,
    IAuditRepository audit,
    ICryptoService crypto,
    IConfiguration config) : ControllerBase
{
    private string UserId =>
        User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? string.Empty;

    private string RequestId => HttpContext.Items["RequestId"]?.ToString() ?? "unknown";

    private static readonly HashSet<string> ValidResources = ["identity", "address", "payment", "contacts"];

    // ── GET /v1/account/export ────────────────────────────────────────────────

    [HttpGet("export")]
    public async Task<IActionResult> Export()
    {
        var userId          = UserId;
        var user            = await users.FindByIdAsync(userId);
        var commonIdentity  = await vault.GetCommonIdentityAsync(userId);
        var identityDocs    = await vault.GetIdentityDocumentsAsync(userId);
        var address         = await vault.GetCurrentAddressAsync(userId);
        var cards           = await vault.GetPaymentCardsAsync(userId);
        var contacts        = await vault.GetContactsAsync(userId);
        var grants          = await consents.GetGrantsByUserAsync(userId);
        var auditLog        = await audit.GetEventsAsync(userId, new(Limit: 200));

        return Ok(new
        {
            exportedAt = DateTime.UtcNow,
            user,
            vault = new
            {
                identity = new
                {
                    commonInfo = DecryptIdentity(commonIdentity),
                    documents  = identityDocs.Select(DecryptIdentity).ToList(),
                },
                address,
                paymentCards = cards,
                contacts     = DecryptContacts(contacts),
            },
            consents = grants,
            auditTrail = auditLog,
        });
    }

    // ── GET /v1/account/audit/verify ──────────────────────────────────────────

    [HttpGet("audit/verify")]
    public async Task<IActionResult> VerifyAuditChain()
    {
        var result = await audit.VerifyChainAsync(UserId);
        return Ok(new { ok = result.Ok, count = result.Count, brokenAt = result.BrokenAt });
    }

    // ── DELETE /v1/account ────────────────────────────────────────────────────

    [HttpDelete]
    public async Task<IActionResult> DeleteAccount()
    {
        var stepUpResult = RequireStepUp("account:delete");
        if (stepUpResult is not null) return stepUpResult;

        var userId = UserId;

        // Delete audit events first (no FK cascade)
        await db.AuditEvents.Where(e => e.UserId == userId).ExecuteDeleteAsync();
        // users → cascade to identity_data, addresses, payment_cards, contacts, consent_grants
        var user = await db.Users.FindAsync(userId);
        if (user is null)
            return NotFound(ApiError.NotFound("User not found.", RequestId));
        db.Users.Remove(user);
        await db.SaveChangesAsync();

        Response.Cookies.Delete("pdv_session");
        Response.Cookies.Delete("pdv_refresh");
        return Ok(new { message = "Account and all personal data have been permanently erased." });
    }

    // ── DELETE /v1/account/vault/:resource ────────────────────────────────────

    [HttpDelete("vault/{resource}")]
    public async Task<IActionResult> DeleteVaultResource(string resource)
    {
        if (!ValidResources.Contains(resource.ToLowerInvariant()))
            return BadRequest(ApiError.Of("INVALID_RESOURCE",
                "resource must be one of: identity, address, payment, contacts", RequestId));

        var stepUpResult = RequireStepUp($"vault:erase:{resource}");
        if (stepUpResult is not null) return stepUpResult;

        var userId = UserId;
        switch (resource.ToLowerInvariant())
        {
            case "identity":
                await db.IdentityData
                    .Where(i => i.UserId == userId)
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(i => i.FirstName,   (string?)null)
                        .SetProperty(i => i.LastName,    (string?)null)
                        .SetProperty(i => i.DateOfBirth, (string?)null)
                        .SetProperty(i => i.IdType,      (string?)null)
                        .SetProperty(i => i.IdNumber,    (string?)null)
                        .SetProperty(i => i.UpdatedAt,   DateTime.UtcNow));
                break;
            case "address":
                await db.Addresses.Where(a => a.UserId == userId).ExecuteDeleteAsync();
                break;
            case "payment":
                await db.PaymentCards.Where(p => p.UserId == userId).ExecuteDeleteAsync();
                break;
            case "contacts":
                await db.Contacts
                    .Where(c => c.UserId == userId)
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(c => c.PhonePrimary,   (string?)null)
                        .SetProperty(c => c.PhoneType,      (string?)null)
                        .SetProperty(c => c.EmailSecondary, (string?)null)
                        .SetProperty(c => c.LinkedinUrl,    (string?)null)
                        .SetProperty(c => c.TwitterHandle,  (string?)null)
                        .SetProperty(c => c.WebsiteUrl,     (string?)null)
                        .SetProperty(c => c.UpdatedAt,      DateTime.UtcNow));
                break;
        }

        await audit.InsertEventAsync(null, userId, "ACCESS", "user", userId,
            new { resource, action = "erase" });

        return Ok(new { message = $"{resource} data erased.", resource });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private IActionResult? RequireStepUp(string intent)
    {
        var enforced = config.GetValue<bool>("StepUp:Enforced", false);
        if (!enforced) return null;

        var header = Request.Headers["X-PDV-Stepup"].FirstOrDefault();
        if (string.IsNullOrEmpty(header))
            return StatusCode(401, new { error = new { code = "STEPUP_REQUIRED", message = "This action requires a recent re-authentication.", intent, requestId = RequestId } });

        try
        {
            var tokenSvc  = HttpContext.RequestServices.GetRequiredService<ITokenService>();
            var principal = tokenSvc.VerifyStepUpToken(header);
            var sub = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? principal.FindFirstValue("sub");
            if (sub != UserId || principal.FindFirstValue("intent") != TokenService.IntentHash(intent))
                throw new Exception("Step-up token mismatch");
            return null;
        }
        catch
        {
            return StatusCode(401, ApiError.Unauthorized("STEPUP_INVALID", "Step-up token is invalid or expired.", RequestId));
        }
    }

    private object? DecryptIdentity(Data.Models.IdentityData? id)
    {
        if (id is null) return null;
        return new
        {
            id.Id, id.UserId, id.UpdatedAt,
            FirstName    = crypto.Decrypt(id.FirstName),
            LastName     = crypto.Decrypt(id.LastName),
            EmailPrimary = crypto.Decrypt(id.EmailPrimary),
            DateOfBirth  = crypto.Decrypt(id.DateOfBirth),
            IdType       = crypto.Decrypt(id.IdType),
            IdNumber     = crypto.Decrypt(id.IdNumber),
        };
    }

    private object? DecryptContacts(Data.Models.Contact? c)
    {
        if (c is null) return null;
        return new
        {
            c.Id, c.UserId, c.UpdatedAt,
            PhonePrimary   = crypto.Decrypt(c.PhonePrimary),
            c.PhoneType,
            EmailSecondary = crypto.Decrypt(c.EmailSecondary),
            c.LinkedinUrl, c.TwitterHandle, c.WebsiteUrl,
        };
    }
}
