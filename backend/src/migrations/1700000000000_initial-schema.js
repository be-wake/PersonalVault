/* eslint-disable camelcase */
'use strict';

/**
 * Initial schema migration.
 *
 * This is idempotent w.r.t. the legacy `CREATE TABLE IF NOT EXISTS` approach
 * used by the previous bootstrapper. All `CREATE` statements use IF NOT
 * EXISTS / ON CONFLICT so running it against an already-populated database
 * is safe.
 */

exports.up = (pgm) => {
  pgm.createExtension('pgcrypto', { ifNotExists: true });

  // ── Users ──────────────────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS users (
      id              TEXT PRIMARY KEY,
      email           TEXT UNIQUE NOT NULL,
      password_hash   TEXT NOT NULL,
      name            TEXT NOT NULL,
      mfa_enabled     BOOLEAN NOT NULL DEFAULT false,
      totp_secret     TEXT,
      failed_logins   INTEGER NOT NULL DEFAULT 0,
      locked_until    TIMESTAMPTZ,
      deleted_at      TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  pgm.sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled   BOOLEAN NOT NULL DEFAULT false`);
  pgm.sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret   TEXT`);
  pgm.sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_logins INTEGER NOT NULL DEFAULT 0`);
  pgm.sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until  TIMESTAMPTZ`);
  pgm.sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ`);

  // ── Identity ──────────────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS identity_data (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      first_name      TEXT,
      last_name       TEXT,
      email_primary   TEXT,
      date_of_birth   TEXT,
      id_type         TEXT,
      id_number_enc   TEXT,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Carry forward legacy plaintext id_number into id_number_enc on first
  // migrate run, then keep both columns (the new code only reads/writes _enc).
  pgm.sql(`ALTER TABLE identity_data ADD COLUMN IF NOT EXISTS id_number_enc TEXT`);
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='identity_data' AND column_name='id_number') THEN
        UPDATE identity_data SET id_number_enc = id_number WHERE id_number_enc IS NULL AND id_number IS NOT NULL;
      END IF;
    END $$;
  `);

  // ── Addresses ─────────────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS addresses (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type            TEXT NOT NULL DEFAULT 'current',
      line1           TEXT, line2 TEXT, city TEXT, state TEXT, postal TEXT, country TEXT,
      is_current      BOOLEAN NOT NULL DEFAULT true,
      effective_from  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      effective_to    TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  pgm.sql(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  pgm.sql(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS effective_to   TIMESTAMPTZ`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_addresses_user_current ON addresses (user_id) WHERE is_current = true`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_addresses_user         ON addresses (user_id, created_at DESC)`);

  // ── Payment cards ─────────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS payment_cards (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      card_token_enc  TEXT NOT NULL,
      card_type       TEXT NOT NULL,
      last_4          TEXT NOT NULL,
      expiry_mm_yy    TEXT NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  pgm.sql(`ALTER TABLE payment_cards ADD COLUMN IF NOT EXISTS card_token_enc TEXT`);
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_cards' AND column_name='card_token') THEN
        UPDATE payment_cards SET card_token_enc = card_token WHERE card_token_enc IS NULL;
      END IF;
    END $$;
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_payment_cards_user ON payment_cards (user_id, created_at DESC)`);

  // ── Contacts ──────────────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS contacts (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      phone_primary   TEXT,
      phone_type      TEXT DEFAULT 'mobile',
      email_secondary TEXT,
      social_handles  JSONB,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  pgm.sql(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS social_handles JSONB`);

  // ── Relying parties ───────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS relying_parties (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      client_id       TEXT NOT NULL UNIQUE,
      client_secret_hash TEXT,
      domain          TEXT NOT NULL,
      allowed_scopes  JSONB NOT NULL,
      pci_scope       BOOLEAN NOT NULL DEFAULT false,
      webhook_url     TEXT,
      description     TEXT
    )
  `);
  pgm.sql(`ALTER TABLE relying_parties ADD COLUMN IF NOT EXISTS client_secret_hash TEXT`);
  pgm.sql(`ALTER TABLE relying_parties ALTER COLUMN allowed_scopes TYPE JSONB USING allowed_scopes::JSONB`);

  // ── Consent grants ────────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS consent_grants (
      id                TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      relying_party_id  TEXT NOT NULL REFERENCES relying_parties(id),
      scopes            JSONB NOT NULL,
      purpose           TEXT NOT NULL,
      granted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at        TIMESTAMPTZ,
      revoked_at        TIMESTAMPTZ,
      status            TEXT NOT NULL DEFAULT 'ACTIVE',
      idempotency_key   TEXT
    )
  `);
  pgm.sql(`ALTER TABLE consent_grants ADD COLUMN IF NOT EXISTS idempotency_key TEXT`);
  // Convert legacy scopes_json (TEXT) → scopes (JSONB) if needed.
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='consent_grants' AND column_name='scopes_json') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='consent_grants' AND column_name='scopes') THEN
          ALTER TABLE consent_grants ADD COLUMN scopes JSONB;
          UPDATE consent_grants SET scopes = scopes_json::JSONB;
          ALTER TABLE consent_grants ALTER COLUMN scopes SET NOT NULL;
        END IF;
      END IF;
    END $$;
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_consents_user_status ON consent_grants (user_id, status, granted_at DESC)`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_consents_expires_at  ON consent_grants (expires_at) WHERE status = 'ACTIVE'`);
  pgm.sql(`CREATE UNIQUE INDEX IF NOT EXISTS uq_consents_idempotency ON consent_grants (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL`);

  // ── Audit events (hash-chained) ───────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id            TEXT PRIMARY KEY,
      grant_id      TEXT,
      user_id       TEXT NOT NULL,
      event_type    TEXT NOT NULL,
      actor_type    TEXT NOT NULL,
      actor_id      TEXT NOT NULL,
      ts            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata      JSONB,
      prev_hash     TEXT,
      hash          TEXT
    )
  `);
  pgm.sql(`ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS prev_hash TEXT`);
  pgm.sql(`ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS hash      TEXT`);
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_events' AND column_name='metadata_json') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_events' AND column_name='metadata') THEN
          ALTER TABLE audit_events ADD COLUMN metadata JSONB;
          UPDATE audit_events SET metadata = metadata_json::JSONB WHERE metadata_json IS NOT NULL;
        END IF;
      END IF;
    END $$;
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_audit_user_ts ON audit_events (user_id, ts DESC)`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_events ((metadata->>'resource'))`);

  // ── Refresh tokens (rotation + revoke) ───────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      jti          TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      issued_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at   TIMESTAMPTZ NOT NULL,
      revoked_at   TIMESTAMPTZ,
      replaced_by  TEXT,
      user_agent   TEXT
    )
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens (user_id, revoked_at)`);

  // ── RP pending requests (PENDING grant flow) ─────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS rp_consent_requests (
      id                TEXT PRIMARY KEY,
      relying_party_id  TEXT NOT NULL REFERENCES relying_parties(id),
      user_email        TEXT NOT NULL,
      user_id           TEXT REFERENCES users(id) ON DELETE CASCADE,
      scopes            JSONB NOT NULL,
      purpose           TEXT NOT NULL,
      requested_expiry  TIMESTAMPTZ,
      status            TEXT NOT NULL DEFAULT 'PENDING',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at       TIMESTAMPTZ
    )
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_rpreq_user_status ON rp_consent_requests (user_id, status, created_at DESC)`);

  // ── Push tokens (mobile) ─────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS push_tokens (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider     TEXT NOT NULL,
      token        TEXT NOT NULL,
      device       TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, token)
    )
  `);

  // ── DEK envelope table (optional future per-user key wrap) ───────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS dek_envelopes (
      user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      wrapped_dek  TEXT NOT NULL,
      kek_version  INTEGER NOT NULL DEFAULT 1,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

exports.down = (/* pgm */) => {
  // Intentionally a no-op. Schema changes in PDV are forward-only; if you need
  // to roll back, run the prior backup. node-pg-migrate still records the
  // migration as applied so up() is idempotent.
};
