'use strict';

/**
 * Data-subject rights endpoints.
 *
 *   GET    /v1/account/export         — GDPR Art. 20 / DPDPA S.11 portability (F10)
 *   GET    /v1/account/audit/verify   — verify the tamper-evident audit chain (F14)
 *   DELETE /v1/account                — GDPR Art. 17 / DPDPA S.12 erasure (F9)
 *   DELETE /v1/account/vault/:resource — per-resource erasure (F9)
 *
 * All routes act on the authenticated user (req.user.sub) — there is no
 * cross-user access here.
 */

const express = require('express');
const {
  exportUserData, deleteAccount, deleteVaultResource,
  verifyAuditChain, insertAuditEvent,
} = require('../db');
const { verifyToken }   = require('../middleware/auth');
const { requireStepUp } = require('../middleware/stepUp');
const logger = require('../lib/logger');

const log    = logger.child({ module: 'route:account' });
const router = express.Router();
router.use(verifyToken);

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

const ERASABLE_RESOURCES = new Set(['identity', 'address', 'payment', 'contacts']);

// GET /v1/account/export — full machine-readable snapshot (F10)
router.get('/export', wrap(async (req, res) => {
  const userId = req.user.sub;
  const data   = await exportUserData(userId);
  await insertAuditEvent(null, userId, 'ACCESS', 'user', userId, { resource: 'account', action: 'EXPORT' });
  (req.log ?? log).info({ userId }, 'Data export generated');
  res.setHeader('Content-Disposition', 'attachment; filename="pdv-export.json"');
  res.json(data);
}));

// GET /v1/account/audit/verify — recompute the hash chain (F14)
router.get('/audit/verify', wrap(async (req, res) => {
  const result = await verifyAuditChain(req.user.sub);
  (req.log ?? log).info({ userId: req.user.sub, ok: result.ok, count: result.count }, 'Audit chain verified');
  res.json(result);
}));

// DELETE /v1/account — full account erasure (F9). Sensitive → step-up gated (S2).
router.delete('/', requireStepUp('account:delete'), wrap(async (req, res) => {
  const userId = req.user.sub;
  const ok = await deleteAccount(userId);
  if (!ok) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Account not found.' } });
  }
  // NOTE: the audit trail is deleted with the account, so we log to stdout only.
  (req.log ?? log).info({ userId }, 'Account erased (GDPR Art. 17)');
  res.json({ success: true });
}));

// DELETE /v1/account/vault/:resource — clear one vault resource (F9)
router.delete('/vault/:resource', wrap(async (req, res) => {
  const userId   = req.user.sub;
  const resource = String(req.params.resource).toLowerCase();
  if (!ERASABLE_RESOURCES.has(resource)) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: `resource must be one of: ${[...ERASABLE_RESOURCES].join(', ')}` },
    });
  }
  await deleteVaultResource(userId, resource);
  await insertAuditEvent(null, userId, 'ACCESS', 'user', userId, { resource, action: 'ERASE' });
  (req.log ?? log).info({ userId, resource }, 'Vault resource erased');
  res.json({ success: true });
}));

module.exports = router;
