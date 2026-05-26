using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using PersonalDataVault.Api.Models.Requests;

namespace PersonalDataVault.Api.Controllers;

/// <summary>
/// POST /v1/logs — mobile log ingest.
/// Receives batched log entries from the React Native app and re-emits them
/// through the backend's structured logger so they land in the same stream
/// that Azure Container Apps → Log Analytics captures.
/// </summary>
[ApiController]
[Route("v1/logs")]
[Authorize]
[EnableRateLimiting("logs")]
public class LogsController(ILogger<LogsController> logger) : ControllerBase
{
    private static readonly HashSet<string> ValidLevels = ["error", "warn", "info", "debug"];
    private const int MaxEntries    = 200;
    private const int MaxMsgLength  = 500;
    private const int MaxMetaKeys   = 20;

    [HttpPost]
    public IActionResult IngestLogs([FromBody] LogBatchRequest req)
    {
        if (!ModelState.IsValid || req.Entries.Count == 0)
            return BadRequest(new { error = new { code = "VALIDATION_ERROR", message = "`entries` must be a non-empty array." } });

        var userId   = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? "unknown";
        var received = DateTime.UtcNow.ToString("o");
        var batch    = req.Entries.Take(MaxEntries);

        foreach (var entry in batch)
        {
            var level  = ValidLevels.Contains(entry.Level ?? "") ? entry.Level! : "info";
            var module = (entry.Module ?? "unknown")[..Math.Min(entry.Module?.Length ?? 7, 40)];
            var msg    = (entry.Message ?? "")[..Math.Min(entry.Message?.Length ?? 0, MaxMsgLength)];
            var clientTime = entry.Timestamp;

            var meta = SanitiseMeta(entry.Meta);

            // Emit through the same Serilog pipeline as server-side logs
            Action<string> emit = level switch
            {
                "error" => m => logger.LogError("{@Fields} {Message}", BuildFields(userId, module, clientTime, received, meta), m),
                "warn"  => m => logger.LogWarning("{@Fields} {Message}", BuildFields(userId, module, clientTime, received, meta), m),
                "debug" => m => logger.LogDebug("{@Fields} {Message}", BuildFields(userId, module, clientTime, received, meta), m),
                _       => m => logger.LogInformation("{@Fields} {Message}", BuildFields(userId, module, clientTime, received, meta), m),
            };
            emit(msg);
        }

        return NoContent();
    }

    private static object BuildFields(string userId, string module, string? clientTime, string received, Dictionary<string, object?>? meta) => new
    {
        source    = "mobile",
        userId,
        module    = $"mobile:{module}",
        clientTime,
        receivedAt = received,
        meta,
    };

    private static Dictionary<string, object?>? SanitiseMeta(Dictionary<string, object?>? raw)
    {
        if (raw is null) return null;
        var out_ = new Dictionary<string, object?>();
        foreach (var kv in raw.Take(MaxMetaKeys))
        {
            if (kv.Value is null or string or int or long or double or bool)
                out_[kv.Key] = kv.Value;
        }
        return out_.Count > 0 ? out_ : null;
    }
}
