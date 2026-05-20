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

// ─── Internal helpers ─────────────────────────────────────────────────────────

function shouldLog(level: Level): boolean {
  return ENABLED && LEVEL_RANK[level] <= LEVEL_RANK[ACTIVE_LEVEL];
}

function timestamp(): string {
  // HH:MM:SS.mmm — compact, no date prefix needed in dev
  return new Date().toISOString().slice(11, 23);
}

function prefix(level: Level, module: string): string {
  const lvl = level.toUpperCase().padEnd(5);
  return `[${timestamp()}] ${lvl} [${module}]`;
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
    error(msg, meta) {
      if (!shouldLog('error')) return;
      if (meta) console.error(prefix('error', module), msg, meta);
      else      console.error(prefix('error', module), msg);
    },
    warn(msg, meta) {
      if (!shouldLog('warn')) return;
      if (meta) console.warn(prefix('warn', module), msg, meta);
      else      console.warn(prefix('warn', module), msg);
    },
    info(msg, meta) {
      if (!shouldLog('info')) return;
      if (meta) console.log(prefix('info', module), msg, meta);
      else      console.log(prefix('info', module), msg);
    },
    debug(msg, meta) {
      if (!shouldLog('debug')) return;
      if (meta) console.log(prefix('debug', module), msg, meta);
      else      console.log(prefix('debug', module), msg);
    },
  };
}

/** Convenience: app-level logger for use outside any specific module */
export const appLog = createLogger('app');
