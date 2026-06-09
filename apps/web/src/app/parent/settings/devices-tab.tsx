'use client';

import { useEffect, useState } from 'react';
import type {
  DeviceLinkRow,
  DevicesListResponse,
  SendPairLinkRequest,
  SendPairLinkResponse,
} from '@gabee/types';
import type { SettingsAccount, SettingsLang } from './settings-tabs';
import { CopyButton } from '../_components/copy-button';

// Public origin of the kid PWA, baked into the build (see env.production —
// `NEXT_PUBLIC_KID_APP_URL`). Used in the pair-modal "Option 1" steps so the
// parent reads the exact host to type on the kid device, not a placeholder.
const KID_APP_URL =
  process.env.NEXT_PUBLIC_KID_APP_URL ?? 'http://localhost:5173';

/**
 * Parent spec §10.4 — Paired devices (ST3). Lists the parent's active
 * `DeviceLink` rows (GET /api/devices) and surfaces a "Pair a new device"
 * modal that mints a one-shot pair link (POST /api/devices/pair) and emails
 * it. The response carries `pair_url` so a dev without Mailgun wired can
 * copy-paste it onto the device manually.
 *
 * Revoke flows through a confirmation `.scrim/.modal` → DELETE /api/devices/[id].
 *
 * Footer carries the spec's plain-language note about TTLs (≈180d kid,
 * ≈30d parent, revoke anytime).
 */
