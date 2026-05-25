'use strict';

// FE-U-017 through FE-U-019

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import Button from '../../../src/components/Button';

describe('Button', () => {
  it('FE-U-017 renders children text by default', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('FE-U-018 renders a spinner element and no text when loading=true', () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole('button');
    expect(btn.querySelector('.spinner')).toBeInTheDocument();
    expect(btn).not.toHaveTextContent('Save');
  });

  it('FE-U-019 button is disabled when disabled=true or loading=true', () => {
    const { rerender } = render(<Button disabled>Save</Button>);
    expect(screen.getByRole('button')).toBeDisabled();

    rerender(<Button loading>Save</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
