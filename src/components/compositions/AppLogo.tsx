import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { BrandName } from './BrandName';

export interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
  showTagline?: boolean;
}

const SIZE_MAP = {
  sm: 56,
  md: 72,
  lg: 88,
} as const;

export const AppLogo = ({ size = 'md', style, showTagline = true }: AppLogoProps) => {
  const theme = useTheme();
  const dim = SIZE_MAP[size];

  return (
    <View style={[styles.wrap, style]}>
      {/* Simple “document” mark (no image assets required) */}
      <View style={[styles.mark, { width: dim, height: dim, borderRadius: 24 }]}> 
        <View style={[styles.paper, { backgroundColor: theme.colors.primary }]} />
        <View style={[styles.paperStripe, { backgroundColor: theme.colors.primaryLight }]} />
        <View style={[styles.accent, { backgroundColor: theme.colors.success }]} />
      </View>

      <View style={{ marginTop: theme.spacing.md }}>
        <BrandName showTagline={showTagline} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    position: 'relative',
    overflow: 'hidden',
  },
  paper: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    opacity: 0.12,
  },
  paperStripe: {
    position: 'absolute',
    left: '12%',
    top: '16%',
    width: '76%',
    height: '8%',
    borderRadius: 999,
    opacity: 0.35,
  },
  accent: {
    position: 'absolute',
    right: '18%',
    bottom: '18%',
    width: '22%',
    height: '22%',
    borderRadius: 10,
    opacity: 0.75,
  },
});
