import { cookies } from 'next/headers';
import type { PendingChangesPerModule } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { getDefaultCurriculumId } from '@/lib/server/admin';
import { listPendingChanges } from '@/lib/server/services/admin-publish';
import { PageHead, ModuleDot } from '../../_shell/primitives';
import { PublishConfirmButton } from './publish-confirm-button';

export const dynamic = 'force-dynamic';

const MODULE_NAMES: Record<string, { fr: string; en: string }> = {
  numbers: { fr: 'Chiffres', en: 'Numbers' },
  words: { fr: 'Mots', en: 'Words' },
  keyboard: { fr: 'Clavier', en: 'Keyboard' },
  code: { fr: 'Code', en: 'Code' },
  translation: { fr: 'Traduction', en: 'Translation' },
};

function relTime(iso: string | null, lang: 'fr' | 'en'): string {
  if (!iso) return lang === 'fr' ? 'jamais publié' : 'never published';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const days = Math.floor((now - then) / 86_400_000);
  if (days < 1) return lang === 'fr' ? "aujourd'hui" : 'today';
  if (days < 7) return lang === 'fr' ? `il y a ${days} j` : `${days}d ago`;
  if (days < 30) return lang === 'fr' ? `il y a ${Math.floor(days / 7)} sem` : `${Math.floor(days / 7)}w ago`;
  return lang === 'fr' ? `il y a ${Math.floor(days / 30)} mois` : `${Math.floor(days / 30)}mo ago`;
}

// Admin publish manager (product §5, §8). One card per module showing the live
// version + pending changes diff. Super-admins click "Publier v(N+1)" to mint a
// new snapshot; non-super admins see the page in read-only mode.
export default async function PublishManagerPage() {
  const session = await requireAdminPage();
  const lang = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const L = lang === 'fr';
  const isSuperAdmin = session.role === 'super_admin';
  const curriculumId = await getDefaultCurriculumId();
  const modules = await listPendingChanges(curriculumId);

  return (
    <div className="page">
      <PageHead
        title={L ? 'Publication' : 'Publish'}
        sub={
          L
            ? 'Gérer les versions publiées par module. La version vue par l’app enfant.'
            : 'Manage published versions per module — what the kid app sees.'
        }
      />

      <div className="card-grid mt8">
        {modules.map((m) => (
          <ModuleCard
            key={m.module}
            mod={m}
            lang={lang}
            isSuperAdmin={isSuperAdmin}
            displayName={MODULE_NAMES[m.module]?.[lang] ?? m.module}
            relTimeLabel={relTime(m.current_published_at, lang)}
          />
        ))}
      </div>
    </div>
  );
}

function ModuleCard({
  mod,
  lang,
  isSuperAdmin,
  displayName,
  relTimeLabel,
}: {
  mod: PendingChangesPerModule;
  lang: 'fr' | 'en';
  isSuperAdmin: boolean;
  displayName: string;
  relTimeLabel: string;
}) {
  const L = lang === 'fr';
  const { added, removed, modified } = mod.pending;
  const nextVersion = (mod.current_version ?? 0) + 1;

  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ModuleDot id={mod.module} size={12} />
        <strong style={{ fontSize: 16 }}>{displayName}</strong>
      </div>

      <div className="section-label">{L ? 'Version en ligne' : 'Live version'}</div>
      <div className="t-mono" style={{ fontSize: 15 }}>
        {mod.current_version != null ? `v${mod.current_version}` : L ? '—' : '—'}
        <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 13 }}>· {relTimeLabel}</span>
      </div>
      <div style={{ fontSize: 13, opacity: 0.7 }}>
        {mod.current_question_count} {L ? 'questions' : 'questions'}
      </div>

      <div className="section-label" style={{ marginTop: 6 }}>{L ? 'Changements en attente' : 'Pending changes'}</div>
      {mod.has_changes ? (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
          <span style={{ color: '#15803d' }}>+{added.length} {L ? 'ajoutées' : 'added'}</span>
          <span style={{ color: '#b91c1c' }}>−{removed.length} {L ? 'retirées' : 'removed'}</span>
          <span style={{ color: '#92400e' }}>~{modified.length} {L ? 'modifiées' : 'modified'}</span>
        </div>
      ) : (
        <div style={{ fontSize: 13, opacity: 0.6 }}>{L ? 'Aucun changement' : 'No changes'}</div>
      )}

      <div style={{ marginTop: 6 }}>
        {mod.has_changes ? (
          isSuperAdmin ? (
            <PublishConfirmButton
              module={mod.module}
              nextVersion={nextVersion}
              added={added}
              removed={removed}
              modified={modified}
              lang={lang}
            />
          ) : (
            <span className="badge neutral">{L ? 'Lecture seule' : 'Read only'}</span>
          )
        ) : (
          <button className="btn" disabled>{L ? 'À jour' : 'Up to date'}</button>
        )}
      </div>
    </div>
  );
}
