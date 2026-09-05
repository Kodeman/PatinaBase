# Wave 1 close-out — backend lane, adversarial review (round 1)

Worktree under review:
`git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w1-backend rev-parse --show-toplevel`
→ `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w1-backend`, branch `approvals/w1-backend`.

Range `3e3b890f8..HEAD`, four code commits plus the log:

```
e0b5ec9f7 docs(approvals): W1 backend close-out log
7fc0c5941 fix(edge): the letters a homeowner reads, sentence by sentence (F4-F12)
fd13b9ebb fix(edge): the sign-off reads the designer's own city first (R3-04)
4eb12e776 fix(edge): the springboard number moves while the app is closed (R5)
61da87110 fix(edge): the 48-hour cron returns, it never announces (R3-01)
```

`git diff 3e3b890f8...HEAD --stat` → 14 files, +743 / −125. Thirteen under `supabase/functions/`,
one the lane log. No migration minted, no `.env` touched, nothing outside the lane's surface.
Every commit is an explicit pathspec set, Conventional subject, no trailers, no `merge(...)`.
`git status --porcelain` is empty apart from the sandbox's eight `.env*` read denials.

## Gates I ran myself

| gate | result |
|---|---|
| `deno test --allow-all --config …/deno.json …/_shared/` | **ok · 186 passed · 0 failed (4s)** |
| `deno test` on apns-send, decision-reminders, decision-first-notice, notification-digest, `_tests/apns-send.test.ts` | **ok · 32 passed · 0 failed (298ms)** |
| `deno check` on the four touched entrypoints | `Check` ×4, **zero errors** |
| `deno check` on all 27 deploy-set entrypoints | 25 clean; `campaign-dispatch` (10) and `digest-dispatcher` (5) carry the **pre-existing** supabase-js generic drift, untouched as briefed |
| `ls deno.lock` · `ls supabase/functions/deno.lock` | `No such file or directory` — clean |
| deploy-set closure, recomputed independently (python walk of every relative import, both quote styles, from the three edited `_shared` modules, plus every edited dir) | **27 dirs, identical to the lane's list — `MISSING FROM NOTES: []`, `EXTRA IN NOTES: []`** |
| render probe, throwaway `deno run` against the real `renderDecisionEmail` | ten cases, below |
| psql read-only probes on `postgresql://postgres:postgres@127.0.0.1:54322/postgres` | `organizations.address` is `jsonb`, `profiles.city` exists and is empty on every row; `notification_status` enum; `notification_log` producers |

Render probe (subjects and the body sentence each fix is about):

```
FIRST         Leah sent "kitchen plan set" for your approval
              "kitchen plan set" is ready, exactly as drawn.
REMINDER      Thursday: "kitchen plan set"
              … is still open and due Thursday. Nothing has changed since it was sent.
OVERDUE       Still open: "kitchen plan set"        Still open, Leah asked on September 28.
OVERDUE-NOID  Still open, your designer asked on September 28.        (F6 — lowercase)
LEGACY-FIRST  Leah sent "Rug color — Natural vs Sand" for your decision / eyebrow Decision / Review the decision
LEGACY-REM    Thursday: "Rug color — Natural vs Sand"   (no "Nothing has changed" — F8)
UNMAPPED      … is ready for your answer. / Review the approval        (F4 — no "undefined")
REISSUED-REM  no "Nothing has changed"                                 (F8)
RESOLVED      designer letter unchanged: tagline present, SHA-256 present
tagline in any client letter: false        "undefined" anywhere: false
```

## The five brief items — delivered?

| # | item | verdict |
|---|---|---|
| 1 | R3-01 · cron always `notice: "reminder"` | **delivered.** The branch is gone (`decision-reminders/index.ts:147-163`), `firstNoticeAlreadySent` is deleted, `grep -rn firstNoticeAlreadySent supabase/ apps/ packages/` → **no hits**. No test covered the helper, so none to delete. See m3. |
| 2 | R5 · `aps.badge` | **delivered, with a defect** — see **M1**. Payload builder tested both ways; `apns-send` is in deploySet. |
| 3 | R3-04 · city precedence | **delivered for `resolveStudioSignature`**; residue elsewhere — see **M2**. |
| 4 | F4–F12 carried copy defects | **all delivered** (F4, F5, F6, F7, F8, F9, F11, F12), each with a test in `_shared/decision-notify.test.ts` / `branded-email.test.ts` / `notification-digest/logic.test.ts`. |
| 5 | `markAllOpened` server-side check | **delivered and independently correct.** `select proname … where prosrc ilike '%opened_at%' and prosrc ilike '%notification_log%'` → `notify_client_attention`, `get_ab_variant_stats`; both only READ it. The two RPCs that UPDATE `notification_log` (`site_request_claim/complete_delivery_notification`) write `status`/`error`/`retry_count`/`metadata`, never `opened_at`. Nothing owed server-side. |

