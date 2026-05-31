import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { HttpError } from '@/lib/server/http';
import { requireAdminPage } from '@/lib/server/auth';
import { getModule } from '@/lib/server/services/admin-modules';
import { listSubModes } from '@/lib/server/services/admin-sub-modes';
import { PageHead, StatusBadge, ModuleDot } from '../../_shell/primitives';
import { AIcon } from '../../_shell/icons';
import { ModuleControls } from './ModuleControls';
import { SubModesSection } from './sub-modes-section';

export const dynamic = 'force-dynamic';

const INPUT_LABELS: Record<string, { fr: string; en: string }> = {
  mouse: { fr: 'Souris', en: 'Mouse' },
  keyboard: { fr: 'Clavier', en: 'Keyboard' },
  drag: { fr: 'Glisser', en: 'Drag' },
  touch: { fr: 'Tactile', en: 'Touch' },
};

type Ctx = { params: Promise<{ id: string }> };

export default async function ModuleDetailPage(ctx: Ctx) {
  const session = await requireAdminPage();
  const lang: Language = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const L = lang === 'fr';
  const { id } = await ctx.params;

  let module;
  try {
    ({ module } = await getModule(id));
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) notFound();
    throw err;
  }

  const isSuper = session.role === 'super_admin';
  const disabled = module.status === 'disabled';
  const subModes = module.characteristics.sub_modes ?? [];
  // Live sub-mode registry rows for this module (Phase 2A). The legacy
  // `characteristics.sub_modes` chip list above is the static description;
  // the section below is the editable source of truth.
  const { sub_modes: registrySubModes } = await listSubModes(module.id);

  return (
    <div className="page">
      <PageHead title={module.name[lang]} sub={module.description[lang]}>
        {isSuper && <ModuleControls module={module} lang={lang} />}
      </PageHead>

      {disabled && (
        <div className="disabled-note">
          <AIcon name="pause-circle" size={18} />
          <div>
            <b>{L ? 'Ce module est désactivé.' : 'This module is disabled.'}</b>{' '}
            {L
              ? 'Il a disparu de tous les hubs enfants. Les données de contenu sont conservées.'
              : 'It has disappeared from every kid hub. Content data is preserved.'}
          </div>
        </div>
      )}

      <div className="editor-grid">
        <div className="col gap16">
          {/* Identity */}
          <div className="card">
            <div className="card-head">
              <h3>{L ? 'Identité' : 'Identity'}</h3>
              <span className="card-title-sub">
                {L ? 'ripple vers l’UI enfant + tokens design' : 'ripples to kid UI + design tokens'}
              </span>
            </div>
            <div className="card-pad">
              <dl className="kv">
                <dt>{L ? 'Nom (FR)' : 'Name (FR)'}</dt>
                <dd>{module.name.fr}</dd>
                <dt>{L ? 'Nom (EN)' : 'Name (EN)'}</dt>
                <dd>{module.name.en}</dd>
                <dt>{L ? 'Description (FR)' : 'Description (FR)'}</dt>
                <dd>{module.description.fr}</dd>
                <dt>{L ? 'Description (EN)' : 'Description (EN)'}</dt>
                <dd>{module.description.en}</dd>
                <dt>Slug</dt>
                <dd className="t-mono">/{module.slug}</dd>
                <dt>{L ? 'Jeton couleur' : 'Color token'}</dt>
                <dd className="row gap8">
                  <ModuleDot id={module.id} size={14} />
                  <span className="t-mono">{module.color_token}</span>
                </dd>
                <dt>{L ? 'Icône' : 'Icon'}</dt>
                <dd className="t-mono">{module.icon}</dd>
              </dl>
            </div>
          </div>

          {/* Characteristics */}
          <div className="card">
            <div className="card-head">
              <h3>{L ? 'Caractéristiques' : 'Characteristics'}</h3>
            </div>
            <div className="card-pad col gap12">
              <div>
                <div className="field-label mb0" style={{ marginBottom: 6 }}>
                  {L ? 'Méthodes d’entrée' : 'Input methods'}
                </div>
                <div className="wrap-actions">
                  {module.characteristics.input_methods.map((m) => (
                    <span key={m} className="chip" style={{ cursor: 'default' }}>
                      {INPUT_LABELS[m]?.[lang] ?? m}
                    </span>
                  ))}
                </div>
              </div>
              {subModes.length > 0 && (
                <div>
                  <div className="field-label mb0" style={{ marginBottom: 6 }}>
                    {L ? 'Sous-modes' : 'Sub-modes'} ({subModes.length})
                  </div>
                  <div className="wrap-actions">
                    {subModes.map((s) => (
                      <span key={s.id} className="chip" style={{ cursor: 'default' }}>
                        <ModuleDot id={module.id} size={7} />
                        {s.name[lang]}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="row gap16">
                <div>
                  <div className="field-label mb0" style={{ marginBottom: 6 }}>
                    {L ? 'Voix off' : 'Voiceover'}
                  </div>
                  <span className={'badge ' + (module.characteristics.voiceover ? 'ok' : 'neutral')}>
                    <i className="bdot" />
                    {module.characteristics.voiceover ? (L ? 'Activée' : 'On') : L ? 'Désactivée' : 'Off'}
                  </span>
                </div>
                <div className="grow">
                  <div className="field-label mb0" style={{ marginBottom: 6 }}>
                    {L ? 'Événements analytiques' : 'Analytics events'}
                  </div>
                  <div className="wrap-actions">
                    {module.characteristics.event_types.map((e) => (
                      <span key={e} className="chip t-mono" style={{ cursor: 'default', fontSize: 11.5 }}>
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Ops summary + lifecycle */}
        <div className="col gap16">
          <div className="card">
            <div className="card-head">
              <h3>{L ? 'État du contenu' : 'Content state'}</h3>
            </div>
            <div className="card-pad">
              <dl className="kv">
                <dt>{L ? 'Questions confirmées' : 'Confirmed questions'}</dt>
                <dd className="t-mono">{module.confirmed_questions}</dd>
                <dt>{L ? 'Plans en attente' : 'Pending plans'}</dt>
                <dd className="t-mono">{module.pending_plans}</dd>
              </dl>
            </div>
          </div>
          <div className="card card-pad">
            <div className="section-label">{L ? 'Cycle de vie' : 'Lifecycle'}</div>
            <div className="row gap8">
              <StatusBadge status={module.status} />
              <span className="hint">
                {disabled
                  ? L
                    ? 'caché des hubs'
                    : 'hidden from hubs'
                  : L
                    ? 'visible partout'
                    : 'visible everywhere'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <SubModesSection
        lang={lang}
        moduleId={module.id}
        isSuper={isSuper}
        initial={registrySubModes}
      />
    </div>
  );
}
