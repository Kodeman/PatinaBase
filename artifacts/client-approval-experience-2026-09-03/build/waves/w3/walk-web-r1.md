# Wave 3 web walk — round 1 (2026-09-06 UTC / 2026-09-05 CDT)

The habit walked in a real headless Chromium against the LOCAL stack, on the Wave-3
integration branch. **No product code was written.**

- **Worktree** `git -C … rev-parse --show-toplevel` →
  `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-integration`,
  branch `approvals/w3-integration`, HEAD **`275f86ba6`**
  ("docs(approvals): the Wave 3 carry-fix lane log and its wave-report section").
- **Server** `pnpm --dir <worktree> --filter @patina/client-portal dev` under `nohup`, on
  **:3002**, with the three env vars `web-walk-env.md` pins (local Supabase URL + the CLI's
  demo anon/service keys, read out of `supabase status -o env`, never written to a file).
  Log: `web-walk-dev.log`. Killed at the end (below).
- **Browser** Playwright 1.58.2 headless chromium, viewports **1280×1100/1400** and **390×844**.
  Scripts: `web-walk/*.mjs`. Shots: `web-walk-shots-r1/` (34 files).
- **axe** axe-core **4.11.1**, injected from the repo's pnpm store.
- **Homeowner** `client@patina.dev` / `password123` — profile "Client User", project
  **Aspen Loft Refresh** `b0000000-…-0000000000d1`. Second homeowner for the stranger read:
  `client-solo@patina.dev` (Nora Ellison, Cedar Lane Study).
- **Stack NOT reset**, per the brief. Ledger read before the walk:
  `00573, 00572, 00571, 00569, 00568` — both Wave 3 migrations live.

## Seed

`apps/designer-portal/e2e/helpers/workflow-gate-fixture.sql` for the eight G-rows, then
`web-walk/seed-w3.sql` for what the brief asks that the fixture does not carry: **a superseded
pair whose predecessor she ANSWERED**, and a signed paper. The fixture's own G4/G5 pair is not
that shape — G4 is superseded while still `pending`, so P-27's continuation line and its
"what changed" block (both of which require her answer) cannot be computed from it.

Composed through the real RPCs, each with a frozen `why`:

```
57d7fad9-1e9f-40ed-8ccb-257d443a5b7e  Walk W3 - Library elevations, Edition 903
    responded · approved · client_consent_method=electronic_signature · client_signature='Client User'
    cost +125000  why='The shelves grew two inches…'  why_author_name='Leah Hartwell'
aee67ead-656f-4ce7-beaf-a42840b8e7a3  Walk W3 - Library elevations, Edition 904
    pending · predecessor_decision_id=57d7fad9…
    cost +45000   why='The bookcase lost a bay…'      why_author_name='Leah Hartwell'
```

`why_author_name` now freezes the **display** name ("Leah Hartwell"), not the given name — Wave
2's nit `W1-n4` is closed.

One row inserted directly: a `commercial_document_signatures` row on
`b0000000-…-0000000cd003` ("Aspen Loft — Paintwork and plaster", `trade_scope`, `executed`),
carrying a deliberate `signed_ip = 203.0.113.44` so the "no IP on the keepsake" assertion has
something real to refuse. The fresh seed carries **no** signature row at all, so
`/proposals/<id>/record` would otherwise answer "This paper has not been signed yet."

---

## 1 · The Record of Decision — PASS, with two defects

### The sheet, for the owner

`/decisions/57d7fad9-…/record` (`01-record-decision-1280.png`, `01b-…-390.png`):

| piece | what it says |
|---|---|
| letterhead | `Leah Hartwell` — `resolve_studio_identity` on this seed; the organization is *named* that (nit n4) |
| kind | `RECORD OF DECISION` |
| edition | `Issue 03 - Library elevations` · `Edition 903 · Issued 5 September 2026` |
| question | `Do the library elevations read right to you?` |
| answer | **`APPROVED 5 SEPTEMBER`** · `Issue 03 - Library elevations · Edition 903` |
| note | `A later edition replaced this one on 5 September 2026.` |
| signed | `Client User` · `Answered 5 September 2026` · `Signed electronically by typed name.` |
| mark | `MARK C3C3C3C3C3C3 · KEPT BY LEAH HARTWELL · PREPARED WITH PATINA` |

