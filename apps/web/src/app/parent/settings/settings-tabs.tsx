'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ParentAccountSummary } from '@/lib/server/services/parent-account';
import { ProfileTab } from './profile-tab';
import { PasswordTab } from './password-tab';
import { FamilyTab } from './family-tab';
import { DevicesTab } from './devices-tab';
import { NotificationsTab } from './notifications-tab';
import { AccountTab } from './account-tab';

export type SettingsLang = 'fr' | 'en';
export type SettingsAccount = ParentAccountSummary;

type SectionId =
  | 'profile'
  | 'password'
  | 'family'
  | 'devices'
  | 'notifications'
  | 'account';

const SECTION_IDS = ['profile', 'password', 'family', 'devices', 'notifications', 'account'] as const;
function isSectionId(v: string | null): v is SectionId {
  return v != null && (SECTION_IDS as readonly string[]).includes(v);
}

const SECTIONS: {
  id: SectionId;
  icon: IconName;
  label: { fr: string; en: string };
}[] = [
  { id: 'profile', icon: 'user', label: { fr: 'Profil', en: 'Profile' } },
  { id: 'password', icon: 'lock', label: { fr: 'Mot de passe', en: 'Password' } },
  { id: 'family', icon: 'users', label: { fr: 'Famille', en: 'Family' } },
  { id: 'devices', icon: 'device', label: { fr: 'Appareils', en: 'Devices' } },
  {
    id: 'notifications',
    icon: 'bell',
    label: { fr: 'Notifications', en: 'Notifications' },
  },
  { id: 'account', icon: 'shield', label: { fr: 'Compte', en: 'Account' } },
];

// Settings shell — mirrors the `Settings` component in
// docs/.../parent-settings.jsx verbatim:
//   .page.page-wide > .page-head + .settings-layout(.settings-rail + .settings-content)
// with each rail button rendered as `.sr-link` (`.on` when active).
export function SettingsTabs({
  lang,
  initialAccount,
}: {
  lang: SettingsLang;
  initialAccount: SettingsAccount;
}) {
  const search = useSearchParams();
  // Deep-link support: `/parent/settings?tab=devices` lands directly on Devices.
  const tabFromUrl = search.get('tab');
  const initialSection: SectionId = isSectionId(tabFromUrl) ? tabFromUrl : 'profile';
  const [section, setSection] = useState<SectionId>(initialSection);
  // Keep the tab in sync if the URL changes while the user is on the page
  // (e.g. they click another deep link).
  useEffect(() => {
    if (isSectionId(tabFromUrl) && tabFromUrl !== section) setSection(tabFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabFromUrl]);
  const [account, setAccount] = useState<SettingsAccount>(initialAccount);

  return (
    <div className="page page-wide">
      <div className="page-head">
        <h1>{lang === 'fr' ? 'Réglages' : 'Settings'}</h1>
      </div>
      <div className="settings-layout">
        <nav
          className="settings-rail"
          aria-label={lang === 'fr' ? 'Sections' : 'Sections'}
        >
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={'sr-link' + (section === s.id ? ' on' : '')}
              onClick={() => setSection(s.id)}
              aria-current={section === s.id ? 'page' : undefined}
            >
              <PIcon name={s.icon} size={18} />
              <span>{s.label[lang]}</span>
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {section === 'profile' && (
            <ProfileTab
              lang={lang}
              account={account}
              onAccountChange={setAccount}
            />
          )}
          {section === 'password' && <PasswordTab lang={lang} />}
          {section === 'family' && <FamilyTab lang={lang} />}
          {section === 'devices' && <DevicesTab lang={lang} account={account} />}
          {section === 'notifications' && <NotificationsTab lang={lang} />}
          {section === 'account' && (
            <AccountTab lang={lang} account={account} />
          )}
        </div>
      </div>
    </div>
  );
}

// Local lightweight icon set — the handoff JSX uses a `<PIcon>` helper, which
// is provided in `parent-shell.jsx` (not part of this app). Inlining a tiny
// subset here keeps imports/deps unchanged and avoids touching Agent A's
// parent-shell. Stroke-based, currentColor — picks up `.sr-link svg` color.
type IconName = 'user' | 'lock' | 'users' | 'device' | 'bell' | 'shield';

function PIcon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'user':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...common}>
          <rect x="4" y="10" width="16" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case 'users':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2 21c0-3.5 3-5.5 7-5.5s7 2 7 5.5" />
          <circle cx="17" cy="9" r="2.8" />
          <path d="M16 14.5c3 .2 6 1.8 6 5" />
        </svg>
      );
    case 'device':
      return (
        <svg {...common}>
          <rect x="6" y="3" width="12" height="18" rx="2.5" />
          <path d="M11 18h2" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...common}>
          <path d="M6 17h12l-1.5-2.2V11a4.5 4.5 0 0 0-9 0v3.8L6 17z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 3l8 3v6c0 4.5-3.5 7.5-8 9-4.5-1.5-8-4.5-8-9V6l8-3z" />
        </svg>
      );
  }
}
