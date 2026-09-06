# Wave 3 — WEB lane, adversarial review, round 1

Reviewer context: separate from the implementer. Worktree read
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-web`
(`git rev-parse --show-toplevel` returns exactly that), branch `approvals/w3-web`,
five commits `54dede259 … 307fc439a` over base `42d9057e4`.

**Verdict: FIX.** Four blockers, four majors. All four blockers are one class: the lane
coded P-28 against a guessed backend contract, and the Wave 3 backend lane's
`00572_she_sets_the_pace.sql` — which exists, on `approvals/w3-backend`, today — spells
every part of it differently. The lane flagged the guess honestly (web-notes.md, "Contract
to reconcile at integration"), but the two halves as committed do not compose: with both
branches merged as they stand, P-28 does not work at all, in either direction.

Everything else in the lane is sound. P-26 and P-27 are delivered, the carried nits are
genuinely fixed (the contrast number checks out), scope is clean, commits are
pathspec-scoped Conventional Commits with no trailers, no migration was minted, and the
gates are green.

## Gates, run by the reviewer

| Gate | Result |
|---|---|
| `pnpm --filter @patina/client-portal type-check` | PASS (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/client-portal test` | PASS — 122 suites, 1762 tests |
| `pnpm --filter @patina/client-portal test -- --coverage` | PASS — 72.92 / 67.95 / 72.74 / 74.99 over the 70/60/70/70 floor |
| `pnpm --filter @patina/supabase type-check` | PASS |
| `jest --testPathPattern=record` (print routes rendered, IP grepped) | PASS — 3 suites, 33 tests |

The IP check the method asked for is in the lane's own two page tests and passes:
`expect(container.innerHTML).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/)` plus
`not.toMatch(/ip address/i)`, on both sheets.

## Blockers — P-28's two halves do not compose

Every one of these is a fact about two files standing side by side today:
`packages/supabase/src/hooks/use-project-approvals.ts` (web, `approvals/w3-web`) and
`supabase/migrations/00572_she_sets_the_pace.sql` (backend, `approvals/w3-backend`).

**W3W-01 · The snooze RPC signature does not exist.**
The hook posts `{ p_decision_id, p_choice, p_timezone }`. 00572:318 declares
`set_decision_snooze(p_decision_id uuid, p_kind text)` — two arguments, the second named
`p_kind`, and no timezone (it resolves the zone itself through
`public.notification_time_zone(v_actor)`). PostgREST resolves overloads by argument NAME,
so every press of every snooze act returns PGRST202 and the surface says "The reminders
could not be set just now."

**W3W-02 · "Don't remind me" sends a word the RPC refuses.**
The hook's `DecisionSnoozeChoice` spells the fourth choice `'none'`; 00572:342 accepts
`'tomorrow_morning' | 'sunday' | 'when_due' | 'never'` and otherwise
`RAISE EXCEPTION … invalid_parameter_value`. Even after W3W-01 is fixed, one of the four
acts still refuses.

**W3W-03 · A successful snooze is reported to her as a failure.**
`useSetDecisionSnooze` runs the result through `parseActionResult`
(use-project-approvals.ts:395), which requires `projectId` and throws when it is absent.
00572's function returns `{decisionId, kind, snoozedUntil, timeZone}` — no `projectId`. So
the row IS written, the reminders ARE stood down, and the page tells her they were not.
That is worse than a plain failure: the surface lies about state she cannot otherwise see
(and see W3W-12 — there is no other way to see it).

**W3W-04 · The three cadences write and read tokens the column rejects.**
`REMINDER_OPTIONS` (details-sheet.tsx:141) carries `immediate | daily_digest |
weekly_digest`. 00572:179 replaces the CHECK with `('right_away', 'daily',
'weekly_sunday')`, and its `normalize_reminder_cadence` trigger maps only `immediate →
right_away` and `daily_digest → daily`. Two consequences:
- Choosing "Once a week, on Sunday" writes `weekly_digest`, which passes through the
  trigger untouched and violates the CHECK. The Sunday cadence can never be set.
- Every stored value after 00572 is one of the three NEW tokens, none of which equals any
  `REMINDER_OPTIONS.value`, so `(prefs.reminder_cadence ?? "immediate") === opt.value`
  (details-sheet.tsx:636) is false for all three and **no radio is checked for any client**.

