import { Container, getContainer } from '@cloudflare/containers';

interface Env {
  PROJECTS_SVC: DurableObjectNamespace<ProjectsService>;
  // Secrets (wrangler secret put …) — Supabase Cloud pooler connection.
  DATABASE_URL: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  // Optional: only needed if Supabase issues HS256 (legacy shared-secret)
  // JWTs. Supabase Cloud signs with an asymmetric key (ES256/RS256), verified
  // via JWKS derived from SUPABASE_URL, so @patina/auth's HybridAuthGuard
  // works without this. Left undefined is fine.
  SUPABASE_JWT_SECRET?: string;
}

/**
 * The projects NestJS service (tasks, RFIs, change orders, issues, daily
 * logs, documents, milestones, timeline, approvals, analytics — port 8080),
 * backed by Supabase Postgres (svc_projects schema) over the pooler instead
 * of the home-server DB.
 *
 * Bull/Redis were removed at the app-module level during this migration — no
 * @Processor ever consumed the notification queue, and the outbox's
 * @Cron(EVERY_10_SECONDS) pump only called a logging-stub publisher (see
 * services/projects/src/{notifications,events}). The shared @patina/cache
 * module runs with REDIS_DISABLED=true (in-process store) instead. The
 * remaining @Cron(EVERY_DAY_AT_2AM) outbox cleanup still fires on the
 * container's own clock — it only runs while an instance is awake.
 *
 * Realtime (former Socket.io gateway) now POSTs to Supabase Realtime
 * broadcast using SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (see
 * src/realtime/realtime-broadcaster.service.ts) rather than holding
 * WebSocket connections, so a single warm instance is fine — hence the
 * singleton fetch below (unlike the load-balanced orders container).
 */
export class ProjectsService extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = '10m';

  constructor(ctx: DurableObjectState<Env>, env: Env) {
    super(ctx, env);
    this.envVars = {
      PORT: '8080',
      NODE_ENV: 'production',
      DATABASE_URL: env.DATABASE_URL,
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
      REDIS_DISABLED: 'true',
      ...(env.SUPABASE_JWT_SECRET ? { SUPABASE_JWT_SECRET: env.SUPABASE_JWT_SECRET } : {}),
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return getContainer(env.PROJECTS_SVC, 'singleton').fetch(request);
  },
};
