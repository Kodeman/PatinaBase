# W4 (P3) — round-4 fix log

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local only: no `db push`, no `functions deploy`, no secrets set. **No migration minted** —
every one of the five findings is surface, edge or package code; nothing in the reserved
`00595–00620` band was touched and the ledger head is still `00638`. `rulings.md` §3 treated
as settled throughout.

Five findings from `w4-review-r4-{data-edge,qa,code}.md`, in the order the brief lists them.
Two carry the id `R4-MAJOR-1` (the data-edge report's folio finding and the code report's
paperwork-form finding); they are answered separately below as **W4R4-1** and **W4R4-5**.

---

## W4R4-1 — R4-MAJOR-1 (data-edge) — the folio's two pay-link acts were unreachable on every invoice

`apps/designer-portal/src/components/document/accounts/invoice-folio.tsx`,
`packages/supabase/src/hooks/use-invoices.ts` (docblock),
`apps/designer-portal/src/components/document/accounts/__tests__/invoice-folio.test.tsx`

**The defect.** `get_invoice_link` has answered `token: NULL` for every invoice since 00636
froze the column, so `parseInvoiceLink` returns null, `clientInvoiceUrl` (`:296`) is always
null, and BOTH acts were gated on it (`:672`, `:686`) — while `:691` was the only entry to
the regenerate panel and `useRegenerateInvoiceLink.onSuccess` the only writer of a token into
`['invoice-link', id]`. The one route to a copyable `/pay` address was locked behind itself.

**The fix.**
- `Regenerate link` now renders on `canShareLink` alone — the invoice's own status, which
  `:218-220`'s comment always said the acts should follow. It is the act that MINTS an
  address, so it may not depend on having one.
- `Copy link` keeps its `clientInvoiceUrl` gate: there is nothing to copy until the mint
  lands, and R51/R83 bars a greyed act with no reason. It appears the moment `setQueryData`
  puts the fresh token in the cache.
- The recovery band's always-taken fallback no longer says *"Resend the invoice to try
  again"* (an instruction that cannot work — a resend mints a token only the letter sees).
  It now reads *"Email did not reach the client, and this invoice has no link yet.
  Regenerate link, above, mints one you can send them."*
- `useInvoiceLink`'s docblock said the folio shows no Copy/Regenerate act for an invoice with
  no link. Corrected: it describes what the hook can actually answer, and which act hangs on
  which fact.

**The suite.** The default `useInvoiceLink` mock returned a live token — modelling 00574's
world — which is why eleven cases stayed green while both acts were absent in production.
The default is now `null` (module scope AND `beforeEach`); the seven cases that genuinely
need an address mint one explicitly. Two cases that modelled the removed behaviour
("issue mints a readable link") were replaced by four that model the real chain:

- `offers Regenerate on a freshly issued invoice the database answers no token for`
- `brings Copy link up once Regenerate has minted an address`
- `points the recovery band at Regenerate, never at a resend that cannot mint`
- `gives the recovery band the address once the invoice has one`
- `withholds Copy while the invoice has no address, and keeps Regenerate standing`
  (was "omits both link acts entirely…", which asserted the defect)

**Gate.** `npx jest src/components/document/accounts/__tests__/invoice-folio.test.tsx` —
**30 passed**. Designer type-check exit 0; `@patina/supabase` type-check exit 0.

---

## W4R4-2 — R4-MAJOR-2 — the account-less unsubscribe landing named the wrong scope

`packages/notifications/src/unsubscribe.ts`,
`apps/admin-portal/src/app/preferences/unsubscribe/page.tsx`,
`apps/admin-portal/src/app/api/unsubscribe/route.ts`

**The defect.** `generateChannelUnsubscribeUrl` stamps the LETTER's own `notificationType`
on the token (`invoice_sent`, `po_sent`, `quote_request`, `trade_rfq`, `trade_agreement`);
`applyChannelUnsubscribe` accepts `type` and never reads it, marking the whole ADDRESS
`unsubscribed` across every card and every studio. The landing branched only on
`all_marketing`, so it printed *"We've unsubscribed you from po sent emails"* while the
record had just stopped everything, invoices included.

**The fix (no token change, no migration).**
- `UnsubscribeOutcome` gains `scope?: 'account' | 'address'`, documented in place: an account
  stop is one preference column, an address stop is the mailbox.
- `applyChannelUnsubscribe` returns `scope: 'address'` on every path (applied, invalid,
  error); the account branch returns `scope: 'account'`. `type` still rides along for the
  log and for callers that want to know which letter was clicked.
