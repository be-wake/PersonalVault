const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ── Token storage (S1) ───────────────────────────────────────────────────────
// The backend now issues httpOnly Secure SameSite=Strict cookies on login, so
// the web client no longer stores the access token in localStorage (where XSS
// can reach it). localStorage is kept only for the optional user-object cache
// and for the legacy refresh-token fallback (removed once all sessions rotate).
//
// For requests the browser attaches the cookie automatically via
// `credentials: 'include'`; the Authorization header is omitted on web.

const REFRESH_TOKEN_KEY = 'pdv_refresh_token';

/** No-op on web — the access token lives exclusively in the httpOnly cookie. */
export function storeTokens(_accessToken: string, refreshToken?: string | null) {
  // Refresh token kept in localStorage only as a fallback for pre-cookie
  // sessions. The backend's /auth/refresh also accepts the pdv_refresh cookie,
  // so this will be empty for any session created after the S1 rollout.
  if (typeof window === 'undefined') return;
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem('pdv_user');
  // Ask the backend to clear the httpOnly cookies — we can't touch them from JS.
  fetch(`${BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

// ── Refresh-token rotation ───────────────────────────────────────────────────
// Concurrent requests that all get 401 should share a single /auth/refresh
// call instead of stampeding the backend.
let inflightRefresh: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  // S1 — The pdv_refresh cookie is scoped to /auth/refresh, so it is sent
  // automatically. We also include the localStorage fallback for older sessions.
  const legacyRefreshToken = getRefreshToken();
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        legacyRefreshToken ? JSON.stringify({ refreshToken: legacyRefreshToken }) : undefined,
    });
    if (!res.ok) {
      clearTokens();
      return false;
    }
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

async function request<T>(path: string, options: RequestInit = {}, _retried = false): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  // S1 — cookies are sent automatically; no Authorization header needed for web.
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',   // send pdv_session cookie on every request
  });

  // On 401 try a single refresh cycle then retry.
  if (res.status === 401 && !_retried && !path.startsWith('/auth/')) {
    inflightRefresh ??= refreshAccessToken().finally(() => { inflightRefresh = null; });
    const ok = await inflightRefresh;
    if (ok) return request<T>(path, options, true);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message || `HTTP ${res.status}`;
    const err = new Error(msg) as Error & { code?: string; status?: number };
    err.code = body?.error?.code;
    err.status = res.status;
    throw err;
  }

  return res.json() as T;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  name: string;
  created_at?: string;
}

export interface ConsentGrant {
  id: string;
  user_id: string;
  relying_party_id: string;
  scopes_json: string;
  scopes: string[];
  purpose: string;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  rp: {
    id: string;
    name: string;
    domain: string;
    description?: string;
    pciScope: boolean;
  };
}

export interface RelyingParty {
  id: string;
  name: string;
  client_id: string;
  domain: string;
  allowedScopes: string[];
  pciScope: boolean;
  description?: string;
}

/** Common personal info (name / DOB) — shared across all government IDs. */
export interface IdentityCommon {
  id?: string;
  user_id?: string;
  first_name?: string;
  last_name?: string;
  email_primary?: string;
  date_of_birth?: string;
  updated_at?: string;
}

/** A single government-issued identity document (Aadhaar, Passport, DL …). */
export interface IdentityDocument {
  id: string;
  user_id?: string;
  id_type: string;
  id_number: string;
  updated_at?: string;
}

/** Shape returned by GET /v1/identity/{userId}. */
export interface IdentityResponse {
  commonInfo: IdentityCommon | null;
  documents: IdentityDocument[];
}

/** @deprecated Use IdentityCommon + IdentityDocument instead. */
export interface IdentityData {
  id?: string;
  user_id?: string;
  first_name?: string;
  last_name?: string;
  email_primary?: string;
  date_of_birth?: string;
  id_type?: string;
  id_number?: string;
  updated_at?: string;
}

// E1 — Postgres returns BOOLEAN, not a number. Was incorrectly typed as number.
export interface AddressData {
  id?: string;
  user_id?: string;
  type?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal?: string;
  country?: string;
  is_current?: boolean;
  created_at?: string;
}

export interface PaymentCard {
  id: string;
  user_id: string;
  card_token: string;
  card_type: string;
  last_4: string;
  expiry_mm_yy: string;
  created_at: string;
}

// F8 — social / secondary contact handles added to the contacts table.
export interface ContactsData {
  id?: string;
  user_id?: string;
  phone_primary?: string;
  phone_type?: string;
  email_secondary?: string;
  linkedin_url?: string;
  twitter_handle?: string;
  website_url?: string;
  updated_at?: string;
}

export interface AuditEvent {
  id: string;
  grant_id?: string;
  user_id: string;
  event_type: string;
  actor_type: string;
  actor_id: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  label: string;
  rp_name?: string;
  rp_domain?: string;
}

// ── C8: single `api` export — the only public interface for all API calls ─────
// The previous dual-export pattern (individual named exports + `api.*` wrappers)
// has been collapsed into one. All pages import from `api.*`.
// auth.ts still imports `storeTokens` / `clearTokens` directly (they are not
// part of the request/response cycle).
export const api = {
  auth: {
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
    me: () => request<{ user: User }>('/auth/me').then((r) => r.user),
    logout: () => request<void>('/auth/logout', { method: 'POST' }),
  },

  consents: {
    list: (userId: string): Promise<ConsentGrant[]> =>
      request<{ grants: ConsentGrant[] }>(`/v1/consents/${userId}`).then((r) => r.grants),
    get: (userId: string, grantId: string): Promise<ConsentGrant> =>
      request<{ grant: ConsentGrant }>(`/v1/consents/${userId}/${grantId}`).then((r) => r.grant),
    create: (body: {
      relying_party_id: string;
      scopes: string[];
      purpose?: string;
      expiresAt?: string | null;
    }): Promise<ConsentGrant> =>
      request<{ grant: ConsentGrant }>('/v1/consents', {
        method: 'POST',
        body: JSON.stringify({
          relyingPartyId: body.relying_party_id,
          scopes: body.scopes,
          purpose: body.purpose || 'User-initiated data sharing grant',
          expiresAt: body.expiresAt,
        }),
      }).then((r) => r.grant),
    revoke: (grantId: string): Promise<ConsentGrant> =>
      request<{ grant: ConsentGrant }>(`/v1/consents/${grantId}`, { method: 'DELETE' }).then((r) => r.grant),
  },

  vault: {
    /** Returns { commonInfo, documents[] } */
    getIdentity: (userId: string): Promise<IdentityResponse> =>
      request<IdentityResponse>(`/v1/identity/${userId}`),

    /** Update common personal info (name, DOB, email). */
    updateCommonInfo: (userId: string, data: Partial<IdentityCommon>): Promise<IdentityCommon | null> =>
      request<{ commonInfo: IdentityCommon | null }>(`/v1/identity/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }).then((r) => r.commonInfo),

    /** Add a new government-issued ID document. */
    addDocument: (userId: string, data: { id_type: string; id_number: string }): Promise<{ id: string; documents: IdentityDocument[] }> =>
      request<{ id: string; documents: IdentityDocument[] }>(`/v1/identity/${userId}/documents`, {
        method: 'POST',
        body: JSON.stringify({ idType: data.id_type, idNumber: data.id_number }),
      }),

    /** Update an existing identity document. */
    updateDocument: (userId: string, docId: string, data: { id_type: string; id_number: string }): Promise<IdentityDocument[]> =>
      request<{ documents: IdentityDocument[] }>(`/v1/identity/${userId}/documents/${docId}`, {
        method: 'PUT',
        body: JSON.stringify({ idType: data.id_type, idNumber: data.id_number }),
      }).then((r) => r.documents),

    /** Remove an identity document. */
    deleteDocument: (userId: string, docId: string): Promise<void> =>
      request<void>(`/v1/identity/${userId}/documents/${docId}`, { method: 'DELETE' }),

    getAddress: (userId: string): Promise<AddressData> =>
      request<{ address: AddressData }>(`/v1/address/${userId}`).then((r) => r.address),
    updateAddress: (userId: string, data: Partial<AddressData>): Promise<AddressData> =>
      request<{ address: AddressData }>(`/v1/address/${userId}`, { method: 'PUT', body: JSON.stringify(data) }).then((r) => r.address),
    // F7 — fetch all historical addresses (current + archived) for address:history scope
    getAddressHistory: (userId: string): Promise<AddressData[]> =>
      request<{ history: AddressData[] }>(`/v1/address/${userId}/history`).then((r) => r.history),

    getCards: (userId: string): Promise<PaymentCard[]> =>
      request<{ cards: PaymentCard[] }>(`/v1/payment/${userId}/cards`).then((r) => r.cards),
    addCard: (userId: string, data: { card_type: string; last_4: string; expiry_mm_yy: string }): Promise<PaymentCard> =>
      request<{ card: PaymentCard }>(`/v1/payment/${userId}/cards`, { method: 'POST', body: JSON.stringify(data) }).then((r) => r.card),
    removeCard: (userId: string, cardId: string): Promise<{ success: boolean }> =>
      request<{ success: boolean }>(`/v1/payment/${userId}/cards/${cardId}`, { method: 'DELETE' }),

    getContacts: (userId: string): Promise<ContactsData> =>
      request<{ contacts: ContactsData }>(`/v1/contacts/${userId}`).then((r) => r.contacts),
    updateContacts: (userId: string, data: Partial<ContactsData>): Promise<ContactsData> =>
      request<{ contacts: ContactsData }>(`/v1/contacts/${userId}`, { method: 'PUT', body: JSON.stringify(data) }).then((r) => r.contacts),
  },

  audit: {
    list: (userId: string, params?: { from?: string; to?: string; resource?: string; limit?: number }): Promise<AuditEvent[]> => {
      const qs = new URLSearchParams();
      if (params?.from)     qs.set('from', params.from);
      if (params?.to)       qs.set('to', params.to);
      if (params?.resource) qs.set('resource', params.resource);
      if (params?.limit)    qs.set('limit', String(params.limit));
      const query = qs.toString() ? `?${qs.toString()}` : '';
      return request<{ events: AuditEvent[] }>(`/v1/audit/${userId}${query}`).then((r) => r.events);
    },
  },

  relyingParties: {
    list: (): Promise<RelyingParty[]> =>
      request<{ relyingParties: RelyingParty[] }>('/v1/relying-parties').then((r) => r.relyingParties),
    get: (id: string): Promise<RelyingParty> =>
      request<{ relyingParty: RelyingParty }>(`/v1/relying-parties/${id}`).then((r) => r.relyingParty),
  },
};

export const SCOPE_LABELS: Record<string, string> = {
  'identity:name': 'Full name',
  'identity:email': 'Email address',
  'identity:dob': 'Date of birth',
  'identity:gov_id': 'Government ID',
  'address:current': 'Current address',
  'address:history': 'Address history',
  'payment:card_ref': 'Payment card',
  'contacts:phone': 'Phone number',
  'contacts:all': 'All contact info',
};
