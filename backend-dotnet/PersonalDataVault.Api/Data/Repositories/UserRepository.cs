using Microsoft.EntityFrameworkCore;
using PersonalDataVault.Api.Data.Models;

namespace PersonalDataVault.Api.Data.Repositories;

public interface IUserRepository
{
    Task<string> CreateUserAsync(string email, string passwordHash, string name);
    Task<User?> FindByEmailAsync(string email);
    Task<User?> FindByIdAsync(string id);
}

public class UserRepository(AppDbContext db) : IUserRepository
{
    public async Task<string> CreateUserAsync(string email, string passwordHash, string name)
    {
        var id = Guid.NewGuid().ToString();

        await using var tx = await db.Database.BeginTransactionAsync();
        try
        {
            db.Users.Add(new User { Id = id, Email = email, PasswordHash = passwordHash, Name = name, CreatedAt = DateTime.UtcNow });
            await db.SaveChangesAsync();

            // Create empty vault rows so reads always return a row, not 404
            db.IdentityData.Add(new IdentityData { Id = Guid.NewGuid().ToString(), UserId = id, EmailPrimary = email, UpdatedAt = DateTime.UtcNow });
            db.Contacts.Add(new Contact { Id = Guid.NewGuid().ToString(), UserId = id, UpdatedAt = DateTime.UtcNow });
            await db.SaveChangesAsync();

            await tx.CommitAsync();
            return id;
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }
    }

    public Task<User?> FindByEmailAsync(string email) =>
        db.Users.FirstOrDefaultAsync(u => u.Email == email);

    public Task<User?> FindByIdAsync(string id) =>
        db.Users
          .Where(u => u.Id == id)
          .Select(u => new User { Id = u.Id, Email = u.Email, Name = u.Name, CreatedAt = u.CreatedAt, PasswordHash = string.Empty })
          .FirstOrDefaultAsync();
}
