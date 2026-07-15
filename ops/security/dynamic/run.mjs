#!/usr/bin/env node
// ops/security/dynamic/run.mjs — bring target up, run in-scope probe specs via
// Playwright, tear down. Exit 5 on any probe failure (dynamic block-tier).
import { execFileSync, spawnSync } from 'node:child_process';
const full = process.argv.includes('--full');
// In diff mode, scan.sh passes the resolved CHECKS via SEC_CHECKS (newline list).
const checks = (process.env.SEC_CHECKS ?? '').split('\n').filter(Boolean);
const wants = (c) => full || checks.includes(c);
const specs = [];
// Check names must match routes.yml's emitted vector ids (app-rate-limit,
// app-authz-idor) — otherwise diff-scoped (--since) runs never select any probe.
if (wants('app-rate-limit')) specs.push('probes/rate-limit.spec.ts');
if (wants('app-authz-idor')) specs.push('probes/idor.spec.ts', 'probes/authz.spec.ts');
if (specs.length === 0) { console.log('no dynamic probes in scope'); process.exit(0); }

let base;
try {
  const out = execFileSync('ops/security/dynamic/target.sh', ['up'], { encoding: 'utf8' });
  base = (out.match(/BASE_URL=(\S+)/) ?? [])[1];
  if (!base) throw new Error('no BASE_URL from target');
  const r = spawnSync('npx', ['playwright', 'test', '--config', 'ops/security/dynamic/playwright.config.ts', ...specs],
    { stdio: 'inherit', env: { ...process.env, SEC_BASE_URL: base } });
  process.exitCode = r.status === 0 ? 0 : 5;   // 5 = dynamic block-tier failure
} finally {
  try { execFileSync('ops/security/dynamic/target.sh', ['down'], { stdio: 'ignore' }); } catch {}
}
