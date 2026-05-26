namespace PersonalDataVault.Api.Data.Models;

public class Contact
{
    public string Id { get; set; } = null!;
    public string UserId { get; set; } = null!;
    public string? PhonePrimary { get; set; }
    public string? PhoneType { get; set; }
    public string? EmailSecondary { get; set; }
    public string? LinkedinUrl { get; set; }
    public string? TwitterHandle { get; set; }
    public string? WebsiteUrl { get; set; }
    public DateTime UpdatedAt { get; set; }
}
