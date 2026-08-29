# Chrome Extension — Prod E2E Walk (v0.3.0)

**Purpose:** one pass of all **five** write paths (library, project room, inbox,
client decision, update-existing) against **live Strata prod**, followed by
read-only verification per `patina-prod-ops`. Distinct from
`manual-test-matrix.md` (seven sites, extraction-quality smoke, one
destination each) — this walk is single-site, all-destinations, prod-DB- and
PostHog-verified.

This is a human-run manual walk (Kody), not an agent script — the writes
happen through the extension's own UI, the same write path a designer uses
day to day. The **verification** section is READ-ONLY per `patina-prod-ops`
("read-only diagnostics are always allowed"); it contains no SQL that writes.

## Setup

### 1. Fresh Chrome profile

Isolate this walk from any existing dev/portal session:

```bash
open -na "Google Chrome" --args --user-data-dir="$TMPDIR/patina-e2e-chrome-profile"
```

### 2. Pull the prod dry-run build from CI

`extension-cws.yml` builds with the **real prod** `PLASMO_PUBLIC_*` secrets
(its "Verify prod config parity" step hashes `EXT_SUPABASE_ANON_KEY` against
`apps/designer-portal/wrangler.jsonc`'s committed prod anon key and fails the
job if they differ) and packages the exact zip Chrome Web Store would receive
— `dry_run` stops it short of the actual CWS upload/publish steps only.

```bash
gh workflow run extension-cws.yml -f dry_run=true
# wait ~2–3 min for the run to finish, then:
RUN_ID="$(gh run list --workflow=extension-cws.yml --limit 1 --json databaseId -q '.[0].databaseId')"
gh run watch "$RUN_ID"
gh run download "$RUN_ID" -n patina-capture-0.3.0 -D "$TMPDIR/patina-capture-e2e"
unzip -o "$TMPDIR"/patina-capture-e2e/*.zip -d "$TMPDIR/patina-capture-e2e/unpacked"
```

(If `patina-capture-0.3.0` doesn't match the artifact name, the workflow
names it `patina-capture-<package.json version>` — check
`apps/extension/package.json`'s `version` field first; it's `0.3.0` as of
this write-up.)

### 3. Load unpacked

In the Chrome window opened in step 1: `chrome://extensions` → enable
**Developer mode** → **Load unpacked** → `$TMPDIR/patina-capture-e2e/unpacked`
(the unzipped folder, not the zip). Pin it to the toolbar.

### 4. Sign in, then adopt the session

In a normal tab in the same profile: sign in at `https://app.patina.cloud`
with your real designer account. Then open the side panel — it should adopt
the portal session automatically via the `sb-<project-ref>-auth-token` cookie
(`src/hooks/use-portal-session.ts`); no `AuthScreen.tsx` prompt should appear.
If it does, that's itself a finding — note it and fall back to the panel's
own sign-in.

### 5. Find your uid

Strata dashboard → **Authentication** → **Users** → search your email → copy
the UUID shown. (Deliberately a dashboard lookup, not a SQL query here, so
this doc needs no placeholder beyond the `<uid>` you now have.)

### 6. Set up two throwaway targets

- **Throwaway client** (for the decision path — per the prod-write-probe
  README's warning, `apps/extension/scripts/README.md`: a real
  `designer_clients` row with a registered `client_id` gets **actually
  emailed** and left `pending`): in the designer portal, **Clients → New
  client**, name it something disposable (e.g. "E2E Walk — throwaway"), and
  finish onboarding it so it has a registered `client_id` (the
  `create_client_decision` RPC raises 23514 "pending decisions require a
  registered client recipient" otherwise, 00415:583-586).
- **Throwaway project + room with an empty FF&E line** (for the project-room
  path): in the designer portal, create a project, add one room, add one FF&E
  line item to that room and leave it unassigned (no product linked) so
  `fill_slot` has something real to fill.

## The five write paths

All five run against the **same** product page —
`https://www.roomandboard.com/catalog/living/sofas-and-loveseats/stevens-sofas`
(Stevens Sofa) — so the verification queries below can filter on one product
name across every table.

Run in this order (steps 4 and 5 need the throwaway targets from setup step 6;
step 5 needs step 1's saved product to exist first, since "update" targets an
existing row via exact-URL dedup):

1. **Save to library** — open the URL, open the panel, click **Save to
   library** (`CommitBar.tsx`, no `dedup.match` yet), confirm S4 "Saved to
   your library".
2. **Save to project room** — capture the same URL again (**Capture
   another**, or reopen the panel on the same tab) — the exact-URL dedup
   banner ("Looks like one you have") now shows. Set Region D's destination
   to the throwaway room via `RouteCommitRegion`/`FFESlotPicker`, pick the
   empty FF&E line, and click **Save as new** (creating a second, distinct
   product row is expected here — this path tests placement, not dedup).
   Confirm the terminal screen and that the FF&E line now shows a linked
   product in the portal.
3. **Send to inbox** — capture the URL a third time, click **Send to inbox**,
   confirm S5 "Sent to your inbox".
4. **Send as client decision** — capture the URL a fourth time, click **Send
   for client approval →**, choose the throwaway client from setup, click
   **Send to client**, confirm "Sent for approval" / "The client has been
   notified." (`DecisionSheet.tsx:41-42`).
5. **Update existing** — reopen the panel on the same URL once more. The
   dedup banner now names step 1's product (the first-created row — dedup
   matches on exact URL, and multiple products share this URL after steps
   1–4, so confirm the name shown is the one you expect). Click
   `Update "{name}"`. Confirm S4 again, with **no new product row created**
   (verify in the next section).

