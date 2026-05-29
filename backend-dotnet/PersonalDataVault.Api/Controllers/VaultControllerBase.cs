using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using PersonalDataVault.Api.Models;
using PersonalDataVault.Api.Services;

namespace PersonalDataVault.Api.Controllers;

/// <summary>
/// Base class for authenticated PDV API controllers.
///
/// Centralizes three concerns that were previously copy-pasted across
/// AccountController, ConsentsController and VaultController:
///   • <see cref="UserId"/>   — the caller's id from the access token
///   • <see cref="RequestId"/> — the correlation id set by RequestIdMiddleware
///   • <see cref="RequireStepUp"/> — the step-up (recent re-auth) gate
///
/// Cross-cutting services (configuration, token service) are resolved from the
/// request scope so derived controllers don't need to thread them through their
/// constructors.
/// </summary>
public abstract class VaultControllerBase : ControllerBase
{
    /// <summary>The authenticated user's id, taken from the access-token subject claim.</summary>
    protected string UserId =>
        User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? string.Empty;

    /// <summary>The per-request correlation id assigned by <c>RequestIdMiddleware</c>.</summary>
    protected string RequestId => HttpContext.Items["RequestId"]?.ToString() ?? "unknown";

    /// <summary>
    /// Enforces a valid step-up token for sensitive actions when <c>StepUp:Enforced</c> is on.
    /// Returns <c>null</c> to let the request proceed, or a <c>401</c> result to short-circuit it.
    /// </summary>
    /// <param name="intent">The action intent the step-up token must have been minted for.</param>
    protected IActionResult? RequireStepUp(string intent)
    {
        var config = HttpContext.RequestServices.GetRequiredService<IConfiguration>();
        if (!config.GetValue<bool>("StepUp:Enforced", false))
            return null;

        var header = Request.Headers["X-PDV-Stepup"].FirstOrDefault();
        if (string.IsNullOrEmpty(header))
            return StatusCode(401, new
            {
                error = new
                {
                    code = "STEPUP_REQUIRED",
                    message = "This action requires a recent re-authentication.",
                    intent,
                    requestId = RequestId,
                    timestamp = DateTime.UtcNow.ToString("o"),
                }
            });

        try
        {
            var tokenSvc  = HttpContext.RequestServices.GetRequiredService<ITokenService>();
            var principal = tokenSvc.VerifyStepUpToken(header);
            var sub         = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? principal.FindFirstValue("sub");
            var claimIntent = principal.FindFirstValue("intent");
            if (sub != UserId || claimIntent != TokenService.IntentHash(intent))
                throw new InvalidOperationException("Step-up token mismatch");
            return null;
        }
        catch
        {
            return StatusCode(401, ApiError.Unauthorized("STEPUP_INVALID", "Step-up token is invalid or expired.", RequestId));
        }
    }
}
