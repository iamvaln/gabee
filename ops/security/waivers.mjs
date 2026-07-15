// A waiver only suppresses a finding if it is fully accountable: a fingerprint,
// an unexpired `expires`, AND a non-empty `reason` and `approver`. A waiver
// missing reason/approver is IGNORED (the finding stays blocked) — so you can't
// silently wave a security finding through without recording who and why.
export function isAccountableWaiver(w, now = new Date()) {
  return !!(
    w &&
    typeof w.fingerprint === 'string' && w.fingerprint.trim() &&
    w.expires && new Date(w.expires) >= now &&
    typeof w.reason === 'string' && w.reason.trim() &&
    typeof w.approver === 'string' && w.approver.trim()
  );
}

// Filter block-tier findings through security-waivers.yml. A finding whose
// `fingerprint` matches an accountable, unexpired waiver is moved to `waived`.
export function applyWaivers(findings, waivers, now = new Date()) {
  const active = new Map();
  for (const w of waivers ?? []) {
    if (isAccountableWaiver(w, now)) active.set(w.fingerprint, w);
  }
  const blocked = [], waived = [];
  for (const f of findings) {
    if (active.has(f.fingerprint)) waived.push({ ...f, waiver: active.get(f.fingerprint) });
    else blocked.push(f);
  }
  return { blocked, waived };
}
