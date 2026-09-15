# W4 (P3) — runtime QA against LOCAL PRODUCTION BUILDS, round 1

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Reads: `w4-paperwork-report.md`, `w4-studio-report.md`, `w4-data-edge-report.md`,
`w4-help-report.md`, `upload-door-spec.md` §3/§6/§9, `rulings.md` §3 (treated as settled).
Also on disk in this same `build/` directory: `w4-review-r1-code.md` and
`w4-review-r1-data-edge.md` — a separate adversarial *code* review round, already
flagging 2 blocking / 6 major / 16 minor between them. This document is a *different*
pass — a live walk of the shipped surfaces against real local production builds and the
real edge function — and does not re-litigate that review except where my own runtime
testing independently touches the same code path (noted explicitly below).

**Verdict: NOT clean — 2 blocking, 2 major, 1 minor.**

---

## 0. Environment stand-up

| Step | Result |
|---|---|
| Port rule, 3000 / 3002 | Both free at start. No conflict, nothing to report. |
| `supabase db reset` | Green. Ledger head `00637`. |
| Designer build (`next build --webpack`, inline local env) | Green. |
| Client build (`next build --webpack`, inline local env) | Green. `/paperwork/[token]` present in the route table. |
| Start | **`next start` does not work with either portal** — both ship `output: 'standalone'` in `next.config.js`, and `next start` prints `⚠ "next start" does not work with "output: standalone" configuration. Use "node .next/standalone/server.js" instead.` and then throws `Your project's URL and Key are required to create a Supabase client!` from middleware (the anon key never reaches the running process the way `next start` runs it). Worked around by running `node .next/standalone/apps/<portal>/server.js` directly (with `.next/static` and `public` copied into the standalone tree per Next's own docs, and env vars passed to the `node` process). **This is a process-instruction gap, not a wave defect** — logging it because the task's own runbook step ("next start each in the background") does not work as written against this codebase's current build config, and whoever owns the local-prod-build recipe should fix the instruction (swap in the standalone-server incantation) so the next QA round doesn't lose the same hour rediscovering it. |
| `supabase functions serve paperwork-upload --no-verify-jwt` | Confirmed serving (OPTIONS → 204, garbage POST → 400). Note: the CLI serves the *whole* `supabase/functions/` tree regardless of the one name passed — expected CLI behavior, not a program issue. |
| Reset artifacts | `deno.lock` never left at repo root (checked after every Deno run); both portal servers and both `functions serve` process trees killed at the end; ports 3000/3002 confirmed free; `.next/standalone` copies are untracked build output. |

---

## 1. BLOCKING

### QA-B1 — an unverified *or explicitly rejected* upload already reads as the studio's current paper, on both faces, and can satisfy `site_access` / `payment` / `draw` gates

Already disclosed as a finding-in-progress by the wave's own report
(`w4-studio-report.md` §4, "an unverified upload already moves the firm's paper word"),
but that write-up only exercises the *pending* case. I independently reproduced it live
end‑to‑end and it is worse than described: **a document the studio has explicitly
*rejected* still reads as current paper too**, and the trade-facing page shows the same
wrong word back to the firm that was just told no.

**Repro (real data, real RPCs, no mocks):**

1. As Leah, minted a paperwork link for Twin Cities Drywall & Plaster (thirty-day
   choice) from the company card. Screenshot: `qa-w4-r1/01-mint-paperwork-link.jpg`.
2. As the firm, POSTed a real PDF to the live `paperwork-upload` function for
   `doc_type=license` (a type this firm had *never* held — starts `Not on file`).
   `studio_compliance_documents` row lands exactly per spec: `source=field_link`,
   `inbound=true`, `verified_by`/`verified_at`/`rejected_at`/`superseded_by` all NULL,
   storage key `{org}/{company}/{uuid}/license.pdf`.
3. Before any studio action, the company card's Paper table **already** printed
   `Licence … CURRENT` beside the inbound-queue band that says the same document is
   "waiting for your check" — the same paper, twice, in two states, exactly as the
   report predicted.
4. Confirmed one pending license through the UI (two-step confirm) —
   `verified_by`/`verified_at` stamped correctly.
5. **Rejected** a second pending license through the UI (two-step reject, reason
   required and enforced) — `rejected_by`/`rejected_at`/`rejection_reason` stamped
   correctly, row not deleted, exactly one `compliance_chase` row landed
   `agent_tasks.status = 'awaiting_review'` (spec §9 #7, one chase, not zero, not two).
   **The rejected row still shows in the Paper table as `Licence … CURRENT`** —
   screenshot `qa-w4-r1/03-BUG-paper-table-shows-current-for-unverified-and-rejected-license.jpg`
   (both Licence rows read CURRENT; only one is actually verified).
6. Reloaded the firm's own `/paperwork/[token]` page: it now reads **"Licence,
   current."** too — screenshot
   `qa-w4-r1/04-BUG-firm-facing-paperwork-page-also-shows-current-for-rejected-license.jpg`.
   A firm whose paper was just refused is told, on the door it uses, that its paper is
   fine.

**Root cause, read from the live function:**

```sql
-- compliance_state(p_holder_id), final SELECT
FROM public.studio_compliance_documents d
WHERE d.holder_id = p_holder_id
  AND (d.superseded_by IS NULL OR d.id NOT IN (SELECT root FROM retired))
```

No clause anywhere in `compliance_state` (and, per the report, the `identity_paper_state`
fold behind every Directory row, seat line and roster row) checks `verified_at IS NOT
NULL` or `rejected_at IS NULL`. Any non-superseded row counts, confirmed, pending, or
refused alike. For a `doc_type` that carries real gates (`coi_gl`/`w9`/`license`-with-a-
studio-policy), this means: **an inbound document — even one the studio has already
said no to — can read as satisfying `site_access`, `payment`, or `draw`**, which is the
brief's own definition of blocking (a token/document accepted without verification).

**Not fixed here** (out of QA's scope — it's the reducer's, per the wave's own §4). Owed
before ship, and the rejected-row case should be folded into the same fix as the
pending-row case (`AND d.verified_at IS NOT NULL` — or an explicit
`AND (d.rejected_at IS NULL)` — added to the counting predicate, not just excluding
`inbound = true AND verified_at IS NULL`, since a rejected row is `inbound = true` and
also `verified_at IS NULL` and would already be caught by *that* fix — but should be
named explicitly in the fix's test so a reviewer doesn't ship a version that only closes
the pending half).

- Severity: **blocking**. Confidence: **confirmed** (reproduced twice, live UI + DB +
  root cause read from the shipping SQL function).

### QA-B2 — two shipped readers of `invoice_links.token` are dead on arrival after 00636's hardening; the design-build deposit `/pay` link is unreachable

Surfaced by the sibling code review (`w4-review-r1-data-edge.md`, finding **B-1**) via
static analysis; I re-verified the load-bearing fact at runtime rather than just taking
the citation on faith, since "a `/pay` link broken by the backfill" is explicitly named
in my own brief's blocking list.

**Confirmed live:**

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'invoice_links'::regclass and conname ilike '%token%';
--  chk_invoice_links_token_frozen | CHECK ((token IS NULL))
```

`token IS NULL` is a hard, unconditional CHECK on every row of `invoice_links` — there
is no code path, past or future, that can put a non-null value there again. `pg_proc`
confirms both `issue_agreement_draw_invoice` and `get_client_commercial_document_bundle`
still exist as shipped and (per the code review's grep of their live bodies) still
`SELECT link.token` directly rather than through the hash-based resolver. That makes the
two readers' `payToken` **deterministically NULL on every future call, for every
invoice, forever** — not a fixture-dependent maybe, a guaranteed consequence of the
CHECK plus the un-re-headed RPC bodies. Downstream, per the code review:
`apps/client-portal/src/app/api/proposals/[id]/sign/route.ts` and
`apps/client-portal/src/lib/commercial-documents.ts` both treat an empty `payToken` as
"no deposit offer" with no fallback route — a client who signs a design-build agreement
is shown no way to pay the deposit.

I did not have a design-build draw-invoice fixture in this seed to drive the full UI
path end-to-end (`invoice_links` is empty in this dev seed), so this is a
schema-level/static confirmation of the code review's finding rather than an
independent new repro — logged here, not as a duplicate, because it lands squarely in
my own brief's named blocking criterion and because the *general* `/pay/<token>` path
(minted via `ensure_invoice_link`, the hardened route) I *did* drive live and it works —
screenshot `qa-w4-r1/02-pay-link-renders-after-crm29-hardening.jpg`. It is only these
two un-re-headed callers that are broken.

- Severity: **blocking**. Confidence: **confirmed** (schema-level: the CHECK constraint
  makes the failure deterministic, not probabilistic; first identified by
  `w4-review-r1-data-edge.md` B-1, whose fix recommendation I have no changes to).

---

## 2. MAJOR

### QA-M1 — `client-portal`'s production Content-Security-Policy has no path for a non-`patina.cloud` `NEXT_PUBLIC_SUPABASE_URL`, so every direct browser→Supabase fetch (including this wave's own upload form) silently dies with no CORS error, only a generic refusal

This is what actually blocked me from completing the "upload through the real browser
button" step of the walk, and it reproduced identically in **two independent browser
engines** (the Claude-in-Chrome extension driving real Chrome, and Playwright's own
Chromium), which rules out a one-off automation quirk.

**Root cause**, read from both `next.config.js` files:

- `apps/designer-portal/next.config.js` derives `supabaseFrameOrigin` from the actual
  configured `NEXT_PUBLIC_SUPABASE_URL` at build time and appends it to `connect-src`
  **even in the production branch** (`supabaseConnectOrigins` ternary, lines ~19-74).
  Its production build's CSP therefore includes `http://127.0.0.1:54321` when that's
  what it was built with, and a client-side fetch to the local Supabase project
  succeeds.
- `apps/client-portal/next.config.js`'s production branch (`isDevelopment ? … : …`,
  line 133) is **fully hardcoded** to
  `https://bkvcixdmuyejfzcijpdg.supabase.co https://api.patina.cloud …` with no
  equivalent dynamic origin appended. A production build (which is what `next build`
  always produces, regardless of `NODE_ENV` passed on the command line — Next.js pins
  `NODE_ENV=production` internally during `next build`) pointed at anything else —
  local Supabase for this QA, or any future non-`bkvcixdmuyejfzcijpdg` project — has
  every direct browser fetch to that origin refused by the page's own CSP, which
  manifests only as `TypeError: Failed to fetch` with **no CSP-violation console
  message and no network request even attempted by the browser's fetch()** (confirmed
  via `javascript_tool` probes: same-origin fetch succeeds, fetch to `127.0.0.1:54321`,
  `localhost:3000`, and `https://example.com` all fail identically from a
  `client-portal` tab; the *same* fetch to `127.0.0.1:54321` from a `designer-portal`
  tab succeeds).

