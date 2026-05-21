import { create } from 'zustand';

export type Theme = 'default' | 'colorblind' | 'deuteranopia' | 'high-contrast';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const getInitialTheme = (): Theme => {
  const savedTheme = localStorage.getItem('theme');
  if (
    savedTheme === 'default' ||
    savedTheme === 'colorblind' ||
    savedTheme === 'deuteranopia' ||
    savedTheme === 'high-contrast'
  ) {
    return savedTheme;
  }

  return 'default';
};

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    localStorage.setItem('theme', theme);
    set({ theme });
  },
}));
