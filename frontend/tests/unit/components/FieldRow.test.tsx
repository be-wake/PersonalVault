'use strict';

// FE-U-025 through FE-U-026

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import FieldRow from '../../../src/components/FieldRow';

// MaskBadge renders a small label — mock it to keep tests focused on FieldRow
jest.mock('../../../src/components/MaskBadge', () => () => null);

describe('FieldRow masking', () => {
  it('FE-U-025 applies correct masks: FULL=8 bullets, PARTIAL=••••+last4, HASH=first8+ellipsis, NONE=value', () => {
    const { rerender } = render(<FieldRow label="Test" value="ABCDEFGHIJ" mask="FULL" />);
    expect(screen.getByText('••••••••')).toBeInTheDocument();

    rerender(<FieldRow label="Test" value="ABCDEFGHIJ" mask="PARTIAL" />);
    expect(screen.getByText('••••GHIJ')).toBeInTheDocument();

    rerender(<FieldRow label="Test" value="ABCDEFGHIJ" mask="HASH" />);
    expect(screen.getByText('ABCDEFGH…')).toBeInTheDocument();

    rerender(<FieldRow label="Test" value="ABCDEFGHIJ" mask="NONE" />);
    expect(screen.getByText('ABCDEFGHIJ')).toBeInTheDocument();
  });

  it('FE-U-026 renders em-dash when value is empty/null', () => {
    const { rerender } = render(<FieldRow label="Test" value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();

    rerender(<FieldRow label="Test" value="" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
