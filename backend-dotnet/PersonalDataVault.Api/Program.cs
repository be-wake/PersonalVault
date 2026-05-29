// Application composition root: configures logging, auth, rate limiting, CORS,
// EF Core/Postgres, DI registrations, the middleware pipeline, and WebSockets,
// then runs database initialisation before starting the host.
using System.Security.Claims;
using System.Text;
using Azure.Identity;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using PersonalDataVault.Api.Data;
using PersonalDataVault.Api.Data.Repositories;
using PersonalDataVault.Api.Middleware;
using PersonalDataVault.Api.Services;
using Serilog;
using Serilog.Events;
using Serilog.Formatting.Compact;

// ── Serilog bootstrap ─────────────────────────────────────────────────────────
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console(new CompactJsonFormatter())
    .CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);
    var isDev = builder.Environment.IsDevelopment();

    // ── Serilog ───────────────────────────────────────────────────────────────
    builder.Host.UseSerilog((ctx, services, cfg) =>
    {
        cfg.ReadFrom.Configuration(ctx.Configuration)
           .ReadFrom.Services(services)
           .Enrich.FromLogContext()
           .Enrich.WithProperty("service", "personal-data-vault-api");

        if (isDev)
            // Human-readable output for local development
            cfg.WriteTo.Console(
                outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {SourceContext:l}: {Message:lj}{NewLine}{Exception}");
        else
            // Structured JSON for production (Azure Monitor / log aggregators)
            cfg.WriteTo.Console(new CompactJsonFormatter());
    });

    // ── Azure Key Vault (optional — loads secrets into IConfiguration) ─────────
    var kvUrl = Environment.GetEnvironmentVariable("AZURE_KEY_VAULT_URL")
                ?? builder.Configuration["AZURE_KEY_VAULT_URL"];
    if (!string.IsNullOrEmpty(kvUrl))
    {
        builder.Configuration.AddAzureKeyVault(new Uri(kvUrl), new DefaultAzureCredential());
        Log.Information("Azure Key Vault configuration loaded from {Url}", kvUrl);
    }

    // ── Database ──────────────────────────────────────────────────────────────
    var connStr = Environment.GetEnvironmentVariable("DATABASE_URL")
                  ?? builder.Configuration["DATABASE_URL"]
                  ?? throw new InvalidOperationException("DATABASE_URL is required.");

    // Convert postgresql:// URI → Npgsql key=value string.
    // Azure Database for PostgreSQL supplies DATABASE_URL as a URI; Npgsql 8+
    // only accepts key=value. Also skips bare query params like ?sslmode (no
    // =value) which previously caused KeyNotFoundException inside Npgsql.
    if (connStr.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase) ||
        connStr.StartsWith("postgres://",   StringComparison.OrdinalIgnoreCase))
    {
        var uri = new Uri(connStr);
        var sb  = new System.Text.StringBuilder();
        sb.Append("Host=").Append(uri.Host);
        if (uri.Port > 0) sb.Append(";Port=").Append(uri.Port);
        var dbName = uri.AbsolutePath.TrimStart('/');
        if (!string.IsNullOrEmpty(dbName)) sb.Append(";Database=").Append(dbName);
        if (!string.IsNullOrEmpty(uri.UserInfo))
        {
            var colon = uri.UserInfo.IndexOf(':');
            if (colon < 0)
                sb.Append(";Username=").Append(Uri.UnescapeDataString(uri.UserInfo));
            else
            {
                sb.Append(";Username=").Append(Uri.UnescapeDataString(uri.UserInfo[..colon]));
                sb.Append(";Password=").Append(Uri.UnescapeDataString(uri.UserInfo[(colon + 1)..]));
            }
        }
        foreach (var pair in uri.Query.TrimStart('?')
                                 .Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var eq = pair.IndexOf('=');
            if (eq < 0) continue;   // bare key with no value — skip
            var k = Uri.UnescapeDataString(pair[..eq]);
            var v = Uri.UnescapeDataString(pair[(eq + 1)..]);
            if (string.IsNullOrEmpty(v)) continue;
            if (k.Equals("sslmode", StringComparison.OrdinalIgnoreCase))
            {
                var mode = v.ToLowerInvariant() switch
                {
                    "disable"     => "Disable",
                    "allow"       => "Allow",
                    "prefer"      => "Prefer",
                    "require"     => "Require",
                    "verify-ca"   => "VerifyCA",
                    "verify-full" => "VerifyFull",
                    _             => null,
                };
                if (mode is not null) sb.Append(";SSL Mode=").Append(mode);
            }
        }
        connStr = sb.ToString();
    }

    builder.Services.AddDbContext<AppDbContext>(opt =>
        opt.UseNpgsql(connStr,
                npg => npg.CommandTimeout(30)
                          .EnableRetryOnFailure(3, TimeSpan.FromSeconds(5), null)));

    builder.Services.AddTransient<DatabaseInitializer>();

    // ── Repositories ──────────────────────────────────────────────────────────
    builder.Services.AddScoped<IUserRepository,         UserRepository>();
    builder.Services.AddScoped<IVaultRepository,        VaultRepository>();
    builder.Services.AddScoped<IConsentRepository,      ConsentRepository>();
    builder.Services.AddScoped<IAuditRepository,        AuditRepository>();
    builder.Services.AddScoped<IRelyingPartyRepository, RelyingPartyRepository>();
    builder.Services.AddScoped<IRefreshTokenRepository, RefreshTokenRepository>();

    // ── Services ──────────────────────────────────────────────────────────────
    builder.Services.AddSingleton<ITokenService,          TokenService>();
    builder.Services.AddSingleton<ICryptoService,         CryptoService>();
    builder.Services.AddSingleton<IRevocationCacheService, RevocationCacheService>();
    builder.Services.AddSingleton<IServiceBusService,     ServiceBusService>();
    builder.Services.AddSingleton<IScopeEngineService,    ScopeEngineService>();
    builder.Services.AddSingleton<IWebhookService,        WebhookService>();

    // WebSocket connection manager (also runs as IHostedService for heartbeat)
    builder.Services.AddSingleton<WebSocketConnectionManager>();
    builder.Services.AddSingleton<IWebSocketConnectionManager>(
        sp => sp.GetRequiredService<WebSocketConnectionManager>());
    builder.Services.AddHostedService(
        sp => sp.GetRequiredService<WebSocketConnectionManager>());

    // ── Background services ───────────────────────────────────────────────────
    builder.Services.AddHostedService<ConsentExpiryBackgroundService>();

    // ── HTTP client for webhook delivery ─────────────────────────────────────
    builder.Services.AddHttpClient("webhook", c =>
    {
        c.DefaultRequestHeaders.Add("User-Agent", "PersonalDataVault/1.0");
        c.Timeout = TimeSpan.FromSeconds(15);
    })
    // Disable auto-redirects: an RP-controlled endpoint could 302 to an internal
    // address (cloud metadata, loopback) and defeat the pre-send SSRF URL check.
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });

    // ── Authentication ────────────────────────────────────────────────────────
    // Resolve the access-token signing secret ONCE so the JwtBearer middleware and
    // TokenService share the exact same key. Outside development we fail fast on a
    // missing/weak/placeholder secret; in development we generate a single ephemeral
    // secret and write it back into configuration so TokenService reads the same one
    // (never two independent random keys, which would reject every issued token).
    var jwtSecret = Environment.GetEnvironmentVariable("JWT_SECRET")
                    ?? builder.Configuration["JWT_SECRET"];

    if (string.IsNullOrEmpty(jwtSecret) || jwtSecret.Length < 16 ||
        jwtSecret.Contains("change-me", StringComparison.OrdinalIgnoreCase))
    {
        if (!isDev)
            throw new InvalidOperationException(
                "JWT_SECRET is missing, too short (< 16 chars), or set to a placeholder — refusing to start.");

        jwtSecret = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(48));
        builder.Configuration["JWT_SECRET"] = jwtSecret;   // share with TokenService
        Log.Warning("JWT_SECRET not configured — generated an ephemeral dev secret (tokens reset on restart)");
    }

    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(opt =>
        {
            opt.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer           = false,
                ValidateAudience         = false,
                ValidateLifetime         = true,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
                ClockSkew                = TimeSpan.Zero,
                NameClaimType            = "sub",
            };
            // Support both httpOnly cookie (web) and Bearer header (mobile)
            opt.Events = new JwtBearerEvents
            {
                OnMessageReceived = ctx =>
                {
                    var cookie = ctx.Request.Cookies["pdv_session"];
                    if (!string.IsNullOrEmpty(cookie))
                        ctx.Token = cookie;
                    return Task.CompletedTask;
                },
            };
            opt.MapInboundClaims = false;
        });

    builder.Services.AddAuthorization();

    // ── Rate limiting ─────────────────────────────────────────────────────────
    builder.Services.AddRateLimiter(opt =>
    {
        opt.RejectionStatusCode = 429;

        opt.AddFixedWindowLimiter("auth", o =>
        {
            o.Window      = TimeSpan.FromSeconds(builder.Configuration.GetValue<int>("RateLimit:Auth:WindowSeconds", 900));
            o.PermitLimit = builder.Configuration.GetValue<int>("RateLimit:Auth:MaxRequests", 10);
            o.QueueLimit  = 0;
        });

        opt.AddFixedWindowLimiter("api", o =>
        {
            o.Window      = TimeSpan.FromSeconds(builder.Configuration.GetValue<int>("RateLimit:Api:WindowSeconds", 60));
            o.PermitLimit = builder.Configuration.GetValue<int>("RateLimit:Api:MaxRequests", 120);
            o.QueueLimit  = 0;
        });

        opt.AddFixedWindowLimiter("logs", o =>
        {
            o.Window      = TimeSpan.FromSeconds(builder.Configuration.GetValue<int>("RateLimit:Logs:WindowSeconds", 60));
            o.PermitLimit = builder.Configuration.GetValue<int>("RateLimit:Logs:MaxRequests", 30);
            o.QueueLimit  = 0;
        });

        opt.OnRejected = async (ctx, ct) =>
        {
            var requestId = ctx.HttpContext.Items["RequestId"]?.ToString() ?? "unknown";
            ctx.HttpContext.Response.StatusCode  = 429;
            ctx.HttpContext.Response.ContentType = "application/json";
            await ctx.HttpContext.Response.WriteAsJsonAsync(new
            {
                error = new
                {
                    code      = "RATE_LIMITED",
                    message   = "Too many requests. Please slow down and try again shortly.",
                    requestId,
                    timestamp = DateTime.UtcNow.ToString("o"),
                },
            }, ct);
        };
    });

    // ── CORS ──────────────────────────────────────────────────────────────────
    var corsOrigins = (Environment.GetEnvironmentVariable("CORS_ORIGINS")
                       ?? builder.Configuration["CORS_ORIGINS"]
                       ?? "http://localhost:3000,http://localhost:8081")
                      .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    builder.Services.AddCors(opt =>
        opt.AddDefaultPolicy(policy =>
            policy.WithOrigins(corsOrigins)
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .AllowCredentials()));

    // ── Health checks ─────────────────────────────────────────────────────────
    builder.Services.AddHealthChecks()
        .AddDbContextCheck<AppDbContext>();

    // ── Controllers ───────────────────────────────────────────────────────────
    builder.Services.AddControllers()
        .AddJsonOptions(opt =>
        {
            // Match the Node.js backend's camelCase JSON output so all existing
            // mobile and web clients work without any changes.
            opt.JsonSerializerOptions.PropertyNamingPolicy =
                System.Text.Json.JsonNamingPolicy.CamelCase;
            opt.JsonSerializerOptions.DefaultIgnoreCondition =
                System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
        });

    // ────────────────────────────────────────────────────────────────────────
    var app = builder.Build();
    // ────────────────────────────────────────────────────────────────────────

    // ── Middleware pipeline ───────────────────────────────────────────────────
    app.UseMiddleware<RequestIdMiddleware>();
    app.UseMiddleware<GlobalExceptionMiddleware>();
    app.UseSerilogRequestLogging();
    app.UseCors();
    app.UseRateLimiter();

    // WebSocket support (must come before UseAuthentication so the /v1/ws route
    // can handle the Upgrade request before JWT middleware processes it)
    app.UseWebSockets(new WebSocketOptions
    {
        KeepAliveInterval = TimeSpan.FromSeconds(30),
    });

    app.UseAuthentication();
    app.UseAuthorization();

    // ── Routes ────────────────────────────────────────────────────────────────
    app.MapControllers().RequireRateLimiting("api");

    // Raw WebSocket endpoint — wire-compatible with the Node.js backend
    // Mobile: JWT in Sec-WebSocket-Protocol "pdv.token.<jwt>"
    // Web:    JWT in httpOnly cookie pdv_session (sent automatically on Upgrade)
    app.Map("/v1/ws", async (HttpContext context) =>
    {
        if (!context.WebSockets.IsWebSocketRequest)
        {
            context.Response.StatusCode = 426;
            return;
        }

        var tokenSvc = context.RequestServices.GetRequiredService<ITokenService>();
        var wsManager = context.RequestServices.GetRequiredService<IWebSocketConnectionManager>();

        // Resolve JWT
        var cookieToken = context.Request.Cookies["pdv_session"];
        string? protocolToken = null;
        string? acceptedProtocol = null;
        foreach (var p in context.WebSockets.WebSocketRequestedProtocols)
        {
            if (p.StartsWith("pdv.token."))
            {
                protocolToken     = p["pdv.token.".Length..];
                acceptedProtocol  = p;   // echo back to satisfy RFC 6455
                break;
            }
        }

        var token = cookieToken ?? protocolToken;
        if (string.IsNullOrEmpty(token))
        {
            context.Response.StatusCode = 401;
            return;
        }

        string userId;
        try
        {
            var principal = tokenSvc.VerifyAccessToken(token);
            userId = principal.FindFirstValue("sub")
                     ?? throw new Exception("Token has no sub claim");
        }
        catch
        {
            context.Response.StatusCode = 401;
            return;
        }

        var ws = await context.WebSockets.AcceptWebSocketAsync(acceptedProtocol);
        await wsManager.HandleConnectionAsync(userId, ws, context.RequestAborted);
    });

    // Health / readiness probes
    app.MapGet("/health", (IWebHostEnvironment env) =>
        Results.Ok(new { status = "ok", timestamp = DateTime.UtcNow, environment = env.EnvironmentName }));
    app.MapGet("/ready", async (AppDbContext db) =>
    {
        try
        {
            await db.Database.ExecuteSqlRawAsync("SELECT 1");
            return Results.Ok(new { status = "ready", db = "ok" });
        }
        catch (Exception ex)
        {
            return Results.Problem($"DB not ready: {ex.Message}", statusCode: 503);
        }
    });

    // ── Initialise DB schema + seed ───────────────────────────────────────────
    await using (var scope = app.Services.CreateAsyncScope())
    {
        var crypto = scope.ServiceProvider.GetRequiredService<ICryptoService>();
        await crypto.InitAsync();

        var init = scope.ServiceProvider.GetRequiredService<DatabaseInitializer>();
        await init.InitializeAsync(seedDemoRelyingParties: isDev);
    }

    // ── Attach in-process webhook listener (dev / memory Service Bus) ─────────
    var bus     = app.Services.GetRequiredService<IServiceBusService>();
    var webhook = app.Services.GetRequiredService<IWebhookService>();
    using var initScope = app.Services.CreateScope();
    var rpRepo = initScope.ServiceProvider.GetRequiredService<IRelyingPartyRepository>();
    webhook.AttachInProcessListener(bus, id => rpRepo.GetByIdAsync(id));

    Log.Information("PersonalDataVault .NET API starting…");
    app.Run();
    return 0;
}
catch (Exception ex) when (ex is not OperationCanceledException)
{
    Log.Fatal(ex, "Application terminated unexpectedly");
    return 1;
}
finally
{
    Log.CloseAndFlush();
}
