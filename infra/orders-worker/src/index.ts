import { Container, getRandom } from "@cloudflare/containers";

interface Env {
  ORDERS_SVC: DurableObjectNamespace<OrdersService>;
  // Secrets (wrangler secret put …) — Supabase Cloud pooler connection.
  DATABASE_URL: string;
  SUPABASE_URL: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET?: string;
  EASYPOST_API_KEY?: string;
  EASYPOST_WEBHOOK_SECRET?: string;
  EASYPOST_DEFAULT_FROM_ADDRESS_ID?: string;
  EASYPOST_MODE?: string;
}

/**
 * The orders NestJS service (Stripe payments, EasyPost shipping, port 8080),
 * backed by Supabase Postgres (svc_orders schema) over the pooler instead of
 * the home-server DB. BullMQ/Redis were removed at the app-module level (no
 * queue was ever consumed — see services/orders/src/app.module.ts); the
 * shared @patina/cache module runs with REDIS_DISABLED=true (in-process
 * store) instead. The reconciliation @Cron (EVERY_6_HOURS, modules/
 * reconciliation) still fires on the container's own clock — it only runs
 * while an instance is awake, and scheduling across sleep/wake is not wired
 * up yet.
 *
 * Unlike aesthete-inference (one warm instance, model pinned in memory) this
 * container is stateless per request, so traffic is load-balanced across up
 * to `max_instances` (2) rather than pinned to a single DO.
 */
export class OrdersService extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = "10m";

  constructor(ctx: DurableObjectState<Env>, env: Env) {
    super(ctx, env);
    this.envVars = {
      PORT: "8080",
      NODE_ENV: "production",
      DATABASE_URL: env.DATABASE_URL,
      SUPABASE_URL: env.SUPABASE_URL,
      STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
      ...(env.STRIPE_WEBHOOK_SECRET
        ? { STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET }
        : {}),
      ...(env.EASYPOST_API_KEY
        ? { EASYPOST_API_KEY: env.EASYPOST_API_KEY }
        : {}),
      ...(env.EASYPOST_WEBHOOK_SECRET
        ? { EASYPOST_WEBHOOK_SECRET: env.EASYPOST_WEBHOOK_SECRET }
        : {}),
      ...(env.EASYPOST_DEFAULT_FROM_ADDRESS_ID
        ? {
            EASYPOST_DEFAULT_FROM_ADDRESS_ID:
              env.EASYPOST_DEFAULT_FROM_ADDRESS_ID,
          }
        : {}),
      EASYPOST_MODE: env.EASYPOST_MODE ?? "test",
      REDIS_DISABLED: "true",
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const instance = await getRandom(env.ORDERS_SVC, 2);
    return instance.fetch(request);
  },
};
