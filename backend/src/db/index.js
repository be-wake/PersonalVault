'use strict';

const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

// ── Connection pool ───────────────────────────────────────────────────────────
// DATABASE_URL is set in the environment:
//   • Azure Container App: set as a secret/env via az containerapp update
//   • Local dev:           set in backend/.env
//   Format: postgresql://user:password@host:5432/dbname?sslmode=require
//
// Azure PostgreSQL Flexible Server always enforces SSL. rejectUnauthorized:false
// avoids the need to bundle the DigiCert CA certificate into the image.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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
    await pool.query(
      `INSERT INTO relying_parties (id, name, client_id, domain, allowed_scopes, pci_scope, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [p.id, p.name, p.client_id, p.domain, p.allowed_scopes, p.pci_scope, p.description]
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
  const token = 'tok_' + Math.random().toString(36).substring(2, 18);
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
       SET phone_primary=$1, phone_type=$2, email_secondary=$3, updated_at=NOW()
       WHERE user_id=$4`,
      [
        data.phone_primary    ?? existing.phone_primary,
        data.phone_type       ?? existing.phone_type,
        data.email_secondary  ?? existing.email_secondary,
        userId,
      ]
    );
  } else {
    await pool.query(
      'INSERT INTO contacts (id, user_id, phone_primary, phone_type, email_secondary) VALUES ($1, $2, $3, $4, $5)',
      [uuidv4(), userId, data.phone_primary ?? null, data.phone_type ?? null, data.email_secondary ?? null]
    );
  }
}

// ── Consent helpers ───────────────────────────────────────────────────────────

async function createGrant(userId, relyingPartyId, scopes, purpose, expiresAt) {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO consent_grants (id, user_id, relying_party_id, scopes_json, purpose, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, userId, relyingPartyId, JSON.stringify(scopes), purpose, expiresAt || null]
  );
  return id;
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

async function insertAuditEvent(grantId, userId, eventType, actorType, actorId, metadata) {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO audit_events (id, grant_id, user_id, event_type, actor_type, actor_id, metadata_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, grantId ?? null, userId, eventType, actorType, actorId,
      metadata ? JSON.stringify(metadata) : null]
  );
  return id;
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

function parseRP(rp) {
  return {
    ...rp,
    allowedScopes: JSON.parse(rp.allowed_scopes),
    pciScope:      !!rp.pci_scope,
  };
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
  createUser, findUserByEmail, findUserById,
  getIdentity, upsertIdentity,
  getCurrentAddress, upsertAddress,
  getPaymentCards, addPaymentCard, removePaymentCard,
  getContacts, upsertContacts,
  createGrant, getGrantsByUser, getGrantById, revokeGrant,
  insertAuditEvent, getAuditEvents,
  getAllRelyingParties, getRelyingPartyById,
};
