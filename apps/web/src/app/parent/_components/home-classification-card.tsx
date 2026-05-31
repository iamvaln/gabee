import Link from 'next/link';
import { MintBee } from './mint-bee';

// H1 §5.1 — classification card. Three states (offline, N = 0 calm, N > 0 coral
// with optional pulse at N ≥ 5). All visuals come from parent.css — see
// .classify-card, .cc-eyebrow, .cc-title, .cc-sub, .cc-actions, .cc-bee, .cc-pulse.
// Mirrors docs/UpdatesParentsAdmin:Landing/handoff-unzipped/gabee/project/parent-home.jsx.
export function HomeClassificationCard({
  lang,
  n,
  offline,
}: {
  lang: 'fr' | 'en';
  n: number;
  offline: boolean;
}) {
  const isFr = lang === 'fr';

  // ── Offline ────────────────────────────────────────────────────────────────
  if (offline) {
    return (
      <div className="classify-card offline">
        <p className="cc-eyebrow">{isFr ? 'Hors-ligne' : 'Offline'}</p>
        <h2 className="cc-title">
          {isFr
            ? `Synchronisation impossible. ${n} sessions vues à classer.`
            : `Can't sync right now. Last seen ${n} sessions to classify.`}
        </h2>
        <p className="cc-sub">
          {isFr ? 'Réessayez dans un instant.' : 'Try again in a moment.'}
        </p>
        <div className="cc-actions">
          <button className="btn coral" disabled type="button">
            {isFr ? 'Classer maintenant' : 'Classify now'}
          </button>
        </div>
      </div>
    );
  }

  // ── Nothing pending — calm/mint state ──────────────────────────────────────
  if (n === 0) {
    return (
      <div className="classify-card calm">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
          <MintBee size={64} expression="encourage" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="cc-eyebrow">
              {isFr ? 'Tout est à jour' : "You're all caught up"}
            </p>
            <h2 className="cc-title" style={{ fontSize: 24 }}>
              {isFr ? 'Aucune session à classer.' : 'No sessions to classify.'}
            </h2>
            <p className="cc-sub" style={{ margin: '8px 0 16px', color: 'var(--text-2)' }}>
              {isFr
                ? 'On t’écrira dès qu’il y aura du nouveau.'
                : 'We’ll email you when there’s something new.'}
            </p>
            <span className="badge neutral" style={{ marginBottom: 16 }}>
              {isFr ? 'Synchro à l’instant' : 'Just synced'}
            </span>
            <div className="cc-actions" style={{ flexWrap: 'wrap' }}>
              <Link href="/parent/settings?tab=devices" className="btn secondary">
                {isFr ? 'Vérifier l’appareil' : 'Check device'}
              </Link>
              <Link href="/parent/settings?tab=devices" className="btn link">
                {isFr ? 'Comment la synchro marche ?' : 'How sync works'}
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Pending sessions — coral, pulses when ≥ 5 ──────────────────────────────
  return (
    <div className={'classify-card' + (n >= 5 ? ' cc-pulse' : '')}>
      <p className="cc-eyebrow">{isFr ? 'À classer' : 'Needs you'}</p>
      <h2 className="cc-title">
        {isFr ? `${n} sessions ont besoin de toi` : `${n} sessions need your input`}
      </h2>
      <p className="cc-sub">
        {isFr
          ? 'Dis-nous si ton enfant a demandé Gabee ou si tu l’as proposé.'
          : 'Tell us if your kid asked for Gabee or if you suggested it.'}
      </p>
      <div className="cc-actions">
        <Link href="/parent/classify" className="btn coral lg">
          {isFr ? 'Classer maintenant' : 'Classify now'}
        </Link>
      </div>
      <div className="cc-bee">
        <MintBee size={92} expression="focus" />
      </div>
    </div>
  );
}
