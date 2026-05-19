const express = require('express');
const { getAuditEvents } = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken);

// GET /v1/audit/:userId?from=&to=&resource=&limit=
router.get('/:userId', (req, res) => {
  if (req.params.userId !== req.user.sub) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  }

  const { from, to, resource, limit } = req.query;
  const events = getAuditEvents(req.params.userId, {
    from: from || null,
    to: to || null,
    resource: resource || null,
    limit: limit ? parseInt(limit, 10) : 50
  });

  // Build human-readable labels from event type and metadata
  const formatted = events.map(e => ({
    ...e,
    label: buildLabel(e)
  }));

  res.json({ events: formatted });
});

function buildLabel(event) {
  const rp = event.rp_name || 'Unknown service';
  const meta = event.metadata || {};
  switch (event.event_type) {
    case 'GRANT_CREATED':
      return `You granted ${rp} access to your data`;
    case 'REVOKED':
      return `You revoked ${rp}'s access to your data`;
    case 'EXPIRED':
      return `${rp}'s access to your data expired`;
    case 'ACCESS':
      if (meta.action === 'UPDATE') return `You updated your ${meta.resource || 'vault'} data`;
      if (meta.action === 'ADD_CARD') return 'You added a new payment card';
      if (meta.action === 'REMOVE_CARD') return 'You removed a payment card';
      return `${rp} accessed your data`;
    case 'SCOPE_CHANGED':
      return `${rp}'s access scope was updated`;
    case 'GRANT_RENEWED':
      return `You renewed ${rp}'s access`;
    default:
      return `Event: ${event.event_type}`;
  }
}

module.exports = router;
