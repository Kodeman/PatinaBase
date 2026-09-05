# Wave 3 — WEB lane notes

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-web`
(`git rev-parse --show-toplevel` returns exactly that), branch `approvals/w3-web`,
base `42d9057e45bbcc8e4eee4794ed15ef20314fae1b`. Nothing pushed. No migration minted, no
production mutation, no touch of the shared local Supabase stack, no `.env` of any kind read
or written.

## Commits, in order

| sha | subject |
|---|---|
| `54dede259` | `fix(client): the carried nits — the gate's kind line, the unique landmark, R11's baseline, one register` |
| `9378bb26d` | `feat(client): the Record of Decision — one sheet she can keep (P-26)` |
| `61a0c560f` | `feat(client): the successor reads as one thread (P-27)` |
| `447c17b08` | `feat(client): she sets the pace — three cadences and a per-approval snooze (P-28)` |

## Gates (final run, on `447c17b08`)

| Gate | Result |
|---|---|
| `pnpm --filter @patina/client-portal type-check` | **PASS** — `tsc --noEmit`, no output |
| `pnpm --filter @patina/client-portal test` | **PASS** — 122 suites, **1762** tests (1681 at Wave 2 close) |
| `pnpm --filter @patina/client-portal test -- --coverage` | **PASS** — 72.92 stmts / 67.95 branches / 72.74 fns / 74.99 lines, over the 70/60/70/70 floor, no threshold failure |
| `pnpm --filter @patina/supabase type-check` | **PASS** (a hook was added) |
| `pnpm --filter @patina/supabase test` | **PASS** — 84 files, 1007 passed / 12 skipped |
| `pnpm --filter @patina/shared type-check` · `test` | **PASS** — 3 files, 51 tests (the cadence type lives here) |

Prettier warns on every file this lane touched. It warned identically on the base versions in
Wave 1 and Wave 2 (`wave-report.md`, "Prettier drift is inherited"); the hook says
`this is advisory locally`. Not introduced here, not fixed here.

---

## P-26 — The Record of Decision

**Routes.** `apps/client-portal/src/app/decisions/[id]/record/page.tsx` and
`apps/client-portal/src/app/proposals/[id]/record/page.tsx`. Both are client components with
`use(params)`, the same shape `app/invoices/[invoiceId]/print/page.tsx` has — the brief said
"server component", but the precedent it named is a client component reading through
React Query hooks, and the auth/RLS story is identical either way (see below). Following the
precedent literally was the safer read.

**Auth / RLS.** Sign-in and the portal-role gate are `middleware.ts`'s for every non-public
path; neither record route is public, and neither is in `retired-routes.ts`, so a signed-out
arrival keeps the record path as `callbackUrl` and comes back to it. The rows come from the
caller-scoped client reads: `list_my_project_decision_reviews` (through
`useMyProjectApprovalReviews`) for the approval, `get_client_commercial_document_bundle`
(through `useClientCommercialDocument`, the read the door itself makes) for the paper. A
stranger's read carries nothing, the sheet says "This record could not be found.", and it
never reveals whether the id exists — the same non-enumerating shape the invoice print page
uses. There is no invoice-print test on disk to mirror, so the two page tests were written to
that shape from scratch.

**Carve-out.** `retired-routes.ts` already fell through for both paths (the `decisions` arm
requires exactly two segments; the `proposals` arm admits only `<id>` and `<id>/sign`). The
commit makes it deliberate rather than incidental: the module doc names both alongside
`/invoices/<id>/print`, each arm carries a line saying the record falls out here, and
`retired-routes.test.ts` pins both as `null` **and** pins that every address they sit beside
still folds.

**The sheet** (`components/record/record-sheet.tsx`, shared): studio letterhead (name, and the
logo when `resolve_studio_identity` has one), artifact title + edition + issued date, the
question, the outcome as the `Stamp`, her name and the day, the consent method as a sentence,
the released work in words, and twelve characters of the checksum at the plate's edge.
Print CSS is in the page: `visibility`-scoped like the invoice's, `background: #FFFFFF
!important`, `box-shadow`/`text-shadow` `none !important`, and
`[data-stamp-state] { transform: none !important }` — `!important` because the −1.1° slant is
an inline style, and an inline style outranks every ordinary rule.

**The IP is never printed**, and both page tests assert it twice: no dotted quad anywhere in
the markup, and no "IP address" string.

**Words, not tokens** (`lib/record-of-decision.ts`, pure and separately tested):
`electronic_signature` → "Signed electronically by typed name." · `click_through` (and the
review leg's `portal_clickthrough`) → "Confirmed by click-through." · `paper` → "Signed on
paper." An unrecognised token returns null and the line is simply absent.
`releasedWorkSentence` mirrors 00569's `_project_approval_release_sentence` grammar exactly —
a single piece is named only when its catalogue name carries no comma, everything else is
counted in words — so the keepsake, the letter and the bell cannot disagree about one act.

**"Keep a copy"** is a scored tertiary act opening the record in a new tab
(`target="_blank" rel="noopener noreferrer"`): beside the stamp on `ApprovalAsk` the moment an
outcome is recorded, beside the stamp on `ApprovalReceipt` for a record she answered (never on
a gate withdrawn before any answer — that sheet would have nothing to print), and beside the
door's signed receipt, one line under "You'll have a copy."

**No raw `window.print()` "Download PDF" survived to retire.** `grep -rn "window.print\|Download
PDF" apps/client-portal/src` returns three sites: the invoice print page's own toolbar button
(the precedent, untouched), the new record sheet's toolbar, and
`app/field/spec-book/[token]/page.tsx` — which is a real PDF href on a trade party's token
surface, not a print call and not the seal moment.

