using System.Text.Json;

namespace PersonalDataVault.Api.Data.Models;

/// <summary>
/// relying_parties row: a third-party client that can request vault access via
/// client-credentials. <see cref="AllowedScopes"/> is a JSON array bounding what
/// it may ever be granted.
/// </summary>
public class RelyingParty
{
    public string Id { get; set; } = null!;
    public string Name { get; set; } = null!;
    public string ClientId { get; set; } = null!;
    public string Domain { get; set; } = null!;
    public string AllowedScopes { get; set; } = null!;   // JSON array
    public bool PciScope { get; set; }
    public string? WebhookUrl { get; set; }
    public string? Description { get; set; }
    public string? ClientSecretHash { get; set; }

    public List<string> AllowedScopesList =>
        JsonSerializer.Deserialize<List<string>>(AllowedScopes) ?? [];
}
