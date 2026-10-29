import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const workdir = process.env.E1_STACK_WORKDIR;
assert.ok(workdir?.includes('/scratchpad/rc7-e1-'), 'owned E1 scratch workdir required');
const env = execFileSync('supabase', ['status', '--workdir', workdir, '-o', 'env'], { encoding: 'utf8' });
const values = Object.fromEntries([...env.matchAll(/^([A-Z_]+)="?([^"\n]+)"?$/gm)].map(([, key, value]) => [key, value]));
assert.equal(values.API_URL, 'http://127.0.0.1:58121', 'E1 API only');
assert.ok(values.ANON_KEY && values.JWT_SECRET && values.SERVICE_ROLE_KEY);
const project = 'b0000000-0000-0000-0000-00000000c0d1';
const uid = n => `a0000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const token = (id, role = 'authenticated') => {
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({ sub: id, role, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });
  const message = `${head}.${payload}`;
  return `${message}.${createHmac('sha256', values.JWT_SECRET).update(message).digest('base64url')}`;
};
const path = `${project}/${randomUUID()}.pdf`;
const bytes = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
const digest = createHash('sha256').update(bytes).digest('hex');
const url = `${values.API_URL}/storage/v1/object/service-acceptance-paper/${path}`;
const request = (method, bearer, body) => fetch(url, {
  method, headers: { apikey: values.ANON_KEY, Authorization: `Bearer ${bearer}`,
    ...(body ? { 'content-type': 'application/pdf' } : {}) }, body,
});

test('private acceptance-paper bytes round trip for studio, refuse other readers', { timeout: 30000 }, async () => {
  try {
    const upload = await request('POST', token(uid(4)), bytes);
    assert.equal(upload.status, 200, `owner upload: ${upload.status} ${await upload.text()}`);
    for (const [actor, bearer, allowed] of [
      ['owner', token(uid(4)), true], ['admin', token(uid(3)), true],
      ['client', token(uid(5)), false], ['other-studio', token(uid(2)), false],
      ['unlinked', token(uid(10)), false], ['gc', token(uid(11)), false],
      ['maker', token(uid(12)), false], ['supplier', token(uid(13)), false],
      ['anon', values.ANON_KEY, false],
    ]) {
      const download = await request('GET', bearer);
      if (allowed) {
        assert.equal(download.status, 200, `${actor} reads bytes`);
        assert.equal(createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex'), digest,
          `${actor} receives the original SHA-256-bound bytes`);
      } else assert.ok(download.status >= 400 && download.status < 500,
        `${actor} refusal must be 4xx; got ${download.status}`);
    }
  } finally {
    const removed = await request('DELETE', values.SERVICE_ROLE_KEY);
    assert.ok([200, 404].includes(removed.status), `service-role cleanup: ${removed.status}`);
  }
});
