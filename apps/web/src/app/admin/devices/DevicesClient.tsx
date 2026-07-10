'use client';

import { Fragment, useRef, useState } from 'react';
import type { Language } from '@gabee/types';
import { AIcon } from '../_shell/icons';

interface DeviceRow {
  id: string;
  deviceId: string;
  deviceLinkId: string | null;
  os: string | null;
  osVersion: string | null;
  browser: string | null;
  browserVersion: string | null;
  deviceType: string | null;
  deviceModel: string | null;
  screenW: number | null;
  screenH: number | null;
  tz: string | null;
  locale: string | null;
  appVersion: string | null;
  pwaStandalone: boolean | null;
  lastSeen: string;
  firstSeen: string;
  parent: { email: string };
}

interface Sighting {
  ip: string;
  uaFull: string | null;
  seenAt: string;
}

function fmtDateTime(iso: string, lang: Language): string {
  return new Date(iso).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function verPart(name: string | null, version: string | null): string {
  if (!name) return '—';
  return version ? `${name} ${version}` : name;
}

export function DevicesClient({
  devices,
  isSuperAdmin,
  lang,
}: {
  devices: DeviceRow[];
  isSuperAdmin: boolean;
  lang: Language;
}) {
  const L = lang === 'fr';
  const [openId, setOpenId] = useState<string | null>(null);
  const [sightings, setSightings] = useState<Sighting[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Monotonic request token: every toggle bumps it, so a slow /sightings
  // response for a previously-open device can never setSightings after a
  // different (or no) device is open — prevents IP/UA misattribution.
  const reqSeq = useRef(0);

  const toggle = async (deviceId: string) => {
    if (openId === deviceId) {
      // Collapse: invalidate any in-flight fetch so its late response no-ops.
      reqSeq.current++;
      setOpenId(null);
      setSightings(null);
      setError(null);
      setLoading(false);
      return;
    }
    // Opening a (different) row invalidates any in-flight fetch for the last one.
    const myReq = ++reqSeq.current;
    setOpenId(deviceId);
    setSightings(null);
    setError(null);
    if (!isSuperAdmin) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/devices/${deviceId}/sightings`);
      if (reqSeq.current !== myReq) return; // superseded — drop this response
      if (!res.ok) {
        setError(L ? 'Impossible de charger l’historique IP.' : 'Could not load IP history.');
        return;
      }
      const data = (await res.json()) as Sighting[];
      if (reqSeq.current !== myReq) return; // superseded after body parse
      setSightings(data);
    } catch {
      if (reqSeq.current !== myReq) return; // superseded — drop this error
      setError(L ? 'Impossible de charger l’historique IP.' : 'Could not load IP history.');
    } finally {
      if (reqSeq.current === myReq) setLoading(false);
    }
  };

  return (
    <div className="card tbl-wrap mt8">
      <table className="tbl">
        <thead>
          <tr>
            <th>{L ? 'Parent' : 'Parent'}</th>
            <th>{L ? 'OS' : 'OS'}</th>
            <th>{L ? 'Navigateur' : 'Browser'}</th>
            <th>{L ? 'Type' : 'Type'}</th>
            <th>{L ? 'Modèle' : 'Model'}</th>
            <th>{L ? 'Écran' : 'Screen'}</th>
            <th>{L ? 'Fuseau' : 'Timezone'}</th>
            <th>{L ? 'Version app' : 'App version'}</th>
            <th>{L ? 'Jumelé' : 'Paired'}</th>
            <th>{L ? 'Vu pour la dernière fois' : 'Last seen'}</th>
            <th aria-hidden />
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => {
            const open = openId === d.deviceId;
            return (
              <Fragment key={d.id}>
                <tr
                  className="clickable"
                  onClick={() => toggle(d.deviceId)}
                  style={open ? { background: 'var(--surface-2)' } : {}}
                >
                  <td className="t-sub">{d.parent.email}</td>
                  <td className="t-main">{verPart(d.os, d.osVersion)}</td>
                  <td className="t-main">{verPart(d.browser, d.browserVersion)}</td>
                  <td className="t-sub">{d.deviceType ?? '—'}</td>
                  <td className="t-sub">{d.deviceModel ?? '—'}</td>
                  <td className="t-mono t-sub">{d.screenW && d.screenH ? `${d.screenW}×${d.screenH}` : '—'}</td>
                  <td className="t-sub">{d.tz ?? '—'}</td>
                  <td className="t-mono t-sub">{d.appVersion ?? '—'}</td>
                  <td>{d.deviceLinkId ? <AIcon name="check" size={15} /> : '—'}</td>
                  <td className="t-sub">{fmtDateTime(d.lastSeen, lang)}</td>
                  <td>
                    <AIcon name={open ? 'chevron-down' : 'chevron-right'} size={15} />
                  </td>
                </tr>
                {open && (
                  <tr>
                    <td colSpan={11} style={{ background: 'var(--surface-2)', padding: 0 }}>
                      <div className="card-pad">
                        {!isSuperAdmin && (
                          <p className="hint">
                            {L
                              ? 'Historique des adresses IP réservé aux super-admins.'
                              : 'IP history is restricted to super-admins.'}
                          </p>
                        )}
                        {isSuperAdmin && loading && (
                          <p className="hint">{L ? 'Chargement…' : 'Loading…'}</p>
                        )}
                        {isSuperAdmin && error && <p className="hint">{error}</p>}
                        {isSuperAdmin && sightings && sightings.length === 0 && (
                          <p className="hint">{L ? 'Aucune adresse IP enregistrée.' : 'No IP sightings recorded.'}</p>
                        )}
                        {isSuperAdmin && sightings && sightings.length > 0 && (
                          <table className="tbl">
                            <thead>
                              <tr>
                                <th>{L ? 'Adresse IP' : 'IP address'}</th>
                                <th>{L ? 'User-Agent' : 'User agent'}</th>
                                <th>{L ? 'Vu le' : 'Seen at'}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sightings.map((s, i) => (
                                <tr key={`${s.ip}-${s.seenAt}-${i}`}>
                                  <td className="t-mono t-main">{s.ip}</td>
                                  <td className="t-sub" style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {s.uaFull ?? '—'}
                                  </td>
                                  <td className="t-sub">{fmtDateTime(s.seenAt, lang)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <div className="tbl-foot">
        <span>{L ? `${devices.length} appareils` : `${devices.length} devices`}</span>
      </div>
    </div>
  );
}
