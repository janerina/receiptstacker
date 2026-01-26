import React, { useMemo } from 'react';
import { Text, View, type TextStyle, type ViewStyle } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';

export interface CategoryIconProps {
  /** Feather icon name (e.g. 'shopping-cart') OR an emoji (e.g. '🛒') */
  icon: string;
  size: number;
  color?: string;
  style?: ViewStyle;
}

const isFeatherName = (value: string) => /^[a-z0-9-]+$/i.test(value);

export const CategoryIcon = ({ icon, size, color, style }: CategoryIconProps) => {
  const feather = useMemo(() => isFeatherName(icon), [icon]);

  if (feather) {
    return <Feather name={icon as never} size={size} color={color} style={style as never} />;
  }

  const textStyle: TextStyle = {
    fontSize: size,
    lineHeight: Math.round(size * 1.05),
    textAlign: 'center',
  };

  // Emoji color is controlled by the glyph; `color` may not affect it on all platforms.
  return (
    <View style={style}>
      <Text style={textStyle}>{icon}</Text>
    </View>
  );
};
