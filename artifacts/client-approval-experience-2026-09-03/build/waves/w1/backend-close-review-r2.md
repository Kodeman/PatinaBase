# W1 backend close-out — adversarial review, round 2

Reviewer context: separate session, did not write the code. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w1-backend`
(`git rev-parse --show-toplevel` confirms), branch `approvals/w1-backend`,
head `c64b39778`, base `3e3b890f8`.

Scope of this round: the three majors round one found (M1 badge collapse, M2 the
three cityless letters, M3 the digest/mail link that names no house), plus a
regression sweep over the round-one work (items 1–5 of the lane brief) and the
minors and nits round one left standing.

## Verdict

**fix** — no blocker, one major. Every numbered lane item is delivered, every gate
is green, and no homeowner-visible string in the diff breaks a refusal. The one
major is a residual of M1: the badge and the bell now both collapse on the entity
key, but they disagree on the tie-break, so the icon can still say a number the
bell does not draw. It is a narrower case than the one M1 named and it blocks no
deploy; it is a real, provable divergence from the contract the R5 ruling states.

## Gates run (this reviewer, this worktree)

| Command | Result |
|---|---|
| `deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/` | **190 passed, 0 failed** |
| `deno test … supabase/functions/_tests/apns-send.test.ts` | **19 passed, 0 failed** |
| `deno test … supabase/functions/decision-reminders/` | **6 passed, 0 failed** |
| `deno test … supabase/functions/notification-digest/` | **11 passed, 0 failed** |
| `deno test … {apns-send,decision-first-notice,client-invite,proposal-nudge,review-requests}/` | "No test modules found" — those dirs hold no tests (apns-send's live in `_tests/`) |
| `deno check` on apns-send, decision-reminders, decision-first-notice, notification-digest, client-invite, proposal-nudge, review-requests, decision-resolved-notify, expire-decisions | **all clean** |
| `npx jest` (client-portal, full) | **1527 passed, 1 failed** — `portal-access.test.ts`, pre-existing on main (`git diff main...HEAD` on both files is empty; the web lane's branch already touches that test) |
| `npx tsc --noEmit -p apps/client-portal/tsconfig.json` | **clean, no output** |
| `deno fmt --check` on the touched files | 2 of 7 unformatted (pre-existing lines included) — not a gate anywhere in `.github/workflows/` or `package.json` |
| `deno.lock` present? | none at repo root or under `supabase/functions` |
| `git status` (tracked) | clean |

## Deploy set — independently recomputed, 28, matches the lane

Closure over the `_shared` modules edited anywhere in `3e3b890f8..HEAD`
(`branded-email.ts`, `client-portal-links.ts`, `decision-notify.ts`,
`studio-identity.ts`), transitively through `_shared` (which pulls in
`invoice-emails`, `po-emails`, `quote-request-emails`, `trade-rfq-emails`,
`fulfillment-templates`, `project-approval-notification`), plus every edited
function dir:

```
apns-send campaign-dispatch client-invite commercial-document-notify
comms-notification-dispatch create-checkout-session decision-first-notice
decision-reminders decision-resolved-notify digest-dispatcher expire-decisions
fulfillment-notify invoice-check-intent invoice-reminders invoice-send
morning-brief notification-digest notification-dispatch po-send proposal-nudge
proposal-send proposal-sign-confirmation quote-request-send review-requests
spec-pdf stripe-webhook trade-rfq-send waitlist-notify
```

Byte-for-byte the lane's own list. `campaign-dispatch` and `digest-dispatcher`
keep their pre-existing `deno check` errors; untouched, as instructed.

## The lane's five items — traced

1. **R3-01** ✔ `decision-reminders/index.ts:163` passes `notice: "reminder"`
   unconditionally; `firstNoticeAlreadySent` is gone from the tree
   (`grep -rn firstNoticeAlreadySent supabase apps` → empty). No test on the call
   site (see r2-m3).
2. **R5** ✔ `aps.badge` carried, omitted on any failure, computed once per request
   (`index.ts:212`, before the token loop). Collapse added this round (see r2-M1).
3. **R3-04 / M2** ✔ `studioSignatureCity` carries the ruled precedence and all
   four client letters go through it. Probed the local DB read-only:
   `profiles` 16 rows / **0 with a city**; `organizations` 11 rows / **0 with an
   address**, so neither leg has data locally (see r2-n2). The key is right:
   `account-studio-page.tsx:310` writes `address.city`.
4. **F4–F12** ✔ Rendered every letter through `renderDecisionEmail` in a throwaway
   Deno script: unmapped kind → "is ready for your answer." and a button reading
   "Review the approval" (no "undefined"); titles quoted in subject and body;
   "Still open, your designer asked on September 1." lowercase mid-sentence,
   "Still open, Leah asked on…" when named; "Nothing has changed since it was
   sent." only when the edition predates the ask; client footer prints `Patina`
   alone, no tagline; one subject rule; the digest and the mail both emit
   `https://client.patina.cloud/decisions/<id>`; a legacy row reads "for your
   decision", a Stage-2 row "for your approval".
