using System.ComponentModel.DataAnnotations;

namespace PersonalDataVault.Api.Models.Requests;

/// <summary>Batch of client-side log entries posted to the telemetry endpoint.</summary>
public class LogBatchRequest
{
    [Required]
    public List<LogEntry> Entries { get; set; } = null!;
}

public class LogEntry
{
    public string? Level { get; set; }
    public string? Module { get; set; }
    public string? Message { get; set; }
    public string? Timestamp { get; set; }
    public Dictionary<string, object?>? Meta { get; set; }
}
