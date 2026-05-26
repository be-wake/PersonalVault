namespace PersonalDataVault.Api.Data.Models;

public class AuditEvent
{
    public string Id { get; set; } = null!;
    public string? GrantId { get; set; }
    public string UserId { get; set; } = null!;
    public string EventType { get; set; } = null!;
    public string ActorType { get; set; } = null!;
    public string ActorId { get; set; } = null!;
    public DateTime Ts { get; set; }
    public string? MetadataJson { get; set; }
    public string? PrevHash { get; set; }
    public string? Hash { get; set; }

    // Joined from relying_parties via consent_grants
    public string? RelyingPartyId { get; set; }
    public string? RpName { get; set; }
    public string? RpDomain { get; set; }
}
