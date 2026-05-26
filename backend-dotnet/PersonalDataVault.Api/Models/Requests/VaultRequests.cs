using System.ComponentModel.DataAnnotations;

namespace PersonalDataVault.Api.Models.Requests;

public class IdentityRequest
{
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? EmailPrimary { get; set; }
    public string? DateOfBirth { get; set; }
    public string? IdType { get; set; }
    public string? IdNumber { get; set; }
}

public class AddressRequest
{
    public string? Type { get; set; } = "current";
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
}

public class ContactsRequest
{
    public string? PhonePrimary { get; set; }
    public string? PhoneType { get; set; }
    public string? EmailSecondary { get; set; }
    public string? LinkedinUrl { get; set; }
    public string? TwitterHandle { get; set; }
    public string? WebsiteUrl { get; set; }
}