- The landing reads the SCOPE, through a new `appliedCopy()`: *"We've stopped all email from
  this studio to this address, including invoices and purchase orders."* An address stop also
  drops the "Manage Preferences" link and its sentence — there is no account to manage it in.
- The one-click `GET /api/unsubscribe` applies the token and REDIRECTS to the landing with
  the outcome in the query, so `scope` is carried across the hop (otherwise the page would
  reconstruct a scope-less outcome and print the narrow type again).

**Scope note (reported, not changed).** The five account-less senders leave
`unsubscribeBaseUrl` unset, so they resolve to `send-email.ts:227`'s
`DEFAULT_BASE_URL = https://admin.patina.cloud` — the admin landing the finding names. The
designer and client portals carry their own landings for the ACCOUNT path (digests, which
always carry a `userId`); they were not touched.

**The suite.**
- `packages/notifications/src/__tests__/unsubscribe.test.ts`: the channel outcome now asserts
  `scope: 'address'`, the account outcome `scope: 'account'`, plus a new case
  *"reports an address-wide scope whatever narrow type the letter carried"* looping
  `po_sent` / `invoice_sent` / `trade_rfq` and checking every email-kind row on the address
  actually moved. **15 passed** (104 across the package).
- New `apps/admin-portal/src/app/preferences/unsubscribe/__tests__/page.test.tsx` — the page
  had no test at all. 5 cases: the address sentence, the scope surviving the redirect, the
  account type sentence, the `all_marketing` sentence, and a refusal printing no unsubscribe
  copy. **5 passed**; middleware suite still 11.

**Gate.** `@patina/notifications` type-check exit 0. admin-portal `next build --webpack`
(inline local env) **exit 0**, `ƒ /preferences/unsubscribe` present.

---

## W4R4-3 — R4-MAJOR-3 — sms-inbound's START and YES branches wrote no touch

`supabase/functions/sms-inbound/pipeline.ts`,
`supabase/functions/_tests/sms-inbound.test.ts`

**The defect.** Both branches write a consent grant and attribute the message to a seat —
YES resolves `answered`, names the project and studio, and hands `reply()` a seat id — and
neither filed a touch. Nine `recordInboundTouch` call sites existed and these two were not
among them, so after the two most consequential inbound messages after STOP the seat line,
the roster row and `touchSentence` all went on printing the PREVIOUS contact. Same defect
class as r1 M-4 (STOP) and r3 MAJOR-5 (`flushDeferredMessages`).

**The fix.** The STOP branch's six-line
`recordInboundTouch(supabase, conv.party_id, messageId, { decisionClass: "none",
authorityCheck: "n/a" }, nowIso)` before each of the two returns — best effort, exactly as
everywhere else (`record_touch` answers NULL for a studio-less seat). Each carries a comment
naming the rule it restates.

**The suite.** Two new Deno cases modelled on the STOP touch test:
`an inbound START files an in touch against the seat that sent it` (seeds an `opted_out`
record so the branch is really taken) and
`an inbound YES files an in touch against the seat it is attributed to` (seeds a `pending`
record).

**Negative control.** With the two calls removed, exactly those two cases fail and the other
56 pass (`FAILED | 56 passed | 2 failed`); restored, **58 passed | 0 failed**.

**Gate.** `deno test --allow-all --config supabase/functions/deno.json` over
`sms-inbound`, `paperwork-upload`, `email-channel-status` and `_shared/send-email` —
**110 passed, 0 failed**. No `deno.lock` left behind. `_shared` untouched, so no fan-out.

---

## W4R4-4 — F1 (QA) — the Access grants row printed the UTC day

`apps/designer-portal/src/components/document/people/access-grant-list.tsx`,
`apps/designer-portal/src/components/document/people/__tests__/reach-access.test.tsx`

**The defect.** `grantRowParts` sliced `granted_at` / `last_used_at` (both timestamptz) and
handed the UTC day to `formatSeatDate`, which exists for zoneless DATE columns. QA
reproduced it live: a paperwork link minted at 19:09 CDT on 15 Sep read *"minted 16 Sep
2026"* while the inbound-document line three rows below on the same card — same evening —
correctly read *"uploaded 15 Sep 2026"* through the already-fixed `touchInstantDay` path.

**The fix.** Both values now go through `touchInstantDay` (exported from `@patina/supabase`,
`use-touches.ts`, the W4R3-4 converter that reads `STUDIO_TIME_ZONE`). The now-unused
`formatSeatDate` import is dropped; `formatSeatDate` itself stays where it belongs, on the
seat line's genuine DATE columns. `expires_at` was already on the `lastOpenDay` path and is
untouched.