5. **markAllOpened / opened columns** ✔ Verified there is no RPC: 00562 grants
   `UPDATE (opened_at, clicked_at, status)` to `authenticated` with a policy over
   `channel IN ('in_app','push')`, so the widened iOS write needs nothing
   server-side. The lane's conclusion holds.

## Findings

### MAJOR — r2-M1 · The badge and the bell collapse on the same key but not the same rule

`collapsedBadgeCount` counts an entity once if **any** of its rows is unread.
`NotificationsViewModel.collapseDuplicates` keeps the newest row per entity and
then, for every further row of that entity, `else if row.isRead { collapsed[index].isRead = true }`
— so the bell counts an entity as unread only if **no** row of it is read. The iOS
suite pins that rule by name: `BellQueueFallbackTests.swift:105` "a read twin marks
the surviving row read".

Concretely, on the producer M1's own evidence cited
(`00289_design_request_client_status_notifications.sql:110,:227` — two `in_app`
rows for one `design_request`, no de-dup): she taps the row in the bell,
`NotificationsAPIClient.markOpened(id:)` PATCHes that one row, the older twin
stays `opened_at IS NULL`. Bell: collapse → survivor marked read → **0**.
apns-send: one unread row for that entity → **1**. The icon carries a 1 the app
never draws, and it stands until she pulls the feed or marks all read — which is
the failure M1 was raised about, in a narrower case.

Second, smaller leg of the same disagreement: the bell's `isRead` also honours
`status == "opened" || status == "clicked"` (`NotificationsAPIClient.swift:158`),
while the badge query keys on `opened_at IS NULL` alone.

