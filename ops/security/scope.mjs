#!/usr/bin/env node
// Resolve which security checks a change set needs, from routes.yml. Pure
// `resolveChecks` (tested) + a CLI: `node scope.mjs <ref>` prints the checks for
// `git diff --name-only <ref>..HEAD`. `gitleaks`+`osv` always run.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from 'yaml';

export function resolveChecks(changedPaths, routes) {
  const checks = new Set(routes.always ?? []);
  for (const p of changedPaths) {
    for (const r of routes.routes ?? []) {
      if (p.includes(r.glob)) for (const c of r.checks) checks.add(c);
    }
  }
  return { checks, always: routes.always ?? [] };
}

export function loadRoutes(dir) {
  return parse(readFileSync(join(dir, 'routes.yml'), 'utf8'));
}

// CLI
if (process.argv[1] && process.argv[1].endsWith('scope.mjs')) {
  const dir = dirname(fileURLToPath(import.meta.url));
  const ref = process.argv[2] || '';
  const range = ref ? `${ref}..HEAD` : 'HEAD';
  const out = execFileSync('git', ['diff', '--name-only', range], { encoding: 'utf8' });
  const changed = out.split('\n').filter(Boolean);
  const { checks } = resolveChecks(changed, loadRoutes(dir));
  process.stdout.write([...checks].sort().join('\n') + '\n');
}
