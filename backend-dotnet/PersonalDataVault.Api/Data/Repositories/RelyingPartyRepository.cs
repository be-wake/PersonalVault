using Microsoft.EntityFrameworkCore;
using PersonalDataVault.Api.Data.Models;

namespace PersonalDataVault.Api.Data.Repositories;

public interface IRelyingPartyRepository
{
    Task<List<RelyingParty>> GetAllAsync();
    Task<RelyingParty?> GetByIdAsync(string id);
    Task<RelyingParty?> FindByClientIdAsync(string clientId);
}

public class RelyingPartyRepository(AppDbContext db) : IRelyingPartyRepository
{
    public Task<List<RelyingParty>> GetAllAsync() =>
        db.RelyingParties.OrderBy(r => r.Name).ToListAsync();

    public Task<RelyingParty?> GetByIdAsync(string id) =>
        db.RelyingParties.FirstOrDefaultAsync(r => r.Id == id);

    public Task<RelyingParty?> FindByClientIdAsync(string clientId) =>
        db.RelyingParties.FirstOrDefaultAsync(r => r.ClientId == clientId);
}
