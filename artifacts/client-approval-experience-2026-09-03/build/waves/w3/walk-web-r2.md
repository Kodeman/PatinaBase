# Wave 3 web walk — round 2 (2026-09-06 UTC / 2026-09-05 CDT)

The habit re-walked in a real headless Chromium against the LOCAL stack, on the Wave-3
integration branch, after the walk-fix round. **No product code was written.**

- **Worktree** `git -C … rev-parse --show-toplevel` →
  `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-integration`,
  branch `approvals/w3-integration`, HEAD **`da8f6811b`**
  ("docs(approvals): the Wave 3 round-1 walk fixes and their gates"), one commit above
  `e3b4d6a71` — the fix for the three round-1 majors.
- **Server** `pnpm --dir <worktree> --filter @patina/client-portal dev` under `nohup`, on
  **:3002**, with the three env vars `web-walk-env.md` pins (local Supabase URL + the CLI's
  demo anon/service keys, read out of `supabase status -o env`, never written to a file).
  Log: `web-walk-dev-r2.log`. Killed at the end (below).
- **Browser** Playwright 1.58.2 headless chromium, viewports **1280×1100/1400** and **390×844**.
  Scripts: `web-walk/r2-*.mjs` + `web-walk/lib-r2.mjs`. Shots: `web-walk-shots-r2/` (29 files).
- **axe** axe-core **4.11.1**, injected from the repo's pnpm store.
- **Homeowner** `client@patina.dev` / `password123` — "Client User", project **Aspen Loft
  Refresh** `b0000000-…-0000000000d1`. Second homeowner: `client-solo@patina.dev`.
- **Stack NOT reset.** Ledger read before the walk: `00573, 00572, 00571, 00569, 00568` —
  both Wave 3 migrations live. Round 1's fixtures were all still standing, so nothing was
  re-seeded: the superseded pair (`57d7fad9` approved → `aee67ead` pending), the eight G-rows,
  and the `commercial_document_signatures` row carrying `signed_ip = 203.0.113.44`.

---

## The three round-1 majors — ALL THREE CLOSED

### `W3W-R1-01` — the revision act's contrast — **CLOSED**

Both render sites now draw in `--text-body`:

```
"Review revised edition"   rgb(92,74,60) on rgb(250,247,242) → 7.86:1 @ 15px   clay in className: false
"Review previous edition"  rgb(92,74,60) on rgb(250,247,242) → 7.86:1 @ 15px   clay in className: false
```

`--color-clay` still computes `#C4A57B` on `:root` and still dresses the rules and caps; the
act left it. **axe over the settled doorstep now reports ZERO violations of any type** — the
serious `color-contrast` pair is gone and nothing replaced it. Visible in
`15-successor-by-address.png`: the forward act is the darkest underlined line on the card.

While measuring, the neighbouring acts were read too, because the fix touched only one element:
the four Remind-me acts are `rgb(101,89,78)` at 12px → **6.35:1**, and the said-line is body ink
at **7.86:1**. Nothing else on the ask sits near the floor.

### `W3W-R1-02` — the standing snooze on re-entry — **CLOSED, and honestly**

Three readings, each a cold load of the doorstep with a row already in `decision_snoozes`:

| stored row | what the doorstep drew on mount |
|---|---|
| `kind='never'`, `snoozed_until='infinity'` | said-line count **1** — "I won't remind you again until it's past its date." |
| `kind='sunday'`, `snoozed_until=2026-09-06 13:00+00` | said-line count **1** — "I'll ask you Sunday." |
| `kind='tomorrow_morning'`, `snoozed_until = now() − 2h` | said-line count **0** — the block is the bare four acts |

The third is the honesty rule the fix claimed (`standingDecisionSnooze` refuses a hold whose
hour has passed), walked rather than trusted: I set my own walk row into the past, reloaded,
read nothing, and restored it. `19-snooze-reentry-never.png`, `19b-snooze-reentry-sunday.png`.

