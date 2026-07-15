// ops/security/ai-review.mjs — advisory, local-only. Reads the diff + threat model,
// asks claude for per-vector risks in the changed code, prints them as advisory notes.
// Missing `claude` CLI or any error → skip (never fail the gate). ALWAYS exits 0.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ref = process.argv[2] || '';

function skip(reason) {
  console.log(`- ai-review: skipped (${reason})`);
  process.exit(0);
}

try {
  execFileSync('claude', ['--version'], { stdio: 'ignore' });
} catch {
  skip('claude CLI not found');
}

try {
  const range = ref ? `${ref}..HEAD` : 'HEAD~1..HEAD';
  const diff = execFileSync('git', ['diff', range, '--'], { encoding: 'utf8' }).slice(0, 60000);
  const model = readFileSync('docs/security/threat-model.md', 'utf8').slice(0, 40000);
  const prompt = `You are a security reviewer. Given this Gabee threat model and a release diff, list ONLY concrete, high-signal risks introduced by the diff, per threat-model vector id. Output STRICT JSON: {"findings":[{"vector":"app-authz-idor","severity":"high|med|low","scenario":"..."}]}. No prose.\n\n# THREAT MODEL\n${model}\n\n# DIFF\n${diff}`;

  let out;
  try {
    out = execFileSync('claude', ['-p', prompt, '--output-format', 'json'], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120000,
    });
  } catch (e) {
    skip(`claude invocation failed: ${String(e.message).split('\n')[0]}`);
  }

  const envelope = JSON.parse(out);
  if (envelope.is_error) {
    skip(`claude reported an error: ${String(envelope.result ?? '').split('\n')[0]}`);
  }

  // The model's answer text lives in `result` and is sometimes fenced as ```json ... ```.
  let text = envelope.result ?? envelope.text ?? out;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced) text = fenced[1];

  const findings = JSON.parse(text).findings ?? [];
  if (findings.length === 0) console.log('- ai-review: no risks flagged');
  for (const f of findings) console.log(`- ai-note [${f.severity}] ${f.vector}: ${f.scenario}`);
} catch (e) {
  skip(String(e.message).split('\n')[0]);
}
process.exit(0); // advisory: never fails the gate
