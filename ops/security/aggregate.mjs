// Read whichever tool JSON reports exist under .security/raw/, normalize, apply
// security-waivers.yml, print a human report to stdout, exit 1 iff a non-waived
// block-tier finding remains. Used by scan.sh after the tools run.
import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';
import { normalizeGitleaks, normalizeSemgrep, normalizeOsv, normalizeTrivy, isBlockTier } from './findings.mjs';
import { applyWaivers } from './waivers.mjs';

const raw = '.security/raw';
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const gitleaksRaw = readJson(`${raw}/gitleaks.json`);
const semgrepRaw = readJson(`${raw}/semgrep.json`);
const osvRaw = readJson(`${raw}/osv.json`);
const trivyRaw = readJson(`${raw}/trivy.json`);
const findings = [
  ...(gitleaksRaw ? normalizeGitleaks(gitleaksRaw) : []),
  ...(semgrepRaw ? normalizeSemgrep(semgrepRaw) : []),
  ...(osvRaw ? normalizeOsv(osvRaw) : []),
  ...(trivyRaw ? normalizeTrivy(trivyRaw) : []),
];
const waiversDoc = existsSync('security-waivers.yml') ? parse(readFileSync('security-waivers.yml', 'utf8')) : {};
const blockers = findings.filter(isBlockTier);
const { blocked, waived } = applyWaivers(blockers, waiversDoc?.waivers ?? []);
const advisory = findings.filter((f) => !isBlockTier(f));

for (const f of blocked) console.log(`- BLOCK  ${f.fingerprint} — ${f.title}`);
for (const f of waived) console.log(`- waived ${f.fingerprint} (by ${f.waiver.approver}, expires ${f.waiver.expires})`);
for (const f of advisory) console.log(`- note   ${f.fingerprint} — ${f.title}`);
console.log(`\nSTATIC: ${blocked.length} blocking, ${waived.length} waived, ${advisory.length} advisory`);
process.exit(blocked.length > 0 ? 1 : 0);
