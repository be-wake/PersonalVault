import * as SecureStore from 'expo-secure-store';
import createLogger from './logger';

const log = createLogger('api');

// API base URL is configured per EAS build profile via `EXPO_PUBLIC_API_URL`
// (see eas.json). The fallback keeps `expo start` working when no .env is set.
//
// EXPO_PUBLIC_* is resolved at bundle time, so each Play Store build is pinned
// to the URL that was set when it was built — exactly what we want.
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  'https://pdv-api.niceground-cc94fda7.eastus.azurecontainerapps.io';

if (!process.env.EXPO_PUBLIC_API_URL) {
  log.warn('EXPO_PUBLIC_API_URL not set — using deployed default. Set it in eas.json or .env to target a different backend.');
}

// ── Token storage (SecureStore) ──────────────────────────────────────────────
const TOKEN_KEY         = 'pdv_token';
const REFRESH_TOKEN_KEY = 'pdv_refresh_token';

async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}
async function getRefreshTokenStored(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function storeTokens(accessToken: string, refreshToken?: string | null) {
  await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
  if (refreshToken) await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
}
export async function clearTokens() {
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => {});
}

// ── Refresh-token rotation ───────────────────────────────────────────────────
// Single concurrent refresh shared by all in-flight 401s.
let inflightRefresh: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await getRefreshTokenStored();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      log.warn('Refresh token rejected — clearing session', { status: res.status });
      await clearTokens();
      return null;
    }
    const body = (await res.json()) as { accessToken: string };
    await SecureStore.setItemAsync(TOKEN_KEY, body.accessToken);
    return body.accessToken;
  } catch (err: unknown) {
    log.warn('Refresh request failed', { error: err instanceof Error ? err.message : String(err) });
    await clearTokens();
    return null;
  }
}

