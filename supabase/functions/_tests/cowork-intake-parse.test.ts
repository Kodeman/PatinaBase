// Deno test for the Cowork intake bridge's PURE artifact parser.
// Run: deno test --no-check -A supabase/functions/_tests/cowork-intake-parse.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { extractLeahCard, parseArtifact } from '../cowork-intake-bridge/parse-artifact.ts';

const WELL_FORMED = `---
task_type: vendor_qualification
confidence: 0.82
assignee: leah
summary: Acme Co looks promising
---
VERDICT: advance — solid maker.

More body text here.`;

Deno.test('parseArtifact accepts a well-formed header + body', () => {
  const r = parseArtifact(WELL_FORMED);
  assert(r.ok, r.error);
  assertEquals(r.fields.task_type, 'vendor_qualification');
  assertEquals(r.fields.confidence, 0.82);
  assertEquals(r.fields.assignee, 'leah');
  assertEquals(r.fields.summary, 'Acme Co looks promising');
  assert(r.bodyExcerpt.startsWith('VERDICT: advance'));
});

Deno.test('parseArtifact tolerates CRLF line endings', () => {
  const r = parseArtifact(WELL_FORMED.replace(/\n/g, '\r\n'));
  assert(r.ok, r.error);
  assertEquals(r.fields.assignee, 'leah');
});

Deno.test('parseArtifact tolerates a UTF-8 BOM and quoted values', () => {
  const r = parseArtifact(
    '﻿---\ntask_type: "designer_scout_dossier"\nconfidence: 0.9\nassignee: \'kody\'\nsummary: hi\n---\nbody',
  );
  assert(r.ok, r.error);
  assertEquals(r.fields.task_type, 'designer_scout_dossier');
  assertEquals(r.fields.assignee, 'kody');
});

Deno.test('parseArtifact fails a missing task_type (empty slug)', () => {
  const r = parseArtifact('---\nconfidence: 0.9\nassignee: kody\nsummary: x\n---\nbody');
  assert(!r.ok);
  assert(r.error!.includes('task_type'));
});

Deno.test('parseArtifact fails a non-slug task_type', () => {
  const r = parseArtifact('---\ntask_type: Vendor Qualification!\nconfidence: 0.5\nassignee: kody\nsummary: x\n---\n');
  assert(!r.ok);
  assert(r.error!.includes('task_type'));
});

Deno.test('parseArtifact fails confidence out of [0,1]', () => {
  const over = parseArtifact('---\ntask_type: vendor_qualification\nconfidence: 1.4\nassignee: kody\nsummary: x\n---\n');
  assert(!over.ok);
  assert(over.error!.includes('confidence'));

  const nan = parseArtifact('---\ntask_type: vendor_qualification\nconfidence: high\nassignee: kody\nsummary: x\n---\n');
  assert(!nan.ok);
  assert(nan.error!.includes('confidence'));
});

Deno.test('parseArtifact fails a bad assignee', () => {
  const r = parseArtifact('---\ntask_type: vendor_qualification\nconfidence: 0.7\nassignee: dave\nsummary: x\n---\n');
  assert(!r.ok);
  assert(r.error!.includes('assignee'));
});

Deno.test('parseArtifact fails when there is no leading fence', () => {
  const r = parseArtifact('task_type: vendor_qualification\nconfidence: 0.7\nassignee: kody\n');
  assert(!r.ok);
  assert(r.error!.includes('fence'));
  // still returns a body excerpt so the intake_error task carries evidence
  assert(r.bodyExcerpt.length > 0);
});

Deno.test('parseArtifact fails on binary junk (no fence)', () => {
  const junk = String.fromCharCode(0, 1, 2, 3, 255, 254) + 'PKbinary';
  const r = parseArtifact(junk);
  assert(!r.ok);
  assert(r.error!.includes('fence'));
});

Deno.test('parseArtifact fails an unterminated fence', () => {
  const r = parseArtifact('---\ntask_type: vendor_qualification\nconfidence: 0.7\nassignee: kody\n');
  assert(!r.ok);
  assert(r.error!.includes('unterminated'));
});

Deno.test('parseArtifact caps the body excerpt at 2000 chars', () => {
  const big = '---\ntask_type: content\nconfidence: 0.9\nassignee: kody\nsummary: s\n---\n' + 'x'.repeat(5000);
  const r = parseArtifact(big);
  assert(r.ok, r.error);
  assertEquals(r.bodyExcerpt.length, 2000);
});

Deno.test('parseArtifact extracts a Leah card from a vendor_qualification body', () => {
  const r = parseArtifact(`---
task_type: vendor_qualification
confidence: 0.8
assignee: leah
summary: Acme
---
VERDICT: advance

LEAH CARD
- ![chair](https://img.example.com/chair.jpg)
- Solid oak, no veneer
- Hand-turned in Ohio since 1904

GAPS & QUESTIONS
- what about lead times?`);
  assert(r.ok, r.error);
  assert(r.leahCard, 'expected a leah card');
  assertEquals(r.leahCard!.images, ['https://img.example.com/chair.jpg']);
  assert(r.leahCard!.bullets.includes('Solid oak, no veneer'));
  assert(r.leahCard!.story && r.leahCard!.story.includes('1904'));
});

Deno.test('extractLeahCard returns undefined without a marker', () => {
  assertEquals(extractLeahCard('just a plain body, no card here'), undefined);
});

Deno.test('parseArtifact does not attach a Leah card for non-vendor task types', () => {
  const r = parseArtifact(`---
task_type: designer_scout_dossier
confidence: 0.8
assignee: kody
summary: s
---
LEAH CARD
- ![x](https://img/x.jpg)`);
  assert(r.ok, r.error);
  assertEquals(r.leahCard, undefined);
});
