/**
 * Log Shipper — buffers mobile log entries and POSTs them in batches
 * to POST /v1/logs on the backend.
 *
 * The backend re-emits them via pino to stdout, which Azure Container
 * Apps captures and routes to Log Analytics.
 *
 * Configuration (env vars, resolved at bundle time):
 *   EXPO_PUBLIC_LOG_SHIP_LEVEL   — minimum level to ship: error | warn | info
 *                                  (default: info)
 *   EXPO_PUBLIC_LOG_SHIP_ENABLED — true | false  (default: true in preview/prod,
 *                                  false in development so you don't flood the
 *                                  API while iterating locally)
 *
 * Lifecycle:
 *   call initLogShipper() once in the root _layout.tsx
 *   call shutdownLogShipper() if you need a clean flush on unmount (optional)
 */

import * as SecureStore from 'expo-secure-store';
import { AppState, AppStateStatus } from 'react-native';
import { API_URL } from './api';
import { registerShipper, unregisterShipper, LogEntry } from './logger';

// ─── Config ───────────────────────────────────────────────────────────────────

const SHIP_ENABLED   = process.env.EXPO_PUBLIC_LOG_SHIP_ENABLED !== 'false';
const FLUSH_MS       = 15_000;   // flush every 15 s
const MAX_BUFFER     = 100;      // also flush when buffer reaches this size
const MAX_BATCH_SEND = 200;      // hard cap on entries per HTTP request
const ENDPOINT       = `${API_URL}/v1/logs`;
const TOKEN_KEY      = 'pdv_token';

// ─── State ────────────────────────────────────────────────────────────────────

let buffer:      LogEntry[]                 = [];
let timer:       ReturnType<typeof setInterval> | null = null;
let appStateSub: ReturnType<typeof AppState.addEventListener> | null = null;
let flushing     = false;

// ─── Core flush ───────────────────────────────────────────────────────────────

async function flush(): Promise<void> {
  if (flushing || buffer.length === 0) return;
  flushing = true;

  // Drain the buffer atomically so new entries can accumulate during the fetch
  const batch = buffer.splice(0, MAX_BATCH_SEND);

  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) {
      // Not authenticated — silently discard; will retry next flush once logged in
      flushing = false;
      return;
    }

    const res = await fetch(ENDPOINT, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ entries: batch }),
    });

    if (!res.ok && res.status !== 204) {
      // Non-retriable (e.g. 401 expired token) — drop the batch.
      // Retriable errors (5xx / network) are also dropped to prevent
      // unbounded memory growth; logs are best-effort.
      console.warn(`[logShipper] flush failed: HTTP ${res.status}`);
    }
  } catch {
    // Network error — drop batch rather than buffering indefinitely
  } finally {
    flushing = false;
  }
}

// ─── Shipper function registered with logger.ts ───────────────────────────────

function enqueue(entry: LogEntry): void {
  buffer.push(entry);
  if (buffer.length >= MAX_BUFFER) {
    // Fire-and-forget — don't await in the hot log path
    flush().catch(() => {});
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialise the log shipper.  Call once from the root layout after
 * providers are mounted.  Safe to call multiple times (idempotent).
 */
export function initLogShipper(): void {
  if (!SHIP_ENABLED) return;

  // Register with the logger
  registerShipper(enqueue);

  // Periodic flush
  if (!timer) {
    timer = setInterval(() => { flush().catch(() => {}); }, FLUSH_MS);
  }

  // Flush when the app goes to background (best-effort delivery before suspend)
  if (!appStateSub) {
    appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        flush().catch(() => {});
      }
    });
  }
}

/**
 * Flush remaining entries and stop the shipper.
 * Useful in tests or if you want a clean teardown.
 */
export async function shutdownLogShipper(): Promise<void> {
  if (timer)       { clearInterval(timer); timer = null; }
  if (appStateSub) { appStateSub.remove(); appStateSub = null; }
  unregisterShipper();
  await flush();
}
