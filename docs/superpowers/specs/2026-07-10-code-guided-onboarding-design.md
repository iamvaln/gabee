# Code module — learn-by-doing guided onboarding (design)

**Date:** 2026-07-10
**Status:** approved design → implementation plan next

## Problem
Nearly every kid tester needed a human to explain the **Code** module before they could
play. The blocker is a conceptual leap unique to Code: you **build the whole program,
THEN press Run** (deferred execution) — kids expect "tap = move". One tester (Gilles)
figured it out cold, but that's an outlier. The other modules (tap an answer) are
self-evident and are **out of scope** here.

## Goal
The **first exercise of each Code sub-mode** (maze, draw, actions) becomes an
**active, step-by-step guided lesson** that walks a 5–10-year-old (some pre-reading,
bilingual FR/EN, **no audio**) through using **all that sub-mode's commands** by DOING
them — the app points at the exact next action, waits for the kid to perform it, then
advances. Learn-by-doing, impossible to get lost.

## Non-goals (v1)
- Other modules (Numbers, Words, Keyboard, Translation) — the engine is built to be
  reused for them later, but no scripts are authored now.
- Voice-over / audio (none exists in the app today; meaning is carried by
  animation + pointing + minimal text).
- New puzzle content — the guide overlays the **real** first puzzle (level 1, lesson 1,
  question 1), which is already trivial at level 1.

## Decisions (settled in brainstorming)
- **Active step-by-step gating** (not a passive demo): the kid performs each step.
- **Once per sub-mode, per profile, skippable**: shown the first time this kid opens
  that sub-mode; a "Passer / Je sais" escape sets the seen flag; a "?" help button in
  the session header replays it any time.
- **Per sub-mode** (not per module): maze / draw / actions have different commands, so
  each has its own script. (Actions is the only one with pick/drop.)
- **v1 = Code only.** Framework is reusable; other modules follow later.
- **Approach A — data-driven guidance engine** (chosen over hardcoded per-session
  branches or a decoupled overlay): one small engine + per-sub-mode step scripts,
  content separated from mechanism.

## Architecture

### 1. Guidance engine — `apps/kid/src/lib/guide.ts`
Pure, framework-level. No Code specifics.

```ts
type GuideAction =
  | 'tap'            // "next" tap on the coach / anywhere — for narration steps
  | 'block-placed'   // an arrow was added to the program
  | 'pick-placed'    // the ✋ pick command was added
  | 'drop-placed'    // the 📥 drop command was added
  | 'run-pressed'    // ▶ Run pressed
  | 'success';       // the run succeeded

interface GuideStep {
  coach: { fr: string; en: string };   // minimal, emoji-forward
  target?: string;                     // anchor key the session registers (see §3)
  advanceOn: GuideAction;              // what the kid must do to move on
  allow?: string[];                    // which action targets are enabled this step
                                       // (everything else is gated/disabled)
}

type GuideScript = GuideStep[];
```

`useGuide(script, { active, onDone })` returns:
`{ stepIndex, step, active, report(action), skip(), pointerTarget, allow }`.
- `report(action)` advances iff `action === step.advanceOn`.
- `skip()` ends the guide (fires `onDone`).
- When the last step completes → `onDone()`.

Persistence helper (localStorage, mirrors `lib/sessionResume`):
`guideSeen(profileId, subKey): boolean` / `markGuideSeen(...)` /
key `gabee:guide-seen:${profileId}:${subKey}` where `subKey = 'code:maze' | 'code:draw' | 'code:actions'`.

### 2. Overlay components — `apps/kid/src/components/Guide*.tsx`
- `GuidePointer` — an animated 👆 / halo anchored to the current `target` element's
  bounding rect (reads `getBoundingClientRect` of a registered anchor; re-measures on
  resize/scroll). Purely visual, `pointer-events: none`.
- Coach message **reuses the existing `bee-coach`** surface (already in every session) —
  the guide just feeds it `step.coach[lang]`.
- A small "Passer" pill (during the guide) and a "?" help button in the session header
  (replays the guide) — both drive `skip()` / re-activation.

### 3. Session integration — `CodeTurtleSession.tsx`
Minimal, additive:
- Compute `subKey = \`code:${world}\``. Guide is `active` when it's the first exercise
  (level 1, lesson 1, `qIdx === 0`) **and** `!guideSeen(profileId, subKey)` — or when the
  "?" help button forces it.
