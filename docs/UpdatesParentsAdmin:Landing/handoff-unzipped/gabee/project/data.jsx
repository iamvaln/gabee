// data.jsx — Gabee static content + helpers
// Module definitions, demo profiles, sample questions.

const MODULES = [
  { id: 'numbers', label: { fr: 'Nombres', en: 'Numbers' }, icon: 'numbers',
    sub: { fr: 'Compter, additionner', en: 'Count, add, subtract' },
    tagline: { fr: 'Gabee compte avec toi', en: 'Gabee counts with you' } },
  { id: 'words', label: { fr: 'Mots', en: 'Words' }, icon: 'words',
    sub: { fr: 'Lire, écrire, comprendre', en: 'Read, write, build' },
    tagline: { fr: 'Gabee découvre les mots', en: 'Gabee discovers words' } },
  { id: 'keyboard', label: { fr: 'Clavier', en: 'Keyboard' }, icon: 'keyboard',
    sub: { fr: 'Taper avec les dix doigts', en: 'Type with all your fingers' },
    tagline: { fr: 'Gabee apprend à taper', en: 'Gabee learns to type' } },
  { id: 'code', label: { fr: 'Code', en: 'Code' }, icon: 'code',
    sub: { fr: 'Programmer un robot', en: 'Move the robot' },
    tagline: { fr: 'Gabee programme avec toi', en: 'Gabee codes with you' } },
  { id: 'translation', label: { fr: 'Traduction', en: 'Translate' }, icon: 'translation',
    sub: { fr: 'Français ↔ Anglais', en: 'French ↔ English' },
    tagline: { fr: 'Gabee parle deux langues', en: 'Gabee speaks two languages' } }
];

const PROFILES = [
  { id: 'rumi',  name: 'Rumi',  hue: 28,  hair: '#3A2A1A', shirt: '#1F6FEB' },
  { id: 'leo',   name: 'Léo',   hue: 200, hair: '#E89B3B', shirt: '#7B2FF7' },
  { id: 'djino', name: 'Djino', hue: 120, hair: '#1B1A18', shirt: '#3F7A2E' },
  { id: 'chloe', name: 'Chloé', hue: 320, hair: '#C44',    shirt: '#D6336C' }
];

// Progress map: module → level (0-9 unlocked count)
const SAMPLE_PROGRESS = {
  rumi: {
    totalStars: 142,
    today: { stars: 12, lessons: 2, modulesTouched: ['numbers', 'words'], targetLessons: 2 },
    numbers: { unlocked: 5, completed: 4, lessonsByLevel: { 1: 4, 2: 4, 3: 4, 4: 3, 5: 1 } },
    words: { unlocked: 3, completed: 2, lessonsByLevel: { 1: 4, 2: 4, 3: 1 } },
    keyboard: { unlocked: 2, completed: 1, lessonsByLevel: { 1: 4, 2: 1 } },
    code: { unlocked: 4, completed: 3, lessonsByLevel: { 1: 4, 2: 4, 3: 4, 4: 2 } },
    translation: { unlocked: 2, completed: 1, lessonsByLevel: { 1: 4, 2: 2 } }
  }
};

// SVG icons per module (white-on-color, ink on ochre)
const MODULE_ICONS = {
  numbers: (
    <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden>
      <text x="16" y="22" textAnchor="middle" fontFamily="'Mulish', sans-serif" fontWeight="800" fontSize="22">7</text>
      <circle cx="6" cy="6" r="2" />
      <circle cx="26" cy="6" r="2" />
      <circle cx="6" cy="26" r="2" />
      <circle cx="26" cy="26" r="2" />
    </svg>
  ),
  words: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8 H26" />
      <path d="M6 16 H22" />
      <path d="M6 24 H18" />
    </svg>
  ),
  keyboard: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <rect x="3" y="8" width="26" height="16" rx="3" />
      <circle cx="9" cy="14" r="1.2" fill="currentColor" />
      <circle cx="14" cy="14" r="1.2" fill="currentColor" />
      <circle cx="19" cy="14" r="1.2" fill="currentColor" />
      <circle cx="24" cy="14" r="1.2" fill="currentColor" />
      <rect x="10" y="18" width="12" height="2.5" rx="1.2" fill="currentColor" />
    </svg>
  ),
  code: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 10 L5 16 L11 22" />
      <path d="M21 10 L27 16 L21 22" />
      <path d="M19 8 L13 24" />
    </svg>
  ),
  translation: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <text x="9" y="14" textAnchor="middle" fontFamily="'Mulish'" fontWeight="800" fontSize="11" fill="currentColor" stroke="none">FR</text>
      <text x="23" y="26" textAnchor="middle" fontFamily="'Mulish'" fontWeight="800" fontSize="11" fill="currentColor" stroke="none">EN</text>
      <path d="M6 19 L26 19" strokeLinecap="round" />
      <path d="M22 16 L26 19 L22 22" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 22 L6 19 L10 16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
};

