import React, { useEffect } from 'react';
import { Platform, StatusBar, useColorScheme } from 'react-native';
import {
  SafeAreaProvider,
} from 'react-native-safe-area-context';

import { AppProviders } from '@/contexts';
import { useTheme as usePersistedTheme } from '@/hooks/useTheme';
import { AppNavigator } from '@/navigation';
import { ThemeProvider as DesignThemeProvider } from '@/theme';

function ThemeBridge({ children }: { children: React.ReactNode }) {
  const { isDark } = usePersistedTheme();
  return <DesignThemeProvider mode={isDark ? 'dark' : 'light'}>{children}</DesignThemeProvider>;
}

const AppContent = () => {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <ThemeBridge>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={isDarkMode ? '#000000' : '#FFFFFF'}
        translucent={Platform.OS !== 'android'}
      />
      <AppNavigator />
    </ThemeBridge>
  );
};

function App() {
  useEffect(() => {
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
    <SafeAreaProvider>
      <AppProviders>
        <AppContent />
      </AppProviders>
    </SafeAreaProvider>
  );
}

export default App;
