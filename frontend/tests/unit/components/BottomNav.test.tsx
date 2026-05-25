'use strict';

// FE-U-029 through FE-U-030

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BottomNav from '../../../src/components/BottomNav';

const mockPush = jest.fn();
let mockPathname = '/dashboard';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}));

beforeEach(() => {
  mockPush.mockClear();
  mockPathname = '/dashboard';
});

describe('BottomNav', () => {
  it('FE-U-029 marks the active tab with aria-current="page" (exact and prefix match)', () => {
    mockPathname = '/consents/grant-123'; // prefix match for /consents
    render(<BottomNav />);
    const consentsBtn = screen.getByRole('button', { name: 'Consents' });
    expect(consentsBtn).toHaveAttribute('aria-current', 'page');
    // other tabs should NOT be marked active
    expect(screen.getByRole('button', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('FE-U-030 clicking a tab calls router.push with the tab href', () => {
    render(<BottomNav />);
    fireEvent.click(screen.getByRole('button', { name: 'Profile' }));
    expect(mockPush).toHaveBeenCalledWith('/profile');
  });
});
