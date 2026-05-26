using Microsoft.EntityFrameworkCore;
using PersonalDataVault.Api.Data.Models;

namespace PersonalDataVault.Api.Data.Repositories;

public interface IVaultRepository
{
    // Identity
    Task<IdentityData?> GetIdentityAsync(string userId);
    Task UpsertIdentityAsync(string userId, IdentityData data);

    // Address
    Task<Address?> GetCurrentAddressAsync(string userId);
    Task<List<Address>> GetAddressHistoryAsync(string userId);
    Task UpsertAddressAsync(string userId, Address data);

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
    IdentityData? Identity,
    Address? Address,
    List<Address> AddressHistory,
    List<PaymentCard> Payment,
    Contact? Contacts);

public class VaultRepository(AppDbContext db) : IVaultRepository
{
    // ── Identity ──────────────────────────────────────────────────────────────

    public Task<IdentityData?> GetIdentityAsync(string userId) =>
        db.IdentityData.FirstOrDefaultAsync(i => i.UserId == userId);

    public async Task UpsertIdentityAsync(string userId, IdentityData data)
    {
        var existing = await GetIdentityAsync(userId);
        if (existing is not null)
        {
            if (data.FirstName  is not null) existing.FirstName  = data.FirstName;
            if (data.LastName   is not null) existing.LastName   = data.LastName;
            if (data.EmailPrimary is not null) existing.EmailPrimary = data.EmailPrimary;
            if (data.DateOfBirth is not null) existing.DateOfBirth = data.DateOfBirth;
            if (data.IdType     is not null) existing.IdType     = data.IdType;
            if (data.IdNumber   is not null) existing.IdNumber   = data.IdNumber;
            existing.UpdatedAt = DateTime.UtcNow;
            db.IdentityData.Update(existing);
        }
        else
        {
            data.Id = Guid.NewGuid().ToString();
            data.UserId = userId;
            data.UpdatedAt = DateTime.UtcNow;
            db.IdentityData.Add(data);
        }
        await db.SaveChangesAsync();
    }

    // ── Address ───────────────────────────────────────────────────────────────

    public Task<Address?> GetCurrentAddressAsync(string userId) =>
        db.Addresses
          .Where(a => a.UserId == userId && a.IsCurrent)
          .OrderByDescending(a => a.CreatedAt)
          .FirstOrDefaultAsync();

    public Task<List<Address>> GetAddressHistoryAsync(string userId) =>
        db.Addresses
          .Where(a => a.UserId == userId)
          .OrderByDescending(a => a.CreatedAt)
          .ToListAsync();

    public async Task UpsertAddressAsync(string userId, Address data)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        try
        {
            // Archive previous current address
            await db.Addresses
                .Where(a => a.UserId == userId && a.IsCurrent)
                .ExecuteUpdateAsync(s => s.SetProperty(a => a.IsCurrent, false));

            data.Id = Guid.NewGuid().ToString();
            data.UserId = userId;
            data.IsCurrent = true;
            data.CreatedAt = DateTime.UtcNow;
            if (string.IsNullOrEmpty(data.Type)) data.Type = "current";
            db.Addresses.Add(data);
            await db.SaveChangesAsync();
            await tx.CommitAsync();
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }
    }

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
        var (identity, currentAddress, addressHistory, payment, contacts) = await (
            GetIdentityAsync(userId),
            GetCurrentAddressAsync(userId),
            GetAddressHistoryAsync(userId),
            GetPaymentCardsAsync(userId),
            GetContactsAsync(userId)
        ).WhenAll();

        return new VaultBundle(identity, currentAddress, addressHistory, payment, contacts);
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
