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
      // Pin the fingerprint to the RESOLVED VERSION. Waivers here are usually
      // reachability claims ("only a dev-time transitive dep") — version-blind
      // fingerprints would keep suppressing the same GHSA after the package
      // becomes a production dep at a vulnerable version. A bump forces re-review.
      const version = pkg.package?.version ?? 'unknown';
      for (const v of pkg.vulnerabilities ?? []) {
        const sev = severityOf(v);
        out.push({ tool: 'osv', fingerprint: `osv:${name}@${version}:${v.id}`,
          severity: sev === 'HIGH' || sev === 'CRITICAL' ? 'BLOCK' : sev ? 'ADVISORY' : 'BLOCK',
          title: `${name}@${version} ${v.id} (${sev || 'UNSCORED — score it or waive it'})`,
          file: 'pnpm-lock.yaml', line: null });
      }
    }
  return out;
}

// Severity for an OSV vuln: GHSA-sourced npm advisories populate
// `database_specific.severity`; fall back to the top-level OSV `severity[]` CVSS
// array. An unscorable vuln returns '' and the caller BLOCKs it — for a gate,
// "we couldn't score this" must get human eyes, not a silent pass.
function severityOf(v) {
  const ds = String(v.database_specific?.severity ?? '').toUpperCase();
  if (ds) return ds;
  const cvss = (v.severity ?? []).find((s) => String(s.score ?? '').length);
  if (!cvss) return '';
  // CVSS v3 base score → qualitative band.
  const m = /\/AV:.*/.test(String(cvss.score)) ? null : Number(cvss.score);
  if (Number.isFinite(m)) return m >= 9 ? 'CRITICAL' : m >= 7 ? 'HIGH' : m >= 4 ? 'MODERATE' : 'LOW';
  return '';
}

// trivy config --format json → { Results:[{ Target, Misconfigurations:[{ID, Severity, Title, CauseMetadata:{StartLine}}] }] }.
export function normalizeTrivy(json) {
  const out = [];
  for (const res of json?.Results ?? []) {
    const target = norm(res.Target);
    for (const m of res.Misconfigurations ?? []) {
      const sev = String(m.Severity ?? '').toUpperCase();
      // Include the line: two services in one compose file can fail the SAME
      // check id — without it they collapse to one fingerprint and waiving one
      // silently waives the other.
      const line = m.CauseMetadata?.StartLine ?? null;
      out.push({ tool: 'trivy', fingerprint: `trivy:${target}:${m.ID}:${line ?? '?'}`,
        severity: sev === 'HIGH' || sev === 'CRITICAL' ? 'BLOCK' : 'ADVISORY',
        title: m.Title ?? m.ID, file: target, line });
    }
  }
  return out;
}

export function isBlockTier(f) { return f?.severity === 'BLOCK'; }
