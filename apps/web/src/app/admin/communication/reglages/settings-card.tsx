'use client';

import { useCallback, useId, useState } from 'react';
import type { Language } from '@gabee/types';
import { AIcon } from '../../_shell/icons';
import { reportUnexpected } from '../_components/api';
import { errorText } from '../_components/errors';
import type { Bi } from '../_components/format';

/** The Réglages card kit: each card saves on its own and reports unsaved edits to the page. */

export type OnDirty = (card: string, dirty: boolean) => void;

export type SaveState = { busy: boolean; error: string | null; saved: boolean };
const IDLE: SaveState = { busy: false, error: null, saved: false };

/** Run a save; `saved` shows "Enregistré" until the next change. */
export function useSave(lang: Language) {
  const [state, setState] = useState<SaveState>(IDLE);
  const run = useCallback(
    async (action: string, fn: () => Promise<void>, overrides: Record<string, Bi> = {}) => {
      setState({ busy: true, error: null, saved: false });
      try {
        await fn();
        setState({ busy: false, error: null, saved: true });
      } catch (err) {
        reportUnexpected(err, { action });
        setState({ busy: false, error: errorText(err, lang, overrides), saved: false });
      }
    },
    [lang],
  );
  const touch = useCallback(() => setState((s) => (s.saved || s.error ? IDLE : s)), []);
  return { state, run, touch };
}

export function SettingsCard({
  title,
  sub,
  readOnly,
  children,
  footer,
}: {
  title: string;
  sub?: React.ReactNode;
  readOnly: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const id = useId();
  return (
    <section className="card studio-settings-card" aria-labelledby={id}>
      <div className="studio-settings-head">
        <h2 id={id} className="studio-card-title">
          {title}
        </h2>
        {sub && <div className="studio-settings-sub">{sub}</div>}
      </div>
      {/* Read-only: text stays selectable (readOnly fields); only choices are disabled. */}
      <div className="studio-fieldset studio-settings-body">{children}</div>
      {!readOnly && footer && <div className="studio-settings-foot">{footer}</div>}
    </section>
  );
}

export function SaveBar({ lang, state, label, dirty, form, blocked }: { lang: Language; state: SaveState; label: string; dirty: boolean; form: string; blocked?: boolean }) {
  const L = lang === 'fr';
  return (
    <>
      <span className="studio-save-status" role="status">
        {state.saved && !dirty && (
          <>
            <AIcon name="check" size={14} />
            {L ? 'Enregistré' : 'Saved'}
          </>
        )}
        {!state.saved && dirty && !state.busy && (L ? 'Modifications non enregistrées' : 'Unsaved changes')}
      </span>
      {state.error && (
        <p className="studio-field-error studio-save-error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" form={form} className="btn" disabled={!dirty || state.busy || blocked}>
        {state.busy ? (L ? 'Enregistrement…' : 'Saving…') : label}
      </button>
    </>
  );
}