**Twelve characters, and only twelve** (`C3C3C3C3C3C3`), at the plate's edge — R6 held.

**Her outcome is the stamp, not the disposition.** The doorstep receipt for this same row reads
`SUPERSEDED`; the sheet reads `APPROVED` with the supersession said in prose beneath it. That is
the `W3W-22` fix, walked: outcome first on paper, disposition first on the doorstep, and the
sentence never says undone/reopened/reversed/void.

`/proposals/b0000000-…-0000000cd003/record` (`02-record-proposal-1280.png`): `RECORD OF
SIGNATURE`, `Trade scope · Edition 1 · Issued 2 August 2026`, `SIGNED 7 AUGUST`, `Client User`,
`Signed 7 August 2026`, `Signed electronically by typed name.`, `MARK D5D5D5D5D5D5`.

### No IP anywhere in the DOM — PASS, and structurally

- `client_decisions` has **no IP column at all** (`information_schema` returns only
  `client_consent_method`, `client_signature`, `client_consented_at`), so the decision keepsake
  cannot print one.
- The proposal keepsake could: `commercial_document_signatures.signed_ip` holds
  `203.0.113.44`. `get_client_commercial_document_bundle` does not project it, and a regex over
  `page.content()` returns **only `127.0.0.1`** ×3 — the local Supabase API URL in Next's flight
  payload, i.e. infrastructure. The seeded signer IP is absent. `/IP address/i` is `false` on
  both sheets.

### A second seeded homeowner — PASS on the decision route, minor on the paper

Signed in as `client-solo@patina.dev` (`03-stranger-decision.png`, `03-stranger-proposal.png`):

| route | what she gets |
|---|---|
| `/decisions/57d7fad9-…/record` | HTTP 200, **"This record could not be found."**, zero stamps |
| `/proposals/b0000000-…cd003/record` | three 403s from the bundle RPC, ~5 s of spinner, then **"This record could not be read just now. Refresh to try again."** |

Neither enumerates: an id that does not exist gives the owner the identical sentence on each
route (`03c-owner-bogus-id.png`). The paper route's register is the defect — see `W3W-R1-04`.

**Signed out** the record path is not lost: `/decisions/57d7fad9-…/record` redirects to
`/auth/signin?callbackUrl=%2Fdecisions%2F57d7fad9…%2Frecord` (`19-record-signed-out.png`).

### "Keep a copy" — PASS beside the stamp, NOT WALKED at the door

Beside the stamp, `04-…`/`13-ask-answered-keep-a-copy.png`:

- On `ApprovalAsk` **the moment the act lands**: I approved `a3a4ae27` (G2) with a 1500 ms real
  pointer hold on `SUBMIT RESPONSE` after typing "Client User"; the card redrew to
  `APPROVED 5 SEPTEMBER … KEEP A COPY` → `/decisions/a3a4ae27-…/record`.
- On `ApprovalReceipt` for records she answered: 2 of the 3 shown records carry it
  (`57d7fad9`, `104e94dc`). The third (`8ed2b4e7`, superseded while still pending) correctly
  carries none — that sheet would have nothing to print.
- Every one is `target="_blank" rel="noopener noreferrer"`.

**The door's `door-keep-a-copy` was not reachable on this seed.** No unsigned commercial
instrument exists, so no `DoorGate` mounts (`07-door-signed-receipt.png`: `door-gate`,
`door-receipt`, `door-keep-a-copy` all count 0 even with `?proposal=<signed id>#door`), and the
receipt — and with it the act — is session state set by `onSigned`. Wave 2 built a door by hand
and its `POST /api/proposals/<id>/sign` answered 500. Covered by `door-gate.test.tsx:390`; the
code at `door-gate.tsx:404-418` is the same shape as the two acts that *were* walked.

