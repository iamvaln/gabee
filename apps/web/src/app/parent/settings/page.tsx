import { cookies } from 'next/headers';
import { requireParentPage } from '@/lib/server/auth';
import { getAccountSummary } from '@/lib/server/services/parent-account';
import { SettingsTabs, type SettingsLang } from './settings-tabs';

export const dynamic = 'force-dynamic';

// Parent Settings (parent spec §10) — six sections wired to the canonical
// `parent-settings.jsx` design: Profile · Password · Family · Devices ·
// Notifications · Account (sign out + destructive delete). Server wrap reads
// the bilingual cookie, fetches the account summary, and hands off to the
// client tab shell. Phase 1: only Profile + Password + Account/delete actually
// mutate; Family, Devices, Notifications are placeholders.
export default async function ParentSettingsPage() {
  const session = await requireParentPage();
  const account = await getAccountSummary(session.parentId);
  const lang: SettingsLang =
    (await cookies()).get('parent_lang')?.value === 'en' ? 'en' : 'fr';

  return <SettingsTabs lang={lang} initialAccount={account} />;
}
