namespace PersonalDataVault.Api.Models;

public record ErrorEnvelope(ErrorDetail Error);

public record ErrorDetail(
    string Code,
    string Message,
    string? RequestId = null,
    string? Timestamp = null,
    object? Issues = null);

/// <summary>Factory helpers for the standard <see cref="ErrorEnvelope"/> JSON error shape.</summary>
public static class ApiError
{
    public static ErrorEnvelope Of(string code, string message, string? requestId = null) =>
        new(new ErrorDetail(code, message, requestId, DateTime.UtcNow.ToString("o")));

    public static ErrorEnvelope NotFound(string message = "Not found.", string? requestId = null) =>
        Of("NOT_FOUND", message, requestId);

    public static ErrorEnvelope Forbidden(string message = "Access denied.", string? requestId = null) =>
        Of("FORBIDDEN", message, requestId);

    public static ErrorEnvelope Unauthorized(string code, string message, string? requestId = null) =>
        Of(code, message, requestId);

    public static ErrorEnvelope Validation(string message, object? issues = null, string? requestId = null) =>
        new(new ErrorDetail("VALIDATION_ERROR", message, requestId, DateTime.UtcNow.ToString("o"), issues));
}
