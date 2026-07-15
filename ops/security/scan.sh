#!/usr/bin/env bash
# Diff-scoped (default) or --full security scan: Semgrep + gitleaks + osv-scanner
# + Trivy, filtered through security-waivers.yml, tiered exit. Writes a report to
# .security/report.md. Tools invoked via their binaries / npx; a missing tool is
# LOGGED (never silently skipped) and fails the run under --strict (CI passes it).
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT" || { echo "cannot cd to repo root" >&2; exit 2; }
SINCE=""; FULL=0; STRICT=0; NO_DYNAMIC=0; NO_AI=0
while [ $# -gt 0 ]; do case "$1" in
  --since) SINCE="${2:?--since needs a value}"; shift 2;;
  --full) FULL=1; shift;;
  --strict) STRICT=1; shift;;
  --no-dynamic) NO_DYNAMIC=1; shift;;
  --no-ai) NO_AI=1; shift;;
  *) echo "unknown arg: $1" >&2; exit 2;;
esac; done
[ -z "$SINCE" ] && SINCE="$(git describe --tags --match 'v*' --abbrev=0 2>/dev/null || echo '')"
mkdir -p .security; REPORT=.security/report.md; : > "$REPORT"
MISSING=""

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

rm -rf .security/raw && mkdir -p .security/raw

# Tools we actually invoke (in scope AND present). aggregate.mjs requires each of
# these to have produced parseable evidence — a scanner that runs and FAILS must
# never read as "clean". TOOL_ERR flags an unambiguous error exit; the evidence
# check in aggregate.mjs is the backstop for tools whose exit codes are ambiguous
# (gitleaks uses exit 1 for BOTH "leaks found" and "config error" — only the
# presence of its report distinguishes them).
EXPECTED=""
TOOL_ERR=0

# ── gitleaks (always) — secrets, block tier ──
# Build the diff-scoping flag as an array element (not an unquoted $(...) that
# word-splits): $SINCE stays a single argv token, so a ref with spaces/metachars
# can't split into extra git options — a bad ref then yields an empty report,
# which aggregate.mjs catches as missing evidence rather than silent PASS.
GITLEAKS_SCOPE=()
[ "$FULL" -eq 0 ] && [ -n "$SINCE" ] && GITLEAKS_SCOPE=("--log-opts=$SINCE..HEAD")
if runs gitleaks; then
  if have gitleaks; then
    EXPECTED="$EXPECTED gitleaks"
    gitleaks detect --no-banner --redact -c .gitleaks.toml \
      "${GITLEAKS_SCOPE[@]+"${GITLEAKS_SCOPE[@]}"}" \
      --report-format json --report-path .security/raw/gitleaks.json >/dev/null 2>&1
    rc=$?   # 0=clean, 1=leaks OR error (report presence disambiguates), 2=usage
    note "- gitleaks: ran (exit $rc)"
    [ "$rc" -gt 1 ] && { note "- gitleaks: ERRORED (exit $rc)"; TOOL_ERR=1; }
  else MISSING="$MISSING gitleaks"; fi
fi
# ── osv-scanner (always) — dep CVEs, block on High+ ──
if runs osv; then
  if have osv-scanner; then
    EXPECTED="$EXPECTED osv"
    osv-scanner --lockfile pnpm-lock.yaml --format json --output .security/raw/osv.json >/dev/null 2>&1
    rc=$?   # 0=no vulns, 1=vulns found, >1=error
    note "- osv: ran (exit $rc)"
    [ "$rc" -gt 1 ] && { note "- osv: ERRORED (exit $rc)"; TOOL_ERR=1; }
  else MISSING="$MISSING osv-scanner"; fi
fi
# ── semgrep (scoped) — SAST, block on ERROR only (tier decided by aggregate.mjs) ──
if runs semgrep; then
  if have semgrep; then
    EXPECTED="$EXPECTED semgrep"
    semgrep scan --quiet \
      --config .semgrep/gabee.yml --config p/typescript --config p/nextjs \
      --json --output .security/raw/semgrep.json >/dev/null 2>&1
    rc=$?   # 0=clean, 1=findings, 2=error, 7=invalid/undownloadable config
    note "- semgrep: ran (exit $rc)"
    [ "$rc" -gt 1 ] && { note "- semgrep: ERRORED (exit $rc)"; TOOL_ERR=1; }
  else MISSING="$MISSING semgrep"; fi
