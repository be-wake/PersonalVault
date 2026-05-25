'use client';

/** Top-level error boundary. Catches render errors and shows a recovery UI. */

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Button } from './ui/button';

interface Props  { children: ReactNode; fallback?: ReactNode; }
interface State  { hasError: boolean; message: string; }

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(err: unknown): State {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return { hasError: true, message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => this.setState({ hasError: false, message: '' });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback)  return this.props.fallback;

    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-6 bg-[var(--color-bg)] text-[var(--color-text-1)] text-center gap-4 font-sans">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#e05252" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <h2 className="text-[20px] font-bold m-0">Something went wrong</h2>
        <p className="text-[14px] text-[var(--color-text-2)] max-w-[360px] m-0">
          {this.state.message}
        </p>
        <div className="flex gap-3 flex-wrap justify-center">
          <Button variant="primary" onClick={this.handleReset}>Try again</Button>
          <Button variant="secondary" onClick={() => { window.location.href = '/'; }}>Go home</Button>
        </div>
      </div>
    );
  }
}
