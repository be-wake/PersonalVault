const express = require('express');
const { getAllRelyingParties, getRelyingPartyById } = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken);

// GET /v1/relying-parties
router.get('/', (req, res) => {
  const parties = getAllRelyingParties();
  res.json({ relyingParties: parties });
});

// GET /v1/relying-parties/:id
router.get('/:id', (req, res) => {
  const rp = getRelyingPartyById(req.params.id);
  if (!rp) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Relying party not found.' } });
  }
  res.json({ relyingParty: rp });
});

module.exports = router;
