import { z } from 'zod';

/**
 * Bilingual content is stored as an FR + EN pair (product §5). Parity is enforced
 * structurally: a `{ fr, en }` value cannot exist with one side missing.
 */
export type Bilingual<T> = { fr: T; en: T };

/** Wrap any schema into a required `{ fr, en }` pair. */
export const bilingual = <T extends z.ZodType>(inner: T) => z.object({ fr: inner, en: inner });

/** A non-empty bilingual string — the common case (prompts, words, sentences). */
export const BilingualStringSchema = bilingual(z.string().min(1));
export type BilingualString = z.infer<typeof BilingualStringSchema>;

/** Narrowing guard: is a value a bilingual `{ fr, en }` pair (vs a bare string/number)? */
export function isBilingual(value: unknown): value is Bilingual<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'fr' in value &&
    'en' in value &&
    !Array.isArray(value)
  );
}
