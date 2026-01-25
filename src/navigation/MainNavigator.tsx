import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';
import { AddManuallyScreen } from '@/screens/features/AddManuallyScreen';
import { ReceiptDetailScreen } from '@/screens/main/ReceiptDetailScreen';
import { BudgetScreen } from '@/screens/features/BudgetScreen';
import { CategoriesScreen } from '@/screens/features/CategoriesScreen';
import { MiscSpendScreen } from '@/screens/features/MiscSpendScreen';
import { ReportsScreen } from '@/screens/features/ReportsScreen';
import { TagsScreen } from '@/screens/features/TagsScreen';
import { BottomTabNavigator } from '@/navigation/BottomTabNavigator';
import { WarrantyAlertsScreen } from '@/screens/main/WarrantyAlertsScreen';
import { NotificationsScreen } from '@/screens/main/NotificationsScreen';

import type { MainStackParamList } from './types';

const Stack = createNativeStackNavigator<MainStackParamList>();

type PlaceholderProps = NativeStackScreenProps<MainStackParamList, keyof MainStackParamList>;

const PlaceholderScreen = ({ route }: PlaceholderProps) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>{route.name}</Text>
        <Text style={styles.subtitle}>This screen is a placeholder for now.</Text>
      </View>
    </SafeAreaView>
  );
};

/**
 * Main app navigator (post-auth).
 *
 * For now this includes Home plus placeholder feature routes so
 * the dashboard can navigate to them immediately.
 */
export const MainNavigator = () => {
  const { colors } = useTheme();

  const screenOptions = useMemo(
    () => ({
      headerShown: false,
      contentStyle: { backgroundColor: colors.background },
    }),
    [colors.background],
  );

  return (
    <Stack.Navigator initialRouteName="BottomTabs" screenOptions={screenOptions}>
      <Stack.Screen name="BottomTabs" component={BottomTabNavigator} />
      <Stack.Screen name="ReceiptDetail" component={ReceiptDetailScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="AllReceipts" component={PlaceholderScreen} />
      <Stack.Screen name="Budget" component={BudgetScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="AddManually" component={AddManuallyScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="MiscSpend" component={MiscSpendScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Reports" component={ReportsScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Tags" component={TagsScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Categories" component={CategoriesScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="WarrantyAlerts" component={WarrantyAlertsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
};

const createStyles = (colors: { background: string; text: string; textSecondary: string }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.lg,
    },
    title: {
      ...TYPOGRAPHY.pageTitle,
      color: colors.text,
      textAlign: 'center',
    },
    subtitle: {
      ...TYPOGRAPHY.bodyNormal,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: SPACING.sm,
    },
  });
