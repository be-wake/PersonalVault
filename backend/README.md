# PDV Backend

Node.js / Express REST API and WebSocket server for the Personal Data Vault platform.

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 |
| Framework | Express 4 |
| Database | PostgreSQL 15 (Azure Flexible Server in production) |
| Auth | Custom JWT (access 15 min · refresh 30 days · step-up 5 min · RP 10 min) |
| Real-time | `ws` WebSocket server |
| Caching | Azure Cache for Redis (revocation cache; in-memory fallback in dev) |
| Messaging | Azure Service Bus (webhook fan-out; in-memory fallback in dev) |
| Logging | Pino (structured JSON) + pino-pretty in dev |
| Validation | Zod |
| Containerisation | Docker → Azure Container Registry → Azure Container Apps |

---

## Project structure

```
backend/
├── src/
│   ├── server.js              Entry point; mounts routes, starts HTTP + WS
│   ├── db/
│   │   └── index.js           All DB helpers; idempotent schema bootstrap
│   ├── routes/
│   │   ├── auth.js            POST /auth/register|login|refresh|logout|stepup
│   │   ├── vault.js           GET|PUT /v1/identity|address|payment|contacts
│   │   ├── consents.js        GET|POST|DELETE /v1/consents
│   │   ├── rp.js              POST /v1/rp/token · GET /v1/rp/grants/:id/data
│   │   ├── audit.js           GET /v1/audit/:userId
│   │   ├── account.js         GET /v1/account/export · DELETE /v1/account
│   │   ├── relyingParties.js  GET /v1/relying-parties
│   │   └── logs.js            POST /v1/logs  (mobile log shipping)
│   ├── middleware/
│   │   ├── auth.js            verifyToken — JWT + httpOnly cookie
│   │   ├── rpAuth.js          verifyRPToken — RP client-credentials JWT
│   │   ├── stepUp.js          requireStepUp — re-auth gate for sensitive ops
│   │   ├── validate.js        Zod schema middleware factory
│   │   ├── rateLimit.js       express-rate-limit presets
│   │   └── requestLogger.js   pino-http request logger
│   ├── lib/
│   │   ├── crypto.js          sha256, hmacSha256, AES-256-GCM field encryption
│   │   ├── logger.js          Pino logger factory
│   │   ├── redisClient.js     Revocation cache (Redis / in-memory)
│   │   ├── serviceBus.js      Event pub/sub (Azure Service Bus / in-memory)
│   │   ├── scopeEngine.js     Field-masking projection for RP reads
│   │   └── webhooks.js        HMAC-signed webhook delivery with retry
│   ├── ws/
│   │   └── index.js           WebSocket server + broadcastToUser helper
│   ├── config/
│   │   └── secrets.js         Azure Key Vault secret loader
│   └── migrations/
│       └── 1700000000000_initial-schema.js
├── .env.example
├── Dockerfile
└── package.json
```

---

## Local development

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ (or Docker — see below)

### 1 — Start Postgres

```bash
docker run -d --name pdv-pg \
  -e POSTGRES_USER=pdvadmin \
  -e POSTGRES_PASSWORD=devpassword \
  -e POSTGRES_DB=pdv \
  -p 5432:5432 postgres:15
```

### 2 — Configure environment

```bash
cp .env.example .env
```

Edit `.env` — the minimum required fields for local dev:

```env
DATABASE_URL=postgresql://pdvadmin:devpassword@localhost:5432/pdv
JWT_SECRET=any-32-char-dev-string
JWT_REFRESH_SECRET=different-32-char-dev-string
STEPUP_SECRET=another-32-char-dev-string
RP_TOKEN_SECRET=yet-another-32-char-string
```

### 3 — Install and run

```bash
npm install
npm run dev        # Node --watch; auto-restarts on file changes
```

The server starts on **http://localhost:4000**. The schema is bootstrapped automatically on first start.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `PORT` | — | HTTP port (default `4000`) |
| `NODE_ENV` | — | `development` or `production` |
| `JWT_SECRET` | ✅ | Access token signing key (min 32 chars in prod) |
| `JWT_REFRESH_SECRET` | ✅ | Refresh token key — must differ from `JWT_SECRET` |
| `STEPUP_SECRET` | ✅ | Step-up token key |
| `RP_TOKEN_SECRET` | ✅ | RP client-credentials token key |
| `PDV_FIELD_KEK_BASE64` | — | Base64 32-byte master key for field encryption (Key Vault in prod) |
| `AZURE_KEY_VAULT_URL` | — | Key Vault URI (optional; falls back to env vars in dev) |
| `REDIS_CONNECTION_STRING` | — | Azure Redis (optional; in-memory fallback in dev) |
| `SERVICE_BUS_CONNECTION_STRING` | — | Azure Service Bus (optional; in-memory fallback in dev) |
| `SERVICE_BUS_TOPIC_REVOCATION` | — | Topic name (default `pdv-revocation-events`) |
| `WEBHOOK_HMAC_SECRET` | ✅ in prod | Signs RP revocation webhooks |
| `ALLOWED_ORIGINS` | — | Extra CORS origins (comma-separated) |
| `RATE_LIMIT_AUTH_MAX` | — | Max auth attempts per window (default `10`) |
| `RATE_LIMIT_API_MAX` | — | Max API calls per window (default `120`) |
| `LOG_LEVEL` | — | `debug` / `info` / `warn` / `error` |
| `LOG_PRETTY` | — | `true` enables pino-pretty in dev |
| `DEPLOYMENT_REGION` | — | Surfaced in `/v1/meta` for DPDPA S.17 |
| `GRIEVANCE_OFFICER_EMAIL` | — | Surfaced in `/v1/meta` for DPDPA S.29 |

