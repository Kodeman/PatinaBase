import fs from 'node:fs';
import { HERE } from './lib.mjs';

const a = JSON.parse(fs.readFileSync(`${HERE}/capture-${process.argv[2]}.json`, 'utf8'));
const b = JSON.parse(fs.readFileSync(`${HERE}/capture-${process.argv[3]}.json`, 'utf8'));
for (const k of Object.keys(a)) {
  if (a[k] === b[k]) {
    console.log(`SAME  ${k}`);
    continue;
  }
  console.log(`DIFF  ${k}  (${a[k].length} -> ${b[k].length})`);
  if (k.endsWith('Text')) {
    const A = a[k].split('\n');
    const B = b[k].split('\n');
    const setB = new Set(B);
    const setA = new Set(A);
    const gone = A.filter((l) => l.trim() && !setB.has(l));
    const added = B.filter((l) => l.trim() && !setA.has(l));
    if (gone.length) console.log('   only in first :', JSON.stringify(gone.slice(0, 25)));
    if (added.length) console.log('   only in second:', JSON.stringify(added.slice(0, 25)));
  }
}
