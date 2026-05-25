'use strict';

// BE-U-037
// SERVICE_BUS_CONNECTION_STRING is not set so the in-memory EventEmitter
// implementation is used.

const serviceBus = require('../../../src/lib/serviceBus');

afterAll(async () => {
  await serviceBus.close();
});

describe('serviceBus (in-memory mode)', () => {
  it('BE-U-037 publish() emits the event to in-process listeners', async () => {
    const handler = jest.fn();
    serviceBus.on('test.event', handler);

    await serviceBus.publish('test.event', { grantId: 'g-1', userId: 'u-1' });

    // EventEmitter dispatches synchronously, but publish is async — flush microtasks
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ grantId: 'g-1', userId: 'u-1' });
  });

  it('uses the in-memory implementation when no SERVICE_BUS_CONNECTION_STRING is set', () => {
    expect(serviceBus.implName()).toBe('memory');
  });
});
