# Chrome Extension — Prod E2E Walk (v0.3.0)

Targets the 0.3.0 release; commands derive the version from package.json.

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
gh run download "$RUN_ID" -n "patina-capture-$(node -p "require('./apps/extension/package.json').version")" -D "$TMPDIR/patina-capture-e2e"
unzip -o "$TMPDIR"/patina-capture-e2e/*.zip -d "$TMPDIR/patina-capture-e2e/unpacked"
```

Run this from the repo root — the artifact name is derived from
`apps/extension/package.json`'s `version` field, not hardcoded, so it stays
correct once the 0.3.0 bump lands in W4 (these docs merge before that).

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
   notified." (`DecisionSheet.tsx:39/42`).
5. **Update existing** — reopen the panel on the same URL once more. The
   dedup banner now names step 1's product (the first-created row — dedup
   matches on exact URL, and multiple products share this URL after steps
   1–4, so confirm the name shown is the one you expect). Click
   `Update "{name}"`. Confirm S4 again, with **no new product row created**
   (verify in the next section).

## The R5 save-error UX (offline / expired session)

CL W3-E10's final pass adds a live-retry error path to R5 — worth one real
pass against prod, not just the matrix's isolated edge-case rows, since this
is the failure mode a designer actually hits on a bad connection.

6. **Trigger a save error** — reopen the panel on the same Stevens Sofa URL,
   let the draft populate, then DevTools → Network → Offline, and click
   **Save to library**. Confirm the panel lands on R5 with title **"Couldn't
   save"** and body text exactly `"You're offline — your draft is kept.
   Retry when you're back."`, with two buttons: **Retry** and **"Edit the
   record"** (`TerminalScreens.tsx`, CL W3-E10).
7. **Confirm "Edit the record"** — click it. Confirm you land back on C2
   (the record screen) with every field from the draft still populated —
   nothing was discarded (`dispatch({ type: 'NAV', screen: 'C2' })`).
8. **Confirm retry-in-flight copy, then complete the save** — go back to R5
   (re-trigger the same offline save if needed), go back online, click
   **Retry**, and confirm the body text swaps to exactly `"Retrying your
   save…"` while in flight (not just the button, which separately reads
   "Retrying…"), then lands on S4 "Saved to your library" once the retry
   succeeds — the same commit target (library) it started as, with no
   re-typing. This produces a 6th `products` row captured_by your `<uid>`;
   the verification query below still applies to it.

## Verification (READ-ONLY — per `patina-prod-ops`)

Run these via the Supabase MCP `execute_sql` (SELECT-only, always allowed) or
Strata's SQL editor, as `service_role`/`postgres`. Replace only `<uid>` —
every value below is real Room & Board data.

**Products** (steps 1, 2, 3, 4 each insert one row; step 5 updates step 1's
row in place, no new row; step 8's completed retry inserts a 6th — expect
exactly 5 rows):

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
above should show exactly 5 distinct `id`s across all six write steps
(1–5 plus step 8's completed retry) — if it shows 6, step 5's dedup match
failed silently and a duplicate was created instead of an update.

## Analytics check (PostHog)

Depends on lane **W3-E10** (branch `capture-launch/w3-e10`, `859ffb0cd`),
merging into `capture-launch/integration` next — confirm it has landed before
running this check.

`captureAnalytics()` (`apps/extension/src/state/effects.ts`) fires
`extensionEvents.productCapture(...)` (`src/lib/analytics.ts`) on every
successful save (`product.captured`), `distinct_id` = your `<uid>` (the
extension calls `ph.identify(userId, ...)` — `analytics.ts`). As of CL
W3-E10, this event carries `domain` (the source page's hostname, `www.`
stripped — `sourceDomain()` in `effects.ts`) and `destination` (the
commit-target kind the save actually landed on — the `CaptureDestination`
union: `library | project_inbox | fill_slot | create_line | inbox | decision
| update`) alongside `captureTimeMs` (elapsed ms from opening the panel to
this save, threaded from `controller.captureStartedAt`).

```sql
select timestamp,
       properties.source,
       properties.domain,
       properties.destination,
       properties.captureTimeMs,
       properties.confidence,
       properties.captureMethod
from events
where event = 'product.captured'
  and distinct_id = '<uid>'
order by timestamp desc
limit 10
```

Run in PostHog's SQL/HogQL insight editor. Expect **6 rows**: one per
write-path step above, plus step 8's completed retry — each with
`properties.domain = 'roomandboard.com'` (no `www.`) and
`properties.captureTimeMs` a positive number (step 8's will run higher than
the others since its clock includes the failed offline attempt's dwell
time before the retry succeeded). `properties.destination` must match the
step that produced it — this is the check that actually proves each write
path landed where it was supposed to, not just that *a* product row
appeared:

| Step | Write path | Expected `destination` |
|---|---|---|
| 1 | Save to library | `library` |
| 2 | Save to project room (`fill_slot`) | `fill_slot` |
| 3 | Send to inbox | `inbox` |
| 4 | Send as client decision | `decision` |
| 5 | Update existing | `update` |
| 8 | Retry (completed offline save) | `library` — `deriveRetryKind` returns the original `lastCommitKind` ('library', from step 6's initial attempt), so the retried save reports the same destination it started as |

### Extraction telemetry

Each of the six panel opens on the Stevens Sofa page (steps 1–6 — step 8
reuses step 6's draft via Retry rather than re-extracting, so it does not
add a seventh pair) should also emit a matched `extraction_started` →
`extraction_completed` pair (`mode: 'product'` — `use-capture-controller.ts`
calls `extensionEvents.extractionStart('product')` /
`extractionComplete('product', fieldCount, confidence)` around the
extraction call; `extractionError('product', ...)` fires instead only if the
page fails to extract, which a clean SSR page like Room & Board shouldn't):

```sql
select timestamp, event, properties.mode, properties.field_count, properties.confidence, properties.error_type
from events
where event in ('extraction_started', 'extraction_completed', 'extraction_failed')
  and distinct_id = '<uid>'
order by timestamp desc
limit 20
```

Expect **6 `extraction_started` rows** (`mode = 'product'`) each paired with
an adjacent-in-time **`extraction_completed`** row (`mode = 'product'`,
`field_count` populated, `confidence` one of `high`/`medium`/`low`) — no
`extraction_failed` rows for this walk (going offline breaks the *save*, not
the extraction that already happened before it). If any pair is missing its
`extraction_completed` half, that panel open never actually extracted a
draft and the write-path step it fed didn't run against real extracted
data.

## After the walk

This leaves real data on prod under your own account: 5 `products` rows
(steps 1–4 plus step 8's completed retry), 1 `proposal_captures` row, 1
`project_ffe_items` placement, 1 `client_decisions`
row (which notifies and emails the throwaway client via
`notification-digest-daily`, 15:00 UTC — expect that email). None of it is
`PROBE-`-prefixed since this is a real designer-account walk, not the
scripted probe — clean up by hand in the portal (archive the project
selection, delete the extra product rows, retire the throwaway client) if you
don't want it lingering, or leave it as a real capture if the Stevens Sofa is
actually useful to you.
