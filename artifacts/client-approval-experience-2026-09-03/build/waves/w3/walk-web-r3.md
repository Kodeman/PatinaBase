# Wave 3 web walk — round 3, targeted (2026-09-06 UTC / 2026-09-06 CDT)

The final round, walked in a real headless Chromium against the LOCAL stack on the Wave-3
integration branch, after the final fix round. **No product code was written.**

- **Worktree** `git -C … rev-parse --show-toplevel` →
  `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-integration`,
  branch `approvals/w3-integration`, HEAD **`7dc3686cc`**
  ("docs(approvals): the Wave 3 final fixes and their gates") — seven commits above
  `da8f6811b`, which is what round 2 walked.
- **Server** `pnpm --dir <worktree> --filter @patina/client-portal dev` under `nohup`, one Bash
  call, on **:3002**, with the three variables `web-walk-env.md` pins (local Supabase URL plus
  the CLI's demo anon/service keys read out of `supabase status -o env`, never written to a
  file). Log: `web-walk-dev-r3.log`. **Killed at the end** — `lsof -ti:3002` returns nothing and
  `curl` to `/auth/signin` is unreachable.
- **Browser** Playwright 1.58.2 headless chromium, viewports **1280×1100/1400** and **390×844**.
  Scripts `web-walk/r3-*.mjs` + `web-walk/lib-r3.mjs`; shots `web-walk-shots-r3/` (40 files).
- **axe** axe-core **4.11.1**, injected from the repo's pnpm store.
- **Homeowner** `client@patina.dev` / `password123`, project **Aspen Loft Refresh**
  `b0000000-…-0000000000d1`. Second homeowner `client-solo@patina.dev`.

## The stack, and the re-seed

The fix round **reset** the shared stack (`stack-reset-notice.md`, 2026-09-06 entry), so round
2's fixtures were gone: `select count(*) from client_decisions` → **6** (the base seed alone),
`commercial_document_signatures` → **0**. Ledger read before seeding:
`00573, 00572, 00571, 00569, 00568, 00567, 00566, 00565` — both Wave 3 migrations live, in the
edited-in-place shape the fix round left them.

Re-seeded per round 1's recipe, then **verified by SELECT**:

1. `apps/designer-portal/e2e/helpers/workflow-gate-fixture.sql` — the eight G-rows.
2. `web-walk/seed-w3.sql` — the superseded pair whose predecessor she answered, plus the
   `commercial_document_signatures` row on `…cd003` carrying `signed_ip = 203.0.113.44` so the
   "never the IP address" assertion has a real value to refuse.
3. `web-walk/seed-r3.sql` (**new**) — a fifth pending approval for the walk's own Approve, and
   **the first signable door any of these three walks has had**: a `service_addendum` on
   `…cd004` in `commercial_state = 'sent'`.
4. `web-walk/seed-r3-door-terms.sql` (**new**) — that addendum's `proposal_service_terms` and
   two `proposal_service_rates`, without which `sign_design_services_agreement_with_trusted_ip`
   refuses (see advisory 2).

The projection read back as the homeowner, which is where every id below comes from:

| row | outcome | `clientConsentMethod` | `clientSignature` |
|---|---|---|---|
| `61924513` Issue 03 (superseded predecessor) | approved | `electronic_signature` | `Client User` |
| `6e29e2b8` Issue 04 (the leaf) | — | null | null |
| `c442666e` G3 | approved | **null** | **null** |
| `be7f9461` G8 | changes_requested | **null** | null |
| `3351d8a6` G6 | — | null | null · **past its date** |
| `644b3058` Issue 05 (the walk approves it) | — | null | null |

00573's widening is visible in that table: `clientConsentMethod` reaches the browser.

---

## 1 · The Record of Decision — four rows, four different sheets — **PASS**

Read off `record-signature`, one `<p>` per line, in order.

| row | heading | name line | date line | sentence |
|---|---|---|---|---|
| `644b3058` — approved, `electronic_signature`, name (**this walk pressed Approve**) | `Signed` | `Client User` | `Answered 6 September 2026` | `Signed electronically by typed name: Client User.` |
| `af48ac4a` — changes_requested, `click_through` (**this walk pressed Return**) | `Confirmed` | *(absent — 0 nodes)* | `Answered 6 September 2026` | `Confirmed by press-and-hold.` |
| `c442666e` — approved, **null** method, **null** name (the pre-00569 shape) | `Recorded` | *(absent — 0 nodes)* | *(absent)* | `Recorded on 6 September 2026.` |
| `…cd003` — the signed proposal | `Signed` | `Client User` | `Signed 7 August 2026` | `Signed electronically by typed name: Client User.` |

