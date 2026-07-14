// Filter block-tier findings through security-waivers.yml. A finding whose
// `fingerprint` matches an unexpired waiver is moved to `waived`.
export function applyWaivers(findings, waivers, now = new Date()) {
  const active = new Map();
  for (const w of waivers ?? []) {
    if (w.fingerprint && w.expires && new Date(w.expires) >= now) active.set(w.fingerprint, w);
  }
  const blocked = [], waived = [];
  for (const f of findings) {
    if (active.has(f.fingerprint)) waived.push({ ...f, waiver: active.get(f.fingerprint) });
    else blocked.push(f);
  }
  return { blocked, waived };
}
