import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark';

export type AppState = {
  theme: Theme;
  sidebarOpen: boolean;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'light',
      sidebarOpen: true,

      toggleTheme: () =>
        set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
    }),
    {
      name: 'tempo-testnet-app',
      version: 2,
      migrate: (persistedState) => {
        // Always start in light mode; we do not persist theme.
        if (!persistedState || typeof persistedState !== 'object') {
          return { theme: 'light', sidebarOpen: true } as AppState;
        }

        const state = persistedState as Partial<AppState>;
        return { theme: 'light', sidebarOpen: state.sidebarOpen ?? true } as AppState;
      },
      partialize: (state) => ({ sidebarOpen: state.sidebarOpen }),
    },
  ),
);
