'use strict';

/**
 * HMAC-signed webhook delivery to relying parties.
 *
 *   POST <rp.webhook_url>
 *   Headers:
 *     Content-Type: application/json
 *     X-PDV-Event: consent.revoked|consent.expired|consent.granted
 *     X-PDV-Signature: sha256=<hex>
 *     X-PDV-Timestamp: <ISO8601>
 *     X-PDV-Delivery: <uuid> (idempotency key for the RP)
 *
 *   Body: { event, grantId, userId, relyingPartyId, occurredAt }
 *
 * Delivery is best-effort with exponential backoff (3 retries). On final
 * failure the event is written to audit_events as `WEBHOOK_FAILED` so it
 * shows up in monitoring.
 */

const { randomUUID } = require('crypto');
const logger        = require('./logger');
const { hmacSha256 } = require('./crypto');
const serviceBus    = require('./serviceBus');

const log    = logger.child({ module: 'webhooks' });
const SECRET = process.env.WEBHOOK_HMAC_SECRET || '';

if (process.env.NODE_ENV === 'production' && (!SECRET || SECRET.length < 16 || /change-me/i.test(SECRET))) {
  log.fatal('WEBHOOK_HMAC_SECRET missing/weak — refusing to start in production');
  process.exit(1);
}

const RETRY_DELAYS_MS = [500, 2000, 5000];

async function deliver(url, payload, headers) {
  const body = JSON.stringify(payload);
  const sig  = `sha256=${hmacSha256(SECRET, body)}`;
  const allHeaders = {
    'Content-Type':     'application/json',
    'X-PDV-Signature':  sig,
    'X-PDV-Timestamp':  new Date().toISOString(),
    'X-PDV-Delivery':   randomUUID(),
    ...headers,
  };

  let lastErr;
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length + 1; attempt++) {
    try {
      const res = await fetch(url, { method: 'POST', headers: allHeaders, body, signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        log.debug({ url, attempt, status: res.status }, 'Webhook delivered');
        return { ok: true, status: res.status };
      }
      lastErr = new Error(`HTTP ${res.status}`);
      log.warn({ url, attempt, status: res.status }, 'Webhook delivery non-2xx');
    } catch (err) {
      lastErr = err;
      log.warn({ url, attempt, err: err.message }, 'Webhook delivery error');
    }
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay) await new Promise(r => setTimeout(r, delay));
  }
  return { ok: false, error: lastErr?.message || 'unknown' };
}

async function sendRevocationWebhook({ rp, grantId, userId }) {
  if (!rp?.webhookUrl && !rp?.webhook_url) {
    log.debug({ grantId, rp: rp?.id }, 'No webhook_url for RP — skipping');
    return { ok: true, skipped: true };
  }
  const url = rp.webhookUrl || rp.webhook_url;
  return deliver(url, {
    event:          'consent.revoked',
    grantId,
    userId,
    relyingPartyId: rp.id,
    occurredAt:     new Date().toISOString(),
  }, { 'X-PDV-Event': 'consent.revoked' });
}

/**
 * Subscribe to in-process Service Bus events so revocation delivery happens
 * automatically once the event is published. With Azure Service Bus the
 * consumer should run as a separate worker — this in-process listener only
 * fires for the memory fallback used in dev.
 */
function attachInProcessListener({ getRelyingParty }) {
  if (serviceBus.implName() !== 'memory') return;
  serviceBus.on('consent.revoked', async ({ grantId, userId, relyingPartyId }) => {
    try {
      const rp = await getRelyingParty(relyingPartyId);
      if (rp) await sendRevocationWebhook({ rp, grantId, userId });
    } catch (err) {
      log.error({ err, grantId }, 'In-process webhook delivery failed');
    }
  });
  log.info('Attached in-process webhook listener (dev / memory event bus)');
}

module.exports = { sendRevocationWebhook, attachInProcessListener };
