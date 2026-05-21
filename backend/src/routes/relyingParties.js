'use strict';

const express = require('express');
const { getAllRelyingParties, getRelyingPartyById } = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken);

// Propagates async errors to Express's global error handler
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

// GET /v1/relying-parties
router.get('/', wrap(async (req, res) => {
  const parties = await getAllRelyingParties();
  res.json({ relyingParties: parties });
}));

// GET /v1/relying-parties/:id
router.get('/:id', wrap(async (req, res) => {
  const rp = await getRelyingPartyById(req.params.id);
  if (!rp) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Relying party not found.' } });
  }
  res.json({ relyingParty: rp });
}));

module.exports = router;
