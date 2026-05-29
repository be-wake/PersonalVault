namespace PersonalDataVault.Api.Data.Models;

/// <summary>
/// identity_data row. A row with <see cref="IdType"/> == null is the user's
/// "common" info (name / DOB / email); rows with IdType set are individual
/// government-issued ID documents. Sensitive fields are stored encrypted.
/// </summary>
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
