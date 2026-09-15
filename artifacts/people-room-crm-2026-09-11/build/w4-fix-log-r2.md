# W4 (P3) — round-2 fix log

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local only: no `db push`, no `functions deploy`, no secrets, no migration minted (every
fix is portal, hook or edge code). `rulings.md` §3 treated as settled throughout.

Eleven findings from `w4-review-r2-{data-edge,qa,code}.md`, in the order the brief lists
them. The two duplicate pairs (R2-MAJOR-1 = MAJOR-1, R2-MAJOR-2 = MAJOR-3) are answered
once each and cross-referenced.

---

## W4R2-1 — BLOCKING — the suppression gate was dead code against the real schema

**The defect.** `resolveContactChannel` selected
`"id, owner_type, owner_id, organization_id, value, status"` from
`studio_contact_channels`. That table has **no `organization_id` column** — the studio
hangs off the OWNING CARD, which is how 00593's own RLS reads it
(`studio_contact_org(owner_id)`). Every call raised `42703 undefined_column`, the
function's `catch` swallowed it and returned `null`, and `prepareCompliantEmail` read a
null channel as "no channel on file" and sent. The whole CRM-12 dead/unsubscribed gate
(D-4/D-5/D-6) was a no-op for all five account-less senders.

**Confirmed against the live local schema before the fix:**

```
$ psql … -c "\d public.studio_contact_channels"
  id · owner_type · owner_id · channel_kind · value · label · sms_capable · verified ·
  verified_at · preferred · status · status_at · created_by · created_at · updated_at
  (no organization_id)

$ curl …/rest/v1/studio_contact_channels?select=id,owner_type,owner_id,organization_id,value,status
  {"code":"42703","message":"column studio_contact_channels.organization_id does not exist"}
```

**The fix.** `supabase/functions/_shared/send-email.ts` — the lookup walks
`studio_contact_channels_owner_id_fkey` to the card instead:

```ts
.select("id, owner_type, owner_id, value, status, studio_contacts!inner(organization_id)")
```

and the rows are normalised (`studio_contacts` may arrive as an object or a one-element
array depending on PostgREST version) before `worstOf` / the `studioRow` filter, which are
otherwise untouched: the STATUS verdict stays address-wide (D-6) and the SUBJECT stays the
sending studio's own row (B-2). The embed answers, verified live:

```
$ curl …?select=…,studio_contacts!inner(organization_id)&limit=2
  [{"id":"95babcc3…","owner_id":"d0e10000-…-0006","studio_contacts":{"organization_id":"b0000000-…-0001"}}, …]
```

**Why the wave's 15 green tests could not see it, and what now stops that.**
`_tests/email-channel-status.test.ts` drove the real functions against a hand-rolled fake
whose `ChannelRow` carried a fictional flat `organization_id`. The double now projects its
fixtures into the shape PostgREST actually answers with (`studio_contacts: {…}`), records
every `select(...)` string, and a new case pins the real column list:

```
Deno.test("the channel lookup names only columns the real table has, and takes the studio from the owning card")
  → every plain column ∈ CHANNEL_COLUMNS (the 15 columns \d prints), embeds == ["studio_contacts!inner(organization_id)"]
Deno.test("an address on no card at all still resolves to null, not a throw")
```

A flat select of a non-existent column now fails the suite by name.

**Proof, the QA reproduction re-run against the real local database** (the real
`prepareCompliantEmail` and `resolveContactChannel`, imported verbatim, service client,
Rosa Delgado's channel still `unsubscribed` from the QA round, Dana's still `dead`):

```
{"addr":"rosa@twin-cities-drywall-plaster.com","channel":{"status":"unsubscribed","studioRow":"7d84830f-…"},"prepared":"suppressed","reason":"channel_unsubscribed"}
{"addr":"dana@northgate-electric.com",        "channel":{"status":"dead",        "studioRow":"a7148e53-…"},"prepared":"suppressed","reason":"channel_dead"}
{"addr":"office@twin-cities-drywall-plaster.com","channel":{"status":"active",   "studioRow":"fbdca568-…"},"prepared":"ready"}
```

