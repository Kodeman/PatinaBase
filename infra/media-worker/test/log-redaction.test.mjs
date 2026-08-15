import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('queue logs cannot include job, asset, storage, result, or error details', async () => {
  const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  const queueSource = source.slice(source.indexOf('async queue('));
  const consoleArguments = [...queueSource.matchAll(/console\.(?:log|error)\((.*?)\);/gs)].map(
    (match) => match[1],
  );

  assert.equal(consoleArguments.length, 3);
  for (const args of consoleArguments) {
    assert.doesNotMatch(args, /\$\{|JSON\.stringify|\b(?:jobId|assetId|rawKey|result|err)\b/);
    assert.doesNotMatch(args, /,\s*(?:job|message|result|err)\b/);
  }
});
