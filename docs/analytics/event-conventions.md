# Analytics event conventions

Written after the web instrumentation wave (Phase 1 of the PostHog build-out
plan, 2026-07). Everything lands in one PostHog project: **"Patina Website"**
(id 326191, us.posthog.com, org Middlewest Studio).

## Naming is frozen once shipped

An event name that has shipped to production and is captured anywhere is
**locked** — do not rename it, even to fix a naming inconsistency. Dashboards,
insights, and cohorts reference event names as literal strings; a rename
silently breaks every tile built on it with no compile-time signal. If a name
was wrong, ship a **new** event alongside the old one and deprecate the old
one in this doc, don't rename in place.

Three names are explicitly locked by the Phase 1 dashboard build: `client_payment_started`,
`client_payment_completed`, `client_payment_cancelled` (client-portal invoice
Pay flow, `apps/client-portal/src/app/invoices/[invoiceId]/page.tsx`).

## Naming shape by surface

- **New web events** (designer/client/admin portals, extension): flat
  snake_case with a family prefix — `client_decision_approve`,
  `proposal_item_added`, `command_palette_open`. No nested namespacing, no
  dots. The prefix identifies the domain/family (`client_*`, `proposal_*`,
  `procurement_*`, `product_*`, `project_*`, `nav_*`, `command_bar_*`, …); the
  suffix is the verb/action.
- **New Field iOS events** (Patina Field / Capture, designer & trades app):
  dotted families — `capture.extension.opened`, `account.sign_in.started`,
  `sync.enqueue`. Mirrors the existing `screen.*` / `capture.*` / `sync.*`
  taxonomies already shipped there.
