'use strict';

// FE-U-023 through FE-U-024

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import StatusBadge from '../../../src/components/StatusBadge';

describe('StatusBadge', () => {
  it('FE-U-023 renders human-readable labels, not raw status strings', () => {
    const { rerender } = render(<StatusBadge status="ACTIVE" />);
    expect(screen.getByText('Active')).toBeInTheDocument();

    rerender(<StatusBadge status="REVOKED" />);
    expect(screen.getByText('Revoked')).toBeInTheDocument();

    rerender(<StatusBadge status="EXPIRED" />);
    expect(screen.getByText('Expired')).toBeInTheDocument();
  });

  it('FE-U-024 never renders the raw uppercase status value', () => {
    render(<StatusBadge status="ACTIVE" />);
    expect(screen.queryByText('ACTIVE')).not.toBeInTheDocument();
  });
});
