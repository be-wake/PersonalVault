# Personal Data Vault (PDV)

A privacy-first platform that lets users **own and control their personal data**. Users store identity, address, payment, and contact information in an encrypted vault and issue time-limited, scope-restricted consent grants to third-party relying parties (RPs). Every read and every revocation is immutably audited.

> **Compliance posture:** GDPR Art. 17 (erasure) · Art. 20 (portability) · DPDPA S.11/12/16 · PCI-DSS v4 (illustrative)

---

## Repository layout

```
personal-data-vault/
├── backend/          Node.js / Express API + WebSocket server
├── frontend/         Next.js 16 web app (mobile-first PWA)
├── mobile/           Expo SDK 54 / React Native Android app
├── infra/            Azure Bicep IaC (Container Apps + ACR + Postgres + Key Vault)
└── .github/
    ├── workflows/    CI/CD pipelines (backend, frontend, mobile, infra, lint)
    └── dependabot.yml
```

---

## Architecture overview

```
┌─────────────┐   HTTPS/WSS    ┌──────────────────────────────────────────┐
│  Web (Next) │ ─────────────► │                                          │
├─────────────┤                │   Express API  (Azure Container App)     │
│ Mobile (RN) │ ─────────────► │   ├── /auth/*        JWT + httpOnly      │
└─────────────┘                │   ├── /v1/vault/*    Identity/Address    │
                               │   ├── /v1/consents/* Grant lifecycle     │
┌─────────────┐                │   ├── /v1/rp/*       Scoped RP reads     │
│ Relying     │ ─────────────► │   ├── /v1/audit/*    Hash-chained log    │
│ Party (API) │  client_creds  │   └── /v1/ws         WebSocket           │
└─────────────┘                └──────────┬───────────────────────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
             PostgreSQL            Azure Redis           Azure Service Bus
           (Flexible Server)   (revocation cache)    (webhook event bus)
```

---

## Key features

| Feature | Detail |
|---|---|
| **Vault** | Identity, address (with history), payment cards, contacts + social handles |
| **Consent grants** | Scope-restricted, time-limited, revocable at any time |
| **Relying-party reads** | Client-credentials flow → scoped, field-masked data |
| **Real-time revocation** | WebSocket push + Redis revocation cache for near-instant enforcement |
| **Webhook delivery** | HMAC-signed `POST` to RP `webhook_url` with 3-attempt backoff |
| **Audit log** | SHA-256 hash-chained, actor-aware, tamper-evident |
| **GDPR / DPDPA** | Full account erasure, machine-readable data export, under-18 block |
| **Step-up auth** | Password re-confirmation required for grant/revoke/card-add/account-delete |
| **httpOnly cookies** | Access token never touches `localStorage` on web |

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | 20 LTS |
| npm | 10+ |
| Docker | For local Postgres (or install Postgres 15+) |
| Expo CLI | via `npx expo` (no global install needed) |

---

## Quick start (local development)

### 1 — Start Postgres

```bash
docker run -d --name pdv-pg \
  -e POSTGRES_USER=pdvadmin \
  -e POSTGRES_PASSWORD=devpassword \
  -e POSTGRES_DB=pdv \
  -p 5432:5432 postgres:15
```

### 2 — Backend

```bash
cd backend
cp .env.example .env          # edit DATABASE_URL and secrets
npm install
npm run dev                   # starts on http://localhost:4000
```

### 3 — Web frontend

```bash
cd frontend
cp .env.example .env.local    # set NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev                   # starts on http://localhost:3000
```

### 4 — Mobile

```bash
cd mobile
cp .env.example .env
npm install --legacy-peer-deps
npx expo start                # scan QR with Expo Go, or press 'a' for Android emulator
```

---

## CI / CD

| Workflow | Trigger | What it does |
|---|---|---|
| `lint.yml` | Push / PR to `main` (path-filtered) | ESLint on changed packages |
| `backend.yml` | Push to `main` → `backend/**` | `az acr build` → `az containerapp update` |
| `frontend.yml` | Push to `main` → `frontend/**` | `az acr build` → `az containerapp update` |
| `mobile.yml` | Push to `main` → `mobile/**` | `eas build --profile production` |
| `infra.yml` | Manual dispatch | `az deployment group create` (Bicep) |

All deploy workflows require three GitHub secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (OIDC — no stored password).

---

## Infrastructure (Azure)

Provisioned by `infra/main.bicep`:

- **Azure Container Registry** — stores `pdv-backend` and `pdv-frontend` images
- **Container Apps Environment** — hosts both apps; linked to Log Analytics
- **PostgreSQL Flexible Server** — persistent data store, TLS required
- **Azure Key Vault** — holds all secrets; Container Apps read via managed identity
- **Azure Cache for Redis** — near-real-time revocation cache
- **Azure Service Bus** — revocation event bus for webhook delivery

```bash
az deployment group create \
  --resource-group pdv-rg \
  --template-file infra/main.bicep \
  --parameters appSuffix=vivekverma \
               pgAdminUser=pdvadmin \
               pgAdminPassword='<strong-password>'
```

---

## Scope reference

| Scope | Data exposed |
|---|---|
| `identity:name` | First + last name |
| `identity:email` | Primary email |
| `identity:dob` | Date of birth |
| `identity:gov_id` | Government ID type + number |
| `address:current` | Current address |
| `address:history` | All addresses (current + archived) |
| `payment:card_ref` | Masked card reference (last 4, type) |
| `contacts:phone` | Primary phone number |
| `contacts:all` | All contacts including social handles |

---

## Security notes

- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `STEPUP_SECRET`, and `RP_TOKEN_SECRET` **must** be set to strong unique values before any production deployment. The server refuses to start if they are missing or use the default placeholder.
- Access tokens live in `httpOnly; Secure; SameSite=Strict` cookies on web (never `localStorage`).
- Sensitive operations (grant consent, revoke consent, add payment card, delete account) require a step-up password confirmation.
- All audit events are hash-chained — any row deletion or modification breaks the chain.

---

## Sub-package documentation

| Package | README |
|---|---|
| API server | [`backend/README.md`](backend/README.md) |
| Web app | [`frontend/README.md`](frontend/README.md) |
| Mobile app | [`mobile/README.md`](mobile/README.md) |