One spelling has to win. The three lines the lane named (`packages/shared/src/types/
notifications.ts`, `packages/shared/src/validation/notifications.ts`, one `value:` in
`REMINDER_OPTIONS`) are the right lever if the backend's spelling wins; the token pair
`weekly_digest`/`weekly_sunday` and `none`/`never` both need one decision each.

## Majors

**W3W-05 · A dark default on cadence, and a false comment over it.**
`packages/supabase/src/hooks/use-notification-preferences.ts:35` seeds
`reminder_cadence: "immediate"` for a client with no row, and details-sheet.tsx:636
repeats it as `?? "immediate"`. The binding refusal is "no dark defaults on cadence (the
default is the quietest cadence that still gets a real answer on time)" — `immediate` is
the loudest of the three. The backend lane read the same refusal the other way and set the
column DEFAULT to `daily` (00572:176), so after that migration the surface will also SHOW
her a cadence she is not on. The comment the lane added above `REMINDER_OPTIONS` states the
rule ("The default is the quietest cadence… and it is NOT chosen here") and then documents
the violation without fixing it; as written it reads as a justification for a default that
does not comply.

**W3W-06 · The approval's Record of Decision carries no typed name.**
P-26's sheet is specified as "her typed name and date". `/proposals/[id]/record` prints
`signature.signerName`; `/decisions/[id]/record` prints none. The lane's diagnosis is
correct and I verified it: `respond_project_approval` writes `client_signature`
(00569:1499-1502) but the projection `get_project_decision_reviews` builds
(00569:1140-1170) selects neither `client_signature` nor `client_consent_method`. The
derived consent sentence (`consentMethodForOutcome`) is an honest substitute for the
METHOD, but the NAME is simply missing from half of P-26's deliverable. This is owed: one
additive key on the projection, `clientSignature?: string | null` on
`ProjectApprovalReview`, two lines on the page. Someone has to own it — and per the lane's
own footgun note, it must be minted by whoever else is redefining that function, or the
higher migration number silently drops it.

**W3W-07 · The quiet-hours block contradicts itself twice, on one screen.**
`details-sheet.tsx` now says, verbatim: "Patina never sends approval mail before 8am or
after 8pm, or on Sunday." Directly below it, the cadence list offers "Once a week, on
Sunday". Two paragraphs down, the sentence the lane ADDED says the passed-date notice
"always arrive[s] right away, regardless of this setting" — and R16 plus P-04's risk note
both keep the quiet-hours bypass for that notice. So the absolute "never" is false on both
counts, and one of the three contradictions is the lane's own new sentence rather than the
brief's. The lane raised the Sunday half as advisory 3; the overdue half is not in the
notes at all. Needs a ruling and then one honest sentence — e.g. name the two exceptions,
or land the weekly digest Monday morning.

**W3W-08 · The supersession mail still lands nowhere.**
The new hash handler (approval-ask.tsx:966-995) lives inside `ApprovalRecords` and searches
only `doorstepRecords` — closed approvals. A supersession notice names the SUCCESSOR, which
is an open ask, not a record: `approvals.findIndex(...)` returns `-1`, the effect returns
early, and nothing scrolls. Grepping the whole client page confirms this is the only
`location.hash` / `scrollIntoView` handler that exists (`grep -rn "location.hash\|
scrollIntoView\|hashchange" components/threshold components/layout` returns four hits, all
of them these new lines), so an ask's `#approval-<id>` fragment is not resolved by anything
— and on a client-rendered page the browser has, by the lane's own correct reasoning, given
up on the fragment before the ask element exists. The fold requirement in the brief is met
literally; the purpose it was given for ("so a receipt or supersession mail always lands")
is met for receipts only.

## Minors

**W3W-09 · A new non-unique landmark, of exactly the class W3-04 was raised to fix.**
approval-ask.tsx:1450 renders `<section aria-labelledby={approval-changed-<id>}>` whose
heading text is the constant "What changed since your last answer". `<section>` with an
accessible name is a `region` landmark, and axe's `landmark-unique` covers regions. Two
concurrent asks that each follow a predecessor produce two landmarks with identical
accessible names — the same failure the lane just fixed on the discussion. The fix is the
same one: append the artifact title, or the edition, or the decision id.

