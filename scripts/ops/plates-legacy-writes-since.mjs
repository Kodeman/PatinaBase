#!/usr/bin/env node
// Read-only R2 audit. Uses the existing media service's S3 dependency.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const HELP = `Usage: node scripts/ops/plates-legacy-writes-since.mjs --since <UTC ISO timestamp>

Lists every plates/ page using S3 ListObjectsV2; prints offending {key, uploaded,
projectId, sha256} JSON lines. Excludes f/<rev>/ objects and sha-level originals.
Exit 0: complete listing, no hits; 1: hits; 2: invalid input or incomplete audit.
No PUT, DELETE, or automatic repair. --help needs no credentials or dependencies.

Environment (existing R2 S3 credentials; prefer bucket-scoped Object Read only):
  R2_ACCOUNT_ID          Cloudflare account ID (32 hex)
  R2_ACCESS_KEY_ID       S3 access key ID
  R2_SECRET_ACCESS_KEY   S3 secret access key
  R2_BUCKET_PLATES       Optional; defaults to patina-plates
Dependency: @aws-sdk/client-s3 from services/media (pnpm install --frozen-lockfile).
`;

export function sinceTimestamp(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value ?? '')) {
    throw new Error('--since must be a UTC ISO timestamp ending in Z');
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 19) !== value.slice(0, 19) || ms > Date.now()) {
    throw new Error('invalid or future --since');
  }
  // S3 LastModified has second precision. Include the whole deploy second.
  return Math.floor(ms / 1000) * 1000;
}

export function isLegacyKey(key) {
  return key.startsWith('plates/') &&
    !/^plates\/[^/]+\/[^/]+\/f\/[^/]+\//.test(key) &&
    !/^plates\/[^/]+\/[a-f0-9]{64}\/original\.[a-z0-9]{2,5}$/.test(key);
}

export async function scanLegacyWrites(listPage, since, report) {
  let token;
  let hits = 0;
  let scanned = 0;
  const seen = new Set();
  do {
    const page = await listPage(token);
    if (typeof page.IsTruncated !== 'boolean') throw new Error('incomplete listing: missing IsTruncated');
    for (const object of page.Contents ?? []) {
      const uploaded = new Date(object.LastModified).getTime();
      if (typeof object.Key !== 'string' || !object.LastModified || !Number.isFinite(uploaded)) {
        throw new Error('listing returned an object without a key or valid LastModified');
      }
      scanned++;
      if (!isLegacyKey(object.Key) || uploaded < since) continue;
      const [, projectId, sha256] = object.Key.split('/');
      report({ key: object.Key, uploaded: new Date(uploaded).toISOString(), projectId, sha256 });
      hits++;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
    if (page.IsTruncated && (!token || seen.has(token))) throw new Error('incomplete listing: invalid continuation token');
    seen.add(token);
  } while (token);
  return { scanned, hits };
}

async function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    console.log(HELP);
    return 0;
  }
  if (args.length !== 2 || args[0] !== '--since') throw new Error('expected --since <timestamp>; see --help');
  const since = sinceTimestamp(args[1]);
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!/^[a-f0-9]{32}$/i.test(R2_ACCOUNT_ID ?? '') || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required');
  }
  const require = createRequire(new URL('../../services/media/package.json', import.meta.url));
  const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
  const bucket = process.env.R2_BUCKET_PLATES || 'patina-plates';
  const client = new S3Client({
    region: 'auto', endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    maxAttempts: 2,
  });
  try {
    const result = await scanLegacyWrites((token) => client.send(new ListObjectsV2Command({
      Bucket: bucket, Prefix: 'plates/', MaxKeys: 1000, ContinuationToken: token,
    }), { abortSignal: AbortSignal.timeout(30_000) }), since, (hit) => console.log(JSON.stringify(hit)));
    console.error(JSON.stringify({ bucket, since: new Date(since).toISOString(), ...result, complete: true }));
    return result.hits ? 1 : 0;
  } finally {
    client.destroy();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(`Audit FAILED (not quiet): ${error.message}`);
    process.exitCode = 2;
  });
}
