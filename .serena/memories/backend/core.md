# mem:backend/core — services/ (retained backends)

`services/` holds **4** services: 3 retained NestJS (`orders`, `media`, `projects`) +
1 Python/FastAPI worker (`aesthete-inference`). CLAUDE.md tree is accurate here.
Convention: **do NOT add new NestJS services** — use Supabase edge functions instead.
Everything else (auth, products, rooms, decisions, "the document", etc.) is Supabase-first.

## Schema isolation — NOT Prisma multiSchema
There are **no `@@schema` directives / `multiSchema` preview flag** in any prisma schema.
Isolation is purely by connection string: `DATABASE_URL=...postgres?schema=svc_orders`
(resp. `svc_media`, `svc_projects`) against the **single shared Supabase Postgres**.
- Local dev: `localhost:54322` (Supabase DB).
- Prod: pooled `DATABASE_URL` via pgbouncer `:6543` (`&pgbouncer=true`) + `DIRECT_URL`
  on `:5432` (used for migrations). Both in each service's `.env.example`.
- Prisma client is generated to `../src/generated/prisma-client` (committed to repo),
  `binaryTargets=["native","linux-musl-openssl-3.0.x"]`, `postinstall: prisma generate`.
- svc_* schema lifecycle is **separate** from `supabase/migrations/00xxx` (those own the
  `public` schema). Change a service schema with `prisma db push` (dev) /
  `prisma migrate dev` (prod), per its own `prisma/schema.prisma`.

## Ports / conventions
| service | port | prefix | notes |
|---|---|---|---|
| media | 3014 | none | no global prefix |
| orders | 3015 | `v1` | `setGlobalPrefix('v1')` |
| projects | 3016 | `v1` | `setGlobalPrefix('v1')` |
| aesthete-inference | 8000 | none | uvicorn |
- In-app **CORS is disabled** in all 3 NestJS `main.ts` (handled by NGINX/Kong upstream).
- `PORT` env overrides. `start:prod = node dist/main`.
- Module layout differs: orders/media use `src/modules/<feature>/`; **projects uses
  feature dirs directly under `src/`** (projects, tasks, rfis, change-orders, issues,
  daily-logs, documents, milestones, notifications, timeline, approvals, analytics,
  audit, websocket, …) — no `modules/` subdir.

## Ownership
- **orders** (`@patina/orders`): carts, checkout, orders, payments (**Stripe** `stripe@14`),
  refunds, reconciliation, fulfillment/shipping (**EasyPost** `@easypost/api`), webhooks.
  Queue = **Bull** (`@nestjs/bull` + redis). Models: Cart/CartItem/Order/OrderItem/Payment/
  Refund/Shipment/Address/Discount/Reconciliation/IdempotencyKey/AuditLog/OutboxEvent.
  PrismaModule at `src/config/prisma.module.ts`.
- **media** (`@patina/media`): image processing (**sharp**), 3D assets, renditions,
  upload sessions, storage (**AWS SDK v3** S3/CloudFront/CloudWatch; MinIO in dev),
  search, security, transform. Queue = **BullMQ** (`@nestjs/bullmq` + `ioredis`).
  **Separate worker processes**: `worker:transform`, `worker:3d` (Dockerfile.worker).
  Models: MediaAsset/AssetRendition/ThreeDAsset/ProcessJob/UploadSession/LicenseRecord/
  OutboxEvent + enums (AssetKind/Role/Status, ScanStatus, Rendition/Job/Upload states).
  Repo pattern: `src/infrastructure/repositories/prisma-media.repository.ts`.
- **projects** (`@patina/projects`): real-time collab. **socket.io WebSocket gateway**
  (`src/websocket/`: gateway, connection-monitor, event-bridge, message-queue) + Bull.
  Models: Project/Task/RFI/ChangeOrder/Issue/DailyLog/Document/Milestone/ProjectUpdate/
  TimelineSegment/ClientActivity/ApprovalRecord/EngagementMetrics/Notification(+Preference)/
  ActiveConnection/QueuedMessage/AuditLog/OutboxEvent. PrismaService at `src/prisma/`.

## Auth
NestJS services validate the Supabase JWT via **`SUPABASE_JWT_SECRET`**.
- projects: own passport-jwt (`src/common/strategies/jwt.strategy.ts`, `guards/auth.guard.ts`).
- orders/media: use the shared **`@patina/auth`** guards/decorators (in controllers + app.module).

## Transactional outbox
Every NestJS schema has an **`OutboxEvent`** model (orders + projects also `AuditLog`).
Note: no dedicated relay/consumer daemon found — writes exist; drainer is minimal/TBD.

## ⚠ Real-world status (non-obvious)
- **svc_projects is effectively deprecated in practice.** Portals moved projects/tasks/
  documents reads to Supabase `public` (RLS `client_id=auth.uid()`); the empty NestJS
  svc_projects returned 401/empty. The realtime gateway lives here but new work is
  Supabase-first. (See `mem:` client-portal-projects / active-project notes.)
- Invoicing / procurement / "the document" flows were built as **Supabase RPCs + edge fns**,
  not the orders service — but orders still owns Stripe + EasyPost integration.

## How portals reach these
Via `@patina/api-routes` proxy (retry / circuit-breaker / cache), not direct.
Env vars: `ORDERS_SERVICE_URL`/`ORDERS_URL`/`NEXT_PUBLIC_ORDERS_API_URL`,
`MEDIA_SERVICE_URL`/`MEDIA_URL`/`NEXT_PUBLIC_MEDIA_*`,
`PROJECTS_API_URL`/`PROJECTS_SERVICE_URL`/`NEXT_PUBLIC_PROJECTS_WS_URL`.
In-cluster hostnames: `orders:3015`, `media:3014`, `projects:3016`.

## aesthete-inference (Python/FastAPI)
Aesthete Engine embedding worker (design §12.1/§18). **nomic-embed-text-v1.5 +
nomic-embed-vision-v1.5**, 768-d aligned, **int8 ONNX on CPU**. Stateless, **NO DB access**,
internal Docker network only. **Deliberately NOT a pnpm/turbo workspace member** — Docker
is the only build path (`Dockerfile` 2-stage: export+quantize → runtime; `Makefile`; pytest).
- Routes: `POST /embed/text`, `POST /embed/image`, `POST /fit/taste` (BT MAP taste refit,
  pure-numpy Newton), `POST /fit/taste/backtest`, `GET /healthz`.
- Requires `INFERENCE_TOKEN` (Bearer on /embed/*,/fit/*; **refuses to start if unset**).
- **Task prefixes applied worker-side** (`app/main.py::TASK_PREFIXES`; `kind:document`→
  `search_document:`, `kind:query`→`search_query:`) — callers send raw text only.
- Batch ≤16 (else 400); in-process concurrency gate = 8 (9th → `429` + `Retry-After: 1`);
  all vectors L2-normalized; per-item error isolation into `errors[]`.
- φ (94-d) features for /fit/taste are computed DB-side by migration 00244's `_aesthete_phi`.
