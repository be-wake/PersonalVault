'use strict';

const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { sha256 } = require('../lib/crypto');

// ── Connection pool ───────────────────────────────────────────────────────────
// DATABASE_URL is set in the environment:
//   • Azure Container App: set as a secret/env via az containerapp update
//   • Local dev:           set in backend/.env
//   Format: postgresql://user:password@host:5432/dbname?sslmode=require
//
// Azure PostgreSQL Flexible Server enforces SSL and presents a cert signed by
// DigiCert (trusted by Node's built-in CA bundle), so rejectUnauthorized:true
// works out of the box.  Set DATABASE_SSL_REJECT_UNAUTHORIZED=false only when
// connecting to a server with a self-signed cert (e.g. local dev via Docker).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// ── Schema ────────────────────────────────────────────────────────────────────

async function initSchema() {
  // Run each CREATE TABLE individually so failure messages are precise.
  // All use IF NOT EXISTS so this is safe to run on every startup.
  const ddl = [
    `CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name          TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS identity_data (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL UNIQUE,
      first_name    TEXT,
      last_name     TEXT,
      email_primary TEXT,
      date_of_birth TEXT,
      id_type       TEXT,
      id_number     TEXT,
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS addresses (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      type       TEXT NOT NULL DEFAULT 'current',
      line1      TEXT,
      line2      TEXT,
      city       TEXT,
      state      TEXT,
      postal     TEXT,
      country    TEXT,
      is_current BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS payment_cards (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      card_token   TEXT NOT NULL,
      card_type    TEXT NOT NULL,
      last_4       TEXT NOT NULL,
      expiry_mm_yy TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS contacts (
      id               TEXT PRIMARY KEY,
      user_id          TEXT NOT NULL UNIQUE,
      phone_primary    TEXT,
      phone_type       TEXT DEFAULT 'mobile',
      email_secondary  TEXT,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS relying_parties (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      client_id      TEXT NOT NULL UNIQUE,
      domain         TEXT NOT NULL,
      allowed_scopes TEXT NOT NULL,
      pci_scope      BOOLEAN NOT NULL DEFAULT false,
      webhook_url    TEXT,
      description    TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS consent_grants (
      id                TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL,
      relying_party_id  TEXT NOT NULL,
      scopes_json       TEXT NOT NULL,
      purpose           TEXT NOT NULL,
      granted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at        TIMESTAMPTZ,
      revoked_at        TIMESTAMPTZ,
      status            TEXT NOT NULL DEFAULT 'ACTIVE',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (relying_party_id) REFERENCES relying_parties(id)
    )`,

    `CREATE TABLE IF NOT EXISTS audit_events (
      id            TEXT PRIMARY KEY,
      grant_id      TEXT,
      user_id       TEXT NOT NULL,
      event_type    TEXT NOT NULL,
      actor_type    TEXT NOT NULL,
      actor_id      TEXT NOT NULL,
      ts            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata_json TEXT
    )`,
  ];

  for (const statement of ddl) {
    await pool.query(statement);
  }

  // ── Idempotent migrations for columns added after the initial release ──────
  // ADD COLUMN IF NOT EXISTS lets these run safely on both fresh and existing
  // databases (the Azure instance was created before these columns existed).
  const migrations = [
    // E7 — Idempotency-Key support on consent creation
    `ALTER TABLE consent_grants ADD COLUMN IF NOT EXISTS idempotency_key TEXT`,
    // F14 — tamper-evident hash-chained audit log
    `ALTER TABLE audit_events   ADD COLUMN IF NOT EXISTS prev_hash TEXT`,
    `ALTER TABLE audit_events   ADD COLUMN IF NOT EXISTS hash      TEXT`,
    // F20 — relying-party client-credentials secret (sha256 hash)
    `ALTER TABLE relying_parties ADD COLUMN IF NOT EXISTS client_secret_hash TEXT`,
    // F8 — social / secondary contact handles
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS linkedin_url    TEXT`,
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS twitter_handle  TEXT`,
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS website_url     TEXT`,
  ];
  for (const statement of migrations) {
    await pool.query(statement);
  }

  // ── Indexes ───────────────────────────────────────────────────────────────
  const indexes = [
    // E4 — audit list is always "this user, newest first"
    `CREATE INDEX IF NOT EXISTS idx_audit_user_ts ON audit_events (user_id, ts DESC)`,
    // E5 — consents listed per user
    `CREATE INDEX IF NOT EXISTS idx_grants_user   ON consent_grants (user_id)`,
    // E6 — at most one current address per user
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_address_current ON addresses (user_id) WHERE is_current = true`,
    // E7 — one grant per (user, idempotency key)
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_consent_idem ON consent_grants (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL`,
  ];
  for (const statement of indexes) {
    await pool.query(statement);
  }
}

async function seedRelyingParties() {
  const parties = [
    {
      id: 'rp-stripe', name: 'Stripe Payments', client_id: 'stripe-client-001',
      domain: 'stripe.com',
      allowed_scopes: JSON.stringify(['payment:card_ref', 'identity:name', 'identity:email']),
      pci_scope: true,
      description: 'Payment processing for online transactions. Requires card details to charge you for purchases.'
    },
    {
      id: 'rp-fedex', name: 'FedEx Shipping', client_id: 'fedex-client-001',
      domain: 'fedex.com',
      allowed_scopes: JSON.stringify(['address:current', 'identity:name', 'contacts:phone']),
      pci_scope: false,
      description: 'Shipping and delivery service. Needs your address to deliver packages.'
    },
    {
      id: 'rp-linkedin', name: 'LinkedIn', client_id: 'linkedin-client-001',
      domain: 'linkedin.com',
      allowed_scopes: JSON.stringify(['identity:name', 'identity:email', 'contacts:phone']),
      pci_scope: false,
      description: 'Professional networking platform. Uses your name and email for your profile.'
    },
    {
      id: 'rp-airbnb', name: 'Airbnb', client_id: 'airbnb-client-001',
      domain: 'airbnb.com',
      allowed_scopes: JSON.stringify(['identity:name', 'identity:email', 'address:current', 'identity:gov_id']),
      pci_scope: false,
      description: 'Home rental marketplace. Requires identity verification for host and guest trust.'
    },
    {
      id: 'rp-amazon', name: 'Amazon', client_id: 'amazon-client-001',
      domain: 'amazon.com',
      allowed_scopes: JSON.stringify(['identity:name', 'identity:email', 'address:current', 'payment:card_ref', 'contacts:phone']),
      pci_scope: true,
      description: 'E-commerce platform. Needs your address and payment details to fulfill orders.'
    },
  ];

  for (const p of parties) {
    // F20 — deterministic dev client secret per RP so the demo RP read flow is
    // testable. In production, secrets would be rotated and delivered out-of-band.
    const clientSecret = `rp_secret_${p.id.replace(/^rp-/, '')}_dev`;
    const secretHash   = sha256(clientSecret);

    await pool.query(
      `INSERT INTO relying_parties (id, name, client_id, domain, allowed_scopes, pci_scope, description, client_secret_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE
         SET client_secret_hash = EXCLUDED.client_secret_hash
         WHERE relying_parties.client_secret_hash IS NULL`,
      [p.id, p.name, p.client_id, p.domain, p.allowed_scopes, p.pci_scope, p.description, secretHash]
    );
  }
}

// ── User helpers ──────────────────────────────────────────────────────────────

async function createUser(email, passwordHash, name) {
  const id = uuidv4();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4)',
      [id, email, passwordHash, name]
    );
    // Create empty vault records so reads always return a row (no 404 surprise)
    await client.query(
      'INSERT INTO identity_data (id, user_id, email_primary) VALUES ($1, $2, $3)',
      [uuidv4(), id, email]
    );
    await client.query(
      'INSERT INTO contacts (id, user_id) VALUES ($1, $2)',
      [uuidv4(), id]
    );
    await client.query('COMMIT');
    return id;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function findUserByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] ?? null;
}

async function findUserById(id) {
  const { rows } = await pool.query(
    'SELECT id, email, name, created_at FROM users WHERE id = $1',
    [id]
  );
  return rows[0] ?? null;
}

// ── Vault helpers ─────────────────────────────────────────────────────────────

async function getIdentity(userId) {
  const { rows } = await pool.query('SELECT * FROM identity_data WHERE user_id = $1', [userId]);
  return rows[0] ?? null;
}

async function upsertIdentity(userId, data) {
  const existing = await getIdentity(userId);
  const fields   = ['first_name', 'last_name', 'email_primary', 'date_of_birth', 'id_type', 'id_number'];
  const values   = fields.map(f => (data[f] !== undefined ? data[f] : (existing?.[f] ?? null)));

  if (existing) {
    await pool.query(
      `UPDATE identity_data
       SET first_name=$1, last_name=$2, email_primary=$3, date_of_birth=$4,
           id_type=$5, id_number=$6, updated_at=NOW()
       WHERE user_id=$7`,
      [...values, userId]
    );
  } else {
    await pool.query(
      `INSERT INTO identity_data (id, user_id, first_name, last_name, email_primary, date_of_birth, id_type, id_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [uuidv4(), userId, ...values]
    );
  }
}

async function getCurrentAddress(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM addresses WHERE user_id = $1 AND is_current = true ORDER BY created_at DESC LIMIT 1',
    [userId]
  );
  return rows[0] ?? null;
}

// F7 — address:history scope: return all addresses newest-first (current + archived).
async function getAddressHistory(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM addresses WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return rows;
}

async function upsertAddress(userId, data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Archive previous current address
    await client.query('UPDATE addresses SET is_current = false WHERE user_id = $1', [userId]);
    await client.query(
      `INSERT INTO addresses (id, user_id, type, line1, line2, city, state, postal, country, is_current)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)`,
      [uuidv4(), userId, data.type || 'current',
        data.line1 ?? null, data.line2 ?? null, data.city ?? null,
        data.state ?? null, data.postal ?? null, data.country ?? null]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getPaymentCards(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM payment_cards WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return rows;
}

async function addPaymentCard(userId, cardData) {
  const id    = uuidv4();
  // S12 — STUB network token. NOT a real Visa VTS / Mastercard MDES token.
  // Uses a CSPRNG so it's unguessable; prefixed STUB_ so it's never mistaken
  // for a production token. Replace with a real PSP tokenisation call (F15).
  const token = 'STUB_tok_' + crypto.randomBytes(16).toString('hex');
  await pool.query(
    'INSERT INTO payment_cards (id, user_id, card_token, card_type, last_4, expiry_mm_yy) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, userId, token, cardData.card_type, cardData.last_4, cardData.expiry_mm_yy]
  );
  return id;
}

async function removePaymentCard(userId, cardId) {
  const { rowCount } = await pool.query(
    'DELETE FROM payment_cards WHERE id = $1 AND user_id = $2',
    [cardId, userId]
  );
  return rowCount > 0;
}

async function getContacts(userId) {
  const { rows } = await pool.query('SELECT * FROM contacts WHERE user_id = $1', [userId]);
  return rows[0] ?? null;
}

async function upsertContacts(userId, data) {
  const existing = await getContacts(userId);
  if (existing) {
    await pool.query(
      `UPDATE contacts
       SET phone_primary=$1, phone_type=$2, email_secondary=$3,
           linkedin_url=$4, twitter_handle=$5, website_url=$6,
           updated_at=NOW()
       WHERE user_id=$7`,
      [
        data.phone_primary    ?? existing.phone_primary,
        data.phone_type       ?? existing.phone_type,
        data.email_secondary  ?? existing.email_secondary,
        data.linkedin_url     ?? existing.linkedin_url,
        data.twitter_handle   ?? existing.twitter_handle,
        data.website_url      ?? existing.website_url,
        userId,
      ]
    );
  } else {
    await pool.query(
      `INSERT INTO contacts (id, user_id, phone_primary, phone_type, email_secondary,
                             linkedin_url, twitter_handle, website_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        uuidv4(), userId,
        data.phone_primary   ?? null, data.phone_type      ?? null,
        data.email_secondary ?? null, data.linkedin_url    ?? null,
        data.twitter_handle  ?? null, data.website_url     ?? null,
      ]
    );
  }
}

/**
 * Hydrate every vault resource for a user into the shape scopeEngine expects
 * ({ identity, address, payment[], contacts }). Used by the RP scoped-read path
 * before masking (F1/F2).
 */
async function getVaultBundle(userId) {
  const [identity, address, payment, contacts] = await Promise.all([
    getIdentity(userId),
    getCurrentAddress(userId),
    getPaymentCards(userId),
    getContacts(userId),
  ]);
  return { identity, address, payment, contacts };
}

// ── Consent helpers ───────────────────────────────────────────────────────────

/**
 * Create a consent grant.
 *
 * When an idempotencyKey is supplied (E7), a double-tap that replays the same
 * key returns the original grant instead of creating a duplicate.
 *
 * @returns {Promise<{ id: string, created: boolean }>}
 */
async function createGrant(userId, relyingPartyId, scopes, purpose, expiresAt, idempotencyKey = null) {
  const id = uuidv4();

  if (idempotencyKey) {
    const { rows } = await pool.query(
      `INSERT INTO consent_grants (id, user_id, relying_party_id, scopes_json, purpose, expires_at, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
       RETURNING id`,
      [id, userId, relyingPartyId, JSON.stringify(scopes), purpose, expiresAt || null, idempotencyKey]
    );
    if (rows[0]) return { id: rows[0].id, created: true };

    // Conflict — a grant with this key already exists; return it.
    const existing = await pool.query(
      `SELECT id FROM consent_grants WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, idempotencyKey]
    );
    return { id: existing.rows[0].id, created: false };
  }

  await pool.query(
    `INSERT INTO consent_grants (id, user_id, relying_party_id, scopes_json, purpose, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, userId, relyingPartyId, JSON.stringify(scopes), purpose, expiresAt || null]
  );
  return { id, created: true };
}

async function getGrantsByUser(userId) {
  const { rows } = await pool.query(
    `SELECT cg.*, rp.name as rp_name, rp.domain as rp_domain, rp.pci_scope as rp_pci_scope
     FROM consent_grants cg
     JOIN relying_parties rp ON cg.relying_party_id = rp.id
     WHERE cg.user_id = $1
     ORDER BY
       CASE cg.status WHEN 'ACTIVE' THEN 1 WHEN 'REVOKED' THEN 2 ELSE 3 END,
       cg.granted_at DESC`,
    [userId]
  );
  return rows.map(parseGrant);
}

async function getGrantById(grantId) {
  const { rows } = await pool.query(
    `SELECT cg.*, rp.name as rp_name, rp.domain as rp_domain,
            rp.description as rp_description, rp.pci_scope as rp_pci_scope
     FROM consent_grants cg
     JOIN relying_parties rp ON cg.relying_party_id = rp.id
     WHERE cg.id = $1`,
    [grantId]
  );
  if (!rows[0]) return null;
  return parseGrant(rows[0]);
}

async function revokeGrant(grantId, userId) {
  const { rowCount } = await pool.query(
    `UPDATE consent_grants
     SET status = 'REVOKED', revoked_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
    [grantId, userId]
  );
  return rowCount > 0;
}

/**
 * F5 — Flip ACTIVE grants whose expiry has passed to EXPIRED, writing an
 * `EXPIRED` audit event for each. Called periodically by the scheduler in
 * server.js. Returns the rows that transitioned.
 */
async function expireGrants() {
  const { rows } = await pool.query(
    `UPDATE consent_grants
     SET status = 'EXPIRED'
     WHERE status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at < NOW()
     RETURNING id, user_id, relying_party_id`
  );
  for (const r of rows) {
    await insertAuditEvent(r.id, r.user_id, 'EXPIRED', 'system', 'scheduler', { relyingPartyId: r.relying_party_id });
  }
  return rows;
}

function parseGrant(grant) {
  return {
    ...grant,
    scopes: JSON.parse(grant.scopes_json),
    rp: {
      id:          grant.relying_party_id,
      name:        grant.rp_name,
      domain:      grant.rp_domain,
      description: grant.rp_description,
      pciScope:    !!grant.rp_pci_scope,
    },
  };
}

// ── Audit helpers ─────────────────────────────────────────────────────────────

/**
 * Insert an audit event into a per-user tamper-evident hash chain (F14).
 *
 * Each row stores hash = SHA-256(prev_hash + canonical(event)). The previous
 * row is locked FOR UPDATE inside a transaction so concurrent writers can't
 * fork the chain. verifyAuditChain() can later detect any insert/edit/delete.
 */
async function insertAuditEvent(grantId, userId, eventType, actorType, actorId, metadata) {
  const id       = uuidv4();
  const ts       = new Date().toISOString();
  const metaJson = metadata ? JSON.stringify(metadata) : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the user's latest event so the chain is serialised.
    const { rows } = await client.query(
      `SELECT hash FROM audit_events WHERE user_id = $1 ORDER BY ts DESC, id DESC LIMIT 1 FOR UPDATE`,
      [userId]
    );
    const prevHash  = rows[0]?.hash ?? 'GENESIS';
    const canonical = JSON.stringify({ id, grantId: grantId ?? null, userId, eventType, actorType, actorId, ts, metadata: metaJson, prevHash });
    const hash      = sha256(canonical);

    await client.query(
      `INSERT INTO audit_events (id, grant_id, user_id, event_type, actor_type, actor_id, ts, metadata_json, prev_hash, hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, grantId ?? null, userId, eventType, actorType, actorId, ts, metaJson, prevHash, hash]
    );

    await client.query('COMMIT');
    return id;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Recompute the hash chain for a user and report the first break, if any.
 * Backs an integrity-check endpoint / scheduled job.
 *
 * @returns {Promise<{ ok: boolean, count: number, brokenAt?: string }>}
 */
async function verifyAuditChain(userId) {
  const { rows } = await pool.query(
    `SELECT id, grant_id, user_id, event_type, actor_type, actor_id, ts, metadata_json, prev_hash, hash
     FROM audit_events WHERE user_id = $1 ORDER BY ts ASC, id ASC`,
    [userId]
  );

  let prevHash = 'GENESIS';
  for (const r of rows) {
    const ts = r.ts instanceof Date ? r.ts.toISOString() : r.ts;
    const canonical = JSON.stringify({
      id: r.id, grantId: r.grant_id ?? null, userId: r.user_id,
      eventType: r.event_type, actorType: r.actor_type, actorId: r.actor_id,
      ts, metadata: r.metadata_json ?? null, prevHash,
    });
    const expected = sha256(canonical);
    if (r.prev_hash !== prevHash || r.hash !== expected) {
      return { ok: false, count: rows.length, brokenAt: r.id };
    }
    prevHash = r.hash;
  }
  return { ok: true, count: rows.length };
}

/**
 * Fetch audit events for a user, with optional filters.
 *
 * @param {string} userId
 * @param {object} opts
 * @param {string} [opts.from]      ISO timestamp lower bound
 * @param {string} [opts.to]        ISO timestamp upper bound
 * @param {number} [opts.limit=50]  clamp 1..200
 * @param {string} [opts.resource]  filter to events related to a resource
 *                                  ('identity' | 'address' | 'payment' |
 *                                   'contacts' | 'consent')
 */
async function getAuditEvents(userId, { from, to, limit = 50, resource } = {}) {
  // Clamp limit so callers can't request unbounded scans.
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));

  let query = `
    SELECT ae.*, cg.relying_party_id,
      rp.name as rp_name, rp.domain as rp_domain
    FROM audit_events ae
    LEFT JOIN consent_grants cg ON ae.grant_id = cg.id
    LEFT JOIN relying_parties rp ON cg.relying_party_id = rp.id
    WHERE ae.user_id = $1`;

  const params = [userId];
  let idx = 2;

  if (from) { query += ` AND ae.ts >= $${idx++}`; params.push(from); }
  if (to)   { query += ` AND ae.ts <= $${idx++}`; params.push(to); }

  // Resource filter:
  //   - 'consent' matches the grant-lifecycle events regardless of metadata.
  //   - 'identity' | 'address' | 'payment' | 'contacts' match
  //     ACCESS events whose metadata.resource equals that value.
  //
  // metadata_json is TEXT today (see ADR: planned move to JSONB). We
  // therefore match with a portable JSON-substring approach that does not
  // depend on jsonb operators, but is exact via the leading "resource":"…"
  // pattern produced by our serialiser.
  if (resource) {
    const r = String(resource).toLowerCase();
    if (r === 'consent') {
      query += ` AND ae.event_type IN ('GRANT_CREATED','REVOKED','EXPIRED','SCOPE_CHANGED','GRANT_RENEWED')`;
    } else {
      query += ` AND ae.event_type = 'ACCESS' AND ae.metadata_json LIKE $${idx++}`;
      params.push(`%"resource":"${r}"%`);
    }
  }

  query += ` ORDER BY ae.ts DESC LIMIT $${idx}`;
  params.push(safeLimit);

  const { rows } = await pool.query(query, params);
  return rows.map(e => ({
    ...e,
    timestamp: e.ts,   // keep the same shape the routes/mobile app expect
    metadata:  e.metadata_json ? JSON.parse(e.metadata_json) : null,
  }));
}

// ── Relying Party helpers ─────────────────────────────────────────────────────

async function getAllRelyingParties() {
  const { rows } = await pool.query('SELECT * FROM relying_parties ORDER BY name');
  return rows.map(parseRP);
}

async function getRelyingPartyById(id) {
  const { rows } = await pool.query('SELECT * FROM relying_parties WHERE id = $1', [id]);
  if (!rows[0]) return null;
  return parseRP(rows[0]);
}

/**
 * Look up an RP by its client_id for the client-credentials flow (F20).
 * Includes client_secret_hash so the caller can verify the secret.
 */
async function findRelyingPartyByClientId(clientId) {
  const { rows } = await pool.query('SELECT * FROM relying_parties WHERE client_id = $1', [clientId]);
  if (!rows[0]) return null;
  return { ...parseRP(rows[0]), client_secret_hash: rows[0].client_secret_hash };
}

function parseRP(rp) {
  return {
    ...rp,
    allowedScopes: JSON.parse(rp.allowed_scopes),
    pciScope:      !!rp.pci_scope,
  };
}

// ── GDPR / DPDPA data-subject rights ──────────────────────────────────────────

/**
 * F9 — Right to erasure (GDPR Art. 17 / DPDPA S.12).
 * Deletes the user and everything that cascades from them, plus the audit
 * trail (which has no FK cascade because user_id is not a foreign key).
 */
async function deleteAccount(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM audit_events  WHERE user_id = $1', [userId]);
    // users → identity_data / addresses / payment_cards / contacts / consent_grants
    // are removed by ON DELETE CASCADE.
    const { rowCount } = await client.query('DELETE FROM users WHERE id = $1', [userId]);
    await client.query('COMMIT');
    return rowCount > 0;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * F9 — Per-resource erasure. Clears one vault resource without deleting the
 * account. Identity/contacts are blanked (the row must survive); address and
 * cards are hard-deleted.
 */
async function deleteVaultResource(userId, resource) {
  switch (resource) {
    case 'identity':
      await pool.query(
        `UPDATE identity_data
         SET first_name=NULL, last_name=NULL, date_of_birth=NULL, id_type=NULL, id_number=NULL, updated_at=NOW()
         WHERE user_id=$1`, [userId]);
      return true;
    case 'address':
      await pool.query('DELETE FROM addresses WHERE user_id=$1', [userId]);
      return true;
    case 'payment':
      await pool.query('DELETE FROM payment_cards WHERE user_id=$1', [userId]);
      return true;
    case 'contacts':
      await pool.query(
        `UPDATE contacts
         SET phone_primary=NULL, phone_type=NULL, email_secondary=NULL,
             linkedin_url=NULL, twitter_handle=NULL, website_url=NULL,
             updated_at=NOW()
         WHERE user_id=$1`,
        [userId]);
      return true;
    default:
      throw new Error(`Unknown vault resource: ${resource}`);
  }
}

/**
 * F10 — Data portability (GDPR Art. 20 / DPDPA S.11).
 * Returns the full machine-readable snapshot of everything we hold on a user.
 */
async function exportUserData(userId) {
  const [user, identity, address, paymentCards, contacts, consents, auditTrail] = await Promise.all([
    findUserById(userId),
    getIdentity(userId),
    getCurrentAddress(userId),
    getPaymentCards(userId),
    getContacts(userId),
    getGrantsByUser(userId),
    getAuditEvents(userId, { limit: 200 }),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    user,
    vault: { identity, address, paymentCards, contacts },
    consents,
    auditTrail,
  };
}

// ── Health ────────────────────────────────────────────────────────────────────

/** O12 — lightweight liveness probe for the DB, backs GET /ready. */
async function ping() {
  await pool.query('SELECT 1');
  return true;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * Initialise schema + seed data.  Called once from server.js before listen().
 */
async function init() {
  await initSchema();
  await seedRelyingParties();
}

/**
 * Gracefully drain the connection pool.  Called from server.js on SIGTERM/SIGINT.
 */
async function close() {
  await pool.end();
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  pool,   // exposed in case any code needs a direct client
  init,
  close,
  ping,
  createUser, findUserByEmail, findUserById,
  getIdentity, upsertIdentity,
  getCurrentAddress, getAddressHistory, upsertAddress,
  getPaymentCards, addPaymentCard, removePaymentCard,
  getContacts, upsertContacts, getVaultBundle,
  createGrant, getGrantsByUser, getGrantById, revokeGrant, expireGrants,
  insertAuditEvent, getAuditEvents, verifyAuditChain,
  getAllRelyingParties, getRelyingPartyById, findRelyingPartyByClientId,
  deleteAccount, deleteVaultResource, exportUserData,
};
