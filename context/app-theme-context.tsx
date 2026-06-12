import React, { createContext, useContext, useState } from 'react';

type AppThemeContextValue = {
  darkMode: boolean;
  setDarkMode: (value: boolean | ((prev: boolean) => boolean)) => void;
};

const AppThemeContext = createContext<AppThemeContextValue>({
  darkMode: false,
  setDarkMode: () => {},
});

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [darkMode, setDarkMode] = useState(false);
  return (
    <AppThemeContext.Provider value={{ darkMode, setDarkMode }}>
      {children}
    </AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(AppThemeContext);
}
