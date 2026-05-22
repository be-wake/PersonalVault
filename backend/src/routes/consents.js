'use strict';

const express  = require('express');
const {
  createGrant, getGrantsByUser, getGrantById, revokeGrant,
  getRelyingPartyById, insertAuditEvent,
} = require('../db');
const { verifyToken } = require('../middleware/auth');
const { requireStepUp } = require('../middleware/stepUp');
const { broadcastToUser } = require('../ws');
const logger   = require('../lib/logger');

const log    = logger.child({ module: 'route:consents' });
const router = express.Router();
router.use(verifyToken);

// Propagates async errors to Express's global error handler
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

// GET /v1/consents/:userId — list all grants
router.get('/:userId', wrap(async (req, res) => {
  if (req.params.userId !== req.user.sub) {
    (req.log ?? log).warn({ requesterId: req.user.sub, targetId: req.params.userId }, 'Forbidden — list consents');
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  }
  const grants = await getGrantsByUser(req.params.userId);
  (req.log ?? log).debug({ userId: req.params.userId, count: grants.length }, 'Listed consent grants');
  res.json({ grants });
}));

// GET /v1/consents/:userId/:grantId — get a single grant
router.get('/:userId/:grantId', wrap(async (req, res) => {
  if (req.params.userId !== req.user.sub) {
    (req.log ?? log).warn({ requesterId: req.user.sub, targetId: req.params.userId }, 'Forbidden — get consent');
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  }
  const grant = await getGrantById(req.params.grantId);
  if (!grant || grant.user_id !== req.params.userId) {
    (req.log ?? log).debug({ grantId: req.params.grantId, userId: req.params.userId }, 'Grant not found');
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Grant not found.' } });
  }
  (req.log ?? log).debug({ grantId: grant.id, userId: req.params.userId }, 'Fetched consent grant');
  res.json({ grant });
}));

// POST /v1/consents — create a new consent grant
// Sensitive → step-up gated (S2). Idempotency-Key header dedupes double-taps (E7).
router.post('/', requireStepUp('consent:grant'), wrap(async (req, res) => {
  const { relyingPartyId, scopes, purpose, expiresAt } = req.body;
  const userId         = req.user.sub;
  const idempotencyKey = req.headers['idempotency-key'] || null;

  if (!relyingPartyId || !Array.isArray(scopes) || scopes.length === 0 || !purpose) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'relyingPartyId, a non-empty scopes array, and purpose are required.' } });
  }

  const rp = await getRelyingPartyById(relyingPartyId);
  if (!rp) {
    (req.log ?? log).warn({ userId, relyingPartyId }, 'Grant creation failed — RP not found');
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Relying party not found.' } });
  }

  const allowedSet = new Set(rp.allowedScopes);
  for (const scope of scopes) {
    if (!allowedSet.has(scope)) {
      (req.log ?? log).warn({ userId, relyingPartyId, scope }, 'Grant creation failed — scope not permitted for RP');
      return res.status(403).json({
        error: { code: 'SCOPE_INSUFFICIENT', message: `Scope '${scope}' is not permitted for this relying party.` },
      });
    }
  }

  const { id: grantId, created } = await createGrant(userId, relyingPartyId, scopes, purpose, expiresAt || null, idempotencyKey);

  // Only emit the audit event + broadcast on a genuinely new grant — a replayed
  // Idempotency-Key returns the original grant without side effects.
  if (created) {
    await insertAuditEvent(grantId, userId, 'GRANT_CREATED', 'user', userId, { relyingPartyId, scopes, purpose });
    const grant = await getGrantById(grantId);
    broadcastToUser(userId, { type: 'CONSENT_GRANTED', grant });
    (req.log ?? log).info({ grantId, userId, relyingPartyId, rpName: rp.name, scopes }, 'Consent grant created');
    return res.status(201).json({ grant });
  }

  const grant = await getGrantById(grantId);
  (req.log ?? log).info({ grantId, userId, idempotent: true }, 'Consent grant returned via idempotency key');
  res.status(200).json({ grant });
}));

// DELETE /v1/consents/:grantId — revoke a grant (sensitive → step-up gated, S2)
router.delete('/:grantId', requireStepUp('consent:revoke'), wrap(async (req, res) => {
  const userId    = req.user.sub;
  const { grantId } = req.params;

  const grant = await getGrantById(grantId);
  if (!grant) {
    (req.log ?? log).debug({ grantId, userId }, 'Revoke failed — grant not found');
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Grant not found.' } });
  }
  if (grant.user_id !== userId) {
    (req.log ?? log).warn({ requesterId: userId, grantOwnerId: grant.user_id, grantId }, 'Forbidden — revoke consent');
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  }
  if (grant.status === 'REVOKED') {
    (req.log ?? log).debug({ grantId, userId }, 'Revoke skipped — grant already revoked');
    return res.status(409).json({ error: { code: 'CONSENT_REVOKED', message: 'This consent was already revoked.' } });
  }

  const success = await revokeGrant(grantId, userId);
  if (!success) {
    (req.log ?? log).error({ grantId, userId }, 'DB revokeGrant returned false unexpectedly');
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to revoke grant.' } });
  }

  await insertAuditEvent(grantId, userId, 'REVOKED', 'user', userId, {
    revokedBy: 'user', relyingPartyId: grant.relying_party_id,
  });

  const updated = await getGrantById(grantId);
  broadcastToUser(userId, { type: 'CONSENT_REVOKED', grant: updated });

  (req.log ?? log).info({ grantId, userId, relyingPartyId: grant.relying_party_id }, 'Consent grant revoked');

  res.json({ grant: updated });
}));

module.exports = router;
