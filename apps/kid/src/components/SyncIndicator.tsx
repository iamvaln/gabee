import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { sync, type SyncStatus } from '../lib/sync';

/**
 * Subtle, non-alarming sync status (product §8, UX §4.6, §3.1 Offline). Sits in the app
 * frame, never blocks play:
 *  - offline → persistent calm pill "everything is saved"
 *  - syncing → quiet "saving…" (only while actually pushing)
 *  - synced  → brief confirmation, then fades out
 *  - online  → nothing (no chrome, no nagging)
 */
export function SyncIndicator() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SyncStatus>(sync.getStatus());

  useEffect(() => sync.subscribe(setStatus), []);

  if (status === 'online') return null;

  const variant =
    status === 'offline' ? 'offline' : status === 'synced' ? 'synced' : 'syncing';
  const label =
    status === 'offline' ? t('offline') : status === 'synced' ? t('synced') : t('syncing');
  const icon = status === 'offline' ? 'wifi-off' : status === 'synced' ? 'check' : 'refresh';

  return (
    <div className={`sync-pill sync-${variant}`} role="status" aria-live="polite">
      <Icon name={icon} size={16} />
      <span>{label}</span>
    </div>
  );
}
