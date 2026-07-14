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
   * `true` when the kid app holds a parent SESSION JWT (from email/password
   * login on this device) that hasn't been swapped for a device-bound bearer
   * yet — App.tsx routes to LinkDeviceCode in that case.
   *
   * Default is `false` — critically, pre-existing users (paired before this
   * field existed) keep the default after rehydrate, so they're NOT
   * re-prompted to pair. Only an explicit `setAuth(..., needsDeviceLink: true)`
   * from the Login screen flips it on.
   */
  needsDeviceLink: boolean;
  /**
   * Set when the parent taps "Plus tard — juste jouer cette fois" on
   * LinkDeviceCode. PERSISTED (parent feedback): a page refresh must NOT
   * re-nag the pairing prompt every time. A fresh login (`setAuth`) resets it,
   * so the parent is re-nudged to pair on the next SIGN-IN — not on refresh.
   */
  deviceLinkSkipped: boolean;
  /**
   * Master audio switch (spec 2026-07-13-kid-audio §3). Persisted so it works
   * offline before a profile is picked; semantically it is the LAST SELECTED
   * kid's pref — always re-seeded from profile.audio_enabled on select.
   */
  audioEnabled: boolean;
  /** Selected child profile (re-picked each launch; not persisted). */
  profile: ChildProfile | null;
  /** Current play sitting (a session = one or more lessons). */
  play: PlaySession | null;

  setLang: (lang: Language) => void;
  setAuth: (token: string, parent: ParentRef, needsDeviceLink?: boolean) => void;
  clearAuth: () => void;
  skipDeviceLink: () => void;
  setProfile: (profile: ChildProfile | null) => void;
  setAudioEnabled: (v: boolean) => void;
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
      needsDeviceLink: false,
      deviceLinkSkipped: false,
      audioEnabled: true,
      profile: null,
      play: null,

      setLang: (lang) => set({ lang }),
      setAuth: (token, parent, needsDeviceLink = false) => {
        setApiToken(token);
        // A fresh setAuth resets the in-session skip flag — switching accounts
        // or re-pairing should re-prompt for device linking.
        set({ token, parent, needsDeviceLink, deviceLinkSkipped: false });
      },
      clearAuth: () => {
        setApiToken(null);
        set({ token: null, parent: null, needsDeviceLink: false, deviceLinkSkipped: false, profile: null, play: null });
      },
      skipDeviceLink: () => set({ deviceLinkSkipped: true }),
      // Selecting a kid seeds the device pref from their saved setting; the
      // star-update spreads sessions do ({...profile, total_stars}) re-seed
      // with the same value because setAudioEnabled keeps both sides in sync.
      setProfile: (profile) =>
        set(profile ? { profile, audioEnabled: profile.audio_enabled } : { profile }),
      setAudioEnabled: (v) =>
        set((s) => ({
          audioEnabled: v,
          profile: s.profile ? { ...s.profile, audio_enabled: v } : s.profile,
        })),
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
      partialize: (s) => ({ lang: s.lang, token: s.token, parent: s.parent, needsDeviceLink: s.needsDeviceLink, deviceLinkSkipped: s.deviceLinkSkipped, audioEnabled: s.audioEnabled }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) setApiToken(state.token);
      },
    },
  ),
);

// Any 401 from the API drops the persisted token + parent + profile, so App.tsx
// re-routes to Login. Registered once at module load.
setUnauthorizedHandler(() => useStore.getState().clearAuth());
