using Microsoft.EntityFrameworkCore;
using PersonalDataVault.Api.Data.Models;

namespace PersonalDataVault.Api.Data.Repositories;

public interface IRefreshTokenRepository
{
    /// <summary>Records a newly issued refresh token (active).</summary>
    Task StoreAsync(string jti, string userId, DateTime expiresAt);

    /// <summary>Returns the stored record for a jti, or null if never issued / already purged.</summary>
    Task<RefreshToken?> GetAsync(string jti);

    /// <summary>
    /// Atomically rotates a refresh token: marks <paramref name="oldJti"/> revoked
    /// (pointing at its successor) and inserts the new active record.
    /// </summary>
    Task RotateAsync(string oldJti, string newJti, string userId, DateTime newExpiresAt);

    /// <summary>Revokes a single refresh token (e.g. on logout). No-op if unknown.</summary>
    Task RevokeAsync(string jti);

    /// <summary>Revokes every active refresh token for a user (reuse/theft response).</summary>
    Task RevokeAllForUserAsync(string userId);
}

public class RefreshTokenRepository(AppDbContext db) : IRefreshTokenRepository
{
    public async Task StoreAsync(string jti, string userId, DateTime expiresAt)
    {
        db.RefreshTokens.Add(new RefreshToken
        {
            Id        = jti,
            UserId    = userId,
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = expiresAt,
        });
        await db.SaveChangesAsync();
    }

    public Task<RefreshToken?> GetAsync(string jti) =>
        db.RefreshTokens.AsNoTracking().FirstOrDefaultAsync(t => t.Id == jti);

    public async Task RotateAsync(string oldJti, string newJti, string userId, DateTime newExpiresAt)
    {
        // EnableRetryOnFailure requires all transactions to run inside the execution strategy.
        await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync();
            try
            {
                await db.RefreshTokens
                    .Where(t => t.Id == oldJti && t.RevokedAt == null)
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(t => t.RevokedAt, DateTime.UtcNow)
                        .SetProperty(t => t.ReplacedByJti, newJti));

                db.RefreshTokens.Add(new RefreshToken
                {
                    Id        = newJti,
                    UserId    = userId,
                    CreatedAt = DateTime.UtcNow,
                    ExpiresAt = newExpiresAt,
                });
                await db.SaveChangesAsync();
                await tx.CommitAsync();
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }
        });
    }

    public async Task RevokeAsync(string jti)
    {
        await db.RefreshTokens
            .Where(t => t.Id == jti && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, DateTime.UtcNow));
    }

    public async Task RevokeAllForUserAsync(string userId)
    {
        await db.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, DateTime.UtcNow));
    }
}
