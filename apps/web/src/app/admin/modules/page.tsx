import Link from 'next/link';
import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { listModules } from '@/lib/server/services/admin-modules';
import { PageHead, StatusBadge } from '../_shell/primitives';
import { AIcon } from '../_shell/icons';

export const dynamic = 'force-dynamic';

export default async function ModulesPage() {
  const session = await requireAdminPage();
  const lang: Language = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const L = lang === 'fr';
  const { modules } = await listModules();
  const isSuper = session.role === 'super_admin';

  return (
    <div className="page">
      <PageHead
        title="Modules"
        sub={
          L
            ? 'Cinq entités fixes et de premier ordre. Ce que l’on rédige, c’est le contenu pour elles — jamais leur identité.'
            : 'Five fixed, first-class entities. What you author is the content for them — never their identity.'
        }
      />
      {!isSuper && (
        <div className="hint" style={{ marginBottom: 12 }}>
          {L
            ? 'Vue en lecture seule — seul un super admin peut éditer les métadonnées d’un module.'
            : 'Read-only view — only a super admin can edit module metadata.'}
        </div>
      )}
      <div className="mod-cards">
        {modules.map((mod) => {
          const subModes = mod.characteristics.sub_modes?.length ?? 0;
          return (
            <Link key={mod.id} href={`/admin/modules/${mod.id}`} className="card mod-card" style={{ cursor: 'pointer' }}>
              <div className="mc-bar" style={{ background: `var(--module-${mod.id})` }} />
              <div className="mc-body">
                <div
                  className="mc-icon"
                  style={{ background: `var(--module-${mod.id})`, color: mod.id === 'keyboard' ? 'var(--ink)' : 'white' }}
                >
                  {mod.name[lang].slice(0, 1)}
                </div>
                <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
                  <span className="mc-name">{mod.name[lang]}</span>
                  <span className="mc-name-en">{lang === 'fr' ? mod.name.en : mod.name.fr}</span>
                  <div className="grow" />
                  <StatusBadge status={mod.status} />
                </div>
                <div className="mc-meta">
                  <span className="mslug muted" style={{ fontWeight: 700 }}>/{mod.slug}</span>
                  {subModes > 0 && (
                    <span>
                      <b>{subModes}</b> {L ? 'sous-modes' : 'sub-modes'}
                    </span>
                  )}
                  {mod.characteristics.voiceover && (
                    <span className="row gap6" style={{ gap: 5 }}>
                      <AIcon name="play" size={12} />
                      {L ? 'voix off' : 'voiceover'}
                    </span>
                  )}
                </div>
                <div className="mc-ops">
                  <div className="mc-stat">
                    <div className="mc-stat-n tnum">{mod.confirmed_questions}</div>
                    <div className="mc-stat-l">{L ? 'questions confirmées' : 'confirmed questions'}</div>
                  </div>
                  <div className="mc-stat">
                    <div className="mc-stat-n tnum">{mod.pending_plans}</div>
                    <div className="mc-stat-l">{L ? 'plans en attente' : 'pending plans'}</div>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
