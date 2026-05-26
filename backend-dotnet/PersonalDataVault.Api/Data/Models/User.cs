namespace PersonalDataVault.Api.Data.Models;

public class User
{
    public string Id { get; set; } = null!;
    public string Email { get; set; } = null!;
    public string PasswordHash { get; set; } = null!;
    public string Name { get; set; } = null!;
    public DateTime CreatedAt { get; set; }
}
