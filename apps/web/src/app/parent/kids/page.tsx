import Link from 'next/link';
import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { requireParentPage } from '@/lib/server/auth';
import {
  listKidSummaries,
  type KidSummary,
} from '@/lib/server/services/parent-kid-detail';
import { listFamilyActivity } from '@/lib/server/services/family-activity';
import { MintBee } from '../_components/mint-bee';
import { FamilyFeed } from '../_components/family-feed';
import { AddKidModalLauncher } from './add-kid-modal';

export const dynamic = 'force-dynamic';

// K1 — Kids list (parent spec §7.1). Shows kid cards, a "+ Add" CTA (gated at
// 3), and the recent family activity feed. The add modal is a client component
// triggered from the header button (and the per-card "+" tile when count < 3).
export default async function KidsListPage() {
  const session = await requireParentPage();

  const [kids, activityResponse] = await Promise.all([
    listKidSummaries(session.parentId),
    listFamilyActivity({ requesterParentId: session.parentId, limit: 15 }),
  ]);
  const activity = activityResponse.activity;

  const lang: Language =
    (await cookies()).get('parent_lang')?.value === 'en' ? 'en' : 'fr';

  const atLimit = kids.length >= 3;

  // ── Empty state (no kids yet) ─────────────────────────────────────────────
  if (kids.length === 0) {
    return (
      <div className="page">
        <div className="page-head">
          <h1>{C.yourKids[lang]}</h1>
        </div>
        <div className="empty">
          <div className="e-bee">
            <MintBee size={104} expression="idle" />
          </div>
          <h3>{lang === 'fr' ? "Aucun enfant pour l'instant" : 'No kids yet'}</h3>
          <p>
            {lang === 'fr'
              ? 'Ajoutez votre premier enfant pour suivre ses progrès.'
              : 'Add your first kid to follow their progress.'}
          </p>
          <div className="e-actions">
            <AddKidModalLauncher
              label={C.addKid[lang]}
              atLimit={false}
              variant="primary-lg"
              lang={lang}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head page-head-row">
        <div>
          <h1>{C.yourKids[lang]}</h1>
          <p>
            {lang === 'fr'
              ? "Touchez un enfant pour voir le détail de ses apprentissages."
              : 'Tap a kid to see their learning in detail.'}
          </p>
        </div>
        <div className="ph-actions">
          <AddKidModalLauncher
            label={C.addKid[lang]}
            atLimit={atLimit}
            variant="primary"
            lang={lang}
          />
        </div>
      </div>

      <div className="kid-cards">
        {kids.map((k) => (
          <KidCard key={k.id} kid={k} lang={lang} />
        ))}
        {!atLimit && (
          <AddKidModalLauncher
            label={C.addKid[lang]}
            atLimit={false}
            variant="card"
            lang={lang}
          />
        )}
      </div>

      <div style={{ height: 36 }} />
      <div className="section-label">
        {C.recentActivity[lang]}
        <span className="ln" />
      </div>
      <div className="card card-pad">
        <FamilyFeed
          activity={activity}
          lang={lang}
          emptyText={
            lang === 'fr'
              ? "Rien encore — une fois une session classée ou un enfant ajouté, ça apparaîtra ici."
              : 'Nothing yet — once you classify a session or add a kid, it shows here.'
          }
        />
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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

const C = {
  yourKids: { fr: 'Vos enfants', en: 'Your kids' },
  addKid: { fr: 'Ajouter un enfant', en: 'Add a kid' },
  lastActive: { fr: 'Actif', en: 'Active' },
  recentActivity: { fr: 'Activité récente de la famille', en: 'Recent family activity' },
};

function KidCard({ kid, lang }: { kid: KidSummary; lang: Language }) {
  const levels = Object.entries(kid.levels);
  return (
    <Link
      href={`/parent/kids/${kid.id}`}
      className="kid-card"
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <div className="kid-card-top">
        <KidAvatar avatar={kid.avatar} size={56} />
        <div>
          <div className="kc-name">{kid.name}</div>
          <div className="kc-age">{kid.language.toUpperCase()}</div>
        </div>
      </div>
      <div className="kc-chips">
        {levels.length === 0 ? (
          <span style={{ color: 'var(--text-3)', fontWeight: 700, fontSize: 12 }}>
            {lang === 'fr' ? 'Aucune session' : 'No sessions yet'}
          </span>
        ) : (
          levels.slice(0, 4).map(([m, lv]) => (
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
      <div className="kc-last">
        {kid.last_active_at
          ? `${C.lastActive[lang]} ${formatRelative(kid.last_active_at, lang)}`
          : lang === 'fr'
            ? 'Pas encore actif'
            : 'Not yet active'}
      </div>
    </Link>
  );
}

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
