'use strict';

// MB-U-017 through MB-U-022

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
}));

jest.mock('../../../src/lib/logger', () => ({
  __esModule: true,
  default: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../../src/lib/auth', () => ({
  useAuth: jest.fn(),
}));

// Capture the AppState 'change' listener so tests can trigger it
let capturedAppStateListener: ((state: string) => void) | null = null;
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn().mockImplementation((_event: string, cb: (s: string) => void) => {
      capturedAppStateListener = cb;
      return { remove: jest.fn() };
    }),
    currentState: 'active',
  },
}));

import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { WebSocketProvider, useRealtime, useRealtimeStatus } from '../../../src/lib/ws';
import { useAuth } from '../../../src/lib/auth';

const mockUseAuth = useAuth as jest.Mock;

class MockWebSocket {
  static OPEN = 1;
  readyState = MockWebSocket.OPEN;
  protocol: string;
  onopen:    (() => void) | null = null;
  onclose:   (() => void) | null = null;
  onmessage: ((evt: { data: string }) => void) | null = null;
  onerror:   (() => void) | null = null;
  send  = jest.fn();
  close = jest.fn(() => { this.readyState = 3; this.onclose?.(); });

  constructor(_url: string, protocols?: string[]) {
    this.protocol = protocols?.[0] ?? '';
  }
  simulateOpen()        { this.onopen?.(); }
  simulateMessage(d: unknown) { this.onmessage?.({ data: JSON.stringify(d) }); }
  simulateClose()       { this.readyState = 3; this.onclose?.(); }
}

let wsInstance: MockWebSocket | null = null;
(global as any).WebSocket = jest.fn().mockImplementation((url: string, p?: string[]) => {
  wsInstance = new MockWebSocket(url, p);
  return wsInstance;
});

function StatusConsumer({ onStatus }: { onStatus: (s: string) => void }) {
  const status = useRealtimeStatus();
  onStatus(status);
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  wsInstance = null;
  capturedAppStateListener = null;
  mockUseAuth.mockReturnValue({ user: { id: 'u1', email: 'a@b.com', name: 'A' } });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('WebSocketProvider', () => {
  it('MB-U-017 passes JWT as Sec-WebSocket-Protocol subprotocol (S6)', async () => {
    render(
      <WebSocketProvider>
        <StatusConsumer onStatus={() => {}} />
      </WebSocketProvider>
    );

    await waitFor(() => expect(global.WebSocket).toHaveBeenCalled());
    const [, protocols] = (global.WebSocket as jest.Mock).mock.calls[0] as [string, string[]];
    expect(protocols[0]).toBe('pdv.token.mock-jwt-token');
  });

  it('MB-U-018 status transitions: closed → connecting → open', async () => {
    const statuses: string[] = [];
    render(
      <WebSocketProvider>
        <StatusConsumer onStatus={(s) => statuses.push(s)} />
      </WebSocketProvider>
    );

    await waitFor(() => expect(wsInstance).not.toBeNull());
    act(() => { wsInstance!.simulateOpen(); });

    expect(statuses).toContain('connecting');
    expect(statuses[statuses.length - 1]).toBe('open');
  });

  it('MB-U-019 distributes incoming messages to all subscribers', async () => {
    const received: unknown[] = [];

    function Subscriber() {
      useRealtime((msg) => { received.push(msg); });
      return null;
    }

    render(
      <WebSocketProvider>
        <Subscriber />
      </WebSocketProvider>
    );

    await waitFor(() => expect(wsInstance).not.toBeNull());
    act(() => { wsInstance!.simulateOpen(); });
    act(() => { wsInstance!.simulateMessage({ type: 'CONSENT_REVOKED', grantId: 'g1' }); });

    expect(received).toContainEqual(expect.objectContaining({ type: 'CONSENT_REVOKED' }));
  });

  it('MB-U-020 starts a 25s keepalive interval on ws open (E16 keepalive)', async () => {
    const intervalSpy = jest.spyOn(global, 'setInterval');

    render(
      <WebSocketProvider>
        <StatusConsumer onStatus={() => {}} />
      </WebSocketProvider>
    );

    await waitFor(() => expect(wsInstance).not.toBeNull());
    act(() => { wsInstance!.simulateOpen(); });

    // The ping interval should be set with PING_MS = 25_000
    const pingCall = intervalSpy.mock.calls.find(([, ms]) => ms === 25_000);
    expect(pingCall).toBeDefined();

    intervalSpy.mockRestore();
  });

  it('MB-U-021 registers AppState listener for foreground reconnect', async () => {
    const { AppState } = require('react-native');

    render(
      <WebSocketProvider>
        <StatusConsumer onStatus={() => {}} />
      </WebSocketProvider>
    );

    await waitFor(() => expect(AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function)));
    expect(capturedAppStateListener).not.toBeNull();
  });

  it('MB-U-022 does not open a WebSocket when user is null', async () => {
    mockUseAuth.mockReturnValue({ user: null });

    render(
      <WebSocketProvider>
        <StatusConsumer onStatus={() => {}} />
      </WebSocketProvider>
    );

    // Give the effect time to (not) run
    await act(async () => {
      await new Promise<void>((r) => { r(); }); // flush microtasks
    });

    expect(global.WebSocket).not.toHaveBeenCalled();
  });
});
