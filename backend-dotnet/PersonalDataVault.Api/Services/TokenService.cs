using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace PersonalDataVault.Api.Services;

/// <summary>
/// Issues and verifies the four JWT types used by the API:
///   access   — user sessions (15 min, JWT_SECRET)
///   refresh  — long-lived refresh (30 d, JWT_REFRESH_SECRET)
///   stepup   — sensitive-action re-auth (5 min, STEPUP_SECRET)
///   rp       — relying-party client-credentials (10 min, JWT_SECRET)
///
/// Each token carries an explicit `type` claim so tokens cannot be cross-used.
/// </summary>
public interface ITokenService
{
    string IssueAccessToken(string userId, string email);
    string IssueRefreshToken(string userId, string? jti = null);
    string IssueStepUpToken(string userId, string intent, string factor = "password");
    string IssueRpToken(string rpId, string clientId);

    ClaimsPrincipal VerifyAccessToken(string token);
    ClaimsPrincipal VerifyRefreshToken(string token);
    ClaimsPrincipal VerifyStepUpToken(string token);
    ClaimsPrincipal VerifyRpToken(string token);
}

public class TokenService : ITokenService
{
    private readonly SymmetricSecurityKey _accessKey;
    private readonly SymmetricSecurityKey _refreshKey;
    private readonly SymmetricSecurityKey _stepUpKey;
    private readonly int _accessTtlMinutes;
    private readonly int _refreshTtlDays;
    private readonly int _stepUpTtlMinutes;
    private readonly int _rpTtlMinutes;
    private readonly ILogger<TokenService> _logger;
    private static readonly JwtSecurityTokenHandler _handler = new();

    public TokenService(IConfiguration config, ILogger<TokenService> logger)
    {
        _logger = logger;
        var isProd = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Production";

        _accessKey   = LoadKey("JWT_SECRET",         config, isProd);
        _refreshKey  = LoadKey("JWT_REFRESH_SECRET", config, isProd);
        _stepUpKey   = LoadKey("STEPUP_SECRET",      config, isProd);

        _accessTtlMinutes  = config.GetValue<int>("Jwt:AccessTokenTtlMinutes",  15);
        _refreshTtlDays    = config.GetValue<int>("Jwt:RefreshTokenTtlDays",    30);
        _stepUpTtlMinutes  = config.GetValue<int>("Jwt:StepUpTokenTtlMinutes",  5);
        _rpTtlMinutes      = config.GetValue<int>("Jwt:RpTokenTtlMinutes",      10);

        if (BytesEqual(_accessKey.Key, _refreshKey.Key))
        {
            if (isProd) throw new InvalidOperationException("JWT_SECRET and JWT_REFRESH_SECRET must differ in production.");
            logger.LogWarning("JWT_SECRET and JWT_REFRESH_SECRET are identical — acceptable only in dev");
        }
    }

    // ── Issue ────────────────────────────────────────────────────────────────

    public string IssueAccessToken(string userId, string email) =>
        CreateToken(
            [new(JwtRegisteredClaimNames.Sub, userId),
             new(JwtRegisteredClaimNames.Email, email),
             new("type", "access")],
            _accessKey,
            TimeSpan.FromMinutes(_accessTtlMinutes));

    public string IssueRefreshToken(string userId, string? jti = null) =>
        CreateToken(
            [new(JwtRegisteredClaimNames.Sub, userId),
             new(JwtRegisteredClaimNames.Jti, jti ?? Guid.NewGuid().ToString()),
             new("type", "refresh")],
            _refreshKey,
            TimeSpan.FromDays(_refreshTtlDays));

    public string IssueStepUpToken(string userId, string intent, string factor = "password") =>
        CreateToken(
            [new(JwtRegisteredClaimNames.Sub, userId),
             new("intent", IntentHash(intent)),
             new("factor", factor),
             new("type", "stepup")],
            _stepUpKey,
            TimeSpan.FromMinutes(_stepUpTtlMinutes));

    public string IssueRpToken(string rpId, string clientId) =>
        CreateToken(
            [new(JwtRegisteredClaimNames.Sub, rpId),
             new("clientId", clientId),
             new("type", "rp")],
            _accessKey,          // same secret as access token but distinguishable by type claim
            TimeSpan.FromMinutes(_rpTtlMinutes));

    // ── Verify ───────────────────────────────────────────────────────────────

    public ClaimsPrincipal VerifyAccessToken(string token) =>
        Verify(token, _accessKey, "access");

    public ClaimsPrincipal VerifyRefreshToken(string token) =>
        Verify(token, _refreshKey, "refresh");

    public ClaimsPrincipal VerifyStepUpToken(string token) =>
        Verify(token, _stepUpKey, "stepup");

    public ClaimsPrincipal VerifyRpToken(string token) =>
        Verify(token, _accessKey, "rp");

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static string CreateToken(Claim[] claims, SymmetricSecurityKey key, TimeSpan ttl)
    {
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            claims: claims,
            expires: DateTime.UtcNow.Add(ttl),
            signingCredentials: creds);
        return _handler.WriteToken(token);
    }

    private static ClaimsPrincipal Verify(string token, SymmetricSecurityKey key, string expectedType)
    {
        var vp = new TokenValidationParameters
        {
            ValidateIssuer           = false,
            ValidateAudience         = false,
            ValidateLifetime         = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey         = key,
            ClockSkew                = TimeSpan.Zero,
        };
        var principal = _handler.ValidateToken(token, vp, out _);
        var type = principal.FindFirstValue("type");
        if (type != expectedType)
            throw new SecurityTokenException($"Token type '{type}' does not match expected '{expectedType}'.");
        return principal;
    }

    private static SymmetricSecurityKey LoadKey(string envName, IConfiguration config, bool isProd)
    {
        var value = Environment.GetEnvironmentVariable(envName) ?? config[envName];
        if (!string.IsNullOrEmpty(value) && value.Length >= 16 && !value.Contains("change-me", StringComparison.OrdinalIgnoreCase))
            return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(value));

        if (isProd)
            throw new InvalidOperationException($"{envName} is missing, too short, or set to a placeholder — refusing to start in production.");

        // Dev fallback — ephemeral random key
        var ephemeral = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
        return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(ephemeral));
    }

    public static string IntentHash(string intent)
    {
        var hash = System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(intent));
        return Convert.ToHexString(hash)[..24].ToLowerInvariant();
    }

    private static bool BytesEqual(byte[] a, byte[] b) =>
        a.Length == b.Length && CryptographicOperations.FixedTimeEquals(a, b);
}
