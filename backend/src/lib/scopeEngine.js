'use strict';

/**
 * Scope policy engine + response masking.
 *
 * Implements the scope catalogue and masking rules defined in the design
 * document (Personal Data Vault SDD § 3.2 / 3.3).
 *
 *   NONE    → value returned as-is
 *   PARTIAL → type-specific redaction (last-4 for phones / gov-id; year-only
 *             for DOB; local-part-masked for email)
 *   FULL    → field replaced with `{ present: bool }`
 *   HASH    → SHA-256 hex of the value (useful for matching without disclosure)
 *
 * Each scope maps to a set of (resource, field) pairs. `projectForScopes` takes
 * a fully-hydrated vault row and the granted scopes and returns the masked
 * projection that's safe to ship to a relying party.
 */

const { sha256 } = require('./crypto');

// ── Scope catalogue ──────────────────────────────────────────────────────────

const SCOPES = {
  'identity:name':    { resource: 'identity', fields: ['first_name', 'last_name'],        mask: 'NONE',    pci: false },
  'identity:email':   { resource: 'identity', fields: ['email_primary'],                  mask: 'NONE',    pci: false },
  'identity:dob':     { resource: 'identity', fields: ['date_of_birth'],                  mask: 'PARTIAL', pci: false },
  'identity:gov_id':  { resource: 'identity', fields: ['id_type', 'id_number'],           mask: 'PARTIAL', pci: false },
  'address:current':  { resource: 'address',  fields: ['line1', 'line2', 'city', 'state', 'postal', 'country'], mask: 'NONE', pci: false },
  'address:history':  { resource: 'address_history', fields: ['line1', 'line2', 'city', 'state', 'postal', 'country', 'effective_from', 'effective_to'], mask: 'NONE', pci: false },
  'payment:card_ref': { resource: 'payment',  fields: ['card_token', 'card_type', 'last_4', 'expiry_mm_yy'], mask: 'NONE', pci: true },
  'contacts:phone':   { resource: 'contacts', fields: ['phone_primary', 'phone_type'],    mask: 'PARTIAL', pci: false },
  'contacts:all':     { resource: 'contacts', fields: ['phone_primary', 'phone_type', 'email_secondary', 'social_handles'], mask: 'NONE', pci: false },
};

const KNOWN_SCOPES = new Set(Object.keys(SCOPES));

function isKnown(scope) { return KNOWN_SCOPES.has(scope); }

// ── Masking helpers ──────────────────────────────────────────────────────────

function partialMask(field, value) {
  if (value === null || value === undefined || value === '') return value;
  const s = String(value);
  switch (field) {
    case 'date_of_birth': {
      const year = s.slice(0, 4);
      return year.length === 4 ? `${year}-**-**` : '****';
    }
    case 'id_number': {
      const last4 = s.slice(-4);
      return `${'*'.repeat(Math.max(0, s.length - 4))}${last4}`;
    }
    case 'phone_primary': {
      const last4 = s.replace(/\D/g, '').slice(-4);
      return `****${last4}`;
    }
    case 'email_primary':
    case 'email_secondary': {
      const [local, domain] = s.split('@');
      if (!domain) return '***';
      const visible = local.slice(0, 1);
      return `${visible}${'*'.repeat(Math.max(0, local.length - 1))}@${domain}`;
    }
    default: {
      // Default partial: keep first and last char.
      if (s.length <= 2) return '*'.repeat(s.length);
      return `${s[0]}${'*'.repeat(s.length - 2)}${s.slice(-1)}`;
    }
  }
}

function applyMask(rule, field, value) {
  switch (rule) {
    case 'NONE':    return value;
    case 'PARTIAL': return partialMask(field, value);
    case 'FULL':    return { present: value !== null && value !== undefined && value !== '' };
    case 'HASH':    return value ? sha256(value) : null;
    default:        return value;
  }
}

/**
 * Project a (resource → row) map down to only the fields/values permitted
 * by the granted scopes, applying the scope's mask rule on each field.
 *
 *   data = { identity: {...}, address: {...}, payment: [{...}], contacts: {...} }
 *
 * Returns:
 *   { identity: { first_name, last_name }, address: {...}, ... }
 */
function projectForScopes(data, grantedScopes, perScopeMaskOverride = {}) {
  const out = {};
  for (const scope of grantedScopes) {
    const def = SCOPES[scope];
    if (!def) continue;
    const mask = perScopeMaskOverride[scope] || def.mask;
    const src  = data[def.resource];
    if (src === null || src === undefined) continue;

    if (Array.isArray(src)) {
      out[def.resource] = src.map(row => projectRow(row, def.fields, mask));
    } else {
      const projected = projectRow(src, def.fields, mask);
      out[def.resource] = { ...(out[def.resource] || {}), ...projected };
    }
  }
  return out;
}

function projectRow(row, fields, mask) {
  const projected = {};
  for (const f of fields) {
    if (f in row) projected[f] = applyMask(mask, f, row[f]);
  }
  return projected;
}

/**
 * Filter a requested-scope list against the maximum allowed for an RP and
 * return { allowed, denied }.
 */
function partitionByRPAllowlist(requested, rpAllowedScopes) {
  const allowSet = new Set(rpAllowedScopes);
  const allowed  = [];
  const denied   = [];
  for (const s of requested) {
    if (!isKnown(s))       denied.push({ scope: s, reason: 'unknown' });
    else if (!allowSet.has(s)) denied.push({ scope: s, reason: 'not_permitted_for_rp' });
    else                       allowed.push(s);
  }
  return { allowed, denied };
}

module.exports = {
  SCOPES,
  isKnown,
  applyMask,
  partialMask,
  projectForScopes,
  partitionByRPAllowlist,
};
