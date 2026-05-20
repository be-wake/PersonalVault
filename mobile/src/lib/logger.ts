/**
 * Mobile logger — zero dependencies, configurable via env vars.
 *
 * Configuration (in .env or eas.json "env" block):
 *   EXPO_PUBLIC_LOG_LEVEL    — error | warn | info | debug   (default: debug in dev, warn in prod)
 *   EXPO_PUBLIC_LOG_ENABLED  — true | false                  (default: true)
 *
 * Usage:
 *   import createLogger from '@/src/lib/logger';
 *   const log = createLogger('auth');
 *
 *   log.debug('Loading user session');
 *   log.info('User logged in', { userId });
 *   log.warn('Login failed', { email, reason: 'bad_password' });
 *   log.error('Unexpected API error', { error: err.message, path });
 */

type Level = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_RANK: Record<Level, number> = {
  error: 0,
  warn:  1,
  info:  2,
  debug: 3,
};

const IS_PROD = process.env.NODE_ENV === 'production';

// Read the configured level — EXPO_PUBLIC_ prefix required for Expo to bundle it
const ENV_LEVEL = process.env.EXPO_PUBLIC_LOG_LEVEL as Level | undefined;
const ACTIVE_LEVEL: Level = ENV_LEVEL ?? (IS_PROD ? 'warn' : 'debug');

// Master kill-switch: set EXPO_PUBLIC_LOG_ENABLED=false to silence everything
const ENABLED = process.env.EXPO_PUBLIC_LOG_ENABLED !== 'false';

// ─── Shipper hook ─────────────────────────────────────────────────────────────
// The log shipper (logShipper.ts) registers itself here so the logger can
// forward qualifying entries without directly depending on fetch / SecureStore.

export interface LogEntry {
  level:     Level;
  module:    string;
  message:   string;
  meta?:     Record<string, unknown>;
  timestamp: string;
}

type ShipperFn = (entry: LogEntry) => void;

// Levels that are worth shipping to the backend (debug is too noisy/expensive)
const SHIP_LEVELS = new Set<Level>(['error', 'warn', 'info']);

let _shipper: ShipperFn | null = null;

/** Called once by logShipper.ts during app initialisation. */
export function registerShipper(fn: ShipperFn): void {
  _shipper = fn;
}

/** Remove the shipper (e.g. during tests). */
export function unregisterShipper(): void {
  _shipper = null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function shouldLog(level: Level): boolean {
  return ENABLED && LEVEL_RANK[level] <= LEVEL_RANK[ACTIVE_LEVEL];
}

function timestamp(): string {
  return new Date().toISOString(); // full ISO — used by shipper & local prefix
}

function localPrefix(level: Level, module: string, ts: string): string {
  const lvl = level.toUpperCase().padEnd(5);
  return `[${ts.slice(11, 23)}] ${lvl} [${module}]`; // HH:MM:SS.mmm
}

function emit(level: Level, module: string, msg: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const ts = timestamp();

  // 1. Local console output
  const pfx = localPrefix(level, module, ts);
  if (level === 'error')      meta ? console.error(pfx, msg, meta) : console.error(pfx, msg);
  else if (level === 'warn')  meta ? console.warn(pfx, msg, meta)  : console.warn(pfx, msg);
  else                        meta ? console.log(pfx, msg, meta)   : console.log(pfx, msg);

  // 2. Forward to shipper if registered and level qualifies
  if (_shipper && SHIP_LEVELS.has(level)) {
    _shipper({ level, module, message: msg, meta, timestamp: ts });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface Logger {
  error: (msg: string, meta?: Record<string, unknown>) => void;
  warn:  (msg: string, meta?: Record<string, unknown>) => void;
  info:  (msg: string, meta?: Record<string, unknown>) => void;
  debug: (msg: string, meta?: Record<string, unknown>) => void;
}

/**
 * Create a named logger for a module.
 *
 * @param module  Short identifier shown in every log line, e.g. 'auth', 'api', 'dashboard'
 */
export default function createLogger(module: string): Logger {
  return {
    error: (msg, meta) => emit('error', module, msg, meta),
    warn:  (msg, meta) => emit('warn',  module, msg, meta),
    info:  (msg, meta) => emit('info',  module, msg, meta),
    debug: (msg, meta) => emit('debug', module, msg, meta),
  };
}

/** Convenience: app-level logger for use outside any specific module */
export const appLog = createLogger('app');
