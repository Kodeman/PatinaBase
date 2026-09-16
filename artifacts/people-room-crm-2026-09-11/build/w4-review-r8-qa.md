# W4 — Runtime QA, round 8 (local production builds)

Scope: `/paperwork/[token]` guest upload door + designer-side confirm/reject +
"log who was told" + unsubscribe/send-refusal, walked end-to-end against
**local production builds** (`next build` + `next start`, never `next dev`) of
both portals, plus `supabase functions serve paperwork-upload --no-verify-jwt`.
Reports read first: `w4-review-r7-{code,data-edge,qa}.md`, `w4-fix-log-r7.md`,
`upload-door-spec.md` §3/§6/§9, `rulings.md` §3.

This round's sibling surface reports (`w4-review-r8-code.md`,
`w4-review-r8-data-edge.md`) were already on disk when this walk started; where
this walk independently touched the same code paths, the overlap is called out
below rather than re-argued.

## 1. Procedure

- **PORT RULE**: 3000/3002 checked with `lsof -nP -iTCP:<port> -sTCP:LISTEN` —
  both free at start; no kill needed, no conflict to report.
- **Reset**: `supabase db reset --workdir .../agent-people-build` (clean).
- **Builds**: `next build` then `next start` for both portals, all env passed
  inline per the binding instruction — `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` from
  `supabase status -o env`, `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`,
  `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`, plus each portal's
  `.env.example` service-URL vars. No `.env.local` created or read.
- **Edge function**: `supabase functions serve paperwork-upload --no-verify-jwt
  --workdir .../agent-people-build`, backgrounded.
- **Playwright**: designer-portal and client-portal suites run against the
  already-listening `next start` servers (`PW_SKIP_WEBSERVER`-style reuse via
  already-open ports; `reuseExistingServer` config).
- **Teardown**: designer-portal, client-portal and the edge-function server all
  killed at the end; `lsof -nP -iTCP:3000/3002 -sTCP:LISTEN` empty afterward
  (confirmed twice, see §7).

One process hiccup, not a product finding: an early `env $(cat … | sed …)`
reconstruction of runtime-only vars corrupted `SUPABASE_SERVICE_ROLE_KEY` on
the first server boot, which made designer-portal's middleware fail its admin
role lookup and bounce every signed-in test user to `/unauthorized`. Root-
caused via direct curl replication of the exact PostgREST query the middleware
runs, then fixed by `source`-ing a clean env file before `next start` instead
of reconstructing it. Both portals were restarted; all runtime evidence below
is from the corrected processes.

## 2. Playwright suites

**designer-portal** (chromium):
- `e2e/people/paperwork-inbound.spec.ts` — **passed**.
- `e2e/people/call-sheet.spec.ts` — 3/4 passed. The failing case
  ("task 3 — who has site access") uses `page.locator('a[data-tel-link]').first()`
  unscoped to the open site-access dialog; the roster stays mounted beneath the
  sheet (by design, CLAUDE.md D1), so the unscoped query hits the roster's own
  earlier tel-link, not the dialog's. Confirmed by dumping all 31
  `data-tel-link` elements and a dialog-scoped version, which resolves
  correctly. **MINOR** — stale/fragile locator in a pre-existing test file,
  not a W4 defect.

**client-portal** (chromium):
- `tests/paperwork-link.spec.ts` — **passed** (all cases).
- `tests/pay-link.spec.ts` — 8/10 passed across the file; 2 failures, both
  pre-existing test-authoring issues unrelated to W4:
  - a return-hop assertion expects the *same* token after a successful
    Checkout return; the correct, by-design behavior (confirmed against
    `supabase/tests/billing/invoice_links_test.sql:1068-1176`) is that success
    **rotates** the token. **MINOR**, confidence medium-high.
  - an "open the invoice" locator that no longer matches; the live UI's
    buttons are "Pay $X" and "Open the letterbox" (confirmed via
    `error-context.md` snapshot). **MINOR**, confidence medium.

## 3. The walk (Leah → Rosa → Leah), local prod builds, real Inbucket-style flow

All screenshots at
`artifacts/people-room-crm-2026-09-11/build/qa-w4-r8/`.

1. Leah signs in (designer-portal, 1440px), opens Twin Cities Drywall &
   Plaster's company card, mints a 30-day paperwork link.
   → `01-mint-designer-card.png`.
2. Fresh browser context, 390px, as Rosa (no cookies shared with Leah's
   session — a genuinely separate guest visit). Opens `/paperwork/[token]`.
   Licence reads "Licence is not on file." with the upload form already open
   (spec §3). → `02a-firm-page-before-upload-390.png`.
