namespace PersonalDataVault.Api.Data.Models;

public class PaymentCard
{
    public string Id { get; set; } = null!;
    public string UserId { get; set; } = null!;
    public string CardToken { get; set; } = null!;
    public string CardType { get; set; } = null!;
    public string Last4 { get; set; } = null!;
    public string ExpiryMmYy { get; set; } = null!;
    public DateTime CreatedAt { get; set; }
}