**W3W-10 · Pressing one snooze act turns all four into "SETTING".**
All four `ScoredAction`s take `loading={setSnooze.isPending}` (approval-ask.tsx:904).
`ScoredAction` replaces its children with `loadingLabel` while loading
(scored-action.tsx:176-179), so the moment she presses "Sunday" every one of the four reads
SETTING, pulses, and carries `aria-busy` — she cannot tell which she pressed. Every other
`loading={}` site in this file is a single button. Gate on the choice in flight, not on the
mutation.

**W3W-11 · "When it's due" promises a date the row may not have.**
The confirmation reads "I'll ask you when it's due." unconditionally. 00572 maps
`when_due` on a dateless decision to `'infinity'` — i.e. never — deliberately and correctly
("no invented timing"), but the surface has already made the opposite promise. Two related
seams: the projection's `dueAt` is `artifact.due_at` (NOT NULL, 00463:145) while both
`isOverdue` and the backend snooze key off `client_decisions.due_date`, which is nullable,
so the web surface cannot see the case it is promising about. Either suppress the act
without a decision-level date, or say what actually happens.

**W3W-12 · A snooze she cannot see or take back.**
The projection carries no snooze state, so the confirmation line lives only in component
state. After a reload, "Don't remind me" — the most consequential of the four — is
invisible, unlabelled and uncancellable; the four acts redraw as though nothing was set. Not
in the brief, but it is the natural companion to W3W-03: the one place she could have
noticed the failure is also the place that shows her nothing.

**W3W-13 · The letterhead is the studio's name TODAY, not the one on the paper.**
Both sheets read `useStudioIdentity` (live `resolve_studio_identity`). The build sheet for
P-26 names "the per-dispatch studio identity and logo snapshot already resolved on the send
outbox (`proposal_send_dispatches`, reused)", and the brief says "logo when the dispatch
snapshot has one". A studio that renames or rebrands rewrites the letterhead on a keepsake
printed two years ago. The invoice print page sets the same precedent, so this is defensible
— but it is a deviation from the named source and should be a decision, not a default.

