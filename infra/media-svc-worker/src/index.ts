import { Container, getRandom } from '@cloudflare/containers';

interface Env {
  MEDIA_SVC: DurableObjectNamespace<MediaService>;
  // Secrets (wrangler secret put …) — Supabase Cloud pooler connection.
  DATABASE_URL: string;
  SUPABASE_URL: string;
  // Cloudflare Queues producer pairing (infra/media-worker) — addJob() POSTs
  // here; its consumer POSTs completions back to this container's
  // /v1/media/jobs/complete.
  MEDIA_WORKER_URL: string;
  MEDIA_WORKER_ENQUEUE_SECRET: string;
  COMPLETE_CALLBACK_SECRET: string;
  // R2 (S3 API) — same credentials patina-media-worker's R2 bindings resolve
  // to, per infra/media-worker/README.md's "R2 jurisdiction gotcha".
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
}

/**
 * The media NestJS service (upload intents, asset ledger, jobs API, port
 * 8080) backed by Supabase Postgres (svc_media schema) over the pooler.
 * BullMQ/IORedis were removed from the job-queue system (see
 * services/media/src/modules/jobs/job-queue.service.ts) — addJob() now POSTs
 * to the patina-media-worker Cloudflare Queues producer (infra/media-worker)
 * instead of running an in-process worker; the shared @patina/cache module
 * runs with REDIS_DISABLED=true (in-process store).
 *
 * Object storage (upload PARs, direct reads) talks to R2 via the S3 API
 * (OCIStorageService) using the same R2 credentials patina-media-worker's R2
 * bindings resolve to — the "same view" the media-worker README describes,
 * as opposed to the `wrangler r2 object` CLI's differently-scoped view.
 *
 * Stateless per request, so traffic is load-balanced across up to
 * `max_instances` (2) rather than pinned to a single DO (mirrors
 * patina-orders-worker).
 */
export class MediaService extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = '10m';

  constructor(ctx: DurableObjectState<Env>, env: Env) {
    super(ctx, env);
    this.envVars = {
      PORT: '8080',
      NODE_ENV: 'production',
      REDIS_DISABLED: 'true',
      DATABASE_URL: env.DATABASE_URL,
      SUPABASE_URL: env.SUPABASE_URL,
      MEDIA_WORKER_URL: env.MEDIA_WORKER_URL,
      MEDIA_WORKER_ENQUEUE_SECRET: env.MEDIA_WORKER_ENQUEUE_SECRET,
      COMPLETE_CALLBACK_SECRET: env.COMPLETE_CALLBACK_SECRET,
      STORAGE_PROVIDER: 'R2',
      R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
      R2_BUCKET_RAW: 'patina-raw',
      R2_BUCKET_PROCESSED: 'patina-processed',
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const instance = await getRandom(env.MEDIA_SVC, 2);
    return instance.fetch(request);
  },
};
