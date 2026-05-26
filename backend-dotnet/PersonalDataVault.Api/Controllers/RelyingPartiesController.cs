using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PersonalDataVault.Api.Data.Repositories;
using PersonalDataVault.Api.Models;

namespace PersonalDataVault.Api.Controllers;

[ApiController]
[Route("v1/relying-parties")]
[Authorize]
public class RelyingPartiesController(IRelyingPartyRepository relyingParties) : ControllerBase
{
    private string RequestId => HttpContext.Items["RequestId"]?.ToString() ?? "unknown";

    // ── GET /v1/relying-parties ───────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var parties = await relyingParties.GetAllAsync();
        return Ok(new { relyingParties = parties.Select(RpDto) });
    }

    // ── GET /v1/relying-parties/:id ───────────────────────────────────────────

    [HttpGet("{id}")]
    public async Task<IActionResult> GetOne(string id)
    {
        var rp = await relyingParties.GetByIdAsync(id);
        if (rp is null) return NotFound(ApiError.NotFound("Relying party not found.", RequestId));
        return Ok(new { relyingParty = RpDto(rp) });
    }

    private static object RpDto(Data.Models.RelyingParty rp) => new
    {
        rp.Id, rp.Name, rp.ClientId, rp.Domain,
        rp.Description, rp.WebhookUrl,
        PciScope     = rp.PciScope,
        AllowedScopes = rp.AllowedScopesList,
    };
}
