using Azure.Messaging.ServiceBus;

namespace PersonalDataVault.Api.Services;

/// <summary>
/// Publishes revocation/expiry events.
/// Uses Azure Service Bus in production; falls back to an in-process
/// event-handler registry when SERVICE_BUS_CONNECTION_STRING is not set.
/// </summary>
public interface IServiceBusService
{
    Task PublishAsync(string eventType, object body);
    void Subscribe(string eventType, Func<object, Task> handler);
    string ImplName { get; }
    Task CloseAsync();
}

public record RevocationEvent(string GrantId, string UserId, string RelyingPartyId);

public class ServiceBusService : IServiceBusService, IAsyncDisposable
{
    private readonly ILogger<ServiceBusService> _logger;
    private ServiceBusClient?  _sbClient;
    private ServiceBusSender?  _sender;
    private readonly Dictionary<string, List<Func<object, Task>>> _handlers = new();
    private readonly bool _useServiceBus;
    private readonly string _topic;

    public string ImplName => _useServiceBus ? "azure-service-bus" : "memory";

    public ServiceBusService(IConfiguration config, ILogger<ServiceBusService> logger)
    {
        _logger = logger;
        _topic  = Environment.GetEnvironmentVariable("SERVICE_BUS_TOPIC_REVOCATION")
                  ?? config["SERVICE_BUS_TOPIC_REVOCATION"]
                  ?? "pdv-revocation-events";

        var conn = Environment.GetEnvironmentVariable("SERVICE_BUS_CONNECTION_STRING")
                   ?? config["SERVICE_BUS_CONNECTION_STRING"];

        if (!string.IsNullOrEmpty(conn))
        {
            try
            {
                _sbClient     = new ServiceBusClient(conn);
                _sender       = _sbClient.CreateSender(_topic);
                _useServiceBus = true;
                logger.LogInformation("Azure Service Bus sender ready for topic {Topic}", _topic);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Service Bus init failed — falling back to in-memory event bus");
                _useServiceBus = false;
            }
        }
        else
        {
            logger.LogWarning("SERVICE_BUS_CONNECTION_STRING not set — using in-memory event bus");
            _useServiceBus = false;
        }
    }

    public async Task PublishAsync(string eventType, object body)
    {
        if (_useServiceBus && _sender is not null)
        {
            var json    = System.Text.Json.JsonSerializer.Serialize(body);
            var message = new ServiceBusMessage(json);
            message.ApplicationProperties["eventType"] = eventType;
            await _sender.SendMessageAsync(message);
        }
        else
        {
            // In-process dispatch (dev / memory mode)
            if (!_handlers.TryGetValue(eventType, out var handlers)) return;
            foreach (var h in handlers)
            {
                try { await h(body); }
                catch (Exception ex) { _logger.LogError(ex, "In-process event handler failed for {EventType}", eventType); }
            }
        }
    }

    public void Subscribe(string eventType, Func<object, Task> handler)
    {
        if (_useServiceBus)
        {
            _logger.LogWarning("In-process Subscribe() not supported with Azure Service Bus — use a Subscription receiver");
            return;
        }
        if (!_handlers.TryGetValue(eventType, out var list))
        {
            list = [];
            _handlers[eventType] = list;
        }
        list.Add(handler);
    }

    public async Task CloseAsync()
    {
        if (_sender   is not null) await _sender.CloseAsync();
        if (_sbClient is not null) await _sbClient.DisposeAsync();
    }

    public async ValueTask DisposeAsync() => await CloseAsync();
}
