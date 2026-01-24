import { StyleSheet } from 'react-native';

import { COLORS, SPACING } from '@/constants';

type ModeColors = typeof COLORS.light | typeof COLORS.dark;

/**
 * Creates common layout styles for screens and sections.
 *
 * Theme-aware: pass in the current theme colors.
 */
export const createLayouts = (colors: ModeColors) =>
  StyleSheet.create({
    screenContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    screenWithPadding: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.lg,
    },
    screenCentered: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
    },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rowCenter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },

    column: {
      flexDirection: 'column',
    },
    columnCenter: {
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    },

    section: {
      marginBottom: SPACING.lg,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.md,
    },
  });

export type Layouts = ReturnType<typeof createLayouts>;