The write half still writes. Pressing **SUNDAY** at 00:02 CDT on Sunday wrote

```
decision_snoozes
 aee67ead-… | sunday | 2026-09-06 13:00:00+00 | created 2026-09-06 05:02:24+00
```

— 13:00 UTC = **8am local, Sunday**, read back through `at time zone 'America/Chicago'`.

### `W3W-R1-03` — `landmark-unique` — **CLOSED**

Five discussion landmarks on the settled doorstep, **five distinct `aria-label`s**, including
the two pairs that previously collided:

```
approval-f5e6c6ad…  Discussion about Issue 02 - Design Development Set, Rev B · Edition 902 · approval f5e6c6ad-…
approval-088f45be…  Discussion about Issue 02 - Design Development Set, Rev B · Edition 902 · approval 088f45be-…
approval-07647b90…  Discussion about Issue 01 - Design Development Set · Edition 901 · approval 07647b90-…
approval-1ee658bb…  Discussion about Issue 01 - Design Development Set · Edition 901 · approval 1ee658bb-…
approval-aee67ead…  Discussion about Issue 04 - Library elevations, Rev B · Edition 904 · approval aee67ead-…
```

axe's `landmark-unique` is gone with the rest of the doorstep's violations.

---

## 1 · The Record of Decision — the briefed behaviours all hold

`/decisions/57d7fad9-…/record` (`01-record-decision-1280.png`, `01b-…-390.png`) and
`/proposals/b0000000-…cd003/record` (`02-…`): letterhead `Leah Hartwell`, kind line, edition
line, question, stamp, signed block, and

```
MARK C3C3C3C3C3C3 · KEPT BY LEAH HARTWELL · PREPARED WITH PATINA     (decision)
MARK D5D5D5D5D5D5 · KEPT BY LEAH HARTWELL · PREPARED WITH PATINA     (proposal)
```

**Twelve characters, and only twelve.** R6 holds.

