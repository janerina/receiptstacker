import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import React, { useEffect, useMemo, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { LoadingOverlay } from '@/components/compositions';
import { SPACING } from '@/constants';
import { useTheme } from '@/hooks/useTheme';
import { ForgotPasswordScreen } from '@/screens/auth/ForgotPasswordScreen';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { OnboardingScreen } from '@/screens/auth/OnboardingScreen';
import { SignUpScreen } from '@/screens/auth/SignUpScreen';
import { AddManuallyScreen } from '@/screens/features/AddManuallyScreen';
import { BudgetScreen } from '@/screens/features/BudgetScreen';
import { CategoriesScreen } from '@/screens/features/CategoriesScreen';
import { MiscSpendScreen } from '@/screens/features/MiscSpendScreen';
import { ReportsScreen } from '@/screens/features/ReportsScreen';
import { TagsScreen } from '@/screens/features/TagsScreen';
import { AllReceiptsScreen } from '@/screens/main/AllReceiptsScreen';
import { ReceiptDetailScreen } from '@/screens/main/ReceiptDetailScreen';
import { subscribeAuthChanged } from '@/utils/authEvents';

import { BottomTabNavigator } from './BottomTabNavigator';
import type { AuthStackParamList, MainStackParamList } from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

const ONBOARDING_COMPLETED_KEY = '@onboarding_completed' as const;
const AUTH_TOKEN_KEY = '@auth_token' as const;

const AuthNavigator = ({ initialRouteName }: { initialRouteName: keyof AuthStackParamList }) => {
  const { colors } = useTheme();

  const screenOptions = useMemo(
    () => ({
      headerShown: false,
      contentStyle: { backgroundColor: colors.background, paddingTop: SPACING.xs },
    }),
    [colors.background],
  );

  return (
    <AuthStack.Navigator initialRouteName={initialRouteName} screenOptions={screenOptions}>
      <AuthStack.Screen name="Onboarding" component={OnboardingScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="SignUp" component={SignUpScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
};

const MainNavigator = () => {
  const { colors } = useTheme();

  const screenOptions = useMemo(
    () => ({
      headerShown: false,
      contentStyle: { backgroundColor: colors.background },
    }),
    [colors.background],
  );

  return (
    <MainStack.Navigator initialRouteName="BottomTabs" screenOptions={screenOptions}>
      <MainStack.Screen name="BottomTabs" component={BottomTabNavigator} />

      <MainStack.Screen name="ReceiptDetail" component={ReceiptDetailScreen} options={{ presentation: 'modal' }} />
      <MainStack.Screen name="AllReceipts" component={AllReceiptsScreen} />
      <MainStack.Screen name="Budget" component={BudgetScreen} options={{ presentation: 'modal' }} />
      <MainStack.Screen name="AddManually" component={AddManuallyScreen} options={{ presentation: 'modal' }} />
      <MainStack.Screen name="MiscSpend" component={MiscSpendScreen} options={{ presentation: 'modal' }} />
      <MainStack.Screen name="Reports" component={ReportsScreen} options={{ presentation: 'modal' }} />
      <MainStack.Screen name="Tags" component={TagsScreen} options={{ presentation: 'modal' }} />
      <MainStack.Screen name="Categories" component={CategoriesScreen} options={{ presentation: 'modal' }} />
    </MainStack.Navigator>
  );
};

const linking: LinkingOptions<MainStackParamList> = {
  // Optional deep linking support.
  // Add your scheme(s) in app.json (e.g., "receipts:") before enabling in production.
  prefixes: [],
  config: {
    screens: {
      BottomTabs: {
        screens: {
          Home: 'home',
          Analytics: 'analytics',
          Scan: 'scan',
          Calendar: 'calendar',
          Profile: 'profile',
        },
      },
      ReceiptDetail: 'receipt/:receiptId',
      Budget: 'budget',
      AddManually: 'add',
      MiscSpend: 'misc-spend',
      Reports: 'reports',
      Tags: 'tags',
      Categories: 'categories',
      AllReceipts: 'receipts',
    },
  },
};

export const AppNavigator = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const refreshAuthState = async () => {
      try {
        const [onboardingValue, authToken] = await AsyncStorage.multiGet([
          ONBOARDING_COMPLETED_KEY,
          AUTH_TOKEN_KEY,
        ]).then((pairs) => pairs.map(([, v]) => v));

        if (cancelled) return;

        setIsOnboardingComplete(onboardingValue === 'true');
        setIsAuthenticated(Boolean(authToken));
      } catch {
        if (cancelled) return;
        setIsOnboardingComplete(false);
        setIsAuthenticated(false);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    refreshAuthState();
    const subscription = subscribeAuthChanged(() => {
      refreshAuthState();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  if (isLoading) {
    return <LoadingOverlay visible message="Loading…" />;
  }

  const authInitialRoute: keyof AuthStackParamList = isOnboardingComplete ? 'Login' : 'Onboarding';

  return (
    <NavigationContainer /* linking={linking} */>
      {isAuthenticated ? <MainNavigator /> : <AuthNavigator initialRouteName={authInitialRoute} />}
    </NavigationContainer>
  );
};