3. Rosa attaches a generated PDF, fills Number/Issuer/Expires, submits.
   The page shows "Received. Local Dev Studio will confirm it." —
   **but the row's own sentence directly above still reads "Licence is not on
   file."** at the same moment. → `02b-upload-receipt-390.png` (see Finding 1).
4. Leah reloads; the inbound-queue band appears for the new document.
   → `03-inbound-band-designer.png`.
5. Leah confirms (two-step: "Confirm" → "Confirming makes this the paper the
   studio holds." → "Confirm the document"); the inbound band clears.
   → `04-confirmed-designer-paper.png`.
6. Rosa reloads her page: Licence now reads "current." A fresh, independent
   navigation to the same URL (not a `page.reload()`) renders this instantly
   and cleanly at every sampled timepoint (26ms/1s/3s/networkidle) — see note
   below. → `05-firm-page-flipped-390.png`.
7. Leah opens the Okonkwo residence call sheet → site access card → "Log who
   was told" → checks Rosa Delgado → "Save this note."
   → `06-log-who-was-told.png`. Verified against the database (§5): a new
   `studio_touches` row (`direction='out'`, `subject_type='project'`,
   `subject_id`=Okonkwo, `notified_refs={<Rosa's project_parties id>}`) and
   `project_site_access_cards.told_refs` grew to include that same id. **Pass,
   no finding.**

**Note on screenshot 05 / the original capture**: the first attempt's `05`
screenshot (taken immediately after a Playwright `page.reload()` +
`toContainText('current')` assertion had already passed) briefly caught a
full-page "LOADING…" spinner instead of the content — a transient frame of the
hard-reload transition, not a hang. A direct, non-reload navigation to the
same confirmed-current URL was re-verified separately: content is present at
domcontentloaded (26ms) and stays present through networkidle, no spinner at
any sampled point. Replaced `05` with that clean capture; not filed as a
finding (the original was a screenshot-timing artifact of the test, not
reproducible app behavior — confirmed not to hang or flap by resampling).

## 4. Unsubscribe → confirm the next send is refused (per-address, not per-company)

Used the real signing/verification scheme
(`packages/notifications/src/tokens.ts`, HS256, `UNSUBSCRIBE_TOKEN_SECRET` →
falls back to `SUPABASE_SERVICE_ROLE_KEY` locally, exactly as the running
client-portal server resolves it) to mint a genuine `channel:<id>` unsubscribe
token for **Rosa Delgado's own address**
(`rosa@twin-cities-drywall-plaster.com`, `studio_contact_channels.id =
ffb2089b-7869-4534-8b93-0d144a391dbb`) via a throwaway script, deleted
immediately after (confirmed via `git status --short` — no repo changes from
this activity besides the two sibling reports and my own leftover spec file,
both handled separately).

- **Before**: Rosa's channel `active`; Frank's
  (`frank@twin-cities-drywall-plaster.com`) and the company's own
  (`office@twin-cities-drywall-plaster.com`) channels both `active`.
- **POST `/api/unsubscribe?token=…`** (mail-client style, `Accept:
  application/json`, mirroring RFC 8058 one-click) → `200 OK`.
- **After**: Rosa's channel → `unsubscribed` (`status_at` stamped). **Frank's
  and the company's channels unchanged (`active`)** — the stop is
  address-scoped, not company-wide, exactly as `applyChannelUnsubscribe`'s
  comment promises (CRM-12/D-6). Also exercised the browser-facing
  `/preferences/unsubscribe` HTML redirect path by code read
  (`apps/client-portal/src/app/api/unsubscribe/route.ts`); the POST-vs-GET /
  Accept-header branching matches RFC 8058 one-click semantics correctly.
- **Proved the refusal with the real send-gate code**, not a simulation: ran
  a throwaway Deno script (deleted after; `--config` warning noted, no
  `deno.lock` change landed — confirmed via `git status --short`) that
  imports `resolveContactChannel`, `channelRefusesSend` and
  `prepareCompliantEmail` directly from
  `supabase/functions/_shared/send-email.ts` against the live local DB:
  - `resolveContactChannel(..., 'rosa@twin-cities-drywall-plaster.com')` →
    `status: "unsubscribed"`.
  - `channelRefusesSend('unsubscribed')` → `true`.
  - `prepareCompliantEmail(...)` → `{"state":"suppressed","reason":
    "channel_unsubscribed", ...}` — **the next send to this exact address is
    refused by the real gate**, not just by the visible DB flag.
  - **Control**: the same call against `frank@twin-cities-drywall-plaster.com`
    (same firm, different address) → `{"state":"ready", ...}` — confirms the
    refusal is scoped to the one address, not the firm.
- **Cleanup**: reverted Rosa's channel back to `active`/`status_at=NULL`
  afterward so this round's testing doesn't leave the shared local DB in an
  altered state for the next reviewer.

**Pass. No finding** — this is exactly the acceptance-list behavior (unsubscribe
via the landing; next send refused; scope is the address, not the company).

## 5. "Log who was told" — DB verification

Covered inline in §3 step 7. `studio_touches` row and
`project_site_access_cards.told_refs` both landed correctly, with the right
`subject_type`/`subject_id`/`direction`/ref linkage to Rosa Delgado's
`project_parties` row on the Okonkwo residence. **Pass.**

## 6. Browser console — clean

Fresh reloads (not the mid-walk pages) of designer `/desk` sign-in →
`/people?firm=…` → `/doc/[Okonkwo]`, and client `/paperwork/[token]` (already-
confirmed link) at 390px: **zero console errors or warnings, zero
`pageerror`s**, across all four surfaces.

## 7. Teardown

- designer-portal (3000) and client-portal (3002) `next start` processes
  killed.
- `supabase functions serve paperwork-upload` (both the CLI wrapper and its
  child) killed.
- `lsof -nP -iTCP:3000 -sTCP:LISTEN` / `-iTCP:3002` both empty after — ports
  confirmed free.
- Temporary Playwright specs (`walk-w4-r8.spec.ts`, three throwaway probes)
  removed from the worktree; `git status --short` shows no leftover files
  under `apps/`.

## 8. Prior-round (r7) findings — re-check

Both sibling r8 reports independently re-checked r7's six items this round
(`w4-review-r8-code.md` §1, `w4-review-r8-data-edge.md` §2); this walk's own
runtime observations agree with and, on one item, sharpen theirs:

| r7 finding | Status | This round's runtime evidence |
|---|---|---|
| BLOCKING-1/M-3 — cancelled Checkout rotates the pay link (R-BT leg 1) | **FIXED** | Not re-exercised by this walk (out of this round's paperwork-door scope); code/data-edge r8 both confirm via `invoice-checkout-driver.ts` |
| MAJOR-1 — spent nonce rotates again on replay (R-BT leg 2) | **FIXED** | Not re-exercised directly; confirmed by data-edge r8 via the atomic `UPDATE … RETURNING` |
| MAJOR-2/M-2 — an unchecked upload must not read `current`/`not on file` beside its own receipt (R-BU) | **FIXED ON RELOAD — OPEN WITHIN THE SAME SESSION** | **Independently reproduced this round**: the DB-level state is correct (confirmed via a clean reload, §3 step 6), but the live send flow itself still shows "Licence is not on file." directly beside "Received… will confirm it." in the same visit (`02b-upload-receipt-390.png`). Filed here as Finding 1 (this exactly matches code-review r8's own MAJOR-1, filed independently by that surface) |
| MAJOR-3/M-1 — minted invoice address must live in component state, not the cache (R-BV) | **FIXED** | Not re-exercised (invoice band is out of this round's walk scope); code r8 confirms via `invoice-folio.tsx:146`/`:318` |
| MAJOR-4 — a paid invoice's link must not go silent past expiry | **FIXED** | Not re-exercised; data-edge r8 confirms the `status <> 'paid'` exemption |
| MAJOR-5 — `sms-inbound` authority check omits `draw_certify` | **FIXED** | Not re-exercised (SMS rail out of scope); data-edge r8 confirms all seven scopes reachable |
| M-4 — a refused document must reach the firm with the studio's reason | **FIXED** | Not re-exercised this round (walk's document was accepted, not refused); code r8 confirms via `paperwork-sheet.tsx:105-112` |

## 9. New findings this round

### Finding 1 — MAJOR (confidence: high) — the firm's own page contradicts itself the moment it is used
**File**: `apps/client-portal/src/components/paperwork/paperwork-sheet.tsx`
(and `paperwork-upload-form.tsx` for the submit path)

Reproduced live, screenshot `02b-upload-receipt-390.png`: immediately after a
successful upload, the page shows

> **Licence is not on file.**
> Received. Local Dev Studio will confirm it.

two sentences about the same document, one line apart, disagreeing — in the
one visit almost every firm actually makes. This is the same defect
`w4-review-r8-code.md` MAJOR-1 traces to `markReceived` flagging a local
`received` boolean without recomputing the row's own `state`/`sentence`
(`awaiting_check`), rather than a data problem — the database is correct as
soon as the page is reloaded (§3 step 6 shows "current" cleanly on a fresh
load once confirmed). Runtime walk corroborates the static finding
independently.

**Fix**: on `markReceived(key)`, move the row to the `awaiting_check` reading
(state + sentence + `blocksSentence`) instead of only setting a receipt flag,
and extend the existing send-test to assert the row's own sentence, not just
that the receipt appears.

### Finding 2 — MAJOR (confidence: high) — a fast, real click can submit the upload as a native GET and silently drop the file
**File**: `apps/client-portal/src/components/paperwork/paperwork-upload-form.tsx`

The `<form>` has no `method`/`action`/`encType` attributes. In several runs of
the manual walk (not every run), clicking "Send Licence" fired a plain browser
GET-to-self — form fields serialized onto the URL as query params (e.g.
`?file=license.pdf&number=LIC-E2E-R8&issuer=State+of+Minnesota&expires_on=
2099-12-31`) — instead of the React `onSubmit` handler's `fetch()` POST,
because React had not yet attached the handler at the moment of the click.
Confirmed via a network-event probe: the same click sometimes produces the
POST to the edge function, sometimes produces the native GET with the file
silently absent (files cannot serialize into a URL). The component's handler
itself is written correctly (`'use client'`, `preventDefault()`); this is a
pre-hydration race, not a logic bug in the handler.

**Fix**: give the form an inert `method="post"` (with no `action`, so a
pre-hydration submit at least does not navigate/lose the file into a GET) or,
simpler, disable the submit button until the component's `useEffect`-gated
"hydrated" flag is true, matching the pattern already used elsewhere in this
codebase for other pre-hydration-sensitive forms.

### Finding 3 — MAJOR (confidence: high, independently reproduced) — a reversed expiry date returns a false "invalid or expired token" and orphans the uploaded file
**File**: `supabase/functions/paperwork-upload/core.ts`

Independently reproduced `w4-review-r8-data-edge.md` MAJOR-1 against the
running local edge function (fresh, definitely-live token minted seconds
before the call):

```
curl -X POST .../functions/v1/paperwork-upload \
  -F token=<fresh, live token> -F doc_type=license \
  -F issued_on=2099-06-01 -F expires_on=2020-01-01 -F file=@test-license.pdf
→ HTTP 400 {"error":"invalid or expired token"}
```

Confirmed against the database immediately after: the file **did** land in
`storage.objects` (`compliance-documents/…/test-license.pdf`,
`779bea13-2dcf-4d4f-986e-16e4cd1f9e5d`) but **no row** exists in
`studio_compliance_documents` for it — an orphaned object, and a wrong reason
given to the firm for a token that was never in question. Root cause per
data-edge r8: `core.ts` collapses every non-`paperwork_token_invalid` RPC
error (including the `studio_compliance_documents_dates_check` CHECK
violation) into the same "invalid or expired token" 400, and nothing calls
`.remove(key)` on that path.

**Fix**: as data-edge r8 proposes — keep the `paperwork_token_invalid` → 403
arm; for every other error, delete the just-uploaded object and answer with a
message that matches the actual constraint (or validate date ordering in
`core.ts` before the upload ever reaches the bucket).

### Finding 4 — MINOR (confidence: high) — `call-sheet.spec.ts` locator resolves to the wrong roster row
Covered in §2. Test-file issue, not a product defect; the app's own
site-access-card scoped query resolves correctly.

### Finding 5 — MINOR (confidence: medium-high) — `pay-link.spec.ts` asserts the wrong (pre-rotation) token identity on a successful return
Covered in §2; contradicts `invoice_links_test.sql`'s own assertion that
success rotates the token by design.

### Finding 6 — MINOR (confidence: medium) — `pay-link.spec.ts` "open the invoice" locator is stale
Covered in §2; the live UI's buttons are "Pay $X" / "Open the letterbox".

## 10. Verdict

**NOT CLEAN** — three MAJOR findings this round (Findings 1–3), none
BLOCKING. Finding 1 directly corroborates `w4-review-r8-code.md` MAJOR-1
(same root cause, independently reached via runtime evidence). Finding 3
directly and independently reproduces `w4-review-r8-data-edge.md` MAJOR-1
against the running local stack. Finding 2 is new this round, found only
through the runtime walk (a timing-dependent client bug static review would
not surface). All three block on "a reader disagreeing with the record" /
"an inert or unreachable act" per this round's severity definitions; none
rise to BLOCKING (no token accepted without verification, no cross-tenant
access, no verified document overwritten, no email sent to a
dead/unsubscribed channel — the opposite was proven in §4).
