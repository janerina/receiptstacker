import React, { useEffect } from 'react';
import { Platform, StatusBar, TextInput, View } from 'react-native';
import {
  SafeAreaProvider,
  initialWindowMetrics,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { AppProviders } from '@/contexts';
import { useTheme as usePersistedTheme } from '@/hooks/useTheme';
import { AppNavigator } from '@/navigation';
import { ThemeProvider as DesignThemeProvider } from '@/theme';
import { ThemedAlertHost } from '@/components/modals/ThemedAlertHost';
import { installThemedAlertMonkeyPatch } from '@/services/themedAlert';

// Remove Android/iOS spellcheck/autocorrect underlines across the app by default.
// Individual inputs can still opt back in by passing props explicitly.
(() => {
  const existing = (TextInput as any).defaultProps ?? {};
  (TextInput as any).defaultProps = {
    ...existing,
    autoCorrect: false,
    spellCheck: false,
  };
})();

const parseHexColor = (value: string): { r: number; g: number; b: number } | null => {
  const hex = value.trim();
  if (!hex.startsWith('#')) return null;

  const raw = hex.slice(1);
  if (raw.length === 3) {
    const r = Number.parseInt(raw[0] + raw[0], 16);
    const g = Number.parseInt(raw[1] + raw[1], 16);
    const b = Number.parseInt(raw[2] + raw[2], 16);
    return { r, g, b };
  }

  if (raw.length === 6) {
    const r = Number.parseInt(raw.slice(0, 2), 16);
    const g = Number.parseInt(raw.slice(2, 4), 16);
    const b = Number.parseInt(raw.slice(4, 6), 16);
    return { r, g, b };
  }

  // Ignore #AARRGGBB and other formats to avoid wrong assumptions.
  return null;
};

const isDarkColor = (value: string): boolean => {
  const rgb = parseHexColor(value);
  if (!rgb) return false;
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance < 0.5;
};

function ThemeBridge({ children }: { children: React.ReactNode }) {
  const { isDark } = usePersistedTheme();
  return <DesignThemeProvider mode={isDark ? 'dark' : 'light'}>{children}</DesignThemeProvider>;
}

const AppContent = () => {
  const { colors } = usePersistedTheme();
  
  return (
    <ThemeBridge>
      <StatusBar
        barStyle={isDarkColor(colors.background) ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />
      <View style={{ flex: 1 }}>
        <AppNavigator />
        <ThemedAlertHost />
      </View>
    </ThemeBridge>
  );
};

function App() {
  useEffect(() => {
    installThemedAlertMonkeyPatch();

    // Initialize database on app start.
    // Skip during Jest runs.
    const env = (globalThis as any).process?.env as Record<string, string | undefined> | undefined;
    const isJest = Boolean(env?.JEST_WORKER_ID) || env?.NODE_ENV === 'test';
    if (isJest) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const db = require('./src/services/database') as typeof import('./src/services/database');
      db.initDatabase().catch((error) => {
        // Non-fatal: app can still boot, but DB-backed features will fail.
        console.error('Failed to initialize database:', error);
      });
    } catch (error) {
      console.error('Failed to initialize database:', error);
    }
  }, []);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics ?? undefined}>
      <AppProviders>
        <AppContent />
      </AppProviders>
    </SafeAreaProvider>
  );
}

export default App;
