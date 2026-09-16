# W4 (P3) — round-4 runtime QA, local production builds

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local only: no `db push`, no `functions deploy`, no secrets set. `rulings.md` §3 treated as
settled throughout (not re-litigated below).

**Verdict: NOT clean — zero blocking, one major (mine), one minor (mine), plus a procedural
note and a cross-reference to the parallel round-4 data-edge review's own three majors (not
independently re-verified here — see §5).**

Read before the walk: `build/w4-paperwork-report.md`, `build/w4-studio-report.md`,
`build/w4-help-report.md` (the three surfaces this round covers), `build/upload-door-spec.md`
§3/§6/§9, and `build/w4-fix-log-r3.md` (prior findings, re-checked in §1).

---

## 0. Environment

- `lsof -nP -iTCP:3000/-iTCP:3002 -sTCP:LISTEN` — both free before starting. No port-rule
  intervention needed.
- `pnpm --dir <worktree> run supabase:reset` — clean replay through `00638` +
  `20260910152111_create_contact_messages.sql`, all 27 seed files. Ran **twice** (see §4).
- Builds, inline env only (no `.env.local` anywhere), both `next build --webpack`:
  - `@patina/designer-portal` — exit 0, `ƒ /preferences/unsubscribe` present.
  - `@patina/client-portal` — exit 0, `ƒ /paperwork/[token]` present.
- `next start -p 3000` / `next start -p 3002` in the background (both logged the expected
  `⚠ "next start" does not work with "output: standalone"` notice — informational, both
  served real traffic throughout; `designer / → 200`, `client / → 307`).
- `supabase functions serve paperwork-upload --no-verify-jwt --workdir <worktree>` in the
  background — served every function in `supabase/functions/` (the CLI does not filter to
  the one name passed; harmless locally, `paperwork-upload` OPTIONS → 204 confirmed).
- Stopped at the end: both `next start` processes killed by port, functions-serve killed by
  pattern. `lsof -nP -iTCP:3000/-iTCP:3002 -sTCP:LISTEN` empty afterward — **ports confirmed
  free**.
