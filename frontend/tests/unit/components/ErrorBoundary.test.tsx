'use strict';

// FE-U-027 through FE-U-028

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../../../src/components/ErrorBoundary';

// Suppress console.error for expected boundary catches
const noop = () => {};
beforeAll(() => { jest.spyOn(console, 'error').mockImplementation(noop); });
afterAll(() => { (console.error as jest.Mock).mockRestore(); });

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('render explosion');
  return <div>Safe content</div>;
}

describe('ErrorBoundary', () => {
  it('FE-U-027 catches a render error and shows "Something went wrong"', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('render explosion')).toBeInTheDocument();
  });

  it('FE-U-028 "Try again" button resets the boundary and re-renders children', () => {
    // Use a module-level flag so the child stops throwing after reset
    let throwFlag = true;
    function Controlled() {
      if (throwFlag) throw new Error('render explosion');
      return <div>Safe content</div>;
    }

    render(
      <ErrorBoundary>
        <Controlled />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Stop throwing before clicking — next render will succeed
    throwFlag = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText('Safe content')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });
});
