'use strict';

// MB-U-031 through MB-U-032

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import Button from '../../../src/components/Button';

describe('Button (React Native)', () => {
  it('MB-U-031 renders title text and calls onPress when tapped', () => {
    const onPress = jest.fn();
    render(<Button title="Save" onPress={onPress} />);

    expect(screen.getByText('Save')).toBeTruthy();
    // fireEvent.press on the text bubbles up to TouchableOpacity
    fireEvent.press(screen.getByText('Save'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('MB-U-032 shows ActivityIndicator and disables press when loading=true', () => {
    const onPress = jest.fn();
    render(<Button title="Save" onPress={onPress} loading />);

    // ActivityIndicator replaces the text
    expect(screen.queryByText('Save')).toBeNull();
    // TouchableOpacity should be disabled
    const touchable = screen.UNSAFE_getByType(require('react-native').TouchableOpacity);
    expect(touchable.props.disabled).toBe(true);
  });
});