- **New Patina iOS events** (client-facing app): flat snake_case, matching the
  web convention — `login`, `help.article_opened` is the one shipped
  exception (help-system events are dotted repo-wide, web and iOS alike; see
  `packages/help-system/src/analytics.ts`'s `HELP_EVENTS`).

When in doubt, match the sibling events already shipped in the same file —
consistency within a taxonomy module matters more than a purist reading of
this doc.

## `surface` super-property

Registered once at init via `posthog.register({ surface: '<value>' })` in
each app's analytics init module, so it rides on **every** event from that
app — custom captures, autocapture, `$pageview`, and help-system events fired
through `window.posthog` (help-system has no `posthog-js` import of its own
and captures via the exposed `window.posthog` instance).

| `surface` value | App | Init file |
|---|---|---|
| `designer-web` | Designer Portal | `apps/designer-portal/src/lib/analytics/posthog.ts` |
| `client-web` | Client Portal | `apps/client-portal/src/lib/analytics/posthog.ts` |
| `admin-web` | Admin Portal | `apps/admin-portal/src/lib/analytics/posthog.ts` |
| `extension` | Chrome extension | `apps/extension/src/lib/analytics.ts` |
| `patina-ios` | Patina (client iOS) | Phase 3 — `Services/Analytics/PostHogService.swift` |
| `field-ios` | Patina Field (Capture, designer iOS) | Phase 3 — `PostHogCaptureAnalytics.swift` |
| `marketing-web` | patina.cloud marketing site | Follow-up ticket — external repo, not in this monorepo |

`surface` is the primary dashboard segmentation key. Rollups: **designer** =
`designer-web` ∪ `extension` ∪ `field-ios`; **client** = `client-web` ∪
`patina-ios`. Manufacturer Portal is a deployed scaffold with zero users and
intentionally carries no analytics — add `register({ surface:
'manufacturer-web' })` to `apps/manufacturer-portal/src/lib/analytics/`
(module doesn't exist yet) if/when it gets real traffic.

## `role` person property

Set at `posthog.identify()`, not as a super-property — it's a property of the
**person**, not a per-event tag. Source: `session.user.user_metadata?.role`,
falling back per portal (`'designer'` / `'client'` / `'admin'`) when
`user_metadata.role` is unset (most users today have no explicit role in
metadata, so the fallback is the common case, not an edge case). Extension
identify always sends `role: 'designer'` (no session/metadata to read from in
that context).

**Person-on-events caveat**: PostHog's person-on-events mode stamps a person
property's value onto an event **at ingest time**, using whatever the
person's property value was at that moment — it is not retroactive. `role`
breakdowns are only meaningful for events captured **after** the identify
call that set `role` shipped to production for that surface. Events captured
before this wave (or before a given surface's identify call started sending
`role`) will show `role` as unset/`unknown` in event-level breakdowns even
though the person record has since been updated. Use `surface` for anything
that needs to work retroactively; use `role` for retention/lifecycle analysis
going forward.

No `posthog.group()` calls anywhere — there is no organization/studio model
in PostHog today.

## Per-app taxonomy files (source of truth for exact event names + props)

- Designer Portal: `apps/designer-portal/src/lib/analytics/events.ts` (auth,
  product, project, client, vendor, teaching, nav, proposal events),
  `apps/designer-portal/src/lib/analytics/document-events.ts` (Document/desk
  telemetry — command bar, wayfinding, margin items),
  `apps/designer-portal/src/lib/analytics/schedule-events.ts` (Schedule
  Spine telemetry — `spine_phase_unfolded` / `rule_minimap_jump` are
  `schedule-spine`-flag-gated (the project-side Spine surface only); Slice 03
  compose events (`schedule_born` / `schedule_phase_added` /
  `schedule_anchor_set`, each carrying `surface: 'project' | 'proposal'`) are
  NOT flag-gated — they fire from BOTH the Spine (project) and PhaseBuilder
  (proposal, `apps/designer-portal/src/components/portal/scope-builder/
  phase-builder.tsx` — designer-only already, no separate gate needed). All
  three fire ONLY inside a mutation's `onSuccess`. Slice 04 (adjust) adds
  `schedule_edit_committed` (`surface: 'rule' | 'spine'`, `edit_kind`,
  `ripple_size`, `conflict_count`) — a previewed time edit committed through
  the ripple's confirm strip, project surface only, fired ONLY inside the
  commit mutation's `onSuccess` (a reverted/Esc edit never fires). Slice 05
  (memory) adds `schedule_revision_cut` (`v`, `trigger: 'signature' | 'edit'`)
  — a numbered `schedule_revisions` row was cut (00326's
  `cut_schedule_revision`); wired for `trigger: 'edit'` in the ripple confirm
  strip's commit mutation, only `trigger: 'signature'` is intentionally unwired
  (server-side baseline cut in activation — no client call site)),
  `apps/designer-portal/src/lib/analytics/procurement-events.ts`,
  `apps/designer-portal/src/lib/analytics/nomination-events.ts`.
- Client Portal: `apps/client-portal/src/lib/analytics/events.ts` (auth,
  client, nav, aesthete quiz, proposal-client events).
- Admin Portal: `apps/admin-portal/src/lib/analytics/events.ts`.
- Chrome extension: `apps/extension/src/lib/analytics.ts` (`extensionEvents`).
- Help system (dotted, cross-surface): `packages/help-system/src/analytics.ts`.
- Aesthete quiz funnel vocabulary (shared web + iOS + marketing):
  `packages/aesthete-quiz/README.md` § Analytics —
  `quiz_started → question_answered ×5 → quiz_completed → matches_viewed →
  match_saved`. The package itself has no PostHog dependency; each surface
  wires `useStyleQuiz({ onEvent })` to its own capture function.

A taxonomy module having a defined event with zero call sites ("dead
scaffolding") is normal in this codebase — grep for the exported name before
assuming it fires. This wave wired up several previously-dead client-portal
events; more remain dead by design (see below).

## Known intentionally-unwired events

- `client_decision_reject` (`apps/client-portal/src/lib/analytics/events.ts`)
  — no reject UI exists on the client decision card
  (`decision-card-client.tsx` only has a confirm/select flow). Do not wire
  this until a reject affordance ships; the event stays defined so the
  taxonomy documents the intended future shape.
- `client_demo_start` / `client_demo_complete` — demo-mode scaffolding, no
  current call site.
- Designer `vendorEvents`, `teachingEvents`, `clientEvents` (the designer
  portal's client-CRM taxonomy, distinct from the client-portal's own
  `clientEvents`), admin's `adminEvents`, and `nominate.*` remain dead —
  explicitly deferred in the PostHog build-out plan's backlog, not part of
  this wave.
- `schedule_revision_cut` (`apps/designer-portal/src/lib/analytics/schedule-events.ts`,
  Schedule Slice 05) — `trigger: 'edit'` is wired in the ripple confirm strip's
  commit mutation `onSuccess` (`schedule-confirm-strip.tsx`), reading `v` off
  `useCommitScheduleEdit`'s return. Only `trigger: 'signature'` remains
  intentionally unwired (the v1 cut happens server-side inside activation —
  no client call site).

## Env / build-time wiring note

`NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` are inlined into the
client bundle at build time. In production this wave made `wrangler.jsonc`
`vars` the source of truth for all three portals with working PostHog
(designer, client, admin) — previously only designer's `wrangler.jsonc`
carried these; client/admin builds picked the key up from a gitignored
build-machine `.env`, which worked but left no committed record of which key
was live. The `vars` blocks now mirror each other (same project-wide key,
`phc_D6Rf7ZYD5L7cTCgP1aBIV6kgANIFGnsbEgoYPXpsaNG`, `https://us.i.posthog.com`)
purely for documentation/auditability — changing the key still means editing
`wrangler.jsonc` and redeploying via `./infra/deploy-portal.sh <name>`, same
as every other prod env value (see root `CLAUDE.md` § Environment Variables).

## Dev gate

All three portals with PostHog (designer, client, admin) skip `posthog.init`
in local dev unless `NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV=true` is set in
`.env.local` — PostHog network failures otherwise pollute the Next.js dev
error overlay and mask real application errors. Set that env var (plus a
real key/host) to see local events land in PostHog during development.