// Sample questions by module
const NUMBERS_QUESTIONS = [
  { prompt: '23 + 14', answer: 37, options: [35, 47, 27, 37] },
  { prompt: '50 − 18', answer: 32, options: [22, 32, 42, 38] },
  { prompt: '7 × 5',   answer: 35, options: [12, 25, 35, 40] }
];

const WORDS_FILL_QUESTIONS = {
  fr: { sentence: ['Le', '___', 'mange', 'une', 'pomme.'], options: ['chat', 'voiture', 'soleil'], answer: 'chat' },
  en: { sentence: ['The', '___', 'eats', 'an', 'apple.'], options: ['cat', 'car', 'sun'], answer: 'cat' }
};

const WORDS_BUILD_QUESTIONS = {
  fr: { words: ['Ana', 'aime', 'lire', 'des', 'livres'], target: 'Ana aime lire des livres' },
  en: { words: ['Ana', 'likes', 'to', 'read', 'books'], target: 'Ana likes to read books' }
};

const WORDS_PICTURE_QUESTIONS = {
  fr: { emoji: '🦊', options: ['renard', 'lapin', 'chien'], answer: 'renard' },
  en: { emoji: '🦊', options: ['fox', 'rabbit', 'dog'], answer: 'fox' }
};

const TRANSLATION_QUESTIONS = [
  { from: 'fr', to: 'en', source: 'pomme', answer: 'apple', options: ['apple', 'orange', 'bread', 'pear'] },
  { from: 'en', to: 'fr', source: 'house', answer: 'maison', options: ['maison', 'voiture', 'fenêtre', 'jardin'] }
];

const KEYBOARD_TARGETS = ['cat', 'chat', 'sun', 'soleil'];

// Parent → Kid messages waiting for the current profile (oldest first).
// `from` is the parent's display_name_for_kids, used verbatim in the bandeau + reader.
const KID_MESSAGES = [
  { id: 'km1', from: 'Maman', text: 'Bravo pour ton niveau 6 en Nombres, ma puce ! On est très fiers de toi. 💛' },
  { id: 'km2', from: 'Papa', text: 'Tu peux essayer le module Code ce soir si tu veux, je regarderai avec toi.' },
];

const COPY = {
  greeting: { fr: 'Coucou', en: 'Hi' },
  pickProfile: { fr: 'Qui joue aujourd\'hui ?', en: 'Who\'s playing today?' },
  playAgain: { fr: 'Encore jouer', en: 'Play again' },
  home: { fr: 'Accueil', en: 'Home' },
  back: { fr: 'Retour', en: 'Back' },
  level: { fr: 'Niveau', en: 'Level' },
  lesson: { fr: 'Leçon', en: 'Lesson' },
  revision: { fr: 'Révision', en: 'Revision' },
  locked: { fr: 'Termine le précédent', en: 'Finish the level before' },
  niceTry: { fr: 'Bonne idée — réessaie !', en: 'Good try — try again!' },
  bravo: { fr: 'Bravo', en: 'Nice work' },
  perfect: { fr: 'Parfait !', en: 'Perfect!' },
  next: { fr: 'Suivant', en: 'Next' },
  run: { fr: 'Lancer', en: 'Run' },
  check: { fr: 'Vérifier', en: 'Check' },
  levelDone: { fr: 'Niveau terminé !', en: 'Level complete!' },
  dailyDone: { fr: 'Beau travail aujourd\'hui !', en: 'Great job today!' },
  tomorrow: { fr: 'À demain.', en: 'See you tomorrow.' },
  enoughBreak: { fr: 'Tu as bien travaillé. Fais une pause ?', en: 'You\'ve done plenty — take a break?' },
  settings: { fr: 'Réglages', en: 'Settings' },
  changeAvatar: { fr: 'Changer d\'avatar', en: 'Change avatar' },
  changeName: { fr: 'Changer de nom', en: 'Change name' },
  audio: { fr: 'Voix off', en: 'Voice-over' },
  switchProfile: { fr: 'Changer de profil', en: 'Switch profile' },
  signOut: { fr: 'Se déconnecter', en: 'Sign out' },
  offline: { fr: 'Hors-ligne — tout est sauvegardé', en: 'Offline — everything is saved' },
  syncing: { fr: 'Synchronisation…', en: 'Syncing…' },
  // parent → kid message
  msgBandeau: (who) => ({ fr: `${who} t'a laissé un mot`, en: `${who} left you a word` }),
  msgTapRead: { fr: 'Touche pour lire', en: 'Tap to read' },
  msgContinue: { fr: 'Continuer', en: 'Continue' }
};

Object.assign(window, {
  MODULES, PROFILES, SAMPLE_PROGRESS, MODULE_ICONS,
  NUMBERS_QUESTIONS, WORDS_FILL_QUESTIONS, WORDS_BUILD_QUESTIONS,
  WORDS_PICTURE_QUESTIONS, TRANSLATION_QUESTIONS, KEYBOARD_TARGETS,
  KID_MESSAGES, COPY
});