F7's discriminator (`Boolean(decision.artifact)`) is sound: all three `decision_required`/`decision_overdue`
producers — `decision-first-notice:133`, `decision-reminders:131`, `expire-decisions:116` — refuse to
send a Stage-2 row whose artifact will not resolve, so an artifact-less letter really is a legacy row.
F8's premise is proved: `extend_and_reopen_client_decision` (00464:1994) raises
`Stage-2 project approvals cannot use generic extend/reopen`, so the row it wipes never carries an
edition and never claims one.

## Findings

### MAJOR — M1 · The springboard number can exceed the bell: the count is not collapsed

`apns-send/index.ts:69-77` counts every unread `in_app` row:

```ts
.eq("user_id", userId).eq("channel", "in_app").is("opened_at", null)
```

The bell counts the same rows **collapsed on `metadata.entity_type|entity_id`**
(`NotificationsViewModel.collapseDuplicates`, and `BadgeCountService.applyNotificationRows`, whose
own doc comment states the contract: *"apns-send's `aps.badge` (R5, second pass — the backend lane's)
**must count the SAME set**"*). It then claims the two "part company only where one entity holds two
unread `in_app` rows, which `notify_client_attention`'s own de-dup … is what keeps from happening."

That claim is false for every other producer. `00289_design_request_client_status_notifications.sql`
inserts an `in_app` row **with** `entity_type='design_request'` / `entity_id` and **no** de-dup, from a
trigger on every `leads` status change (`:227`) plus the claim path (`:110`), both for
`homeowner_id`. Two status changes on one lead ⇒ two unread `in_app` rows, one entity: bell 1,
springboard 2. Walk R2 measured exactly this shape live — *"Bell count 14 = springboard badge 14 …
the difference from 15 raw unread rows being the documented `collapseDuplicates`"* — i.e. 15 raw
against 14 collapsed on that very account. Under this change APNs would have written **15**.

The app never rewrites the badge except when the notification feed loads
(`applyNotificationRows` → `writeSpringboardBadge`), so the wrong number stands on the home screen
until she opens the bell. R5's whole point is a number that is true while the app is closed.

Fix: count the same set — read `metadata` for the unread `in_app` rows and count distinct
`entity_type|entity_id` (rows with no entity key counted individually), or add a counting RPC. The
`core.ts` doc comment and the commit body ("the same leg the bell reads, so the icon never says
twice what the app does") should stop claiming agreement the code does not have.

*Not* a defect, checked: `invoke_edge_function` uses `net.http_post` (pg_net), whose worker fires
after commit, so the count includes the row the push announces.

### MAJOR — M2 · R3-04 is closed in one function and open in three client letters

`resolveStudioSignature` now reads `profiles.city` → `organizations.address->>'city'` → omit. But
three homeowner-addressed letters build their own `signOff({… city})` straight off `profiles.city`
and never see the org fallback:

```
supabase/functions/proposal-nudge/index.ts:222     city: proposal.designer?.city ?? null
supabase/functions/client-invite/index.ts:158      city: (designer as …)?.city ?? null
supabase/functions/review-requests/index.ts:264    city: designerProfile?.city ?? null
```

`select city from public.profiles where city is not null` → **0 rows**; `organizations.address` is
the JSONB the branding form writes. So the approval letter signs "Leah, Middle West Studio ·
Chicago" and the invitation, the nudge and the review request from the same studio, in the same
inbox, sign without a city — permanently. R3-04's r3 entry names these three lines by file and line;
the close-out ruling carves out only `proposal-send` ("stays cityless until its dispatch snapshot is
widened"), not these. Either route them through `resolveStudioSignature` (one call each) or extend
the ruling's carve-out to name them.

### MAJOR — M3 · F12's shared address sends a multi-project homeowner to the wrong project

The digest previously named the project: `clientProjectLink(base, dec.project_id, "approval-<id>")`.
It now emits `…/decisions/<id>`, and `apps/client-portal/src/lib/retired-routes.ts:109-115` folds
that to:

```ts
case 'decisions':
  return { path: '/', anchor: ID_SEGMENT.test(second) ? `approval-${second}` : 'doorstep' };
```

`path: '/'` is *"the client's active project"* (`client-portal-links.ts:9-10`). A homeowner with two
projects who taps the digest line for an approval on her **non**-active project now lands on the
other project's doorstep with an anchor that resolves to nothing. The same file's `/proposals` case
carries `?proposal=<id>` precisely because *"`/` on its own opens the house that moved last, which
for a multi-house client is the wrong one"* — the codebase already knows this hazard, and the
`/decisions` case has no such param.

The mail's own door shares the defect (P-01 shipped `clientDecisionLink`), so F12 made the two
consistent rather than introducing it — but it retired the one link that was right. Fix in the
middleware (resolve the decision's project, as `/invoices/<id>` and `/proposals/<id>` effectively
do) or carry `?project=` on the decision link.

### MINOR — m1 · The new quotation marks are typewriter quotes, against the repo's own convention

`quoted()` emits ASCII `"`. The sibling client letter quotes a title the house way:
`proposal-sign-confirmation/index.ts:136` → `Thanks for signing &ldquo;<strong>…</strong>&rdquo;`
(and `campaign-dispatch:698` uses `&ldquo;/&rdquo;`, `client-invite:151` uses `&rsquo;`). One inbox,
two typographies, for the same studio. F11's own argument ("one rule") applies.

### MINOR — m2 · The badge resolver itself has no test

The tested unit is `buildApnsPayload(input, badge?)`. The rule the ruling actually states — *"on any
error omit the badge rather than send 0"* — lives in `unreadInAppBadge` inside `index.ts`, which no
test can reach (no export, `Deno.serve` at module scope). The lane's own pattern (`core.ts` holds
the pure helpers) would have put it one file over.

### MINOR — m3 · Nothing pins the cron's register at the call site

R3-01's whole content is the literal `notice: "reminder"` at `decision-reminders/index.ts:163`. The
serve handler is untested, `decision-reminders/logic.ts` covers only `reminderStampDisposition`, and
`decision-notify.test.ts` covers only the renderer's *default*. A future edit restoring a derived
register is caught by no test. The brief said "Update tests"; the register has none.

### MINOR — m4 · Digest residue, now louder than the letters it summarises

`notification-digest/logic.ts:65` heads the section **"Decisions that need you"** over items that
are Stage-2 approvals — the exact word F7 just taught the letters not to use — and `:159-161` sends
`"{N} reminders from Patina"`, a number where a word would do. The digest also prints titles
unquoted while the three letters now quote them. The lane names all of this as unruled residue,
which is honest, but F7 and F11 landed one file away.

### MINOR — m5 · A dead branch and a test that pins it

`branded-email.ts:233-235` gives client mail an `opts.businessAddress` that "always wins", and
`branded-email.test.ts:190` pins it. `grep -rn businessAddress supabase/functions/` finds **no
producer** that passes one — the only non-test hits are the interface and the new branch. Untested
paths are worse than absent ones; tested-but-unreachable ones are simply scope.

### MINOR — m6 · `editionUnchangedSinceSent` reads as a fact test and is not one

It returns `false` when `sentAt` is null (`NO-SENTAT-REM` probe: the sentence is dropped). Silence is
the safe direction, so the letter is right — but the helper's name says "unchanged" where the code
means "provably unchanged". A comment or a name saying so would keep the next reader honest.

### NIT — n1 · The helper deletion rode in the wrong commit

`firstNoticeAlreadySent` was orphaned by R3-01 (`61da87110`) but deleted in the F4–F12 commit
(`7fc0c5941`, verified with `git log -S`). The R3-01 commit therefore leaves dead exported code
behind it, and a bisect on the copy commit picks up a behavioural deletion.

### NIT — n2 · `decisionDigestLink` is a pass-through

It takes the same two arguments as `clientDecisionLink`, returns its result unchanged, and exists so
the digest's pure-logic module owns the call. Defensible; also one more name for one address.

### NIT — n3 · `deno fmt --check` flags the new lines

`branded-email.ts:235` (the `isClient ? "" : …` ternary) and the reflowed `studio-identity.ts` doc
comment. `deno fmt` is not a CI gate here (no reference in `.github/workflows/` or `package.json`)
and the repo is not fmt-clean anyway, so this blocks nothing.

### NIT — n4 · F10 still stands

`decision-resolved-notify/index.ts:77` still selects a `created_at` its path never reads. Explicitly
off the fix list and named by the lane. Recorded so it does not get lost.

### NIT — n5 · Cross-lane: `markOpened` (single row) still marks one leg

The close-out ruling says *"the opened WRITE marks both legs"*. `markAllOpened` was widened;
`NotificationsAPIClient.markOpened(id:)` still PATCHes by `id` alone, stranding the `push` twin
`opened_at IS NULL`. Harmless to this lane's badge (it counts `in_app` only) — flagged for the iOS
lane, not against this diff.

## Vision refusals — swept

Every homeowner-visible string in the diff, and every string the probe rendered:
no badge word, no numeric count chip, no red/green, no checkmark-as-status, no shadow, no tab or
dashboard, no emoji, no "AI", no "gate", "task", "dashboard" or "overdue"; no guilt or apology copy;
no invented timing. "Approval" is used only for a frozen-edition ask, "decision" only for an option
choice between named alternatives (F7) and for the designer's record letter. The one word left in
homeowner reach — "Decisions that need you" over a list of approvals — is m4, in code this diff did
not write.

## Advisory to the orchestrator

`waves/w1/wave-report.md`, which both this review brief and the lane brief name as required reading,
**does not exist** (`find …/build -name 'wave-report*'` → nothing; `waves/` holds only `w1/` and
`w2/`). I read `backend-review-r1/r2/r3.md`, `walk-r1.md`, `walk-r2.md`, `backend-notes.md`,
`rulings-2026-09-04.md`, the build sheet and the re-map instead.

## Verdict

**fix** — no blocker, three majors. M1 is the one that matters: R5's second pass ships a springboard
number that is right for a single-event account and wrong for the account the walk actually measured.
M2 and M3 are each one small edit.
