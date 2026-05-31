import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { PageHead } from '../_shell/primitives';
import { LangToggle } from './LangToggle';

export const dynamic = 'force-dynamic';

// Account settings: current admin email + role, an FR/EN UI-language preference, and a
// minimal profile section (admin spec §13 i18n). Language drives the `admin_lang` cookie.
export default async function SettingsPage() {
  const session = await requireAdminPage();
  const lang: Language = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const L = lang === 'fr';
  const initials = session.email.slice(0, 2).toUpperCase();
  const roleLabel = session.role === 'super_admin' ? 'Super admin' : 'Admin';

  return (
    <div className="page">
      <PageHead
        title={L ? 'Réglages' : 'Settings'}
        sub={L ? 'Profil, compte et langue.' : 'Profile, account and language.'}
      />
      <div className="card" style={{ maxWidth: 620 }}>
        <div className="card-head">
          <h3>{L ? 'Profil' : 'Profile'}</h3>
        </div>
        <div className="card-pad col gap16">
          <div className="row gap16">
            <span className="avatar" style={{ width: 52, height: 52, fontSize: 18 }}>
              {initials}
            </span>
            <div className="col">
              <span style={{ fontWeight: 800, fontSize: 16 }}>{session.email}</span>
              <span className="hint">
                {L ? 'Rôle' : 'Role'} ·{' '}
                <span className="badge role" style={{ padding: '1px 7px' }}>
                  {roleLabel}
                </span>
              </span>
            </div>
          </div>

          <div>
            <div className="field-label">{L ? 'Adresse email' : 'Email address'}</div>
            <input className="inp" value={session.email} readOnly style={{ maxWidth: 320 }} />
            <p className="help">
              {L
                ? 'L’email du compte ne se change pas ici en MVP.'
                : 'Account email is not editable here in the MVP.'}
            </p>
          </div>

          <div>
            <div className="field-label">{L ? 'Langue de l’interface' : 'Interface language'}</div>
            <LangToggle lang={lang} />
            <p className="help">
              {L
                ? 'L’authoring de contenu reste bilingue FR + EN quel que soit ce choix.'
                : 'Content authoring stays bilingual FR + EN regardless of this choice.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
