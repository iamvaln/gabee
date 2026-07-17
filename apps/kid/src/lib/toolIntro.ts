// apps/kid/src/lib/toolIntro.ts
// First-encounter tool intros. The L1 guided walkthrough teaches the arrows;
// the richer blocks (loop, if, pen) appear later, so the FIRST time a child is
// offered one we show a one-line demo + a pointer at its bank button. "Seen"
// is tracked per profile (device localStorage), across worlds — a loop met in
// maze isn't re-introduced in draw.

/** Blocks that get a first-encounter intro. Arrows/pick/drop are the L1 guide's job. */
export const INTRO_TOOLS = ['repeat', 'if', 'pen_up', 'pen_down'] as const;
export type IntroTool = (typeof INTRO_TOOLS)[number];

export const INTRO_COPY: Record<IntroTool, { fr: string; en: string }> = {
  repeat: { fr: 'Nouveau bloc : la boucle. Elle répète les blocs à l’intérieur.', en: 'New block: the loop. It repeats the blocks inside it.' },
  if: { fr: 'Nouveau bloc : « si ». Il choisit selon le mur devant l’abeille.', en: 'New block: “if”. It chooses based on the wall ahead.' },
  pen_up: { fr: 'Nouveau : lève le crayon pour bouger sans tracer.', en: 'New: lift the pen to move without drawing.' },
  pen_down: { fr: 'Nouveau : baisse le crayon pour tracer de nouveau.', en: 'New: put the pen down to draw again.' },
};

const KEY = (profileId: string | null) => `gabee.kid.tools.${profileId ?? 'anon'}`;

export function seenTools(profileId: string | null): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(KEY(profileId));
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? (arr as string[]) : []);
  } catch { return new Set(); }
}

export function markToolSeen(profileId: string | null, tool: string): void {
  if (typeof window === 'undefined') return;
  const set = seenTools(profileId);
  if (set.has(tool)) return;
  set.add(tool);
  try { window.localStorage.setItem(KEY(profileId), JSON.stringify([...set])); } catch { /* ignore quota */ }
}

/** The intro-able blocks in `blocks` this profile hasn't met yet, in intro order. */
export function newTools(profileId: string | null, blocks: string[]): IntroTool[] {
  const seen = seenTools(profileId);
  return INTRO_TOOLS.filter((t) => blocks.includes(t) && !seen.has(t));
}
