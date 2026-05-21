'use strict';

const express  = require('express');
const {
  getIdentity, upsertIdentity,
  getCurrentAddress, upsertAddress,
  getPaymentCards, addPaymentCard, removePaymentCard,
  getContacts, upsertContacts,
  insertAuditEvent,
} = require('../db');
const { verifyToken } = require('../middleware/auth');
const logger   = require('../lib/logger');

const log    = logger.child({ module: 'route:vault' });
const router = express.Router();
router.use(verifyToken);

// Propagates async errors to Express's global error handler
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

function forbidden(req, res) {
  (req.log ?? log).warn(
    { requesterId: req.user.sub, targetId: req.params.userId, path: req.path },
    'Forbidden — vault access'
  );
  return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
}

// ─── IDENTITY ─────────────────────────────────────────────────────────────────

router.get('/identity/:userId', wrap(async (req, res) => {
  if (req.params.userId !== req.user.sub) return forbidden(req, res);
  const data = await getIdentity(req.params.userId);
  (req.log ?? log).debug({ userId: req.params.userId }, 'Read identity');
  res.json({ identity: data || {} });
}));

router.put('/identity/:userId', wrap(async (req, res) => {
  if (req.params.userId !== req.user.sub) return forbidden(req, res);
  await upsertIdentity(req.params.userId, req.body);
  await insertAuditEvent(null, req.params.userId, 'ACCESS', 'user', req.params.userId, { resource: 'identity', action: 'UPDATE' });
  const updated = await getIdentity(req.params.userId);
  (req.log ?? log).info({ userId: req.params.userId }, 'Updated identity');
  res.json({ identity: updated });
}));

// ─── ADDRESS ─────────────────────────────────────────────────────────────────

router.get('/address/:userId', wrap(async (req, res) => {
  if (req.params.userId !== req.user.sub) return forbidden(req, res);
  const data = await getCurrentAddress(req.params.userId);
  (req.log ?? log).debug({ userId: req.params.userId }, 'Read address');
  res.json({ address: data || {} });
}));

router.put('/address/:userId', wrap(async (req, res) => {
  if (req.params.userId !== req.user.sub) return forbidden(req, res);
  await upsertAddress(req.params.userId, req.body);
  await insertAuditEvent(null, req.params.userId, 'ACCESS', 'user', req.params.userId, { resource: 'address', action: 'UPDATE' });
  const updated = await getCurrentAddress(req.params.userId);
  (req.log ?? log).info({ userId: req.params.userId }, 'Updated address');
  res.json({ address: updated });
}));

// ─── PAYMENT ─────────────────────────────────────────────────────────────────

router.get('/payment/:userId/cards', wrap(async (req, res) => {
  if (req.params.userId !== req.user.sub) return forbidden(req, res);
  const cards = await getPaymentCards(req.params.userId);
  (req.log ?? log).debug({ userId: req.params.userId, count: cards.length }, 'Read payment cards');
  res.json({ cards });
}));

router.post('/payment/:userId/cards', wrap(async (req, res) => {
  if (req.params.userId !== req.user.sub) return forbidden(req, res);
  const { card_type, last_4, expiry_mm_yy } = req.body;
  if (!card_type || !last_4 || !expiry_mm_yy) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'card_type, last_4, and expiry_mm_yy are required.' } });
  }
  if (!/^\d{4}$/.test(last_4)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'last_4 must be exactly 4 digits.' } });
  }
  const cardId = await addPaymentCard(req.params.userId, { card_type, last_4, expiry_mm_yy });
  await insertAuditEvent(null, req.params.userId, 'ACCESS', 'user', req.params.userId, { resource: 'payment', action: 'ADD_CARD' });
  const cards = await getPaymentCards(req.params.userId);
  const card  = cards.find(c => c.id === cardId);
  (req.log ?? log).info({ userId: req.params.userId, cardId, cardType: card_type }, 'Added payment card');
  res.status(201).json({ card });
}));

router.delete('/payment/:userId/cards/:cardId', wrap(async (req, res) => {
  if (req.params.userId !== req.user.sub) return forbidden(req, res);
  const removed = await removePaymentCard(req.params.userId, req.params.cardId);
  if (!removed) {
    (req.log ?? log).debug({ userId: req.params.userId, cardId: req.params.cardId }, 'Remove card — not found');
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Card not found.' } });
  }
  await insertAuditEvent(null, req.params.userId, 'ACCESS', 'user', req.params.userId, { resource: 'payment', action: 'REMOVE_CARD' });
  (req.log ?? log).info({ userId: req.params.userId, cardId: req.params.cardId }, 'Removed payment card');
  res.json({ success: true });
}));

// ─── CONTACTS ────────────────────────────────────────────────────────────────

router.get('/contacts/:userId', wrap(async (req, res) => {
  if (req.params.userId !== req.user.sub) return forbidden(req, res);
  const data = await getContacts(req.params.userId);
  (req.log ?? log).debug({ userId: req.params.userId }, 'Read contacts');
  res.json({ contacts: data || {} });
}));

router.put('/contacts/:userId', wrap(async (req, res) => {
  if (req.params.userId !== req.user.sub) return forbidden(req, res);
  await upsertContacts(req.params.userId, req.body);
  await insertAuditEvent(null, req.params.userId, 'ACCESS', 'user', req.params.userId, { resource: 'contacts', action: 'UPDATE' });
  const updated = await getContacts(req.params.userId);
  (req.log ?? log).info({ userId: req.params.userId }, 'Updated contacts');
  res.json({ contacts: updated });
}));

module.exports = router;
