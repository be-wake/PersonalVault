namespace PersonalDataVault.Api.Data.Models;

/// <summary>
/// payment_cards row. Stores only a network token plus the last four digits and
/// expiry — never the full PAN.
/// </summary>
public class PaymentCard
{
    public string Id { get; set; } = null!;
    public string UserId { get; set; } = null!;
    public string CardToken { get; set; } = null!;
    public string CardType { get; set; } = null!;
    public string Last4 { get; set; } = null!;
    public string ExpiryMmYy { get; set; } = null!;
    public string? Nickname { get; set; }
    public DateTime CreatedAt { get; set; }
}