QA read `{"state":"ready"}` for the first of those. It now reads `suppressed`, the live
control still reads `ready`, and `studioRow` populates — so B-2's attribution and D-4's
`List-Unsubscribe` header are reachable code again too.

**Gate:** `deno test --allow-all --config supabase/functions/deno.json
supabase/functions/_tests/email-channel-status.test.ts` → **17 passed, 0 failed** (was 15).

---

## BLOCKING-1 — the paperwork bearer token shipped to PostHog in the clear

**The fix.** `paperwork` added to `HEX_BEARER_IN_URL` in **both** portals, and `trade`
added to the designer one, which was missing it as well:

- `apps/client-portal/src/lib/analytics/posthog.ts` →
  `/\/(share|rfq|evidence|plans|pay|trade|paperwork)\/(?:return\/)?[0-9a-f]{64}(?![0-9a-f])/gi`
- `apps/designer-portal/src/lib/analytics/posthog.ts` → the same alternation, with the
  comment saying why both live-capability prefixes belong there (the designer face renders
  each address raw, once, at the mint).

**Tests.** `apps/client-portal/.../posthog-privacy.test.ts` gains the per-prefix
`paperwork` case the file's one-test-per-prefix convention asks for, a `$pageview` case
(the one event this page always fires), and a `HEX_BEARER_PREFIXES` table-driven case over
all seven prefixes so a new guest prefix cannot be registered in `middleware.ts` and
`app-chrome.tsx` without a case here. The designer mirror gains an
`it.each(['trade','paperwork'])` autocapture case.

**Gates:** client `posthog-privacy.test.ts` → 19 passed (was 13); designer → 11 passed
(was 9).

---

## R2-MAJOR-1 / MAJOR-1 — two of `confirm_inbound_document`'s refusals reached the studio as raw tokens

**The fix.** `packages/supabase/src/hooks/use-inbound-documents.ts` —
`INBOUND_REFUSAL_SENTENCES` gains both tokens, in the studio's own words, taken from
00637's own HINTs:

- `compliance_confirm_already_lapsed` → "This paper has already lapsed, so it cannot retire
  the paper on file. Ask the firm for a current one."
- `compliance_confirm_ends_sooner` → "This paper ends before the one it would retire. Ask
  the firm for a renewal that runs at least as long."

The map now names **all eight** `compliance_*` tokens 00637 raises
(`grep -n "RAISE EXCEPTION" 00637_paperwork_upload_door.sql` → lines 807, 810, 848, 856,
866, 872, 923, 926, 931).

**Tests, at both layers the token can travel through:**

- `packages/supabase/.../people-crm-w4.test.ts` — `it.each` over all eight tokens asserts
  `asInboundDocumentError` returns something that contains neither the token nor the string
  `compliance_`, and ends in a full stop.
- `apps/designer-portal/.../inbound-queue-band.test.tsx` — the mock now takes the REAL
  `asInboundDocumentError` via `jest.requireActual`, and `it.each` over six tokens drives
  the same path the hook takes (`throw new Error(asInboundDocumentError(e))`) and asserts
  the `role="alert"` region never carries the schema word.

**Gates:** supabase vitest `people-crm-w4.test.ts` → 48 passed; designer
`inbound-queue-band.test.tsx` → 12 passed (was 6).

`w4-fix-log-r1.md`'s M-3 sentence, which claimed this was already done, is corrected in
place with a dated CORRECTION block.

---

## R2-MAJOR-3 — B-2's narrowing dropped the bounce write-back for an unattributable letter

**The fix.** `supabase/functions/resend-webhook/index.ts` — `writeChannelStatus` is called
by ADDRESS **before** `handleResendEvent`'s `if (!logEntry) return { matched: false }`
early return. `channelStatusForEvent` already answers `null` for everything that is not a
bounce or a complaint, and `applyChannelStatus` already no-ops on an empty address, so the
call is inert for every other event and for an event with no `to`.

The narrowing B-2 made is untouched: the *touch* and the *deliverability ref* still come
only from the sending studio's own row. What is restored is the separate question — D-6's
"a dead mailbox is dead for everyone, whoever's letter found out".

