import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { ResetPasswordForm } from './reset-password-form';

/**
 * /parent/reset-password?token=… — final step of the reset flow.
 *
 * Server component: reads the `parent_lang` cookie up-front so SSR + the
 * first client render agree on the language (otherwise the `AuthAside`
 * bullets hydrate twice with different strings — Next 16 flags it as a
 * mismatch). The client island owns the form state, password matching, and
 * the POST to `/api/auth/reset-password`.
 */
export default async function ResetPasswordPage() {
  const store = await cookies();
  const lang: Language = store.get('parent_lang')?.value === 'en' ? 'en' : 'fr';
  return <ResetPasswordForm initialLang={lang} />;
}