### Print media — PASS

`page.emulateMedia({ media: 'print' })`, both routes (`04-print-decision.png`,
`04-print-proposal.png`):

```
stampTransform  "none"                 ← upright, rotation 0 (screen: matrix(0.999816,-0.0191974,…) = -1.1°)
stampBg         rgba(0, 0, 0, 0)       ← no fill
stampShadow     "none"
sheetBg         rgb(255, 255, 255)     ← white paper
shadowElements  []                     ← no element on the page computes a box-shadow
```

The toolbar is `display:none`. One nit: `body`'s own background stays `rgb(250,247,242)` under
print emulation — the sheet's white covers its own box only (nit n1).

---

## 2 · The successor read as one thread — PASS

Arriving at `#approval-aee67ead-…` on a cold load (`15-successor-by-address.png`,
`22-successor-390.png`), the ask opens with, in this order:

```
YOUR APPROVAL · YOUR ANSWER IS NEEDED
Edition 904 replaces the edition you approved on September 5.          ← approval-continuation
Issue 04 - Library elevations, Rev B   Edition 904 · Issued September 5
Do the revised library elevations read right to you?
The bookcase lost a bay, so the run is shorter.  — Leah Hartwell
Due September 18
You are approving edition 904, exactly as shown.
The cost rises by $450, the schedule moves out by one day, and the lead time grows by seven days.
COST +$450 · SCHEDULE +1 DAY · LEAD TIME +7 DAYS
WHAT CHANGED SINCE YOUR LAST ANSWER                                    ← approval-changed-since
It is titled “Issue 04 - Library elevations, Rev B”; the one you answered was “Issue 03 - Library elevations”.
The cost falls by $800, the schedule pulls in by two days, and the lead time does not change.
```

**The cost delta is in the standing-sentence grammar** and it is a *difference between the two
asks*, not a restatement of this one: 125000 → 45000 is "**The cost falls by $800**" while the
edition's own line still reads "+$450". Both are true and they are said in the same voice.
Nothing says undone, reopened, reversed or void.

**The fold opens itself.** Four probes, each on a full document load (Chromium treats a
fragment-only `goto` as a same-document navigation — advisory 2):

| address | records shown | fold act | element | scrollY |
|---|---|---|---|---|
| `#approval-8ed2b4e7…` (index 3, **beyond** `RECORDS_SHOWN=3`) | **6** | gone | present, top of viewport | 10562 |
| `#approval-104e94dc…` (**inside** the fold) | 3 | intact | present, top of viewport | 10248 |
| `#approval-0000…0000` (names nothing here) | 3 | intact | absent | 0 |
| no address | 3 | intact | — | 0 |

The fold opens **only** when the named record is behind it, and puts her in front of it either
way. `14-fold-opened-by-address.png`.

**One act, but it points backward.** The successor's single revision act is
`Review previous edition → #approval-57d7fad9…`. See `W3W-R1-06`.

---

## 3 · She sets the pace — PASS on all four legs

### Cadence, in the details sheet

`08-details-sheet-cadence.png` / `08b-details-cadence-closeup.png`. Three, in her words:

```
Reminder cadence
  ( ) Tell me right away        value="right_away"
  (•) Once a day                value="daily"        ← the column's DEFAULT
  ( ) Once a week, on Sunday    value="weekly_sunday"
```

No token reaches the page as text; `right_away`/`daily`/`weekly_sunday` appear only as radio
`value=` attributes, and `weekly_digest`/`daily_digest`/`immediate` appear nowhere at all.

**The quiet-hours floor, said as a fact about Patina and naming its exceptions:**

