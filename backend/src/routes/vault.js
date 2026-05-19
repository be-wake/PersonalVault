const express = require('express');
const {
  getIdentity, upsertIdentity,
  getCurrentAddress, upsertAddress,
  getPaymentCards, addPaymentCard, removePaymentCard,
  getContacts, upsertContacts,
  insertAuditEvent
} = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken);

// ─── IDENTITY ─────────────────────────────────────────────────────────────────

// GET /v1/identity/:userId
router.get('/identity/:userId', (req, res) => {
  if (req.params.userId !== req.user.sub) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  }
  const data = getIdentity(req.params.userId);
  res.json({ identity: data || {} });
});

// PUT /v1/identity/:userId
router.put('/identity/:userId', (req, res) => {
  if (req.params.userId !== req.user.sub) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  }
  upsertIdentity(req.params.userId, req.body);
  insertAuditEvent(null, req.params.userId, 'ACCESS', 'user', req.params.userId, { resource: 'identity', action: 'UPDATE' });
  const updated = getIdentity(req.params.userId);
  res.json({ identity: updated });
});

// ─── ADDRESS ─────────────────────────────────────────────────────────────────

// GET /v1/address/:userId
router.get('/address/:userId', (req, res) => {
  if (req.params.userId !== req.user.sub) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  }
  const data = getCurrentAddress(req.params.userId);
  res.json({ address: data || {} });
});

// PUT /v1/address/:userId
router.put('/address/:userId', (req, res) => {
  if (req.params.userId !== req.user.sub) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  }
  upsertAddress(req.params.userId, req.body);
  insertAuditEvent(null, req.params.userId, 'ACCESS', 'user', req.params.userId, { resource: 'address', action: 'UPDATE' });
  const updated = getCurrentAddress(req.params.userId);
  res.json({ address: updated });
});

// ─── PAYMENT ─────────────────────────────────────────────────────────────────

// GET /v1/payment/:userId/cards
router.get('/payment/:userId/cards', (req, res) => {
  if (req.params.userId !== req.user.sub) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  }
  const cards = getPaymentCards(req.params.userId);
  res.json({ cards });
});

// POST /v1/payment/:userId/cards
router.post('/payment/:userId/cards', (req, res) => {
  if (req.params.userId !== req.user.sub) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  }
  const { card_type, last_4, expiry_mm_yy } = req.body;
  if (!card_type || !last_4 || !expiry_mm_yy) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'card_type, last_4, and expiry_mm_yy are required.' } });
  }
  if (!/^\d{4}$/.test(last_4)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'last_4 must be exactly 4 digits.' } });
  }
  const cardId = addPaymentCard(req.params.userId, { card_type, last_4, expiry_mm_yy });
  insertAuditEvent(null, req.params.userId, 'ACCESS', 'user', req.params.userId, { resource: 'payment', action: 'ADD_CARD' });
  const cards = getPaymentCards(req.params.userId);
  const card = cards.find(c => c.id === cardId);
  res.status(201).json({ card });
});

// DELETE /v1/payment/:userId/cards/:cardId
router.delete('/payment/:userId/cards/:cardId', (req, res) => {
  if (req.params.userId !== req.user.sub) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  }
  const removed = removePaymentCard(req.params.userId, req.params.cardId);
  if (!removed) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Card not found.' } });
  }
  insertAuditEvent(null, req.params.userId, 'ACCESS', 'user', req.params.userId, { resource: 'payment', action: 'REMOVE_CARD' });
  res.json({ success: true });
});

// ─── CONTACTS ────────────────────────────────────────────────────────────────

// GET /v1/contacts/:userId
router.get('/contacts/:userId', (req, res) => {
  if (req.params.userId !== req.user.sub) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  }
  const data = getContacts(req.params.userId);
  res.json({ contacts: data || {} });
});

// PUT /v1/contacts/:userId
router.put('/contacts/:userId', (req, res) => {
  if (req.params.userId !== req.user.sub) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  }
  upsertContacts(req.params.userId, req.body);
  insertAuditEvent(null, req.params.userId, 'ACCESS', 'user', req.params.userId, { resource: 'contacts', action: 'UPDATE' });
  const updated = getContacts(req.params.userId);
  res.json({ contacts: updated });
});

module.exports = router;
