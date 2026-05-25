# PDV Frontend

Next.js 16 web app for the Personal Data Vault platform. Mobile-first, server-rendered, deployed as a Docker container on Azure Container Apps.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (Turbopack, App Router) |
| Language | TypeScript |
| Auth | httpOnly cookie (`pdv_session`) — no token in `localStorage` |
| Real-time | Native WebSocket via `WebSocketProvider` context |
| Styling | CSS variables + inline styles (design-token based) |
| Linting | ESLint 9 flat config + `eslint-config-next` |
| Containerisation | Docker → Azure Container Registry → Azure Container Apps |

---

## Project structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── page.tsx                   Landing / marketing page
│   │   ├── layout.tsx                 Root layout (AuthProvider + WebSocketProvider)
│   │   ├── auth/
│   │   │   ├── sign-in/page.tsx       Sign-in form
│   │   │   └── register/page.tsx      Registration form
│   │   └── (protected)/               Route group — redirects to /auth if not logged in
│   │       ├── layout.tsx             Auth guard
│   │       ├── dashboard/page.tsx     Consent grant summary + active grants
│   │       ├── consents/
│   │       │   ├── page.tsx           All consent grants list
│   │       │   ├── grant/page.tsx     New grant wizard
│   │       │   └── [grantId]/page.tsx Grant detail + revoke
│   │       ├── vault/
│   │       │   ├── identity/page.tsx  Identity data (name, DOB, gov ID)
│   │       │   ├── address/page.tsx   Address (current + history)
│   │       │   ├── contacts/page.tsx  Phone, email, LinkedIn, X, website
│   │       │   └── cards/page.tsx     Payment cards
│   │       ├── history/page.tsx       Audit log with resource filter
│   │       └── profile/page.tsx       Account info, data export, delete account
│   ├── components/
│   │   ├── Button.tsx
│   │   ├── FieldRow.tsx              Label + value with optional masking
│   │   ├── RPHeader.tsx              Relying-party identity card
│   │   └── StatusBadge.tsx           ACTIVE / REVOKED / EXPIRED chip
│   └── lib/
│       ├── api.ts                    Single `api.*` HTTP client (fetch + cookie auth)
│       ├── auth.ts                   AuthContext + useAuth / useAuthState hooks
│       └── ws.tsx                    WebSocketProvider + useRealtime hook
├── eslint.config.js                  ESLint 9 flat config
├── next.config.js
├── .npmrc                            legacy-peer-deps=true
└── Dockerfile
```

---

## Local development

### Prerequisites

- Node.js 20+
- Backend running on `http://localhost:4000` (see [`backend/README.md`](../backend/README.md))

### 1 — Configure environment

```bash
cp .env.example .env.local
```

`.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### 2 — Install and run

```bash
npm install
npm run dev       # http://localhost:3000
```

---

## Environment variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend base URL baked into the bundle at build time |

This is the only variable the frontend needs. In production it is passed as a Docker build arg (`--build-arg NEXT_PUBLIC_API_URL=…`) by the GitHub Actions workflow.

---

## Pages

| Route | Description |
|---|---|
| `/` | Landing page with feature highlights and CTA |
| `/auth/sign-in` | Sign-in form |
| `/auth/register` | Registration form |
| `/dashboard` | Active consent grants overview |
| `/consents` | Full list of all grants (active + revoked + expired) |
| `/consents/grant` | Multi-step wizard to create a new consent grant |
| `/consents/:grantId` | Grant detail with real-time status updates and revoke |
| `/vault/identity` | Identity data (name, DOB, government ID) |
| `/vault/address` | Current address + address history |
| `/vault/contacts` | Phone, secondary email, LinkedIn, X/Twitter, website |
| `/vault/cards` | Payment card list with add/remove |
| `/history` | Audit log with resource type and date range filter |
| `/profile` | Account info, GDPR export, account deletion |

---

## Authentication flow

1. `POST /auth/login` → backend sets `pdv_session` (15 min) and `pdv_refresh` (30 day) as `httpOnly; Secure; SameSite=Strict` cookies.
2. Every `fetch()` in `api.ts` uses `credentials: 'include'` — cookies are sent automatically.
3. On `401`, a single `/auth/refresh` call is made (concurrent requests share one in-flight refresh via a deduplication guard). If refresh fails, `clearTokens()` is called and the user is returned to sign-in.
4. On logout, `POST /auth/logout` clears the cookies server-side.

No token ever touches `localStorage` or `sessionStorage`.

---

## Real-time updates

`WebSocketProvider` (in `root layout.tsx`) opens a single `wss://` connection after sign-in. Components subscribe to messages via the `useRealtime(handler)` hook:

```tsx
useRealtime((msg) => {
  if (msg?.type === 'CONSENT_REVOKED') { /* update local state */ }
});
```

The provider handles ping/pong (25 s interval) and exponential backoff reconnection (up to 30 s cap). The WS URL is derived from `NEXT_PUBLIC_API_URL` by replacing the `http(s)` scheme with `ws(s)`.

---

## npm scripts

| Script | Description |
|---|---|
| `npm run dev` | Dev server with Turbopack HMR |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint 9 over `src/` |

---

## Docker

```bash
# Build (API URL is baked in at build time)
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://your-api.azurecontainerapps.io \
  -t pdv-frontend .

# Run
docker run -p 3000:3000 pdv-frontend
```

The Dockerfile uses Next.js `output: 'standalone'` so the image is self-contained (no `node_modules` copy needed at runtime).

---

## Deployment

The `frontend.yml` GitHub Actions workflow:

1. Logs in to Azure via OIDC (no stored credentials).
2. Runs `az acr build` — builds the Docker image in the cloud (no local Docker needed).
3. Runs `az containerapp update` to deploy the new image.

Resource names are read from GitHub Actions repository variables (`vars.FRONTEND_APP_NAME`, `vars.AZURE_ACR`, etc.) with hand-provisioned names as fallbacks.
