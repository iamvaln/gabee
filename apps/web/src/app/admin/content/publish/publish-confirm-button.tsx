'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Module } from '@gabee/types';

const PREVIEW_LIMIT = 5;

/**
 * Mint a new snapshot via POST /api/admin/content/publish, then refresh the page
 * so the matrix banner + this row update. Shows a confirmation modal first with
 * the per-bucket ID lists capped at PREVIEW_LIMIT.
 */
export function PublishConfirmButton({
  module,
  nextVersion,
  added,
  removed,
  modified,
  lang,
}: {
  module: Module;
  nextVersion: number;
  added: string[];
  removed: string[];
  modified: string[];
  lang: 'fr' | 'en';
}) {
  const L = lang === 'fr';
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function publish() {
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/content/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = (body as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button className="btn mint" onClick={() => setOpen(true)}>
        {L ? `Publier v${nextVersion}` : `Publish v${nextVersion}`}
      </button>
      {open && (
        <div className="scrim" onClick={() => !submitting && setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <strong>{L ? `Publier ${module} v${nextVersion} ?` : `Publish ${module} v${nextVersion}?`}</strong>
            </div>
            <div className="modal-body">
              <DiffSection title={L ? 'Ajoutées' : 'Added'} ids={added} color="#15803d" lang={lang} />
              <DiffSection title={L ? 'Retirées' : 'Removed'} ids={removed} color="#b91c1c" lang={lang} />
              <DiffSection title={L ? 'Modifiées' : 'Modified'} ids={modified} color="#92400e" lang={lang} />
              {err && (
                <div style={{ marginTop: 12, padding: 8, borderRadius: 6, background: '#fee2e2', color: '#7f1d1d', fontSize: 13 }}>
                  {err}
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setOpen(false)} disabled={submitting}>
                {L ? 'Annuler' : 'Cancel'}
              </button>
              <button className="btn mint" onClick={() => void publish()} disabled={submitting}>
                {submitting ? (L ? 'Publication…' : 'Publishing…') : (L ? `Publier v${nextVersion}` : `Publish v${nextVersion}`)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DiffSection({
  title,
  ids,
  color,
  lang,
}: {
  title: string;
  ids: string[];
  color: string;
  lang: 'fr' | 'en';
}) {
  if (ids.length === 0) return null;
  const L = lang === 'fr';
  const shown = ids.slice(0, PREVIEW_LIMIT);
  const more = ids.length - shown.length;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color }}>
        {title} ({ids.length})
      </div>
      <ul className="t-mono" style={{ margin: 0, padding: '4px 0 0 16px', fontSize: 12, opacity: 0.8 }}>
        {shown.map((id) => (
          <li key={id}>{id}</li>
        ))}
        {more > 0 && <li style={{ opacity: 0.6 }}>{L ? `et ${more} autres…` : `and ${more} more…`}</li>}
      </ul>
    </div>
  );
}
