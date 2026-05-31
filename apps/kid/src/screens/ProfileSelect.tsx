import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ChildProfile } from '@gabee/types';
import { Bee } from '../components/Bee';
import { ProfileAvatar } from '../components/Chrome';
import { api } from '../lib/api';

export function ProfileSelect({ onPick }: { onPick: (profile: ChildProfile) => void }) {
  const { t } = useTranslation();
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
    </div>
  );
}
