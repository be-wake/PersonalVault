using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PersonalDataVault.Api.Models.Requests;

public class RpTokenRequest
{
    [Required]
    [JsonPropertyName("grant_type")]
    public string GrantType { get; set; } = null!;

    [Required]
    [JsonPropertyName("client_id")]
    public string ClientId { get; set; } = null!;

    [Required]
    [JsonPropertyName("client_secret")]
    public string ClientSecret { get; set; } = null!;
}
