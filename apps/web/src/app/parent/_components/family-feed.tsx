import Link from 'next/link';
import type { FamilyActivityRow, Language } from '@gabee/types';

/**
 * K1 — Recent family activity feed (parent spec §7.1).
 *
 * Pure renderer over `FamilyActivityRow[]`. The page-level Server Component
 * fetches with `listFamilyActivity` and passes the rows in. Uses the design's
 * `.feed` / `.feed-item` / `.feed-ic.is-parent` / `.feed-body` / `.feed-text` /
 * `.feed-time` classes. Bilingual via `lang`.
 *
 * Action → sentence is centralised in `actionSentence` below so the kids page
 * stays declarative.
 */
export function FamilyFeed({
  activity,
  lang,
  emptyText,
}: {
  activity: FamilyActivityRow[];
  lang: Language;
  emptyText: string;
}) {
  if (activity.length === 0) {
    return (
      <p style={{ margin: 0, color: 'var(--text-2)', fontWeight: 700 }}>{emptyText}</p>
    );
  }
  return (
    <div className="feed">
      {activity.map((row) => (
        <FeedRow key={row.id} row={row} lang={lang} />
      ))}
    </div>
  );
}

function FeedRow({ row, lang }: { row: FamilyActivityRow; lang: Language }) {
  const href = `/parent/kids/${row.child_id}`;
  return (
    <Link
      href={href}
      className="feed-item"
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <span className="feed-ic is-parent" aria-hidden>
        {iconFor(row.action)}
      </span>
      <div className="feed-body">
        <div className="feed-text">
          <b>{row.actor_is_self ? selfLabel(lang) : row.actor_display_name}</b>{' '}
          {actionSentence(row, lang)}
        </div>
        <div className="feed-time">{formatRelative(row.created_at, lang)}</div>
      </div>
    </Link>
  );
}

function selfLabel(lang: Language): string {
  return lang === 'fr' ? 'Vous' : 'You';
}

// Glyph per action — kept ASCII so it works regardless of font fallback.
function iconFor(action: FamilyActivityRow['action']): string {
  switch (action) {
    case 'session_classified':
      return '✓';
    case 'feedback_left':
    case 'feedback_edited':
      return '★';
    case 'kid_added':
      return '+';
    case 'kid_edited':
      return '✎';
    case 'kid_removed':
      return '−';
    case 'device_paired':
      return '◐';
    case 'device_revoked':
      return '◯';
    case 'coparent_invited':
    case 'coparent_joined':
      return '☺';
    case 'coparent_removed':
      return '⊘';
    case 'message_sent':
      return '✉';
    case 'message_deleted':
      return '⌫';
  }
}

/**
 * Human sentence for the action — what comes AFTER "<actor> ". Bilingual.
 * Conjugation uses formal "vous" / "you" form when the actor is the requester
 * ("Vous avez classé…" / "You classified…") and 3rd person otherwise ("Alex a
 * classé…"). The rest of the parent app uses "vous/votre" so we stay coherent
 * — using "tu" here would jar.
 */
function actionSentence(row: FamilyActivityRow, lang: Language): string {
  const child = row.child_name;
  const self = row.actor_is_self;
  const fr = lang === 'fr';

  // verb forms
  const v = (selfFr: string, otherFr: string, selfEn: string, otherEn: string) =>
    fr ? (self ? selfFr : otherFr) : self ? selfEn : otherEn;

  switch (row.action) {
    case 'session_classified': {
      const n = typeof row.payload.count === 'number' ? row.payload.count : 1;
      const ses = fr
        ? `${n} session${n > 1 ? 's' : ''}`
        : `${n} session${n > 1 ? 's' : ''}`;
      return v(
        `avez revu ${ses} de ${child}`,
        `a revu ${ses} de ${child}`,
        `reviewed ${ses} for ${child}`,
        `reviewed ${ses} for ${child}`,
      );
    }
    case 'feedback_left':
      return v(
        `avez laissé un retour pour ${child}`,
        `a laissé un retour pour ${child}`,
        `left feedback for ${child}`,
        `left feedback for ${child}`,
      );
    case 'feedback_edited':
      return v(
        `avez modifié un retour pour ${child}`,
        `a modifié un retour pour ${child}`,
        `edited feedback for ${child}`,
        `edited feedback for ${child}`,
      );
    case 'kid_added':
      return v(`avez ajouté ${child}`, `a ajouté ${child}`, `added ${child}`, `added ${child}`);
    case 'kid_edited':
      return v(
        `avez mis à jour le profil de ${child}`,
        `a mis à jour le profil de ${child}`,
        `updated ${child}'s profile`,
        `updated ${child}'s profile`,
      );
    case 'kid_removed':
      return v(
        `avez supprimé le profil de ${child}`,
        `a supprimé le profil de ${child}`,
        `removed ${child}'s profile`,
        `removed ${child}'s profile`,
      );
    case 'device_paired':
      return v(
        `avez connecté un appareil pour ${child}`,
        `a connecté un appareil pour ${child}`,
        `paired a device for ${child}`,
        `paired a device for ${child}`,
      );
    case 'device_revoked':
      return v(
        `avez révoqué un appareil pour ${child}`,
        `a révoqué un appareil pour ${child}`,
        `revoked a device for ${child}`,
        `revoked a device for ${child}`,
      );
    case 'coparent_invited':
      return v(
        `avez invité un co-parent pour ${child}`,
        `a invité un co-parent pour ${child}`,
        `invited a co-parent for ${child}`,
        `invited a co-parent for ${child}`,
      );
    case 'coparent_joined':
      return v(
        `avez rejoint la famille comme co-parent de ${child}`,
        `a rejoint la famille comme co-parent de ${child}`,
        `joined the family as a co-parent of ${child}`,
        `joined the family as a co-parent of ${child}`,
      );
    case 'coparent_removed':
      return v(
        `avez retiré un co-parent pour ${child}`,
        `a retiré un co-parent pour ${child}`,
        `removed a co-parent for ${child}`,
        `removed a co-parent for ${child}`,
      );
    case 'message_sent':
      return v(
        `avez envoyé un message à ${child}`,
        `a envoyé un message à ${child}`,
        `sent a message to ${child}`,
        `sent a message to ${child}`,
      );
    case 'message_deleted':
      return v(
        `avez supprimé un message pour ${child}`,
        `a supprimé un message pour ${child}`,
        `deleted a message for ${child}`,
        `deleted a message for ${child}`,
      );
  }
}

function formatRelative(iso: string, lang: Language): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return lang === 'fr' ? "à l'instant" : 'just now';
  if (min < 60) return lang === 'fr' ? `il y a ${min} min` : `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return lang === 'fr' ? `il y a ${hr} h` : `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return lang === 'fr' ? `il y a ${day} j` : `${day}d ago`;
  return new Date(iso).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US');
}