**Tests** (`resend-webhook/index.test.ts`; the stub client grew an optional channel-row
fixture and records writes per table):

```
an UNMATCHED hard bounce still kills the address on every card  → status 'dead', both ids, no notification_log write
an UNMATCHED complaint unsubscribes the address                 → status 'unsubscribed'
an UNMATCHED event that is neither                              → writes nothing at all
```

**Gate:** `deno test … supabase/functions/resend-webhook/` → **32 passed, 0 failed**
(was 29).

`w4-fix-log-r1.md`'s B-2 sentence, which asserted the opposite, is corrected in place with
a dated CORRECTION block.

---

## W4R2-2 — a live `paperwork_link` grant never reached the company card's Access grants

**The fix, by TIER rather than by `subject_type`.** A new export in
`packages/supabase/src/hooks/use-access-grants.ts`:

```ts
export const FIRM_SCOPED_ACCESS_GRANT_TIERS: readonly AccessGrantTier[] = [
  'agreement_link',
  'paperwork_link',
] as const;
```

`apps/designer-portal/.../reach-access.tsx`'s `shownGrants` filters on that list instead of
`grant.subject_type === "contact"`. The review's own preference, and the one that cannot
repeat: a third firm-scoped tier with a third `subject_type` would have tripped the old
filter again.

**Live confirmation of the row shape** (all live paperwork doors, including the one QA
minted for Twin Cities Drywall & Plaster, `d0e20000-…-0006`):

```
$ psql … "select tier, subject_type, … from public.v_access_grants where tier='paperwork_link';"
  paperwork_link | company | d0e20000-…-0006 | t | 2026-10-15 23:59:59+00
  … 5 rows, every one subject_type = company
```

**Tests.** `reach-access.test.tsx` takes the REAL `FIRM_SCOPED_ACCESS_GRANT_TIERS` via
`jest.requireActual` and gains two cases: a live paperwork door prints on the firm's card
*with its Revoke*, and both firm-scoped tiers stand on the same card while a crew member's
`field_link` still does not.

**Live proof, on the real production build against the real DB** — a new block in
`apps/designer-portal/e2e/people/paperwork-inbound.spec.ts`, run immediately after the mint
in the same journey:

```
[data-access-grant-list] visible
[data-access-grant^="paperwork_link:"] → 1 row, text "Paperwork link"
"No grant on file." → 0
Revoke button on that row → visible
```

**Gates:** designer `reach-access.test.tsx` → 50 passed (was 48); e2e
`paperwork-inbound.spec.ts` (chromium, `--workers=1`, `next build` + `next start` on :3000)
→ **1 passed**.

---

## MAJOR-2 — the mint band offered an engagement window that had already passed

**The fix.** `packages/supabase/src/hooks/use-paperwork-links.ts` —
`firmEngagementWindowEnd(seats, companyId, now = new Date())` drops any day that is not
still ahead, matching `mint_paperwork_link`'s own predicate exactly
(`v_window_end::timestamptz + interval '1 day' > now()`, 00637:470-475 — which keeps a
window ending TODAY, so the face keeps `day >= today` rather than `day > today`).
`company-card.tsx` passes its own `today` through.

A firm whose only open seat has a lapsed `on_site_to` now reads `NO_ENGAGEMENT_SENTENCE`
and defaults to thirty days, so the band no longer prints a date, pre-selects it, and then
meets `paperwork_link_window_required` on its own default choice.

**Tests.**

