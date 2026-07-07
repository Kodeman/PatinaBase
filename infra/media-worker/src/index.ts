import { Container, getContainer } from '@cloudflare/containers';

// Job message shape — mirrors the media service's JobPayload + BullMQ job.data.
// The NestJS producer (Milestone 2) sends this to the media-jobs queue instead
// of BullMQ; for now the /enqueue test route below produces it.
interface MediaJob {
  jobId: string;
  assetId: string;
  type: string; // JobType, e.g. IMAGE_PROCESS / IMAGE_TRANSFORM / METADATA_EXTRACT
  priority?: number;
  meta?: { rawKey?: string; operations?: { type: string; params?: Record<string, unknown> }[] };
}

interface RenditionOut {
  key: string;
  contentType: string;
  dataB64: string;
  [k: string]: unknown;
}

interface Env {
  MEDIA_PROCESSOR: DurableObjectNamespace<MediaProcessor>;
  MEDIA_JOBS: Queue<MediaJob>;
  RAW: R2Bucket; // patina-raw
  PROCESSED: R2Bucket; // patina-processed
  // Shared secret required on POST /enqueue (x-enqueue-secret header). The
  // NestJS producer sends it; without it the public route is an open job
  // injector against the prod buckets.
  ENQUEUE_SECRET: string;
  // Optional: NestJS ledger callback (POST {jobId,state,result}). Skipped if unset.
  COMPLETE_CALLBACK_URL?: string;
  COMPLETE_CALLBACK_SECRET?: string;
}

// Job types the container can run today. 3D / snapshot / virus scan are stubs in
// the source service and are not yet ported; they ack without processing.
const CONTAINER_JOB_TYPES = new Set(['IMAGE_PROCESS', 'IMAGE_TRANSFORM', 'METADATA_EXTRACT']);

/**
 * The media processor container: pure Sharp, no credentials. The Worker owns all
 * R2 I/O through its bindings (the account-native view) and passes raw bytes in
 * / gets rendition bytes out.
 */
export class MediaProcessor extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = '15m';
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Read raw from R2 → run in container → write renditions to R2. Returns the
// metadata-bearing result (rendition byte blobs stripped) for the ledger.
async function processJob(env: Env, job: MediaJob): Promise<{ ok: boolean; result: unknown }> {
  const rawKey = job.meta?.rawKey;
  if (!rawKey) return { ok: false, result: { error: 'meta.rawKey required' } };

  const raw = await env.RAW.get(rawKey);
  if (!raw) return { ok: false, result: { error: `raw object not found: ${rawKey}` } };
  const bytes = await raw.arrayBuffer();

  const instance = getContainer(env.MEDIA_PROCESSOR, job.assetId);
  const res = await instance.fetch(
    new Request('http://media-processor/process', {
      method: 'POST',
      headers: {
        'x-media-job': btoa(JSON.stringify({ jobId: job.jobId, assetId: job.assetId, type: job.type, meta: { operations: job.meta?.operations } })),
      },
      body: bytes,
    }),
  );

  const result: any = await res.json().catch(() => ({}));
  if (!res.ok || !result?.success) return { ok: false, result };

  // Persist rendition + optimize outputs to R2, then strip the byte blobs.
  const written: string[] = [];
  const outputs: RenditionOut[] = [
    ...(result.results?.generate_renditions?.renditions ?? []),
    ...(result.results?.optimize?.key ? [result.results.optimize] : []),
  ];
  for (const o of outputs) {
    await env.PROCESSED.put(o.key, b64ToBytes(o.dataB64), {
      httpMetadata: { contentType: o.contentType },
    });
    written.push(o.key);
    delete (o as any).dataB64;
  }

  return { ok: true, result: { ...result, written } };
}

async function reportCompletion(
  env: Env,
  job: MediaJob,
  state: 'SUCCEEDED' | 'FAILED',
  payload: unknown,
): Promise<void> {
  if (!env.COMPLETE_CALLBACK_URL) return;
  await fetch(env.COMPLETE_CALLBACK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(env.COMPLETE_CALLBACK_SECRET ? { 'x-worker-secret': env.COMPLETE_CALLBACK_SECRET } : {}),
    },
    body: JSON.stringify({ jobId: job.jobId, assetId: job.assetId, state, result: payload }),
  }).catch(() => {}); // best-effort; a failed callback must not fail the job
}

export default {
  // Test + health surface. POST /enqueue {job} → produces to media-jobs.
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response('ok');
    }
    if (request.method === 'POST' && url.pathname === '/enqueue') {
      const provided = request.headers.get('x-enqueue-secret') ?? '';
      if (!env.ENQUEUE_SECRET || !timingSafeEqual(provided, env.ENQUEUE_SECRET)) {
        return new Response('unauthorized', { status: 401 });
      }
      const job = (await request.json()) as MediaJob;
      await env.MEDIA_JOBS.send(job);
      return Response.json({ queued: true, jobId: job.jobId }, { status: 202 });
    }
    return new Response('not found', { status: 404 });
  },

  // Queue consumer. media-jobs → container; unported types + errors handled per message.
  async queue(batch: MessageBatch<MediaJob>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const job = message.body;
      try {
        if (!CONTAINER_JOB_TYPES.has(job.type)) {
          console.log(`skipping unported job type ${job.type} (job ${job.jobId})`);
          message.ack();
          continue;
        }

        const { ok, result } = await processJob(env, job);
        if (ok) {
          await reportCompletion(env, job, 'SUCCEEDED', result);
          message.ack();
        } else {
          console.error(`job ${job.jobId} failed:`, JSON.stringify(result).slice(0, 500));
          message.retry(); // Queues re-delivers; exhausted retries → DLQ
        }
      } catch (err) {
        console.error(`job ${message.body?.jobId} errored`, err);
        message.retry();
      }
    }
  },
};
