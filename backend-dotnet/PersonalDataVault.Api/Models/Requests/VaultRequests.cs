using System.ComponentModel.DataAnnotations;

namespace PersonalDataVault.Api.Models.Requests;

/// <summary>
/// Legacy flat request — kept for internal helpers that still call UpsertIdentityAsync.
/// New callers should use IdentityCommonRequest or IdentityDocumentRequest.
/// </summary>
public class IdentityRequest
{
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? EmailPrimary { get; set; }
    public string? DateOfBirth { get; set; }
    public string? IdType { get; set; }
    public string? IdNumber { get; set; }
}

/// <summary>
/// Personal info that is shared/identical across all government IDs —
/// full name, date of birth, and primary e-mail.
/// </summary>
public class IdentityCommonRequest
{
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? EmailPrimary { get; set; }
    public string? DateOfBirth { get; set; }
}

/// <summary>
/// A single government-issued identity document (Aadhaar, Passport,
/// Driving License, PAN, Voter ID …).
/// </summary>
public class IdentityDocumentRequest
{
    [Required]
    public string IdType { get; set; } = null!;
    [Required]
    public string IdNumber { get; set; } = null!;
}

/// <summary>
/// Create or update a named address entry.
/// Label maps to the Type column (home | work | family | other).
/// </summary>
public class AddressRequest
{
    public string Label { get; set; } = "home";
    public string? Name { get; set; }
    public string? Line1 { get; set; }
    public string? Line2 { get; set; }
    public string? City { get; set; }
    public string? State { get; set; }
    public string? Postal { get; set; }
    public string? Country { get; set; }
}

public class PaymentCardRequest
{
    [Required]
    public string CardType { get; set; } = null!;

    [Required, RegularExpression(@"^\d{4}$", ErrorMessage = "last_4 must be exactly 4 digits")]
    public string Last4 { get; set; } = null!;

    [Required, RegularExpression(@"^\d{2}/\d{2}$", ErrorMessage = "expiry_mm_yy must be in MM/YY format")]
    public string ExpiryMmYy { get; set; } = null!;
    public string? Nickname { get; set; }
}

public class ContactsRequest
{
    /// <summary>Display name for this contact (e.g. "Mum", "John Smith").</summary>
    public string? Name { get; set; }
    public string? PhonePrimary { get; set; }
    public string? PhoneType { get; set; }
    public string? EmailSecondary { get; set; }
    public string? LinkedinUrl { get; set; }
    public string? TwitterHandle { get; set; }
    public string? WebsiteUrl { get; set; }
}
