import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Language, ChildProfile } from '@gabee/types';
import { setApiToken, setUnauthorizedHandler } from './lib/api';

interface ParentRef {
  id: string;
  email: string;
}
interface PlaySession {
  id: string;
  position: number;
  /** Device epoch (ms) when this sitting began — basis for session_end duration_s. */
  startedAt: number;
}

interface AppState {
  lang: Language;
  /** Device-paired parent JWT (persisted) — the bearer for API calls. */
  token: string | null;
  parent: ParentRef | null;
  /** Selected child profile (re-picked each launch; not persisted). */
  profile: ChildProfile | null;
  /** Current play sitting (a session = one or more lessons). */
  play: PlaySession | null;

  setLang: (lang: Language) => void;
  setAuth: (token: string, parent: ParentRef) => void;
  clearAuth: () => void;
  setProfile: (profile: ChildProfile | null) => void;
  /** Start (or reuse) the current play session; returns its id. */
  startPlay: () => string;
  /** Advance and return the lesson's position_in_session. */
  nextLessonPosition: () => number;
  endPlay: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      lang: 'fr',
      token: null,
      parent: null,
      profile: null,
      play: null,

      setLang: (lang) => set({ lang }),
      setAuth: (token, parent) => {
        setApiToken(token);
        set({ token, parent });
      },
      clearAuth: () => {
        setApiToken(null);
        set({ token: null, parent: null, profile: null, play: null });
      },
      setProfile: (profile) => set({ profile }),
      startPlay: () => {
        const existing = get().play;
        if (existing) return existing.id;
        const id = crypto.randomUUID();
        set({ play: { id, position: 0, startedAt: Date.now() } });
        return id;
      },
      nextLessonPosition: () => {
        const play = get().play;
        if (!play) return 1;
        const position = play.position + 1;
        set({ play: { ...play, position } });
        return position;
      },
      endPlay: () => set({ play: null }),
    }),
    {
      name: 'gabee-kid-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ lang: s.lang, token: s.token, parent: s.parent }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) setApiToken(state.token);
      },
    },
  ),
);

// Any 401 from the API drops the persisted token + parent + profile, so App.tsx
// re-routes to Login. Registered once at module load.
setUnauthorizedHandler(() => useStore.getState().clearAuth());
