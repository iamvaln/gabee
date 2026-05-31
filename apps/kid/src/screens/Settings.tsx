import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Module } from '@gabee/types';
import { Bee } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { useStore } from '../store';
import { listCachedBundles, refreshIfNewer } from '../lib/bundles';

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
// manifest sweep.
export function Settings({ onHome, onBack }: { onHome: () => void; onBack: () => void }) {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const profile = useStore((s) => s.profile);
  const L = lang === 'fr';

  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

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
      <Chrome lang={lang} setLang={setLang} title={L ? 'Paramètres' : 'Settings'} onBack={onBack} onHome={onHome} profile={profile} />
      <div className="session-body">
        <div className="session-stage" style={{ maxWidth: 560, marginInline: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Bee size={56} expression="idle" wings />
            <div>
              <h2 style={{ margin: 0 }}>{L ? 'Paramètres' : 'Settings'}</h2>
              <div style={{ fontSize: 13, opacity: 0.7 }}>
                {L ? 'Versions des contenus chargés' : 'Loaded content versions'}
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
            <strong>{L ? 'Connexion :' : 'Connection:'}</strong>{' '}
            {online ? (L ? 'en ligne' : 'online') : (L ? 'hors ligne' : 'offline')}
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
              <strong>{L ? 'Stockage persistant :' : 'Persisted storage:'}</strong>{' '}
              {persisted === null ? '…' : persisted ? (L ? 'oui' : 'yes') : (L ? 'non' : 'no')}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 14 }}>{L ? 'Contenus en cache' : 'Cached bundles'}</strong>
            <button className="btn ghost" onClick={() => void manualRefresh()} disabled={refreshing || !online}>
              {refreshing ? (L ? 'Mise à jour…' : 'Refreshing…') : (L ? 'Rafraîchir' : 'Refresh')}
            </button>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {bundles.length === 0 ? (
              <div style={{ padding: 12, borderRadius: 8, background: '#F1F5F9', fontSize: 13, opacity: 0.7 }}>
                {L ? 'Aucun contenu encore en cache.' : 'No bundles cached yet.'}
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
                      {b.question_count} {L ? 'questions' : 'questions'}
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

          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center' }}>
            <button className="btn" onClick={onBack}>
              <Icon name="arrow-right" /> {t('back')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
