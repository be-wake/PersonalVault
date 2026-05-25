'use strict';

// MB-U-033 through MB-U-034

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import ErrorBoundary from '../../../src/components/ErrorBoundary';

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('render explosion');
  return null;
}

const originalConsoleError = console.error;
beforeAll(() => { console.error = jest.fn(); });
afterAll(() => { console.error = originalConsoleError; });

describe('ErrorBoundary (React Native)', () => {
  it('MB-U-033 catches a render error and shows recovery UI', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('render explosion')).toBeTruthy();
  });

  it('MB-U-034 "Try again" button resets the boundary', () => {
    // Use mutable flag so the child stops throwing after reset
    let throwFlag = true;
    function Controlled() {
      if (throwFlag) throw new Error('render explosion');
      return null;
    }

    render(
      <ErrorBoundary>
        <Controlled />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();

    throwFlag = false;
    fireEvent.press(screen.getByText('Try again'));

    expect(screen.queryByText('Something went wrong')).toBeNull();
  });
});