`W3W-R2-01` and `W3W-R1-05` are both **closed, and closed at the root**: the block now follows
the row. `be7f9461` (RETURNED, null method) reads `Recorded` / `Recorded on 6 September 2026.`
under a `RETURNED` stamp — the sheet says the outcome it can source and stays silent about a
method it cannot. `01-record-approved-signed.png`, `24-record-af48ac4a.png`,
`03-record-recorded-nullmethod.png`, `03b-record-returned-nullmethod.png`,
`04-record-proposal-signed.png`.

**Landmarks — `W3W-R1-08` closed.** Every sheet: `main 1 · banner 1 · contentinfo 1`, and
**axe reports 0 violations of any type** on `/decisions/<id>/record` (round 2: `[moderate]
region`, 8 nodes). `05-axe-record.png`.

**No IP anywhere.** `html.includes('203.0.113.44') === false` and `/IP address/i === false` on
all five sheets read this round.

**The mark.** `Mark …` parses to exactly **12 characters** on both rails.

**Print emulation — `W3W-R1-n1` closed.** `page.emulateMedia({ media: 'print' })`:

```
htmlBg          rgb(255, 255, 255)   ← was rgb(250,247,242): the cream is gone
bodyBg          rgb(255, 255, 255)   ←   "
sheetBg         rgb(255, 255, 255)
stampTransform  "none"               ← upright
stampBg         rgba(0, 0, 0, 0)     ← no fill
shadowElements  0
```

Same on the proposal sheet. `06-print-decision.png`, `06b-print-proposal.png`.

## 2 · A stranger's read — **PASS, and `W3W-R1-04` is closed**

`client-solo@patina.dev`, timed from `goto` to the sentence appearing:

| route | RPC traffic | sentence | settled |
|---|---|---|---|
| `/decisions/61924513-…/record` | one `200 list_my_project_decision_reviews` | **This record could not be found.** | **945 ms** |
| `/proposals/…cd003/record` | **one** `403 get_client_commercial_document_bundle` | **This record could not be found.** | **869 ms** |

Round 2 read three 403s and about five blank seconds, then "This record could not be read just
now. Refresh to try again." `retryUnlessRefused` and `isPermissionRefusal` both do what they
claim. Non-enumeration holds: the **owner** reading a nonexistent id gets the identical sentence
on both routes, and signed out the path is kept —
`/auth/signin?callbackUrl=%2Fdecisions%2F61924513…%2Frecord`.
`07-stranger-decision.png`, `08-stranger-proposal.png`, `09-owner-bogus-id.png`.

## 3 · One act along the thread, forward only — **PASS, `W3W-R1-06` closed**

Every card on the doorstep, both act sites (`approval-revisions` on a live ask,
`approval-receipt-forward` on a settled record row), fold open:

```
"Review previous edition" anchors on the whole page: 0
"Review revised edition"  anchors on the whole page: 2
  61924513 (answered predecessor) → #approval-6e29e2b8…   the live successor
  a9b0cca9 (superseded G4)        → #approval-15018689…   its own successor
  6e29e2b8 (THE LEAF)             → no act at all
```

The leaf — the only card asking her for anything — offers nothing backward and nothing forward,
and the continuation line above it already names what it replaces. Ink on the forward act is
`rgb(92,74,60)` at 15px, `--text-body`, no clay (`W3W-R1-01` stays closed).

**The act lands.** On the landing page the fold is shut and `#approval-15018689…` is not in the
DOM, so the second forward act appears to point at nothing. Clicked, it does the right thing:
the fold opens, the card mounts, and the viewport ends at `targetTop 0`, `scrollY 14157`
(`15-forward-act-clicked.png`). A fresh load addressing an id that names nothing leaves the fold
shut at `scrollY 0`, and a fresh load addressing a record behind the fold opens it (3 → 5
records) and scrolls to it. `13-fold-open-forward-act.png`, `14-fold-opened-by-address.png`.

**The thread reads in order** (`10-successor-thread.png`, `31-successor-390.png`):

```
Edition 904 replaces the edition you approved on September 6.
…
WHAT CHANGED SINCE YOUR LAST ANSWER
It is titled “Issue 04 - Library elevations, Rev B”; the one you answered was “Issue 03 - Library elevations”.
The cost falls by $800, the schedule pulls in by two days, and the lead time does not change.
```

*undone · reopened · reversed · void* all count **0** across the doorstep.

## 4 · The details sheet — **PASS, `W3W-R1-07` and `W3W-R1-n3` closed**

