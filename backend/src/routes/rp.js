'use strict';

/**
 * Relying-party API — the core PDV premise (F2).
 *
 *   POST /v1/rp/token                  — client-credentials grant (F20)
 *   GET  /v1/rp/grants/:grantId/data   — scoped, masked vault read (F1 + F2 + F4)
 *
 * An RP authenticates with its client_id/secret, then reads a user's data for a
 * specific consent grant. The response is masked per the grant's scopes by the
 * scope engine, and revocation is enforced both by the grant's stored status
 * and the near-real-time revocation cache.
 */

const express = require('express');
const { z }   = require('zod');
const {
  findRelyingPartyByClientId, getGrantById, getVaultBundle, insertAuditEvent,
} = require('../db');
const { sha256 }            = require('../lib/crypto');
const { issueRPToken, verifyRPToken } = require('../middleware/rpAuth');
const { validate }          = require('../middleware/validate');
const { projectForScopes }  = require('../lib/scopeEngine');
const redisClient           = require('../lib/redisClient');
const logger                = require('../lib/logger');

const log    = logger.child({ module: 'route:rp' });
const router = express.Router();
const wrap   = fn => (req, res, next) => fn(req, res, next).catch(next);

const tokenSchema = z.object({
  grant_type:    z.literal('client_credentials'),
  client_id:     z.string().min(1),
  client_secret: z.string().min(1),
});

// POST /v1/rp/token — client-credentials grant (F20)
router.post('/token', validate({ body: tokenSchema }), wrap(async (req, res) => {
  const { client_id, client_secret } = req.body;

  const rp = await findRelyingPartyByClientId(client_id);
  // Constant-ish failure path: same response whether the client_id or the
  // secret is wrong, so an attacker can't enumerate valid client_ids.
  if (!rp || !rp.client_secret_hash || rp.client_secret_hash !== sha256(client_secret)) {
    (req.log ?? log).warn({ client_id }, 'RP token request — invalid client credentials');
    return res.status(401).json({ error: { code: 'INVALID_CLIENT', message: 'Invalid client credentials.' } });
  }

  const accessToken = issueRPToken(rp.id, client_id);
  (req.log ?? log).info({ rpId: rp.id, client_id }, 'RP access token issued');
  res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: 600 });
}));

// GET /v1/rp/grants/:grantId/data — scoped, masked read (F1/F2/F4)
router.get('/grants/:grantId/data', verifyRPToken, wrap(async (req, res) => {
  const { grantId } = req.params;

  const grant = await getGrantById(grantId);
  if (!grant) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Grant not found.' } });
  }

  // The grant must belong to the calling RP.
  if (grant.relying_party_id !== req.rp.id) {
    (req.log ?? log).warn({ rpId: req.rp.id, grantId, owner: grant.relying_party_id }, 'RP read denied — grant belongs to another RP');
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'This grant does not belong to your application.' } });
  }

  if (grant.status !== 'ACTIVE') {
    return res.status(403).json({ error: { code: 'CONSENT_INACTIVE', message: `Consent is ${grant.status}.` } });
  }
  if (grant.expires_at && new Date(grant.expires_at) < new Date()) {
    return res.status(403).json({ error: { code: 'CONSENT_EXPIRED', message: 'Consent has expired.' } });
  }

  // F4 — near-real-time revocation check (catches tokens issued seconds before
  // a revoke that the stored status hasn't been re-read for).
  if (await redisClient.isRevoked(grantId)) {
    return res.status(403).json({ error: { code: 'CONSENT_REVOKED', message: 'Consent was revoked.' } });
  }

  // F1 — hydrate the full bundle, then mask down to the granted scopes.
  const bundle = await getVaultBundle(grant.user_id);
  const data   = projectForScopes(bundle, grant.scopes);

  // Audit the RP read with actor_type = 'rp'.
  await insertAuditEvent(grantId, grant.user_id, 'ACCESS', 'rp', req.rp.id, { scopes: grant.scopes, via: 'rp_read' });

  (req.log ?? log).info({ rpId: req.rp.id, grantId, userId: grant.user_id, scopes: grant.scopes }, 'RP scoped read served');
  res.json({ grantId, scopes: grant.scopes, data });
}));

module.exports = router;
