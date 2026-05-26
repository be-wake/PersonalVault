using PersonalDataVault.Api.Data.Repositories;

namespace PersonalDataVault.Api.Services;

/// <summary>
/// Background service that runs every 5 minutes (configurable via
/// ConsentExpiry:SweepIntervalSeconds) to flip ACTIVE grants whose expiry has
/// passed to EXPIRED and write an audit event for each — mirrors the Node.js
/// scheduled sweep in server.js.
/// </summary>
public class ConsentExpiryBackgroundService(
    IServiceScopeFactory scopeFactory,
    IConfiguration config,
    ILogger<ConsentExpiryBackgroundService> logger) : BackgroundService
{
    private readonly TimeSpan _interval = TimeSpan.FromSeconds(
        config.GetValue<int>("ConsentExpiry:SweepIntervalSeconds", 300));

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Consent expiry sweep started (interval: {Interval}s)", _interval.TotalSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(_interval, stoppingToken);
            try
            {
                await SweepAsync(stoppingToken);
            }
            catch (OperationCanceledException) { /* shutting down */ }
            catch (Exception ex)
            {
                logger.LogError(ex, "Consent expiry sweep failed");
            }
        }
    }

    private async Task SweepAsync(CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var consents = scope.ServiceProvider.GetRequiredService<IConsentRepository>();
        var audit    = scope.ServiceProvider.GetRequiredService<IAuditRepository>();

        var expired = await consents.ExpireGrantsAsync();
        if (expired.Count == 0) return;

        logger.LogInformation("Expiry sweep: {Count} grant(s) expired", expired.Count);

        foreach (var e in expired)
        {
            await audit.InsertEventAsync(
                e.Id, e.UserId, "EXPIRED", "system", "scheduler",
                new { relyingPartyId = e.RelyingPartyId });
        }
    }
}
