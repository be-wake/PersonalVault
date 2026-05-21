'use strict';

/**
 * Centralised secret loader.
 *
 * Priority order for each secret:
 *   1. process.env already set (e.g. Container Apps secretref: wiring, or .env in dev)
 *   2. Azure Key Vault — fetched via Managed Identity (DefaultAzureCredential)
 *      when AZURE_KEY_VAULT_URL is set.
 *   3. Hard fail in production / ephemeral fallback in development
 *      (individual modules — auth.js, stepUp.js, etc. — handle their own fallback).
 *
 * ─── IMPORTANT ───────────────────────────────────────────────────────────────
 * Call `await secrets.init()` at the very top of server.js start(), BEFORE any
 * `require('./routes/...')` call.  Modules like auth.js, stepUp.js, and ws/index.js
 * read process.env.JWT_SECRET etc. the moment they are first required — if secrets
 * haven't been loaded yet they will get undefined and generate ephemeral keys.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Azure Key Vault secret names use lowercase-hyphen convention.
 * The corresponding environment variable names are uppercase-underscore.
 *
 * NOTE: The field-encryption KEK (PDV-FIELD-KEK) is intentionally NOT in this
 * map — lib/crypto.js manages its own Key Vault fetch so the raw key bytes
 * never touch process.env.
 */

const logger = require('../lib/logger');

const log     = logger.child({ module: 'secrets' });
const IS_PROD = process.env.NODE_ENV === 'production';
const KV_URL  = process.env.AZURE_KEY_VAULT_URL;

// ── Secret map ────────────────────────────────────────────────────────────────

const SECRET_MAP = [
  // ── Database ──────────────────────────────────────────────────────────────
  {
    kvName:   'pdv-database-url',
    envName:  'DATABASE_URL',
    required: true,
    description: 'PostgreSQL connection string',
  },
  // ── JWT ───────────────────────────────────────────────────────────────────
  {
    kvName:   'pdv-jwt-secret',
    envName:  'JWT_SECRET',
    required: true,
    description: 'JWT access token signing secret (≥ 32 chars)',
  },
  {
    kvName:   'pdv-jwt-refresh-secret',
    envName:  'JWT_REFRESH_SECRET',
    required: true,
    description: 'JWT refresh token signing secret — MUST differ from pdv-jwt-secret',
  },
  // ── Application secrets ───────────────────────────────────────────────────
  {
    kvName:   'pdv-webhook-hmac-secret',
    envName:  'WEBHOOK_HMAC_SECRET',
    required: true,
    description: 'HMAC-SHA256 secret for signing outgoing webhook payloads',
  },
  {
    kvName:   'pdv-stepup-secret',
    envName:  'STEPUP_SECRET',
    required: true,
    description: 'Step-up authentication token signing secret',
  },
  // ── Optional integrations ─────────────────────────────────────────────────
  {
    kvName:   'pdv-redis-connection-string',
    envName:  'REDIS_CONNECTION_STRING',
    required: false,
    description: 'Azure Cache for Redis — falls back to in-memory cache if absent',
  },
  {
    kvName:   'pdv-service-bus-connection-string',
    envName:  'SERVICE_BUS_CONNECTION_STRING',
    required: false,
    description: 'Azure Service Bus — falls back to in-process EventEmitter if absent',
  },
];

// ── Key Vault loader ──────────────────────────────────────────────────────────

async function loadFromKeyVault() {
  log.info({ kvUrl: KV_URL }, 'Fetching secrets from Azure Key Vault…');

  // Lazy import — these are not used in dev so no cold-start penalty.
  const { DefaultAzureCredential } = require('@azure/identity');
  const { SecretClient }           = require('@azure/keyvault-secrets');

  const client = new SecretClient(KV_URL, new DefaultAzureCredential());

  await Promise.all(
    SECRET_MAP.map(async ({ kvName, envName, required }) => {
      // Env var already populated (e.g. Container Apps secretref: wiring) — skip.
      // This lets operators override individual secrets without redeploying.
      if (process.env[envName]) {
        log.debug({ envName, source: 'env' }, 'Secret already set in environment — skipping Key Vault fetch');
        return;
      }

      try {
        const { value } = await client.getSecret(kvName);
        if (value) {
          process.env[envName] = value;
          log.info({ envName, kvName, source: 'keyvault' }, 'Secret loaded from Azure Key Vault');
        } else {
          log.warn({ envName, kvName }, 'Key Vault secret exists but has no value');
        }
      } catch (err) {
        if (required && IS_PROD) {
          log.fatal({ envName, kvName, err: err.message },
            'Required secret not found in Key Vault — refusing to start');
          process.exit(1);
        }
        log.warn({ envName, kvName, err: err.message }, 'Optional secret not in Key Vault — feature will degrade gracefully');
      }
    })
  );
}

// ── Required-secret validation ────────────────────────────────────────────────

function validate() {
  // In dev, individual modules (auth.js, stepUp.js etc.) generate safe ephemeral
  // fallbacks when secrets are absent — no need to hard-fail here.
  if (!IS_PROD) {
    const missing = SECRET_MAP
      .filter(({ required, envName }) => required && !process.env[envName])
      .map(({ envName }) => envName);
    if (missing.length > 0) {
      log.warn({ missing }, 'Some required secrets are not set — dev ephemeral fallbacks will be used');
    }
    return;
  }

  const missing = SECRET_MAP
    .filter(({ required, envName }) => required && !process.env[envName])
    .map(({ envName }) => envName);

  if (missing.length > 0) {
    log.fatal({ missing }, 'Required secrets missing in production — refusing to start');
    process.exit(1);
  }

  log.info('All required secrets validated ✓');
}

// ── Public API ────────────────────────────────────────────────────────────────

let initialised = false;

/**
 * Load all secrets into process.env, then validate required ones are present.
 * Idempotent — safe to call multiple times (subsequent calls are no-ops).
 *
 * Must be awaited before any require() that reads secrets at module load time.
 */
async function init() {
  if (initialised) return;
  initialised = true;

  if (KV_URL) {
    await loadFromKeyVault();
  } else {
    log.info(
      IS_PROD
        ? 'AZURE_KEY_VAULT_URL not set in production — expecting secrets via Container Apps secretref: or env vars'
        : 'AZURE_KEY_VAULT_URL not set — reading secrets from .env file (local dev)',
    );
  }

  validate();
}

module.exports = { init };
