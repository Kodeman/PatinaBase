# Patina Client Portal

The homeowner's page — the client-facing face of The Document
(`docs/vision/VISION-DECISIONS.md` **V8**; `docs/design/the-client-page/README.md`).
One page per project, no chrome above it: every fact a homeowner needs
surfaces on that page, and every act she can take happens in place.

## Getting started

### Prerequisites
- Node.js 20+
- pnpm `9.0.0` (corepack pin — see the repo root `CLAUDE.md`/`AGENTS.md`)

### Install and run

```bash
pnpm install                              # from the repo root
pnpm --dir apps/client-portal dev         # http://localhost:3002
```

`pnpm dev` at the repo root starts every app — use a selective `dev:*` script
instead; see **patina-local-dev**.

### Build

```bash
pnpm --dir apps/client-portal build
```

Production deploys always go through `./infra/deploy-portal.sh client` —
never `opennextjs-cloudflare build` directly. See **patina-deploy**.

## Route map

The authenticated surface is one page per project, ruled 2026-09-04
(`docs/design/the-document/DECISIONS.md` **R135**) and shipped with no
feature flag.

### Authenticated routes

| Route | Renders |
|---|---|
| `/` | The client's **active project** — the project with the most recent activity among `projects.client_id = auth.uid()`. A solo client always lands here on the same project; a multi-project client lands on whichever house last moved. |
| `/projects/[projectId]` | That specific project's page — reached from `/`'s "Your other houses" (in the mat) or a deep link that names a project. |

Both routes render the same component, `<Threshold>`
(`src/components/threshold/threshold.tsx`) — there is no separate list view,
no header, no project switcher outside the mat. Everything else
authenticated is a **redirect** (`src/middleware.ts`), not a route: an old
address a client, an email, a cron job, iOS, or the extension might still
hold lands on `/` or `/projects/[projectId]` opened to an anchor —

| Old route(s) | Anchor |
|---|---|
| `/today`, `/decisions`, `/decisions/[id]`, `/reviews`, `/projects/[id]/reviews/*` | `#doorstep` |
| `/proposals`, `/proposals/[id]`, `/proposals/[id]/sign` | `#door` |
| `/invoices`, `/invoices/[id]` | `#letterbox` |
| `/budget` | `#ledger` |
| `/documents` | `#mat-papers` |
| `/orders` | `#road` |
| `/messages`, `/messages/*`, `/inbox` | `#note` |
| `/scans`, `/scans/[id]` | `#room-<roomId>` when resolvable, else `#doorstep` |
| `/account`, `/preferences`, `/settings/*` | `#mat` |
| `/projects` | `/` (the active-project redirect, not an anchor) |

A redirect carries the project id when the old URL had one; otherwise it
targets `/`. See the retirement plan's End state section
(`docs/superpowers/plans/2026-09-04-client-portal-retirement.md`) for the
full middleware contract and the edge-function/email/iOS/extension literals
that were updated alongside it.

### Public, token, auth, and system routes

Untouched by the retirement — these were never part of the header's route
tree:

- `/auth/*` — sign-in, magic link, and session handling.
- `/share/[token]` and other token-bearing links a studio hands out.
- `/preferences/unsubscribe` — made **public** as part of this cutover (it
  was bouncing signed-out recipients).
- Checkout return URLs (`?checkout=success|cancel` on `/projects/<id>#letterbox`) —
  read on mount by the letterbox, then cleaned from the query string.
- `/wrong-portal`, `/unauthorized`, `/error`, `/not-found` — system pages.

## Where things live

- `src/components/threshold/` — the page and every instrument it composes
  (doorstep, door, letterbox, the road, the note, papers sheet, room band,
  house ledger, mat, plan key). See
  `docs/design/the-client-page/README.md` ("Shipped: where the instruments
  live") for the full inventory.
- `src/components/threshold/instruments/` — the six devices inherited from
  The Making v1 (`scored-action`, `spine-gate`, `spine-toll`, `tracking-row`,
  `standing-sentence`, `making-spine`), moved here from `components/making/`.
- `src/middleware.ts` — the redirect map above, plus the active-project
  sign-in destination.
- `src/hooks/` — portal-local hooks; Supabase data comes through
  `@patina/supabase` hooks per **patina-portal-features**.

## Retirement note

This portal shipped in 2026 as a mobile-first, multi-route PWA (timeline,
notifications, and profile pages under a `(dashboard)/` group, a bottom
navigation bar, touch-gesture and offline support). That route tree, its
header/nav/drawer, The Making v1's flagged body, and both feature flags
(`threshold`, `single-pane`) were retired in the 2026-09-04 client-page
program in favor of the single page above —
`docs/superpowers/plans/2026-09-04-client-page-completion.md` built the
Threshold out to cover every act the old routes performed, and
`docs/superpowers/plans/2026-09-04-client-portal-retirement.md` deleted the
old surface once it did. No client-visible feature is behind a flag: the
ruling (Kody, 2026-09-04) shipped to everyone because zero clients were live
on the platform to stage a rollout against.

Performance and mobile-support goals from the original build (LCP < 2.5s,
CLS < 0.1, offline queueing, PWA install) still apply to the single page —
only the route shape changed.

## License

Proprietary - Patina Platform