Fix: count the entity as read when any of its rows is read (read the whole
recent window, not only the unread rows, and apply the bell's rule), or move the
count into an RPC both surfaces call.

### MINOR — r2-m1 · The "same window" claim is not true as written

`backend-notes.md` and `apns-send/index.ts:61-68` say the read window is the
bell's own "so neither surface can see rows the other cannot". The two windows
differ in what they filter *before* the limit: the badge takes the 50 most recent
rows **that are unread** (`.is("opened_at", null) … .limit(50)`); the bell takes the
50 most recent rows of **any** read state and then counts the unread among them
(`list(limit: 50)`), and additionally excludes non-visible statuses
(`visibleStatusFilter`), which the badge query does not.

A person with more than 50 `in_app` rows whose recent ones are read and whose
unread ones are older gets bell 0 and springboard N. Today every `in_app` insert
in `supabase/migrations` writes `status='delivered'` (grepped), so the status leg
is theoretical; the window leg is not, it just needs volume.

### MINOR — r2-m2 (carried, narrowed) · `unreadInAppBadge` still has no test

Round one's m2. The parse-and-collapse half moved into `core.ts` and is tested
four ways, which is a real improvement. The query itself — channel, unread
filter, order, the 50 window, and the ruled "any error omits the badge rather
than sending 0" — is still an unexported function inside a module whose top level
calls `Deno.serve`, so no test reaches it.

### MINOR — r2-m3 (carried) · R3-01's behaviour is still untested at its call site

`notice: "reminder"` is a literal at `decision-reminders/index.ts:163`.
`decision-reminders/logic.ts` covers only `reminderStampDisposition`;
`decision-notify.test.ts` covers the renderer's default, not the caller. A
regression to a derived register would be caught by nothing.

### MINOR — r2-m4 (carried) · The digest still heads approvals "Decisions that need you" and counts in digits

`notification-digest/logic.ts:65` and `:159-161`
(`${count} reminders from Patina`). The vocabulary ruling reserves "decision" for
an option choice and asks for words instead of numbers. The lane names this as
unruled residue in its notes, which is honest; it is one file away from the F7
split `renderDecisionEmail` now makes.

### MINOR — r2-m5 (carried) · The resolved letter calls a Stage-2 approval a "decision"

`decision-notify.ts:591` — "Your client has responded to the decision
<title>" — for a row that carries a frozen edition and that every other letter
now calls an approval. It also subject-lines `decision.title` where the three
client letters use the artifact title, and prints the full SHA-256
(a deliberate, documented R6 carve-out for the studio's own traceability).
Designer-facing, and F7's wording was scoped to `decision_required`, so this is
arguably out of the lane's list — but "binding on every surface" is what the
vocabulary section says.

### MINOR — r2-m6 (carried) · Straight quotes where the sibling letters use curly ones

`quoted()` returns `"…"` (ASCII). `proposal-sign-confirmation/index.ts:136` and
`campaign-dispatch/index.ts:698` use `&ldquo;`/`&rdquo;` for exactly this job.
One inbox, two typographies.

### MINOR — r2-m7 (carried) · `branded-email.ts:234`'s client `businessAddress` branch is dead

`grep -rn businessAddress supabase/functions` → the interface, the branch, and two
tests. No producer passes one; `branded-email.test.ts:190` pins a path that never
runs.

### MINOR — r2-m8 (carried) · `editionUnchangedSinceSent` is a provability test, not a fact test

`decision-notify.ts:177` returns false when `sentAt` is null. Silence is the safe
direction and the letter is right; the name asserts more than the code checks.

### MINOR — r2-m9 · M3 is fixed in the frontend lane's neighbourhood, and doubles one read

Three `apps/client-portal` files (`page.tsx`, `lib/retired-routes.ts`,
`lib/data/active-project.ts`) plus two new test files land on the backend branch.
The lane names this in its notes and the web lane's branch does not touch those
files (`git diff 3e3b890f8...approvals/w1-web` over that directory: only
`portal-access.test.ts`), so there is no conflict — but the steward should expect
them and the web reviewer has not seen them.

Second-order: `list_my_project_decision_reviews` is now called by
`resolveHouseForInstrument` and again by `lib/data/projects.ts:510` on the same
render whenever `?decision=` is present, for a client with two or more houses.
Correct, twice.

### NIT — r2-n1 · No middleware-level test that `?decision=` rides the fold

`retiredRouteTarget` is unit-tested for the param, and `middleware.test.ts` has a
named test for the invoice's (`:429`) and none for the approval's. The
middleware's param loop is generic, so this is coverage symmetry, not risk.

### NIT — r2-n2 · The R7 city is proven by unit test only

Local stack: 0 profiles with `city`, 0 organizations with an `address`. No walk
and no local send can show the city on a sign-off, on any letter, today.

### NIT — r2-n3 · `?proposal=` silently outranks `?decision=`

`resolveHouseForInstrument` checks invoice, then proposal, then decision, and a
URL carrying two params resolves the earlier one. Undocumented, unreachable from
any link the product emits.

### NIT — r2-n4 (carried) · `decision-resolved-notify/index.ts:77` still selects an unread `created_at`

F10. Named by the lane in "Left standing".

### NIT — r2-n5 (carried) · `deno fmt --check` flags 2 of the 7 touched files

Including pre-existing lines in `branded-email.ts`. `deno fmt` is in no workflow
and no package script.

### NIT — r2-n6 · Push-only producers now receive an explicit `badge: 0`

`fulfillment-notify` and `site-request-dispatch` write a `push` row and no
`in_app` row (`00374:1580`), so a recipient whose in-app feed is empty gets
`aps.badge = 0` alongside the alert. That is the app's own number too, so the two
still agree; noting it because "a true zero clears the badge" is now a tested,
deliberate behaviour on paths that have no bell row at all.

## Repo hygiene

Four new commits, Conventional Commit subjects, no trailers, explicit pathspecs
(`git log --name-only`): no `.claude/`, no settings, no `.env`, no migrations, no
`git add -A` residue. Program docs force-added under `build/` as ruled.
