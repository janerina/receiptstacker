/**
 * Navigation types for the Auth flow.
 */

import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
  SecuritySetup: undefined;
  BiometricSetup: { email: string };
  ResetPasswordVerify: { email: string; method: 'pin' | 'securityQuestions' | 'passphrase' };
  ResetPasswordNew: { email: string };
};

export type MainTabParamList = {
  Home: undefined;
  Analytics: undefined;
  Scan: undefined;
  Calendar: undefined;
  Profile: undefined;
};

// Back-compat alias for existing imports.
export type BottomTabParamList = MainTabParamList;

export type MainStackParamList = {
  BottomTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  ReceiptDetail: { receiptId: string };
  Budget: undefined;
  AddManually: { extractedData?: any };
  MiscSpend: undefined;
  Reports: undefined;
  Tags: undefined;
  Categories: undefined;
  AllReceipts: undefined;
};

export type RootStackParamList = AuthStackParamList & MainStackParamList;
