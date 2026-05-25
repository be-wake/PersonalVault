'use strict';

// MB-I-015 through MB-I-021
// WebSocket / log shipping integration tests.
// Most test the real WS behaviour against a live backend — skipped without TEST_API_URL.
// A few test the logShipper HTTP endpoint.

jest.mock('expo-secure-store', () => ({
  getItemAsync:    jest.fn(),
  setItemAsync:    jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    currentState: 'active',
  },
}));

jest.mock('../../src/lib/logger', () => ({
  __esModule: true,
  default: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  registerShipper:   jest.fn(),
  unregisterShipper: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';
const mockGetToken = SecureStore.getItemAsync as jest.Mock;

const API_URL = process.env.TEST_API_URL;
const ACCESS_TOKEN = process.env.TEST_ACCESS_TOKEN;
const RUN = !!(API_URL && ACCESS_TOKEN);

const describeOrSkip = RUN ? describe : describe.skip;

// ── WebSocket connection ───────────────────────────────────────────────────────

describeOrSkip('WebSocket integration (live)', () => {
  it('MB-I-015 connects via Sec-WebSocket-Protocol and receives CONNECTED message', (done) => {
    const wsBase = (API_URL as string).replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsBase}/v1/ws`, [`pdv.token.${ACCESS_TOKEN}`]);
    const timer = setTimeout(() => {
      ws.close();
      done(new Error('Timed out waiting for CONNECTED message'));
    }, 5000);

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data as string);
      if (msg.type === 'CONNECTED') {
        clearTimeout(timer);
        ws.close();
        done();
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      done(new Error('WebSocket connection error'));
    };
  });

  it('MB-I-016 PING message does not close the connection', (done) => {
    const wsBase = (API_URL as string).replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsBase}/v1/ws`, [`pdv.token.${ACCESS_TOKEN}`]);
    const timer = setTimeout(() => {
      ws.close();
      done(new Error('Timed out'));
    }, 5000);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'PING' }));
      setTimeout(() => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        clearTimeout(timer);
        ws.close();
        done();
      }, 500);
    };
  });

  it('MB-I-017 connection is rejected without a valid JWT', (done) => {
    const wsBase = (API_URL as string).replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsBase}/v1/ws`, ['pdv.token.invalid-jwt']);
    const timer = setTimeout(() => {
      ws.close();
      done(new Error('Expected rejection but got open'));
    }, 5000);

    ws.onerror = () => {
      clearTimeout(timer);
      done(); // expected
    };
    ws.onopen = () => {
      // Some servers send a close instead of error
    };
    ws.onclose = (evt) => {
      if (evt.code !== 1000) {
        clearTimeout(timer);
        done();
      }
    };
  });
});

// ── Log shipping HTTP endpoint ─────────────────────────────────────────────────

describeOrSkip('Log shipping integration', () => {
  it('MB-I-018 POST /v1/logs accepts a batch of log entries', async () => {
    const res = await fetch(`${API_URL}/v1/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        entries: [
          {
            level: 'info',
            module: 'integration-test',
            message: 'test log entry',
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    expect([200, 204]).toContain(res.status);
  });

  it('MB-I-019 POST /v1/logs returns 401 without Authorization header', async () => {
    const res = await fetch(`${API_URL}/v1/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: [] }),
    });
    expect(res.status).toBe(401);
  });

  it('MB-I-020 POST /v1/logs accepts empty entries array', async () => {
    const res = await fetch(`${API_URL}/v1/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ entries: [] }),
    });
    expect([200, 204]).toContain(res.status);
  });

  it('MB-I-021 POST /v1/logs returns 400 for missing entries field', async () => {
    const res = await fetch(`${API_URL}/v1/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ data: 'wrong shape' }),
    });
    expect([400, 422]).toContain(res.status);
  });
});