> Approval mail waits for the morning: nothing before 8am in your time zone, and nothing on
> Sunday — except the weekly summary, if that is the pace you choose. A notification on your
> phone keeps the same hours and stops at 8pm. The notice that an approval has passed its date
> is the one thing that never waits.

R16, both halves, in one paragraph — and `W3W-07`'s answer to the build round's "Sunday
contradiction" advisory reads cleanly.

### The row proves it

Choosing "Once a week, on Sunday" (`09-cadence-weekly-chosen.png`) wrote:

```
notification_preferences
 a0000000-…-000000000005 | weekly_sunday | 2026-09-06 04:13:57.615068+00
```

The row did not exist before the click — the widened column takes a value the page never spells.

### Snooze

`10-snooze-acts.png` → `11-snooze-said.png`, under the successor's ask:

```
REMIND ME   TOMORROW MORNING   SUNDAY   WHEN IT'S DUE   DON'T REMIND ME
Still yours to answer; only the reminders wait.
```

`SUNDAY` →

```
decision_snoozes
 a0000000-…-000000000005 | aee67ead-… | sunday | 2026-09-06 13:00:00+00 | created 04:14:06
```

13:00 UTC = **8am local**, on the coming Sunday. The confirmation reads `I'll ask you Sunday.`
`DON'T REMIND ME` (`20-snooze-never.png`) writes `kind='never'`, `snoozed_until='infinity'`.

### Past due

`12-past-due-no-snooze.png`, `23-past-due-390.png`. On G6 (`f5e6c6ad`, due August 31) the
`approval-snooze` block **count is 0** and in its place stands:

> This one is past its date, so its notice stands.

The word "overdue" appears nowhere on the page.

---

## 4 · axe

axe-core 4.11.1, `resultTypes: ['violations']`, whole document.

**Doorstep, six asks and the records fold on screen (`16-axe-doorstep.png`) — 2 types:**

```
[serious]  color-contrast    2 nodes   #c4a57b on #faf7f2 at 15px → 2.17:1 (needs 4.5:1)
                                       a[data-testid="approval-receipt-forward"]  ("Review revised edition")
                                       nav > .min-h-11.underline                  ("Review previous edition")
[moderate] landmark-unique   2 nodes   section[data-testid="approval-discussion"] ×2
```

**Wave 2's `W1-04` is CLOSED.** That walk reported 104 serious contrast nodes at `#8B7355` on
`#FAF7F2` (4.19:1) because the client portal's `--text-muted` was aged oak. It now computes
**`#4E4339`** — the pigment iOS-C moved to at `IOSC-R2-02`. The two surfaces agree and the
figure passes. What is left is two nodes of Wave 3's own new act (`W3W-R1-01`).

**Record page `/decisions/<id>/record` (`17-axe-record.png`) — 1 type:**

```
[moderate] region   8 nodes   All page content should be contained by landmarks
```

Zero contrast failures on the sheet.

---

## 5 · Vocabulary sweep of rendered text

Over `document.body.innerText` of the settled doorstep (six asks, three records, the letterbox,
the plan key, the road) and of a record page:

```
doorstep:  gate 3 · gates 0 · task 0 · tasks 0 · overdue 0 · dashboard 0 · AI 0
           Declined 0 · declined 0 · decline 0 · confetti 0 · badge 0
           click_through 0 · electronic_signature 0 · portal_clickthrough 0
           right_away 0 · weekly_sunday 0 · daily_digest 0
           emoji 0 · numeric-only chips 0
record:    every term above 0 · emoji 0
```

All three `gate` hits are **fixture-authored data**, in the `context` field
`workflow-gate-fixture.sql` writes:

```
…exactly as shown. Fixture gate whose response window has lapsed. The cost rises by $975…
…exactly as shown. Fixture gate in draft with no review confirmation yet. The cost rises…
…Awaiting studio publication. Due September 21 Fixture gate reviewed and ready for the studio…
```

No refused word reaches a homeowner from a Patina string. `RETURNED` is the stamp word,
`Returned` the prose word, and "Declined" appears nowhere.

