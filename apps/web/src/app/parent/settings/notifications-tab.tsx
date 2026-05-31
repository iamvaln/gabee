'use client';

import { useEffect, useState } from 'react';
import type {
  NotificationDigestCadence,
  NotificationPrefs,
  UpdateNotificationPrefsRequest,
} from '@gabee/types';
import type { SettingsLang } from './settings-tabs';

/**
 * Notifications settings (parent spec §10.5 + §4.3).
 *
 * Persists to `/api/account/notifications` (GET on mount → PATCH on each
 * change). State is optimistic — we update locally before the PATCH resolves
 * and revert on failure. A `.banner.mint` "Saved" toast appears briefly after
 * each successful write.
 *
 * Always-on rows (Security, Co-parent invites) are rendered locked per §4.3.
 */

const CADENCES: { id: NotificationDigestCadence; label: { fr: string; en: string } }[] = [
  { id: 'daily', label: { fr: 'Tous les jours', en: 'Daily' } },
  { id: 'every_2_days', label: { fr: 'Tous les 2 jours', en: 'Every 2 days' } },
  { id: 'weekly', label: { fr: 'Hebdomadaire', en: 'Weekly' } },
  { id: 'off', label: { fr: 'Désactivé', en: 'Off' } },
];

export function NotificationsTab({ lang }: { lang: SettingsLang }) {
  const L = lang === 'fr';
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/account/notifications', { credentials: 'include' });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as NotificationPrefs;
        if (alive) setPrefs(data);
      } catch {
        if (alive)
          setLoadError(
            L
              ? 'Impossible de charger vos préférences.'
              : "Couldn't load your preferences.",
          );
      }
    })();
    return () => {
      alive = false;
    };
  }, [L]);

  // ── Auto-dismiss the saved toast ─────────────────────────────────────────
  useEffect(() => {
    if (savedAt == null) return;
    const t = setTimeout(() => setSavedAt(null), 1800);
    return () => clearTimeout(t);
  }, [savedAt]);

  // Apply an optimistic local patch + PATCH the server. Revert on failure.
  async function applyPatch(patch: UpdateNotificationPrefsRequest) {
    if (!prefs) return;
    const previous = prefs;
    const next: NotificationPrefs = { ...prefs, ...patch };
    setPrefs(next);
    setSaving(true);
    try {
      const res = await fetch('/api/account/notifications', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as NotificationPrefs;
      setPrefs(data);
      setSavedAt(Date.now());
    } catch {
      setPrefs(previous);
      setLoadError(
        L ? "Échec de l'enregistrement, réessayez." : 'Save failed, please retry.',
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (!prefs && loadError) {
    return (
      <div className="card">
        <div className="card-pad">
          <span className="badge warn">{loadError}</span>
        </div>
      </div>
    );
  }
  if (!prefs) {
    return (
      <div className="card">
        <div className="card-pad" style={{ color: 'var(--text-3)', fontWeight: 700 }}>
          {L ? 'Chargement…' : 'Loading…'}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>{L ? 'Notifications' : 'Notifications'}</h3>
        <span className="ch-sub" style={{ marginLeft: 'auto' }}>
          {L ? 'Tout passe par email' : 'All via email'}
        </span>
      </div>

      {/* Classification digest cadence — segmented control (.seg) */}
      <div className="set-row" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="sr-main">
          <div className="sr-label">{L ? 'Rappel de revue' : 'Review digest'}</div>
          <div className="sr-sub">
            {L
              ? 'Quand des sessions attendent votre avis'
              : 'When sessions await your verdict'}
          </div>
        </div>
        <div className="sr-action seg" style={{ flexWrap: 'wrap' }} role="radiogroup">
          {CADENCES.map((c) => (
            <button
              type="button"
              role="radio"
              aria-checked={prefs.classification_digest === c.id}
              key={c.id}
              className={prefs.classification_digest === c.id ? 'on' : ''}
              onClick={() => applyPatch({ classification_digest: c.id })}
              disabled={saving}
            >
              {c.label[lang]}
            </button>
          ))}
        </div>
        {prefs.classification_digest === 'off' && (
          <div style={{ flexBasis: '100%' }}>
            <span className="badge warn">
              {L
                ? "Sans rappel, l'accueil aura moins à vous montrer."
                : 'Without it, the home shows less.'}
            </span>
          </div>
        )}
      </div>

      <Row
        label={L ? 'Résumé hebdomadaire' : 'Weekly summary'}
        sub={L ? 'Un récap chaque dimanche soir' : 'A recap every Sunday evening'}
        on={prefs.weekly_summary}
        onToggle={() => applyPatch({ weekly_summary: !prefs.weekly_summary })}
        disabled={saving}
      />
      <Row
        label={L ? 'Réponse à un retour' : 'Feedback response'}
        sub={
          L ? "Quand l'équipe répond à un commentaire" : 'When the team replies to a comment'
        }
        on={prefs.feedback_response}
        onToggle={() => applyPatch({ feedback_response: !prefs.feedback_response })}
        disabled={saving}
      />
      <Row
        label={L ? 'Sécurité du compte' : 'Account & security'}
        sub={L ? 'Toujours activé' : 'Always on'}
        on
        locked
      />
      <Row
        label={L ? 'Invitations de co-parent' : 'Co-parent invites'}
        sub={L ? 'Toujours activé' : 'Always on'}
        on
        locked
      />

      {/* Saved toast — .banner.mint per spec, auto-dismisses after 1.8s. */}
      {savedAt && (
        <div
          className="banner mint"
          style={{ alignItems: 'center', marginTop: 12 }}
          role="status"
        >
          <span style={{ fontWeight: 800, fontSize: 13.5 }}>
            {L ? 'Enregistré' : 'Saved'}
          </span>
        </div>
      )}
      {loadError && prefs && (
        <div className="banner warn" style={{ alignItems: 'center', marginTop: 12 }}>
          <span style={{ fontWeight: 800, fontSize: 13.5 }}>{loadError}</span>
          <button
            type="button"
            className="b-close"
            onClick={() => setLoadError(null)}
            aria-label={L ? 'Fermer' : 'Dismiss'}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

// Each row mirrors the `Row` helper in `NotificationsSettings` (handoff
// parent-settings.jsx): .set-row > .sr-main(.sr-label + .sr-sub) + .toggle.
function Row({
  label,
  sub,
  on,
  locked,
  disabled,
  onToggle,
}: {
  label: string;
  sub: string;
  on: boolean;
  locked?: boolean;
  disabled?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="set-row">
      <div className="sr-main">
        <div className="sr-label">{label}</div>
        <div className="sr-sub">{sub}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={'toggle' + (on ? ' on' : '')}
        disabled={locked || disabled}
        onClick={onToggle}
      />
    </div>
  );
}
