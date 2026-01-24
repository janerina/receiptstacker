import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View, type ImageSourcePropType, type ViewStyle } from 'react-native';

import { FONT_SIZES, LINE_HEIGHTS } from '@/constants';
import { useTheme } from '@/theme';

export interface AvatarProps {
  source?: ImageSourcePropType;
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  style?: ViewStyle;
  accessibilityLabel?: string;
}

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
};

/**
 * User avatar.
 *
 * Priority:
 * - Render `source` image when provided.
 * - Otherwise render initials from `name`.
 * - Otherwise render a placeholder circle.
 */
export const Avatar = ({
  source,
  name,
  size = 'md',
  style,
  accessibilityLabel,
}: AvatarProps) => {
  const theme = useTheme();

  const dimension = theme.componentSizes.avatar[size];

  const initials = useMemo(() => (name ? getInitials(name) : ''), [name]);

  const fontStyle = useMemo(() => {
    switch (size) {
      case 'sm':
        return { fontSize: FONT_SIZES[12], lineHeight: LINE_HEIGHTS[12] };
      case 'md':
        return { fontSize: FONT_SIZES[14], lineHeight: LINE_HEIGHTS[14] };
      case 'lg':
        return { fontSize: FONT_SIZES[18], lineHeight: LINE_HEIGHTS[18] };
      case 'xl':
        return { fontSize: FONT_SIZES[24], lineHeight: LINE_HEIGHTS[24] };
      default:
        return { fontSize: FONT_SIZES[14], lineHeight: LINE_HEIGHTS[14] };
    }
  }, [size]);

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? name ?? 'Avatar'}
      style={[
        styles.container,
        {
          width: dimension,
          height: dimension,
          borderRadius: theme.radius.full,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.disabled,
        },
        style,
      ]}
    >
      {source ? (
        <Image source={source} style={styles.image} />
      ) : initials ? (
        <Text style={[styles.initials, { color: theme.colors.textSecondary }, fontStyle]}>{initials}</Text>
      ) : (
        <View style={[styles.placeholder, { backgroundColor: theme.colors.border }]} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  initials: {
    fontWeight: '700',
  },
  placeholder: {
    width: '40%',
    height: '40%',
    borderRadius: 9999,
  },
});
