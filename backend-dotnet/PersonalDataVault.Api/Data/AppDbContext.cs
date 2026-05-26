using Microsoft.EntityFrameworkCore;
using PersonalDataVault.Api.Data.Models;

namespace PersonalDataVault.Api.Data;

/// <summary>
/// EF Core context. Table and column names are converted to snake_case in
/// <see cref="OnModelCreating"/> so the .NET model maps transparently to the
/// PostgreSQL schema created by the original Node.js backend without relying
/// on the EFCore.NamingConventions external package.
/// </summary>
public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users { get; set; } = null!;
    public DbSet<IdentityData> IdentityData { get; set; } = null!;
    public DbSet<Address> Addresses { get; set; } = null!;
    public DbSet<PaymentCard> PaymentCards { get; set; } = null!;
    public DbSet<Contact> Contacts { get; set; } = null!;
    public DbSet<RelyingParty> RelyingParties { get; set; } = null!;
    public DbSet<ConsentGrant> ConsentGrants { get; set; } = null!;
    public DbSet<AuditEvent> AuditEvents { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Users
        modelBuilder.Entity<User>(e =>
        {
            e.HasKey(u => u.Id);
            e.HasIndex(u => u.Email).IsUnique();
        });

        // IdentityData — one-to-many (multi-record vault support)
        modelBuilder.Entity<IdentityData>(e =>
        {
            e.HasKey(i => i.Id);
            e.HasOne<User>().WithMany().HasForeignKey(i => i.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // Addresses
        modelBuilder.Entity<Address>(e =>
        {
            e.HasKey(a => a.Id);
            e.HasOne<User>().WithMany().HasForeignKey(a => a.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // PaymentCards
        modelBuilder.Entity<PaymentCard>(e =>
        {
            e.HasKey(p => p.Id);
            e.HasOne<User>().WithMany().HasForeignKey(p => p.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // Contacts — one-to-many (multi-record vault support)
        modelBuilder.Entity<Contact>(e =>
        {
            e.HasKey(c => c.Id);
            e.HasOne<User>().WithMany().HasForeignKey(c => c.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // RelyingParties
        modelBuilder.Entity<RelyingParty>(e =>
        {
            e.HasKey(r => r.Id);
            e.HasIndex(r => r.ClientId).IsUnique();
            e.Ignore(r => r.AllowedScopesList);  // computed property
        });

        // ConsentGrants
        modelBuilder.Entity<ConsentGrant>(e =>
        {
            e.HasKey(g => g.Id);
            e.HasOne<User>().WithMany().HasForeignKey(g => g.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<RelyingParty>().WithMany().HasForeignKey(g => g.RelyingPartyId);
            // Joined columns not mapped as navigation — they come from raw SQL
            e.Ignore(g => g.RpName);
            e.Ignore(g => g.RpDomain);
            e.Ignore(g => g.RpDescription);
            e.Ignore(g => g.RpPciScope);
            e.Ignore(g => g.Scopes);
        });

        // AuditEvents — user_id is NOT a FK in the original schema (intentional, so erasure
        // deletes the user without cascading to the audit log — audit is deleted separately).
        // RelyingPartyId / RpName / RpDomain are JOIN-projected properties; Ignore() so EF
        // doesn't try to create columns for them. They're populated via Database.SqlQuery<T>.
        modelBuilder.Entity<AuditEvent>(e =>
        {
            e.HasKey(a => a.Id);
            e.Ignore(a => a.RelyingPartyId);
            e.Ignore(a => a.RpName);
            e.Ignore(a => a.RpDomain);
        });

        // ── Apply snake_case naming ────────────────────────────────────────────
        // Converts all table and column names to snake_case so the EF model
        // matches the PostgreSQL schema created by the original Node.js backend.
        // This replaces the EFCore.NamingConventions external package.
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            if (entityType.GetTableName() is string tableName)
                entityType.SetTableName(ToSnakeCase(tableName));

            foreach (var property in entityType.GetProperties())
                property.SetColumnName(ToSnakeCase(property.Name));
        }
    }

    /// <summary>
    /// Converts PascalCase or camelCase to snake_case.
    /// Handles letter→digit and digit→letter boundaries (e.g. Last4 → last_4).
    /// </summary>
    private static string ToSnakeCase(string name)
    {
        var sb = new System.Text.StringBuilder(name.Length + 4);
        for (var i = 0; i < name.Length; i++)
        {
            var c    = name[i];
            var prev = i > 0 ? name[i - 1] : '\0';
            if (i > 0 && (char.IsUpper(c) ||
                          (char.IsDigit(c) && char.IsLetter(prev)) ||
                          (char.IsLetter(c) && char.IsDigit(prev))))
                sb.Append('_');
            sb.Append(char.ToLower(c));
        }
        return sb.ToString();
    }
}
