using System.Text.Json;

namespace PersonalDataVault.Api.Data.Models;

public class ConsentGrant
{
    public string Id { get; set; } = null!;
    public string UserId { get; set; } = null!;
    public string RelyingPartyId { get; set; } = null!;
    public string ScopesJson { get; set; } = null!;
    public string Purpose { get; set; } = null!;
    public DateTime GrantedAt { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string Status { get; set; } = "ACTIVE";
    public string? IdempotencyKey { get; set; }

    // Joined from relying_parties
    public string? RpName { get; set; }
    public string? RpDomain { get; set; }
    public string? RpDescription { get; set; }
    public bool? RpPciScope { get; set; }

    public List<string> Scopes =>
        JsonSerializer.Deserialize<List<string>>(ScopesJson) ?? [];
}