**W3W-14 · `releasedWorkSentence` does not mirror the SQL "exactly".**
web-notes claims it "mirrors 00569's `_project_approval_release_sentence` grammar exactly —
so the keepsake, the letter and the bell cannot disagree about one act." They disagree in
two places: past twenty pieces the SQL falls back to the literal `'the'` ("It releases the
pieces that were waiting on it.", 00569:143-151) while the TS spells "twenty-one"; and at
zero the SQL says "Your answer is on the record." while the TS returns null. Neither is
wrong on its own — the claim of exactness is.

## Nits

- **W3W-15** · The notes' sweep grep ("returns nothing else but two character counters")
  missed one: `instruments/tracking-row.tsx:150` prints `stop ${stopIndex + 1} of
  ${GOODS_JOURNEY_STAGES.length}` — "stop 3 of 5", figures, on the client page. The
  pattern `\$\{[a-zA-Z.]*[Cc]ount\}` cannot match `${stopIndex + 1}`. Positional rather
  than an eyebrow, so arguably out of P-24's residue; the claim of exhaustiveness is what
  is wrong.
- **W3W-16** · `revisionAct` still returns the BACKWARD "Review previous edition" on an ask
  with no successor, which is the common case for the newest edition — so the brief's "one
  forward act" is one act, but not always forward. Defensible; worth stating deliberately
  rather than by fallthrough.
- **W3W-17** · The revisions `<nav aria-label={`Approval revision history for ${title}`}>`
  takes the title alone, without the edition W3-04 just added to the discussion landmark
  beside it.
- **W3W-18** · `ApprovalRecords`' `seek` never clears when the named id is not among the
  records (the W3W-08 case), so the second effect re-runs `findIndex` on every subsequent
  render for the life of the page. Harmless, but it is the state machine's one unbounded
  branch.
- **W3W-19** · `threshold.tsx:470` rebuilds `approvalsById` on every render with no
  `useMemo`.
- **W3W-20** · web-notes puts the fixed kind line at 6.94:1; measured on the shipped tokens
  (`--text-body` → `--color-mocha` #5C4A3C on `--bg-warm` #EEE6DB) it is **6.79:1**. The
  finding itself is confirmed exactly: the retired mix composites to #8E7A37 = **3.40:1**,
  below AA. W3-03 is genuinely fixed.
- **W3W-21** · On the door, "Keep a copy" appears instantly while the receipt line beside it
  fades in over 420ms (`receiptInked`), so the act arrives before the sentence it keeps.

## What I checked and found clean

- **R135 / the carve-out.** Two new addresses, both print sheets, both following
  `/invoices/<id>/print`: `retired-routes.ts` leaves them unmapped by segment count, the
  module doc names them, and `retired-routes.test.ts` pins both as `null` AND pins that the
  addresses beside them still fold. No new zone.
- **Auth / RLS parity.** Neither record route is public, so `middleware.ts` signs her in
  with the record path as `callbackUrl` and applies the portal-role gate
  (`resolvePortalDecision` is path-agnostic). Both pages read caller-scoped RPCs
  (`list_my_project_decision_reviews`, `get_client_commercial_document_bundle`), and a read
  that carries nothing prints "This record could not be found." without revealing whether
  the id exists — the invoice sheet's own non-enumerating shape. The lane is right that
  there is no invoice-print test on disk to mirror.
- **The IP is never printed** — asserted twice per sheet, dotted-quad and the phrase.
- **Print CSS.** `visibility`-scoped like the invoice's, `background: #FFFFFF !important`,
  `box-shadow`/`text-shadow` `none !important`, and `[data-stamp-state] { transform: none
  !important }`. The `!important` is load-bearing and correctly reasoned: the −1.1° slant
  is an inline style on `Stamp` (stamp.tsx:270), and only `!important` outranks it.
- **Vision refusals.** No badge, count chip, red/green, checkmark-as-status, shadow, stamp
  fill, tab, dashboard, emoji, confetti, "AI", "gate", "task", "dashboard" or "overdue" in
  any added homeowner string (the word "overdue" appears once in the diff, inside
  web-notes.md, describing its own absence). Outcome words are the ruled three. The
  past-due line — "This one is past its date, so its notice stands." — is the right
  register and carries no guilt.
- **R16, the parts the web lane owns.** The snooze acts are not drawn over a past-due
  approval, and the replacement sentence says why. "Don't remind me" answers honestly ("I
  won't remind you again until it's past its date."). Nothing here can defer an in-app row.
- **P-27's arithmetic.** `whatChangedSince` subtracts the predecessor's deltas from the
  current edition's, which is only correct if both are declared against a common baseline
  rather than against each other. It is: the designer's supersede composer seeds the
  successor's cost delta with the predecessor's own value
  (`project-approval-document.tsx:449`), which is coherent only under the common-baseline
  reading. The same reading makes R11's produced baseline
  (`targetTotalCents − costCentsDelta`) correct too. The two new readers agree.
- **R11's baseline.** Genuinely PRODUCED, not faked: fail-closed behind
  `budgetIsTheEdition` (id + version + evidence fingerprint), silent at a zero delta,
  silent on every non-budget kind, and the disabled-query path (`useProjectWorkingBudget('')`)
  is really disabled (`enabled: !!projectId`). The dormant cast is gone.
- **W3-04** is fixed as briefed, with the decision-id fallback for an untitled edition.
- **"decision requests" at details-sheet.tsx:596** — Wave 1 did NOT miss it; `git show
  main:` confirms the line already read "approval requests". The added test is the right
  way to hold it.
- **`ACCEPTED (3)`** — confirmed absent from `apps/client-portal` entirely. The lane's N/A
  is correct; the ruling's sweep item lives on another surface and is not this lane's.
- **`standingSubline`** — confirmed exported, tested, and called by no component. Dead, not
  homeowner-visible.
- **Scope and hygiene.** Four product commits, each pathspec-scoped to its own item;
  Conventional Commits subjects; no `merge(...)`; no trailers; nothing pushed; no migration
  minted (correct — `env.md` hands 00572 to the wave and the backend lane took it); no
  `.env`, `.claude/`, hooks or settings touched; no worktree or simulator created; the
  shared local Supabase stack untouched.
