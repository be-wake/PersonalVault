using StackExchange.Redis;

namespace PersonalDataVault.Api.Services;

/// <summary>
/// Consent-revocation cache.
/// Uses Azure Cache for Redis when REDIS_CONNECTION_STRING is configured;
/// falls back to an in-memory dictionary for single-instance dev deployments.
/// </summary>
public interface IRevocationCacheService
{
    Task RevokeGrantAsync(string grantId);
    Task<bool> IsRevokedAsync(string grantId);
    string ImplName { get; }
}

public class RevocationCacheService : IRevocationCacheService, IAsyncDisposable
{
    private readonly int _ttlSeconds;
    private readonly ILogger<RevocationCacheService> _logger;
    private IDatabase? _redis;
    private IConnectionMultiplexer? _mux;
    private readonly Dictionary<string, long> _memCache = new();
    private readonly bool _useRedis;

    public string ImplName => _useRedis ? "redis" : "memory";

    public RevocationCacheService(IConfiguration config, ILogger<RevocationCacheService> logger)
    {
        _logger     = logger;
        _ttlSeconds = config.GetValue<int>("RevocationCache:TtlSeconds", 900);

        var conn = Environment.GetEnvironmentVariable("REDIS_CONNECTION_STRING")
                   ?? config["REDIS_CONNECTION_STRING"];

        if (!string.IsNullOrEmpty(conn))
        {
            try
            {
                _mux   = ConnectionMultiplexer.Connect(conn);
                _redis = _mux.GetDatabase();
                _useRedis = true;
                logger.LogInformation("Using Redis for revocation cache");
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Redis connect failed — falling back to in-memory revocation cache");
                _useRedis = false;
            }
        }
        else
        {
            logger.LogWarning("REDIS_CONNECTION_STRING not set — using in-memory revocation cache (single-instance only)");
            _useRedis = false;
        }
    }

    public async Task RevokeGrantAsync(string grantId)
    {
        if (_useRedis && _redis is not null)
        {
            await _redis.StringSetAsync($"pdv:revoked:{grantId}", "1", TimeSpan.FromSeconds(_ttlSeconds));
        }
        else
        {
            lock (_memCache)
                _memCache[grantId] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + _ttlSeconds * 1000L;
        }
    }

    public async Task<bool> IsRevokedAsync(string grantId)
    {
        if (_useRedis && _redis is not null)
        {
            var v = await _redis.StringGetAsync($"pdv:revoked:{grantId}");
            return v == "1";
        }

        lock (_memCache)
        {
            if (!_memCache.TryGetValue(grantId, out var exp)) return false;
            if (exp < DateTimeOffset.UtcNow.ToUnixTimeMilliseconds())
            {
                _memCache.Remove(grantId);
                return false;
            }
            return true;
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_mux is not null) await _mux.CloseAsync();
    }
}