**The suite.** `reach-access.test.tsx:775-789` asserted the UTC day as the expected value,
so the fixture held the defect in place. Its assertion now reads
`minted 11 Oct 2026 · used 16 Oct 2026` for the `T00:00:00Z` instants (which are 7pm the
previous day in Chicago), with a comment saying why. The suite's `@patina/supabase` mock
lacked `touchInstantDay`; it now takes the REAL one via `jest.requireActual`, so the printed
day is measured against the shipped converter. New sibling case
*"prints the studio's own calendar day for an evening mint, not UTC's"* uses the QA session's
own instants (`2026-09-16T00:09:24Z` → 15 Sep) plus a daytime instant as the control.

**Gate.** `npx jest src/components/document/people/__tests__/reach-access.test.tsx` —
**52 passed**. The people + roster + accounts sweep: **48 suites / 745 tests passed**.

---

## W4R4-5 — R4-MAJOR-1 (code) — two `other_named` upload forms collided on every field id

`apps/client-portal/src/components/paperwork/paperwork-upload-form.tsx`,
`apps/client-portal/src/components/paperwork/paperwork-sheet.tsx`, both suites

**The defect.** Field ids were keyed on `docType`, but `paperwork-model.ts:191-195`
deliberately keeps two differently-named `other_named` papers as two rows (P-3). With both
forms open the page emitted five duplicated ids and ten `label[for]` attributes that all
resolved to the FIRST form's controls: the second form's five fields had no accessible name,
and clicking its labels focused the wrong form's input.

**The fix.** `PaperworkUploadForm` takes a `fieldPrefix` prop — documented as "the row this
form belongs to, which is not its document type" — and the sheet passes `row.key`, which the
model already guarantees unique per row. The form slugs it
(`fieldPrefix.replace(/[^a-zA-Z0-9_-]+/g, '-')`) because `other_named:roof warranty` is a
legitimate row key and not a legitimate id, then builds `paperwork-${idPrefix}-${name}`.

**The suite.**
- `paperwork-upload-form.test.tsx`: new case *"gives two other_named forms their own field
  ids and their own labels"* renders both forms and asserts 10 inputs / 10 unique ids / 10
  labels, each `label[for]` resolving to a control inside its OWN `<form>`, and the two
  `Number` fields being different elements.
- `paperwork-sheet.test.tsx`: the mock now records `fieldPrefix`; new case *"gives two
  other_named rows their own field prefix"* opens both rows and asserts five distinct
  prefixes, two of them `other_named`-derived and none equal to the bare type.

**Gate.** `npx jest src/components/paperwork` — **3 suites / 45 tests passed**.

---

## Gates, all of them, at the end of the round

| Gate | Command | Result |
|---|---|---|
| Designer type-check | `pnpm --dir apps/designer-portal type-check` | **exit 0** |
| Supabase type-check | `pnpm --filter @patina/supabase type-check` | **exit 0** |
| Notifications type-check | `pnpm --dir packages/notifications type-check` | **exit 0** |
| Client type-check | `pnpm --dir apps/client-portal type-check` | **RED, pre-existing** — the same single `.next/types/app/page.ts(37,29) TS2344` r4 measured as an ancestor of W4's base; no new error, none in a file this round touched |
| admin-portal build | `npx next build --webpack` (inline local env) | **exit 0**, `ƒ /preferences/unsubscribe` |
| Designer jest (people·roster·accounts) | `npx jest src/components/document/{people,roster,accounts}` | **48 suites / 745 tests passed** |
| Client jest + coverage | `npx jest --coverage` | **154 suites / 2 540 tests passed**; floor holds at **76.9 / 72.7 / 76.63 / 79.26** (70/60/70/70) |
| Admin jest | `npx jest src/app/preferences src/__tests__/middleware-auth.test.ts` | **16 passed** |
| Notifications vitest | `pnpm --dir packages/notifications exec vitest run` | **7 files / 104 tests passed** |
| Edge (Deno) | `deno test --allow-all --config supabase/functions/deno.json` × 4 suites | **110 passed, 0 failed** |
| Migration ledger | untouched | head still `00638`; nothing minted, nothing in `00595–00620` |

No server was started on 3000 or 3002; no Playwright run this round (no migration, no route
added, and every finding is covered by a unit gate). No prod anything: no `db push`, no
`functions deploy`, no secrets. No `deno.lock` left at the repo root.

This file needs `git add -f`.
