using System.Security.Cryptography;
using System.Text;
using Azure.Identity;
using Azure.Security.KeyVault.Secrets;

namespace PersonalDataVault.Api.Services;

/// <summary>
/// Field-level AES-256-GCM encryption.
///
/// Wire format (identical to the Node.js backend):
///   v1:&lt;iv-base64&gt;:&lt;authTag-base64&gt;:&lt;ciphertext-base64&gt;
///
/// KEK loading order:
///   1. Azure Key Vault secret PDV-FIELD-KEK (when AZURE_KEY_VAULT_URL is set)
///   2. PDV_FIELD_KEK_BASE64 env var
///   3. Ephemeral random key (dev only — data won't survive a restart)
/// </summary>
public interface ICryptoService
{
    Task InitAsync();
    string? Encrypt(string? plaintext);
    string? Decrypt(string? payload);
    string Sha256Hex(string input);
    string HmacSha256Hex(string secret, string body);
}

public class CryptoService(IConfiguration config, ILogger<CryptoService> logger) : ICryptoService
{
    private const string Version = "v1";
    private const int IvBytes    = 12;
    private const int TagBytes   = 16;
    private byte[]? _masterKey;
    private readonly bool _isProd = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Production";

    public async Task InitAsync()
    {
        if (_masterKey is not null) return;

        // 1. Azure Key Vault
        var kvUrl = Environment.GetEnvironmentVariable("AZURE_KEY_VAULT_URL") ?? config["AZURE_KEY_VAULT_URL"];
        if (!string.IsNullOrEmpty(kvUrl))
        {
            try
            {
                var client = new SecretClient(new Uri(kvUrl), new DefaultAzureCredential());
                var secret = await client.GetSecretAsync("PDV-FIELD-KEK");
                if (secret.Value?.Value is not null)
                {
                    _masterKey = Convert.FromBase64String(secret.Value.Value);
                    if (_masterKey.Length != 32) throw new InvalidOperationException("PDV-FIELD-KEK in Key Vault is not 32 bytes.");
                    logger.LogInformation("Field KEK loaded from Azure Key Vault");
                    return;
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to load field KEK from Key Vault — will fall back to env var");
            }
        }

        // 2. Env var
        var envKey = Environment.GetEnvironmentVariable("PDV_FIELD_KEK_BASE64") ?? config["PDV_FIELD_KEK_BASE64"];
        if (!string.IsNullOrEmpty(envKey))
        {
            _masterKey = Convert.FromBase64String(envKey);
            if (_masterKey.Length != 32)
                throw new InvalidOperationException("PDV_FIELD_KEK_BASE64 is not 32 bytes after base64 decode.");
            logger.LogInformation("Field KEK loaded from PDV_FIELD_KEK_BASE64");
            return;
        }

        // 3. Ephemeral fallback (dev only)
        if (_isProd)
            throw new InvalidOperationException("No field KEK configured — refusing to start in production.");

        _masterKey = RandomNumberGenerator.GetBytes(32);
        logger.LogWarning("Generated ephemeral field KEK — encrypted data WILL NOT survive a restart");
    }

    public string? Encrypt(string? plaintext)
    {
        if (string.IsNullOrEmpty(plaintext)) return plaintext;
        if (_masterKey is null) throw new InvalidOperationException("CryptoService.InitAsync() must be called before Encrypt().");

        var iv  = RandomNumberGenerator.GetBytes(IvBytes);
        var tag = new byte[TagBytes];
        var pt  = Encoding.UTF8.GetBytes(plaintext);
        var ct  = new byte[pt.Length];

        using var aes = new AesGcm(_masterKey, TagBytes);
        aes.Encrypt(iv, pt, ct, tag);

        return $"{Version}:{Convert.ToBase64String(iv)}:{Convert.ToBase64String(tag)}:{Convert.ToBase64String(ct)}";
    }

    public string? Decrypt(string? payload)
    {
        if (string.IsNullOrEmpty(payload)) return payload;

        // Tolerate legacy plaintext values (pre-encryption) so reads don't crash
        if (!payload.StartsWith($"{Version}:", StringComparison.Ordinal)) return payload;
        if (_masterKey is null) throw new InvalidOperationException("CryptoService.InitAsync() must be called before Decrypt().");

        var parts = payload.Split(':');
        if (parts.Length != 4) return payload; // malformed — return raw

        var iv  = Convert.FromBase64String(parts[1]);
        var tag = Convert.FromBase64String(parts[2]);
        var ct  = Convert.FromBase64String(parts[3]);
        var pt  = new byte[ct.Length];

        using var aes = new AesGcm(_masterKey, TagBytes);
        aes.Decrypt(iv, ct, tag, pt);

        return Encoding.UTF8.GetString(pt);
    }

    public string Sha256Hex(string input)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    public string HmacSha256Hex(string secret, string body)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(body));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
