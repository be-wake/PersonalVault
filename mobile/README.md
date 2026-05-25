# PDV Mobile

Expo SDK 54 / React Native Android app for the Personal Data Vault platform. Built with Expo Router (file-system routing), TypeScript, and EAS Build.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Expo SDK 54 + React Native 0.81 |
| Language | TypeScript |
| Routing | Expo Router 6 (file-system based) |
| Auth | JWT stored in `expo-secure-store` + refresh rotation |
| Real-time | Native WebSocket with ping/pong + exponential backoff |
| Icons | `@expo/vector-icons` (Ionicons) |
| Build / OTA | EAS Build + EAS Submit |
| Platform | Android (Google Play internal track) |

---

## Project structure

```
mobile/
├── app/
│   ├── _layout.tsx                Root layout (AuthProvider + WebSocketProvider)
│   ├── index.tsx                  Redirect → sign-in or dashboard
│   ├── (auth)/
│   │   ├── sign-in.tsx            Sign-in screen
│   │   └── register.tsx           Registration screen
│   └── (app)/                     Protected route group
│       ├── _layout.tsx            Bottom tab navigator
│       ├── dashboard.tsx          Active grants overview
│       ├── history.tsx            Audit log
│       ├── profile.tsx            Account info, export, logout
│       ├── consents/
│       │   ├── index.tsx          All grants list
│       │   ├── grant.tsx          New grant wizard
│       │   └── [grantId].tsx      Grant detail + revoke
│       └── vault/
│           ├── index.tsx          Vault hub (data categories)
│           ├── identity.tsx       Identity data
│           ├── address.tsx        Address
│           ├── contacts.tsx       Phone, email, social handles
│           └── cards.tsx          Payment cards
├── src/
│   └── lib/
│       ├── api.ts                 HTTP client (fetch + secure-store tokens)
│       ├── auth.ts                AuthContext + hooks
│       ├── ws.tsx                 WebSocketProvider + useRealtime hook
│       └── logger.ts              Structured logger with optional log shipping
├── assets/                        App icon, splash screen, adaptive icon
├── app.json                       Expo config (package ID, EAS project ID)
├── eas.json                       EAS build profiles
├── .env.example
└── .eslintrc.js
```

---

## Local development

### Prerequisites

| Tool | Notes |
|---|---|
| Node.js 20+ | |
| Expo Go | Install on physical Android device from Play Store |
| Android emulator | Android Studio → AVD Manager |
| Backend | Running locally — see [`backend/README.md`](../backend/README.md) |

### 1 — Configure environment

```bash
cp .env.example .env
```

`.env`:

```env
# Android emulator reaches host machine at 10.0.2.2
EXPO_PUBLIC_API_URL=http://10.0.2.2:4000

# Physical device: use your machine's LAN IP or a dev tunnel
# EXPO_PUBLIC_API_URL=http://192.168.1.x:4000
```

### 2 — Install and start

```bash
npm install --legacy-peer-deps
npx expo start
```

- Press **`a`** to open on the Android emulator.
- Scan the **QR code** with Expo Go on a physical device.

---

## Environment variables

All `EXPO_PUBLIC_*` variables are resolved **at bundle time** by Metro — they are baked into the JavaScript bundle and cannot be changed at runtime.

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_API_URL` | Backend base URL |
| `EXPO_PUBLIC_LOG_LEVEL` | Logger level: `error` / `warn` / `info` / `debug` |
| `EXPO_PUBLIC_LOG_ENABLED` | `true` / `false` — enable local console output |
| `EXPO_PUBLIC_LOG_SHIP_ENABLED` | `true` to forward logs to `POST /v1/logs` on the backend |

In EAS builds each profile sets these via `eas.json`; they do not need to be in `.env` for CI.

---

## Screens

| Screen | Description |
|---|---|
| Sign-in | Email + password; stores tokens in `expo-secure-store` |
| Register | Name, email, password (10+ chars, letter + digit required) |
| Dashboard | Active consent grants with status badges |
| Consents | Full grant list; tap to view detail or revoke |
| Grant wizard | Select relying party → choose scopes → confirm with PIN |
| Grant detail | Real-time status + revoke button |
| Vault hub | Category tiles: Identity, Address, Contacts, Cards |
| Identity | First/last name, DOB, government ID |
| Address | Current address edit |
| Contacts | Phone, secondary email, LinkedIn, X/Twitter, website |
| Cards | List + add/remove payment cards |
| History | Audit log (filterable by resource type) |
| Profile | Account info, GDPR data export, logout, delete account |

---

## Authentication flow

1. Sign-in calls `POST /auth/login` → receives `accessToken` + `refreshToken`.
2. Both tokens are stored in `expo-secure-store` (hardware-backed on Android).
3. Every API request includes `Authorization: Bearer <accessToken>`.
4. On `401`, `refreshAccessToken()` calls `POST /auth/refresh` with the stored refresh token. If successful, the new tokens are stored and the original request is retried. Concurrent 401s share a single in-flight refresh.
5. On refresh failure, tokens are cleared and the user is redirected to sign-in.

---

## EAS build profiles

Defined in `eas.json`:

| Profile | Distribution | API target | Build output |
|---|---|---|---|
| `development` | Internal (APK) | Dev backend | `.apk` (debug, fast install) |
| `preview` | Internal (APK) | Staging backend | `.apk` (release, internal test) |
| `production` | Google Play | Production backend | `.aab` (App Bundle) |

### Build commands

```bash
# Development APK (local testing)
npm run build:preview

# Production App Bundle → Google Play internal track
npm run build:prod

# Submit to Google Play internal track
npm run submit:prod
```

For `submit:prod` you need a Google Play service account JSON file at the path specified in `eas.json` (`./google-service-account.json`). **Never commit this file** — it is listed in `.gitignore`.

### EAS Build via CI

The `mobile.yml` GitHub Actions workflow runs `eas build --profile production` on every push to `main` that touches `mobile/**`. It requires an `EXPO_TOKEN` secret in the repository settings.

---

## npm scripts

| Script | Description |
|---|---|
| `npm start` | Start Expo dev server |
| `npm run android` | Start on Android emulator |
| `npm run lint` | ESLint over `.ts` / `.tsx` files |
| `npm run build:preview` | EAS preview build (internal APK) |
| `npm run build:prod` | EAS production build (App Bundle) |
| `npm run submit:prod` | Submit to Google Play internal track |

---

## Real-time updates

`WebSocketProvider` opens a `ws(s)://` connection after sign-in. The URL is derived from `EXPO_PUBLIC_API_URL` by replacing the scheme. The JWT is passed as a `Sec-WebSocket-Protocol` subprotocol value (`pdv.token.<jwt>`) so it never appears in server access logs or URL traces.

The provider reconnects with exponential backoff and sends a ping every 25 seconds to keep the connection alive through Azure Container Apps' idle connection timeout.

---

## Logging

The `logger.ts` module writes structured logs to the console and optionally ships `warn`/`error` batches to `POST /v1/logs` on the backend. Ship level is controlled per EAS profile:

| Profile | Ship enabled | Ship level |
|---|---|---|
| `development` | No | — |
| `preview` | Yes | `warn` + `error` |
| `production` | Yes | `warn` + `error` |

---

## Known limitations / in progress

| Item | Status |
|---|---|
| iOS support | Not yet configured (Android only) |
| Push notifications | `expo-notifications` not installed yet |
| WebSocket token in URL | ✅ S6 resolved — token sent via `Sec-WebSocket-Protocol` header |
| Dark mode | Not implemented |