**Numeric-count chips: none.** A sweep of every leaf `span`/`div`/`p`/`em`/`strong` whose whole
text is a bare integer or `(N)` returned zero elements.

**One state sentence has learned its mood.** Wave 2's `W1-01` (the unconditional "You are
approving edition N, exactly as shown.") is closed on two of its three positions: the draft with
its review outstanding now reads **"You *would be* approving edition 901, exactly as shown."**,
the awaiting-studio card carries no such sentence at all, and after an answer it is gone
(`13-ask-answered-keep-a-copy.png` shows the answered card with no immutability line).

---

## Findings

### W3W-R1-01 · major · 0.95 — P-27's revision act fails AA at 2.17:1

`a[data-testid="approval-receipt-forward"]` and the same class on the live ask compute
`color: rgb(196,165,123)` = **`--color-clay` #C4A57B** on the doorstep's `#FAF7F2` →
**2.17:1** against a 4.5:1 floor, at 15px. axe rates it `serious`. It is the **only** serious
contrast violation left on the doorstep and it is Wave 3's own new element — the single forward
act P-27 added, and the one link on the page whose whole purpose is to be followed.
Visible in `15-successor-by-address.png` as the palest line on the card.

Fix: the act takes a text token — `--text-body` #5C4A3C is **6.94:1** on the same ground —
and clay keeps the rules and caps, where contrast is not a legibility question. This is the
same shape as the web lane's own `W3-03` fix for the spine-gate kind line.

### W3W-R1-02 · major · 0.9 — the standing snooze does not survive re-entry on web

With `decision_snoozes` holding `{aee67ead…, kind:'sunday', snoozed_until:2026-09-06 13:00+00}`,
a fresh load of the doorstep draws

```
REMIND ME  TOMORROW MORNING  SUNDAY  WHEN IT'S DUE  DON'T REMIND ME
Still yours to answer; only the reminders wait.
```

with `approval-snooze-said` **count 0** and no marked choice — byte-identical to an approval
that was never snoozed. Her choice is in the database and the page says nothing about it, so
the only way to find out whether the hold stands is to set it again.

The iose lane fixed exactly this on the phone at the carry-fix round (`3066f8c6e`,
`R3-M1` second half: `DecisionsAPIClient.decisionSnooze(decisionId:)` reads the row,
`DecisionSnooze.standing(kind:snoozedUntil:now:)` refuses a lifted hold, `loadSnooze` runs in
`load(decisionId:)`). **Web is the divergent surface**, and the divergence is on the wave's own
headline act.

### W3W-R1-03 · major · 0.85 — `landmark-unique` still fires; W3-04's label does not disambiguate

axe flags 2 nodes. The rendered `aria-label`s:

```
Discussion about Issue 01 - Design Development Set · Edition 901        ← 07647b90 (G1)
Discussion about Issue 01 - Design Development Set · Edition 901        ← a3a4ae27 (G2)
Discussion about Issue 01 - Design Development Set · Edition 901        ← 51c48d1c (peer)
Discussion about Issue 02 - Design Development Set, Rev B · Edition 902 ← f5e6c6ad (G6)
Discussion about Issue 02 - Design Development Set, Rev B · Edition 902 ← 088f45be (G7)
```

Title **plus** edition is still not unique, because two approvals routinely hang off one
artifact edition — the fixture's G1/G2 pair (both on Issue 01/901) and G6/G7 (both on Issue
02/902) are the ordinary case, not a contrivance. Wave 2's `W1-08` is therefore reduced, not
closed. The component's own documented fallback (`Discussion about approval {decisionId}`) is
the shape that closes it; appending the decision id in every case is one line.

### W3W-R1-04 · minor · 0.85 — a denied paper record reads as a transient failure

