using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using PersonalDataVault.Api.Data.Repositories;
using PersonalDataVault.Api.Models;
using PersonalDataVault.Api.Models.Requests;
using PersonalDataVault.Api.Services;

namespace PersonalDataVault.Api.Controllers;

[ApiController]
[Route("auth")]
public class AuthController(
    IUserRepository users,
    IAuditRepository audit,
    ITokenService tokens,
    IConfiguration config,
    ILogger<AuthController> logger) : ControllerBase
{
    private int BcryptWorkFactor => config.GetValue<int>("Bcrypt:WorkFactor", 10);

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
        var refreshToken = tokens.IssueRefreshToken(userId);

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
        if (user is null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
        {
            logger.LogWarning("Login failed for {Email}", req.Email);
            return Unauthorized(ApiError.Unauthorized("INVALID_CREDENTIALS", "Incorrect email or password."));
        }

        var accessToken  = tokens.IssueAccessToken(user.Id, user.Email);
        var refreshToken = tokens.IssueRefreshToken(user.Id);

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

        try
        {
            var principal = tokens.VerifyRefreshToken(rawToken);
            var userId    = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                            ?? principal.FindFirstValue("sub") ?? string.Empty;

            var user = await users.FindByIdAsync(userId);
            if (user is null)
                return Unauthorized(ApiError.Unauthorized("TOKEN_INVALID", "User not found."));

            var accessToken = tokens.IssueAccessToken(user.Id, user.Email);
            Response.Cookies.Append("pdv_session", accessToken, AccessCookieOptions());
            return Ok(new { accessToken });
        }
        catch
        {
            return Unauthorized(ApiError.Unauthorized("TOKEN_INVALID", "Refresh token is invalid or expired."));
        }
    }

    // ── POST /auth/logout ─────────────────────────────────────────────────────

    [HttpPost("logout")]
    public IActionResult Logout()
    {
        Response.Cookies.Delete("pdv_session");
        Response.Cookies.Delete("pdv_refresh");
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

    private void SetAuthCookies(string accessToken, string refreshToken)
    {
        Response.Cookies.Append("pdv_session", accessToken,   AccessCookieOptions());
        Response.Cookies.Append("pdv_refresh",  refreshToken,  RefreshCookieOptions());
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