### ⚠ Owed: the typed name on the APPROVAL's sheet

**The approval's Record of Decision carries no typed name, because no client-readable
projection carries one.** `respond_project_approval` writes `client_signature` and
`client_consent_method` into the 00117 columns (00569:1499-1502), but
`get_project_decision_reviews` — the only projection `list_my_project_decision_reviews` builds
from — does not select either (00569:1146-1167 is the whole object, and neither key is in it).
`get_project_decision_review` shares the same projection.

The consent SENTENCE is therefore derived from the outcome instead
(`consentMethodForOutcome`), which is exactly the 2026-09-05 ruling read from the other side:
Approve records `electronic_signature`, Return and Hold record `click_through`. That is
honest. The name is simply absent.

I did **not** mint a migration to widen the projection, for two reasons, and I flag it rather
than quietly shipping the gap:

1. Scope — the brief lists no migration for this lane, and `env.md` hands `00572` to the wave
   generally while the backend lane (P-28) is minting concurrently.
2. Worse than a number collision: the backend lane may itself `CREATE OR REPLACE
   get_project_decision_reviews` to project snooze state. If its migration number is higher,
   its definition wins and silently drops any key I had added — the "a DB function seems to
   have lost an earlier fix" footgun.

**What is owed:** one additive key on that projection — `'clientSignature',
decision.client_signature` (and, if wanted, `'clientConsentMethod'` and `'clientConsentedAt'`)
— minted by whoever else is already redefining the function, plus `clientSignature?: string |
null` on `ProjectApprovalReview` and two lines in the record page. The proposal's sheet already
carries her name, because the commercial-document bundle projects the signature receipt.

## P-27 — The successor read as one thread

**The continuation line.** `successionLine()` composes "Edition 4 replaces the edition you
returned on August 12." from the predecessor's outcome and `respondedAt`
(approved / returned / held). **Copy never says undone, reopened, reversed or void** — a
successor is a new decision, and a test greps the whole rendered subtree for those words.

**What changed since your last answer.** `whatChangedSince()` computes from the two
projections: a title line when the title moved, and the three deltas run through
`approvalWeighing` over the **difference** between the two asks — so "the cost falls by $400"
means this edition asks four hundred dollars less than the one she answered, which is the
question she actually has. When nothing computable differs it returns exactly "The studio
issued a new edition." and no more.

Both are drawn **only** where the predecessor's row is in hand AND carries an answer of hers.
A predecessor withdrawn before she ever answered gets neither: "since your last answer" is a
false heading over an edition she never answered, and a continuation line that cannot name the
verb is a line this surface does not write. `threshold.tsx` builds a `decisionId → approval`
map over `projectApprovals` and hands `ApprovalAsk` its `predecessor`.

**One forward act.** `revisionAct()` returns at most one link, successor first. Both links used
to be drawn side by side, which asked her to pick a direction through her own history. A
superseded **record** (`ApprovalReceipt`) gains that one act too — the forward one only, never
a link back — so the end of a thread is not a dead end. The `useDoorstepApprovals` doc comment
that promised records "no revision link" was corrected rather than left to rot.

