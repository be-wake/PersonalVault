'use strict';

/**
 * Field-level encryption.
 *
 * Algorithm:   AES-256-GCM
 * Format:      v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>
 *
 * The KEK (32-byte master key) is sourced — in order of precedence — from:
 *   1. Azure Key Vault secret PDV_FIELD_KEK (resolved at startup)
 *   2. PDV_FIELD_KEK_BASE64 env var
 *   3. An ephemeral key generated at boot (DEV ONLY — refuses in production).
 *
 * For now, a single KEK is used directly as the data-encryption key. This is
 * fine for the field set we encrypt (gov-id numbers, card tokens). To upgrade
 * to per-user DEKs wrapped by the KEK, add a row to a `dek_envelopes` table —
 * the API in this file already accepts (plaintext, contextLabel) so the
 * change is local.
 */

const crypto = require('crypto');
const logger = require('../lib/logger');

const log     = logger.child({ module: 'crypto' });
const IS_PROD = process.env.NODE_ENV === 'production';

const ALGO     = 'aes-256-gcm';
const IV_BYTES = 12;
const VERSION  = 'v1';

let masterKey = null;

async function loadMasterKey() {
  if (masterKey) return masterKey;

  // 1. Key Vault
  const kvUrl = process.env.AZURE_KEY_VAULT_URL;
  if (kvUrl) {
    try {
      const { SecretClient } = require('@azure/keyvault-secrets');
      const { DefaultAzureCredential } = require('@azure/identity');
      const client = new SecretClient(kvUrl, new DefaultAzureCredential());
      const secret = await client.getSecret('PDV-FIELD-KEK');
      if (secret.value) {
        masterKey = Buffer.from(secret.value, 'base64');
        if (masterKey.length !== 32) throw new Error('PDV-FIELD-KEK in Key Vault is not 32 bytes (base64)');
        log.info('Field KEK loaded from Azure Key Vault');
        return masterKey;
      }
    } catch (err) {
      log.error({ err }, 'Failed to load field KEK from Key Vault — will fall back to env var');
    }
  }

  // 2. Env var
  const envKey = process.env.PDV_FIELD_KEK_BASE64;
  if (envKey) {
    masterKey = Buffer.from(envKey, 'base64');
    if (masterKey.length !== 32) {
      const msg = 'PDV_FIELD_KEK_BASE64 is not 32 bytes after base64 decode';
      if (IS_PROD) { log.fatal(msg); process.exit(1); }
      throw new Error(msg);
    }
    log.info('Field KEK loaded from PDV_FIELD_KEK_BASE64');
    return masterKey;
  }

  // 3. Ephemeral fallback (dev only)
  if (IS_PROD) {
    log.fatal('No field KEK configured — refusing to start in production');
    process.exit(1);
  }
  masterKey = crypto.randomBytes(32);
  log.warn('Generated ephemeral field KEK — encrypted data WILL NOT survive a restart');
  return masterKey;
}

function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return plaintext;
  if (!masterKey) throw new Error('Field encryption used before crypto.init() resolved');
  const iv     = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, masterKey, iv);
  const ct     = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

function decrypt(payload) {
  if (payload === null || payload === undefined || payload === '') return payload;
  // Tolerate legacy plaintext values (pre-1.1) so reads don't crash on rows
  // written before this feature shipped.
  if (typeof payload !== 'string' || !payload.startsWith(`${VERSION}:`)) return payload;
  if (!masterKey) throw new Error('Field decryption used before crypto.init() resolved');
  const [, ivB64, tagB64, ctB64] = payload.split(':');
  const iv       = Buffer.from(ivB64, 'base64');
  const tag      = Buffer.from(tagB64, 'base64');
  const ct       = Buffer.from(ctB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGO, masterKey, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

async function init() {
  await loadMasterKey();
}

// SHA-256 hash for masking-as-HASH and audit hash chain.
function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

// HMAC-SHA256 — used for webhook signing.
function hmacSha256(secret, body) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

module.exports = { init, encrypt, decrypt, sha256, hmacSha256 };