```
radio groups in the sheet: ["details-reminder-cadence"]        ← ONE, where round 2 had two
  right_away     "Tell me right away"
  daily       ✓  "Once a day"
  weekly_sunday  "Once a week, on Sunday"
"Digest frequency" ×0     "Re-engagement" ×0
"Occasional notes from your studio" ×1
right_away / weekly_sunday / daily_digest as TEXT: 0 / 0 / 0
```

The quiet-hours line is unchanged and still says the two R16 exceptions:

> Approval mail waits for the morning: nothing before 8am in your time zone, and nothing on
> Sunday — except the weekly summary, if that is the pace you choose. A notification on your
> phone keeps the same hours and stops at 8pm. The notice that an approval has passed its date
> is the one thing that never waits.

The standing "Once a day" is the honest default, not a drift: there was no
`notification_preferences` row at all, and `DEFAULT_PREFERENCES.reminder_cadence` ("daily")
matches the column default (`'daily'::text`). `16-details-sheet.png`.

**"Don't remind me" now says what iOS says**, word for word:

> I'll hold the reminders. Choose again here whenever you want them back.

`19-snooze-never-said.png`. Half of `W3W-R1-09` is closed. The other half — "When it's due"
withheld on an undated approval — **cannot be walked, and cannot happen**: see `W3W-R3-01`.

## 5 · The past-due date line — **PASS, `W3W-R1-n2` closed**

Every `approval-due-line` on the doorstep, with its computed ink:

```
3351d8a6 (G6) → "Due September 1 · past its date"   rgb(92,74,60)
7db72feb      → "Due September 20"                  rgb(92,74,60)
af48ac4a      → "Due September 16"                  rgb(92,74,60)
831d921b      → "Due September 22"                  rgb(92,74,60)
6e29e2b8      → "Due September 19"                  rgb(92,74,60)
644b3058      → "Due September 22"                  rgb(92,74,60)
```

Words, in body ink, never red, and the word *overdue* appears **0** times on the whole doorstep.
On that same card `approval-snooze` counts **0** and in its place stands "This one is past its
date, so its notice stands." `11-past-due-date-line.png`, `32-past-due-390.png`.

## 6 · axe — **zero violations, on both surfaces**

```
doorstep, five asks + the records fold open, after every act this walk performed:  0 violation types
/decisions/<id>/record:                                                            0 violation types
/proposals/<id>/record (read through the same pass):                               0 violation types
```

`12-axe-doorstep.png`, `05-axe-record.png`, `36-doorstep-1280.png`.

**Vocabulary**, rendered text only:

```
doorstep:  gate 3 · task 0 · overdue 0 · dashboard 0 · Declined 0 · confetti 0 · badge 0
           undone 0 · reopened 0 · reversed 0 · void 0 · Re-engagement 0
           right_away 0 · weekly_sunday 0 · click_through 0 · electronic_signature 0
           portal_clickthrough 0 · emoji 0 · numeric-only leaf nodes 0
records:   every term above 0 · emoji 0 · Mark length 12
```

All three `gate` hits are fixture-authored `context` strings from `workflow-gate-fixture.sql`
("Fixture gate published and pending a household response."), quoted verbatim in the log. No
refused word reaches a homeowner from a Patina string.

## 7 · Regression — all four legs walked, the door for the first time

**Cadence write.** Choosing "Once a week, on Sunday" in the sheet, then read back:

```
notification_preferences
 a0000000-…-000000000005 | weekly_sunday | 2026-09-06 06:31:16+00
```

**A standing snooze survives a cold load.** With `kind='never', snoozed_until='infinity'` in
`decision_snoozes`, a fresh load of the doorstep drew `approval-snooze-said` count **1** —
"I'll hold the reminders. Choose again here whenever you want them back."
`20-snooze-survives-reload.png`. (`W3W-R1-02` stays closed.)

**Approve, held and signed.** On `644b3058`: `approval-signature` present, Submit **disabled**
before the name and **enabled** after it; a plain click leaves the confirm block standing; a
1.8 s press-and-hold settles the card to `APPROVED 6 SEPTEMBER · Issue 05 - Hall lantern ·
Edition 905` with `KEEP A COPY` beside it. Row:
`client_consent_method = electronic_signature`, `client_signature = 'Client User'`.
`22-approve-signature-644b3058.png`, `23-answered-644b3058.png`.

**Return, held, no name.** On `af48ac4a`: the change note is required (`Tell Leah Hartwell what
to change.` / "It goes into the discussion below with your answer."), no signature line, held
submit → `RETURNED 6 SEPTEMBER`. Row: `client_consent_method = click_through`,
`client_signature` empty — exactly the 2026-09-05 ruling. `23-answered-af48ac4a.png`.

