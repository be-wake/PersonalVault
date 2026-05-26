using PersonalDataVault.Api.Data.Models;
using PersonalDataVault.Api.Data.Repositories;

namespace PersonalDataVault.Api.Services;

/// <summary>
/// Scope policy engine + response masking.
/// Mirrors the Node.js lib/scopeEngine.js behaviour exactly.
/// </summary>
public interface IScopeEngineService
{
    bool IsKnown(string scope);
    (List<string> Allowed, List<DeniedScope> Denied) PartitionByRpAllowlist(List<string> requested, List<string> rpAllowedScopes);
    Dictionary<string, object?> ProjectForScopes(VaultBundle bundle, List<string> grantedScopes);
}

public record DeniedScope(string Scope, string Reason);

public class ScopeEngineService(ICryptoService crypto) : IScopeEngineService
{
    private sealed record ScopeDef(string Resource, string[] Fields, string Mask, bool Pci);

    private static readonly Dictionary<string, ScopeDef> Scopes = new()
    {
        ["identity:name"]    = new("identity",  ["first_name", "last_name"],                                       "NONE",    false),
        ["identity:email"]   = new("identity",  ["email_primary"],                                                 "NONE",    false),
        ["identity:dob"]     = new("identity",  ["date_of_birth"],                                                 "PARTIAL", false),
        ["identity:gov_id"]  = new("identity",  ["id_type", "id_number"],                                         "PARTIAL", false),
        ["address:current"]  = new("address",   ["line1", "line2", "city", "state", "postal", "country"],         "NONE",    false),
        ["address:history"]  = new("address_history", ["line1", "line2", "city", "state", "postal", "country"],   "NONE",    false),
        ["payment:card_ref"] = new("payment",   ["card_token", "card_type", "last_4", "expiry_mm_yy"],            "NONE",    true),
        ["contacts:phone"]   = new("contacts",  ["phone_primary", "phone_type"],                                  "PARTIAL", false),
        ["contacts:all"]     = new("contacts",  ["phone_primary", "phone_type", "email_secondary"],               "NONE",    false),
    };

    public bool IsKnown(string scope) => Scopes.ContainsKey(scope);

    public (List<string> Allowed, List<DeniedScope> Denied) PartitionByRpAllowlist(
        List<string> requested, List<string> rpAllowedScopes)
    {
        var allowSet = new HashSet<string>(rpAllowedScopes);
        var allowed  = new List<string>();
        var denied   = new List<DeniedScope>();

        foreach (var s in requested)
        {
            if (!IsKnown(s))          denied.Add(new DeniedScope(s, "unknown"));
            else if (!allowSet.Contains(s)) denied.Add(new DeniedScope(s, "not_permitted_for_rp"));
            else                            allowed.Add(s);
        }
        return (allowed, denied);
    }

    public Dictionary<string, object?> ProjectForScopes(VaultBundle bundle, List<string> grantedScopes)
    {
        // Build a flat dictionary of resource → row(s) from the bundle
        var data = BuildDataMap(bundle);
        var out_ = new Dictionary<string, object?>();

        foreach (var scope in grantedScopes)
        {
            if (!Scopes.TryGetValue(scope, out var def)) continue;
            if (!data.TryGetValue(def.Resource, out var src) || src is null) continue;

            if (src is List<Dictionary<string, object?>> list)
            {
                out_[def.Resource] = list.Select(row => ProjectRow(row, def.Fields, def.Mask)).ToList();
            }
            else if (src is Dictionary<string, object?> dict)
            {
                var projected = ProjectRow(dict, def.Fields, def.Mask);
                if (!out_.ContainsKey(def.Resource))
                    out_[def.Resource] = new Dictionary<string, object?>();
                foreach (var kv in projected)
                    ((Dictionary<string, object?>)out_[def.Resource]!)[kv.Key] = kv.Value;
            }
        }
        return out_;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private static Dictionary<string, object?> BuildDataMap(VaultBundle bundle)
    {
        var map = new Dictionary<string, object?>();

        if (bundle.Identity is not null)
            map["identity"] = ModelToDict(bundle.Identity);

        if (bundle.Address is not null)
            map["address"] = ModelToDict(bundle.Address);

        if (bundle.Payment.Count > 0)
            map["payment"] = bundle.Payment.Select(ModelToDict).ToList();

        if (bundle.Contacts is not null)
            map["contacts"] = ModelToDict(bundle.Contacts);

        return map;
    }

    private static Dictionary<string, object?> ModelToDict(object model) =>
        model.GetType()
             .GetProperties()
             .ToDictionary(
                 p => ToSnakeCase(p.Name),
                 p => p.GetValue(model));

    private Dictionary<string, object?> ProjectRow(Dictionary<string, object?> row, string[] fields, string mask)
    {
        var projected = new Dictionary<string, object?>();
        foreach (var f in fields)
        {
            if (!row.TryGetValue(f, out var value)) continue;
            projected[f] = ApplyMask(mask, f, value);
        }
        return projected;
    }

    private object? ApplyMask(string mask, string field, object? value) => mask switch
    {
        "NONE"    => value,
        "PARTIAL" => PartialMask(field, value?.ToString()),
        "FULL"    => new { present = value is not null && !string.IsNullOrEmpty(value.ToString()) },
        "HASH"    => value is not null ? crypto.Sha256Hex(value.ToString()!) : null,
        _         => value,
    };

    private static string? PartialMask(string field, string? value)
    {
        if (string.IsNullOrEmpty(value)) return value;
        return field switch
        {
            "date_of_birth"  => value.Length >= 4 ? $"{value[..4]}-**-**" : "****",
            "id_number"      => $"{"*".PadRight(Math.Max(0, value.Length - 4), '*')}{value[^Math.Min(4, value.Length)..]}",
            "phone_primary"  => $"****{new string(value.Where(char.IsDigit).TakeLast(4).ToArray())}",
            "email_primary" or "email_secondary" => MaskEmail(value),
            _ => value.Length <= 2 ? new string('*', value.Length)
                                   : $"{value[0]}{new string('*', value.Length - 2)}{value[^1]}",
        };
    }

    private static string MaskEmail(string email)
    {
        var at = email.IndexOf('@');
        if (at < 0) return "***";
        var local  = email[..at];
        var domain = email[(at + 1)..];
        return $"{local[..1]}{new string('*', Math.Max(0, local.Length - 1))}@{domain}";
    }

    private static string ToSnakeCase(string pascal)
    {
        var sb = new System.Text.StringBuilder();
        foreach (var c in pascal)
        {
            if (char.IsUpper(c) && sb.Length > 0) sb.Append('_');
            sb.Append(char.ToLower(c));
        }
        return sb.ToString();
    }
}