**The fold opens itself (Wave 1 re-map risk #4).** `/decisions/<id>` folds onto
`#approval-<id>`; a receipt or supersession mail can name the fifth closed approval on a house
whose pile shows three (`RECORDS_SHOWN = 3`), and the fragment resolved to nothing and left her
at the top of the page. `ApprovalRecords` reads `window.location.hash` on mount and on
`hashchange`, opens the fold when the named record sits at or beyond `RECORDS_SHOWN`, then
`scrollIntoView()`s it — the browser has given up on the fragment by the time the element
exists. Four tests cover: beyond the fold, inside the fold, an address naming nothing here, and
the address changing under her.

## P-28 — She sets the pace

**Cadence.** `REMINDER_OPTIONS` in `details-sheet.tsx` becomes three, in her words: "Tell me
right away" · "Once a day" · "Once a week, on Sunday". `ReminderCadence` and
`reminderCadenceSchema` in `@patina/shared` gain `weekly_digest`. A row still carrying either
of the two old values reads back correctly (both survive the widening) — tested. The column's
tokens never reach the page — also tested.

**Quiet hours.** The floor is stated as a fact about Patina, not as a setting she has to find:
"Patina never sends approval mail before 8am or after 8pm, or on Sunday." The Reminders
paragraph now names the passed-date notice alongside proposals and invoices as mail that
arrives whatever the cadence says (R16).

**`details-sheet.tsx` already said "approval requests"** — Wave 1 did not miss it. A test now
holds it, and holds that "decision requests" is absent.

**The snooze.** `useSetDecisionSnooze` in `packages/supabase/src/hooks/use-project-approvals.ts`,
exported from the hooks index, riding `approvalMutation` so it invalidates the same rail every
authoritative Stage-2 mutation does. The act sits under the ask on `ApprovalAsk`: Remind me —
Tomorrow morning · Sunday · When it's due · Don't remind me — with "Still yours to answer; only
the reminders wait." underneath, and a per-choice confirmation ("I'll ask you Sunday.").
"Don't remind me" answers honestly: "I won't remind you again until it's past its date."

Drawn only while something is actually waiting on her (`viewerAnswers`, no recorded outcome,
disposition `active`, not awaiting studio issue). **Never on a past-due approval:** the acts are
replaced by "This one is past its date, so its notice stands." — the retired word "overdue"
never appears, and the test greps for it.

### ⚠ Contract to reconcile at integration — the backend lane owns the other half

Three shapes were coded against a backend that does not exist on this branch. Each is in ONE
place; reconcile at integration rather than hunting.

1. **RPC name and arguments.** `set_decision_snooze(p_decision_id uuid, p_choice text,
   p_timezone text)`, returning at least `{projectId, decisionId}` (the mutation runs the
   result through `parseActionResult`). The choice is symbolic —
   `'tomorrow_morning' | 'sunday' | 'when_due' | 'none'` — deliberately, not a client-computed
   timestamp: "Sunday" is a question about her wall calendar and one answer has to serve the
   mail, the push and the in-app row. Her IANA zone rides along; a null means "use her stored
   preference". **All of this lives in `useSetDecisionSnooze`, one function.**
2. **The third cadence token is `weekly_digest`.** Chosen to match the existing pair
   (`immediate` / `daily_digest`). If the backend lane's widened CHECK constraint spells it
   differently, three lines change: the union in
   `packages/shared/src/types/notifications.ts`, the zod enum in
   `packages/shared/src/validation/notifications.ts`, and one `value:` in
   `REMINDER_OPTIONS`. Until the column is widened, choosing the Sunday cadence is refused by
   the RPC and the section says "Could not save." — it fails visibly, never silently.
3. **Deploy order.** The migration widening `reminder_cadence` and creating
   `set_decision_snooze` must land **before** the client portal, or both acts refuse. Same rule
   as every other wave: migrations → edge functions → portals.

The edge functions still read the cadence as a bare string and test `=== 'daily_digest'`
(`proposal-nudge/index.ts:134`, `_shared/decision-notify.ts:1077`,
`notification-digest/index.ts:180`). They will not break on `weekly_digest`; they will simply
not honour it until the backend lane teaches them. That is P-28's backend half, not a defect
in this one.

## Carried items

| Item | What was done |
|---|---|
| **W3-03** — spine-gate kind line at 3.4:1 | The line was `color-mix(in srgb, var(--phase-procurement) 52%, var(--color-charcoal))` = **#8E7A37** on this block's `--bg-warm` (#EEE6DB) = **3.40:1**, below AA at an 11px meta register. It takes `--text-body` (#5C4A3C), **6.94:1** on the same ground. The phase colour still says what it says on the two rules and the caps, where contrast is not a legibility question. A test pins that the line carries a text token and no inline style, so no gate reintroduces a mix. `tracking-row.tsx`'s comment, which cited SpineGate's mix as precedent, was corrected. |
| **W3-04** — landmark unique per approval | Wave 2 gave the discussion `aria-label="Discussion about {title}"`, which is still identical for two editions of one artifact standing on the same doorstep — `landmark-unique` fails on the pair. Now `Discussion about {title} · Edition {N}`, falling back to `Discussion about approval {decisionId}` where there is no title. Three tests. |
| **R11 baseline** | **PRODUCED, not removed.** `costBaselineCents` was read through a cast at `approval-ask.tsx` off a field no projection has ever carried, so R11's ruled sentence never once printed. Where the artifact IS a budget, the edition's own total is a fact the surface already holds behind the fail-closed id/version/checksum match — the same predicate the plate's figures stand on, now extracted as `budgetIsTheEdition()` so the two readers cannot drift — and `targetTotalCents − costCentsDelta` is the figure the cost moved from. Silent at a zero delta ("$48,120 becomes $48,120" says a thing did not happen, twice) and on every other artifact kind, where the delta-only sentence is the honest fallback rather than a degraded one. The working-budget read is handed an empty project id for non-budget artifacts, so it stays disabled. Three tests: produced, not-this-edition, zero delta. |
| **One register** (`standing-sentence.ts`) | New `wholeNumberInWords()` spells 0–999 with no figure fallback; `daysInWords` uses it, so the weighing sentence can no longer read "13 days" beside "four days" in one breath. `countInWords` is **untouched** — the standing sentence still turns to figures at twelve, which is right for a line that has to stay scannable, and a test pins that it did not move. The mono ledger keeps its figures; it is the ledger's own voice. |
| **Numeric eyebrows on the client page** (P-24 residue) | One survivor: `house-ledger.tsx:47` printed `Owed across 3 open invoices` while its own comment promised words. It uses `countInWords` now. `grep -rnE '\$\{[a-zA-Z.]*[Cc]ount\}\|\$\{[a-z]+\.length\}'` over `components/threshold/` returns nothing else but two character counters (`{value.length} / {max}` on the door's fields, `{body.length} / {MIN_BODY} min` on the review) — field affordances, not eyebrows, and left alone. **The `ACCEPTED (3)` eyebrow the Wave 2 ruling named is NOT on the client page** — no such string exists anywhere in `apps/client-portal`; that one is the Studio hub's / the proposals list's on another surface. |
| **door-acts weight** | `Read it in full` takes `secondary`; the three answers stay peers at `tertiary`. Reading outranks declining. One test. |

## Advisories

1. **The typed name on the approval's keepsake is owed a one-key projection widening.** Full
   detail under P-26 above. This is the one place the sheet is thinner than P-26 asks for.
2. **The snooze RPC contract is a guess in one function.** So is `weekly_digest`. Both are
   named precisely above with the exact lines to change. Reconcile at integration before the
   walk, not after.
3. **The Sunday cadence and the Sunday floor read as a contradiction.** The briefed
   quiet-hours copy is "Patina never sends approval mail before 8am or after 8pm, or on
   Sunday", and the third cadence is "Once a week, on Sunday". Both come straight from
   `ux/03-behavior-and-copy.md` (§ Quiet hours and § Immediate versus digest), so the tension
   is in the source, not introduced here. The shipped copy is the brief's, verbatim. Worth one
   ruling: either the weekly digest is the one Sunday exception the floor names, or the weekly
   cadence lands Monday morning.
4. **`standingSubline()` still prints `2 unanswered` in figures.** It is exported, tested, and
   called by nothing — no component renders it — so no homeowner reads it. Left alone rather
   than changed with no caller to justify the test churn; worth deleting or wiring, either way
   a separate decision.
5. **The invoice print page has no test on disk.** The brief said to mirror it. There was
   nothing to mirror, so the two record-page tests were written from the page's own shape
   (loading → error → not-found → sheet). If a walk wants the invoice sheet covered too, that
   is a small, separate piece of work.
6. **`use(params)` suspends in jsdom.** Both record-page test files render inside an explicit
   `<Suspense>` and `await act(async () => render(...))`. Without the awaited `act` the body is
   empty and React prints "A component suspended inside an `act` scope". Worth knowing for the
   next lane that tests an App Router page taking a promise.
7. **Prettier drift is inherited, not introduced.** Every file this lane touched warns; the
   base versions warned identically in Waves 1 and 2. The hook calls it advisory.
