import React, { useMemo } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { SPACING } from '@/constants';
import { useTheme } from '@/hooks/useTheme';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { OnboardingScreen } from '@/screens/auth/OnboardingScreen';
import { ForgotPasswordScreen } from '@/screens/auth/ForgotPasswordScreen';
import { ResetPasswordVerifyScreen } from '@/screens/auth/ResetPasswordVerifyScreen';
import { ResetPasswordNewScreen } from '@/screens/auth/ResetPasswordNewScreen';
import { SecuritySetupScreen } from '@/screens/auth/SecuritySetupScreen';
import { BiometricSetupScreen } from '@/screens/auth/BiometricSetupScreen';
import { SignUpScreen } from '@/screens/auth/SignUpScreen';

import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export type AuthNavigatorProps = {
  initialRouteName?: keyof AuthStackParamList;
};

export const AuthNavigator = ({ initialRouteName = 'Onboarding' }: AuthNavigatorProps) => {
  const { colors } = useTheme();

  const screenOptions = useMemo(
    () => ({
      headerShown: false,
      contentStyle: { backgroundColor: colors.background, paddingTop: SPACING.xs },
    }),
    [colors.background],
  );

  return (
    <Stack.Navigator initialRouteName={initialRouteName} screenOptions={screenOptions}>
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="SecuritySetup" component={SecuritySetupScreen} />
      <Stack.Screen name="BiometricSetup" component={BiometricSetupScreen} />
      <Stack.Screen name="ResetPasswordVerify" component={ResetPasswordVerifyScreen} />
      <Stack.Screen name="ResetPasswordNew" component={ResetPasswordNewScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
    </Stack.Navigator>
  );
};
