import type { Module } from '@gabee/types';

export interface ModuleDef {
  id: Module;
  label: { fr: string; en: string };
  sub: { fr: string; en: string };
  tagline: { fr: string; en: string };
}

export const MODULES: ModuleDef[] = [
  { id: 'numbers', label: { fr: 'Nombres', en: 'Numbers' }, sub: { fr: 'Compter, additionner', en: 'Count, add, subtract' }, tagline: { fr: 'Gabee compte avec toi', en: 'Gabee counts with you' } },
  { id: 'words', label: { fr: 'Mots', en: 'Words' }, sub: { fr: 'Lire, écrire, comprendre', en: 'Read, write, build' }, tagline: { fr: 'Gabee découvre les mots', en: 'Gabee discovers words' } },
  { id: 'keyboard', label: { fr: 'Clavier', en: 'Keyboard' }, sub: { fr: 'Taper avec les dix doigts', en: 'Type with all your fingers' }, tagline: { fr: 'Gabee apprend à taper', en: 'Gabee learns to type' } },
  { id: 'code', label: { fr: 'Code', en: 'Code' }, sub: { fr: 'Programmer un robot', en: 'Move the robot' }, tagline: { fr: 'Gabee programme avec toi', en: 'Gabee codes with you' } },
  { id: 'translation', label: { fr: 'Traduction', en: 'Translate' }, sub: { fr: 'Français ↔ Anglais', en: 'French ↔ English' }, tagline: { fr: 'Gabee parle deux langues', en: 'Gabee speaks two languages' } },
];

export const MODULE_ICONS: Record<Module, React.ReactNode> = {
  numbers: (
    <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden>
      <text x="16" y="22" textAnchor="middle" fontFamily="'Mulish', sans-serif" fontWeight="800" fontSize="22">7</text>
      <circle cx="6" cy="6" r="2" /><circle cx="26" cy="6" r="2" /><circle cx="6" cy="26" r="2" /><circle cx="26" cy="26" r="2" />
    </svg>
  ),
  words: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8 H26" /><path d="M6 16 H22" /><path d="M6 24 H18" />
    </svg>
  ),
  keyboard: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <rect x="3" y="8" width="26" height="16" rx="3" />
      <circle cx="9" cy="14" r="1.2" fill="currentColor" /><circle cx="14" cy="14" r="1.2" fill="currentColor" />
      <circle cx="19" cy="14" r="1.2" fill="currentColor" /><circle cx="24" cy="14" r="1.2" fill="currentColor" />
      <rect x="10" y="18" width="12" height="2.5" rx="1.2" fill="currentColor" />
    </svg>
  ),
  code: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 10 L5 16 L11 22" /><path d="M21 10 L27 16 L21 22" /><path d="M19 8 L13 24" />
    </svg>
  ),
  translation: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <text x="9" y="14" textAnchor="middle" fontFamily="'Mulish'" fontWeight="800" fontSize="11" fill="currentColor" stroke="none">FR</text>
      <text x="23" y="26" textAnchor="middle" fontFamily="'Mulish'" fontWeight="800" fontSize="11" fill="currentColor" stroke="none">EN</text>
      <path d="M6 19 L26 19" strokeLinecap="round" /><path d="M22 16 L26 19 L22 22" strokeLinecap="round" strokeLinejoin="round" /><path d="M10 22 L6 19 L10 16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};