**The door swings, and the receipt is the ruled sentence.** `door-way` mounts on `…cd004`; the
act is gated on BOTH the consent tick and the typed name (disabled · disabled · enabled), a
plain click yields no receipt, and a held press posts `200
{"ok":true,"commercialState":"client_signed","newlyClientSigned":true}`. Then:

```
door-receipt   Aspen Loft — Addendum No. 1 · signed 6 September ·
               Leah Hartwell has your signature. You’ll have a copy.
door-keep-a-copy → <a href="/proposals/b0000000-…cd004/record"
                      target="_blank" rel="noopener noreferrer">Keep a copy</a>
```

P-19's ruled sentence, naming the studio and not a person; "countersigns" appears nowhere. The
record it produces reads `Signed / Client User / Signed 6 September 2026 / Signed electronically
by typed name: Client User.` under a `SIGNED` stamp. `25-door-shut.png`,
`27-door-mid-swing.png`, `28-door-receipt.png`, `29-door-record.png`, `33-door-390.png`,
`34-door-receipt-390.png`.

The same act stands on all three answered approvals, every one `target="_blank"
rel="noopener noreferrer"` pointing at `/decisions/<id>/record`.

---

## Findings

### `W3W-R3-01` · minor · 0.9 — the undated-approval branch cannot fire, and a null there empties the whole doorstep

`apps/client-portal/src/components/threshold/approval-ask.tsx:882` (`snoozeActsOffered`) and
`:317` (`dueLine`) · `packages/supabase/src/hooks/use-project-approvals.ts:80,346`

The fix withholds "When it's due" from an approval with no date, "mirroring
`DecisionSnooze.offered(hasDueDate:)`". On this rail that condition is unreachable, three ways
over:

```
project_approval_artifacts.due_at        NOT NULL        (\d, walked)
create_project_approval_decision         RAISE 'approval dueAt is required'   (walked)
ProjectApprovalReview.dueAt              string, not string | null
parseProjectApprovalReview               dueAt = stringValue(row,'dueAt',label)  → throws on null
```

So `parseSourceDate(approval.dueAt) !== null` is true for every row the browser can ever hold,
and the `when_due` filter is dead code. Walked rather than argued: intercepting
`list_my_project_decision_reviews` and nulling `dueAt` on one row does not produce an undated
card — it produces **zero cards**, because one unparseable row throws and the whole projection
list is discarded (`21-undated-card-absent.png`: "Hall lantern" absent, `[id^="approval-"]`
count 0, the entire approvals section gone).

Two separate things follow, and the second is the one worth a line in the docs: the iOS-parity
claim in the comment is not something this surface can keep, and `parseProjectApprovalReview`
is all-or-nothing — a single malformed row takes down every approval on the doorstep rather
than the one it belongs to. Neither is a Wave 3 regression (the parser predates it), and
neither can bite today. Fix, if it is worth one: either say in the comment that the branch is
defensive, or make `dueAt` nullable end to end so the branch and iOS actually agree.

### Nits

- **`W3W-R2-n1` (carried, unchanged)** — two Records of Decision print the same MARK. `c442666e`
  and `be7f9461` both read `MARK B1B1B1B1B1B1`: the checksum is the *artifact edition's*, so two
  approvals hanging off one edition keep indistinguishable marks. Correct as provenance of the
  drawing, misleading as provenance of the decision.
- **`W3W-R2-n2` (carried, unchanged)** — under a standing hold the four Remind-me acts carry no
  `aria-pressed` / `aria-current`; the only tell is the adjacent prose. Deliberate per the fix
  note, recorded so the choice stays a choice.
- **`W3W-R3-n1` (new, low)** — the impact rail prints `SCHEDULE 0 DAYS` beside `COST +$320`
  while the sentence above already says "the schedule does not change". R11 rules the three
  deltas stand side by side as figures, so this is the ruling working; noted only because it is
  the one numeral on the card that a word already covers.
- **n4 (carried)** — the letterhead reads `Leah Hartwell` because the seeded organization is
  literally named that. Fixture, not a defect.

### Round-2 findings, re-walked

