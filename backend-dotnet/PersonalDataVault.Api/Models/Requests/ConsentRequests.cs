using System.ComponentModel.DataAnnotations;

namespace PersonalDataVault.Api.Models.Requests;

public class CreateGrantRequest
{
    [Required]
    public string RelyingPartyId { get; set; } = null!;

    [Required, MinLength(1)]
    public List<string> Scopes { get; set; } = null!;

    [Required]
    public string Purpose { get; set; } = null!;

    public DateTime? ExpiresAt { get; set; }
    public string? IdempotencyKey { get; set; }
}
