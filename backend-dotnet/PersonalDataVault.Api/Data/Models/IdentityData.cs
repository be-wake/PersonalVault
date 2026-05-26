namespace PersonalDataVault.Api.Data.Models;

public class IdentityData
{
    public string Id { get; set; } = null!;
    public string UserId { get; set; } = null!;
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? EmailPrimary { get; set; }
    public string? DateOfBirth { get; set; }
    public string? IdType { get; set; }
    public string? IdNumber { get; set; }
    public DateTime UpdatedAt { get; set; }
}
