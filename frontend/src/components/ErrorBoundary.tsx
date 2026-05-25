'use client';

/** Top-level error boundary. Catches render errors and shows a recovery UI. */

import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  /** Optional custom fallback. Defaults to the built-in recovery card. */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message:  string;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(err: unknown): State {
    const message =
      err instanceof Error ? err.message : 'An unexpected error occurred.';
    return { hasError: true, message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: 'var(--color-bg, #0f1b2d)',
          color: 'var(--color-text, #e8edf5)',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          gap: '16px',
        }}
      >
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#e05252" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
          Something went wrong
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: '0.875rem',
            color: 'var(--color-text-secondary, #8b9ab3)',
            maxWidth: 360,
          }}
        >
          {this.state.message}
        </p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={this.handleReset}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              background: '#2563eb',
              color: '#fff',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <button
            onClick={() => { window.location.href = '/'; }}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: '1px solid #2a3a57',
              background: 'transparent',
              color: 'var(--color-text, #e8edf5)',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Go home
          </button>
        </div>
      </div>
    );
  }
}
