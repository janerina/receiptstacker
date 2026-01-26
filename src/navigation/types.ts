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
  Home: NavigatorScreenParams<HomeStackParamList> | undefined;
  Analytics: undefined;
  Scan: undefined;
  Calendar: undefined;
  Profile: undefined;
};

export type HomeStackParamList = {
  HomeMain: undefined;
  Budget: undefined;
  Categories: undefined;
  AddManually: { extractedData?: any };
  MiscSpend: undefined;
  Reports: undefined;
  Tags: undefined;
  WarrantyAlerts: undefined;
  Notifications: undefined;
  AllReceipts: undefined;
};

// Back-compat alias for existing imports.
export type BottomTabParamList = MainTabParamList;

export type MainStackParamList = {
  BottomTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  ReceiptDetail: { receiptId: string };
  AddManually: { extractedData?: any };
  MiscSpend: undefined;
  Reports: undefined;
  Tags: undefined;
  AllReceipts: undefined;
  WarrantyAlerts: undefined;
  Notifications: undefined;
};

export type RootStackParamList = AuthStackParamList & MainStackParamList;