- Register **anchors** for the pointer via a ref callback `guideAnchor(key)` on: the goal
  cell, each palette button (`palette:up|down|left|right|pick|drop`), and the Run button
  (`run`).
- **Report actions**: `addBlock(k)` → `report(k==='pick'?'pick-placed':k==='drop'?'drop-placed':'block-placed')`;
  `startRun()` → `report('run-pressed')`; on success → `report('success')`.
- **Gating**: while guided, only targets in `step.allow` are enabled (palette buttons /
  Run get `disabled` unless allowed). Reuses the existing `disabled` plumbing +
  `editLocked`.
- On guide completion (or skip) → `markGuideSeen(profileId, subKey)` and normal play
  continues on the same puzzle.

The `advanceOn: 'block-placed'` steps repeat per required move: the script for the first
puzzle is generated from the puzzle's reference answer length (e.g. a 2-move maze →
two "pose la flèche" steps, each pointing at the correct arrow).

### 4. Scripts — `apps/kid/src/lib/guideScripts.ts`
Per sub-mode. Narration steps are fixed; the "place this arrow" steps are expanded from
the first puzzle's solution (which arrow to point at each step).

- **Maze** — teaches: goal → build a sequence of arrows → **Run**.
  1. "Amène la bee à l'étoile ⭐" (point goal) — `tap`
  2. …per solution move: "Pose cette flèche 👆" (point the correct arrow, only it enabled) — `block-placed`
  3. "Maintenant, appuie sur ▶ Lancer !" (point Run) — `run-pressed`
  4. bee animates → "Bravo, tu as **programmé** la bee 🎉" — `success` → done
- **Draw** — same shape, + teaches the pen leaves a trail.
  1. "Trace le même dessin ✏️ — la bee laisse une trace en avançant" (point target) — `tap`
  2. …"Pose cette flèche 👆" — `block-placed`
  3. "▶ Lancer !" — `run-pressed`
  4. "La bee a dessiné ! 🎨" — `success` → done
- **Actions** — teaches move + **✋ Ramasser** + **📥 Poser** (build-then-run with pick/drop).
  1. "Amène l'objet 📦 sur la cible 🎯" (point item + target) — `tap`
  2. "Pose la flèche vers l'objet 👆" — `block-placed`
  3. "Ajoute ✋ Ramasser" (point pick) — `pick-placed`
  4. "Pose la flèche vers la cible 👆" — `block-placed`
  5. "Ajoute 📥 Poser" (point drop) — `drop-placed`
  6. "▶ Lancer !" — `run-pressed`
  7. "Génial, la bee a livré l'objet ! 🎉" — `success` → done

i18n: coach strings live in the scripts (fr/en pairs), consistent with question content
carrying its own bilingual copy. Emoji carry meaning for pre-readers.

## Data flow
first-exercise mount → `active = firstExercise && !seen` → `useGuide` sets `step 0` →
`GuidePointer` anchors to `step.target`, coach shows `step.coach`, session gates to
`step.allow` → kid performs the action → session `report()` → engine advances → … →
last step `success` → `markGuideSeen` → guide off, kid keeps playing the same puzzle.

## Edge cases
- **Skip**: "Passer" → `markGuideSeen` + guide off immediately (real puzzle stays,
  fully interactive).
- **Wrong action while gated**: impossible — non-target actions are disabled, so the kid
  can only do the prompted step.
- **Help replay**: "?" re-activates the guide on the current puzzle (does not require it
  to be the first exercise).
- **Puzzle solution vs kid input**: the guide points at the reference-answer arrow each
  step; since only that arrow is enabled, the built program equals the solution → Run
  succeeds → clean `success`.
- **Reload mid-guide**: guide state is not persisted (it's short); on reload the guide
  simply restarts if still unseen — acceptable (seconds long).

## Testing
- Engine unit tests: `report()` advances only on the matching action; `skip()` ends;
  last step fires `onDone`.
- Script tests: each sub-mode script's `advanceOn` sequence matches the command set it
  must teach (maze: block+run; actions: block+pick+drop+run).
- Manual: first-ever maze/draw/actions exercise runs the guide; gating blocks non-target
  actions; "Passer" and "?" work; a second visit is un-guided (seen flag).

## Rollout
1. Engine + overlay + persistence (framework).
2. Code integration (`CodeTurtleSession`) + the 3 scripts.
3. Ship, observe (we already emit `code_run` + attempt counts → can compare
   attempts-to-first-success before/after).
4. Later: reuse the engine for the other modules (own specs), sub-mode by sub-mode.
