import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';

import { useTheme } from '@/hooks/useTheme';
import { AddManuallyScreen } from '@/screens/features/AddManuallyScreen';
import { BudgetScreen } from '@/screens/features/BudgetScreen';
import { CategoriesScreen } from '@/screens/features/CategoriesScreen';
import { MiscSpendScreen } from '@/screens/features/MiscSpendScreen';
import { ReportsInsightsScreen } from '@/screens/features/ReportsInsightsScreen';
import { ReportsScreen } from '@/screens/features/ReportsScreen';
import { TagsScreen } from '@/screens/features/TagsScreen';
import { HomeScreen } from '@/screens/main/HomeScreen';
import { AllReceiptsScreen } from '@/screens/main/AllReceiptsScreen';
import { WarrantyAlertsScreen } from '@/screens/main/WarrantyAlertsScreen';
import { NotificationsScreen } from '@/screens/main/NotificationsScreen';
import type { HomeStackParamList } from '@/navigation/types';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export type HomeStackScreenProps<T extends keyof HomeStackParamList> = NativeStackScreenProps<HomeStackParamList, T>;

export const HomeStackNavigator = () => {
  const { colors } = useTheme();

  const screenOptions = useMemo(
    () => ({
      headerShown: false,
      contentStyle: { backgroundColor: colors.background },
    }),
    [colors.background],
  );

  return (
    <Stack.Navigator initialRouteName="HomeMain" screenOptions={screenOptions}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="Budget" component={BudgetScreen} />
      <Stack.Screen name="Categories" component={CategoriesScreen} />
      <Stack.Screen name="AddManually" component={AddManuallyScreen} />
      <Stack.Screen name="MiscSpend" component={MiscSpendScreen} />
      <Stack.Screen name="Reports" component={ReportsScreen} />
      <Stack.Screen name="PriceComparison" component={ReportsInsightsScreen} />
      <Stack.Screen name="Tags" component={TagsScreen} />
      <Stack.Screen name="AllReceipts" component={AllReceiptsScreen} />
      <Stack.Screen name="WarrantyAlerts" component={WarrantyAlertsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
    </Stack.Navigator>
  );
};