**No IP anywhere.** A regex over `page.content()` returns only `127.0.0.1` (the local Supabase
API URL in Next's flight payload). The seeded `203.0.113.44` is **absent from both sheets**
(`html.includes('203.0.113.44') === false`), and `/IP address/i` is false on both.

**Print media**, `page.emulateMedia({ media: 'print' })`, both routes:

```
stampTransform  "none"              ← upright, rotation 0 (screen: matrix(0.999816,-0.0191974,…) = −1.1°)
stampBg         rgba(0, 0, 0, 0)    ← no fill
stampShadow     "none"
sheetBg         rgb(255, 255, 255)  ← #record-print-root is white paper
shadowElements  []                  ← nothing on the page computes a box-shadow
bodyBg/htmlBg   rgb(250, 247, 242)  ← nit n1, unchanged
```

**A second seeded homeowner** (`client-solo@patina.dev`), sampled at 2/5/8/12 s:

| route | what she gets |
|---|---|
| `/decisions/57d7fad9-…/record` | one 200 from `list_my_project_decision_reviews`, **"This record could not be found."** at 2 s, zero stamps |
| `/proposals/b0000000-…cd003/record` | **three 403s** from `get_client_commercial_document_bundle`, blank until ~5 s, then **"This record could not be read just now. Refresh to try again."** |

Non-enumeration holds on both: the owner reading a bogus id gets the identical sentence on the
identical route. Signed out, the path is kept —
`/auth/signin?callbackUrl=%2Fdecisions%2F57d7fad9…%2Frecord`. The paper route's register is
still the defect (`W3W-R1-04`, unchanged).

**"Keep a copy"** beside the stamp: three of the doorstep's answered records carry it —
`51c48d1c`, `a3a4ae27`, `57d7fad9` — every one `target="_blank" rel="noopener noreferrer"`,
pointing at `/decisions/<id>/record`. **The door's own act was again not reachable**: with no
unsigned commercial instrument on this seed, `door-gate`/`door-receipt`/`door-keep-a-copy` all
count 0 at `?proposal=<signed id>#door`, at `#door`, and bare. Advisory 1; the act exists at
`door-gate.tsx:407-417` and is covered by `door-gate.test.tsx:390`.

---

## 2 · The successor read as one thread — PASS

`#approval-aee67ead-…` on a full document load (`15-successor-by-address.png`,
`22-successor-390.png`), in this order:

```
YOUR APPROVAL · YOUR ANSWER IS NEEDED
Edition 904 replaces the edition you approved on September 5.       ← approval-continuation
Issue 04 - Library elevations, Rev B   Edition 904 · Issued September 5
Do the revised library elevations read right to you?
The bookcase lost a bay, so the run is shorter.  — Leah Hartwell
Due September 18
You are approving edition 904, exactly as shown.
The cost rises by $450, the schedule moves out by one day, and the lead time grows by seven days.
COST +$450 · SCHEDULE +1 DAY · LEAD TIME +7 DAYS
WHAT CHANGED SINCE YOUR LAST ANSWER                                 ← approval-changed-since
It is titled “Issue 04 - Library elevations, Rev B”; the one you answered was “Issue 03 - Library elevations”.
The cost falls by $800, the schedule pulls in by two days, and the lead time does not change.
```

The delta is a **difference between the two asks** in the standing-sentence grammar (125000 →
45000 = "The cost falls by $800"), said in the same voice as the edition's own "+$450". Nothing
says undone, reopened, reversed or void — all four counted 0 across the doorstep.

*(One sentence on the card — "The later edition, issued after she answered the first." — is the
walk fixture's own `context` string, `seed-w3.sql:85`, not Patina copy.)*

**The fold opens itself.** Four probes, each on a full document load:

| address | records shown | fold act | element | scrollY |
|---|---|---|---|---|
| `#approval-8ed2b4e7…` (behind the fold) | **7** | gone | present, top of viewport | 12099 |
| `#approval-104e94dc…` (behind the fold today — the pile grew) | **7** | gone | present, top of viewport | 11786 |
| `#approval-0000…0000` | 3 | intact | absent | 0 |
| no address | 3 | intact | — | 0 |

The fold opens only for an address that names a record, and puts her in front of it.
`14-fold-opened-by-address.png`.

**One act, and it still points backward** — `Review previous edition → #approval-57d7fad9…`,
the only child of `approval-revisions`. `W3W-R1-06`, unchanged: a steward's ruling.

---

## 3 · She sets the pace — PASS on all four legs

**Cadence**, in the details sheet (`08-details-sheet-cadence.png`), three in her words, radio
group `details-reminder-cadence`:

```
(•) Tell me right away        value="right_away"   ← standing when the walk opened
( ) Once a day                value="daily"
( ) Once a week, on Sunday    value="weekly_sunday"
```

No token reaches the page as text (`right_away` / `weekly_sunday` / `daily_digest` all count 0
in `innerText`); they appear only as `value=` attributes.

**The quiet-hours floor**, said as a fact about Patina and naming R16's two exceptions:

> Approval mail waits for the morning: nothing before 8am in your time zone, and nothing on
> Sunday — except the weekly summary, if that is the pace you choose. A notification on your
> phone keeps the same hours and stops at 8pm. The notice that an approval has passed its date
> is the one thing that never waits.

and, above the cadence group:

> A new proposal and invoice reminders are time-sensitive and always arrive right away,
> regardless of this setting. So does the notice that an approval has passed its date.

**The row proves it.** Choosing "Once a week, on Sunday" (`09-cadence-weekly-chosen.png`) wrote

```
notification_preferences
 a0000000-…-000000000005 | weekly_sunday | 2026-09-06 05:02:13.500089+00
```

**Snooze** on the open successor (`10-snooze-acts.png` → `11-snooze-said.png`): four acts,
"Still yours to answer; only the reminders wait." beneath, `SUNDAY` → the row above and the
confirmation "I'll ask you Sunday."; `DON'T REMIND ME` → `kind='never'`,
`snoozed_until='infinity'` and "I won't remind you again until it's past its date."
(`20-snooze-never.png` — `W3W-R1-09`, unchanged).

**Past due.** On G6 (`f5e6c6ad`, due August 31) the `approval-snooze` block **counts 0** and in
its place stands "This one is past its date, so its notice stands." The word *overdue* is absent
from the card and from the whole doorstep. `12-past-due-no-snooze.png`, `23-past-due-390.png`.

---

## 4 · axe

axe-core 4.11.1, `resultTypes: ['violations']`, whole document.

**Doorstep, five asks and the records fold on screen (`16-axe-doorstep.png`):**

```
0 violation types.
```

Round 1's two — `[serious] color-contrast` ×2 and `[moderate] landmark-unique` ×2 — are both
closed, and Wave 2's `W1-04` (104 nodes at `#8B7355`) stays closed: `--text-muted` computes
`#4E4339`.

**Record page `/decisions/<id>/record` (`17-axe-record.png`):**

```
[moderate] region   8 nodes   All page content should be contained by landmarks
```

`main: 0 · nav: 0 · header: 1 · role="region": 1`. Zero contrast failures on the sheet.
`W3W-R1-08`, unchanged.

---

## 5 · Vocabulary sweep of rendered text

```
doorstep:  gate 3 · gates 0 · task 0 · tasks 0 · overdue 0 · dashboard 0 · AI 0
           Declined 0 · declined 0 · decline 0 · confetti 0 · badge 0
           undone 0 · reopened 0 · reversed 0 · void 0
           click_through 0 · electronic_signature 0 · portal_clickthrough 0
           right_away 0 · weekly_sunday 0 · daily_digest 0
           emoji 0 · numeric-only chips 0 (a sweep of every leaf span/div/p/em/strong
                                           whose whole text is an integer or “(N)”)
record:    every term above 0 · emoji 0
```

All three `gate` hits are fixture-authored `context` strings from
`workflow-gate-fixture.sql` ("Fixture gate whose response window has lapsed…"). No refused word
reaches a homeowner from a Patina string. `RETURNED` is the stamp word, `Returned` the prose
word, "Declined" appears nowhere.

---

## Findings

### `W3W-R2-01` · major · 0.85 — the keepsake states a signature method the record cannot support

`apps/client-portal/src/app/decisions/[id]/record/page.tsx:154` ·
`apps/client-portal/src/lib/record-of-decision.ts:67`

The consent sentence is derived from the **outcome alone**:

```ts
export function consentMethodForOutcome(outcome) {
  if (outcome === 'approved') return 'electronic_signature';   // → "Signed electronically by typed name."
  …
}
```

so an approval whose row carries **no** consent method and **no** name still prints the
sentence that names one. Walked on G3 (`104e94dc`):

```
DB:      client_consent_method = NULL   client_signature = NULL   responded_at = 2026-09-06 04:02
sheet:   THE ANSWER · APPROVED 5 SEPTEMBER …
         SIGNED
         Answered 5 September 2026
         Signed electronically by typed name.      ← nothing between the label and the date
```

`18-record-approved-G3.png`. This is not a fixture artefact: `get_project_decision_reviews`
projects `clientSignature` and deliberately **no consent metadata** (its own comment says the
name is "NULL on every approval answered before 00569"), and the page fills the gap by
inference. Every Stage-2 approval answered before 00569 — which is every one standing in
production today — therefore prints a provenance claim its row cannot substantiate, on the one
page the program built to be filed and kept.

The `changes_requested` leg is accidentally right ("Confirmed by click-through." matches the
2026-09-05 ruling), so the defect is specific to *approved without a stored name*.

Fix: let the sentence follow the record, not the outcome — say "Signed electronically by typed
name." only when `clientSignature` is present, and otherwise either widen the projection to
carry `client_consent_method` or say nothing. The sheet already states nothing it cannot source
for the name; the method should hold to the same rule.

### `W3W-R1-04` · minor · 0.85 — a denied paper record still reads as a transient failure — **UNCHANGED**

`apps/client-portal/src/app/proposals/[id]/record/page.tsx:62`. Re-walked: three **403**s from
`get_client_commercial_document_bundle` (React Query's default retry), blank until ~5 s, then
"This record could not be read just now. Refresh to try again." The sibling decision route
answers "This record could not be found." at 2 s for the same situation, and the owner's read of
a nonexistent proposal id gives the identical sentence, so non-enumeration holds. A permission
refusal is never fixed by refreshing. Fix: `retry: false` and let a 403 fall through to the
not-found sentence.

### `W3W-R1-05` · minor · 0.8 — the keepsake labels a RETURNED record "Signed" — **UNCHANGED**

`apps/client-portal/src/components/record/record-sheet.tsx:269` is still
`<p className={LABEL_CLASS}>Signed</p>`, unconditional. G8 (`eb18b8ad`, changes_requested) prints

```
SIGNED
Answered 5 September 2026
Confirmed by click-through.
```

with nothing between the label and the date — `18-record-returned-G8.png`. The record she files
for a return is headed with the word for the act she did not perform. Same shape as
`W3W-R2-01`, and one fix can serve both.

### `W3W-R1-06` · minor · 0.8 — the successor's one act points backward — **UNCHANGED**

`data-testid="approval-revisions"` on the open successor contains exactly one act,
`Review previous edition → #approval-57d7fad9-…`. `web-walk-env.md` §P-27 says "exactly one
forward act — never a link back". Still a steward's ruling rather than a code fact: either the
doc moves or the backward act is suppressed on a live successor and kept on a closed record.

### `W3W-R1-07` · minor · 0.75 — two frequency controls in one panel — **UNCHANGED**

`details-sheet.tsx`. The dialog reads, in order, with nothing between them:

```
Quiet hours … Enable quiet hours
Digest frequency — Bundle routine updates into a single email.
Digest frequency:  Never  Daily  (•)Weekly  Every two weeks  Monthly      name="details-digest-frequency"
Reminders — How gentle nudges … reach you. …
Reminder cadence:  Tell me right away  Once a day  Once a week, on Sunday  name="details-reminder-cadence"
```

The legacy group is not only present, it is **set** (`weekly` checked), so a homeowner is asked
to reconcile "Digest frequency: Weekly" against "Reminder cadence: Once a week, on Sunday" with
no copy saying which governs approval mail. (The words "Digest frequency" are also printed
twice in a row, as section heading and as group label.) `08-details-sheet-cadence.png`.

### `W3W-R1-08` · minor · 0.7 — the Record of Decision is a landmark-free page — **UNCHANGED**

axe `region`, moderate, **8 nodes**; the page has `main: 0`, `nav: 0`, one `header` and one
`role="region"`. One `<main>` around the sheet closes all eight. The Threshold itself does not
trip this rule — and now trips nothing at all.

### `W3W-R1-09` · minor · 0.7 — "Don't remind me" says two different things — **UNCHANGED**

| surface | sentence |
|---|---|
| web | `I won't remind you again until it's past its date.` |
| iOS, after `3066f8c6e` | `I'll hold the reminders. Choose again here whenever you want them back.` |

One act, one table (`decision_snoozes`, `kind='never'`, `snoozed_until='infinity'`), two
sentences; and on an undated approval web's sentence points at a date that does not exist.

### Nits

- **`W3W-R2-n1` (new)** — **two Records of Decision print the same MARK.** G3 (`104e94dc`) and
  G8 (`eb18b8ad`) both read `MARK B1B1B1B1B1B1`: the checksum is the *artifact edition's*
  (`record-sheet.tsx:67`, "Twelve characters of the artifact's checksum"), so two approvals
  hanging off one edition — the ordinary case, the same one that forced `W3W-R1-03` — keep
  indistinguishable marks. It is correct as provenance of the drawing and misleading as
  provenance of the decision. Worth a line in the docs if not a change in the code.
- **`W3W-R2-n2` (new)** — under a standing hold the four Remind-me acts carry no
  `aria-pressed` / `aria-current` (`[{"text":"SUNDAY","pressed":null,"current":null}, …]`); the
  only tell is the adjacent prose. Deliberate per the fix note ("nothing about the four acts
  changed"), recorded so the choice is a choice.
- **n1 (carried)** — under print emulation `body`/`html` stay `rgb(250,247,242)` while
  `#record-print-root` is white; with background graphics enabled a printer lays cream under the
  remainder of the page. `04-print-decision.png`.
- **n2 (carried)** — the past-due ask's visible date line is a plain `Due August 31` in body ink
  with no past-due tell. (The words "This response is past due." in that card's heading are the
  fixture's own `question` string, `workflow-gate-fixture.sql:139` — not product copy.) The Wave
  1 ruling gave the money rail "Past due · {date}"; the approval rail's date line did not move.
- **n3 (carried)** — `Re-engagement` is still a visible label in the homeowner's own details
  sheet, beside "Weekly inspiration" and "Seasonal campaigns".
- **n4 (carried)** — the letterhead reads `Leah Hartwell` because the seeded organization is
  literally named that. Fixture, not a defect.

---

## Advisories (none blocked the walk)

1. **The door was again unreachable on this seed.** No unsigned commercial instrument exists, so
   no `DoorGate` mounts and `door-keep-a-copy` cannot be walked. Third walk in a row; if the act
   is to be walked rather than unit-tested, the seed needs an unsigned proposal.
2. **A peer's rows are still on this stack and project** — `Walk R1 - Pantry shelving depth` and
   `Walk R1 - Stair rail profile`, the second carrying its own `decision_snoozes` row. Every act
   reported here was performed on a row this program minted, and the two peer rows only changed
   which records sit behind the fold (see §2, where `104e94dc` is now the fourth record rather
   than the third).
3. **Chromium treats a fragment-only `goto` as a same-document navigation.** Every fold and
   anchor probe loads `/` first. Any harness testing anchor behaviour must do the same.
4. **Playwright cannot launch chromium inside the sandbox** (`bootstrap_check_in … Permission
   denied`); `supabase status` cannot run sandboxed either (it reads `supabase/.env.local`).
   Both ran unsandboxed. `psql` against `127.0.0.1:54322` is unaffected.
5. **The database runs UTC and read 2026-09-06 05:00** while the host clock read
   `Sat Sep 5 ~23:55 CDT`. "Sunday" as a snooze target resolved to **today** 8am local, which is
   correct and reads oddly in the log. Every "5 September" on these sheets is the DB's yesterday.
6. **`react-query` retries a 403 three times** — the stranger's paper record is blank for ~5 s
   before it settles. Both readings above are the settled ones.

---

## Housekeeping

- Local stack **not reset**. Mutations, all local, all on rows this program minted: one cadence
  change to `weekly_sunday`; two snoozes on the walk's own successor (`sunday`, then `never`);
  and one direct `UPDATE`/restore of that same `decision_snoozes` row to prove the lifted-hold
  refusal — restored to `kind='never', snoozed_until='infinity'`, verified by `SELECT`.
- **No production mutation. Nothing pushed. No `git add -A`. No product code written.** No
  `.env` file read or written; no `.claude/`, `.agents/`, hook or settings file touched. No
  worktree or simulator created or removed.
- Dev server started by this walk was killed at the end (`pkill -f` scoped to this worktree's
  client-portal).

## Verdict

**fix** — one major, and it is new: `W3W-R2-01`, the Record of Decision asserting "Signed
electronically by typed name." on an approval that carries neither a name nor a method. The
three round-1 majors are closed and verified closed, the doorstep now passes axe with zero
violations of any type, and every briefed behaviour of P-26, P-27 and P-28 renders and records
correctly. No blocker.