async function request<T>(path: string, options: RequestInit = {}, _retried = false): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const method = (options.method ?? 'GET').toUpperCase();
  log.debug(`→ ${method} ${path}`);

  let res: Response;
  const startMs = Date.now();
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch (networkErr: unknown) {
    const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
    log.error(`Network error on ${method} ${path}`, { error: msg });
    throw networkErr;
  }

  const durationMs = Date.now() - startMs;

  // On 401 for a protected route, attempt a single refresh-then-retry.
  if (res.status === 401 && !_retried && !path.startsWith('/auth/')) {
    if (!inflightRefresh) {
      inflightRefresh = refreshAccessToken().finally(() => { inflightRefresh = null; });
    }
    const fresh = await inflightRefresh;
    if (fresh) {
      return request<T>(path, options, true);
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg  = body?.error?.message || `HTTP ${res.status}`;
    const code = body?.error?.code;
    log.warn(`← ${method} ${path} ${res.status} (${durationMs}ms)`, { code, message: msg });
    const err = new Error(msg) as Error & { code?: string; status?: number };
    err.code   = code;
    err.status = res.status;
    throw err;
  }

  log.debug(`← ${method} ${path} ${res.status} (${durationMs}ms)`);
  return res.json() as T;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const auth = {
  register: (name: string, email: string, password: string) =>
    request<{ accessToken: string; refreshToken: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ accessToken: string; refreshToken: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ user: User }>('/auth/me'),
};

// ── Vault ─────────────────────────────────────────────────────────────────────
export const vault = {
  getIdentity: (userId: string) =>
    request<IdentityResponse>(`/v1/identity/${userId}`),
  updateCommonInfo: (userId: string, data: Partial<IdentityCommon>) =>
    request<{ commonInfo: IdentityCommon | null }>(`/v1/identity/${userId}`, {
      method: 'PUT', body: JSON.stringify(data),
    }),
  addDocument: (userId: string, data: { id_type: string; id_number: string }) =>
    request<{ id: string; documents: IdentityDocument[] }>(`/v1/identity/${userId}/documents`, {
      method: 'POST', body: JSON.stringify({ idType: data.id_type, idNumber: data.id_number }),
    }),
  updateDocument: (userId: string, docId: string, data: { id_type: string; id_number: string }) =>
    request<{ documents: IdentityDocument[] }>(`/v1/identity/${userId}/documents/${docId}`, {
      method: 'PUT', body: JSON.stringify({ idType: data.id_type, idNumber: data.id_number }),
    }),
  deleteDocument: (userId: string, docId: string) =>
    request<{ message: string }>(`/v1/identity/${userId}/documents/${docId}`, { method: 'DELETE' }),
  getAddress:    (userId: string) => request<{ address: AddressData }>(`/v1/address/${userId}`),
  updateAddress: (userId: string, data: Partial<AddressData>) =>
    request<{ address: AddressData }>(`/v1/address/${userId}`, { method: 'PUT', body: JSON.stringify(data) }),
  getCards:      (userId: string) => request<{ cards: PaymentCard[] }>(`/v1/payment/${userId}/cards`),
  addCard:       (userId: string, data: { card_type: string; last_4: string; expiry_mm_yy: string }) =>
    request<{ card: PaymentCard }>(`/v1/payment/${userId}/cards`, { method: 'POST', body: JSON.stringify(data) }),
  removeCard:    (userId: string, cardId: string) =>
    request<{ success: boolean }>(`/v1/payment/${userId}/cards/${cardId}`, { method: 'DELETE' }),
  getContacts:   (userId: string) => request<{ contacts: ContactsData }>(`/v1/contacts/${userId}`),
  updateContacts:(userId: string, data: Partial<ContactsData>) =>
    request<{ contacts: ContactsData }>(`/v1/contacts/${userId}`, { method: 'PUT', body: JSON.stringify(data) }),
};

// ── Consents ──────────────────────────────────────────────────────────────────
export const consents = {
  list:   (userId: string) => request<{ grants: ConsentGrant[] }>(`/v1/consents/${userId}`),
  get:    (userId: string, grantId: string) => request<{ grant: ConsentGrant }>(`/v1/consents/${userId}/${grantId}`),
  create: (body: { relyingPartyId: string; scopes: string[]; purpose: string }) =>
    request<{ grant: ConsentGrant }>('/v1/consents', { method: 'POST', body: JSON.stringify(body) }),
  revoke: (grantId: string) =>
    request<{ grant: ConsentGrant }>(`/v1/consents/${grantId}`, { method: 'DELETE' }),
};

// ── Relying Parties ───────────────────────────────────────────────────────────
export const relyingParties = {
  list: () => request<{ relyingParties: RelyingParty[] }>('/v1/relying-parties'),
};

// ── Account (GDPR / F9 / F10) ─────────────────────────────────────────────────
export const accountApi = {
  export:     () => request<Record<string, unknown>>('/v1/account/export'),
  verifyAuditChain: () => request<{ valid: boolean; checked: number; firstBrokenAt?: string }>('/v1/account/audit/verify'),
  deleteVaultResource: (resource: string) =>
    request<{ ok: boolean }>(`/v1/account/vault/${resource}`, { method: 'DELETE' }),
  deleteAccount: (stepUpToken: string) =>
    request<{ ok: boolean }>('/v1/account', {
      method: 'DELETE',
      headers: { 'X-PDV-Stepup': stepUpToken },
    }),
};

// ── Audit ─────────────────────────────────────────────────────────────────────
export type AuditResource = 'identity' | 'address' | 'payment' | 'contacts' | 'consent';
export interface AuditFilters {
  limit?:    number;
  from?:     string;            // ISO timestamp
  to?:       string;            // ISO timestamp
  resource?: AuditResource;
}

export const auditApi = {
  list: (userId: string, opts: AuditFilters | number = {}) => {
    // Back-compat: callers used to pass a bare number for `limit`.
    const f: AuditFilters = typeof opts === 'number' ? { limit: opts } : opts;
    const qs = new URLSearchParams();
    qs.set('limit', String(f.limit ?? 50));
    if (f.from)     qs.set('from',     f.from);
    if (f.to)       qs.set('to',       f.to);
    if (f.resource) qs.set('resource', f.resource);
    return request<{ events: AuditEvent[] }>(`/v1/audit/${userId}?${qs.toString()}`);
  },
};

// ── Types ─────────────────────────────────────────────────────────────────────
export interface User {
  id: string; email: string; name: string; created_at?: string;
}
/** @deprecated Use IdentityCommon + IdentityDocument */
export interface IdentityData {
  id?: string; user_id?: string; first_name?: string; last_name?: string;
  email_primary?: string; date_of_birth?: string; id_type?: string; id_number?: string;
}
/** Common personal info shared across all government IDs. */
export interface IdentityCommon {
  id?: string; user_id?: string; first_name?: string; last_name?: string;
  email_primary?: string; date_of_birth?: string; updated_at?: string;
}
/** A single government-issued ID document (Aadhaar, Passport, DL …). */
export interface IdentityDocument {
  id: string; user_id?: string; id_type: string; id_number: string; updated_at?: string;
}
export interface IdentityResponse {
  commonInfo: IdentityCommon | null;
  documents: IdentityDocument[];
}
export interface AddressData {
  id?: string; user_id?: string; type?: string; line1?: string; line2?: string;
  city?: string; state?: string; postal?: string; country?: string;
}
export interface PaymentCard {
  id: string; user_id: string; card_token: string; card_type: string;
  last_4: string; expiry_mm_yy: string; created_at: string;
}
export interface ContactsData {
  id?: string; user_id?: string; phone_primary?: string;
  phone_type?: string; email_secondary?: string;
}
export interface ConsentGrant {
  id: string; user_id: string; relying_party_id: string;
  scopes: string[]; purpose: string; granted_at: string;
  expires_at: string | null; revoked_at: string | null;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  rp: { id: string; name: string; domain: string; description?: string; pciScope: boolean };
}
export interface RelyingParty {
  id: string; name: string; client_id: string; domain: string;
  allowedScopes: string[]; pciScope: boolean; description?: string;
}
export interface AuditEvent {
  id: string; grant_id?: string; user_id: string; event_type: string;
  actor_type: string; actor_id: string; timestamp: string;
  rp_name?: string; rp_domain?: string;
  label?: string;
  metadata?: Record<string, unknown> | null;
}

export const SCOPE_LABELS: Record<string, string> = {
  'identity:name':  'Full name',
  'identity:email': 'Email address',
  'identity:dob':   'Date of birth',
  'identity:gov_id':'Government ID',
  'address:current':'Current address',
  'payment:card_ref':'Payment card',
  'contacts:phone': 'Phone number',
};
