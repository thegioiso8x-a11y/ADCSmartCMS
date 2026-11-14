import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserData {
  id: string;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
}

interface AuthState {
  token: string | null;
  user: UserData | null;
  siteId: string;
  setAuth: (token: string, user: UserData) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      siteId: '2FD0078F-0043-4083-B34F-4BDF7BF6A604',
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'adc-cms-auth' }
  )
);
