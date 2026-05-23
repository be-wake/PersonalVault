'use client';

/**
 * App-wide realtime layer (F22 / C6).
 *
 * Opens a single WebSocket for the logged-in user and fans messages out to any
 * component that subscribes via useRealtime(). Replaces the per-page sockets the
 * consent-detail page used to create, so the dashboard and consents list update
 * live too.
 *
 * Resilience:
 *   - F23 auto-reconnect with exponential backoff + jitter (capped at 30s)
 *   - E16 app-level keepalive ping every 25s so Azure Container Apps doesn't
 *     drop the idle connection at ~4 min (server also pings; both directions
 *     keep it warm)
 */

import {
  createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode,
} from 'react';
import { useAuthState } from './auth';

export interface RealtimeMessage {
  type?: string;          // e.g. CONSENT_GRANTED | CONSENT_REVOKED | CONSENT_EXPIRED | CONNECTED
  event?: string;         // legacy shape: consent.revoked
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

const PING_MS       = 25_000;
const MAX_BACKOFF_MS = 30_000;

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthState();
  const [status, setStatus] = useState<Status>('closed');

  const handlersRef     = useRef<Set<Handler>>(new Set());
  const wsRef           = useRef<WebSocket | null>(null);
  const reconnectTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer       = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef     = useRef(0);
  const teardownRef     = useRef(false);

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

    const connect = () => {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const wsBase  = apiBase.replace(/^http/, 'ws');
      setStatus('connecting');

      // S1/S6 — the pdv_session httpOnly cookie is sent automatically on the
      // WebSocket upgrade request; no token in the URL query string needed.
      const ws = new WebSocket(`${wsBase}/v1/ws`);
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

      ws.onmessage = (evt) => {
        let msg: RealtimeMessage;
        try { msg = JSON.parse(evt.data); } catch { return; }
        handlersRef.current.forEach((h) => { try { h(msg); } catch { /* isolate handlers */ } });
      };

      ws.onclose = () => {
        setStatus('closed');
        if (pingTimer.current) { clearInterval(pingTimer.current); pingTimer.current = null; }
        if (teardownRef.current) return;          // intentional close — don't reconnect
        const attempt = attemptsRef.current++;
        const delay   = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt) + Math.random() * 1000;
        reconnectTimer.current = setTimeout(connect, delay);
      };

      ws.onerror = () => { try { ws.close(); } catch { /* noop */ } };
    };

    connect();

    return () => {
      teardownRef.current = true;
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
 * Subscribe to realtime messages. The handler is re-subscribed whenever its
 * identity changes, so wrap it in useCallback at the call site for stability.
 * Returns the current connection status.
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
