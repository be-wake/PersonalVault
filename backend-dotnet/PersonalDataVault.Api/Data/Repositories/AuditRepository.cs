using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalDataVault.Api.Data.Models;

namespace PersonalDataVault.Api.Data.Repositories;

public interface IAuditRepository
{
    Task<string> InsertEventAsync(string? grantId, string userId, string eventType,
        string actorType, string actorId, object? metadata);

    Task<List<AuditEvent>> GetEventsAsync(string userId, AuditQueryOptions opts);

    Task<AuditChainResult> VerifyChainAsync(string userId);
}

public record AuditQueryOptions(
    string? From = null,
    string? To = null,
    int Limit = 50,
    string? Resource = null);

public record AuditChainResult(bool Ok, int Count, string? BrokenAt = null);

/// <summary>
/// Flat projection for the audit event + joined RP columns.
/// Used with Database.SqlQuery&lt;T&gt; (EF Core 7+).
/// </summary>
internal sealed class AuditEventRow
{
    public string Id           { get; set; } = null!;
    public string? GrantId     { get; set; }
    public string UserId       { get; set; } = null!;
    public string EventType    { get; set; } = null!;
    public string ActorType    { get; set; } = null!;
    public string ActorId      { get; set; } = null!;
    public DateTime Ts         { get; set; }
    public string? MetadataJson { get; set; }
    public string? PrevHash    { get; set; }
    public string? Hash        { get; set; }
    public string? RelyingPartyId { get; set; }
    public string? RpName      { get; set; }
    public string? RpDomain    { get; set; }

    public AuditEvent ToModel() => new()
    {
        Id = Id, GrantId = GrantId, UserId = UserId, EventType = EventType,
        ActorType = ActorType, ActorId = ActorId, Ts = Ts,
        MetadataJson = MetadataJson, PrevHash = PrevHash, Hash = Hash,
        RelyingPartyId = RelyingPartyId, RpName = RpName, RpDomain = RpDomain,
    };
}

public class AuditRepository(AppDbContext db) : IAuditRepository
{
    /// <summary>
    /// Inserts an audit event into the per-user tamper-evident hash chain.
    /// Each row carries hash = SHA-256(prevHash || canonical(event)).
    /// The previous row is locked FOR UPDATE so concurrent writers serialise.
    /// </summary>
    public async Task<string> InsertEventAsync(string? grantId, string userId, string eventType,
        string actorType, string actorId, object? metadata)
    {
        var id       = Guid.NewGuid().ToString();
        var tsUtc    = DateTime.UtcNow;
        var ts       = tsUtc.ToString("o");   // ISO-8601 string used for the hash chain
        var metaJson = metadata is not null ? JsonSerializer.Serialize(metadata) : null;

        // EnableRetryOnFailure requires all transactions to run inside the execution strategy.
        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync();
            try
            {
                // Lock the user's latest event to serialise the chain
                string prevHash;
                var prevRows = await db.Database
                    .SqlQuery<HashRow>($"SELECT hash AS \"Hash\" FROM audit_events WHERE user_id = {userId} ORDER BY ts DESC, id DESC LIMIT 1 FOR UPDATE")
                    .ToListAsync();
                prevHash = prevRows.FirstOrDefault()?.Hash ?? "GENESIS";

                // The canonical JSON must match the Node.js format exactly (same key ordering)
                // so an existing audit chain (if migrating) stays verifiable.
                var canonical = JsonSerializer.Serialize(new
                {
                    id,
                    grantId = grantId,
                    userId,
                    eventType,
                    actorType,
                    actorId,
                    ts,
                    metadata = metaJson,
                    prevHash,
                });
                var hash = Sha256Hex(canonical);

                await db.Database.ExecuteSqlRawAsync(
                    """
                    INSERT INTO audit_events (id, grant_id, user_id, event_type, actor_type, actor_id, ts, metadata_json, prev_hash, hash)
                    VALUES ({0},{1},{2},{3},{4},{5},{6},{7},{8},{9})
                    """,
                    id, (object?)grantId, userId, eventType,
                    actorType, actorId, tsUtc, (object?)metaJson, prevHash, hash);

                await tx.CommitAsync();
                return id;
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }
        });
    }

    public async Task<List<AuditEvent>> GetEventsAsync(string userId, AuditQueryOptions opts)
    {
        var limit = Math.Clamp(opts.Limit, 1, 200);

        // Fetch all (up to 200) then filter in memory — avoids dynamic SQL construction
        var rows = await db.Database
            .SqlQuery<AuditEventRow>($"""
                SELECT ae.id            AS "Id",
                       ae.grant_id      AS "GrantId",
                       ae.user_id       AS "UserId",
                       ae.event_type    AS "EventType",
                       ae.actor_type    AS "ActorType",
                       ae.actor_id      AS "ActorId",
                       ae.ts            AS "Ts",
                       ae.metadata_json AS "MetadataJson",
                       ae.prev_hash     AS "PrevHash",
                       ae.hash          AS "Hash",
                       cg.relying_party_id AS "RelyingPartyId",
                       rp.name          AS "RpName",
                       rp.domain        AS "RpDomain"
                FROM audit_events ae
                LEFT JOIN consent_grants cg ON ae.grant_id = cg.id
                LEFT JOIN relying_parties rp ON cg.relying_party_id = rp.id
                WHERE ae.user_id = {userId}
                ORDER BY ae.ts DESC
                LIMIT 200
                """)
            .ToListAsync();

        IEnumerable<AuditEventRow> query = rows;

        if (opts.From is not null && DateTime.TryParse(opts.From, out var from))
            query = query.Where(e => e.Ts >= from);
        if (opts.To is not null && DateTime.TryParse(opts.To, out var to))
            query = query.Where(e => e.Ts <= to);

        if (opts.Resource is not null)
        {
            var r = opts.Resource.ToLowerInvariant();
            if (r == "consent")
                query = query.Where(e => new[] { "GRANT_CREATED", "REVOKED", "EXPIRED", "SCOPE_CHANGED", "GRANT_RENEWED" }.Contains(e.EventType));
            else
                query = query.Where(e => e.EventType == "ACCESS" && (e.MetadataJson ?? "").Contains($"\"resource\":\"{r}\""));
        }

        return query.Take(limit).Select(r => r.ToModel()).ToList();
    }

    public async Task<AuditChainResult> VerifyChainAsync(string userId)
    {
        var events = await db.AuditEvents
            .Where(e => e.UserId == userId)
            .OrderBy(e => e.Ts).ThenBy(e => e.Id)
            .ToListAsync();

        var prevHash = "GENESIS";
        foreach (var r in events)
        {
            var ts = r.Ts.ToString("o");
            var canonical = JsonSerializer.Serialize(new
            {
                id        = r.Id,
                grantId   = r.GrantId,
                userId    = r.UserId,
                eventType = r.EventType,
                actorType = r.ActorType,
                actorId   = r.ActorId,
                ts,
                metadata  = r.MetadataJson,
                prevHash,
            });
            var expected = Sha256Hex(canonical);
            if (r.PrevHash != prevHash || r.Hash != expected)
                return new AuditChainResult(false, events.Count, r.Id);
            prevHash = r.Hash!;
        }
        return new AuditChainResult(true, events.Count);
    }

    internal static string Sha256Hex(string input)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}

/// <summary>Helper projection for the hash-chain lock query.</summary>
internal sealed class HashRow
{
    public string? Hash { get; set; }
}
