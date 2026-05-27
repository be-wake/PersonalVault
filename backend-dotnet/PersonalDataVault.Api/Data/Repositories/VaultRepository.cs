using Microsoft.EntityFrameworkCore;
using PersonalDataVault.Api.Data.Models;

namespace PersonalDataVault.Api.Data.Repositories;

public interface IVaultRepository
{
    // Identity — common info (name / DOB / email), one record per user
    Task<IdentityData?> GetCommonIdentityAsync(string userId);
    Task UpsertCommonIdentityAsync(string userId, IdentityData data);

    // Identity — government-issued documents, multiple per user
    Task<List<IdentityData>> GetIdentityDocumentsAsync(string userId);
    Task<string> AddIdentityDocumentAsync(string userId, IdentityData data);
    Task<bool> UpdateIdentityDocumentAsync(string docId, string userId, IdentityData data);
    Task<bool> DeleteIdentityDocumentAsync(string docId, string userId);

    // Address — all named addresses, multiple per user
    Task<List<Address>> GetAllAddressesAsync(string userId);
    Task<string> AddAddressAsync(string userId, Address data);
    Task<bool> UpdateAddressAsync(string addressId, string userId, Address data);
    Task<bool> DeleteAddressAsync(string addressId, string userId);
    Task<bool> SetPrimaryAddressAsync(string addressId, string userId);

    // kept for VaultBundle / scope engine — returns the IsCurrent == true address
    Task<Address?> GetCurrentAddressAsync(string userId);
    Task<List<Address>> GetAddressHistoryAsync(string userId);

    // Payment cards
    Task<List<PaymentCard>> GetPaymentCardsAsync(string userId);
    Task<string> AddPaymentCardAsync(string userId, PaymentCard card);
    Task<bool> RemovePaymentCardAsync(string userId, string cardId);

    // Contacts
    Task<Contact?> GetContactsAsync(string userId);
    Task UpsertContactsAsync(string userId, Contact data);

    // Full vault bundle for RP reads
    Task<VaultBundle> GetVaultBundleAsync(string userId);
}

public record VaultBundle(
    IdentityData? CommonIdentity,
    List<IdentityData> IdentityDocuments,
    Address? Address,
    List<Address> AddressHistory,
    List<PaymentCard> Payment,
    Contact? Contacts);

public class VaultRepository(AppDbContext db) : IVaultRepository
{
    // ── Identity — common info ────────────────────────────────────────────────
    // The "common" record has IdType == null.  It stores name / DOB / email that
    // are identical across every government ID the user registers.

    public Task<IdentityData?> GetCommonIdentityAsync(string userId) =>
        db.IdentityData.FirstOrDefaultAsync(i => i.UserId == userId && i.IdType == null);

    public async Task UpsertCommonIdentityAsync(string userId, IdentityData data)
    {
        var existing = await GetCommonIdentityAsync(userId);
        if (existing is not null)
        {
            if (data.FirstName    is not null) existing.FirstName    = data.FirstName;
            if (data.LastName     is not null) existing.LastName     = data.LastName;
            if (data.EmailPrimary is not null) existing.EmailPrimary = data.EmailPrimary;
            if (data.DateOfBirth  is not null) existing.DateOfBirth  = data.DateOfBirth;
            existing.UpdatedAt = DateTime.UtcNow;
            db.IdentityData.Update(existing);
        }
        else
        {
            data.Id        = Guid.NewGuid().ToString();
            data.UserId    = userId;
            data.IdType    = null;  // explicitly mark as "common" row
            data.IdNumber  = null;
            data.UpdatedAt = DateTime.UtcNow;
            db.IdentityData.Add(data);
        }
        await db.SaveChangesAsync();
    }

    // ── Identity — government documents ──────────────────────────────────────
    // Each document record has IdType set to a non-null value.

    public Task<List<IdentityData>> GetIdentityDocumentsAsync(string userId) =>
        db.IdentityData
          .Where(i => i.UserId == userId && i.IdType != null)
          .OrderBy(i => i.UpdatedAt)
          .ToListAsync();

    public async Task<string> AddIdentityDocumentAsync(string userId, IdentityData data)
    {
        data.Id        = Guid.NewGuid().ToString();
        data.UserId    = userId;
        data.UpdatedAt = DateTime.UtcNow;
        db.IdentityData.Add(data);
        await db.SaveChangesAsync();
        return data.Id;
    }

