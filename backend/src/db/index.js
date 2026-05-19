const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, '../../pdv.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      email       TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name        TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS identity_data (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL UNIQUE,
      first_name    TEXT,
      last_name     TEXT,
      email_primary TEXT,
      date_of_birth TEXT,
      id_type       TEXT,
      id_number     TEXT,
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      type       TEXT NOT NULL DEFAULT 'current',
      line1      TEXT,
      line2      TEXT,
      city       TEXT,
      state      TEXT,
      postal     TEXT,
      country    TEXT,
      is_current INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payment_cards (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      card_token   TEXT NOT NULL,
      card_type    TEXT NOT NULL,
      last_4       TEXT NOT NULL,
      expiry_mm_yy TEXT NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id               TEXT PRIMARY KEY,
      user_id          TEXT NOT NULL UNIQUE,
      phone_primary    TEXT,
      phone_type       TEXT DEFAULT 'mobile',
      email_secondary  TEXT,
      updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS relying_parties (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      client_id      TEXT NOT NULL UNIQUE,
      domain         TEXT NOT NULL,
      allowed_scopes TEXT NOT NULL,
      pci_scope      INTEGER NOT NULL DEFAULT 0,
      webhook_url    TEXT,
      description    TEXT
    );

    CREATE TABLE IF NOT EXISTS consent_grants (
      id                TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL,
      relying_party_id  TEXT NOT NULL,
      scopes_json       TEXT NOT NULL,
      purpose           TEXT NOT NULL,
      granted_at        TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at        TEXT,
      revoked_at        TEXT,
      status            TEXT NOT NULL DEFAULT 'ACTIVE',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (relying_party_id) REFERENCES relying_parties(id)
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id            TEXT PRIMARY KEY,
      grant_id      TEXT,
      user_id       TEXT NOT NULL,
      event_type    TEXT NOT NULL,
      actor_type    TEXT NOT NULL,
      actor_id      TEXT NOT NULL,
      timestamp     TEXT NOT NULL DEFAULT (datetime('now')),
      metadata_json TEXT
    );
  `);
}

function seedRelyingParties() {
  const count = db.prepare('SELECT COUNT(*) as c FROM relying_parties').get();
  if (count.c > 0) return;

  const insert = db.prepare(`
    INSERT INTO relying_parties (id, name, client_id, domain, allowed_scopes, pci_scope, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const parties = [
    {
      id: 'rp-stripe',
      name: 'Stripe Payments',
      client_id: 'stripe-client-001',
      domain: 'stripe.com',
      allowed_scopes: JSON.stringify(['payment:card_ref', 'identity:name', 'identity:email']),
      pci_scope: 1,
      description: 'Payment processing for online transactions. Requires card details to charge you for purchases.'
    },
    {
      id: 'rp-fedex',
      name: 'FedEx Shipping',
      client_id: 'fedex-client-001',
      domain: 'fedex.com',
      allowed_scopes: JSON.stringify(['address:current', 'identity:name', 'contacts:phone']),
      pci_scope: 0,
      description: 'Shipping and delivery service. Needs your address to deliver packages.'
    },
    {
      id: 'rp-linkedin',
      name: 'LinkedIn',
      client_id: 'linkedin-client-001',
      domain: 'linkedin.com',
      allowed_scopes: JSON.stringify(['identity:name', 'identity:email', 'contacts:phone']),
      pci_scope: 0,
      description: 'Professional networking platform. Uses your name and email for your profile.'
    },
    {
      id: 'rp-airbnb',
      name: 'Airbnb',
      client_id: 'airbnb-client-001',
      domain: 'airbnb.com',
      allowed_scopes: JSON.stringify(['identity:name', 'identity:email', 'address:current', 'identity:gov_id']),
      pci_scope: 0,
      description: 'Home rental marketplace. Requires identity verification for host and guest trust.'
    },
    {
      id: 'rp-amazon',
      name: 'Amazon',
      client_id: 'amazon-client-001',
      domain: 'amazon.com',
      allowed_scopes: JSON.stringify(['identity:name', 'identity:email', 'address:current', 'payment:card_ref', 'contacts:phone']),
      pci_scope: 1,
      description: 'E-commerce platform. Needs your address and payment details to fulfill orders.'
    }
  ];

  const insertAll = db.transaction(() => {
    for (const p of parties) {
      insert.run(p.id, p.name, p.client_id, p.domain, p.allowed_scopes, p.pci_scope, p.description);
    }
  });
  insertAll();
}

// ── User helpers ──────────────────────────────────────────────────────────────

function createUser(email, passwordHash, name) {
  const id = uuidv4();
  db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)')
    .run(id, email, passwordHash, name);
  // Create empty records for vault resources
  db.prepare('INSERT INTO identity_data (id, user_id, email_primary) VALUES (?, ?, ?)').run(uuidv4(), id, email);
  db.prepare('INSERT INTO contacts (id, user_id) VALUES (?, ?)').run(uuidv4(), id);
  return id;
}

function findUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function findUserById(id) {
  return db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(id);
}

// ── Vault helpers ─────────────────────────────────────────────────────────────

function getIdentity(userId) {
  return db.prepare('SELECT * FROM identity_data WHERE user_id = ?').get(userId);
}

function upsertIdentity(userId, data) {
  const existing = getIdentity(userId);
  const fields = ['first_name', 'last_name', 'email_primary', 'date_of_birth', 'id_type', 'id_number'];
  if (existing) {
    const sets = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => data[f] !== undefined ? data[f] : existing[f]);
    db.prepare(`UPDATE identity_data SET ${sets}, updated_at = datetime('now') WHERE user_id = ?`)
      .run(...values, userId);
  } else {
    const id = uuidv4();
    db.prepare(`INSERT INTO identity_data (id, user_id, first_name, last_name, email_primary, date_of_birth, id_type, id_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, userId, data.first_name, data.last_name, data.email_primary, data.date_of_birth, data.id_type, data.id_number);
  }
}

function getCurrentAddress(userId) {
  return db.prepare('SELECT * FROM addresses WHERE user_id = ? AND is_current = 1 ORDER BY created_at DESC LIMIT 1').get(userId);
}

function upsertAddress(userId, data) {
  // Mark old current as non-current
  db.prepare('UPDATE addresses SET is_current = 0 WHERE user_id = ?').run(userId);
  const id = uuidv4();
  db.prepare(`INSERT INTO addresses (id, user_id, type, line1, line2, city, state, postal, country, is_current) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`)
    .run(id, userId, data.type || 'current', data.line1, data.line2, data.city, data.state, data.postal, data.country);
}

function getPaymentCards(userId) {
  return db.prepare('SELECT * FROM payment_cards WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}

function addPaymentCard(userId, cardData) {
  const id = uuidv4();
  // Simulate network tokenisation: generate a fake token
  const token = 'tok_' + Math.random().toString(36).substring(2, 18);
  db.prepare('INSERT INTO payment_cards (id, user_id, card_token, card_type, last_4, expiry_mm_yy) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, userId, token, cardData.card_type, cardData.last_4, cardData.expiry_mm_yy);
  return id;
}

function removePaymentCard(userId, cardId) {
  const result = db.prepare('DELETE FROM payment_cards WHERE id = ? AND user_id = ?').run(cardId, userId);
  return result.changes > 0;
}

function getContacts(userId) {
  return db.prepare('SELECT * FROM contacts WHERE user_id = ?').get(userId);
}

function upsertContacts(userId, data) {
  const existing = getContacts(userId);
  if (existing) {
    db.prepare(`UPDATE contacts SET phone_primary = ?, phone_type = ?, email_secondary = ?, updated_at = datetime('now') WHERE user_id = ?`)
      .run(data.phone_primary || existing.phone_primary, data.phone_type || existing.phone_type, data.email_secondary || existing.email_secondary, userId);
  } else {
    db.prepare('INSERT INTO contacts (id, user_id, phone_primary, phone_type, email_secondary) VALUES (?, ?, ?, ?, ?)')
      .run(uuidv4(), userId, data.phone_primary, data.phone_type, data.email_secondary);
  }
}

// ── Consent helpers ──────────────────────────────────────────────────────────

function createGrant(userId, relyingPartyId, scopes, purpose, expiresAt) {
  const id = uuidv4();
  db.prepare(`INSERT INTO consent_grants (id, user_id, relying_party_id, scopes_json, purpose, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, userId, relyingPartyId, JSON.stringify(scopes), purpose, expiresAt || null);
  return id;
}

function getGrantsByUser(userId) {
  const grants = db.prepare(`
    SELECT cg.*, rp.name as rp_name, rp.domain as rp_domain, rp.pci_scope as rp_pci_scope
    FROM consent_grants cg
    JOIN relying_parties rp ON cg.relying_party_id = rp.id
    WHERE cg.user_id = ?
    ORDER BY
      CASE cg.status WHEN 'ACTIVE' THEN 1 WHEN 'REVOKED' THEN 2 ELSE 3 END,
      cg.granted_at DESC
  `).all(userId);
  return grants.map(parseGrant);
}

function getGrantById(grantId) {
  const grant = db.prepare(`
    SELECT cg.*, rp.name as rp_name, rp.domain as rp_domain, rp.description as rp_description, rp.pci_scope as rp_pci_scope
    FROM consent_grants cg
    JOIN relying_parties rp ON cg.relying_party_id = rp.id
    WHERE cg.id = ?
  `).get(grantId);
  if (!grant) return null;
  return parseGrant(grant);
}

function revokeGrant(grantId, userId) {
  const result = db.prepare(`
    UPDATE consent_grants
    SET status = 'REVOKED', revoked_at = datetime('now')
    WHERE id = ? AND user_id = ? AND status = 'ACTIVE'
  `).run(grantId, userId);
  return result.changes > 0;
}

function parseGrant(grant) {
  return {
    ...grant,
    scopes: JSON.parse(grant.scopes_json),
    rp: {
      id: grant.relying_party_id,
      name: grant.rp_name,
      domain: grant.rp_domain,
      description: grant.rp_description,
      pciScope: !!grant.rp_pci_scope
    }
  };
}

// ── Audit helpers ─────────────────────────────────────────────────────────────

function insertAuditEvent(grantId, userId, eventType, actorType, actorId, metadata) {
  const id = uuidv4();
  db.prepare(`INSERT INTO audit_events (id, grant_id, user_id, event_type, actor_type, actor_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, grantId, userId, eventType, actorType, actorId, metadata ? JSON.stringify(metadata) : null);
  return id;
}

function getAuditEvents(userId, { from, to, resource, limit = 50 } = {}) {
  let query = `SELECT ae.*, cg.relying_party_id,
    rp.name as rp_name, rp.domain as rp_domain
    FROM audit_events ae
    LEFT JOIN consent_grants cg ON ae.grant_id = cg.id
    LEFT JOIN relying_parties rp ON cg.relying_party_id = rp.id
    WHERE ae.user_id = ?`;
  const params = [userId];
  if (from) { query += ' AND ae.timestamp >= ?'; params.push(from); }
  if (to) { query += ' AND ae.timestamp <= ?'; params.push(to); }
  query += ' ORDER BY ae.timestamp DESC LIMIT ?';
  params.push(limit);
  return db.prepare(query).all(...params).map(e => ({
    ...e,
    metadata: e.metadata_json ? JSON.parse(e.metadata_json) : null
  }));
}

// ── Relying Party helpers ────────────────────────────────────────────────────

function getAllRelyingParties() {
  return db.prepare('SELECT * FROM relying_parties').all().map(rp => ({
    ...rp,
    allowedScopes: JSON.parse(rp.allowed_scopes),
    pciScope: !!rp.pci_scope
  }));
}

function getRelyingPartyById(id) {
  const rp = db.prepare('SELECT * FROM relying_parties WHERE id = ?').get(id);
  if (!rp) return null;
  return { ...rp, allowedScopes: JSON.parse(rp.allowed_scopes), pciScope: !!rp.pci_scope };
}

// ── Boot ──────────────────────────────────────────────────────────────────────

initSchema();
seedRelyingParties();

module.exports = {
  db,
  createUser, findUserByEmail, findUserById,
  getIdentity, upsertIdentity,
  getCurrentAddress, upsertAddress,
  getPaymentCards, addPaymentCard, removePaymentCard,
  getContacts, upsertContacts,
  createGrant, getGrantsByUser, getGrantById, revokeGrant,
  insertAuditEvent, getAuditEvents,
  getAllRelyingParties, getRelyingPartyById
};
