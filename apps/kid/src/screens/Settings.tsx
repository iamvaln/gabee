import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { Module } from '@gabee/types';
import { Bee } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { useStore } from '../store';
import { listCachedBundles, refreshIfNewer } from '../lib/bundles';
import { useInstall } from '../lib/install';

// Release version, baked at build time from the git tag (release.yml passes
// VITE_APP_VERSION=${github.ref_name} → Dockerfile ENV → Vite inlines it).
// Falls back to 'dev' for local builds where the var is unset.
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev';

interface BundleRow {
  module: Module;
  version: number | null;
  published_at: string;
  fetched_at: string;
  question_count: number;
}

// Kid Settings — debug panel (product §8). Shows the cached bundle versions
// (which the parent dashboard and the admin publish UI also surface) so the
// operator can diagnose "the kid is on an older version" without leaving the
// device. Also exposes a manual "Refresh" button that re-runs the launch-time
// manifest sweep, and a "Changer de profil" action so a sibling can take over
// without needing the parent to log in again.
export function Settings({
  onHome,
  onBack,
  onSwitchProfile,
}: {
  onHome: () => void;
  onBack: () => void;
  onSwitchProfile: () => void;
}) {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const profile = useStore((s) => s.profile);

  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const install = useInstall();

  async function load() {
    const rows = await listCachedBundles();
    setBundles(rows.sort((a, b) => a.module.localeCompare(b.module)));
  }

  useEffect(() => {
    void load();
    if (typeof navigator !== 'undefined' && navigator.storage?.persisted) {
      void navigator.storage.persisted().then(setPersisted);
    }
    function onOnline() { setOnline(true); }
    function onOffline() { setOnline(false); }
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  async function manualRefresh() {
    setRefreshing(true);
    try {
      await refreshIfNewer();
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="session-screen">
      <Chrome lang={lang} setLang={setLang} title={t('settings.title')} onBack={onBack} onHome={onHome} profile={profile} />
      <div className="session-body">
        <div className="session-stage" style={{ maxWidth: 560, marginInline: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Bee size={56} expression="idle" wings />
            <div>
              <h2 style={{ margin: 0 }}>{t('settings.title')}</h2>
              <div style={{ fontSize: 13, opacity: 0.7 }}>
                {t('settings.loadedVersions')}
              </div>
            </div>
          </div>

          <div
            style={{
              padding: 12, borderRadius: 12, marginBottom: 16,
              background: online ? '#DCFCE7' : '#FEE2E2',
              fontSize: 14, color: '#0f172a',
            }}
          >
            <strong>{t('settings.connection')}</strong>{' '}
            {online ? t('settings.online') : t('settings.offline')}
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
              <strong>{t('settings.persistedStorage')}</strong>{' '}
              {persisted === null ? '…' : persisted ? t('settings.yes') : t('settings.no')}
            </div>
          </div>

          {install.kind !== 'installed' && install.kind !== 'unavailable' && (
            <div
              style={{
                padding: 12, borderRadius: 12, marginBottom: 16,
                background: '#EFF6FF', border: '1px solid #BFDBFE',
                fontSize: 14, color: '#0f172a',
              }}
            >
              <strong>{t('settings.installGabee')}</strong>
              <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4, marginBottom: 10 }}>
                {t('settings.installWhy')}
              </div>
              {install.kind === 'available' ? (
                <button
                  className="btn"
                  onClick={() => void install.prompt()}
                >
                  <Icon name="arrow-right" /> {t('install.now')}
                </button>
              ) : (
                <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                  <Trans i18nKey="install.iosHint" components={{ b: <strong />, s: <span style={{ fontWeight: 700 }} /> }} />
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 14 }}>{t('settings.cachedBundles')}</strong>
            <button className="btn ghost" onClick={() => void manualRefresh()} disabled={refreshing || !online}>
              {refreshing ? t('settings.refreshing') : t('settings.refresh')}
            </button>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {bundles.length === 0 ? (
              <div style={{ padding: 12, borderRadius: 8, background: '#F1F5F9', fontSize: 13, opacity: 0.7 }}>
                {t('settings.noBundles')}
              </div>
            ) : (
              bundles.map((b) => (
                <div
                  key={b.module}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', borderRadius: 8, background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                  }}
                >
                  <div>
                    <strong style={{ textTransform: 'capitalize' }}>{b.module}</strong>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {b.question_count} {t('common.questions')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 13 }}>
                    <div style={{ fontFamily: 'ui-monospace, monospace' }}>
                      {b.version != null ? `v${b.version}` : '—'}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>
                      {b.published_at.slice(0, 10)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div
            style={{
              marginTop: 20, padding: 12, borderRadius: 12,
              background: '#F8FAFC', border: '1px solid #E2E8F0',
              fontSize: 14, color: '#0f172a',
            }}
          >
            <strong style={{ fontSize: 14 }}>{t('settings.about')}</strong>
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('settings.appVersion')}</span>
              <span style={{ fontFamily: 'ui-monospace, monospace' }}>{APP_VERSION}</span>
            </div>
          </div>

          <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn" onClick={onBack}>
              <Icon name="arrow-right" /> {t('back')}
            </button>
            <button className="btn ghost" onClick={onSwitchProfile}>
              {t('settings.switchProfile')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