## Verification (READ-ONLY — per `patina-prod-ops`)

Run these via the Supabase MCP `execute_sql` (SELECT-only, always allowed) or
Strata's SQL editor, as `service_role`/`postgres`. Replace only `<uid>` —
every value below is real Room & Board data.

**Products** (steps 1, 2, 3, 4 each insert one row; step 5 updates step 1's
row in place — expect exactly 4 rows, not 5):

```sql
select id, name, status, layer, captured_by, captured_at, updated_at, source_url
from products
where captured_by = '<uid>'
  and name ilike '%Stevens%'
order by captured_at desc;
```

**Proposal captures** (the inbox path only — step 3; `commit_proposal_capture`,
migration 00516, writes here internally):

```sql
select id, designer_id, product_id, status, raw_payload->>'name' as captured_name, captured_at
from proposal_captures
where designer_id = '<uid>'
  and raw_payload->>'name' ilike '%Stevens%'
order by captured_at desc;
```

**Project FF&E items** (the project-room path only — step 2; joined through
`products.captured_by` since `project_ffe_items` carries no capturing-user
column of its own):

```sql
select f.id, f.name, f.product_id, f.project_id, f.project_room_id, f.updated_at
from project_ffe_items f
join products p on p.id = f.product_id
where p.captured_by = '<uid>'
  and p.name ilike '%Stevens%'
order by f.updated_at desc;
```

Note: `f.name` is the **FF&E line's own name** (set when the line was
created, e.g. "Sofa"), not necessarily the captured product's name —
`fill_slot` links `product_id` into a pre-existing named line
(`FFESlotPicker.tsx:154-162`) without renaming it, and `create_line` names
the new line from a typed **category**, not the product name
(`FFESlotPicker.tsx:164-171`). Don't expect `f.name ilike '%Stevens%'` to
match — the `product_id` join above is the reliable anchor; a bare
`project_ffe_items.name ilike '%Stevens%'` query would likely return zero
rows even on a healthy save.

**Client decisions** (the decision path only — step 4):

```sql
select cd.id, cd.title, cd.status, cd.sent_at, cdo.name as option_name, cdo.product_id
from client_decisions cd
join client_decision_options cdo on cdo.decision_id = cd.id
where cd.designer_id = '<uid>'
  and cdo.name ilike '%Stevens%'
order by cd.sent_at desc;
```

**Cross-check step 5 (update) didn't create a new row**: the products query
above should show exactly 4 distinct `id`s across all five steps — if it
shows 5, step 5's dedup match failed silently and a duplicate was created
instead of an update.

## Analytics check (PostHog)

`captureAnalytics()` (`apps/extension/src/state/effects.ts:119-126`) fires
`extensionEvents.productCapture(...)` (`src/lib/analytics.ts:94-108`) on every
successful save (`product.captured`), `distinct_id` = your `<uid>` (the
extension calls `ph.identify(userId, ...)` — `analytics.ts:41-49`).

```sql
select timestamp,
       properties.source,
       properties.hasImages,
       properties.hasPrice,
       properties.confidence,
       properties.captureMethod,
       properties.destination,
       properties.captureTimeMs
from events
where event = 'product.captured'
  and distinct_id = '<uid>'
order by timestamp desc
limit 10
```

Run in PostHog's SQL/HogQL insight editor. Expect **4 rows** (steps 1–4 each
call `captureAnalytics`; step 5, `updateExisting`, also calls it — so 5 rows
total, one per write-path step run above).

**⚠ Known gap, not a walk failure**: `properties.destination` and
`properties.captureTimeMs` will come back **NULL** on every row. The event's
TypeScript signature declares both (`analytics.ts:100-101`), but the actual
call site — `captureAnalytics()` in `effects.ts` — only ever passes
`hasImages`, `hasPrice`, `confidence`, and `captureMethod`
(`effects.ts:119-126`); nothing in `state/effects.ts` currently threads a
`domain`, `destination`, or elapsed-time value into this call. `domain` isn't
even in the `productCapture` property type — only `open`/`cancelled` accept
it (`analytics.ts:86-91`). So this check can only confirm the event fires
with `source`/`confidence`/`captureMethod` populated; it cannot yet confirm
per-destination or capture-latency analytics, despite the type surface
suggesting it should. Worth a follow-up ticket to wire `destination` and
`captureTimeMs` through from `CommitBar.tsx`'s `run()` (which already knows
`kind` and could time itself) into `captureAnalytics()` — out of scope for
this docs-only lane.

## After the walk

This leaves real data on prod under your own account: 4 `products` rows, 1
`proposal_captures` row, 1 `project_ffe_items` placement, 1 `client_decisions`
row (which notifies and emails the throwaway client via
`notification-digest-daily`, 15:00 UTC — expect that email). None of it is
`PROBE-`-prefixed since this is a real designer-account walk, not the
scripted probe — clean up by hand in the portal (archive the project
selection, delete the extra product rows, retire the throwaway client) if you
don't want it lingering, or leave it as a real capture if the Stevens Sofa is
actually useful to you.
