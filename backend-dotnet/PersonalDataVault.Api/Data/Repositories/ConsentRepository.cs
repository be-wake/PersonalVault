using Microsoft.EntityFrameworkCore;
using PersonalDataVault.Api.Data.Models;

namespace PersonalDataVault.Api.Data.Repositories;

public interface IConsentRepository
{
    Task<(string Id, bool Created)> CreateGrantAsync(
        string userId, string relyingPartyId, List<string> scopes,
        string purpose, DateTime? expiresAt, string? idempotencyKey);

    Task<List<ConsentGrant>> GetGrantsByUserAsync(string userId);
    Task<ConsentGrant?> GetGrantByIdAsync(string grantId);
    Task<bool> RevokeGrantAsync(string grantId, string userId);
    Task<List<ExpiredGrantInfo>> ExpireGrantsAsync();
}

public record ExpiredGrantInfo(string Id, string UserId, string RelyingPartyId);

/// <summary>
/// Flat projection type used by EF Core 8's Database.SqlQuery&lt;T&gt; for grant+RP joins.
/// All column names here must match exactly (case-insensitive) what the SQL query returns.
/// </summary>
internal sealed class GrantRow
{
    public string Id            { get; set; } = null!;
    public string UserId        { get; set; } = null!;
    public string RelyingPartyId { get; set; } = null!;
    public string ScopesJson    { get; set; } = null!;
    public string Purpose       { get; set; } = null!;
    public DateTime GrantedAt   { get; set; }
    public DateTime? ExpiresAt  { get; set; }
    public DateTime? RevokedAt  { get; set; }
    public string Status        { get; set; } = null!;
    public string? IdempotencyKey { get; set; }
    public string? RpName        { get; set; }
    public string? RpDomain      { get; set; }
    public string? RpDescription { get; set; }
    public bool? RpPciScope      { get; set; }

    public ConsentGrant ToModel() => new()
    {
        Id = Id, UserId = UserId, RelyingPartyId = RelyingPartyId,
        ScopesJson = ScopesJson, Purpose = Purpose, GrantedAt = GrantedAt,
        ExpiresAt = ExpiresAt, RevokedAt = RevokedAt, Status = Status,
        IdempotencyKey = IdempotencyKey,
        RpName = RpName, RpDomain = RpDomain, RpDescription = RpDescription, RpPciScope = RpPciScope,
    };
}

public class ConsentRepository(AppDbContext db) : IConsentRepository
{
    public async Task<(string Id, bool Created)> CreateGrantAsync(
        string userId, string relyingPartyId, List<string> scopes,
        string purpose, DateTime? expiresAt, string? idempotencyKey)
    {
        var id         = Guid.NewGuid().ToString();
        var scopesJson = System.Text.Json.JsonSerializer.Serialize(scopes);

        if (idempotencyKey is not null)
        {
            var inserted = await db.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO consent_grants (id, user_id, relying_party_id, scopes_json, purpose, expires_at, idempotency_key)
                VALUES ({0},{1},{2},{3},{4},{5},{6})
                ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
                """,
                id, userId, relyingPartyId, scopesJson, purpose,
                (object?)expiresAt ?? DBNull.Value, idempotencyKey);

            if (inserted > 0)
                return (id, true);

            var existing = await db.ConsentGrants
                .Where(g => g.UserId == userId && g.IdempotencyKey == idempotencyKey)
                .Select(g => g.Id)
                .FirstAsync();
            return (existing, false);
        }

        db.ConsentGrants.Add(new ConsentGrant
        {
            Id = id, UserId = userId, RelyingPartyId = relyingPartyId,
            ScopesJson = scopesJson, Purpose = purpose,
            ExpiresAt = expiresAt, GrantedAt = DateTime.UtcNow, Status = "ACTIVE",
        });
        await db.SaveChangesAsync();
        return (id, true);
    }

    public async Task<List<ConsentGrant>> GetGrantsByUserAsync(string userId)
    {
        var rows = await db.Database
            .SqlQuery<GrantRow>($"""
                SELECT cg.id, cg.user_id, cg.relying_party_id, cg.scopes_json, cg.purpose,
                       cg.granted_at, cg.expires_at, cg.revoked_at, cg.status, cg.idempotency_key,
                       rp.name AS rp_name, rp.domain AS rp_domain,
                       rp.description AS rp_description, rp.pci_scope AS rp_pci_scope
                FROM consent_grants cg
                JOIN relying_parties rp ON cg.relying_party_id = rp.id
                WHERE cg.user_id = {userId}
                ORDER BY CASE cg.status WHEN 'ACTIVE' THEN 1 WHEN 'REVOKED' THEN 2 ELSE 3 END,
                         cg.granted_at DESC
                """)
            .ToListAsync();

        return rows.Select(r => r.ToModel()).ToList();
    }

    public async Task<ConsentGrant?> GetGrantByIdAsync(string grantId)
    {
        var rows = await db.Database
            .SqlQuery<GrantRow>($"""
                SELECT cg.id, cg.user_id, cg.relying_party_id, cg.scopes_json, cg.purpose,
                       cg.granted_at, cg.expires_at, cg.revoked_at, cg.status, cg.idempotency_key,
                       rp.name AS rp_name, rp.domain AS rp_domain,
                       rp.description AS rp_description, rp.pci_scope AS rp_pci_scope
                FROM consent_grants cg
                JOIN relying_parties rp ON cg.relying_party_id = rp.id
                WHERE cg.id = {grantId}
                """)
            .ToListAsync();

        return rows.FirstOrDefault()?.ToModel();
    }

    public async Task<bool> RevokeGrantAsync(string grantId, string userId)
    {
        var updated = await db.ConsentGrants
            .Where(g => g.Id == grantId && g.UserId == userId && g.Status == "ACTIVE")
            .ExecuteUpdateAsync(s => s
                .SetProperty(g => g.Status, "REVOKED")
                .SetProperty(g => g.RevokedAt, DateTime.UtcNow));
        return updated > 0;
    }

    public async Task<List<ExpiredGrantInfo>> ExpireGrantsAsync()
    {
        var now = DateTime.UtcNow;
        var expired = await db.ConsentGrants
            .Where(g => g.Status == "ACTIVE" && g.ExpiresAt != null && g.ExpiresAt < now)
            .Select(g => new ExpiredGrantInfo(g.Id, g.UserId, g.RelyingPartyId))
            .ToListAsync();

        if (expired.Count > 0)
        {
            var ids = expired.Select(e => e.Id).ToList();
            await db.ConsentGrants
                .Where(g => ids.Contains(g.Id))
                .ExecuteUpdateAsync(s => s.SetProperty(g => g.Status, "EXPIRED"));
        }

        return expired;
    }
}