- `people-crm-w4.test.ts` — a lapsed window returns null; a window ending TODAY is kept
  (the RPC's predicate runs to end of day); the reduction takes the latest day still
  AHEAD, never the latest day outright (a lapsed warranty on a second open seat must not
  win).
- `paperwork-link-act.test.tsx` — the case the review asked for, composed through the REAL
  derivation (`jest.requireActual`): a seat with `on_site_to: "2026-03-01"` at `NOW =
  2026-09-15` yields no window, the band offers **no** "Ends with the job" radio, prints no
  "1 March 2026", says `NO_ENGAGEMENT_SENTENCE`, and pre-selects "Thirty days". A twin case
  keeps a future window offered.
- `company-card.test.tsx` — its double, which reproduced the function body WITHOUT the
  ahead-of-today test, is replaced by the real function via `jest.requireActual`.

**Gates:** `paperwork-link-act.test.tsx` → 10 passed (was 8); `company-card.test.tsx` → 25
passed; `people-crm-w4.test.ts` → 48 passed.

**Named, not closed.** The review's *second* leg — the RPC scopes its window to
`project_tenant_org(pp.project_id) = v_org` and the face does not, so a firm whose only
future-dated open seat sits on a studio-less legacy project (R-BD / R-BI) still produces
the contradiction — is **not** fixed here, and this is its owner rather than an unowned
"owed". `people_directory_seats` carries no tenant-org column
(`identity_key, person_id, seat_id, project_id, …, company_id, …, scope` — 30 columns, no
org), so closing it needs one of: a column on that view (a migration, which this round was
not to mint), or the band sending its chosen day explicitly so the RPC stops re-deriving.
The population is the one R-BD is already draining (W3 backfills `projects.studio_id`; the
W7 preflight counts the remainder on Strata), so the recommendation is to let the preflight
count settle it and re-open only if Strata still holds studio-less projects carrying
seats. **Owner: W7 preflight. Ruling asked of Fable.**

---

## R2-MAJOR-2 / MAJOR-3 — the client letterbox offered no pay act for any invoice

**The ruling this takes.** The review offered three: point the act at `/?invoice=<id>`,
mint the address on the fly, or drop the act and record a ruling. The mint is out —
`ensure_invoice_link` REVOKES the standing link on the way, so a page-load mint would
silently kill the `/pay/<token>` address the client already holds in her email, and this
surface is a stable read. `/?invoice=<id>` is the letterbox's own page, so pointing at it
from the letterbox is a no-op. So the act does the honest thing the same move implies:
**it opens the letter**, where `Settlement` — the settle-in-place till — already stands.
The emailed `/pay/<token>` sheet is untouched and remains K1's ruled pay surface.

**The change** (`apps/client-portal/src/components/threshold/letterbox.tsx`):

- `useInvoiceLink` / `invoiceLinkPath` imports removed; nothing on this surface reads the
  frozen token any more.
- `const payHere = invoice !== null && balanceCents > 0 && !open` gates both the
  consequence sentence and the terminal act. Its sentence — "This opens payment. Nothing
  is charged until you choose how to pay." — is still exactly true.
- The act is a `terminal` `ScoredAction` with `aria-controls="letterbox-letter"` whose
  press does `setOpen(true)` + `revealReturnAnchor(slot.current)`. `actionKey` stays
  `invoice_open_link` (it appears in no registry; changing it would break the event's
  history for nothing).
- It is dropped once the letter is open, because the till is then already on screen, and
  where there is no balance, because "Pay $0" is not an act.

**Tests** (`letterbox.test.tsx`, 34 passed, was 33):

```
offers the terminal act with no live pay token anywhere in the system
  → useInvoiceLink mocked to null (which is what 00636 makes it, always);
    the act is present, is a button not a link, and opening it reveals the letter
carries the amount in the label, under a sentence that says what it does
says nothing about payment where there is no balance to pay
drops the act once the letter is open, because the till is already showing
never links to the pay page at all, so nothing can prefetch it
```

The old F6 prefetch test is replaced by that last one: with no `/pay/` href on the surface
at all, there is nothing left to warm.

**Gate, live:** `apps/client-portal/tests/threshold.spec.ts` against the production build
on :3002 → **22 passed**, including "settling the balance reaches the checkout start and
returns to the letterbox" — the money rail is intact.

---

## MAJOR-4 — a dead paperwork link dead-ended the firm on the homeowner's 404

**The fix.** `apps/client-portal/src/app/paperwork/[token]/page.tsx` renders its own calm
dead sheet on every miss instead of `notFound()`, following the house precedent
(`/share`, `/plans`, `/field`, `/evidence`):

```
Patina
This link isn’t available
The paperwork link may have been turned off or has expired. The studio that sent it can
open a new one.
```

`data-testid="paperwork-dead-link"`. It names no firm, no studio and no paper, and it
carries **no act at all** — no "Go to home" pointing at a guarded route that would bounce a
subcontractor's office manager into a sign-in wall in front of somebody's house. The four
misses (malformed, unknown, revoked, expired) remain indistinguishable from each other and
from a guess.

**Tests.** `page.test.tsx` drops its `notFound` throw-mock and asserts, for every miss,
that the sheet renders, says both sentences, names neither party, and contains no link and
no button. The e2e keeps its silence assertions and adds two: no link and no button inside
the sheet.

**Live proof** (production build on :3002, rendered body with scripts stripped):

```
$ curl -s localhost:3002/paperwork/not-a-real-token   → "Patina This link isn’t available
   The paperwork link may have been turned off or has expired. The studio that sent it can open a new one."
$ curl -s localhost:3002/paperwork/bbbb…(64 hex)      → identical
```

(The string "Page not found" still appears inside the RSC flight payload — Next serialises
the segment's not-found boundary either way — but it is not in the rendered DOM, which the
body dump above is.)

**Gates:** `src/app/paperwork` jest → 9 passed; `tests/paperwork-link.spec.ts` → 3 passed.

---

## MAJOR-5 — the upload's outcome was silent to assistive technology and destroyed focus

**The fix** (`apps/client-portal/src/components/paperwork/paperwork-sheet.tsx`):

- one polite live region for the whole sheet
  (`<p aria-live="polite" role="status" className="sr-only">`);
- `markReceived(key)` writes the receipt sentence into it and sets a focus target;
- the row's receipt paragraph takes `tabIndex={-1}` and
  `data-paperwork-receipt="<key>"`, and an effect moves focus to it, so the reader lands
  on the row whose paper she just sent rather than on `document.body`;
- the sentence itself is exported once (`paperworkReceiptSentence`) so the region and the
  paragraph cannot drift apart.

**Tests** (`paperwork-sheet.test.tsx`):

```
says the receipt into a polite live region and keeps the reader in place
  → region empty before the act; after it, carries the sentence; the receipt has
    tabindex="-1" and is document.activeElement, and activeElement is not body
announces only the row that was sent, and moves focus to that row
reports a paper the studio has not opened yet …  → region stays EMPTY (nothing happened)
```

**Live proof** (the real form, the real `paperwork-upload` function served locally, the
production build on :3002): `tests/paperwork-link.spec.ts`'s upload journey now asserts
`getByRole("status")` carries the receipt, `[data-paperwork-receipt="w9"]` carries it, and
`toBeFocused()` on that paragraph. **3 passed.**

---

## Gates, all of them

| Gate | Command | Result |
|---|---|---|
| Supabase type-check | `pnpm --dir packages/supabase type-check` | **clean** |
| Designer type-check | `pnpm --dir apps/designer-portal type-check` | **clean** |
| Client type-check | `pnpm --dir apps/client-portal type-check` | red ONLY on `.next/types/app/page.ts(37,29)` — the pre-existing generated-artifact error against an untouched `src/app/page.tsx` (r2 code review minor 14). `npx tsc -p apps/client-portal/tsconfig.json` over source alone is clean. Unchanged by this round |
| admin-portal build | `pnpm --dir apps/admin-portal build` (inline env) | **green**, exit 0, full route table |
| client-portal build | `pnpm --dir apps/client-portal build` (inline env) | **green**, `/paperwork/[token]` present |
| designer-portal build | `pnpm --dir apps/designer-portal build` (inline env) | **green**, exit 0 |
| Supabase vitest (all) | `npx vitest run` in `packages/supabase` | **107 files / 1425 passed, 12 skipped** |
| Designer jest | `npx jest src/components/document/people src/components/document/roster src/lib/analytics` | **49 suites / 727 passed** |
| Client jest + coverage | `npx jest --coverage` in `apps/client-portal` | **154 suites / 2537 passed**; all-files **76.88 / 72.71 / 76.62 / 79.23**, over the 70/60/70/70 floor |
| Deno (touched fan-out) | `deno test --allow-all --config supabase/functions/deno.json _shared/ resend-webhook/ paperwork-upload/ trade-rfq-send/ trade-agreement-send/` | **533 passed, 0 failed** |
| Deno (`_tests/`) | `deno test --no-check --allow-all …  _tests/` | **332 passed, 1 failed** — the failure is `_tests/stripe-rail.test.ts`, which needs a live `functions serve` + keys; recorded as pre-existing by the r2 data-edge review and untouched here. (Type-checking that directory also trips a pre-existing `TS2345` in `fulfillment-po/core.ts`, a file this wave never touched — hence `--no-check`, as the r1 runs used.) |
| Client e2e | `npx playwright test tests/paperwork-link.spec.ts` (chromium, prod build :3002 + served `paperwork-upload`) | **3 passed** |
| Client e2e | `npx playwright test tests/threshold.spec.ts --workers=1` | **22 passed** |
| Designer e2e | `npx playwright test e2e/people/paperwork-inbound.spec.ts --workers=1` | **1 passed** |
| Designer e2e | `npx playwright test e2e/people/company-card.spec.ts --workers=1` | **2 passed** |
| `deno.lock` | deleted before and after every run | absent from the repo root |

No migration was minted, so no reset, no `db:generate`, no legacy-grants regeneration was
owed; the SQL suites are unchanged and were not re-run.

### The designer `e2e/people` suite is standing red, and it is not this round's

`npx playwright test e2e/people --workers=1` → **9 failed / 14 passed**. Every failure is
in `add-client-letter`, `add-sheet`, `bring-forward`, `call-sheet` and `person-card`, none
of which touch a surface this round changed. Measured, not assumed:

1. **Baseline taken.** The three designer source files this round edits
   (`reach-access.tsx`, `company-card.tsx`, `posthog.ts`) were copied aside, reverted to
   `HEAD`, the portal rebuilt and restarted, and those five spec files re-run:
   **12 failed** — a strict superset of the 9. The files were then restored verbatim and
   the portal rebuilt. So this round fixes none of them and causes none of them.
2. **The cause is shared-DB state drift.** The failures are fixture-creation timeouts
   (`expect.poll(... cardByName).not.toBeNull()`), `locator.fill` timeouts, a
   `getByRole('alert')` strict-mode violation on two alerts, and a `tel:` link resolving
   nine times — the signature of a local database that many e2e and QA runs have written
   to without rolling back. The r2 QA report says as much in its own §6 ("were **not**
   rolled back … a future round replaying the same steps should account for this state").
3. **One failure WAS pollution I could clear, and clearing it proved the point.**
   `company-card.spec.ts` failed on a strict-mode violation between its `getByRole(
   "heading", { name: "Paper" })` (non-exact) and a leftover firm literally named
   `Paperwork E2E 1b568de7` — one of three such fixtures earlier `paperwork-inbound` runs
   left behind, which `firstFirm()` then picked out of an unordered `limit(20)`. Archiving
   the three (`update studio_contacts set archived_at = now() where company_name like
   'Paperwork E2E%'`) made the spec pass, twice, with no code change.

Recorded rather than fixed: repairing the seed drift is a local-database job, not a W4
finding, and `paperwork-inbound.spec.ts`'s own fixture cleanup (it clears its
`GL-E2E-%` documents but not the firms it names) is the narrower thing worth owning.
**Owner: W7 / local-dev seed. Ruling asked of Fable.**

---

## Round-1 fix-log corrections

`w4-fix-log-r1.md` carried two sentences the reviews proved false. Both now carry a dated
CORRECTION block in place, rather than being rewritten:

- **B-2** — "an unattributable letter loses its log row, never its write-back." It lost
  both; the write-back sat after the early return. True as of r2.
- **M-3** — "Both new tokens get their sentence in `use-inbound-documents.ts`." They did
  not; only the SQL half landed. True as of r2.
