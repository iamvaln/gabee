// Read the tool JSON reports under .security/raw/, normalize, apply
// security-waivers.yml, print a human report to stdout.
// Exit: 0 clean · 1 a non-waived block-tier finding · 6 scanner evidence
// missing/invalid. Used by scan.sh after the tools run.
//
// Why 6 exists: this module is the sole arbiter of the static verdict, but it
// can only see JSON files that exist. A scanner that RUNS and FAILS (semgrep's
// p/* registry configs are fetched over the network — offline or a renamed
// ruleset makes it write valid JSON with results:[], a populated errors[], and
// paths.scanned:0, having scanned NOTHING; a malformed .gitleaks.toml makes
// gitleaks exit 1 and write no report at all) would otherwise be
// indistinguishable from "clean" and report PASS. So scan.sh tells us which
// tools it actually invoked via SEC_EXPECTED_TOOLS, and every one of them MUST
// produce parseable evidence that it really scanned something. A gate that goes
// green because its scanner broke is worse than no gate.
import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';
import { normalizeGitleaks, normalizeSemgrep, normalizeOsv, normalizeTrivy, isBlockTier } from './findings.mjs';
import { applyWaivers } from './waivers.mjs';

const raw = '.security/raw';
const FILES = { gitleaks: 'gitleaks.json', semgrep: 'semgrep.json', osv: 'osv.json', trivy: 'trivy.json' };

function fatal(msg) {
  console.error(`FATAL: ${msg} — refusing to report PASS`);
  process.exit(6);
}

// Tools scan.sh actually invoked (in scope AND present on PATH).
const expected = (process.env.SEC_EXPECTED_TOOLS ?? '')
  .split(/[\s,]+/)
  .map((s) => s.trim())
  .filter(Boolean);

const parsed = {};
for (const tool of expected) {
  const file = FILES[tool];
  if (!file) fatal(`unknown expected tool '${tool}'`);
  const path = `${raw}/${file}`;
  // gitleaks writes `[]` when clean, semgrep/osv/trivy write a JSON envelope —
  // so a MISSING file from a tool we invoked means it errored, not that it was clean.
  if (!existsSync(path)) fatal(`${tool} ran but produced no ${file} (it errored)`);
  try {
    parsed[tool] = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fatal(`${tool}'s ${file} is unparseable (${String(e.message).split('\n')[0]})`);
  }
}

// Semgrep can exit "successfully" having scanned nothing: a config it couldn't
// download lands in errors[] as level:'error' and leaves paths.scanned empty with
// results:[] — that must never read as clean. But semgrep ALSO reports routine
// per-file parse failures as level:'warn' (type PartialParsing) while scanning
// everything else fine; fataling on those would block every scan (a gate that
// cries wolf is as useless as no gate). So: fatal only on level:'error' or a
// genuinely empty scan; surface warns as visible blind spots.
const semgrepBlindSpots = [];
if (parsed.semgrep) {
  const errs = parsed.semgrep.errors ?? [];
  const fatalErrs = errs.filter((e) => e.level === 'error');
  if (fatalErrs.length) {
    fatal(`semgrep reported ${fatalErrs.length} fatal error(s): ${String(fatalErrs[0]?.message ?? '').split('\n')[0].slice(0, 120)}`);
  }
  if ((parsed.semgrep.paths?.scanned ?? []).length === 0) fatal('semgrep scanned 0 files');
  for (const w of errs) {
    semgrepBlindSpots.push(`- note   semgrep:unparsed:${w.path ?? '?'} — semgrep could not parse this file (${String(w.message ?? '').split('\n')[0].slice(0, 80)})`);
  }
}

const findings = [
  ...(parsed.gitleaks ? normalizeGitleaks(parsed.gitleaks) : []),
  ...(parsed.semgrep ? normalizeSemgrep(parsed.semgrep) : []),
  ...(parsed.osv ? normalizeOsv(parsed.osv) : []),
  ...(parsed.trivy ? normalizeTrivy(parsed.trivy) : []),
];

const waiversDoc = existsSync('security-waivers.yml') ? parse(readFileSync('security-waivers.yml', 'utf8')) : {};
const blockers = findings.filter(isBlockTier);
const { blocked, waived } = applyWaivers(blockers, waiversDoc?.waivers ?? []);
const advisory = findings.filter((f) => !isBlockTier(f));

for (const f of blocked) console.log(`- BLOCK  ${f.fingerprint} — ${f.title}`);
for (const f of waived) console.log(`- waived ${f.fingerprint} (by ${f.waiver.approver}, expires ${f.waiver.expires})`);
for (const f of advisory) console.log(`- note   ${f.fingerprint} — ${f.title}`);
for (const line of semgrepBlindSpots) console.log(line);
console.log(`\nSTATIC: ${blocked.length} blocking, ${waived.length} waived, ${advisory.length} advisory`);
process.exit(blocked.length > 0 ? 1 : 0);
