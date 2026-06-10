import { useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import type { ChildProfile } from '@gabee/types';
import { Bee } from '../components/Bee';
import { ProfileAvatar } from '../components/Chrome';
import { api } from '../lib/api';
import { useInstall } from '../lib/install';

export function ProfileSelect({ onPick }: { onPick: (profile: ChildProfile) => void }) {
  const { t } = useTranslation();
  const install = useInstall();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['profiles'],
    queryFn: () => api.getProfiles(),
  });

  return (
    <div className="profile-screen">
      <Bee size={120} expression="idle" wings bob />
      <h1>{t('pickProfile')}</h1>
      {isLoading && <div className="skeleton" style={{ width: 220, height: 48 }} />}
      {isError && <p style={{ color: 'var(--feedback-retry)', fontWeight: 700 }}>{t('loginFailed')}</p>}
      {data && data.profiles.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{t('noProfiles')}</p>
      )}
      <div className="profile-grid">
        {data?.profiles.map((p) => (
          <button key={p.id} className="profile-card" onClick={() => onPick(p)}>
            <div className="profile-avatar">
              <ProfileAvatar profile={p} size={120} />
            </div>
            <span className="name">{p.name}</span>
          </button>
        ))}
      </div>

      {/* PWA install — surfaced here so the parent sees it the moment device
          pairing completes (the kid app's first screen post-pair is this
          picker). Settings keeps the same card as a fallback. Hidden once
          the app is running in standalone mode or on a browser without
          installability support. */}
      {install.kind !== 'installed' && install.kind !== 'unavailable' && (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            borderRadius: 14,
            background: '#EFF6FF',
            border: '1px solid #BFDBFE',
            maxWidth: 520,
            textAlign: 'left',
          }}
        >
          <strong style={{ fontSize: 15, color: '#0f172a' }}>
            {t('install.onThisDevice')}
          </strong>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4, marginBottom: 12, color: '#0f172a' }}>
            {t('install.why')}
          </div>
          {install.kind === 'available' ? (
            <button className="btn mint" onClick={() => void install.prompt()}>
              {t('install.now')}
            </button>
          ) : (
            <div style={{ fontSize: 13, lineHeight: 1.6, color: '#0f172a' }}>
              <Trans i18nKey="install.iosHint" components={{ b: <strong />, s: <span style={{ fontWeight: 700 }} /> }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
