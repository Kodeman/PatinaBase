# Wave 1 simulator walk — round 3 (2026-09-05)

Re-verification of the round-two defects on the Wave 1 close-out tree.

- **Worktree** `git -C … rev-parse --show-toplevel` →
  `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w1-integration`,
  branch `approvals/w1-integration`, HEAD **`aa9079812`**
  ("docs(approvals): W1 close-out — merges, gates, deploy set of 28", docs only).
- **App** `…/apps/mobile/Patina/.build/DerivedDataWalk/Build/Products/Debug-iphonesimulator/Patina.app`,
  binary stamped `2026-09-05 06:37`. `find … -name '*.swift' -newermt "2026-09-05 06:37:43"`
  returns nothing and the two commits after the build are docs-only — the bundle is this tree.
- **Simulator** `29E64516-9C2F-4D77-95D8-55D7B61E017B` (`cae-w1-walk`), booted with Simulator.app
  in front, `defaults write cloud.patina.app DeploymentTarget local`, `simctl install`,
  launched `-DeploymentTarget local`.
- **HID preflight** — tapped "Have a password? Sign in" on the Welcome screen and asserted the
  sign-in sheet mounted (`00-launch.png` → `01-hid-preflight.png`). The first tap was swallowed
  (walk-r1's documented behaviour); the second landed. Every assertion below was re-taken after
  its effect was visible.
- **Stack** local (`127.0.0.1:54322`). The steward's reset was NOT re-run.
- **Shots** `walk-shots-r3/` (63 files).

## Seed, verified by SELECT

`apps/designer-portal/e2e/helpers/workflow-gate-fixture.sql` against the local stack:

```
select id, left(title,42), status, sent_at is not null as published, due_date::date …
 11b2d074-…-c087d524611b | Fixture G1 - Draft awaiting review  | draft   | f | 2026-09-19
 11c29189-…-0c7384d0da21 | Fixture G2 - Published, awaiting …  | pending | t | 2026-09-15
 64dff41d-…-ef56adf04625 | Fixture G6 - Overdue household res… | pending | t | 2026-08-31
 999ec478-…-a21f9223895d | Fixture G7 - Draft ready to publish | draft   | f | 2026-09-21
```

G6's `created_at`/`sent_at` were backdated to `2026-08-24 15:00+00` (replica mode) so the asked-on
day precedes the wanted-by day — `DateDisplay.askedOnClauseEarned` refuses the clause otherwise,
and the fixture is born today.

**One thing the schema will not allow.** The brief asks for a *published* approval whose review is
still required. `needsReviewConfirmation` is `lifecycleStatus == "draft" && !isReviewComplete`
(`DecisionsAPIClient+ProjectApprovals.swift:120`), and `publish_client_decision` refuses to publish
until every frozen reviewer has confirmed. A published row with the review outstanding is not a
reachable state. The reachable equivalent was walked instead: the review leg on the draft (G1),
then the studio published it by RPC (`publish_client_decision` as `designer@patina.dev`), then the
outcomes.

## The round-two defects, item by item

### W1R2-B1 — the first submit — **CLOSED**, twice

**G1, Approve.** Opened cold by deep link after publish; the stamp fired on open
(`viewed_at` and `updated_at` both `11:50:33.897464`), and the FIRST `Submit response` landed:

```
select status, responded_at, client_consent_method from client_decisions where id='11b2d074-…'
 responded | 2026-09-05 11:51:25.912816+00 | (null)
select … approval_outcome from client_decision_options where selected → approved
select action_kind, idempotency_key from project_approval_action_receipts where decision_id='11b2d074-…'
 created          | e2e-fixture:g1-create
 review_confirmed | 22113B33-7BA3-4FD2-A156-86AE943E160F      ← app-minted
 published        | publish-v1:11b2d074-…
 responded        | 0246920B-A7D6-4A04-99A6-5D8D7FB83F84      ← app-minted, exactly one
```

**G6, Ask a question.** Same shape, first submit:

```
 responded | 2026-09-05 11:52:59.729182+00 | (null) | needs_discussion
 responded | CDF7DB89-08A2-46BA-B6BE-6673DA57EE24  ← one receipt, no retry
```

`client_consent_method` stays NULL on this rail by design — Stage-2 records its consent in
`project_decision_review_confirmations.review_method` (`portal_clickthrough`), which the review
leg wrote at `11:49:39.804642`. Shots `12`, `13`, `14`, `15`, `16`, `17`.

### W1R2-M1 — the immutability sentence — **CLOSED**, all three positions

- Review screen (draft, review outstanding): no "You are approving edition N…" anywhere. It reads
  "Read this exact edition, then confirm you have seen it." above `Review exact edition` (`10`).
- After confirming, still absent: "Review confirmed. Your designer can issue this next." (`11`).
- Once published and respondable: **"You are approving edition 901, exactly as shown."** stands
  above "Choose one outcome." and the three outcomes (`12`).
- After answering it is **gone**; the screen reads "You approved this edition." (`14`) and, on G6,
  "You held this edition to talk it through with your designer." (`17`).

### W1R2-M2 — the designer's name on a past-due row — **CLOSED**

Today's NEEDS YOU row: **"Leah asked for your approval." / "Still open, Leah asked on Aug 24."**
(`09`). Pixel probe of both lines: identical body ink **RGB(44,41,38)** — the sentence is not red,
not a separate ramp (`09-today-with-pastdue.png`, crop y 700-815).

### W1R2-M3 — an unsent draft is not an ask — **CLOSED**, on both surfaces

G7 was returned to the exact failing shape (its review confirmation deleted → `draft`, `sent_at`
null, `needsReviewConfirmation` true, due Sep 21). On a relaunch:

- **Today** carries invoice, proposal, G2 only. No Sep 21 row
  (`50-today-draft-excluded.png`; AX tree lists three NEEDS YOU rows).
- **"Awaiting your call"** lists four cards — the legacy sign-off, Rug colour, Dining chairs, G2.
  G7 absent (`51-decision-list-no-draft.png`).

The reviewer's `R3-02` (`restore()` handing Today a disk-persisted draft) could not be reproduced:
it needs an array written by a build without the filter, and this build never persists one. Two
fresh installs in this walk drew no draft on Today.

### W1R2-m1 — `markAllOpened` marks both legs — **CLOSED**

```
select channel, opened_at from notification_log where user_id='…005' order by created_at desc limit 6;
 push   | 2026-09-05 11:56:46+00
 in_app | 2026-09-05 11:56:46+00
 in_app | 2026-09-05 11:56:46+00
 push   | 2026-09-05 11:56:46+00
 in_app | 2026-09-05 11:56:46+00
 in_app | 2026-09-05 11:56:46+00

select channel, count(*) total, count(*) filter (where opened_at is null) unread … group by channel;
 push   | 10 | 0
 in_app | 10 | 0
```

### W1R2-m2 — badge plural grammar — **CLOSED**

Studio hub AX headings: `Awaiting you, five things awaiting you` · `In progress, one category` ·
`Conversation, two categories` · `Money & documents, five categories` · `Archive, zero categories`
(`05`, `06`). The noun agrees with the word in every case.

### W1R2-n4 — the bell says what the approval is now — **CLOSED**

Feed titles (`21`, `54`): open → **"An approval needs you"** (G2, the legacy drawing-set sign-off);
settled → the recorded sentence — "You approved this edition." (G1, G3, G5), "You held this edition
to talk it through with your designer." (G6), "You returned this edition for revision." (G8),
"This approval is closed" (G4, superseded). No "sign-off" survives on any row.

**Bell mark.** `DailyRoomView.BellButton` AX value is **"Unread notifications"** — a clay dot, never
a number, on every screen it was read.

### iosa R3-02 — the retired word off the money rail — **CLOSED**, all three surfaces

Invoice INV-2026-0142 backdated to `2026-08-21`:

- **Invoice list** — "Past due · Aug 21", ink **RGB(44,41,38)** (`25`).
- **Invoice detail** — headline "Past due", line "Past due · Aug 21", both **RGB(44,41,38)** (`26`).
- **Studio money row** — AX `Invoice, $4,250.00 remaining, Past due · Aug 21`, ink
  **RGB(130,97,47)** (Text.interactive) (`24`).
- **Today** — AX `Your invoice is due. INV-2026-0142. $4,250.00 · due Aug 21, past its date.`

`grep -rn "Overdue" apps/mobile/Patina/Patina --include='*.swift'` → 8 hits, every one an
identifier (`isOverdue`) or a comment recording the retired string. No homeowner-visible literal.

## Regression spot-checks

- **P-05 — PASS.** With ten unread `in_app` rows (ten distinct `entity_type|entity_id`), the
  springboard badge reads **10** (`43-crop-badge.png`). The system log confirms the write and the
  grant: `authorizationStatus: Authorized, badgeSetting: Enabled`;
  `[cloud.patina.app] Setting badge count to 10` … `Set badge count [ hasCompletionHandler: 1
  hasError: 0 ]`, repeatedly. Two springboard screenshots (`53`, `55`) captured a stale icon layer
  with no badge while the log showed the write succeeding one second earlier — a `simctl io`
  render artefact, not the app. The feed carries **one row per event**, no doubling, against
  10 `in_app` + 10 `push` rows.
- **P-07 — PASS.** Authorized leg: the row is a switch; flipping it wrote
  `user_settings.push_notifications = f` (12:04:05) and back to `t` (12:04:34). Not-determined leg
  (fresh install): the push primer's "Turn on notifications" raised the OS prompt once
  (`37`, `38`), and Allow left authorization `Authorized` with `badgeSetting: Enabled`.
- **P-08 — PASS.** Signed out through Settings, app terminated, then
  `simctl openurl https://client.patina.cloud/decisions/11c29189-…`: the app cold-launched to the
  auth wall carrying **"We'll open what you tapped once you're in."** (`46`), and after
  email/password sign-in it opened that exact approval — Issue 01, Edition 901, Due Sep 15, Studio
  tab selected (`48`, `49`).
- **P-12 — PASS.** The NEEDS YOU rule is **6 device px at 3× = 2.0 pt**, clay
  **RGB(196,165,123)**; the same scanline across a MOVED row is background throughout. Exactly one
  `See all that needs you` under NEEDS YOU; MOVED holds three rows (the cap) and carries none.
- **P-24 (iOS) — PASS.** No `.badge(` anywhere in the tab bar's AX tree on any screen.

## Findings

### W1R3-m1 · minor · a just-answered approval keeps the open title in the bell

After answering G6 in the app (`needs_discussion` written at 11:52:59), the bell feed still read
**"An approval needs you"** for it (`19-bell-feed-warm.png`), and still did after a pull-to-refresh
on the feed itself (`20-bell-feed-after-refresh.png`). A relaunch corrected it to "You held this
edition to talk it through with your designer." (`21-bell-feed-cold.png`).

`NotificationsViewModel.load` composes the title from `BadgeCountService.shared.projectApprovals`
(`:52`) and never refreshes it; the feed's own pull-to-refresh doesn't either. So the settled title
lags by exactly one badge-service refresh — and the window is the one where the homeowner is most
likely to look, immediately after answering. Same root as the close review's `R3-03`, in its live
rather than its cold-launch form.

Fix: refresh the projection on the feed's own load/refresh, or retitle from the answer the detail
screen just recorded.

### W1R3-n1 · nit · the Record row's accessibility label runs a question into a full stop

`DailyRoomView.HouseRecord` AX label:
`"Leah asked for your approval. Approve the issued Design Development plan set?. Due by Sep 15."`
The composer appends "." after a title that already ends in "?". Visually the two lines are
separate; VoiceOver reads "set question-mark period".

### W1R3-n2 · nit · homeowner-visible numerals outside the ruled scope

The close ruling narrowed P-24 to the three counts in `approval-ask.tsx` and the iOS tab badge,
so this is out of scope and recorded only. Still numerals where the same screen elsewhere spells
counts in words: Studio hub rows — "1 unread thread", "9 unread updates", "5 shared proposals",
"4 accepted", "2 shared invoices", "1 paid", "3 shared files, 1 project", "1 piece on its way",
"Aspen Loft Refresh and 2 more" (`06`); invoice list section headers — "AWAITING PAYMENT (1)",
"PAID (1)" (`25`).

### W1R3-n3 · nit · the Stage-2 card carries no kind chip where the legacy row does

On "Awaiting your call" the legacy sign-off draws an `Approval` chip and the selections draw
`Color` / `Product`; the Stage-2 approval draws none (`51`). Its detail screen has the `APPROVAL`
eyebrow, so nothing is mislabelled — the list is just inconsistent about whether a row names its
kind.

## Noted, not filed

- **"Decline" as the third outcome.** P-16 rules the word to RETURNED / "Returned"; the close
  explicitly parks that as `W1R2-n2`, Wave 2. Unchanged here.
- **The keychain outlives an uninstall on this simulator.** After
  `simctl uninstall` + `install`, the app came back signed in as `client@patina.dev` and a cold
  `/decisions/<id>` link opened the approval without an auth wall (`35`). Standard iOS keychain
  behaviour, not a Wave 1 item; noted because it makes "reinstall" an unreliable way to reach the
  signed-out state — sign out through Settings instead.
- **`iosb3-M2`** (a studio co-member seeing studio-wide published approvals) is a Wave 2 migration
  item by ruling and was not walked; the homeowner path is unaffected and was.

## Housekeeping

- Local stack was not reset. Mutations, all local: the fixture's own scoped teardown+setup, G6's
  backdated `created_at`/`sent_at`, G1's publish, the two responses the app itself recorded,
  INV-2026-0142's `due_date`, G7's review confirmation deleted, and `notification_log`
  `opened_at`/`status` reset to unread twice.
- One harness trap worth recording: `markAllOpened` writes **`status = 'opened'` as well as
  `opened_at`**, and the app's unread predicate reads the status. Clearing `opened_at` alone leaves
  every row still read in the app; the rows must go back to `delivered` (in_app) / `queued` (push)
  as well. Two measurements were repeated for this reason.
- Blitz taps on this device are intermittently swallowed — three separate controls needed a second
  or third tap. No assertion rests on an unverified tap.
- Simulator shut down at the end (`simctl shutdown` → `(Shutdown)`); not deleted. No product code
  was written.