    public async Task<bool> UpdateIdentityDocumentAsync(string docId, string userId, IdentityData data)
    {
        var existing = await db.IdentityData
            .FirstOrDefaultAsync(i => i.Id == docId && i.UserId == userId && i.IdType != null);
        if (existing is null) return false;
        if (data.IdType   is not null) existing.IdType   = data.IdType;
        if (data.IdNumber is not null) existing.IdNumber = data.IdNumber;
        existing.UpdatedAt = DateTime.UtcNow;
        db.IdentityData.Update(existing);
        await db.SaveChangesAsync();
        return true;
    }

    public async Task<bool> DeleteIdentityDocumentAsync(string docId, string userId)
    {
        var deleted = await db.IdentityData
            .Where(i => i.Id == docId && i.UserId == userId && i.IdType != null)
            .ExecuteDeleteAsync();
        return deleted > 0;
    }

    // ── Address ───────────────────────────────────────────────────────────────
    // Multiple named addresses per user. One is marked IsCurrent = true (primary)
    // which is what the scope engine returns for the address:current scope.

    public Task<List<Address>> GetAllAddressesAsync(string userId) =>
        db.Addresses
          .Where(a => a.UserId == userId)
          .OrderByDescending(a => a.IsCurrent)   // primary first
          .ThenByDescending(a => a.CreatedAt)
          .ToListAsync();

