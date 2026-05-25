'use strict';

/**
 * Consent-revocation cache.
 *
 * Revoked grant IDs are stored with a TTL equal to the access-token lifetime so
 * tokens issued just before revocation are blocked within seconds.
 * Falls back to an in-memory map when REDIS_CONNECTION_STRING is not set.
 */

const logger = require('./logger');

const log = logger.child({ module: 'redis' });

const TTL_SECONDS = Number(process.env.REVOCATION_CACHE_TTL_SECONDS) || 15 * 60;

let impl;

function memoryImpl() {
  const map = new Map(); // grantId → expiresAtMs
  return {
    name: 'memory',
    async revokeGrant(grantId) {
      map.set(grantId, Date.now() + TTL_SECONDS * 1000);
    },
    async isRevoked(grantId) {
      const exp = map.get(grantId);
      if (!exp) return false;
      if (exp < Date.now()) { map.delete(grantId); return false; }
      return true;
    },
    async close() { map.clear(); },
  };
}

function redisImpl(conn) {
  const Redis = require('ioredis');
  const client = new Redis(conn, { lazyConnect: true, maxRetriesPerRequest: 3 });
  client.on('error', err => log.warn({ err }, 'Redis error'));
  client.connect().then(() => log.info('Redis connected')).catch(err => log.error({ err }, 'Redis connect failed'));
  return {
    name: 'redis',
    async revokeGrant(grantId) {
      await client.set(`pdv:revoked:${grantId}`, '1', 'EX', TTL_SECONDS);
    },
    async isRevoked(grantId) {
      const v = await client.get(`pdv:revoked:${grantId}`);
      return v === '1';
    },
    async close() { await client.quit().catch(() => {}); },
  };
}

function getClient() {
  if (impl) return impl;
  const conn = process.env.REDIS_CONNECTION_STRING;
  if (conn) {
    impl = redisImpl(conn);
    log.info('Using Redis for revocation cache');
  } else {
    impl = memoryImpl();
    log.warn('REDIS_CONNECTION_STRING not set — using in-memory revocation cache (single-instance only)');
  }
  return impl;
}

module.exports = {
  revokeGrant:   (grantId) => getClient().revokeGrant(grantId),
  isRevoked:     (grantId) => getClient().isRevoked(grantId),
  close:         ()        => getClient().close(),
  implName:      ()        => getClient().name,
};
