import type { Language } from '@gabee/types';

/**
 * The editorial line's product facts as form fields and back. Only the keys
 * the form edits change; every other key (modules, languages…) is kept, so an
 * untouched form gives back an equal object.
 */

export type Facts = Record<string, unknown>;

export type FactsForm = {
  ageMin: string;
  ageMax: string;
  freePrice: string;
  freeChildren: string;
  paid: boolean;
  paidName: string;
  paidPrice: string;
  paidIncludes: string;
  otherFacts: string;
};

export const EDITED = new Set(['ages', 'free_tier', 'paid_offer', 'other_facts']);

export const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
export const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const lines = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const splitLines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);

export function factsForm(facts: Facts): FactsForm {
  const ages = obj(facts.ages);
  const free = obj(facts.free_tier);
  const paid = obj(facts.paid_offer);
  return {
    ageMin: str(ages?.min),
    ageMax: str(ages?.max),
    freePrice: str(free?.price),
    freeChildren: str(free?.max_children),
    paid: paid !== null || (typeof facts.paid_offer === 'string' && facts.paid_offer !== ''),
    paidName: paid ? str(paid.name) : str(facts.paid_offer),
    paidPrice: str(paid?.price),
    paidIncludes: lines(paid?.includes).join('\n'),
    otherFacts: lines(facts.other_facts).join('\n'),
  };
}

const int = (s: string) => (s.trim() === '' ? null : Number(s.trim()));

/** The product facts to publish: the original object with the edited keys replaced (unchanged form → equal object). */
export function buildFacts(original: Facts, f: FactsForm): Facts {
  const out: Facts = { ...original };
  // A block emptied in the form is removed: the agents then never state it.
  if (f.ageMin.trim() || f.ageMax.trim()) out.ages = { ...obj(original.ages), min: int(f.ageMin), max: int(f.ageMax) };
  else delete out.ages;
  if (f.freePrice.trim() || f.freeChildren.trim()) {
    out.free_tier = { ...obj(original.free_tier), price: f.freePrice.trim(), max_children: int(f.freeChildren) };
  } else delete out.free_tier;
  if (f.paid) {
    const was = obj(original.paid_offer);
    const includes = splitLines(f.paidIncludes);
    out.paid_offer = {
      ...was,
      name: f.paidName.trim(),
      price: f.paidPrice.trim(),
      ...(includes.length || (was && 'includes' in was) ? { includes } : {}),
    };
  } else if ('paid_offer' in original) {
    // No paid offer: the agents must not mention one.
    out.paid_offer = null;
  }
  const other = splitLines(f.otherFacts);
  if (other.length || 'other_facts' in original) out.other_facts = other;
  return out;
}

export function factsErrors(f: FactsForm, lang: Language): Record<string, string | null> {
  const L = lang === 'fr';
  const min = int(f.ageMin);
  const max = int(f.ageMax);
  const age = (n: number | null) => n !== null && Number.isInteger(n) && n >= 1 && n <= 18;
  const children = int(f.freeChildren);
  return {
    ages:
      min === null && max === null
        ? null
        : !age(min) || !age(max)
          ? L
            ? 'Indiquez deux âges entiers entre 1 et 18.'
            : 'Enter two whole ages between 1 and 18.'
          : min! > max!
            ? L
              ? 'L’âge minimum doit être inférieur ou égal au maximum.'
              : 'The minimum age must not exceed the maximum.'
            : null,
    freeChildren:
      children !== null && !(Number.isInteger(children) && children >= 1)
        ? L
          ? 'Un nombre entier d’enfants, au moins 1.'
          : 'A whole number of children, at least 1.'
        : null,
    paid:
      f.paid && (!f.paidName.trim() || !f.paidPrice.trim())
        ? L
          ? 'Donnez au moins le nom et le prix de l’offre payante.'
          : 'Give at least the name and the price of the paid offer.'
        : null,
  };
}