    public async Task<string> AddAddressAsync(string userId, Address data)
    {
        // EnableRetryOnFailure requires all transactions to run inside the execution strategy.
        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync();
            try
            {
                // First address for this user automatically becomes primary
                bool hasExisting = await db.Addresses.AnyAsync(a => a.UserId == userId);
                bool becomePrimary = !hasExisting;

                if (becomePrimary)
                {
                    await db.Addresses
                        .Where(a => a.UserId == userId && a.IsCurrent)
                        .ExecuteUpdateAsync(s => s.SetProperty(a => a.IsCurrent, false));
                }

                data.Id        = Guid.NewGuid().ToString();
                data.UserId    = userId;
                data.IsCurrent = becomePrimary;
                data.CreatedAt = DateTime.UtcNow;
                if (string.IsNullOrEmpty(data.Type)) data.Type = "home";
                db.Addresses.Add(data);
                await db.SaveChangesAsync();
                await tx.CommitAsync();
                return data.Id;
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }
        });
    }

    public async Task<bool> UpdateAddressAsync(string addressId, string userId, Address data)
    {
        var existing = await db.Addresses
            .FirstOrDefaultAsync(a => a.Id == addressId && a.UserId == userId);
        if (existing is null) return false;

        if (data.Type    is not null) existing.Type    = data.Type;
        if (data.Line1   is not null) existing.Line1   = data.Line1;
        if (data.Line2   is not null) existing.Line2   = data.Line2;
        if (data.City    is not null) existing.City    = data.City;
        if (data.State   is not null) existing.State   = data.State;
        if (data.Postal  is not null) existing.Postal  = data.Postal;
        if (data.Country is not null) existing.Country = data.Country;

        await db.SaveChangesAsync();
        return true;
    }

    public async Task<bool> DeleteAddressAsync(string addressId, string userId)
    {
        // EnableRetryOnFailure requires all transactions to run inside the execution strategy.
        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync();
            try
            {
                var address = await db.Addresses
                    .FirstOrDefaultAsync(a => a.Id == addressId && a.UserId == userId);
                if (address is null) { await tx.RollbackAsync(); return false; }

                bool wasPrimary = address.IsCurrent;
                db.Addresses.Remove(address);
                await db.SaveChangesAsync();

                // Promote the most recent remaining address to primary when the primary is deleted
                if (wasPrimary)
                {
                    var next = await db.Addresses
                        .Where(a => a.UserId == userId)
                        .OrderByDescending(a => a.CreatedAt)
                        .FirstOrDefaultAsync();
                    if (next is not null)
                    {
                        next.IsCurrent = true;
                        await db.SaveChangesAsync();
                    }
                }

                await tx.CommitAsync();
                return true;
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }
        });
    }

    public async Task<bool> SetPrimaryAddressAsync(string addressId, string userId)
    {
        // EnableRetryOnFailure requires all transactions to run inside the execution strategy.
        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync();
            try
            {
                var address = await db.Addresses
                    .FirstOrDefaultAsync(a => a.Id == addressId && a.UserId == userId);
                if (address is null) { await tx.RollbackAsync(); return false; }

                // Demote everyone else, then mark this one as primary
                await db.Addresses
                    .Where(a => a.UserId == userId && a.IsCurrent)
                    .ExecuteUpdateAsync(s => s.SetProperty(a => a.IsCurrent, false));

                address.IsCurrent = true;
                await db.SaveChangesAsync();
                await tx.CommitAsync();
                return true;
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }
        });
    }

    // Kept for VaultBundle / scope engine
    public Task<Address?> GetCurrentAddressAsync(string userId) =>
        db.Addresses
          .Where(a => a.UserId == userId && a.IsCurrent)
          .FirstOrDefaultAsync();

    public Task<List<Address>> GetAddressHistoryAsync(string userId) =>
        db.Addresses
          .Where(a => a.UserId == userId)
          .OrderByDescending(a => a.CreatedAt)
          .ToListAsync();

    // ── Payment cards ─────────────────────────────────────────────────────────

    public Task<List<PaymentCard>> GetPaymentCardsAsync(string userId) =>
        db.PaymentCards
          .Where(p => p.UserId == userId)
          .OrderByDescending(p => p.CreatedAt)
          .ToListAsync();

    public async Task<string> AddPaymentCardAsync(string userId, PaymentCard card)
    {
        card.Id = Guid.NewGuid().ToString();
        card.UserId = userId;
        // S12 — stub network token (CSPRNG, not a real PSP token)
        card.CardToken = "STUB_tok_" + Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        card.CreatedAt = DateTime.UtcNow;
        db.PaymentCards.Add(card);
        await db.SaveChangesAsync();
        return card.Id;
    }

    public async Task<bool> RemovePaymentCardAsync(string userId, string cardId)
    {
        var deleted = await db.PaymentCards
            .Where(p => p.Id == cardId && p.UserId == userId)
            .ExecuteDeleteAsync();
        return deleted > 0;
    }

    // ── Contacts ──────────────────────────────────────────────────────────────

    public Task<Contact?> GetContactsAsync(string userId) =>
        db.Contacts.FirstOrDefaultAsync(c => c.UserId == userId);

    public async Task UpsertContactsAsync(string userId, Contact data)
    {
        var existing = await GetContactsAsync(userId);
        if (existing is not null)
        {
            if (data.PhonePrimary   is not null) existing.PhonePrimary   = data.PhonePrimary;
            if (data.PhoneType      is not null) existing.PhoneType      = data.PhoneType;
            if (data.EmailSecondary is not null) existing.EmailSecondary = data.EmailSecondary;
            if (data.LinkedinUrl    is not null) existing.LinkedinUrl    = data.LinkedinUrl;
            if (data.TwitterHandle  is not null) existing.TwitterHandle  = data.TwitterHandle;
            if (data.WebsiteUrl     is not null) existing.WebsiteUrl     = data.WebsiteUrl;
            existing.UpdatedAt = DateTime.UtcNow;
            db.Contacts.Update(existing);
        }
        else
        {
            data.Id = Guid.NewGuid().ToString();
            data.UserId = userId;
            data.UpdatedAt = DateTime.UtcNow;
            db.Contacts.Add(data);
        }
        await db.SaveChangesAsync();
    }

    // ── Bundle ────────────────────────────────────────────────────────────────

    public async Task<VaultBundle> GetVaultBundleAsync(string userId)
    {
        var commonIdentity    = GetCommonIdentityAsync(userId);
        var identityDocuments = GetIdentityDocumentsAsync(userId);
        var currentAddress    = GetCurrentAddressAsync(userId);
        var addressHistory    = GetAddressHistoryAsync(userId);
        var payment           = GetPaymentCardsAsync(userId);
        var contacts          = GetContactsAsync(userId);

        await Task.WhenAll(commonIdentity, identityDocuments, currentAddress,
                           addressHistory, payment, contacts);

        return new VaultBundle(
            commonIdentity.Result,
            identityDocuments.Result,
            currentAddress.Result,
            addressHistory.Result,
            payment.Result,
            contacts.Result);
    }
}

// Helper to await 5 tasks concurrently
file static class TaskExtensions
{
    public static async Task<(T1, T2, T3, T4)> WhenAll<T1, T2, T3, T4>(
        this (Task<T1>, Task<T2>, Task<T3>, Task<T4>) tasks)
    {
        await Task.WhenAll(tasks.Item1, tasks.Item2, tasks.Item3, tasks.Item4);
        return (tasks.Item1.Result, tasks.Item2.Result, tasks.Item3.Result, tasks.Item4.Result);
    }

    public static async Task<(T1, T2, T3, T4, T5)> WhenAll<T1, T2, T3, T4, T5>(
        this (Task<T1>, Task<T2>, Task<T3>, Task<T4>, Task<T5>) tasks)
    {
        await Task.WhenAll(tasks.Item1, tasks.Item2, tasks.Item3, tasks.Item4, tasks.Item5);
        return (tasks.Item1.Result, tasks.Item2.Result, tasks.Item3.Result, tasks.Item4.Result, tasks.Item5.Result);
    }
}
