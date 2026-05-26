using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace PersonalDataVault.Api.Services;

/// <summary>
/// Raw WebSocket connection manager — direct replacement for the Node.js ws/index.js.
///
/// Wire protocol is identical to the Node.js backend:
///   • Mobile:  JWT embedded as Sec-WebSocket-Protocol "pdv.token.&lt;jwt&gt;"
///   • Web:     JWT arrives automatically via the httpOnly pdv_session cookie
///   • Server → client messages are plain JSON, e.g. {"type":"CONSENT_REVOKED","grantId":"..."}
///   • Heartbeat: server pings every WS_HEARTBEAT_MS; client pong resets liveness flag.
/// </summary>
public interface IWebSocketConnectionManager
{
    Task HandleConnectionAsync(string userId, WebSocket ws, CancellationToken ct);
    Task BroadcastToUserAsync(string userId, string eventType, object payload);
}

public class WebSocketConnectionManager(
    IConfiguration config,
    ILogger<WebSocketConnectionManager> logger) : IWebSocketConnectionManager, IHostedService, IDisposable
{
    // userId → set of open connections
    private readonly ConcurrentDictionary<string, ConcurrentBag<WsConnection>> _users = new();
    private Timer? _heartbeatTimer;
    private readonly TimeSpan _heartbeatInterval =
        TimeSpan.FromMilliseconds(config.GetValue<int>("WebSocket:HeartbeatMs", 60_000));

    // ── IHostedService — start heartbeat ──────────────────────────────────────

    public Task StartAsync(CancellationToken ct)
    {
        _heartbeatTimer = new Timer(Heartbeat, null, _heartbeatInterval, _heartbeatInterval);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken ct)
    {
        _heartbeatTimer?.Change(Timeout.Infinite, 0);
        return Task.CompletedTask;
    }

    // ── Connection lifecycle ──────────────────────────────────────────────────

    public async Task HandleConnectionAsync(string userId, WebSocket ws, CancellationToken ct)
    {
        var conn = new WsConnection(ws);
        var bag  = _users.GetOrAdd(userId, _ => new ConcurrentBag<WsConnection>());
        bag.Add(conn);

        logger.LogDebug("WS client connected {UserId} (total: {Count})", userId, bag.Count);

        // Send CONNECTED ack (matches Node.js behaviour)
        await SendAsync(ws, new { type = "CONNECTED", userId }, ct);

        try
        {
            await ReceiveLoopAsync(userId, conn, ws, ct);
        }
        finally
        {
            conn.IsAlive = false;
            logger.LogDebug("WS client disconnected {UserId}", userId);
        }
    }

    private static async Task ReceiveLoopAsync(string userId, WsConnection conn, WebSocket ws, CancellationToken ct)
    {
        var buf = new byte[1024];
        while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
        {
            try
            {
                var result = await ws.ReceiveAsync(buf, ct);
                conn.IsAlive = true; // any inbound frame = liveness

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, ct);
                    break;
                }
                // We don't process client messages (PING frames are handled at the WS level)
            }
            catch (WebSocketException) { break; }
            catch (OperationCanceledException) { break; }
        }
    }

    // ── Broadcast ─────────────────────────────────────────────────────────────

    public async Task BroadcastToUserAsync(string userId, string eventType, object payload)
    {
        if (!_users.TryGetValue(userId, out var bag)) return;

        // Merge eventType into the payload
        var envelope = MergeType(eventType, payload);
        var json     = JsonSerializer.Serialize(envelope,
            new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        var bytes    = Encoding.UTF8.GetBytes(json);

        var live  = new List<WsConnection>();
        var dead  = new List<WsConnection>();

        foreach (var conn in bag)
        {
            if (conn.Ws.State == WebSocketState.Open)
                live.Add(conn);
            else
                dead.Add(conn);
        }

        // Prune dead connections from the bag (ConcurrentBag doesn't support removal;
        // rebuild it from live connections)
        if (dead.Count > 0)
        {
            var fresh = new ConcurrentBag<WsConnection>(live);
            _users.TryUpdate(userId, fresh, bag);
            if (fresh.IsEmpty) _users.TryRemove(userId, out _);
        }

        var sends = live.Select(conn => SendBytesAsync(conn.Ws, bytes));
        await Task.WhenAll(sends);

        if (live.Count > 0)
            logger.LogDebug("WS broadcast {EventType} → {UserId} ({Count} connections)", eventType, userId, live.Count);
    }

    // ── Heartbeat ─────────────────────────────────────────────────────────────

    private void Heartbeat(object? _state)
    {
        foreach (var (userId, bag) in _users)
        {
            var dead = new List<WsConnection>();
            foreach (var conn in bag)
            {
                if (!conn.IsAlive)
                {
                    dead.Add(conn);
                    try { conn.Ws.Abort(); } catch { /* already gone */ }
                }
                else
                {
                    conn.IsAlive = false; // reset; next pong/message sets it back
                    _ = PingAsync(conn.Ws);
                }
            }
            if (dead.Count > 0)
            {
                var live = new ConcurrentBag<WsConnection>(bag.Except(dead));
                _users.TryUpdate(userId, live, bag);
                if (live.IsEmpty) _users.TryRemove(userId, out _);
            }
        }
    }

    private static async Task PingAsync(WebSocket ws)
    {
        try
        {
            if (ws.State == WebSocketState.Open)
                await ws.SendAsync(Array.Empty<byte>(), WebSocketMessageType.Binary, true, CancellationToken.None);
        }
        catch { /* socket already closed */ }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static async Task SendAsync(WebSocket ws, object payload, CancellationToken ct)
    {
        var json  = JsonSerializer.Serialize(payload, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        var bytes = Encoding.UTF8.GetBytes(json);
        await SendBytesAsync(ws, bytes, ct);
    }

    private static async Task SendBytesAsync(WebSocket ws, byte[] bytes, CancellationToken ct = default)
    {
        try
        {
            if (ws.State == WebSocketState.Open)
                await ws.SendAsync(bytes, WebSocketMessageType.Text, true, ct);
        }
        catch { /* dead socket — pruned on next broadcast */ }
    }

    private static object MergeType(string eventType, object payload)
    {
        // Serialize, inject "type", deserialize back to dictionary
        var json = JsonSerializer.Serialize(payload,
            new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        var dict = JsonSerializer.Deserialize<Dictionary<string, object>>(json) ?? new();
        dict["type"] = eventType;
        return dict;
    }

    public void Dispose() => _heartbeatTimer?.Dispose();
}

internal sealed class WsConnection(WebSocket ws)
{
    public WebSocket Ws { get; } = ws;
    public volatile bool IsAlive = true;
}
