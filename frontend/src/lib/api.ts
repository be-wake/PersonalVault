const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ── Token storage ────────────────────────────────────────────────────────────
// localStorage is XSS-vulnerable; see PRODUCTION_READINESS_REVIEW.md §S1 for
// the planned move to httpOnly cookies. Centralised here so that migration
// becomes a one-place change.
const TOKEN_KEY         = 'pdv_token';
const REFRESH_TOKEN_KEY = 'pdv_refresh_token';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}
function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}
export function storeTokens(accessToken: string, refreshToken?: string | null) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}
export function clearTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem('pdv_user');
}

// ── Refresh-token rotation ───────────────────────────────────────────────────
// Concurrent requests that all get 401 should share a single /auth/refresh
// call instead of stampeding the backend.
let inflightRefresh: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      // Refresh token itself is invalid/expired — drop everything; the
      // AuthProvider's next /auth/me will redirect to sign-in.
      clearTokens();
      return null;
    }
    const body = await res.json() as { accessToken: string };
    if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, body.accessToken);
    return body.accessToken;
  } catch {
    clearTokens();
    return null;
  }
}

async function request<T>(path: string, options: RequestInit = {}, _retried = false): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  // On 401 from a protected endpoint, try a single refresh-then-retry.
  // Skip /auth/* so /auth/refresh failures don't loop and /auth/login 401s
  // (bad credentials) surface immediately.
  if (res.status === 401 && !_retried && getRefreshToken() && !path.startsWith('/auth/')) {
    inflightRefresh ??= refreshAccessToken().finally(() => { inflightRefresh = null; });
    const fresh = await inflightRefresh;
    if (fresh) return request<T>(path, options, true);
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

// ── Consents ──────────────────────────────────────────────────────────────────
export const consents = {
  list: (userId: string) =>
    request<{ grants: ConsentGrant[] }>(`/v1/consents/${userId}`),
  get: (userId: string, grantId: string) =>
    request<{ grant: ConsentGrant }>(`/v1/consents/${userId}/${grantId}`),
  create: (body: { relyingPartyId: string; scopes: string[]; purpose: string; expiresAt?: string | null }) =>
    request<{ grant: ConsentGrant }>('/v1/consents', { method: 'POST', body: JSON.stringify(body) }),
  revoke: (grantId: string) =>
    request<{ grant: ConsentGrant }>(`/v1/consents/${grantId}`, { method: 'DELETE' }),
};

// ── Vault ─────────────────────────────────────────────────────────────────────
export const vault = {
  getIdentity: (userId: string) =>
    request<{ identity: IdentityData }>(`/v1/identity/${userId}`),
  updateIdentity: (userId: string, data: Partial<IdentityData>) =>
    request<{ identity: IdentityData }>(`/v1/identity/${userId}`, { method: 'PUT', body: JSON.stringify(data) }),

  getAddress: (userId: string) =>
    request<{ address: AddressData }>(`/v1/address/${userId}`),
  updateAddress: (userId: string, data: Partial<AddressData>) =>
    request<{ address: AddressData }>(`/v1/address/${userId}`, { method: 'PUT', body: JSON.stringify(data) }),

  getCards: (userId: string) =>
    request<{ cards: PaymentCard[] }>(`/v1/payment/${userId}/cards`),
  addCard: (userId: string, data: { card_type: string; last_4: string; expiry_mm_yy: string }) =>
    request<{ card: PaymentCard }>(`/v1/payment/${userId}/cards`, { method: 'POST', body: JSON.stringify(data) }),
  removeCard: (userId: string, cardId: string) =>
    request<{ success: boolean }>(`/v1/payment/${userId}/cards/${cardId}`, { method: 'DELETE' }),

  getContacts: (userId: string) =>
    request<{ contacts: ContactsData }>(`/v1/contacts/${userId}`),
  updateContacts: (userId: string, data: Partial<ContactsData>) =>
    request<{ contacts: ContactsData }>(`/v1/contacts/${userId}`, { method: 'PUT', body: JSON.stringify(data) }),
};

// ── Audit ─────────────────────────────────────────────────────────────────────
export const audit = {
  list: (userId: string, params?: { from?: string; to?: string; resource?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    if (params?.resource) qs.set('resource', params.resource);
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ events: AuditEvent[] }>(`/v1/audit/${userId}${query}`);
  },
};

// ── Relying Parties ───────────────────────────────────────────────────────────
export const relyingParties = {
  list: () => request<{ relyingParties: RelyingParty[] }>('/v1/relying-parties'),
  get: (id: string) => request<{ relyingParty: RelyingParty }>(`/v1/relying-parties/${id}`),
};

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
  is_current?: number;
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

export interface ContactsData {
  id?: string;
  user_id?: string;
  phone_primary?: string;
  phone_type?: string;
  email_secondary?: string;
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

// ── Grouped `api` export (unwraps backend response envelopes) ─────────────────
export const api = {
  auth: {
    register: (name: string, email: string, password: string) =>
      auth.register(name, email, password),
    login: (email: string, password: string) =>
      auth.login(email, password),
    me: () => auth.me().then((r) => r.user),
  },
  consents: {
    list: (userId: string): Promise<ConsentGrant[]> =>
      consents.list(userId).then((r) => r.grants),
    get: (userId: string, grantId: string): Promise<ConsentGrant> =>
      consents.get(userId, grantId).then((r) => r.grant),
    create: (body: {
      user_id?: string;
      relying_party_id: string;
      scopes: string[];
      purpose?: string;
      expiresAt?: string | null;
    }): Promise<ConsentGrant> =>
      consents
        .create({
          relyingPartyId: body.relying_party_id,
          scopes: body.scopes,
          purpose: body.purpose || 'User-initiated data sharing grant',
          expiresAt: body.expiresAt,
        })
        .then((r) => r.grant),
    revoke: (grantId: string): Promise<ConsentGrant> =>
      consents.revoke(grantId).then((r) => r.grant),
  },
  vault: {
    getIdentity: (userId: string): Promise<IdentityData> =>
      vault.getIdentity(userId).then((r) => r.identity),
    updateIdentity: (userId: string, data: Partial<IdentityData>): Promise<IdentityData> =>
      vault.updateIdentity(userId, data).then((r) => r.identity),
    getAddress: (userId: string): Promise<AddressData> =>
      vault.getAddress(userId).then((r) => r.address),
    updateAddress: (userId: string, data: Partial<AddressData>): Promise<AddressData> =>
      vault.updateAddress(userId, data).then((r) => r.address),
    getCards: (userId: string): Promise<PaymentCard[]> =>
      vault.getCards(userId).then((r) => r.cards),
    addCard: (
      userId: string,
      data: { card_type: string; last_4: string; expiry_mm_yy: string },
    ): Promise<PaymentCard> => vault.addCard(userId, data).then((r) => r.card),
    removeCard: (userId: string, cardId: string) =>
      vault.removeCard(userId, cardId),
    getContacts: (userId: string): Promise<ContactsData> =>
      vault.getContacts(userId).then((r) => r.contacts),
    updateContacts: (userId: string, data: Partial<ContactsData>): Promise<ContactsData> =>
      vault.updateContacts(userId, data).then((r) => r.contacts),
  },
  audit: {
    list: (
      userId: string,
      params?: { from?: string; to?: string; resource?: string; limit?: number },
    ): Promise<AuditEvent[]> => audit.list(userId, params).then((r) => r.events),
  },
  relyingParties: {
    list: (): Promise<RelyingParty[]> =>
      relyingParties.list().then((r) => r.relyingParties),
    get: (id: string): Promise<RelyingParty> =>
      relyingParties.get(id).then((r) => r.relyingParty),
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