> In production all secrets are stored in Azure Key Vault and injected as Key Vault references on the Container App.

---

## API reference

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | — | Create account |
| `POST` | `/auth/login` | — | Sign in; sets `pdv_session` + `pdv_refresh` cookies |
| `POST` | `/auth/logout` | Cookie | Clear session cookies |
| `POST` | `/auth/refresh` | Cookie | Rotate access token |
| `GET` | `/auth/me` | Cookie | Return current user |
| `POST` | `/auth/stepup` | Cookie | Issue step-up token (password re-confirm) |

### Vault

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/v1/identity/:userId` | Cookie | Read identity |
| `PUT` | `/v1/identity/:userId` | Cookie | Upsert identity |
| `GET` | `/v1/address/:userId` | Cookie | Read current address |
| `PUT` | `/v1/address/:userId` | Cookie | Upsert address |
| `GET` | `/v1/address/:userId/history` | Cookie | All addresses (current + archived) |
| `GET` | `/v1/contacts/:userId` | Cookie | Read contacts |
| `PUT` | `/v1/contacts/:userId` | Cookie | Upsert contacts |
| `GET` | `/v1/payment/:userId/cards` | Cookie | List payment cards |
| `POST` | `/v1/payment/:userId/cards` | Cookie + Step-up | Add card |
| `DELETE` | `/v1/payment/:userId/cards/:cardId` | Cookie | Remove card |

### Consents

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/v1/consents/:userId` | Cookie | List grants |
| `GET` | `/v1/consents/:userId/:grantId` | Cookie | Get single grant |
| `POST` | `/v1/consents` | Cookie + Step-up | Create grant |
| `DELETE` | `/v1/consents/:grantId` | Cookie + Step-up | Revoke grant |

### Relying Party (RP) API

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/v1/rp/token` | `client_id` + `client_secret` | Issue RP access token |
| `GET` | `/v1/rp/grants/:grantId/data` | RP Bearer token | Scoped, masked vault read |

### Audit & account

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/v1/audit/:userId` | Cookie | Audit events (`?from=&to=&resource=&limit=`) |
| `GET` | `/v1/account/export` | Cookie | GDPR Art. 20 machine-readable export |
| `DELETE` | `/v1/account` | Cookie + Step-up | GDPR Art. 17 full erasure |
| `DELETE` | `/v1/account/vault/:resource` | Cookie | Per-resource erasure |

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness — always 200 |
| `GET` | `/ready` | Readiness — runs `SELECT 1` against Postgres |

### WebSocket

```
wss://<host>/v1/ws
```

Authentication: `pdv_session` cookie (same as REST). The server pushes:

| Event type | When |
|---|---|
| `CONSENT_GRANTED` | A new grant is created for the user |
| `CONSENT_REVOKED` | A grant is revoked (by user or RP) |
| `CONSENT_EXPIRED` | A grant passes its `expires_at` |
| `CONNECTED` | Handshake acknowledgement |

---

## npm scripts

| Script | Description |
|---|---|
| `npm run dev` | Start with `node --watch` (auto-restart) |
| `npm start` | Start without watch (production) |
| `npm run lint` | ESLint over `src/` |

---

## Docker

```bash
# Build
docker build -t pdv-backend .

# Run (pass env vars from .env)
docker run --env-file .env -p 4000:4000 pdv-backend
```

In CI the image is built by `az acr build` (no local Docker daemon required) and deployed with `az containerapp update`.

---

## Production checklist

- [ ] All four JWT secrets set to strong unique values
- [ ] `WEBHOOK_HMAC_SECRET` set (≥ 16 chars, no `change-me`)
- [ ] `DATABASE_URL` points to Azure Postgres with `sslmode=require`
- [ ] `DATABASE_URL` added as a **GitHub Actions repository secret** (used by the migration step in `backend.yml`)
- [ ] `REDIS_CONNECTION_STRING` and `SERVICE_BUS_CONNECTION_STRING` set
- [ ] `NODE_ENV=production`
- [ ] Secrets stored in Azure Key Vault, not in Container App env vars
