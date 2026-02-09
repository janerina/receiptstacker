import React, { useMemo } from 'react';
import { Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

import { SPACING } from '@/constants';

export type KeyboardAwareFormScrollProps = {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  extraScrollHeight?: number;
  scrollRef?: React.MutableRefObject<any>;
};

/**
 * Keyboard-safe scroll wrapper for form-like screens.
 *
 * Goals:
 * - Focused input always scrolls above the keyboard (including tall/IME keyboards)
 * - Bottom buttons/links can be scrolled into view while keyboard is open
 * - Consistent behavior across Android + iOS
 */
export const KeyboardAwareFormScroll = ({
  children,
  contentContainerStyle,
  extraScrollHeight,
  scrollRef,
}: KeyboardAwareFormScrollProps) => {
  const baseContentStyle = useMemo(
    () => [styles.content, contentContainerStyle],
    [contentContainerStyle],
  );

  return (
    <KeyboardAwareScrollView
      enableOnAndroid
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      showsVerticalScrollIndicator={false}
      enableAutomaticScroll
      innerRef={scrollRef ? (ref) => (scrollRef.current = ref) : undefined}
      extraScrollHeight={
        typeof extraScrollHeight === 'number'
          ? extraScrollHeight
          : Platform.OS === 'android'
            ? 24
            : 16
      }
      contentContainerStyle={baseContentStyle}
    >
      {children}
    </KeyboardAwareScrollView>
  );
};

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingBottom: SPACING['3xl'],
  },
});
