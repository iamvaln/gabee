import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Language } from '@gabee/types';
import { requireParentPage } from '@/lib/server/auth';
import {
  getKidSummary,
  listKidSessions,
  aggregatesByModule,
  listKidFeedback,
} from '@/lib/server/services/parent-kid-detail';
import { KidDetailTabs } from './kid-detail-tabs';

export const dynamic = 'force-dynamic';

// K2 — Kid detail (parent spec §7.3). Header + tab content. We fetch everything
// the tabs might want server-side and hand it to a client component that owns
// the tab state — at narrow widths the tabs become horizontally scrollable
// (handled in CSS).
export default async function KidDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireParentPage();
  const { id } = await params;
  const { tab } = await searchParams;

  let kid;
  try {
    kid = await getKidSummary(session.parentId, id);
  } catch {
    notFound();
  }

  const [sessions, modules, feedback] = await Promise.all([
    listKidSessions(session.parentId, id, 200),
    aggregatesByModule(session.parentId, id),
    listKidFeedback(session.parentId, id),
  ]);

  const lang: Language =
    (await cookies()).get('parent_lang')?.value === 'en' ? 'en' : 'fr';

  // ── Overview metrics ──────────────────────────────────────────────────────
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekSessions = sessions.filter((s) => new Date(s.started_at).getTime() >= weekAgo);
  const weekMinutes = weekSessions.reduce((acc, s) => acc + (s.duration_min ?? 0), 0);
  const classifiedCount = sessions.filter((s) => s.label != null).length;
  const adherence = classifiedCount
    ? sessions.filter((s) => s.label === 'child_initiated').length / classifiedCount
    : 0;
  // "Healthy" if no week session exceeds 30 minutes (rough heuristic per spec §6).
  const healthy = weekSessions.every((s) => (s.duration_min ?? 0) <= 30);

  return (
    <div className="page page-wide">
      <Link
        href="/parent/kids"
        className="btn ghost sm"
        style={{ marginBottom: 14, marginLeft: -10, textDecoration: 'none' }}
      >
        <span aria-hidden>‹</span>
        {lang === 'fr' ? 'Vos enfants' : 'Your kids'}
      </Link>

      <div className="kid-hero">
        <KidAvatar avatar={kid.avatar} size={72} />
        <div>
          <div className="kh-name">{kid.name}</div>
          <div className="kh-meta">
            {kid.language.toUpperCase()} ·{' '}
            {kid.last_active_at
              ? `${lang === 'fr' ? 'Actif' : 'Active'} ${formatRelative(kid.last_active_at, lang)}`
              : lang === 'fr'
                ? 'Pas encore actif'
                : 'Not yet active'}
          </div>
          <div className="kh-chips">
            {Object.entries(kid.levels).length === 0 ? (
              <span style={{ color: 'var(--text-3)', fontWeight: 700, fontSize: 13 }}>
                {lang === 'fr' ? 'Aucun niveau atteint' : 'No levels reached yet'}
              </span>
            ) : (
              Object.entries(kid.levels).map(([m, lv]) => (
                <span
                  key={m}
                  className="mod-chip"
                  style={{ background: MOD_COLOR[m] ?? 'var(--text-2)' }}
                >
                  {MOD_LABEL[m]?.[lang] ?? m} {lang === 'fr' ? `N${lv}` : `L${lv}`}
                </span>
              ))
            )}
          </div>
        </div>
        <div className="kh-actions">
          <Link
            href={`/parent/messages/new?to=${encodeURIComponent(kid.id)}`}
            className="btn mint sm"
            style={{ textDecoration: 'none' }}
          >
            <span aria-hidden>✉</span>
            {lang === 'fr' ? 'Laisser un message' : 'Leave a message'}
          </Link>
          <Link
            href={`/parent/kids/${kid.id}/edit`}
            className="btn secondary sm"
            style={{ textDecoration: 'none' }}
          >
            <span aria-hidden>✎</span>
            {lang === 'fr' ? 'Modifier' : 'Edit'}
          </Link>
        </div>
      </div>

      <KidDetailTabs
        lang={lang}
        defaultTab={isTab(tab) ? tab : 'overview'}
        overview={{
          weekMinutes,
          weekSessions: weekSessions.length,
          adherence,
          healthy,
          totalSessions: sessions.length,
        }}
        sessions={sessions}
        modules={modules}
        feedback={feedback}
        kidName={kid.name}
      />
    </div>
  );
}

type TabId = 'overview' | 'activity' | 'performance' | 'feedback';
function isTab(v: string | undefined): v is TabId {
  return v === 'overview' || v === 'activity' || v === 'performance' || v === 'feedback';
}

// ─── Tokens ──────────────────────────────────────────────────────────────────

const MOD_COLOR: Record<string, string> = {
  numbers: '#1F6FEB',
  words: '#D6336C',
  keyboard: '#C99A0E',
  code: '#7B2FF7',
  translation: '#C75D28',
};
const MOD_LABEL: Record<string, { fr: string; en: string }> = {
  numbers: { fr: 'Nombres', en: 'Numbers' },
  words: { fr: 'Mots', en: 'Words' },
  keyboard: { fr: 'Clavier', en: 'Keyboard' },
  code: { fr: 'Code', en: 'Code' },
  translation: { fr: 'Traduction', en: 'Translate' },
};

function KidAvatar({ avatar, size }: { avatar: string; size: number }) {
  const color =
    avatar === 'avatar_2'
      ? 'var(--module-words)'
      : avatar === 'avatar_3'
        ? 'var(--module-keyboard)'
        : avatar === 'avatar_4'
          ? 'var(--coral)'
          : 'var(--mint)';
  return (
    <span
      className="kid-av"
      aria-hidden
      style={{ width: size, height: size, background: color, display: 'inline-block' }}
    />
  );
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