| id | was | now |
|---|---|---|
| `W3W-R2-01` | major — the keepsake claimed a method the row could not support | **CLOSED** (§1) |
| `W3W-R1-04` | minor — a denied paper record read as a transient failure | **CLOSED** (§2) |
| `W3W-R1-05` | minor — a RETURNED record headed "Signed" | **CLOSED** (§1) |
| `W3W-R1-06` | minor — the successor's one act pointed backward | **CLOSED** (§3) |
| `W3W-R1-07` | minor — two frequency controls in one panel | **CLOSED** (§4) |
| `W3W-R1-08` | minor — the record sheet was a landmark-free page | **CLOSED** (§1) |
| `W3W-R1-09` | minor — "Don't remind me" said two things | **CLOSED** for the copy; the undated half is `W3W-R3-01` |
| `W3W-R1-n1` | nit — cream under the printed sheet | **CLOSED** (§1) |
| `W3W-R1-n2` | nit — the past-due date line had no tell | **CLOSED** (§5) |
| `W3W-R1-n3` | nit — "Re-engagement" in her own settings | **CLOSED** (§4) |
| `W3W-R1-01` · `-02` · `-03` | round-1 majors | still closed (§3, §7, §6) |

---

## Advisories

1. **The door was never actually missing — the harness was looking for the wrong id.** Three
   walks reported `door-gate` count 0. There is no `data-testid="door-gate"` anywhere in
   `door-gate.tsx`; the doorway is `door-way` and the leaf is `door-leaf`. What the seed truly
   lacked was a signable instrument, which `seed-r3.sql` now supplies.
2. **A hand-built `service_addendum` is not signable until it has terms and a rate.** The first
   swing answered `500 {"error":"sign_failed"}`; the server log carried
   `design services agreement requires terms and at least one role rate` (00477:306). That is a
   fixture gap, and the surface behaved correctly through it — the leaf said "This paper could
   not be signed just now. Your designer can help from their side.", never the database's
   sentence, so Wave 2's `W1-02` stays closed. `seed-r3-door-terms.sql` closes the gap.
3. **A peer walker shares this local stack and wrote to it mid-pass.** At `06:30:17` a `Rug
   color` decision was answered `click_through`, and at `06:38:46` this walk's own successor
   `6e29e2b8` was approved with the signature **`Margaret Whitfield`** — a name this walk never
   typed, on a row this walk left pending. Every observation in §1–§6 was taken **before**
   06:38 and none of them depends on those rows; §7's "Keep a copy" inventory, read at 06:44,
   lists `6e29e2b8` because the peer had answered it by then. Two walkers on one stack is the
   known "last write wins" shape, recorded so the timestamps in this report can be checked.
4. **Playwright cannot launch chromium inside the sandbox**, and `supabase status` cannot run
   sandboxed either (it opens `supabase/.env.local`). Both ran unsandboxed. `psql` against
   `127.0.0.1:54322` is unaffected.
5. **A fragment-only `goto` is a same-document navigation in Chromium** — every fold and anchor
   probe loads a different URL first. One reading in this walk was wrong for exactly this and
   was re-taken (§3's "an address that names nothing").
6. **The DB runs UTC**; `now()` read `2026-09-06 06:xx` while the host clock read
   `Sun Sep 6 01:xx CDT`. Every "6 September" on these sheets is the DB's today.

## Housekeeping

- Local stack **not reset** by this walk; it was re-seeded (the four scripts in §"The stack").
  Mutations, all local, all through the shipped surfaces except the seeds: one cadence change to
  `weekly_sunday`, one `never` snooze on the successor, one Return on `af48ac4a`, one Approve
  with a typed name on `644b3058`, and three signatures on the walk's own door proposal
  `…cd004` (rewound twice by `seed-r3-door-reset.sql` so the swing and the receipt could be read
  in one pass).
- **No production mutation. Nothing pushed. No `git add -A`. No product code written.** No
  `.env` file read or written; no `.claude/`, `.agents/`, hook or settings file touched. No
  worktree or simulator created or removed.
- **The dev server this walk started was killed** — `pkill` scoped to this worktree's
  client-portal; `lsof -ti:3002` returns nothing and `curl` to `:3002/auth/signin` is
  unreachable.
- Program documents and shots were written into **the integration worktree's** copy of
  `artifacts/…/build/waves/w3/`, not the main checkout's, because that is the tree this branch
  commits from; the shots are mirrored to the main checkout path as well.

## Verdict

**ship** — no blocker and no major. The one round-2 major (`W3W-R2-01`) is closed at the root,
all six carried minors are closed, all three round-1 nits are closed, and the two surfaces this
wave owns now pass axe with **zero violations of any type**. The door — unwalked for three
rounds — swings, receipts, and hands her the keepsake. What remains is one minor
(`W3W-R3-01`, a defensive branch the rail cannot reach) and three nits, none of which a
homeowner can meet.
