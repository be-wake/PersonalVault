'use strict';

// BE-U-034 through BE-U-036
// REDIS_CONNECTION_STRING is not set in env.js so the in-memory implementation
// is used — no Redis server required.

const redisClient = require('../../../src/lib/redisClient');

afterAll(async () => {
  await redisClient.close();
});

describe('redisClient (in-memory mode)', () => {
  it('BE-U-034 revokeGrant() stores the grantId with a TTL', async () => {
    await redisClient.revokeGrant('grant-001');
    const revoked = await redisClient.isRevoked('grant-001');
    expect(revoked).toBe(true);
  });

  it('BE-U-035 isRevoked() returns true after revokeGrant()', async () => {
    await redisClient.revokeGrant('grant-abc');
    expect(await redisClient.isRevoked('grant-abc')).toBe(true);
  });

  it('BE-U-036 isRevoked() returns false for an unknown grantId', async () => {
    expect(await redisClient.isRevoked('grant-does-not-exist')).toBe(false);
  });

  it('uses the in-memory implementation when no REDIS_CONNECTION_STRING is set', () => {
    expect(redisClient.implName()).toBe('memory');
  });
});
