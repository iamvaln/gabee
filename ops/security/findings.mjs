// Normalize each scanner's JSON into a stable per-finding shape so waivers
// (ops/security/waivers.mjs) can key on `fingerprint`. Fingerprints avoid
// timestamps/absolute paths so a waiver survives until the code itself changes.

const norm = (p) => (p == null ? null : String(p).replace(/\\/g, '/'));

// gitleaks detect --report-format json → top-level array of hits.
export function normalizeGitleaks(json) {
  const arr = Array.isArray(json) ? json : [];
  return arr.map((h) => {
    const file = norm(h.File);
    const rule = h.RuleID ?? 'secret';
    const line = h.StartLine ?? null;
    return { tool: 'gitleaks', fingerprint: `gitleaks:${file}:${rule}:${line}`,
      severity: 'BLOCK', title: `secret: ${rule}`, file, line };
  });
}

// semgrep --json → { results: [{ check_id, path, start.line, extra.severity }] }.
// ERROR blocks; WARNING/INFO are advisory (matches scan.sh's --severity ERROR tier).
export function normalizeSemgrep(json) {
  const results = json?.results ?? [];
  return results.map((r) => {
    const file = norm(r.path);
    const line = r.start?.line ?? null;
    const sev = String(r.extra?.severity ?? '').toUpperCase();
    return { tool: 'semgrep', fingerprint: `semgrep:${r.check_id}:${file}:${line}`,
      severity: sev === 'ERROR' ? 'BLOCK' : 'ADVISORY',
      title: r.extra?.message ?? r.check_id, file, line };
  });
}

// osv-scanner --format json → { results:[{ packages:[{ package.name, vulnerabilities:[{id, database_specific.severity}] }] }] }.
// Block on High/Critical; lower or unscored → advisory.
export function normalizeOsv(json) {
  const out = [];
  for (const res of json?.results ?? [])
    for (const pkg of res.packages ?? []) {
      const name = pkg.package?.name ?? 'unknown';
      for (const v of pkg.vulnerabilities ?? []) {
        const sev = String(v.database_specific?.severity ?? '').toUpperCase();
        out.push({ tool: 'osv', fingerprint: `osv:${name}:${v.id}`,
          severity: sev === 'HIGH' || sev === 'CRITICAL' ? 'BLOCK' : 'ADVISORY',
          title: `${name} ${v.id} (${sev || 'unscored'})`, file: 'pnpm-lock.yaml', line: null });
      }
    }
  return out;
}

// trivy config --format json → { Results:[{ Target, Misconfigurations:[{ID, Severity, Title}] }] }.
export function normalizeTrivy(json) {
  const out = [];
  for (const res of json?.Results ?? []) {
    const target = norm(res.Target);
    for (const m of res.Misconfigurations ?? []) {
      const sev = String(m.Severity ?? '').toUpperCase();
      out.push({ tool: 'trivy', fingerprint: `trivy:${target}:${m.ID}`,
        severity: sev === 'HIGH' || sev === 'CRITICAL' ? 'BLOCK' : 'ADVISORY',
        title: m.Title ?? m.ID, file: target, line: null });
    }
  }
  return out;
}

export function isBlockTier(f) { return f?.severity === 'BLOCK'; }
