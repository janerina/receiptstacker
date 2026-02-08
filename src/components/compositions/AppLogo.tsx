import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

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
      <Svg width={dim} height={dim} viewBox="0 0 512 512" accessibilityLabel="ReceiptStacker logo">
        <Defs>
          <LinearGradient id="bgGradient" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#23D3C8" />
            <Stop offset="100%" stopColor="#0B6F7A" />
          </LinearGradient>
        </Defs>

        {/* Background */}
        <Rect x={32} y={32} width={448} height={448} rx={90} fill="url(#bgGradient)" />

        {/* Back receipt */}
        <Rect x={230} y={140} width={140} height={210} rx={16} fill="#3BB8C3" />
        <Rect x={248} y={165} width={104} height={10} rx={5} fill="#A8E4E8" />

        {/* Middle receipt */}
        <Rect x={200} y={160} width={150} height={220} rx={16} fill="#8CD46A" />
        <Rect x={220} y={190} width={110} height={12} rx={6} fill="#FFFFFF" />

        {/* Front receipt */}
        <Rect x={160} y={180} width={170} height={240} rx={18} fill="#FFFFFF" />

        {/* Receipt header */}
        <Rect x={178} y={200} width={134} height={18} rx={9} fill="#F6A623" />

        {/* Receipt lines */}
        <Rect x={178} y={235} width={134} height={10} rx={5} fill="#D6D6D6" />
        <Rect x={178} y={260} width={120} height={10} rx={5} fill="#D6D6D6" />
        <Rect x={178} y={285} width={130} height={10} rx={5} fill="#D6D6D6" />
        <Rect x={178} y={310} width={110} height={10} rx={5} fill="#D6D6D6" />

        {/* Arrow */}
        <Path
          d="M150 360 C200 400, 300 400, 350 330 L335 325 L390 280 L395 345 L380 335 C310 420, 190 420, 120 360 Z"
          fill="#FFFFFF"
        />
      </Svg>

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
});
