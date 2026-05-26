namespace PersonalDataVault.Api.Middleware;

/// <summary>
/// Assigns a unique request ID to every request (reads X-Request-ID header if
/// present, otherwise generates a UUID). Sets the same value in the response
/// header so clients can correlate logs.
/// </summary>
public class RequestIdMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var requestId = context.Request.Headers["X-Request-ID"].FirstOrDefault()
                        ?? Guid.NewGuid().ToString();

        context.Items["RequestId"] = requestId;
        context.Response.Headers["X-Request-ID"] = requestId;

        await next(context);
    }
}