export function DevicesTab({
  lang,
  account,
}: {
  lang: SettingsLang;
  account: SettingsAccount;
}) {
  const L = lang === 'fr';

  const [devices, setDevices] = useState<DeviceLinkRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pairOpen, setPairOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<DeviceLinkRow | null>(null);
  const [revoking, setRevoking] = useState(false);

  async function reload() {
    setLoadError(null);
    try {
      const res = await fetch('/api/devices', { credentials: 'include' });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as DevicesListResponse;
      setDevices(data.devices);
    } catch {
      setLoadError(
        L
          ? 'Impossible de charger vos appareils.'
          : "Couldn't load your devices.",
      );
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const res = await fetch(`/api/devices/${encodeURIComponent(revokeTarget.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok && res.status !== 204) throw new Error(`status ${res.status}`);
      setRevokeTarget(null);
      await reload();
    } catch {
      setLoadError(L ? 'Échec de la révocation.' : 'Revoke failed.');
    } finally {
      setRevoking(false);
    }
  }

  const hasDevices = devices !== null && devices.length > 0;

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h3>{L ? 'Appareils connectés' : 'Paired devices'}</h3>
          <div className="ch-actions">
            <button
              type="button"
              className="btn mint sm"
              onClick={() => setPairOpen(true)}
            >
              {L ? '+ Connecter un appareil' : '+ Pair a new device'}
            </button>
          </div>
        </div>

        {/* List or empty state. Loading shows a discreet line; errors stay
            inline so the parent can retry by reopening the tab. */}
        {devices === null && !loadError && (
          <div className="card-pad" style={{ color: 'var(--text-3)', fontWeight: 700 }}>
            {L ? 'Chargement…' : 'Loading…'}
          </div>
        )}
        {loadError && (
          <div className="card-pad">
            <span className="badge warn">{loadError}</span>
          </div>
        )}
        {devices !== null && !hasDevices && (
          <div
            className="card-pad"
            style={{
              color: 'var(--text-3)',
              fontWeight: 700,
              fontSize: 13.5,
              lineHeight: 1.55,
            }}
          >
            {L
              ? 'Aucun appareil connecté. Envoyez le lien à l’appareil de la famille pour commencer.'
              : 'No devices paired yet. Send the link to your family device to get started.'}
          </div>
        )}
        {hasDevices && (
          <div>
            {devices!.map((d) => (
              <DeviceRow
                key={d.id}
                device={d}
                L={L}
                onRevoke={() => setRevokeTarget(d)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Spec §10.4 plain-language note on TTLs / security. */}
      <div className="banner mint" style={{ alignItems: 'flex-start', marginTop: 16 }}>
        <span style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.5 }}>
          {L
            ? 'Une fois connectée, l’appli enfant reste ouverte longtemps (≈ 6 mois) pour que les enfants puissent apprendre sans connexion. Votre session parent est plus courte (≈ 30 jours) pour la sécurité. Révoquez à tout moment.'
            : 'Once paired, the kid app stays signed in on that device for a long time (about 6 months) so kids can keep learning. Your own parent session here is shorter (about 30 days) for security. Revoke anytime.'}
        </span>
      </div>

      {pairOpen && (
        <PairModal
          L={L}
          defaultEmail={account.email}
          onClose={() => setPairOpen(false)}
          onPaired={() => {
            void reload();
          }}
        />
      )}

      {revokeTarget && (
        <RevokeModal
          L={L}
          device={revokeTarget}
          busy={revoking}
          onCancel={() => setRevokeTarget(null)}
          onConfirm={doRevoke}
        />
      )}
    </>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function DeviceRow({
  device,
  L,
  onRevoke,
}: {
  device: DeviceLinkRow;
  L: boolean;
  onRevoke: () => void;
}) {
  const paired = new Date(device.paired_at);
  const lastActive = device.last_active_at ? new Date(device.last_active_at) : null;
  const fmt = (d: Date): string =>
    d.toLocaleDateString(L ? 'fr-FR' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  // "Paired DATE · last active …" — falls back to "never" when the device
  // hasn't checked in yet (just paired, kid hasn't picked a profile).
  const sub = lastActive
    ? L
      ? `Connecté le ${fmt(paired)} · vu ${fmt(lastActive)}`
      : `Paired ${fmt(paired)} · last seen ${fmt(lastActive)}`
    : L
      ? `Connecté le ${fmt(paired)} · jamais ouvert`
      : `Paired ${fmt(paired)} · never opened`;

  return (
    <div className="device-row">
      <span className="device-ic" aria-hidden>
        <DeviceIcon />
      </span>
      <div className="device-main">
        <div className="dm-label">{device.label}</div>
        <div className="dm-sub">{sub}</div>
      </div>
      <button
        type="button"
        className="btn mint-outline sm"
        onClick={onRevoke}
        aria-label={L ? `Révoquer ${device.label}` : `Revoke ${device.label}`}
      >
        {L ? 'Révoquer' : 'Revoke'}
      </button>
    </div>
  );
}

function DeviceIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="6" y="3" width="12" height="18" rx="2.5" />
      <path d="M11 18h2" />
    </svg>
  );
}

// ─── Pair modal ──────────────────────────────────────────────────────────────

function PairModal({
  L,
  defaultEmail,
  onClose,
  onPaired,
}: {
  L: boolean;
  defaultEmail: string;
  onClose: () => void;
  onPaired: () => void;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SendPairLinkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Email is now OPTIONAL — parents who'll use the code path can leave it
  // blank, no link is emailed and the response just carries the code + URL
  // to display on screen. If they fill it, it still has to look like an
  // email so a typo doesn't silently 400 at the API.
  const trimmedEmail = email.trim();
  const emailOk = trimmedEmail.length === 0 || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedEmail);
  const validLabel = label.trim().length >= 1 && label.trim().length <= 50;
  const canSubmit = emailOk && validLabel && !submitting;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const body: SendPairLinkRequest = {
        label: label.trim(),
        ...(trimmedEmail ? { target_email: trimmedEmail } : {}),
      };
      const res = await fetch('/api/devices/pair', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as
        | SendPairLinkResponse
        | { error?: { message?: string } }
        | null;
      if (!res.ok) {
        const msg = (data as { error?: { message?: string } } | null)?.error?.message;
        throw new Error(msg ?? `status ${res.status}`);
      }
      setResult(data as SendPairLinkResponse);
      onPaired();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>
            {result
              ? L
                ? 'Appareil prêt à connecter'
                : 'Device ready to pair'
              : L
                ? 'Connecter un appareil'
                : 'Pair a new device'}
          </h2>
          <button
            type="button"
            className="close-x mh-close"
            onClick={onClose}
            aria-label={L ? 'Fermer' : 'Close'}
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          {!result && (
            <>
              <p
                style={{
                  margin: '0 0 16px',
                  fontSize: 13.5,
                  color: 'var(--text-2)',
                  fontWeight: 600,
                  lineHeight: 1.55,
                }}
              >
                {L
                  ? 'Choisissez un nom pour l’appareil et l’adresse où nous envoyons le lien à usage unique. Ouvrez-le sur l’appareil pour finir.'
                  : 'Pick a label for the device and where we should email the one-time link. Open it on the device to finish.'}
              </p>
              <div className="field">
                <label htmlFor="pair-email">
                  {L ? 'Adresse d’envoi (optionnel)' : 'Send the link to (optional)'}
                </label>
                <input
                  id="pair-email"
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
                <span className="hint">
                  {L
                    ? 'Laisser vide pour récupérer un code à taper directement sur l’appareil enfant.'
                    : 'Leave blank to just get a code to type on the kid device.'}
                </span>
              </div>
              <div className="field">
                <label htmlFor="pair-label">
                  {L ? 'Nom de l’appareil' : 'Device label'}
                </label>
                <input
                  id="pair-label"
                  className="input"
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={50}
                  placeholder={L ? 'Ordinateur de la maison' : 'Home computer'}
                />
                <span className="hint">
                  {L
                    ? 'Ce nom s’affichera dans la liste plus haut.'
                    : 'This is what will appear in the list above.'}
                </span>
              </div>
              {error && (
                <div className="inline-error" role="alert">
                  {error}
                </div>
              )}
            </>
          )}
          {result && (
            <>
              <p
                style={{
                  margin: '0 0 14px',
                  fontSize: 13.5,
                  color: 'var(--text-2)',
                  fontWeight: 600,
                  lineHeight: 1.55,
                }}
              >
                {L
                  ? 'Deux chemins possibles — choisissez le plus pratique pour vous. Les deux finissent par le même appareil connecté.'
                  : 'Two paths — pick whichever is easier. Both end with the same paired device.'}
              </p>

              {/* Option 1 — short code. Primary path; reads aloud, types fast.
                  The parent enters it on the kid device AFTER signing in there
                  with email/password — that login is the brute-force gate, so
                  the code itself can be human-friendly. */}
              <div className="field">
                <label>{L ? 'Option 1 — Code à taper' : 'Option 1 — Type the code'}</label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'var(--bg-2)',
                    border: '2px solid var(--surface-3)',
                    borderRadius: 14,
                    padding: '14px 18px',
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontFamily: 'ui-monospace, monospace',
                      fontWeight: 800,
                      fontSize: 32,
                      letterSpacing: 4,
                      color: 'var(--text-1)',
                      textAlign: 'center',
                    }}
                  >
                    {result.short_code}
                  </span>
                  <CopyButton value={result.short_code} lang={L ? 'fr' : 'en'} />
                </div>
                <ol
                  style={{
                    margin: '8px 0 0',
                    paddingLeft: 20,
                    fontSize: 13,
                    color: 'var(--text-2)',
                    fontWeight: 600,
                    lineHeight: 1.7,
                  }}
                >
                  <li>
                    {L ? 'Sur l’appareil enfant, ouvrez ' : 'On the kid device, open '}
                    <a
                      href={KID_APP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}
                    >
                      {KID_APP_URL.replace(/^https?:\/\//, '')}
                    </a>
                  </li>
                  <li>
                    {L
                      ? 'Connectez-vous avec votre email parent.'
                      : 'Sign in with your parent email.'}
                  </li>
                  <li>
                    {L ? 'Tapez le code ci-dessus.' : 'Type the code above.'}
                  </li>
                </ol>
              </div>

              {/* Option 2 — link. Still shown for one-tap on the same machine
                  / when the kid device has email open. The same DevicePairToken
                  row backs both paths; consuming one invalidates the other. */}
              <div className="field">
                <label>{L ? 'Option 2 — Lien à usage unique' : 'Option 2 — One-time link'}</label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <input
                    className="input"
                    value={result.pair_url}
                    readOnly
                    onFocus={(e) => e.currentTarget.select()}
                    style={{ flex: 1, minWidth: 0, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
                  />
                  <CopyButton value={result.pair_url} lang={L ? 'fr' : 'en'} />
                </div>
                <span className="hint">
                  {L
                    ? `Expire le ${new Date(result.expires_at).toLocaleString('fr-FR')}. ${email.trim() ? 'Le lien a aussi été envoyé par email.' : ''}`
                    : `Expires ${new Date(result.expires_at).toLocaleString('en-GB')}. ${email.trim() ? 'The link was also emailed.' : ''}`}
                </span>
              </div>
            </>
          )}
        </div>
        <div className="modal-foot">
          {!result && (
            <>
              <button type="button" className="btn ghost" onClick={onClose}>
                {L ? 'Annuler' : 'Cancel'}
              </button>
              <button
                type="button"
                className="btn mint"
                disabled={!canSubmit}
                onClick={submit}
              >
                {submitting
                  ? L
                    ? 'Envoi…'
                    : 'Sending…'
                  : L
                    ? 'Envoyer le lien'
                    : 'Send the link'}
              </button>
            </>
          )}
          {result && (
            <button
              type="button"
              className="btn mint grow"
              onClick={onClose}
            >
              {L
                ? 'J’ai ouvert le lien sur l’appareil'
                : "I've opened the link on the device"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Revoke modal ────────────────────────────────────────────────────────────

function RevokeModal({
  L,
  device,
  busy,
  onCancel,
  onConfirm,
}: {
  L: boolean;
  device: DeviceLinkRow;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{L ? 'Révoquer l’appareil' : 'Revoke device'}</h2>
          <button
            type="button"
            className="close-x mh-close"
            onClick={onCancel}
            disabled={busy}
            aria-label={L ? 'Fermer' : 'Close'}
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <p
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.55,
              color: 'var(--text)',
              fontWeight: 600,
            }}
          >
            {L
              ? `« ${device.label} » ne pourra plus se connecter. Les enfants devront attendre que vous reconnectiez l’appareil.`
              : `"${device.label}" will no longer be signed in. Kids on that device will have to wait until you pair it again.`}
          </p>
        </div>
        <div className="modal-foot">
          <button
            type="button"
            className="btn ghost"
            onClick={onCancel}
            disabled={busy}
          >
            {L ? 'Annuler' : 'Cancel'}
          </button>
          <button
            type="button"
            className="btn danger grow"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy
              ? L
                ? 'Révocation…'
                : 'Revoking…'
              : L
                ? 'Révoquer'
                : 'Revoke'}
          </button>
        </div>
      </div>
    </div>
  );
}
