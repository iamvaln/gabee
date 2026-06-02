'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Language, Module, PlanResponse, BilingualText } from '@gabee/types';
import { AIcon } from '../../_shell/icons';
import { PageHead } from '../../_shell/primitives';

const MODULE_NAMES: Record<Module, BilingualText> = {
  numbers: { fr: 'Nombres', en: 'Numbers' },
  words: { fr: 'Mots', en: 'Words' },
  keyboard: { fr: 'Clavier', en: 'Keyboard' },
  code: { fr: 'Code', en: 'Code' },
  translation: { fr: 'Traduction', en: 'Translate' },
};

type Draft = {
  scope: BilingualText;
  objectives: BilingualText[];
  validation: BilingualText;
  notes: string;
};

function toDraft(data: PlanResponse): Draft {
  const p = data.plan;
  return {
    scope: p?.scope ?? { fr: '', en: '' },
    objectives: p?.pedagogical_objectives?.length ? p.pedagogical_objectives : [{ fr: '', en: '' }],
    validation: p?.validation_criteria ?? { fr: '', en: '' },
    notes: p?.notes ?? '',
  };
}

export function PlanEditor({ lang, data }: { lang: Language; data: PlanResponse }) {
  const L = lang === 'fr';
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(data));
  const [status, setStatus] = useState(data.plan?.status ?? 'pending');
  const [streaming, setStreaming] = useState(false);
  const [streamed, setStreamed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const moduleName = MODULE_NAMES[data.module][lang];
  const disabled = !data.prereqs_met;

  const setScope = (k: 'fr' | 'en', v: string) =>
    setDraft((d) => ({ ...d, scope: { ...d.scope, [k]: v } }));
  const setValidation = (k: 'fr' | 'en', v: string) =>
    setDraft((d) => ({ ...d, validation: { ...d.validation, [k]: v } }));
  const setObjective = (i: number, k: 'fr' | 'en', v: string) =>
    setDraft((d) => ({
      ...d,
      objectives: d.objectives.map((o, idx) => (idx === i ? { ...o, [k]: v } : o)),
    }));
  const addObjective = () =>
    setDraft((d) => ({ ...d, objectives: [...d.objectives, { fr: '', en: '' }] }));
  const removeObjective = (i: number) =>
    setDraft((d) => ({ ...d, objectives: d.objectives.filter((_, idx) => idx !== i) }));

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/content/plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: data.module,
          sub_mode: data.sub_mode,
          level: data.level,
          scope: draft.scope,
          pedagogical_objectives: draft.objectives,
          validation_criteria: draft.validation,
          notes: draft.notes,
        }),
      });
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? 'Save failed');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleAccept() {
    setBusy(true);
    setError(null);
    try {
      // Persist current edits before accepting so parity reflects the editor.
      await handleSave();
      const res = await fetch('/api/admin/content/plan/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: data.module, sub_mode: data.sub_mode, level: data.level }),
      });
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? 'Accept failed');
      setStatus('accepted');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Accept failed');
    } finally {
      setBusy(false);
    }
  }

  // Stream the AI draft into the editor via a chunked fetch + ReadableStream reader.
  async function handleGenerate() {
    setError(null);
    setStreaming(true);
    setStreamed('');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let full = '';
    try {
      const res = await fetch('/api/admin/content/plan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: data.module, sub_mode: data.sub_mode, level: data.level }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const msg = (await res.json().catch(() => null))?.error?.message ?? 'Generation failed';
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        full += chunk;
        setStreamed(full);
      }
      if (full.includes('[stream_error:')) {
        throw new Error(full.slice(full.indexOf('[stream_error:')));
      }
      // Parse the completed JSON draft into the editor fields.
      try {
        const parsed = JSON.parse(full.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim());
        setDraft((d) => ({
          ...d,
          scope: { fr: parsed.scope?.fr ?? '', en: parsed.scope?.en ?? '' },
          objectives: (parsed.objectives ?? []).map((o: BilingualText) => ({
            fr: o.fr ?? '',
            en: o.en ?? '',
          })),
          validation: { fr: parsed.validation?.fr ?? '', en: parsed.validation?.en ?? '' },
        }));
        setStatus('ai_draft');
      } catch {
        // leave raw stream visible; user can retry
      }
      router.refresh();
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        setError(e instanceof Error ? e.message : 'Generation failed');
      }
    } finally {
      setStreaming(false);
      setStreamed(null);
      abortRef.current = null;
    }
  }

  function stopGenerate() {
    abortRef.current?.abort();
  }

  return (
    <div className="page">
      <PageHead
        title={`${moduleName} · ${data.sub_mode} · ${L ? 'Niveau' : 'Level'} ${data.level}`}
        sub={
          L
            ? 'Éditeur de plan — portée, objectifs pédagogiques et critères de validation, bilingue (parité exigée).'
            : 'Plan editor — scope, pedagogical objectives and validation criteria, bilingual (parity enforced).'
        }
      >
        {!disabled && (
          <span className={'badge ' + (status === 'accepted' ? 'ok' : status === 'ai_draft' ? 'warn' : 'neutral')} style={{ alignSelf: 'center' }}>
            <i className="bdot" />
            {streaming
              ? L
                ? 'Génération…'
                : 'Generating…'
              : status === 'accepted'
                ? L
                  ? 'Accepté'
                  : 'Accepted'
                : status === 'ai_draft'
                  ? 'AI draft'
                  : L
                    ? 'À planifier'
                    : 'To plan'}
          </span>
        )}
      </PageHead>

      {disabled && (
        <div className="disabled-note">
          <AIcon name="lock" size={18} />
          <div>
            {L
              ? `Le niveau précédent (${moduleName} · N${data.level - 1}) n’a pas encore de plan accepté. `
              : `The previous level (${moduleName} · L${data.level - 1}) has no accepted plan yet. `}
            <Link href={`/admin/content/plan?module=${data.module}&level=${data.level - 1}`}>
              {L ? `planifiez d’abord le niveau ${data.level - 1}.` : `plan level ${data.level - 1} first.`}
            </Link>
          </div>
        </div>
      )}

      {error && (
        <div className="banner error">
          <AIcon name="alert" size={18} />
          <div>
            <b>{L ? 'Erreur' : 'Error'}</b> — {error}
          </div>
        </div>
      )}

      {streaming && (
        <div className="ai-banner">
          <span className="ai-spark">
            <AIcon name="sparkle" size={20} />
          </span>
          <div className="col">
            <span className="ai-msg">{L ? 'Gabee rédige le plan…' : 'Gabee is drafting the plan…'}</span>
            <span className="ai-sub">
              {L ? 'Contexte : objectifs des niveaux précédents · claude-opus-4-8' : 'Context: previous-level objectives · claude-opus-4-8'}
            </span>
          </div>
          <button className="btn ghost sm" onClick={stopGenerate}>
            <AIcon name="stop" size={14} />
            {L ? 'Arrêter' : 'Stop'}
          </button>
        </div>
      )}

      <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, opacity: disabled ? 0.5 : 1 }}>
        {data.prev_context.length > 0 && (
          <details className="prev-context">
            <summary>
              <span className="caret">
                <AIcon name="chevron-right" size={14} />
              </span>
              {L ? `Contexte des niveaux précédents (1–${data.level - 1})` : `Previous-level context (1–${data.level - 1})`}
            </summary>
            <div className="pc-body">
              {data.prev_context.map((pc) => (
                <div key={pc.level} className="pc-lvl">
                  <div className="pc-lvl-h">
                    {L ? 'Niveau' : 'Level'} {pc.level}
                  </div>
                  <ul>
                    {pc.objectives.map((o, i) => (
                      <li key={i}>{o[lang]}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="editor-grid">
          <div className="col gap16">
            {/* Scope */}
            <div className="card card-pad">
              <div className="field-label">
                <AIcon name="content" size={14} />
                {L ? 'Portée du niveau' : 'Level scope'}
              </div>
              <div className="bil">
                <div className="bil-col">
                  <div className="bil-lang">
                    <span className="flag">🇫🇷</span>Français
                  </div>
                  <textarea
                    className="ta"
                    rows={4}
                    value={streaming ? '' : draft.scope.fr}
                    onChange={(e) => setScope('fr', e.target.value)}
                  />
                </div>
                <div className="bil-col">
                  <div className="bil-lang">
                    <span className="flag">🇬🇧</span>English
                  </div>
                  {streaming ? (
                    <div className="ta" style={{ minHeight: 96, background: 'var(--surface-2)' }}>
                      <span>{streamed}</span>
                      <span className="stream-cursor" />
                    </div>
                  ) : (
                    <textarea
                      className="ta"
                      rows={4}
                      value={draft.scope.en}
                      onChange={(e) => setScope('en', e.target.value)}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Objectives */}
            <div className="card card-pad">
              <div className="field-label">
                <AIcon name="check" size={14} />
                {L ? 'Objectifs pédagogiques' : 'Pedagogical objectives'}
              </div>
              <div className="obj-list">
                {draft.objectives.map((o, i) => (
                  <div key={i} className="obj-row">
                    <span className="obj-num">{i + 1}</span>
                    <div className="bil grow">
                      <div className="bil-col">
                        <textarea
                          className="ta"
                          rows={2}
                          placeholder="FR"
                          value={o.fr}
                          onChange={(e) => setObjective(i, 'fr', e.target.value)}
                        />
                      </div>
                      <div className="bil-col">
                        <textarea
                          className="ta"
                          rows={2}
                          placeholder="EN"
                          value={o.en}
                          onChange={(e) => setObjective(i, 'en', e.target.value)}
                        />
                      </div>
                    </div>
                    <button className="btn danger sm" onClick={() => removeObjective(i)} title={L ? 'Retirer' : 'Remove'}>
                      <AIcon name="x" size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button className="btn ghost sm mt8" onClick={addObjective}>
                <AIcon name="plus" size={14} />
                {L ? 'Ajouter un objectif' : 'Add objective'}
              </button>
            </div>

            {/* Validation */}
            <div className="card card-pad">
              <div className="field-label">
                <AIcon name="shield" size={14} />
                {L ? 'Critères de validation' : 'Validation criteria'}
              </div>
              <div className="bil">
                <div className="bil-col">
                  <div className="bil-lang">
                    <span className="flag">🇫🇷</span>FR
                  </div>
                  <textarea
                    className="ta"
                    rows={3}
                    value={draft.validation.fr}
                    onChange={(e) => setValidation('fr', e.target.value)}
                  />
                </div>
                <div className="bil-col">
                  <div className="bil-lang">
                    <span className="flag">🇬🇧</span>EN
                  </div>
                  <textarea
                    className="ta"
                    rows={3}
                    value={draft.validation.en}
                    onChange={(e) => setValidation('en', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* right rail */}
          <div className="col gap16">
            <div className="card card-pad">
              <div className="section-label">{L ? 'Actions' : 'Actions'}</div>
              <div className="col gap8">
                <button className="btn-ai btn" onClick={handleGenerate} disabled={streaming || busy}>
                  <AIcon name={status === 'pending' ? 'sparkle' : 'refresh'} size={15} />
                  {status === 'pending'
                    ? L
                      ? 'Générer avec l’IA'
                      : 'Generate with AI'
                    : L
                      ? 'Régénérer'
                      : 'Regenerate'}
                </button>
                <button className="btn secondary" onClick={handleSave} disabled={streaming || busy}>
                  <AIcon name="check" size={15} />
                  {L ? 'Enregistrer' : 'Save'}
                </button>
                <button className="btn brand" onClick={handleAccept} disabled={streaming || busy}>
                  <AIcon name="check" size={15} />
                  {L ? 'Accepter' : 'Accept'}
                </button>
                <Link
                  className="btn secondary"
                  href={`/admin/content/pool?module=${data.module}&sub_mode=${encodeURIComponent(data.sub_mode)}&level=${data.level}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <AIcon name="external" size={15} />
                  {L ? 'Ouvrir le pool' : 'Open question pool'}
                </Link>
              </div>
              <p className="help">
                {L
                  ? 'Accepter passe le statut à « accepté » et débloque la génération de questions.'
                  : 'Accepting sets the status to “accepted” and unlocks question generation.'}
              </p>
            </div>
            <div className="card card-pad">
              <div className="field-label">{L ? 'Notes (admin)' : 'Notes (admin only)'}</div>
              <textarea
                className="ta"
                rows={4}
                value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                placeholder={L ? 'Notes internes…' : 'Internal notes…'}
              />
            </div>
            {data.plan?.ai_meta && (
              <div className="card card-pad">
                <div className="section-label">{L ? 'Métadonnées IA' : 'AI metadata'}</div>
                <dl className="kv" style={{ gridTemplateColumns: 'auto 1fr', fontSize: 12.5 }}>
                  <dt>{L ? 'Modèle' : 'Model'}</dt>
                  <dd>{data.plan.ai_meta.model}</dd>
                  <dt>{L ? 'Fournisseur' : 'Provider'}</dt>
                  <dd>{data.plan.ai_meta.provider}</dd>
                </dl>
              </div>
            )}
          </div>
        </div>
      </fieldset>
    </div>
  );
}