fi
# ── trivy (scoped) — image/IaC misconfig, block on Critical/High ──
if runs trivy; then
  if have trivy; then
    EXPECTED="$EXPECTED trivy"
    trivy config --format json --output .security/raw/trivy.json docker-compose.yml >/dev/null 2>&1
    rc=$?   # 0=ok (findings reported in JSON; no --exit-code set), >0=error
    note "- trivy: ran (exit $rc)"
    [ "$rc" -gt 0 ] && { note "- trivy: ERRORED (exit $rc)"; TOOL_ERR=1; }
  else MISSING="$MISSING trivy"; fi
fi

[ -n "$MISSING" ] && note "- MISSING tools:$MISSING (install: brew install $MISSING / npx)"

# A scanner that errored means the gate has a blind spot — fail closed (exit 6),
# regardless of --strict. --strict is about tools that are absent; this is about
# tools that ran and broke, which is strictly worse because it looks like a scan.
if [ "$TOOL_ERR" -eq 1 ]; then
  note ""; note "RESULT: FAIL (a scanner errored — refusing to report PASS)"; exit 6
fi

# Static verdict comes from the per-finding aggregator (waiver-aware). It is told
# which tools we invoked ($EXPECTED) and hard-fails (6) if any of them produced no
# parseable evidence — so a broken scanner can't masquerade as a clean one.
# PIPESTATUS[0] is the aggregator's own code (not tee's) — bash 3.2 supports it.
SEC_EXPECTED_TOOLS="$EXPECTED" node ops/security/aggregate.mjs | tee -a "$REPORT"
AGG_RC=${PIPESTATUS[0]}
case "$AGG_RC" in
  0) STATIC_BLOCK=0;;
  6) note ""; note "RESULT: FAIL (scanner evidence missing/invalid — refusing to report PASS)"; exit 6;;
  *) STATIC_BLOCK=1;;
esac

# Short-circuit: once the static tier blocks, the release is already stopped —
# don't pay a ~2-min Docker build and a 120s claude call to elaborate on it.
if [ "$STATIC_BLOCK" -eq 1 ]; then note ""; note "RESULT: BLOCK (see $REPORT)"; exit 1; fi

# ── dynamic probes (LOCAL ONLY — needs Docker + a live throwaway target) ──
# Skipped in CI (no target) and skippable with --no-dynamic. A failing authz/
# IDOR/rate-limit probe is block-tier → exit 5.
DYN_BLOCK=0
if [ "${NO_DYNAMIC:-0}" -eq 0 ] && { echo "$CHECKS" | grep -qxE 'app-rate-limit|app-authz-idor' || [ "$FULL" -eq 1 ]; }; then
  if have docker; then
    SEC_CHECKS="$CHECKS" node ops/security/dynamic/run.mjs $( [ "$FULL" -eq 1 ] && echo --full ) \
      && note "- dynamic: probes passed" || { note "- dynamic: PROBE FAILURE (block)"; DYN_BLOCK=1; }
  else note "- dynamic: skipped (docker not available)"; fi
fi

# ── AI threat-review (LOCAL ONLY, advisory — never blocks, never in CI) ──
if [ "${NO_AI:-0}" -eq 0 ]; then
  note "## AI threat-review (advisory)"
  node ops/security/ai-review.mjs "$SINCE" | tee -a "$REPORT" || true
fi

# (static BLOCK already exited above, before the costly dynamic/AI stages)
if [ "$DYN_BLOCK" -eq 1 ]; then note ""; note "RESULT: BLOCK (dynamic)"; exit 5; fi
if [ -n "$MISSING" ] && [ "$STRICT" -eq 1 ]; then note "RESULT: FAIL (missing tools under --strict)"; exit 3; fi
note ""; note "RESULT: PASS"; exit 0
