import React from 'react';
import { Text, type TextStyle } from 'react-native';

import { useTheme } from '@/theme';

export interface BrandNameProps {
  style?: TextStyle;
  showTagline?: boolean;
}

export const BrandName = ({ style, showTagline = false }: BrandNameProps) => {
  const theme = useTheme();

  return (
    <>
      <Text
        style={[
          theme.typography.sectionHeading,
          { color: theme.colors.text, textAlign: 'center' },
          style,
        ]}
      >
        <Text style={{ color: theme.colors.text }}>Receipt</Text>
        <Text style={{ color: theme.colors.primary }}>Stacker</Text>
      </Text>
      {showTagline ? (
        <Text
          style={[
            theme.typography.caption,
            { color: theme.colors.success, textAlign: 'center', marginTop: theme.spacing.xs },
          ]}
        >
          Scan • Save • Organize
        </Text>
      ) : null}
    </>
  );
};
