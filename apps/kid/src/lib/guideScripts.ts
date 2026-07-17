/**
 * Per-sub-mode guided-onboarding scripts for the Code module. A script is
 * generated from the puzzle's flat reference solution: one gated "place this
 * prim" step per prim (pointing the 👇 at exactly that palette button), then a
 * Run step, then a success celebration. Copy is bilingual, emoji-forward (no
 * audio; some kids pre-read). See the design spec for the teaching intent.
 */
import type { GuideScript, GuideStep } from './guide';
import type { Puzzle, Prim, CodeWorld, MoveDir } from './turtle';

// No emoji in coach text — the GuidePointer already points at the target button.
const INTRO: Record<CodeWorld, { fr: string; en: string }> = {
  maze: { fr: "Amène l'abeille à l'étoile.", en: 'Get the bee to the star.' },
  draw: { fr: "Trace le dessin — l'abeille laisse une trace.", en: 'Trace the drawing — the bee leaves a trail.' },
  actions: { fr: "Amène l'objet sur la cible.", en: 'Bring the object to the target.' },
};

const PLACE_ARROW = { fr: 'Pose cette flèche.', en: 'Place this arrow.' };
const ADD_PICK = { fr: 'Ajoute Ramasse.', en: 'Add Pick.' };
const ADD_DROP = { fr: 'Ajoute Pose.', en: 'Add Drop.' };
const PRESS_RUN = { fr: 'Maintenant appuie sur Lancer.', en: 'Now press Run.' };
const WIN: Record<CodeWorld, { fr: string; en: string }> = {
  maze: { fr: "Bravo ! Tu as programmé l'abeille.", en: 'Great! You programmed the bee.' },
  draw: { fr: "Bravo ! L'abeille a dessiné.", en: 'Great! The bee drew it.' },
  actions: { fr: "Bravo ! L'abeille a livré l'objet.", en: 'Great! The bee delivered it.' },
};

export function buildGuideScript(world: CodeWorld, _puzzle: Puzzle, flatSolution: Prim[]): GuideScript {
  if (flatSolution.length === 0) return [];
  const steps: GuideStep[] = flatSolution.map((p) => {
    if (p.op === 'move') {
      return { coach: PLACE_ARROW, target: `palette:${p.dir}`, advanceOn: 'block-placed', allow: [`palette:${p.dir}`] };
    }
    if (p.op === 'pick') {
      return { coach: ADD_PICK, target: 'palette:pick', advanceOn: 'pick-placed', allow: ['palette:pick'] };
    }
    return { coach: ADD_DROP, target: 'palette:drop', advanceOn: 'drop-placed', allow: ['palette:drop'] };
  });
  // Prefix the first action with the world intro so there's no separate tap-step.
  const first = steps[0]!;
  first.coach = { fr: `${INTRO[world].fr} ${first.coach.fr}`, en: `${INTRO[world].en} ${first.coach.en}` };
  steps.push({ coach: PRESS_RUN, target: 'run', advanceOn: 'run-pressed', allow: ['run'] });
  steps.push({ coach: WIN[world], advanceOn: 'success', allow: [] });
  return steps;
}