**Consequence for this wave specifically:** `paperwork-upload-form.tsx` does exactly
this pattern (`fetch(`${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/paperwork-upload`)`,
explicitly modeled on `evidence-uploader.tsx`'s "exact pattern," per the wave's own
report). `apps/client-portal/tests/paperwork-link.spec.ts`'s upload test — the wave's
own new Playwright coverage of the acceptance-critical path — **fails against this
production build** for exactly this reason:

```
1) […] › an upload lands unverified on the token's firm
   Error: expect(locator).toBeVisible() failed
   Locator: getByText('Received. Local Dev Studio will confirm it.')
```

(Full paste in §3 below.) The form shows the firm the generic `That did not go through.
Try again.` sentence, never a CORS or CSP message, so a real trade using a real
production build of this portal against anything but the two hardcoded prod hostnames
would see paperwork uploads fail 100% of the time with no actionable error.

**Not new to this wave** — `evidence-uploader.tsx` (pre-existing, `/evidence/[token]`)
carries the identical vulnerable pattern and would fail the same way; W4 is simply the
first time this QA round exercised it, and the wave adds a second surface built on the
same broken assumption. In real Cloudflare-deployed prod this is currently dormant
because `NEXT_PUBLIC_SUPABASE_URL` there already happens to equal one of the two
hardcoded CSP entries — but this exact codebase's own docs record that
`apps/*/.env.local has pointed at Strata prod before` and the client-portal's own
`playwright.config.ts` comment says the same about the local dev server, so "the
Supabase URL differs from the two literals baked into the CSP" is a documented,
recurring class of local-environment event, and it silently breaks every direct-to-
Supabase upload door in this portal when it happens, with a message that never names
the actual cause.

- Severity: **major** (an inert/unreachable act under a realistic and previously-seen
  environment condition; not literally *blocking* today's actual production deploy
  since the two hostnames currently agree, but one accidental repoint away from it,
  and it silently defeats the wave's own e2e coverage of its own acceptance test).
  Confidence: **confirmed** (root-caused in source, reproduced in two browser engines,
  and reproduced by the wave's own new Playwright spec run against the production
  build this QA round was asked to test).

---

## 3. Playwright — the new specs, pasted

**Designer** (`e2e/people/paperwork-inbound.spec.ts`, chromium, `--workers=1`, against
the running production build):

```
Running 1 test using 1 worker
[1/1] […] paperwork-inbound.spec.ts:170:7 › the paperwork door › mint, send, confirm — and the firm's paper word flips
  1 passed (7.1s)
```

Cross-check, same run: `e2e/people/call-sheet.spec.ts -g "logging who was told"` — **1
passed (6.1s)**, matching my own independent manual walk of the same feature (§4).

**Client** (`tests/paperwork-link.spec.ts`, chromium, against the running production
build, `SUPABASE_SERVICE_ROLE_KEY` exported, `functions serve` live):

```
Running 3 tests using 3 workers
[3 tests …]
  1) [chromium] › tests/paperwork-link.spec.ts:224:7 › an upload lands unverified on the token's firm

    Error: expect(locator).toBeVisible() failed
    Locator: getByText('Received. Local Dev Studio will confirm it.')
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found
      239 |     await expect(
      240 |       page.getByText(`Received. ${STUDIO_NAME} will confirm it.`),
    > 241 |     ).toBeVisible();

  1 failed
    [chromium] › tests/paperwork-link.spec.ts:224:7 › an upload lands unverified on the token's firm
  2 passed (7.6s)
```

The 2 that passed: the valid-token render (§3's header/rows/copy) and the
expired/dead-link 404 parity check. The 1 that failed is QA-M1 above — it is a
production-build-only failure; the wave's own report already logs this suite as
"3 passed" (against the *dev-mode* server, where `client-portal`'s CSP branch takes the
permissive `isDevelopment` path with a hardcoded `127.0.0.1:*`) — so this is not a
regression the implementer could have caught on their own gate, it is specific to the
production-CSP branch this QA round is chartered to test.

---

## 4. The rest of the mandated walk

- **"Log who was told" / the seat-window notice, live**: edited the Okonkwo residence
  site access card's lockbox text as Leah, told Luis Ochoa and Ngozi Eze via "Log who
  was told," saved. `studio_touches` gained exactly one row:
  `subject_type='project', direction='out', decision_class='none', authority_check='n/a',
  notice_of='The way in changed 15 Sep 2026. Lockbox, version 4 (QA W4 r1).',
  notified_refs={Luis Ochoa's id, Ngozi Eze's id}` — matches D-1/D-2 and the report's
  worked example exactly. `project_site_access_cards.told_refs` carried the same two
  ids (card written first, per S-7). Clean; no finding.
- **Unsubscribe → next send refused, against the real `_shared/send-email.ts`, not a
  mock**: signed a `channel:<studio_contact_channels.id>` unsubscribe JWT with the same
  `jose` library and the same secret-fallback rule the shipped module uses
  (`UNSUBSCRIBE_TOKEN_SECRET` unset ⇒ `SUPABASE_SERVICE_ROLE_KEY`), hit
  `client-portal`'s real `/api/unsubscribe?token=…` route (a Next.js **server** route —
  not subject to QA-M1's client-side CSP issue, since it's a top-level navigation, not a
  page-JS fetch). `studio_contact_channels.status` flipped `active → unsubscribed` with a
  timestamp. Then imported the real, unmodified `prepareCompliantEmail` from
  `_shared/send-email.ts` into a throwaway Deno script (no `EMAIL_DEV_MODE`, so the real
  suppression branch runs, not the dry-run short-circuit) and called it against the
  now-dead address: `{"state":"suppressed","reason":"channel_unsubscribed", …}`. Negative
  control against a different, still-active address on the same firm
  (`rosa@twin-cities-drywall-plaster.com`) returned `{"state":"ready", …}` — proving the
  suppression is address-scoped, not firm-wide, and that the check is real rather than
  always-on. Clean; no finding. (One incidental observation, not a finding: the
  server-route's redirect Location came back as `http://0.0.0.0:3002/preferences/…`
  rather than `http://localhost:3002/…` — traced to running the standalone `server.js`
  directly rather than through a reverse proxy that sets a Host-derived origin; did not
  chase further since it's a symptom of the `next start`/standalone workaround in §0,
  not of `client-portal`'s own routing code, and the *substance* of the redirect — the
  `status=applied` outcome — was correct.)
- **Cross-tenant forgery on the upload door (spec §9 #3)**: POSTed a real upload to the
  live function with the valid Twin Cities Drywall token *and* a forged
  `company_id=<Lakeshore Painting's id>` in the multipart body. The resulting row's
  `holder_id` was Twin Cities Drywall's — the token's own firm — not the forged one.
  Clean; no finding. (Test row deleted after.)
- **`/pay/<token>` after the CRM-29 hardening, the general path**: minted a fresh token
  via `ensure_invoice_link` against a real seeded "sent" invoice, loaded
  `/pay/<token>` — rendered correctly (screenshot `02-…jpg`). The *specific* two broken
  readers are QA-B2, not this general path.
- **Reject path (spec §9 #7)**: exercised live (§1, QA-B1's repro steps 4-5) — reason
  required and held with `aria-disabled` + a visible sentence until non-blank; exactly
  one `agent_tasks` row landed `compliance_chase` / `awaiting_review`; the rejected row
  was not deleted. Clean on its own acceptance criterion; its *reading* is QA-B1.

---

## 5. MINOR

### QA-MIN1 — a cluster of transient `permission denied for table/view …` + one `Invalid Refresh Token` surfaced in the designer-portal console during normal signed-in navigation

While signed in as Leah and simply navigating between `/doc/<id>` and
`/people?firm=<id>` (no forced sign-out, no manual cookie tampering), the console logged
one `AuthApiError: Invalid Refresh Token: Refresh Token Not Found` and, at a later
navigation, a burst of six `AppError: permission denied for {table,view}
{people_directory_seats, studio_contacts, studio_compliance_documents,
studio_contact_rules, studio_contact_channels, studio_person_affiliations}` all at the
same timestamp, alongside `Failed to fetch RSC payload … Falling back to browser
navigation`. Every time this happened the page went on to render correct, complete data
on the very next paint (confirmed by screenshots taken immediately after) — I never
observed stale, missing, or wrong data reach the screen. I could not isolate whether
this is a genuine session-refresh race in the app or an artifact of driving the
`node .next/standalone/server.js` workaround (§0) rather than the portal's real deploy
path, and did not have budget to chase it further this round. Flagging as an accuracy-
of-signal item, not a functional break I could pin on shipped behavior: never rose to
visibly wrong UI in anything I did.

- Severity: **minor** (per the brief's own rubric this doesn't cleanly fit "reader
  disagreeing with the record" since nothing wrong ever painted — logged for someone
  with more budget to either dismiss as a standalone-server artifact or chase as a
  real transient-auth issue). Confidence: **low / unresolved**.

---

## 6. Settled, not re-litigated

Every item in `rulings.md` §3 (R-A through R-BS) — none of my testing touched a ruled
question. The company-card mint/revoke/confirm/reject UI (R-AC, R-AD, R-AE, R-AF, S-1
through S-10) all matched their ruled shape exactly everywhere I exercised them.