The second homeowner at `/proposals/<id>/record` gets three **403**s from
`get_client_commercial_document_bundle` (React Query's default retry), roughly **5 s** of
spinner, and then

> This record could not be read just now. Refresh to try again.

A permission refusal will never be fixed by refreshing, and the sibling route says
"This record could not be found." for the same situation. Non-enumeration holds — an id that
does not exist gives the owner the identical sentence — so this is register and latency, not a
leak. Fix: `retry: false` on the record page's read and let a 403 fall through to the
not-found sentence `/decisions/<id>/record` already uses.

### W3W-R1-05 · minor · 0.8 — the keepsake labels a RETURNED record "Signed"

`record-sheet.tsx:270` prints a hard-coded `Signed` label above the name block. On a return or a
hold — where the 2026-09-05 ruling deliberately asks for **no** typed name — the sheet prints

```
SIGNED
Answered 5 September 2026
Confirmed by click-through.
```

with nothing between the label and the date (`18-record-returned-G8.png`). The keepsake she
files for a return is headed with the word for the act she did not perform. Fix: let the label
follow the record — "Signed" when a name was typed, "Recorded" (or "How you answered")
otherwise.

### W3W-R1-06 · minor · 0.8 — the successor's one act points backward

`web-walk-env.md` §P-27 says the successor shows "**exactly one** forward act — never a link
back". `revisionAct()` is successor-first, so the leaf of a thread — the successor, which has no
successor of its own — renders `Review previous edition → #approval-<predecessor>`, drawn
immediately under the outcome acts on the live ask. It **is** one act, and it is the link back.
Either the doc or the build is wrong; this is a steward's ruling, not a code fact. (An argument
for the build: a homeowner arriving on a successor from a supersession letter reasonably wants
to re-read what she answered. An argument for the doc: P-27's whole point is not to ask her to
navigate her own history.)

### W3W-R1-07 · minor · 0.75 — two frequency controls in one panel

The details sheet draws, in this order and with nothing between them:

```
Digest frequency   Never · Daily · Weekly · Every two weeks · Monthly     ← legacy
Reminders …
Reminder cadence   Tell me right away · Once a day · Once a week, on Sunday   ← P-28
```

A homeowner has to reconcile "Digest frequency: Daily" against "Reminder cadence: Once a day"
with no copy saying which governs approval mail. P-28 widened the second and left the first
standing beside it.

### W3W-R1-08 · minor · 0.7 — the record sheet is a landmark-free page

axe `region`, moderate, 8 nodes on `/decisions/<id>/record`: every block sits outside a
landmark. New page, new violation; one `<main>` around the sheet closes it. (The Threshold
itself does not trip this rule.)

### W3W-R1-09 · minor · 0.7 — "Don't remind me" now says two different things

| surface | sentence |
|---|---|
| web | `I won't remind you again until it's past its date.` |
| iOS, after `3066f8c6e` | `I'll hold the reminders. Choose again here whenever you want them back.` |

