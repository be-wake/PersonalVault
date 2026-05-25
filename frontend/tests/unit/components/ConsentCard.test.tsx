'use strict';

// FE-U-020 through FE-U-022

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ConsentCard from '../../../src/components/ConsentCard';
import type { ConsentGrant } from '../../../src/lib/api';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const grant: ConsentGrant = {
  id: 'grant-1',
  user_id: 'user-1',
  relying_party_id: 'rp-1',
  scopes: ['identity:name'],
  scopes_json: '["identity:name"]',
  purpose: 'KYC verification',
  granted_at: new Date(Date.now() - 3_600_000).toISOString(),
  expires_at: null,
  revoked_at: null,
  status: 'ACTIVE',
  rp: { id: 'rp-1', name: 'Acme Corp', domain: 'acme.com', pciScope: false },
};

beforeEach(() => { mockPush.mockClear(); });

describe('ConsentCard', () => {
  it('FE-U-020 renders the RP name and scope label', () => {
    render(<ConsentCard grant={grant} />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText(/full name/i)).toBeInTheDocument();
  });

  it('FE-U-021 navigates to consent detail on Enter keydown', () => {
    render(<ConsentCard grant={grant} />);
    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(mockPush).toHaveBeenCalledWith('/consents/grant-1');
  });

  it('FE-U-022 navigates to consent detail on click', () => {
    render(<ConsentCard grant={grant} />);
    fireEvent.click(screen.getByRole('button'));
    expect(mockPush).toHaveBeenCalledWith('/consents/grant-1');
  });
});
