#!/usr/bin/env bash
# Diff-scoped (default) or --full security scan: Semgrep + gitleaks + osv-scanner
# + Trivy, filtered through security-waivers.yml, tiered exit. Writes a report to
# .security/report.md. Tools invoked via their binaries / npx; a missing tool is
# LOGGED (never silently skipped) and fails the run under --strict (CI passes it).
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT" || { echo "cannot cd to repo root" >&2; exit 2; }
SINCE=""; FULL=0; STRICT=0
while [ $# -gt 0 ]; do case "$1" in
  --since) SINCE="${2:?--since needs a value}"; shift 2;;
  --full) FULL=1; shift;;
  --strict) STRICT=1; shift;;
  *) echo "unknown arg: $1" >&2; exit 2;;
esac; done
[ -z "$SINCE" ] && SINCE="$(git describe --tags --match 'v*' --abbrev=0 2>/dev/null || echo '')"
mkdir -p .security; REPORT=.security/report.md; : > "$REPORT"
BLOCK=0; MISSING=""

have() { command -v "$1" >/dev/null 2>&1; }
note() { echo "$*" | tee -a "$REPORT"; }

# Resolve the in-scope checks. A resolver FAILURE (bad ref, missing dep, malformed
# routes.yml) must NEVER collapse to an empty scan that then reports PASS — a gate
# that goes green when it can't determine scope is worse than no gate. So we fail
# hard (exit 4) on a nonzero resolver exit OR empty output. Output can't legitimately
# be empty: routes.always always seeds gitleaks+osv, so "" means the resolver broke.
if [ "$FULL" -eq 1 ] || [ -z "$SINCE" ]; then
  CHECKS="$(node -e "const y=require('yaml'); const r=y.parse(require('fs').readFileSync('ops/security/routes.yml','utf8')); const all=new Set(r.always); r.routes.forEach(x=>x.checks.forEach(c=>all.add(c))); console.log([...all].join('\n'))")" \
    || { echo "FATAL: route enumeration failed — refusing to report PASS" >&2; exit 4; }
  SCOPE_LABEL="FULL"
else
  CHECKS="$(node ops/security/scope.mjs "$SINCE")" \
    || { echo "FATAL: scope resolution failed for ref '$SINCE' — refusing to report PASS" >&2; exit 4; }
  SCOPE_LABEL="since $SINCE"
fi
[ -n "$CHECKS" ] || { echo "FATAL: resolver returned no checks — refusing to report PASS" >&2; exit 4; }
note "# Security scan — $SCOPE_LABEL"
runs() { echo "$CHECKS" | grep -qx "$1"; }

# ── gitleaks (always) — secrets, block tier ──
# Build the diff-scoping flag as an array element (not an unquoted $(...) that
# word-splits): $SINCE stays a single argv token, so a ref with spaces/metachars
# can't split into extra git options — it just fails the ref lookup (fail-closed).
GITLEAKS_SCOPE=()
[ "$FULL" -eq 0 ] && [ -n "$SINCE" ] && GITLEAKS_SCOPE=("--log-opts=$SINCE..HEAD")
if runs gitleaks; then
  if have gitleaks; then
    gitleaks detect --no-banner --redact -c .gitleaks.toml "${GITLEAKS_SCOPE[@]+"${GITLEAKS_SCOPE[@]}"}" \
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
# ── semgrep (scoped) — SAST, block on ERROR only ──
# `--error` is an exit-code switch (non-zero on ANY reported finding), NOT a
# severity filter — so `--severity ERROR` is required to keep this at the block
# tier. Without it, our advisory WARNING rules + the broad p/* community rulesets
# would fail the gate on every run (a gate that cries wolf blocks every release).
if runs semgrep; then
  if have semgrep; then
    semgrep scan --error --severity ERROR --quiet \
      --config .semgrep/gabee.yml --config p/typescript --config p/nextjs \
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
