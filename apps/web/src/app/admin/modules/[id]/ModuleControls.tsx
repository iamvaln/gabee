'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Language, ModuleSummary } from '@gabee/types';
import { AIcon } from '../../_shell/icons';

// Client controls for M2: super_admin edits metadata + flips status. The server enforces
// super_admin on both endpoints; these controls are only rendered when role allows.
export function ModuleControls({ module, lang }: { module: ModuleSummary; lang: Language }) {
  const L = lang === 'fr';
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = module.status === 'disabled';

  const toggleStatus = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/modules/${module.id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: disabled ? 'active' : 'disabled' }),
      });
      if (!res.ok) throw new Error('request_failed');
      router.refresh();
    } catch {
      setError(L ? 'Échec de la mise à jour.' : 'Update failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="btn secondary" onClick={() => setEditing(true)} disabled={busy}>
        <AIcon name="edit" size={15} />
        {L ? 'Éditer' : 'Edit metadata'}
      </button>
      <button className="btn danger" onClick={toggleStatus} disabled={busy}>
        <AIcon name="pause-circle" size={15} />
        {disabled ? (L ? 'Réactiver' : 'Re-enable') : L ? 'Désactiver' : 'Disable'}
      </button>
      {error && (
        <span className="hint" style={{ color: 'var(--bad)' }}>
          {error}
        </span>
      )}
      {editing && <EditModal module={module} lang={lang} onClose={() => setEditing(false)} />}
    </>
  );
}

function EditModal({
  module,
  lang,
  onClose,
}: {
  module: ModuleSummary;
  lang: Language;
  onClose: () => void;
}) {
  const L = lang === 'fr';
  const router = useRouter();
  const [nameFr, setNameFr] = useState(module.name.fr);
  const [nameEn, setNameEn] = useState(module.name.en);
  const [descFr, setDescFr] = useState(module.description.fr);
  const [descEn, setDescEn] = useState(module.description.en);
  const [colorToken, setColorToken] = useState(module.color_token);
  const [icon, setIcon] = useState(module.icon);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/modules/${module.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: { fr: nameFr, en: nameEn },
          description: { fr: descFr, en: descEn },
          color_token: colorToken,
          icon,
        }),
      });
      if (!res.ok) throw new Error('request_failed');
      onClose();
      router.refresh();
    } catch {
      setError(L ? 'Échec de l’enregistrement.' : 'Save failed.');
      setBusy(false);
    }
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{L ? 'Éditer le module' : 'Edit module'}</h3>
          <button className="icon-btn x" onClick={onClose}>
            <AIcon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div className="row gap12">
            <div className="grow">
              <div className="field-label">{L ? 'Nom (FR)' : 'Name (FR)'}</div>
              <input className="inp" value={nameFr} onChange={(e) => setNameFr(e.target.value)} />
            </div>
            <div className="grow">
              <div className="field-label">{L ? 'Nom (EN)' : 'Name (EN)'}</div>
              <input className="inp" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            </div>
          </div>
          <div>
            <div className="field-label">{L ? 'Description (FR)' : 'Description (FR)'}</div>
            <input className="inp" value={descFr} onChange={(e) => setDescFr(e.target.value)} />
          </div>
          <div>
            <div className="field-label">{L ? 'Description (EN)' : 'Description (EN)'}</div>
            <input className="inp" value={descEn} onChange={(e) => setDescEn(e.target.value)} />
          </div>
          <div className="row gap12">
            <div className="grow">
              <div className="field-label">{L ? 'Jeton couleur' : 'Color token'}</div>
              <input className="inp" value={colorToken} onChange={(e) => setColorToken(e.target.value)} />
            </div>
            <div className="grow">
              <div className="field-label">{L ? 'Icône' : 'Icon'}</div>
              <input className="inp" value={icon} onChange={(e) => setIcon(e.target.value)} />
            </div>
          </div>
          {error && (
            <p className="help" style={{ color: 'var(--bad)' }}>
              {error}
            </p>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn secondary" onClick={onClose} disabled={busy}>
            {L ? 'Annuler' : 'Cancel'}
          </button>
          <button className="btn" onClick={save} disabled={busy}>
            <AIcon name="check" size={15} />
            {L ? 'Enregistrer' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
