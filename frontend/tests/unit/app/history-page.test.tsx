'use strict';

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuditEvent } from '../../../src/lib/api';

jest.mock('../../../src/lib/auth', () => ({
  useAuthState: jest.fn(),
}));

jest.mock('../../../src/lib/ws', () => ({
  useRealtime: jest.fn(),
}));

jest.mock('../../../src/lib/api', () => ({
  api: {
    audit: {
      list: jest.fn(),
    },
  },
}));

import HistoryPage from '../../../src/app/(protected)/history/page';
import { useAuthState } from '../../../src/lib/auth';
import { useRealtime } from '../../../src/lib/ws';
import * as apiModule from '../../../src/lib/api';

const mockUseAuthState = useAuthState as jest.Mock;
const mockUseRealtime = useRealtime as jest.Mock;
const mockList = apiModule.api.audit.list as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuthState.mockReturnValue({
    user: { id: 'user-1', email: 'alice@example.com', name: 'Alice' },
  });
  mockUseRealtime.mockImplementation(() => undefined);
});

describe('HistoryPage', () => {
  it('loads audit events on mount with the default filter', async () => {
    mockList.mockResolvedValueOnce([]);

    render(<HistoryPage />);

    await waitFor(() =>
      expect(mockList).toHaveBeenCalledWith('user-1', { resource: undefined, limit: 50 })
    );
    expect(await screen.findByText('No audit events yet')).toBeInTheDocument();
  });

  it('shows loading while re-fetching after selecting a different filter', async () => {
    const user = userEvent.setup();
    let resolveNext: ((value: AuditEvent[]) => void) | undefined;

    mockList
      .mockResolvedValueOnce([])
      .mockImplementationOnce(
        () =>
          new Promise<AuditEvent[]>((resolve) => {
            resolveNext = resolve;
          })
      );

    const { container } = render(<HistoryPage />);
    await screen.findByText('No audit events yet');

    await user.click(screen.getByRole('button', { name: 'Identity' }));

    expect(mockList).toHaveBeenLastCalledWith('user-1', { resource: 'identity', limit: 50 });
    expect(container.querySelector('.spinner')).toBeInTheDocument();

    resolveNext?.([]);

    await waitFor(() =>
      expect(screen.getByText('No identity events recorded')).toBeInTheDocument()
    );
  });
});
