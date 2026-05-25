import React, {
  createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from './api';
import { useAuth } from './auth';
import createLogger from './logger';

/**
 * Mobile realtime layer (F25) — the React Native counterpart of the web
 * WebSocketProvider. Opens one WebSocket for the logged-in user and fans
 * messages out to any screen that subscribes via useRealtime().
 *
 * Resilience:
 *   - F23 auto-reconnect with exponential backoff + jitter (capped 30s)
 *   - E16 keepalive ping every 25s (server also heartbeats)
 *   - AppState aware: reconnects when the app returns to the foreground and
 *     stops retrying while backgrounded (saves battery/socket churn).
 */

const log       = createLogger('ws');
const TOKEN_KEY = 'pdv_token';
const PING_MS        = 25_000;
const MAX_BACKOFF_MS = 30_000;

export interface RealtimeMessage {
  type?: string;          // CONSENT_GRANTED | CONSENT_REVOKED | CONSENT_EXPIRED | CONNECTED
  event?: string;         // legacy: consent.revoked
  grant?: any;
  grantId?: string;
  [k: string]: unknown;
}

type Handler = (msg: RealtimeMessage) => void;
type Status  = 'connecting' | 'open' | 'closed';

interface WSContextValue {
  status: Status;
  subscribe: (handler: Handler) => () => void;
}

const WSContext = createContext<WSContextValue>({
  status: 'closed',
  subscribe: () => () => {},
});

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>('closed');

  const handlersRef    = useRef<Set<Handler>>(new Set());
  const wsRef          = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer      = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef    = useRef(0);
  const teardownRef    = useRef(false);

  const subscribe = useCallback((handler: Handler) => {
    handlersRef.current.add(handler);
    return () => { handlersRef.current.delete(handler); };
  }, []);

  useEffect(() => {
    if (!user) { setStatus('closed'); return; }
    teardownRef.current = false;

    const clearTimers = () => {
      if (pingTimer.current)      { clearInterval(pingTimer.current); pingTimer.current = null; }
      if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
    };

    const connect = async () => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token || teardownRef.current) return;

      const wsBase = API_URL.replace(/^http/, 'ws');
      setStatus('connecting');

      // S6 — pass the JWT as a Sec-WebSocket-Protocol subprotocol value so it
      // never appears in server access logs or network traces. The backend echoes
      // back the matched protocol to complete the WS handshake (RFC 6455 §4.2.2).
      const ws = new WebSocket(`${wsBase}/v1/ws`, [`pdv.token.${token}`]);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('open');
        attemptsRef.current = 0;
        pingTimer.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify({ type: 'PING' })); } catch { /* noop */ }
          }
        }, PING_MS);
      };

      ws.onmessage = (evt: WebSocketMessageEvent) => {
        let msg: RealtimeMessage;
        try { msg = JSON.parse(evt.data as string); } catch { return; }
        handlersRef.current.forEach((h) => { try { h(msg); } catch { /* isolate */ } });
      };

      ws.onclose = () => {
        setStatus('closed');
        if (pingTimer.current) { clearInterval(pingTimer.current); pingTimer.current = null; }
        if (teardownRef.current) return;
        // Don't retry while backgrounded — the AppState listener reconnects on resume.
        if (AppState.currentState !== 'active') return;
        const attempt = attemptsRef.current++;
        const delay   = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt) + Math.random() * 1000;
        reconnectTimer.current = setTimeout(() => { connect().catch(() => {}); }, delay);
      };

      ws.onerror = () => { try { ws.close(); } catch { /* noop */ } };
    };

    // Reconnect when returning to the foreground if the socket is gone.
    const onAppState = (state: AppStateStatus) => {
      if (state === 'active' && (!wsRef.current || wsRef.current.readyState > WebSocket.OPEN)) {
        attemptsRef.current = 0;
        connect().catch(() => {});
      }
    };
    const sub = AppState.addEventListener('change', onAppState);

    connect().catch((err) => log.warn('WS connect failed', { error: String(err) }));

    return () => {
      teardownRef.current = true;
      sub.remove();
      clearTimers();
      try { wsRef.current?.close(); } catch { /* noop */ }
      wsRef.current = null;
    };
  }, [user]);

  return (
    <WSContext.Provider value={{ status, subscribe }}>
      {children}
    </WSContext.Provider>
  );
}

/**
 * Subscribe to realtime messages. Wrap `handler` in useCallback at the call
 * site so it isn't re-subscribed on every render. Returns connection status.
 */
export function useRealtime(handler?: Handler): Status {
  const ctx = useContext(WSContext);
  useEffect(() => {
    if (!handler) return;
    return ctx.subscribe(handler);
  }, [ctx, handler]);
  return ctx.status;
}

export function useRealtimeStatus(): Status {
  return useContext(WSContext).status;
}
