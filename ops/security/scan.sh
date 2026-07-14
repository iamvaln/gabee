#!/usr/bin/env bash
# Diff-scoped (default) or --full security scan: Semgrep + gitleaks + osv-scanner
# + Trivy, filtered through security-waivers.yml, tiered exit. Writes a report to
# .security/report.md. Tools invoked via their binaries / npx; a missing tool is
# LOGGED (never silently skipped) and fails the run under --strict (CI passes it).
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
SINCE=""; FULL=0; STRICT=0
while [ $# -gt 0 ]; do case "$1" in
  --since) SINCE="$2"; shift 2;;
  --full) FULL=1; shift;;
  --strict) STRICT=1; shift;;
  *) echo "unknown arg: $1" >&2; exit 2;;
esac; done
[ -z "$SINCE" ] && SINCE="$(git describe --tags --match 'v*' --abbrev=0 2>/dev/null || echo '')"
mkdir -p .security; REPORT=.security/report.md; : > "$REPORT"
BLOCK=0; MISSING=""

have() { command -v "$1" >/dev/null 2>&1; }
note() { echo "$*" | tee -a "$REPORT"; }

if [ "$FULL" -eq 1 ] || [ -z "$SINCE" ]; then
  CHECKS="$(node -e "const s=require('./ops/security/scope.mjs'); const y=require('yaml'); const r=y.parse(require('fs').readFileSync('ops/security/routes.yml','utf8')); const all=new Set(r.always); r.routes.forEach(x=>x.checks.forEach(c=>all.add(c))); console.log([...all].join('\n'))" 2>/dev/null)"
  note "# Security scan — FULL"
else
  CHECKS="$(node ops/security/scope.mjs "$SINCE")"
  note "# Security scan — since $SINCE"
fi
runs() { echo "$CHECKS" | grep -qx "$1"; }

# ── gitleaks (always) — secrets, block tier ──
if runs gitleaks; then
  if have gitleaks; then
    gitleaks detect --no-banner --redact -c .gitleaks.toml \
      $( [ "$FULL" -eq 0 ] && [ -n "$SINCE" ] && echo "--log-opts=$SINCE..HEAD" ) \
      && note "- gitleaks: clean" || { note "- gitleaks: FINDINGS (block)"; BLOCK=1; }
  else MISSING="$MISSING gitleaks"; fi
fi
# ── osv-scanner (always) — dep CVEs, block on High+ ──
if runs osv; then
  if have osv-scanner; then
    osv-scanner --lockfile pnpm-lock.yaml >/dev/null 2>&1 \
      && note "- osv: clean" || { note "- osv: VULN (review; block if High+)"; BLOCK=1; }
  else MISSING="$MISSING osv-scanner"; fi
fi
# ── semgrep (scoped) — SAST, block on ERROR ──
if runs semgrep; then
  if have semgrep; then
    semgrep --error --quiet --config .semgrep/gabee.yml --config p/typescript --config p/nextjs \
      && note "- semgrep: clean (no ERROR)" || { note "- semgrep: ERROR findings (block)"; BLOCK=1; }
  else MISSING="$MISSING semgrep"; fi
fi
# ── trivy (scoped) — image/IaC misconfig, block on Critical/High ──
if runs trivy; then
  if have trivy; then
    trivy config --exit-code 1 --severity CRITICAL,HIGH docker-compose.yml \
      && note "- trivy(config): clean" || { note "- trivy(config): misconfig (block)"; BLOCK=1; }
  else MISSING="$MISSING trivy"; fi
fi

[ -n "$MISSING" ] && note "- MISSING tools:$MISSING (install: brew install $MISSING / npx)"
# Waivers: (block-tier findings are hand-fingerprinted into security-waivers.yml;
# the current tool wiring reports pass/fail per tool — the fingerprint-level
# waiver application is exercised in Plan 2 when per-finding JSON is parsed.)

if [ "$BLOCK" -eq 1 ]; then note ""; note "RESULT: BLOCK (see $REPORT)"; exit 1; fi
if [ -n "$MISSING" ] && [ "$STRICT" -eq 1 ]; then note "RESULT: FAIL (missing tools under --strict)"; exit 3; fi
note ""; note "RESULT: PASS"; exit 0
