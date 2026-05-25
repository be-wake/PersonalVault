'use strict';

// BE-U-038 through BE-U-040
// Tests sendRevocationWebhook (public API) which internally calls deliver().
// We mock globalThis.fetch to inspect calls and simulate failures.

const { sendRevocationWebhook } = require('../../../src/lib/webhooks');

const mockRp = {
  id:         'rp-uuid-1',
  webhook_url: 'https://example-rp.com/webhook',
};

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('sendRevocationWebhook (via deliver)', () => {
  it('BE-U-038 sends POST with X-PDV-Signature header', async () => {
    const mockFetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    });

    await sendRevocationWebhook({ rp: mockRp, grantId: 'g-1', userId: 'u-1' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe(mockRp.webhook_url);
    expect(opts.method).toBe('POST');
    expect(opts.headers['X-PDV-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(opts.headers['X-PDV-Event']).toBe('consent.revoked');
  });

  it('BE-U-039 retries up to 3 times on network failure (4 fetch calls total)', async () => {
    jest.useFakeTimers();
    const mockFetch = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));

    const deliverPromise = sendRevocationWebhook({ rp: mockRp, grantId: 'g-2', userId: 'u-2' });

    // Advance through all retry back-off delays (500 + 2000 + 5000 ms)
    await jest.advanceTimersByTimeAsync(10_000);
    const result = await deliverPromise;

    // 1 initial attempt + 3 retries = 4 total calls
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(result.ok).toBe(false);
  });

  it('BE-U-040 uses exponential back-off: each retry delay is longer than the last', async () => {
    jest.useFakeTimers();
    const callTimestamps = [];
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      callTimestamps.push(Date.now());
      throw new Error('fail');
    });

    const p = sendRevocationWebhook({ rp: mockRp, grantId: 'g-3', userId: 'u-3' });
    await jest.advanceTimersByTimeAsync(10_000);
    await p;

    // Gaps between consecutive calls should be increasing
    expect(callTimestamps).toHaveLength(4);
    const gaps = callTimestamps.slice(1).map((t, i) => t - callTimestamps[i]);
    // gap[1] (2000ms) > gap[0] (500ms), gap[2] (5000ms) > gap[1] (2000ms)
    expect(gaps[1]).toBeGreaterThan(gaps[0]);
    expect(gaps[2]).toBeGreaterThan(gaps[1]);
  });

  it('skips delivery and returns ok:true when RP has no webhook_url', async () => {
    const mockFetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200 });
    const result = await sendRevocationWebhook({ rp: { id: 'rp-no-hook' }, grantId: 'g-4', userId: 'u-4' });
    expect(result).toEqual({ ok: true, skipped: true });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
