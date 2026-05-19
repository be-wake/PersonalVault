const express = require('express');
const {
  createGrant, getGrantsByUser, getGrantById, revokeGrant,
  getRelyingPartyById, insertAuditEvent
} = require('../db');
const { verifyToken } = require('../middleware/auth');
const { broadcastToUser } = require('../ws');

const router = express.Router();
router.use(verifyToken);

// GET /v1/consents/:userId — list all grants for a user
router.get('/:userId', (req, res) => {
  if (req.params.userId !== req.user.sub) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  }
  const grants = getGrantsByUser(req.params.userId);
  res.json({ grants });
});

// GET /v1/consents/:userId/:grantId — get a single grant with full detail
router.get('/:userId/:grantId', (req, res) => {
  if (req.params.userId !== req.user.sub) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  }
  const grant = getGrantById(req.params.grantId);
  if (!grant || grant.user_id !== req.params.userId) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Grant not found.' } });
  }
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
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Relying party not found.' } });
  }

  // Validate requested scopes are a subset of what this RP is allowed
  const allowedSet = new Set(rp.allowedScopes);
  for (const scope of scopes) {
    if (!allowedSet.has(scope)) {
      return res.status(403).json({
        error: { code: 'SCOPE_INSUFFICIENT', message: `Scope '${scope}' is not permitted for this relying party.` }
      });
    }
  }

  const grantId = createGrant(userId, relyingPartyId, scopes, purpose, expiresAt || null);

  insertAuditEvent(grantId, userId, 'GRANT_CREATED', 'user', userId, {
    relyingPartyId,
    scopes,
    purpose
  });

  const grant = getGrantById(grantId);
  broadcastToUser(userId, { type: 'CONSENT_GRANTED', grant });

  res.status(201).json({ grant });
});

// DELETE /v1/consents/:grantId — revoke a grant
router.delete('/:grantId', (req, res) => {
  const userId = req.user.sub;
  const { grantId } = req.params;

  const grant = getGrantById(grantId);
  if (!grant) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Grant not found.' } });
  }
  if (grant.user_id !== userId) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  }
  if (grant.status === 'REVOKED') {
    return res.status(409).json({ error: { code: 'CONSENT_REVOKED', message: 'This consent was already revoked.' } });
  }

  const success = revokeGrant(grantId, userId);
  if (!success) {
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to revoke grant.' } });
  }

  insertAuditEvent(grantId, userId, 'REVOKED', 'user', userId, {
    revokedBy: 'user',
    relyingPartyId: grant.relying_party_id
  });

  const updated = getGrantById(grantId);
  broadcastToUser(userId, { type: 'CONSENT_REVOKED', grant: updated });

  // In production: send webhook to rp.webhookUrl here via notification-svc

  res.json({ grant: updated });
});

module.exports = router;
