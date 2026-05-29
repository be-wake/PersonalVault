namespace PersonalDataVault.Api.Data.Models;

/// <summary>
/// Server-side record of an issued refresh token, keyed by the token's JWT `jti`.
/// Enables revocation (logout / account actions) and rotation with reuse detection:
/// a refresh token is single-use — on each refresh the old record is revoked and a
/// new one issued. Presenting an already-revoked token signals theft, so the user's
/// whole token family is revoked. Rows are deleted by FK cascade when the user is.
/// </summary>
public class RefreshToken
{
    public string Id { get; set; } = null!;            // = JWT jti
    public string UserId { get; set; } = null!;
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string? ReplacedByJti { get; set; }
}
