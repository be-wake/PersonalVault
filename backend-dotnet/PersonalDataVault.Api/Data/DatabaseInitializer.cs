using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalDataVault.Api.Data.Models;

namespace PersonalDataVault.Api.Data;

/// <summary>
/// Idempotent schema init + seeding.  Mirrors the Node.js db/index.js initSchema()
/// and seedRelyingParties() functions. Safe to run on every startup.
/// </summary>
public class DatabaseInitializer(AppDbContext db, ILogger<DatabaseInitializer> logger)
{
    public async Task InitializeAsync()
    {
        logger.LogInformation("Running database initialisation…");

        // EF Core will create tables that don't exist yet, matching the
        // existing snake_case schema. We use EnsureCreated rather than
        // migrations because the original schema was created by Node.
        await db.Database.EnsureCreatedAsync();

        // Idempotent column additions that the Node backend added via ALTER TABLE.
        await RunMigrationsAsync();

        // Indexes
        await CreateIndexesAsync();

        // Seed relying parties
        await SeedRelyingPartiesAsync();

        logger.LogInformation("Database initialisation complete");
    }

    private async Task RunMigrationsAsync()
    {
        var migrations = new[]
        {
            "ALTER TABLE consent_grants ADD COLUMN IF NOT EXISTS idempotency_key TEXT",
            "ALTER TABLE audit_events   ADD COLUMN IF NOT EXISTS prev_hash TEXT",
            "ALTER TABLE audit_events   ADD COLUMN IF NOT EXISTS hash      TEXT",
            "ALTER TABLE relying_parties ADD COLUMN IF NOT EXISTS client_secret_hash TEXT",
            "ALTER TABLE contacts ADD COLUMN IF NOT EXISTS linkedin_url    TEXT",
            "ALTER TABLE contacts ADD COLUMN IF NOT EXISTS twitter_handle  TEXT",
            "ALTER TABLE contacts ADD COLUMN IF NOT EXISTS website_url     TEXT",
            "ALTER TABLE identity_data DROP CONSTRAINT IF EXISTS identity_data_user_id_key",
            "ALTER TABLE contacts      DROP CONSTRAINT IF EXISTS contacts_user_id_key",
            "ALTER TABLE addresses     ADD COLUMN IF NOT EXISTS name TEXT",
            "ALTER TABLE payment_cards ADD COLUMN IF NOT EXISTS nickname TEXT",
            "ALTER TABLE contacts      ADD COLUMN IF NOT EXISTS name TEXT",
        };

        foreach (var sql in migrations)
        {
            try { await db.Database.ExecuteSqlRawAsync(sql); }
            catch (Exception ex) { logger.LogWarning(ex, "Migration non-fatal: {Sql}", sql); }
        }
    }

    private async Task CreateIndexesAsync()
    {
        var indexes = new[]
        {
            "CREATE INDEX IF NOT EXISTS idx_audit_user_ts  ON audit_events (user_id, ts DESC)",
            "CREATE INDEX IF NOT EXISTS idx_grants_user    ON consent_grants (user_id)",
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_address_current ON addresses (user_id) WHERE is_current = true",
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_consent_idem   ON consent_grants (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL",
            "CREATE INDEX IF NOT EXISTS idx_identity_data_user  ON identity_data (user_id, updated_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_contacts_user       ON contacts (user_id, updated_at DESC)",
        };

        foreach (var sql in indexes)
        {
            try { await db.Database.ExecuteSqlRawAsync(sql); }
            catch (Exception ex) { logger.LogWarning(ex, "Index creation non-fatal: {Sql}", sql); }
        }
    }

    private async Task SeedRelyingPartiesAsync()
    {
        var parties = new[]
        {
            new { Id = "rp-stripe",   Name = "Stripe Payments",  ClientId = "stripe-client-001",
                  Domain = "stripe.com",
                  AllowedScopes = new[] { "payment:card_ref", "identity:name", "identity:email" },
                  PciScope = true,  Description = "Payment processing for online transactions. Requires card details to charge you for purchases." },
            new { Id = "rp-fedex",    Name = "FedEx Shipping",    ClientId = "fedex-client-001",
                  Domain = "fedex.com",
                  AllowedScopes = new[] { "address:current", "identity:name", "contacts:phone" },
                  PciScope = false, Description = "Shipping and delivery service. Needs your address to deliver packages." },
            new { Id = "rp-linkedin", Name = "LinkedIn",          ClientId = "linkedin-client-001",
                  Domain = "linkedin.com",
                  AllowedScopes = new[] { "identity:name", "identity:email", "contacts:phone" },
                  PciScope = false, Description = "Professional networking platform. Uses your name and email for your profile." },
            new { Id = "rp-airbnb",   Name = "Airbnb",            ClientId = "airbnb-client-001",
                  Domain = "airbnb.com",
                  AllowedScopes = new[] { "identity:name", "identity:email", "address:current", "identity:gov_id" },
                  PciScope = false, Description = "Home rental marketplace. Requires identity verification for host and guest trust." },
            new { Id = "rp-amazon",   Name = "Amazon",            ClientId = "amazon-client-001",
                  Domain = "amazon.com",
                  AllowedScopes = new[] { "identity:name", "identity:email", "address:current", "payment:card_ref", "contacts:phone" },
                  PciScope = true,  Description = "E-commerce platform. Needs your address and payment details to fulfill orders." },
        };

        foreach (var p in parties)
        {
            var clientSecret = $"rp_secret_{p.Id.Replace("rp-", "")}_dev";
            var secretHash   = Sha256Hex(clientSecret);

            await db.Database.ExecuteSqlRawAsync(
                @"INSERT INTO relying_parties (id, name, client_id, domain, allowed_scopes, pci_scope, description, client_secret_hash)
                  VALUES ({0},{1},{2},{3},{4}::jsonb,{5},{6},{7})
                  ON CONFLICT (id) DO UPDATE
                    SET client_secret_hash = EXCLUDED.client_secret_hash
                    WHERE relying_parties.client_secret_hash IS NULL",
                p.Id, p.Name, p.ClientId, p.Domain,
                JsonSerializer.Serialize(p.AllowedScopes),
                p.PciScope, p.Description, secretHash);
        }
    }

    private static string Sha256Hex(string input)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
