'use strict';

// MB-U-023 through MB-U-026

import createLogger, { registerShipper, unregisterShipper, LogEntry } from '../../../src/lib/logger';

beforeEach(() => {
  unregisterShipper();
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_LOG_ENABLED = 'true';
  process.env.EXPO_PUBLIC_LOG_LEVEL = 'debug';
});

afterEach(() => {
  unregisterShipper();
  delete process.env.EXPO_PUBLIC_LOG_ENABLED;
  delete process.env.EXPO_PUBLIC_LOG_LEVEL;
});

describe('createLogger', () => {
  it('MB-U-023 creates a logger that writes to console.log for info/debug', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const log = createLogger('test-module');
    log.info('hello');
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('MB-U-024 calls console.error for level="error"', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const log = createLogger('test-module');
    log.error('oops');
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('registerShipper', () => {
  it('MB-U-025 forwards warn/error/info entries to the registered shipper', () => {
    const received: LogEntry[] = [];
    registerShipper((entry) => received.push(entry));

    const log = createLogger('shipper-test');
    log.warn('watch out', { reason: 'test' });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      level: 'warn',
      module: 'shipper-test',
      message: 'watch out',
    });
    expect(received[0].timestamp).toMatch(/^\d{4}-/); // ISO date
  });

  it('MB-U-026 does not forward debug entries to the shipper (too noisy)', () => {
    const received: LogEntry[] = [];
    registerShipper((entry) => received.push(entry));

    const log = createLogger('shipper-test');
    log.debug('verbose debug line');

    expect(received).toHaveLength(0);
  });
});
