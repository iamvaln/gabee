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
  /**
   * Device-link id once the device has been paired (link or short-code path).
   * `null` means we hold a regular parent-session JWT but the device itself
   * isn't bound — App.tsx routes to LinkDeviceCode in that case so the
   * parent can finish pairing without re-logging-in.
   */
  deviceLinkId: string | null;
  /**
   * In-session sentinel: when the parent taps "Skip" on LinkDeviceCode we
   * remember it so we don't re-prompt them on the next render. NOT persisted —
   * a refresh re-prompts, which is desirable for a half-finished pair.
   */
  deviceLinkSkipped: boolean;
  /** Selected child profile (re-picked each launch; not persisted). */
  profile: ChildProfile | null;
  /** Current play sitting (a session = one or more lessons). */
  play: PlaySession | null;

  setLang: (lang: Language) => void;
  setAuth: (token: string, parent: ParentRef, deviceLinkId?: string | null) => void;
  clearAuth: () => void;
  setDeviceLinkId: (id: string | null) => void;
  skipDeviceLink: () => void;
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
      deviceLinkId: null,
      deviceLinkSkipped: false,
      profile: null,
      play: null,

      setLang: (lang) => set({ lang }),
      setAuth: (token, parent, deviceLinkId = null) => {
        setApiToken(token);
        // A fresh setAuth resets the in-session skip flag — switching accounts
        // or re-pairing should re-prompt for device linking.
        set({ token, parent, deviceLinkId, deviceLinkSkipped: false });
      },
      clearAuth: () => {
        setApiToken(null);
        set({ token: null, parent: null, deviceLinkId: null, deviceLinkSkipped: false, profile: null, play: null });
      },
      setDeviceLinkId: (id) => set({ deviceLinkId: id }),
      skipDeviceLink: () => set({ deviceLinkSkipped: true }),
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
      partialize: (s) => ({ lang: s.lang, token: s.token, parent: s.parent, deviceLinkId: s.deviceLinkId }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) setApiToken(state.token);
      },
    },
  ),
);

// Any 401 from the API drops the persisted token + parent + profile, so App.tsx
// re-routes to Login. Registered once at module load.
setUnauthorizedHandler(() => useStore.getState().clearAuth());
