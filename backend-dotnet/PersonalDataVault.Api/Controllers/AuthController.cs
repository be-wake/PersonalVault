using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using PersonalDataVault.Api.Data.Repositories;
using PersonalDataVault.Api.Models;
using PersonalDataVault.Api.Models.Requests;
using PersonalDataVault.Api.Services;

namespace PersonalDataVault.Api.Controllers;

/// <summary>
/// Authentication endpoints: register, login, token refresh (with rotation),
/// logout, current user, and step-up re-authentication.
/// </summary>
[ApiController]
[Route("auth")]
public class AuthController(
    IUserRepository users,
    IAuditRepository audit,
    ITokenService tokens,
    IRefreshTokenRepository refreshTokens,
    IConfiguration config,
    ILogger<AuthController> logger) : ControllerBase
{
    private int BcryptWorkFactor => config.GetValue<int>("Bcrypt:WorkFactor", 10);
    private TimeSpan RefreshTokenLifetime => TimeSpan.FromDays(config.GetValue<int>("Jwt:RefreshTokenTtlDays", 30));

    // Verified against on unknown-email logins so the response time matches the
    // real-user path, denying an attacker a timing oracle for email enumeration.
    private static readonly string DummyPasswordHash =
        BCrypt.Net.BCrypt.HashPassword("timing-equalization-placeholder");

    // ── POST /auth/register ───────────────────────────────────────────────────

    [HttpPost("register")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest req)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var existing = await users.FindByEmailAsync(req.Email);
        if (existing is not null)
            return Conflict(ApiError.Of("EMAIL_EXISTS", "An account with this email already exists."));

        var hash   = BCrypt.Net.BCrypt.HashPassword(req.Password, BcryptWorkFactor);
        var userId = await users.CreateUserAsync(req.Email, hash, req.Name);

        await audit.InsertEventAsync(null, userId, "REGISTER", "user", userId, null);

        var accessToken  = tokens.IssueAccessToken(userId, req.Email);
        var refreshToken = await IssueAndStoreRefreshTokenAsync(userId);

        SetAuthCookies(accessToken, refreshToken);
        logger.LogInformation("User registered {UserId}", userId);

        return Ok(new
        {
            user = new { id = userId, email = req.Email, name = req.Name },
            accessToken,
            refreshToken,  // included for mobile clients (web uses the HttpOnly cookie)
        });
    }

    // ── POST /auth/login ──────────────────────────────────────────────────────

    [HttpPost("login")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var user = await users.FindByEmailAsync(req.Email);
        // Always run a bcrypt verify (against a dummy hash when the email is unknown)
        // so both branches take the same time — no email-enumeration timing oracle.
        var passwordOk = BCrypt.Net.BCrypt.Verify(req.Password, user?.PasswordHash ?? DummyPasswordHash);
        if (user is null || !passwordOk)
        {
            logger.LogWarning("Login failed for {Email}", req.Email);
            return Unauthorized(ApiError.Unauthorized("INVALID_CREDENTIALS", "Incorrect email or password."));
        }

        var accessToken  = tokens.IssueAccessToken(user.Id, user.Email);
        var refreshToken = await IssueAndStoreRefreshTokenAsync(user.Id);

        SetAuthCookies(accessToken, refreshToken);
        logger.LogInformation("User logged in {UserId}", user.Id);

        return Ok(new
        {
            user = new { id = user.Id, email = user.Email, name = user.Name },
            accessToken,
            refreshToken,
        });
    }

    // ── POST /auth/refresh ────────────────────────────────────────────────────

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest req)
    {
        var rawToken = Request.Cookies["pdv_refresh"] ?? req.RefreshToken;
        if (string.IsNullOrEmpty(rawToken))
            return Unauthorized(ApiError.Unauthorized("TOKEN_INVALID", "Refresh token required."));

        ClaimsPrincipal principal;
        try
        {
            principal = tokens.VerifyRefreshToken(rawToken);   // validates signature, expiry, type
        }
        catch
        {
            return Unauthorized(ApiError.Unauthorized("TOKEN_INVALID", "Refresh token is invalid or expired."));
        }

        var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                     ?? principal.FindFirstValue("sub") ?? string.Empty;
        var jti = GetJti(principal);
        if (string.IsNullOrEmpty(jti))
            return Unauthorized(ApiError.Unauthorized("TOKEN_INVALID", "Refresh token is malformed."));

        var stored = await refreshTokens.GetAsync(jti);

        // Unknown jti: signature was valid but we have no active record (revoked+purged,
        // issued before this feature, or forged with a leaked key) — refuse.
        if (stored is null)
        {
            ClearAuthCookies();
            return Unauthorized(ApiError.Unauthorized("TOKEN_INVALID", "Refresh token is not recognized."));
        }

        // Reuse of an already-revoked token ⇒ the chain was rotated or logged out, yet an
        // old copy is being replayed. Treat as theft: revoke the user's entire token family.
        if (stored.RevokedAt is not null)
        {
            await refreshTokens.RevokeAllForUserAsync(userId);
            ClearAuthCookies();
            logger.LogWarning("Refresh-token reuse detected for {UserId} — revoked all sessions", userId);
            return Unauthorized(ApiError.Unauthorized("TOKEN_REVOKED", "Session was revoked. Please sign in again."));
        }

        var user = await users.FindByIdAsync(userId);
        if (user is null)
        {
            await refreshTokens.RevokeAsync(jti);
            ClearAuthCookies();
            return Unauthorized(ApiError.Unauthorized("TOKEN_INVALID", "User not found."));
        }

        // Rotate: revoke the presented token and issue a fresh refresh + access pair.
        var newJti       = Guid.NewGuid().ToString();
        var refreshToken = tokens.IssueRefreshToken(user.Id, newJti);
        var accessToken  = tokens.IssueAccessToken(user.Id, user.Email);
        await refreshTokens.RotateAsync(jti, newJti, user.Id, DateTime.UtcNow.Add(RefreshTokenLifetime));

        Response.Cookies.Append("pdv_session", accessToken, AccessCookieOptions());
        Response.Cookies.Append("pdv_refresh", refreshToken, RefreshCookieOptions());
        return Ok(new { accessToken, refreshToken });
    }

    // ── POST /auth/logout ─────────────────────────────────────────────────────

    [HttpPost("logout")]
    public async Task<IActionResult> Logout([FromBody] RefreshRequest? req = null)
    {
        // Revoke the refresh token server-side so it can't be replayed after logout.
        var rawToken = Request.Cookies["pdv_refresh"] ?? req?.RefreshToken;
        if (!string.IsNullOrEmpty(rawToken))
        {
            try
            {
                var principal = tokens.VerifyRefreshToken(rawToken);
                var jti = GetJti(principal);
                if (!string.IsNullOrEmpty(jti))
                    await refreshTokens.RevokeAsync(jti);
            }
            catch { /* already-invalid token — clearing cookies below is enough */ }
        }

        ClearAuthCookies();
        return Ok(new { message = "Logged out." });
    }

    // ── GET /auth/me ──────────────────────────────────────────────────────────

    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
                     ?? User.FindFirstValue("sub") ?? string.Empty;

        var user = await users.FindByIdAsync(userId);
        if (user is null) return Unauthorized(ApiError.Unauthorized("TOKEN_INVALID", "User not found."));

        return Ok(new { user = new { user.Id, user.Email, user.Name, user.CreatedAt } });
    }

    // ── POST /auth/stepup ─────────────────────────────────────────────────────

    [HttpPost("stepup")]
    [Authorize]
    public async Task<IActionResult> StepUp([FromBody] StepUpRequest req)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
                     ?? User.FindFirstValue("sub") ?? string.Empty;

        var fullUser = await FindUserWithHashAsync(userId);
        if (fullUser is null)
            return Unauthorized(ApiError.Unauthorized("TOKEN_INVALID", "User not found."));

        if (!BCrypt.Net.BCrypt.Verify(req.Password, fullUser.PasswordHash))
            return Unauthorized(ApiError.Unauthorized("INVALID_CREDENTIALS", "Incorrect password."));

        var stepUpToken = tokens.IssueStepUpToken(userId, req.Intent);
        return Ok(new { stepUpToken });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private async Task<Data.Models.User?> FindUserWithHashAsync(string userId)
    {
        var ctx = HttpContext.RequestServices.GetRequiredService<Data.AppDbContext>();
        return await ctx.Users.FindAsync(userId);
    }

    /// <summary>Issues a refresh token with a fresh jti and records it for later revocation.</summary>
    private async Task<string> IssueAndStoreRefreshTokenAsync(string userId)
    {
        var jti   = Guid.NewGuid().ToString();
        var token = tokens.IssueRefreshToken(userId, jti);
        await refreshTokens.StoreAsync(jti, userId, DateTime.UtcNow.Add(RefreshTokenLifetime));
        return token;
    }

    /// <summary>Reads the jti claim regardless of whether the handler remapped it.</summary>
    private static string? GetJti(ClaimsPrincipal p) =>
        p.FindFirstValue(JwtRegisteredClaimNames.Jti)
        ?? p.Claims.FirstOrDefault(c => c.Type == "jti" || c.Type.EndsWith("/jti", StringComparison.Ordinal))?.Value;

    private void SetAuthCookies(string accessToken, string refreshToken)
    {
        Response.Cookies.Append("pdv_session", accessToken,   AccessCookieOptions());
        Response.Cookies.Append("pdv_refresh",  refreshToken,  RefreshCookieOptions());
    }

    private void ClearAuthCookies()
    {
        Response.Cookies.Delete("pdv_session");
        Response.Cookies.Delete("pdv_refresh");
    }

    private static CookieOptions AccessCookieOptions() => new()
    {
        HttpOnly  = true,
        Secure    = true,
        SameSite  = SameSiteMode.Strict,
        MaxAge    = TimeSpan.FromMinutes(15),
    };

    private static CookieOptions RefreshCookieOptions() => new()
    {
        HttpOnly  = true,
        Secure    = true,
        SameSite  = SameSiteMode.Strict,
        MaxAge    = TimeSpan.FromDays(30),
        Path      = "/auth/refresh",
    };
}