One act, one table, two sentences. The carry fix moved iOS off the end-condition promise and
left web on it; and on an **undated** approval web's sentence points at a date that does not
exist (the iose lane's own advisory `R3-n3`, now true on the other surface too).

### Nits

- **n1** — the print sheet's ground below its own height stays `#FAF7F2`.
  `#record-print-root` forces white for its own box; with background graphics enabled a printer
  lays cream under the remainder of the page (`04-print-decision.png`).
- **n2** — the past-due ask's date line reads a plain `Due August 31` with no past-due tell,
  three lines above "This one is past its date, so its notice stands." The refused word is
  correctly absent from both.
- **n3** — `Re-engagement` is a visible label in the homeowner's own details sheet, beside
  "Weekly inspiration" and "Seasonal campaigns". Not Wave 3's, but it is a marketing-ops word
  on the surface the vision says must never be tuned for engagement.
- **n4** — the letterhead reads `Leah Hartwell` because the seeded organization is literally
  named that (`organizations.name`, `resolve_studio_identity` → `("Leah Hartwell",…,studio)`).
  Fixture, not a defect: a later reader should not take it as a person's name displacing a
  studio's.
- **n5** — cadence tokens appear as radio `value=` attributes. Never as rendered text; the
  env doc's rule is about what she reads, and it holds.

---

## What Wave 2's walk left open, re-read here

| Wave 2 finding | now |
|---|---|
| `W1-01` immutability sentence unconditional | **CLOSED** on the draft ("You *would be* approving…"), on the awaiting-studio card (absent), and after the answer (gone) |
| `W1-04` 104 serious contrast nodes at `#8B7355` | **CLOSED** — `--text-muted` is `#4E4339`, and axe's contrast count on the doorstep is 2, both on a different element |
| `W1-08` discussion landmark not unique | **REDUCED, not closed** — see `W3W-R1-03` |
| `W1-n4` the why signed with a given name | **CLOSED** — `why_author_name` froze as `Leah Hartwell` |
| `W1-02` raw Postgres message on the door | **not re-walked** — no door on this seed |
| `W1-03` keyboard hold hides the label · `W1-05` door acts below the fold at 390 · `W1-06` Return records no consent method · `W1-07` reduced-motion retreat | **not re-walked** — outside this brief |

---

## Advisories (none blocked the walk)

1. **A peer walker is live on this same stack and project, again.** Two approvals I did not
   seed — `Walk R1 - Pantry shelving depth` and `Walk R1 - Stair rail profile`, both created
   `2026-09-06 04:16:19` — appeared on the doorstep mid-walk, one of them carrying its own
   `decision_snoozes` row (`51c48d1c… | tomorrow_morning`); and `Dining chairs - Shaker Oak vs
   Windsor Elm` flipped `pending → responded` underneath me. **Every act reported here was
   performed on a row this walk minted.** This is Wave 2's advisory 1, unchanged.
2. **Chromium treats a `goto` that changes only the fragment as a same-document navigation.**
   The SPA's `all` state therefore survives it, and my first fold reading showed six records on
   every probe including the one that names nothing. The table in §2 comes from a re-run that
   loads `/` between probes. Any harness testing anchor behaviour on this page must do the same.
3. **Playwright cannot launch chromium inside the sandbox** (`bootstrap_check_in … Permission
   denied`). Every browser call ran unsandboxed.
4. **`supabase status` cannot run sandboxed either** — the CLI reads `supabase/.env.local`,
   which the sandbox denies with `EPERM`. `psql` against `127.0.0.1:54322` is unaffected.
5. **The database runs UTC and was already on 2026-09-06** while the host clock read
   `Sat Sep 5 ~23:00 CDT`. Every "5 September" on these sheets is the DB's yesterday. This is
   the wave report's `INT-A1` seen from the other side.
6. **`react-query` retries a 403 three times.** Two early readings of the stranger's paper
   record ("blank page") were my own harness sampling at 3.5 s, inside the retry window. Both
   were re-taken; the reported behaviour is the settled one.

---

## Housekeeping

- Local stack **not reset**. Mutations, all local: the workflow-gate fixture's own
  teardown/setup; two plan issues (903/904) and the superseded pair minted through the real
  RPCs; one `commercial_document_signatures` row; and the acts the browser itself recorded —
  one Approve on G2 (typed name + 1500 ms hold), one cadence change to `weekly_sunday`, two
  snoozes on the successor (`sunday`, then `never`).
- **No production mutation. Nothing pushed. No `git add -A`. No product code written.** No
  `.env` file read or written; no `.claude/`, `.agents/`, hook or settings file touched.
- Dev server killed at the end of the walk (`pkill -f` scoped to this worktree's
  client-portal).

## Verdict

**fix** — three majors (`W3W-R1-01` contrast on the wave's own new act, `W3W-R1-02` the snooze
that does not survive re-entry, `W3W-R1-03` the landmark label that still collides). No blocker:
every one of P-26, P-27 and P-28's briefed behaviours renders and records correctly, the
vocabulary is clean, the print sheet is white and upright, and no IP reaches any DOM.
