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

    /// <summary>
    /// Returns common personal info (name/DOB) plus the list of all
    /// government-issued ID documents for this user.
    /// </summary>
    [HttpGet("identity/{userId}")]
    public async Task<IActionResult> GetIdentity(string userId)
    {
        if (userId != UserId) return Forbid();
        var common    = await vault.GetCommonIdentityAsync(userId);
        var documents = await vault.GetIdentityDocumentsAsync(userId);
        return Ok(new
        {
            commonInfo = DecryptCommonIdentity(common),
            documents  = documents.Select(DecryptDocument).ToList(),
        });
    }

    /// <summary>
    /// Update the common personal info (name, date of birth, email).
    /// Government ID documents are managed via the /documents sub-routes.
    /// </summary>
    [HttpPut("identity/{userId}")]
    public async Task<IActionResult> UpdateCommonIdentity(string userId, [FromBody] IdentityCommonRequest req)
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
            FirstName    = req.FirstName    is not null ? crypto.Encrypt(req.FirstName)    : null,
            LastName     = req.LastName     is not null ? crypto.Encrypt(req.LastName)     : null,
            EmailPrimary = req.EmailPrimary is not null ? crypto.Encrypt(req.EmailPrimary) : null,
            DateOfBirth  = req.DateOfBirth  is not null ? crypto.Encrypt(req.DateOfBirth)  : null,
        };
        await vault.UpsertCommonIdentityAsync(userId, data);
        await audit.InsertEventAsync(null, userId, "ACCESS", "user", userId,
            new { resource = "identity", action = "update_common" });

        var updated = await vault.GetCommonIdentityAsync(userId);
        return Ok(new { commonInfo = DecryptCommonIdentity(updated) });
    }

    /// <summary>Add a new government-issued ID document (Aadhaar, Passport, DL …).</summary>
    [HttpPost("identity/{userId}/documents")]
    public async Task<IActionResult> AddIdentityDocument(string userId, [FromBody] IdentityDocumentRequest req)
    {
        if (userId != UserId) return Forbid();
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var data = new IdentityData
        {
            IdType   = crypto.Encrypt(req.IdType),
            IdNumber = crypto.Encrypt(req.IdNumber),
        };
        var docId = await vault.AddIdentityDocumentAsync(userId, data);
        await audit.InsertEventAsync(null, userId, "ACCESS", "user", userId,
            new { resource = "identity", action = "add_document", idType = req.IdType });

        var documents = await vault.GetIdentityDocumentsAsync(userId);
        return StatusCode(201, new
        {
            id        = docId,
            documents = documents.Select(DecryptDocument).ToList(),
        });
    }

    /// <summary>Update an existing identity document.</summary>
    [HttpPut("identity/{userId}/documents/{docId}")]
    public async Task<IActionResult> UpdateIdentityDocument(string userId, string docId, [FromBody] IdentityDocumentRequest req)
    {
        if (userId != UserId) return Forbid();
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var data = new IdentityData
        {
            IdType   = crypto.Encrypt(req.IdType),
            IdNumber = crypto.Encrypt(req.IdNumber),
        };
        var found = await vault.UpdateIdentityDocumentAsync(docId, userId, data);
        if (!found) return NotFound(ApiError.NotFound("Identity document not found.", RequestId));

        await audit.InsertEventAsync(null, userId, "ACCESS", "user", userId,
            new { resource = "identity", action = "update_document", docId });

        var documents = await vault.GetIdentityDocumentsAsync(userId);
        return Ok(new { documents = documents.Select(DecryptDocument).ToList() });
    }

    /// <summary>Delete an identity document.</summary>
    [HttpDelete("identity/{userId}/documents/{docId}")]
    public async Task<IActionResult> DeleteIdentityDocument(string userId, string docId)
    {
        if (userId != UserId) return Forbid();
        var removed = await vault.DeleteIdentityDocumentAsync(docId, userId);
        if (!removed) return NotFound(ApiError.NotFound("Identity document not found.", RequestId));

        await audit.InsertEventAsync(null, userId, "ACCESS", "user", userId,
            new { resource = "identity", action = "delete_document", docId });

        return Ok(new { message = "Document removed." });
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

    /// <summary>Decrypts the common-info record (name / DOB / email).</summary>
    private object? DecryptCommonIdentity(IdentityData? id)
    {
        if (id is null) return null;
        return new
        {
            id.Id, id.UserId, id.UpdatedAt,
            FirstName    = crypto.Decrypt(id.FirstName),
            LastName     = crypto.Decrypt(id.LastName),
            EmailPrimary = crypto.Decrypt(id.EmailPrimary),
            DateOfBirth  = crypto.Decrypt(id.DateOfBirth),
        };
    }

    /// <summary>Decrypts a single government-ID document record.</summary>
    private object DecryptDocument(IdentityData doc) => new
    {
        doc.Id, doc.UserId, doc.UpdatedAt,
        IdType   = crypto.Decrypt(doc.IdType),
        IdNumber = crypto.Decrypt(doc.IdNumber),
    };

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
