import React from 'react';

import { AppProvider } from './AppContext';
import { AuthProvider } from './AuthContext';
import { BudgetProvider } from './BudgetContext';
import { ReceiptProvider } from './ReceiptContext';
import { ThemeProvider } from './ThemeContext';

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppProvider>
          <ReceiptProvider>
            <BudgetProvider>{children}</BudgetProvider>
          </ReceiptProvider>
        </AppProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

export * from './ThemeContext';
export * from './AuthContext';
export * from './AppContext';
export * from './ReceiptContext';
export * from './BudgetContext';
