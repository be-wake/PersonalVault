import * as SecureStore from 'expo-secure-store';
import createLogger from './logger';

const log = createLogger('api');

export const API_URL = 'https://pdv-api.niceground-cc94fda7.eastus.azurecontainerapps.io';

async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync('pdv_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
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
    request<{ accessToken: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ accessToken: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ user: User }>('/auth/me'),
};

// ── Vault ─────────────────────────────────────────────────────────────────────
export const vault = {
  getIdentity:   (userId: string) => request<{ identity: IdentityData }>(`/v1/identity/${userId}`),
  updateIdentity: (userId: string, data: Partial<IdentityData>) =>
    request<{ identity: IdentityData }>(`/v1/identity/${userId}`, { method: 'PUT', body: JSON.stringify(data) }),
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

// ── Audit ─────────────────────────────────────────────────────────────────────
export const auditApi = {
  list: (userId: string, limit = 50) =>
    request<{ events: AuditEvent[] }>(`/v1/audit/${userId}?limit=${limit}`),
};

// ── Types ─────────────────────────────────────────────────────────────────────
export interface User {
  id: string; email: string; name: string; created_at?: string;
}
export interface IdentityData {
  id?: string; user_id?: string; first_name?: string; last_name?: string;
  email_primary?: string; date_of_birth?: string; id_type?: string; id_number?: string;
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
