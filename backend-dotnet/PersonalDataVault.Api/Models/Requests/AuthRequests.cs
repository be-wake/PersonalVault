using System.ComponentModel.DataAnnotations;

namespace PersonalDataVault.Api.Models.Requests;

// Request DTOs for the /auth endpoints (register, login, refresh, step-up, name update).

public class RegisterRequest
{
    [Required, EmailAddress, MaxLength(254)]
    public string Email { get; set; } = null!;

    [Required, MinLength(8), MaxLength(128)]
    public string Password { get; set; } = null!;

    [Required, MinLength(2), MaxLength(100)]
    public string Name { get; set; } = null!;
}

public class LoginRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = null!;

    [Required]
    public string Password { get; set; } = null!;
}

public class RefreshRequest
{
    public string? RefreshToken { get; set; }
}

public class StepUpRequest
{
    [Required]
    public string Password { get; set; } = null!;

    [Required]
    public string Intent { get; set; } = null!;
}

public class UpdateNameRequest
{
    [Required, MinLength(1), MaxLength(100)]
    public string Name { get; set; } = null!;
}
