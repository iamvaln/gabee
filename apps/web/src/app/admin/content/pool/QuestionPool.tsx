'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type {
  Language,
  Module,
  PoolResponse,
  AdminQuestion,
  BilingualText,
  SubModeDef,
} from '@gabee/types';
import { AIcon } from '../../_shell/icons';
import { PageHead, Ring, Stars } from '../../_shell/primitives';

const MODULE_NAMES: Record<Module, BilingualText> = {
  numbers: { fr: 'Nombres', en: 'Numbers' },
  words: { fr: 'Mots', en: 'Words' },
  keyboard: { fr: 'Clavier', en: 'Keyboard' },
  code: { fr: 'Code', en: 'Code' },
  translation: { fr: 'Traduction', en: 'Translate' },
};

/** Render a polymorphic question value (bare scalar or {fr,en}) for a given language. */
function showValue(value: unknown, lang: 'fr' | 'en'): string {
  if (value && typeof value === 'object' && 'fr' in value && 'en' in value) {
    return String((value as Record<string, unknown>)[lang] ?? '');
  }
  return value === undefined || value === null ? '' : String(value);
}

export function QuestionPool({
  lang,
  data,
  target,
  subModes,
}: {
  lang: Language;
  data: PoolResponse;
  target: number;
  /** Sub-modes available for this module, server-fetched on the page. */
  subModes: SubModeDef[];
}) {
  const L = lang === 'fr';
  const router = useRouter();
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moduleName = MODULE_NAMES[data.module][lang];
  const ratedHigh = data.rated_high;
  const canConfirm = data.plan_accepted && ratedHigh >= target;

  async function rate(id: string, langKey: 'fr' | 'en', score: number) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/questions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: { [langKey]: score } }),
      });
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? 'Rating failed');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rating failed');
    }
  }

  async function setStatus(id: string, status: 'confirmed' | 'rejected' | 'demoted') {
    setError(null);
    try {
      const res = await fetch(`/api/admin/questions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? 'Update failed');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  async function confirmPool() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/content/pool/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: data.module, level: data.level }),
      });
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? 'Confirm failed');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Confirm failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <PageHead
        title={`${L ? 'Pool —' : 'Pool —'} ${moduleName} · ${L ? 'Niveau' : 'Level'} ${data.level}`}
        sub={
          L
            ? 'Notez (1–5) chaque langue, éditez ou rejetez. Confirmez pour promouvoir les meilleures dans le pool en direct.'
            : 'Rate (1–5) each language, edit or reject. Confirm to promote the best into the live pool.'
        }
      >
        {data.plan_accepted && (
          <button className="btn-ai btn" onClick={() => setModal(true)} disabled={busy}>
            <AIcon name="sparkle" size={15} />
            {L ? 'Générer des questions' : 'Generate questions'}
          </button>
        )}
      </PageHead>

      {!data.plan_accepted && (
        <div className="disabled-note">
          <AIcon name="lock" size={18} />
          <div>
            {L ? 'Le plan de ce niveau n’est pas encore accepté. ' : 'This level’s plan is not accepted yet. '}
            <Link href={`/admin/content/plan?module=${data.module}&level=${data.level}`}>
              {L ? 'Acceptez le plan pour générer des questions.' : 'Accept the plan to generate questions.'}
            </Link>
          </div>
        </div>
      )}

      {error && (
        <div className="banner error">
          <AIcon name="alert" size={18} />
          <div>{error}</div>
        </div>
      )}

      {data.plan_accepted && (
        <div className="card card-pad pool-head" style={{ display: 'grid' }}>
          <div>
            <div className="section-label mb0" style={{ marginBottom: 8 }}>
              {L ? 'Objectifs visés' : 'Target objectives'}
            </div>
            <div className="wrap-actions">
              {data.objectives.slice(0, 3).map((o, i) => (
                <span
                  key={i}
                  className="chip"
                  style={{ cursor: 'default', maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  <span className="obj-num" style={{ width: 16, height: 16, fontSize: 10, flexShrink: 0 }}>
                    {i + 1}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{o[lang]}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="pool-meter">
            <div>
              <div className="pm-num">
                {ratedHigh}
                <span className="pm-of"> / {target}</span>
              </div>
              <div className="hint">{L ? 'notés ≥ 4 (FR+EN)' : 'rated ≥ 4 (FR+EN)'}</div>
            </div>
            <Ring value={target ? ratedHigh / target : 0} size={48} color="var(--ok)" />
            <button
              className="btn brand"
              disabled={!canConfirm || busy}
              onClick={confirmPool}
              title={canConfirm ? '' : L ? 'Notez plus de candidats' : 'Rate more candidates'}
            >
              <AIcon name="check" size={15} />
              {L ? 'Confirmer le pool' : 'Confirm pool'}
            </button>
          </div>
        </div>
      )}

      {data.plan_accepted && data.candidates.length === 0 && (
        <div className="card empty-state mt8">
          <h3>{L ? 'Aucun candidat pour l’instant' : 'No candidates yet'}</h3>
          <p>
            {L
              ? 'Le plan est accepté. Générez un lot de questions candidates et elles apparaîtront ici pour être notées.'
              : 'The plan is accepted. Generate a batch of question candidates and they’ll appear here for rating.'}
          </p>
          <button className="btn-ai btn mt8" onClick={() => setModal(true)}>
            <AIcon name="sparkle" size={15} />
            {L ? 'Générer des questions' : 'Generate questions'}
          </button>
        </div>
      )}

      {data.candidates.length > 0 && (
        <div className="cand-grid mt16">
          {data.candidates.map((c) => (
            <CandidateCard
              key={c.id}
              lang={lang}
              c={c}
              onRate={rate}
              onStatus={setStatus}
            />
          ))}
        </div>
      )}

      {data.confirmed.length > 0 && (
        <div className="mt16">
          <div className="section-label" style={{ marginBottom: 8 }}>
            {L ? 'Confirmées (visibles aux enfants)' : 'Confirmed (visible to kids)'} · {data.confirmed.length}
          </div>
        </div>
      )}

      {modal && (
        <GenModal
          lang={lang}
          moduleName={moduleName}
          level={data.level}
          module={data.module}
          subModes={subModes}
          onClose={() => setModal(false)}
          onDone={() => {
            setModal(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function CandidateCard({
  lang,
  c,
  onRate,
  onStatus,
}: {
  lang: Language;
  c: AdminQuestion;
  onRate: (id: string, lang: 'fr' | 'en', n: number) => void;
  onStatus: (id: string, status: 'confirmed' | 'rejected' | 'demoted') => void;
}) {
  const L = lang === 'fr';
  return (
    <div className="cand">
      <div className="cand-top">
        <span className="cand-type">{c.type}</span>
        {c.objective_ref && <span className="cand-obj">· {L ? 'objectif' : 'objective'} #{c.objective_ref}</span>}
        <div className="grow" />
        <span className="badge info">
          <i className="bdot" />
          {L ? 'candidat' : 'candidate'}
        </span>
      </div>
      <div className="cand-body">
        <div className="cand-lang">
          <div className="cl-head">
            <span className="bil-lang mb0" style={{ margin: 0 }}>
              <span className="flag">🇫🇷</span>FR
            </span>
            <Stars value={Math.round(c.ratings.fr.score)} onSet={(v) => onRate(c.id, 'fr', v)} />
          </div>
          <div className="cand-q">{showValue(c.prompt, 'fr')}</div>
          <div className="cand-a">
            {L ? 'Réponse :' : 'Answer:'} <b>{showValue(c.answer, 'fr')}</b>
          </div>
        </div>
        <div className="cand-lang">
          <div className="cl-head">
            <span className="bil-lang mb0" style={{ margin: 0 }}>
              <span className="flag">🇬🇧</span>EN
            </span>
            <Stars value={Math.round(c.ratings.en.score)} onSet={(v) => onRate(c.id, 'en', v)} />
          </div>
          <div className="cand-q">{showValue(c.prompt, 'en')}</div>
          <div className="cand-a">
            {L ? 'Réponse :' : 'Answer:'} <b>{showValue(c.answer, 'en')}</b>
          </div>
        </div>
      </div>
      <div className="cand-foot">
        <button className="btn ghost sm" onClick={() => onStatus(c.id, 'demoted')}>
          <AIcon name="arrow-down-r" size={14} />
          {L ? 'Rétrograder' : 'Demote'}
        </button>
        <div className="grow" />
        <button className="btn danger sm rej" onClick={() => onStatus(c.id, 'rejected')}>
          <AIcon name="x" size={14} />
          {L ? 'Rejeter' : 'Reject'}
        </button>
        <button className="btn brand sm" onClick={() => onStatus(c.id, 'confirmed')}>
          <AIcon name="check" size={14} />
          {L ? 'Accepter' : 'Accept'}
        </button>
      </div>
    </div>
  );
}

const BATCH_SIZES = [20, 30, 45] as const;
const DIFFICULTIES: Array<{ key: 'easier' | 'as_planned' | 'harder'; fr: string; en: string }> = [
  { key: 'easier', fr: 'Plus facile', en: 'Easier' },
  { key: 'as_planned', fr: 'Comme le plan', en: 'As planned' },
  { key: 'harder', fr: 'Plus difficile', en: 'Harder' },
];

function GenModal({
  lang,
  moduleName,
  module,
  level,
  subModes,
  onClose,
  onDone,
}: {
  lang: Language;
  moduleName: string;
  module: Module;
  level: number;
  subModes: SubModeDef[];
  onClose: () => void;
  onDone: () => void;
}) {
  const L = lang === 'fr';
  const [batch, setBatch] = useState<number>(30);
  const [difficulty, setDifficulty] = useState<'easier' | 'as_planned' | 'harder'>('as_planned');
  const [themes, setThemes] = useState('');
  const [instructions, setInstructions] = useState('');
  // Empty string = AI varies across sub-modes (or uses the module's default).
  const [subMode, setSubMode] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/content/pool/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module,
          level,
          batch_size: batch,
          difficulty_hint: difficulty,
          themes: themes || undefined,
          instructions: instructions || undefined,
          sub_mode: subMode || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? 'Generation failed');
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
      setBusy(false);
    }
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>
            <span style={{ color: 'var(--mascot-admin)' }}>✦</span> {L ? 'Générer des questions' : 'Generate questions'}
          </h3>
          <button className="icon-btn x" onClick={onClose} disabled={busy}>
            <AIcon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div className="banner offline" style={{ background: 'var(--surface-2)', color: 'var(--text-2)', margin: 0 }}>
            <AIcon name="content" size={16} />
            <div>
              <b style={{ color: 'var(--ink)' }}>
                {moduleName} · {L ? 'Niveau' : 'Level'} {level}
              </b>
              <span className="b-sub"> · {L ? 'le plan accepté est utilisé comme base' : 'the accepted plan is used as the base'}</span>
            </div>
          </div>
          {error && (
            <div className="banner error" style={{ margin: 0 }}>
              <AIcon name="alert" size={16} />
              <div>{error}</div>
            </div>
          )}
          {busy && (
            <div className="banner" style={{ background: 'var(--surface-2)', color: 'var(--text-2)', margin: 0 }}>
              <AIcon name="sparkle" size={16} />
              <div style={{ flex: 1 }}>
                <b style={{ color: 'var(--ink)' }}>{L ? 'Génération en cours…' : 'Generating…'}</b>
                <span className="b-sub">
                  {' '}
                  {L
                    ? `${batch} candidats — l'IA travaille, patiente quelques instants.`
                    : `${batch} candidates — the AI is working, this can take a moment.`}
                </span>
                <div className="ai-progress" aria-hidden>
                  <i />
                </div>
              </div>
            </div>
          )}
          <div>
            <div className="field-label">{L ? 'Taille du lot' : 'Batch size'}</div>
            <div className="row gap8">
              {BATCH_SIZES.map((n) => (
                <button key={n} className={'chip' + (batch === n ? ' on' : '')} onClick={() => setBatch(n)}>
                  {n} {L ? 'candidats' : 'candidates'}
                </button>
              ))}
            </div>
            <p className="help">
              {L ? 'Par défaut : 30 (pool ×1.5 pour avoir de la marge).' : 'Default: 30 (pool ×1.5 for headroom).'}
            </p>
          </div>
          <div>
            <div className="field-label">{L ? 'Indice de difficulté' : 'Difficulty hint'}</div>
            <div className="row gap8">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.key}
                  className={'chip' + (difficulty === d.key ? ' on' : '')}
                  onClick={() => setDifficulty(d.key)}
                >
                  {L ? d.fr : d.en}
                </button>
              ))}
            </div>
          </div>
          {subModes.length > 0 && (
            <div>
              <div className="field-label">{L ? 'Sous-mode' : 'Sub-mode'}</div>
              <select
                className="inp"
                value={subMode}
                onChange={(e) => setSubMode(e.target.value)}
              >
                <option value="">
                  {L ? '— laisser l’IA varier —' : '— let the AI vary —'}
                </option>
                {subModes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name[lang]} ({s.key})
                  </option>
                ))}
              </select>
              <p className="help">
                {L
                  ? 'optionnel — épingle chaque question du lot à ce sous-mode'
                  : 'optional — pins every question in the batch to this sub-mode'}
              </p>
            </div>
          )}
          <div>
            <div className="field-label">{L ? 'Thèmes à favoriser / éviter' : 'Themes to favor / avoid'}</div>
            <input
              className="inp"
              value={themes}
              onChange={(e) => setThemes(e.target.value)}
              placeholder={
                L ? 'ex. favoriser l’argent et les heures ; éviter les nombres ronds' : 'e.g. favor money & time; avoid round numbers'
              }
            />
          </div>
          <div>
            <div className="field-label">{L ? 'Instructions libres' : 'Additional instructions'}</div>
            <textarea
              className="ta"
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={L ? 'Optionnel — par défaut : « utiliser le plan tel quel ».' : 'Optional — default: “use the plan as-is.”'}
            />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn secondary" onClick={onClose} disabled={busy}>
            {L ? 'Annuler' : 'Cancel'}
          </button>
          <button className="btn-ai btn" onClick={start} disabled={busy}>
            <AIcon name="sparkle" size={15} />
            {busy ? (L ? 'Génération…' : 'Generating…') : L ? 'Lancer la génération' : 'Start generating'}
          </button>
        </div>
      </div>
    </div>
  );
}
