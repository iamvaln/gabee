import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { ForgotPasswordForm } from './forgot-password-form';

/**
 * /parent/forgot-password — request a password reset link by email.
 *
 * Server component: reads the `parent_lang` cookie on the server so SSR + the
 * first client render agree on the language. Hands off to the client island
 * which owns the form state, submit handler, and language toggle.
 *
 * UX is unchanged from the original single-file version: same 2-column shell
 * (coral `<AuthAside>` left, form right), same `/api/auth/forgot-password`
 * POST that always 200s to prevent email enumeration.
 */
export default async function ForgotPasswordPage() {
  const store = await cookies();
  const lang: Language = store.get('parent_lang')?.value === 'en' ? 'en' : 'fr';
  return <ForgotPasswordForm initialLang={lang} />;
}
