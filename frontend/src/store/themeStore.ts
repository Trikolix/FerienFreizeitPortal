import { create } from 'zustand';

interface ThemeState {
  theme: 'default' | 'high-contrast' | 'colorblind';
  setTheme: (theme: 'default' | 'high-contrast' | 'colorblind') => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: 'default',
  setTheme: (theme) => set({ theme }),
}));
