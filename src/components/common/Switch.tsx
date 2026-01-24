import React, { useMemo } from 'react';
import { Switch as RNSwitch, type SwitchProps as RNSwitchProps } from 'react-native';

import { useTheme } from '@/theme';

export interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

/**
 * Theme-aware switch.
 *
 * Uses the native React Native `Switch` for smooth animations.
 */
export const Switch = ({ value, onValueChange, disabled = false }: SwitchProps) => {
  const theme = useTheme();

  const trackColor = useMemo<RNSwitchProps['trackColor']>(() => {
    return {
      false: theme.colors.disabled,
      true: theme.colors.primary,
    };
  }, [theme.colors.disabled, theme.colors.primary]);

  return (
    <RNSwitch
      accessibilityRole="switch"
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={trackColor}
      thumbColor={theme.colors.white}
      ios_backgroundColor={theme.colors.disabled}
    />
  );
};
