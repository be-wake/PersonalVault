'use strict';

const express  = require('express');
const {
  getIdentity, upsertIdentity,
  getCurrentAddress, getAddressHistory, upsertAddress,
  getPaymentCards, addPaymentCard, removePaymentCard,
  getContacts, upsertContacts,
  insertAuditEvent,
} = require('../db');
const { verifyToken } = require('../middleware/auth');
const { requireStepUp } = require('../middleware/stepUp');
const logger   = require('../lib/logger');

const log    = logger.child({ module: 'route:vault' });
const router = express.Router();
router.use(verifyToken);

// Propagates async errors to Express's global error handler
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

// E8 — server-side whitelist for card brands.
const ALLOWED_CARD_TYPES = new Set(['visa', 'mastercard', 'amex', 'discover', 'rupay']);

// F11 — DPDPA S.16: minors require verifiable parental consent. We block until
// that flow exists. Returns age in whole years, or null if DOB unparseable.
function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

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

  // F11 — block under-18 (DPDPA S.16 parental-consent requirement not yet built).
  if (req.body && req.body.date_of_birth !== undefined && req.body.date_of_birth !== null && req.body.date_of_birth !== '') {
    const age = ageFromDob(req.body.date_of_birth);
    if (age !== null && age < 18) {
      (req.log ?? log).warn({ userId: req.params.userId, age }, 'Identity update blocked — minor');
      return res.status(403).json({
        error: { code: 'MINOR_CONSENT_REQUIRED', message: 'Users under 18 require verifiable parental consent, which is not yet supported.' },
      });
    }
  }

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

// F7 — address:history scope: all addresses, newest first (current + archived).
router.get('/address/:userId/history', wrap(async (req, res) => {
  if (req.params.userId !== req.user.sub) return forbidden(req, res);
  const history = await getAddressHistory(req.params.userId);
  (req.log ?? log).debug({ userId: req.params.userId, count: history.length }, 'Read address history');
  res.json({ history });
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

// Adding a card is sensitive → step-up gated (S2).
router.post('/payment/:userId/cards', requireStepUp('payment:add_card'), wrap(async (req, res) => {
  if (req.params.userId !== req.user.sub) return forbidden(req, res);
  const { card_type, last_4, expiry_mm_yy } = req.body;

  if (!card_type || !last_4 || !expiry_mm_yy) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'card_type, last_4, and expiry_mm_yy are required.' } });
  }

  // E8 — card brand whitelist
  const brand = String(card_type).toLowerCase();
  if (!ALLOWED_CARD_TYPES.has(brand)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `card_type must be one of: ${[...ALLOWED_CARD_TYPES].join(', ')}` } });
  }

  if (!/^\d{4}$/.test(last_4)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'last_4 must be exactly 4 digits.' } });
  }

  // E9 — expiry format MM/YY and must be in the future
  const m = /^(\d{2})\/(\d{2})$/.exec(expiry_mm_yy);
  if (!m) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'expiry_mm_yy must be in MM/YY format.' } });
  }
  const month = Number(m[1]);
  const year  = 2000 + Number(m[2]);
  if (month < 1 || month > 12) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'expiry month must be 01–12.' } });
  }
  // Card is valid through the last day of its expiry month.
  const expiryEnd = new Date(year, month, 0, 23, 59, 59);
  if (expiryEnd < new Date()) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Card has already expired.' } });
  }

  const cardId = await addPaymentCard(req.params.userId, { card_type: brand, last_4, expiry_mm_yy });
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
