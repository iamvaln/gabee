import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { QuestionRecordSchema } from '@gabee/types';
const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, 'seed-data');
const files = ['numbers','words','keyboard','code','translation'];
let total=0, ok=0;
for (const f of files) {
  const data = JSON.parse(readFileSync(join(dir, `${f}.json`),'utf8')).questions;
  let fok=0; const samples:string[]=[];
  for (const q of data) {
    total++;
    const r = QuestionRecordSchema.safeParse(q);
    if (r.success) { ok++; fok++; }
    else if (samples.length<3) samples.push(`${q.id}: ${r.error.issues.slice(0,2).map(i=>`${i.path.join('.')||'(root)'} ${i.message}`).join(' | ')}`);
  }
  console.log(`${f}: ${fok}/${data.length}` + (fok<data.length ? '  <-- INVALID' : ''));
  for (const s of samples) console.log('   ', s);
}
console.log(`\nTOTAL: ${ok}/${total}`);
