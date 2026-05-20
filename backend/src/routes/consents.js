'use strict';

const express  = require('express');
const {
  createGrant, getGrantsByUser, getGrantById, revokeGrant,
  getRelyingPartyById, insertAuditEvent,
} = require('../db');
const { verifyToken } = require('../middleware/auth');
const { broadcastToUser } = require('../ws');
const logger   = require('../lib/logger');

const log    = logger.child({ module: 'route:consents' });
const router = express.Router();
router.use(verifyToken);

// GET /v1/consents/:userId — list all grants
router.get('/:userId', (req, res) => {
  if (req.params.userId !== req.user.sub) {
    (req.log ?? log).warn({ requesterId: req.user.sub, targetId: req.params.userId }, 'Forbidden — list consents');
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  }
  const grants = getGrantsByUser(req.params.userId);
  (req.log ?? log).debug({ userId: req.params.userId, count: grants.length }, 'Listed consent grants');
  res.json({ grants });
});

// GET /v1/consents/:userId/:grantId — get a single grant
router.get('/:userId/:grantId', (req, res) => {
  if (req.params.userId !== req.user.sub) {
    (req.log ?? log).warn({ requesterId: req.user.sub, targetId: req.params.userId }, 'Forbidden — get consent');
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  }
  const grant = getGrantById(req.params.grantId);
  if (!grant || grant.user_id !== req.params.userId) {
    (req.log ?? log).debug({ grantId: req.params.grantId, userId: req.params.userId }, 'Grant not found');
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Grant not found.' } });
  }
  (req.log ?? log).debug({ grantId: grant.id, userId: req.params.userId }, 'Fetched consent grant');
  res.json({ grant });
});

// POST /v1/consents — create a new consent grant
router.post('/', (req, res) => {
  const { relyingPartyId, scopes, purpose, expiresAt } = req.body;
  const userId = req.user.sub;

  if (!relyingPartyId || !scopes || !purpose) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'relyingPartyId, scopes, and purpose are required.' } });
  }

  const rp = getRelyingPartyById(relyingPartyId);
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

  const grantId = createGrant(userId, relyingPartyId, scopes, purpose, expiresAt || null);

  insertAuditEvent(grantId, userId, 'GRANT_CREATED', 'user', userId, { relyingPartyId, scopes, purpose });

  const grant = getGrantById(grantId);
  broadcastToUser(userId, { type: 'CONSENT_GRANTED', grant });

  (req.log ?? log).info({ grantId, userId, relyingPartyId, rpName: rp.name, scopes }, 'Consent grant created');

  res.status(201).json({ grant });
});

// DELETE /v1/consents/:grantId — revoke a grant
router.delete('/:grantId', (req, res) => {
  const userId    = req.user.sub;
  const { grantId } = req.params;

  const grant = getGrantById(grantId);
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

  const success = revokeGrant(grantId, userId);
  if (!success) {
    (req.log ?? log).error({ grantId, userId }, 'DB revokeGrant returned false unexpectedly');
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to revoke grant.' } });
  }

  insertAuditEvent(grantId, userId, 'REVOKED', 'user', userId, {
    revokedBy: 'user', relyingPartyId: grant.relying_party_id,
  });

  const updated = getGrantById(grantId);
  broadcastToUser(userId, { type: 'CONSENT_REVOKED', grant: updated });

  (req.log ?? log).info({ grantId, userId, relyingPartyId: grant.relying_party_id }, 'Consent grant revoked');

  res.json({ grant: updated });
});

module.exports = router;
