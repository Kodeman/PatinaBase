import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');

test('completion callbacks are exact-body HMAC signed and reject non-2xx responses', () => {
  const callback = source.slice(
    source.indexOf('async function reportCompletion'),
    source.indexOf('export default'),
  );

  assert.match(callback, /crypto\.subtle\.sign/);
  assert.match(callback, /`\$\{timestamp\}\.\$\{body\}`/);
  assert.match(callback, /'x-patina-timestamp': timestamp/);
  assert.match(callback, /'x-patina-signature': `v1=\$\{signature\}`/);
  assert.match(callback, /if \(!response\.ok\) throw new Error/);
  assert.doesNotMatch(callback, /\.catch\(\(\) => \{\}\)/);
});

test('the queue acknowledges success only after the signed callback succeeds', () => {
  const queue = source.slice(source.indexOf('async queue('));
  const completion = queue.indexOf("await reportCompletion(env, job, 'SUCCEEDED', result)");
  const acknowledgement = queue.indexOf('message.ack()', completion);
  const retry = queue.indexOf('message.retry()', completion);

  assert.ok(completion >= 0);
  assert.ok(acknowledgement > completion);
  assert.ok(retry > completion);
});
