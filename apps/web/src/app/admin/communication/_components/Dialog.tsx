'use client';

import { useEffect, useId, useRef } from 'react';
import type { Language } from '@gabee/types';
import { AIcon } from '../../_shell/icons';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog: focus moves in (to `[data-autofocus]` or the first field),
 * Tab stays inside, Escape and the backdrop close it (unless `busy`), and
 * focus returns to the control that opened it.
 */
export function Dialog({
  title,
  lang,
  onClose,
  busy = false,
  children,
  footer,
}: {
  title: string;
  lang: Language;
  onClose: () => void;
  busy?: boolean;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Read through a ref so the effect below runs once per opening.
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const root = ref.current;
    if (!root) return;
    const first = root.querySelector<HTMLElement>('[data-autofocus]') ?? root.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (!busyRef.current) closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const head = items[0]!;
      const tail = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      opener?.focus();
    };
  }, []);

  return (
    <div
      className="modal-scrim studio-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div ref={ref} className="modal studio-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-head">
          <h3 id={titleId}>{title}</h3>
          <button
            type="button"
            className="btn ghost sm x studio-icon-btn"
            onClick={onClose}
            disabled={busy}
            aria-label={lang === 'fr' ? 'Fermer' : 'Close'}
          >
            <AIcon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}

/** "Are you sure?" before a destructive action (regenerate over an edit, change of direction). */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  lang,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  lang: Language;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={title}
      lang={lang}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose}>
            {lang === 'fr' ? 'Annuler' : 'Cancel'}
          </button>
          <button type="button" className={'btn' + (danger ? ' danger' : '')} onClick={onConfirm} data-autofocus>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="studio-dialog-text">{body}</p>
    </Dialog>
  );
}
