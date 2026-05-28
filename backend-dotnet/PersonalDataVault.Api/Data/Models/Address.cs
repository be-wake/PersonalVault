namespace PersonalDataVault.Api.Data.Models;

public class Address
{
    public string Id { get; set; } = null!;
    public string UserId { get; set; } = null!;
    public string Type { get; set; } = "current";
    public string? Name { get; set; }
    public string? Line1 { get; set; }
    public string? Line2 { get; set; }
    public string? City { get; set; }
    public string? State { get; set; }
    public string? Postal { get; set; }
    public string? Country { get; set; }
    public bool IsCurrent { get; set; } = true;
    public DateTime CreatedAt { get; set; }
}
