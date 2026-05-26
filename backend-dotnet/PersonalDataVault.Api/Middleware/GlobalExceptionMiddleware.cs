using System.Text.Json;

namespace PersonalDataVault.Api.Middleware;

/// <summary>
/// Converts unhandled exceptions into a consistent JSON error envelope.
/// </summary>
public class GlobalExceptionMiddleware(RequestDelegate next, ILogger<GlobalExceptionMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (Exception ex)
        {
            var requestId = context.Items["RequestId"]?.ToString() ?? "unknown";
            logger.LogError(ex, "Unhandled exception {RequestId}", requestId);

            if (!context.Response.HasStarted)
            {
                context.Response.StatusCode  = 500;
                context.Response.ContentType = "application/json";
                var body = JsonSerializer.Serialize(new
                {
                    error = new
                    {
                        code      = "INTERNAL_ERROR",
                        message   = "An unexpected error occurred.",
                        requestId,
                        timestamp = DateTime.UtcNow.ToString("o"),
                    },
                });
                await context.Response.WriteAsync(body);
            }
        }
    }
}