- Server console logs: designer-portal showed two benign `AuthApiError: Invalid Refresh
  Token` lines (expected — a `supabase:reset` invalidates any live session's refresh token);
  client-portal logged one `pay_link_ratelimit_missing` structured warning when the `/pay`
  page loaded (missing Cloudflare `PAY_LINK_RATELIMIT` binding in local `next start` — a
  known local-only gap, not a W4 regression; the page still rendered). Browser console (both
  portal tabs, DevTools protocol) — **clean**, no errors, checked after every real action.

---

## 1. Prior findings (fix-log-r3), re-checked fresh

| id | fix-log-r3 claim | re-check this round | verdict |
|---|---|---|---|
| W4R3-1 (R3-MAJOR-1) | channel gate widened, record stays narrow | `deno test` on `email-channel-status.test.ts` + `send-email.test.ts` → 19 + 21 passed | **holds** |
| W4R3-2 (R3-MAJOR-2) | unsubscribe suite added | walked the real `/preferences/unsubscribe` page on the live client-portal build (§3) — applies, scopes to the one channel, no cross-subject write | **holds, and independently walked end to end (not just unit-tested)** |
| W4R3-3 (R3-MAJOR-3) | merge carries the paperwork door | SQL suite blocks 10 / 10b green on a **fresh** reset | **holds** |
| W4R3-4 (R3-MAJOR-4) | UTC calendar day fixed via `touchInstantDay` | **holds for `use-touches.ts` / `use-inbound-documents.ts`** (walked live, see §3 — the inbound queue band correctly read "uploaded 15 Sep 2026" for an event at 19:11 CDT / 00:xx UTC) — **does NOT hold for `access-grant-list.tsx`'s `grantRowParts`**, a sibling reader of the same defect class the fix never touched. New finding, §2 F1 |
| W4R3-5 (R3-MAJOR-5) | `flushDeferredMessages` writes a touch | `deno test` on `sms.test.ts` → 46 passed | **holds** (not independently re-walked; no real SMS rail available locally) |
| W4R3-6 (R3-MAJOR-6) | account-less unsubscribe no longer hits a sign-in wall | walked the actual `/preferences/unsubscribe` page (client-portal) unauthenticated — rendered, applied, no redirect | **holds** |
| W4R3-7 (QA-MAJOR-1) | mint band's before/after date agree | **walked live**: band offered "Ends with the job — 9 February 2027", post-mint sentence read "…until 9 February 2027", Access grants row read "Ends 9 February 2027" — all three agree | **holds** |
| W4R3-8 (code-MAJOR-1) | `other_named` prints its own label | not independently re-walked (my test document was `Licence`, a named type, not `other_named`); `deno`/`vitest` suites cited in the fix log were not re-run by me this round | **not re-verified this round — no contrary evidence found either** |
| W4R3-9 (code-MAJOR-2) | seat-window band keeps focus | not walked (out of the three-surface + paperwork-door scope this round's brief names); jest suite not re-run by me | **not re-verified this round** |
| W4R3-10 (code-MAJOR-3) | letterbox pay act stays mounted | not walked (client-portal `/pay` walk this round used the payment-method page, not the letterbox disclosure specifically); jest suite not re-run by me | **not re-verified this round** |
| W4R3-11 (code-MAJOR-4) | mint band sends the day it offers | **walked live**, same evidence as W4R3-7 — chosen day (9 Feb) reached the RPC and the receipt without re-derivation | **holds** |

SQL suites re-run at HEAD (fresh reset): `w4_channels_touches_paperwork_test.sql`,
`w1a_identity_channels_consent_test.sql`, `w1b_compliance_authority_directory_test.sql`,
`w3_merge_sweep_household_test.sql` — **all four green** (see §4 for why the first pass of
w1b failed and was not a product bug).

---

## 2. Findings

### F1 — MAJOR — the Access grants list prints the UTC calendar day for an ordinary evening event, disagreeing with the correctly-converted date one region above it on the same card (confidence: high — reproduced live, corroborated by an existing test fixture)

`apps/designer-portal/src/components/document/people/access-grant-list.tsx` (`grantRowParts`,
importing `formatSeatDate` from `./seat-line`)

**The defect.** `grantRowParts` reads:

```ts
const minted = formatSeatDate(grant.granted_at?.slice(0, 10));
if (minted) parts.push(`minted ${minted}`);
const used = formatSeatDate(grant.last_used_at?.slice(0, 10));
if (used) parts.push(`used ${used}`);
```

`granted_at` and `last_used_at` (`paperwork_link_tokens.created_at` / `.last_used_at`, and the
analogous columns on every other grant tier) are **timestamptz**, returned by PostgREST as a
UTC instant. `.slice(0, 10)` takes the UTC calendar day directly — exactly the bug W4R3-4
(R3-MAJOR-4) found and fixed for `studio_touches` and inbound-document timestamps via a new
`touchInstantDay(value)` that converts through `STUDIO_TIME_ZONE` (`America/Chicago`) before
formatting. `formatSeatDate` itself is the WRONG tool for a timestamptz value — its own
docstring says so, for the opposite direction: *"Parsed by parts, never by `new Date(string)`:
a DATE column parsed as a timestamp lands a day early west of UTC."* It is designed for a
genuine zoneless `date` column; `access-grant-list.tsx` hands it a sliced timestamptz instead,
which reproduces the mirror-image of the bug it was written to avoid.

**Reproduced live, this session, real clock.** Local wall time when I minted the paperwork
link for Twin Cities Drywall & Plaster: **19:09–19:11 CDT, 15 September 2026** (confirmed via
`date`, and via `select now(), now() at time zone 'America/Chicago'` on the local Postgres:
`2026-09-16 00:09:24+00` / `2026-09-15 19:09:24` Chicago). The company card's screenshot from
this exact session shows, in the SAME viewport, one region above the other:

```
Paperwork link · one firm's paperwork, to send it in · minted 16 Sep 2026 · used 16 Sep 2026
Ends 9 February 2027.

PAPER
1 DOCUMENT WAITING FOR YOUR CHECK
Licence, uploaded 15 Sep 2026 by Twin Cities Drywall & Plaster.
```

Both lines describe events from the same evening. The inbound-queue line (`inboundDocumentLine`,
fixed under W4R3-4) correctly reads **15 Sep**. The Access-grants line, three rows above it on
the identical card, reads **16 Sep** for the identical evening — a day later, because it never
went through the studio-timezone conversion. Screenshot:
`build/qa-w4-r4/04-FINDING-grant-date-off-by-one-vs-inbound-date-correct.jpg`.

**The bug is not merely untested — an existing test bakes in the wrong answer.**
`apps/designer-portal/src/components/document/people/__tests__/reach-access.test.tsx:775-789`
asserts:

```ts
granted_at: "2026-10-12T00:00:00Z",
...
last_used_at: "2026-10-17T00:00:00Z",
...
"Field link · the Call Sheet and the site access card · minted 12 Oct 2026 · used 17 Oct 2026"
```

`2026-10-12T00:00:00Z` is `2026-10-11 19:00` in Chicago (CDT, UTC-5) — the studio's own
calendar day is the **11th**, not the 12th. The test fixture was authored with the bug already
present and asserts the UTC day as if it were correct, so a correct fix would need this
fixture updated in the same change, not just the production code.

**Scope.** Every tier `grantRowParts` renders (all twelve `v_access_grants` branches: field
link, paperwork link, invoice pay link, plan/RFQ/evidence/trade links, etc.) is affected
whenever the real `granted_at` or `last_used_at` instant falls in the roughly 5–6 evening
hours (CDT/CST) that land on the next UTC calendar day — which is exactly the hours a studio
is most likely to be minting or using one of these doors.

**Why this is MAJOR, not blocking.** No token is accepted wrongly, nothing is overwritten, no
tenant boundary is crossed — it is a reader disagreeing with the record, the QA brief's own
MAJOR criterion, on a fact (when a grant was minted or last used) the studio may rely on for
an audit trail.

**Suggested fix.** Route `granted_at` / `last_used_at` through the same `touchInstantDay` (or
an equivalently-exported studio-timezone formatter from `use-touches.ts`) before `grantRowParts`
formats them, instead of `formatSeatDate(value.slice(0, 10))`; update the `reach-access.test.tsx`
fixture at lines 775–789 (and any sibling case using a `T00:00:00Z` boundary) to assert the
studio-local day.

---

### F2 — MINOR — the upload-door spec and the paperwork surface report both describe a `404`/`notFound()` dead-link behavior the shipped code deliberately does not use (confidence: high)

`build/upload-door-spec.md` §3 ("`404` on any non-answerable state … so a dead link never
confirms it once existed") and §9 acceptance item 4 ("An expired or revoked token **404s the
page**"); `build/w4-paperwork-report.md` line 21 ("`notFound()` on every miss") and line 107
("three flavours of dead link all **404**").

**What actually ships**, verified live against the running production build:

```
$ curl -sI http://localhost:3002/paperwork/nonexistent-token-xyz
HTTP/1.1 200 OK
```

`apps/client-portal/src/app/paperwork/[token]/page.tsx` renders a custom `<DeadLink/>`
component (HTTP 200, `data-testid="paperwork-dead-link"`, "This link isn't available…") on
every miss, and its own header comment explains why in detail — this was a deliberate
**W4 r2 MAJOR-4** fix: the original `notFound()` bounced an account-less recipient into the
portal's generic 404 page, whose only act points at `/`, which the middleware then guarded
behind a sign-in wall. The replacement is correct and I have no finding against the behavior
itself — the fallback is a real fail-safe design decision, not an accident. The corresponding
test file (`src/app/paperwork/[token]/__tests__/page.test.tsx`) correctly asserts the
`DeadLink` render, never a 404 status or a `notFound()` call.

The spec text and the paperwork report's own file/test-coverage tables were never updated
after the r2 pivot, so a reader of either document (including whoever wrote acceptance item 4)
would expect a real HTTP 404 and instead finds a 200. Per the brief: accuracy of the wave's own
report/spec text is MINOR and never gates the round, but it should be corrected so the next
reader doesn't re-litigate a settled, correct decision as if it were an open gap.

---

## 3. The walk (Leah → mint → Rosa → upload → confirm → paper word; unsubscribe; pay link)

All on the real local-production builds above, real local DB, no mocks.

1. **Signed in as Leah** (`designer@patina.dev` / `password123`) on the running designer-portal
   build.
2. **People Room** (`/people`) — `40 people · 21 firms` (matches the fresh-reset baseline
   exactly). Opened **Twin Cities Drywall & Plaster**'s company card
   (`/people?firm=d0e20000-...-000006`). Rosa Delgado listed as `office_manager · paperwork
   contact · site contact`. Paper region baseline: W-9 current, no inbound band.
   Screenshot: `01-company-card-paper-baseline.jpg`.
3. **Mint a paperwork link.** Band opened exactly to spec: *"The door can end with this firm's
   work here, 9 February 2027."*, three radios (`Ends with the job`, `Thirty days`, `Their next
   window`), "Ends with the job" pre-selected. Pressed **Open the door**. Got a raw 64-hex token
   and *"This address is shown once. Twin Cities Drywall & Plaster can send their paper here
   until 9 February 2027."* — the band's offered day and the post-mint day agree (W4R3-7/11
   holds). Screenshot: `02-paperwork-link-minted.jpg`.
4. **Fresh context, as Rosa**, opened `http://localhost:3002/paperwork/<token>`. Page showed:
   `Licence is not on file.` (upload form open by default), `COI, general liability, current.`,
   worst-paper-first ordering as spec'd. No sentence tells the firm what happens if it does not
   upload (verified by reading the rendered copy directly — matches spec §3's stated posture).
5. **Uploaded a small generated PDF** (`test-license.pdf`, ~0.5 KB) with Number `LIC-QA-4471`,
   Issuer `MN Dept of Labor`, Expires `12/31/2027`, through the real `paperwork-upload` edge
   function (served locally, anon key, multipart). Result: *"Received. Local Dev Studio will
   confirm it."* — exact spec wording. Console clean. Screenshot: `03-rosa-upload-received.jpg`.
6. **Back on Leah's card**, the inbound queue band appeared: *"1 document waiting for your
   check"*, row *"Licence, uploaded 15 Sep 2026 by Twin Cities Drywall & Plaster."* with
   **Confirm** / **Reject**, sitting above the Paper table as spec'd. (This is also where F1
   was found — the Access-grants row directly above reads "minted/used 16 Sep 2026" for the
   same evening.) Screenshot: `04-FINDING-...jpg`.
7. **Confirmed** — two-step inline confirm (*"Confirming makes this the paper the studio
   holds. The certificate it replaces is retired, kept, and readable."*), pressed **Confirm the
   document**. Toast: *"Licence, uploaded 15 Sep 2026 by Twin Cities Drywall & Plaster is
   confirmed."* The Paper table now reads **Licence · LIC-QA-4471 · MN Dept of Labor · 31 Dec
   2027 · held by the studio · CURRENT** — the paper word flipped. The inbound band cleared
   (no more pending rows). Screenshot: `05-paper-word-flipped-current.jpg`.
8. **Rosa's own page**, reloaded, now reads `Licence, current.` alongside the other two —
   both sides of the door agree.
9. **"Log who was told"** — `notification_log` carries exactly two `compliance_document_inbound`
   / `in_app` rows for this upload, addressed to the studio's **owner** (Leah, who also
   happened to be the minter — no duplicate) and its **admin** (Studio Manager) — matches R-AC
   precisely (owners + admins, plus the minter only if not already one of them).
10. **Unsubscribe, via the landing, real page, real DB.** Minted a real channel-scoped
    unsubscribe JWT the same way `generateChannelUnsubscribeUrl` does (HS256, local
    `SUPABASE_SERVICE_ROLE_KEY` as secret, `sub: "channel:<id>"`, issuer
    `patina:notifications`) for a real seeded email channel with no Patina account
    (`priya@hartwellstudio.com`, Priya Natarajan). Visited
    `http://localhost:3002/preferences/unsubscribe?token=...` on the live client-portal build —
    the page correctly did **not** mutate on the GET (renders a confirm screen; the route's own
    comment explains why: a GET is often a mail-client link-scanner, not the recipient).
    Pressed **Unsubscribe me** → POST → *"You've been unsubscribed."* Verified directly against
    the database: **only** `priya@hartwellstudio.com`'s channel row flipped to `status =
    'unsubscribed'`; `designer@patina.dev`, `dale@hartwellstudio.com`, and
    `adaeze@okonkwo-household.com` are untouched — **no forged cross-subject write**.
11. **Confirmed the next send would be refused**, against the real database (not a mock): the
    exact PostgREST query `resolveContactChannel` issues
    (`studio_contact_channels?value=eq.priya@hartwellstudio.com&channel_kind=in.(email,ap_email)`
    with the `studio_contacts!inner(organization_id)` embed that W4R2's own BLOCKING fix
    depends on) returns `status: "unsubscribed"` — `channelRefusesSend('unsubscribed')` is
    `true`, so the next letter on any rail (account-holder or not, per W4R3-1's widened gate)
    is refused. I did not attempt an actual outbound send (no Resend key configured locally;
    `resolveContactChannel`'s read is the gate, and it is confirmed correct against real data).
12. **Pay link, not broken by the backfill.** Minted a fresh invoice-link token for a real
    seeded `sent` invoice (`ensure_invoice_link`, called as `service_role` since the RPC has no
    `authenticated`/`anon` grant by design) against the **00636/00638-hardened** schema
    (`token_hash`, `expires_at`, plaintext `token` column frozen NULL). Opened
    `http://localhost:3002/pay/<raw token>` on the live build — resolved correctly: full
    invoice (`INV-2026-0142`, $4,250.00, three payment-method rows with live surcharge math).
    Console clean. **The `/pay` resolution and checkout-selection path is not broken by this
    wave's invoice-link hardening.**

Screenshots: `build/qa-w4-r4/01`–`05` above (all copied off the ephemeral tool cache into the
worktree so they survive).

---

## 4. Procedural note (not a finding, not gate-relevant)

My **first** pass at the four SQL regression suites (run right after the client-portal
Playwright spec, before the DB was reset again) hit a hard `ERROR` in
`w1b_compliance_authority_directory_test.sql` block 3m: `expected 21 firm cards, got 27`.
Traced with a debug dump: the six extras were `Paperwork E2E <hex>` company rows — throwaway
fixtures `tests/paperwork-link.spec.ts` creates per test run, by its own documented design
(*"Cleanup: rows are left in place under throwaway company cards. This is the LOCAL stack and
`supabase db reset` is the broom."*). I had run that Playwright spec twice (once failing before
the edge function was up) before running the SQL suites, so six residual companies were still
in the shared local DB when block 3m's fixed-count assertion ran. A second `supabase:reset`
immediately before the SQL suites (and running them **before** any Playwright spec from then
on) reproduced all four suites green with no code change. **Not a product defect** — flagged
per the brief's minor category (test-file/coverage accuracy) only because the w1b suite's
exact-count assertions are silently coupled to zero E2E residue in the shared DB, which is easy
for a future round to trip over the same way. No fix owed to product code; worth a comment in
the w1b suite noting the coupling, or reordering the standing QA procedure to always reset
immediately before the SQL suites.

---

## 5. Cross-reference: the parallel round-4 data-edge review (not independently re-verified here)

`build/w4-review-r4-data-edge.md` is already staged in this worktree (git status: `A`), covering
migrations/edge/hooks I was not asked to re-read line-by-line this round. It reports **zero
blocking, three major, twenty-five minor**, independent of everything in this file. Noted here
only so the aggregate picture isn't blind to it — none of its three majors are double-counted
in this file's own verdict, and I did not re-verify any of them myself:

- **Their MAJOR 1** — the designer invoice-folio's `Copy link` / `Regenerate link` acts are
  gated on `clientInvoiceUrl`, which only becomes non-null AFTER one of those same acts has
  already run once (00636 changed `get_invoice_link` to return `token: NULL`) — an
  unreachable-act shape. This is consistent with, and does not contradict, my own §3 step 12:
  the underlying `/pay/<token>` resolution and payment-method UI work correctly once a token
  exists (I minted mine directly via the `service_role`-only RPC, bypassing the folio's own
  broken UI gate entirely). So: the **pay-link backend is not broken by the backfill** (my
  finding), but **the designer's own UI path to producing a shareable link is** (their finding)
  — two different layers, not a contradiction.
- **Their MAJOR 2** — the account-less unsubscribe outcome page's copy names the letter's own
  narrow notification type (e.g. "po sent emails") while the record actually silences the whole
  address, studio-wide. My own unsubscribe walk (§3 step 10) deliberately minted an
  `all_marketing`-typed token, which takes the OTHER copy branch ("We've turned off all
  marketing emails…") — so I did not personally reproduce their specific narrow-type scenario,
  but nothing I saw contradicts it, and the code they cite (`unsubscribe.ts` ignoring the `type`
  claim on write while the landing branches on it for copy) matches what I read.
- **Their MAJOR 3** — `sms-inbound`'s START/YES branches write no touch. Outside anything I
  exercised this round (no real SMS rail locally).

---

## 6. Settled, not findings

Every ruling in `rulings.md` §3 (R-A through R-BS) — none reopened. R-AB in particular: every
inert act I exercised via the specimen decks is out of scope for this round's build QA (this
round exercises the BUILT paperwork door and studio card, which are real writes, not
specimens).
