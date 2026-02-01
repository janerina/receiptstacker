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
  PriceComparison: undefined;
  Tags: undefined;
  ScannedReceipts: undefined;
  WarrantyAlerts:
    | {
        prefill?: {
          title?: string;
          alertType?: 'warranty' | 'return';
          store?: string;
          purchaseDate?: string;
          expiryDate?: string;
          receiptId?: string;
          notes?: string;
        };
      }
    | undefined;
  Notifications: undefined;
  AllReceipts: undefined;
};

// Back-compat alias for existing imports.
export type BottomTabParamList = MainTabParamList;

export type MainStackParamList = {
  BottomTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  ReceiptDetail: { receiptId: string };
  EditProfile: undefined;
  SecuritySettings: undefined;
  AddManually: { extractedData?: any };
  ReceiptTextEditor: {
    source: 'single' | 'multi' | 'long';
    primaryImageUri: string;
    partImageUris: string[];
    ocrTextOriginal: string;
    ocrRawJson?: string;
    extracted?: any;
  };
  ScanSessionReview: undefined;
  MiscSpend: undefined;
  Reports: undefined;
  PriceComparison: undefined;
  Tags: undefined;
  ScannedReceipts: undefined;
  AllReceipts: undefined;
  WarrantyAlerts:
    | {
        prefill?: {
          title?: string;
          alertType?: 'warranty' | 'return';
          store?: string;
          purchaseDate?: string;
          expiryDate?: string;
          receiptId?: string;
          notes?: string;
        };
      }
    | undefined;
  Notifications: undefined;
};

export type RootStackParamList = AuthStackParamList & MainStackParamList;
