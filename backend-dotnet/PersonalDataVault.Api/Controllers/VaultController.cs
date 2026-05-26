using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PersonalDataVault.Api.Data.Models;
using PersonalDataVault.Api.Data.Repositories;
using PersonalDataVault.Api.Models;
using PersonalDataVault.Api.Models.Requests;
using PersonalDataVault.Api.Services;

namespace PersonalDataVault.Api.Controllers;

/// <summary>
/// Vault CRUD — identity, address, payment cards, contacts.
/// All routes require a valid access token.  Payment card creation also
/// requires a step-up token (when STEPUP_ENFORCED is true).
/// </summary>
[ApiController]
[Route("v1")]
[Authorize]
public class VaultController(
    IVaultRepository vault,
    IAuditRepository audit,
    ICryptoService crypto,
    IConfiguration config) : ControllerBase
{
    private static readonly HashSet<string> AllowedCardTypes = ["visa", "mastercard", "amex", "discover", "rupay"];

    private string UserId =>
        User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? string.Empty;

    private string RequestId => HttpContext.Items["RequestId"]?.ToString() ?? "unknown";

    // ── Identity ──────────────────────────────────────────────────────────────

    [HttpGet("identity/{userId}")]
    public async Task<IActionResult> GetIdentity(string userId)
    {
        if (userId != UserId) return Forbid();
        var identity = await vault.GetIdentityAsync(userId);
        return Ok(new { identity = DecryptIdentity(identity) });
    }

    [HttpPut("identity/{userId}")]
    public async Task<IActionResult> UpdateIdentity(string userId, [FromBody] IdentityRequest req)
    {
        if (userId != UserId) return Forbid();

        // DPDPA S.16 — block identity update for users under 18
        if (req.DateOfBirth is not null && DateTime.TryParse(req.DateOfBirth, out var dob))
        {
            var age = (DateTime.UtcNow - dob).Days / 365;
            if (age < 18)
                return StatusCode(403, ApiError.Of("MINOR_RESTRICTION",
                    "Identity updates are not permitted for users under 18 (DPDPA S.16).", RequestId));
        }

        var data = new IdentityData
        {
            FirstName    = req.FirstName   is not null ? crypto.Encrypt(req.FirstName)   : null,
            LastName     = req.LastName    is not null ? crypto.Encrypt(req.LastName)    : null,
            EmailPrimary = req.EmailPrimary is not null ? crypto.Encrypt(req.EmailPrimary) : null,
            DateOfBirth  = req.DateOfBirth  is not null ? crypto.Encrypt(req.DateOfBirth)  : null,
            IdType       = req.IdType       is not null ? crypto.Encrypt(req.IdType)       : null,
            IdNumber     = req.IdNumber     is not null ? crypto.Encrypt(req.IdNumber)     : null,
        };
        await vault.UpsertIdentityAsync(userId, data);
        await audit.InsertEventAsync(null, userId, "ACCESS", "user", userId, new { resource = "identity", action = "update" });

        var updated = await vault.GetIdentityAsync(userId);
        return Ok(new { identity = DecryptIdentity(updated) });
    }

    // ── Address ───────────────────────────────────────────────────────────────

    [HttpGet("address/{userId}")]
    public async Task<IActionResult> GetAddress(string userId)
    {
        if (userId != UserId) return Forbid();
        var address = await vault.GetCurrentAddressAsync(userId);
        return Ok(new { address });
    }

    [HttpPut("address/{userId}")]
    public async Task<IActionResult> UpdateAddress(string userId, [FromBody] AddressRequest req)
    {
        if (userId != UserId) return Forbid();
        var data = new Address
        {
            Type    = req.Type    ?? "current",
            Line1   = req.Line1,
            Line2   = req.Line2,
            City    = req.City,
            State   = req.State,
            Postal  = req.Postal,
            Country = req.Country,
        };
        await vault.UpsertAddressAsync(userId, data);
        await audit.InsertEventAsync(null, userId, "ACCESS", "user", userId, new { resource = "address", action = "update" });
        var updated = await vault.GetCurrentAddressAsync(userId);
        return Ok(new { address = updated });
    }

    [HttpGet("address/{userId}/history")]
    public async Task<IActionResult> GetAddressHistory(string userId)
    {
        if (userId != UserId) return Forbid();
        var history = await vault.GetAddressHistoryAsync(userId);
        return Ok(new { history });
    }

    // ── Payment cards ─────────────────────────────────────────────────────────

    [HttpGet("payment/{userId}/cards")]
    public async Task<IActionResult> GetCards(string userId)
    {
        if (userId != UserId) return Forbid();
        var cards = await vault.GetPaymentCardsAsync(userId);
        return Ok(new { cards });
    }

    [HttpPost("payment/{userId}/cards")]
    public async Task<IActionResult> AddCard(string userId, [FromBody] PaymentCardRequest req)
    {
        if (userId != UserId) return Forbid();
        if (!ModelState.IsValid) return BadRequest(ModelState);

        if (!AllowedCardTypes.Contains(req.CardType.ToLowerInvariant()))
            return BadRequest(ApiError.Validation("card_type must be one of: visa, mastercard, amex, discover, rupay", requestId: RequestId));

        // Step-up check (enforced only when STEPUP_ENFORCED=true)
        var stepUpResult = RequireStepUp("payment:add");
        if (stepUpResult is not null) return stepUpResult;

        var card = new PaymentCard
        {
            CardType    = req.CardType.ToLowerInvariant(),
            Last4       = req.Last4,
            ExpiryMmYy  = req.ExpiryMmYy,
        };
        var id = await vault.AddPaymentCardAsync(userId, card);
        await audit.InsertEventAsync(null, userId, "ACCESS", "user", userId, new { resource = "payment", action = "add" });

        var cards = await vault.GetPaymentCardsAsync(userId);
        return StatusCode(201, new { id, cards });
    }

    [HttpDelete("payment/{userId}/cards/{cardId}")]
    public async Task<IActionResult> RemoveCard(string userId, string cardId)
    {
        if (userId != UserId) return Forbid();
        var removed = await vault.RemovePaymentCardAsync(userId, cardId);
        if (!removed) return NotFound(ApiError.NotFound("Card not found.", RequestId));
        await audit.InsertEventAsync(null, userId, "ACCESS", "user", userId, new { resource = "payment", action = "delete", cardId });
        return Ok(new { message = "Card removed." });
    }

    // ── Contacts ──────────────────────────────────────────────────────────────

    [HttpGet("contacts/{userId}")]
    public async Task<IActionResult> GetContacts(string userId)
    {
        if (userId != UserId) return Forbid();
        var contacts = await vault.GetContactsAsync(userId);
        return Ok(new { contacts = DecryptContacts(contacts) });
    }

    [HttpPut("contacts/{userId}")]
    public async Task<IActionResult> UpdateContacts(string userId, [FromBody] ContactsRequest req)
    {
        if (userId != UserId) return Forbid();
        var data = new Contact
        {
            PhonePrimary   = req.PhonePrimary   is not null ? crypto.Encrypt(req.PhonePrimary)   : null,
            PhoneType      = req.PhoneType,
            EmailSecondary = req.EmailSecondary  is not null ? crypto.Encrypt(req.EmailSecondary)  : null,
            LinkedinUrl    = req.LinkedinUrl,
            TwitterHandle  = req.TwitterHandle,
            WebsiteUrl     = req.WebsiteUrl,
        };
        await vault.UpsertContactsAsync(userId, data);
        await audit.InsertEventAsync(null, userId, "ACCESS", "user", userId, new { resource = "contacts", action = "update" });
        var updated = await vault.GetContactsAsync(userId);
        return Ok(new { contacts = DecryptContacts(updated) });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Verifies the X-PDV-Stepup header when STEPUP_ENFORCED is true.
    /// Returns null (pass-through) if not enforced or token is valid.
    /// </summary>
    private IActionResult? RequireStepUp(string intent)
    {
        var enforced = config.GetValue<bool>("StepUp:Enforced", false);
        if (!enforced) return null;

        var header = Request.Headers["X-PDV-Stepup"].FirstOrDefault();
        if (string.IsNullOrEmpty(header))
            return StatusCode(401, new { error = new { code = "STEPUP_REQUIRED", message = "This action requires a recent re-authentication.", intent, requestId = RequestId, timestamp = DateTime.UtcNow.ToString("o") } });

        try
        {
            var tokenSvc = HttpContext.RequestServices.GetRequiredService<ITokenService>();
            var principal = tokenSvc.VerifyStepUpToken(header);
            var sub = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? principal.FindFirstValue("sub");
            var claimIntent = principal.FindFirstValue("intent");
            if (sub != UserId || claimIntent != TokenService.IntentHash(intent))
                throw new Exception("Step-up token mismatch");
            return null;
        }
        catch
        {
            return StatusCode(401, ApiError.Unauthorized("STEPUP_INVALID", "Step-up token is invalid or expired.", RequestId));
        }
    }

    private object? DecryptIdentity(IdentityData? id)
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

    private object? DecryptContacts(Contact? c)
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
