namespace PersonalDataVault.Api.Data.Models;

/// <summary>contacts row. Phone/email fields are stored encrypted.</summary>
public class Contact
{
    public string Id { get; set; } = null!;
    public string UserId { get; set; } = null!;
    public string? Name { get; set; }
    public string? PhonePrimary { get; set; }
    public string? PhoneType { get; set; }
    public string? EmailSecondary { get; set; }
    public string? LinkedinUrl { get; set; }
    public string? TwitterHandle { get; set; }
    public string? WebsiteUrl { get; set; }
    public DateTime UpdatedAt { get; set; }
}
