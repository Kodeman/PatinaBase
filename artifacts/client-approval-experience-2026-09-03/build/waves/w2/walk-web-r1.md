# Wave 2 web walk — round 1 (2026-09-05)

The ceremony walked in a real headless Chromium against the LOCAL stack, on the Wave-2
integration branch. No product code was written.

- **Worktree** `git -C … rev-parse --show-toplevel` →
  `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-integration`,
  branch `approvals/w2-integration`, HEAD **`cdda05919`**
  ("docs(approvals): the W2 carry fixes, their gates, and the H-14 read-through").
- **Server** `pnpm dev` (Next 16.2.10, webpack) from that worktree's `apps/client-portal`,
  env inlined on the command line (local Supabase URL + the CLI's demo anon/service keys).
  Log: `web-walk-dev.log`. Killed at the end (below).
- **Browser** Playwright 1.58.2 headless chromium, viewports **1280×1100** and **390×844**.
  Scripts: `web-walk/*.mjs`. Shots: `web-walk-shots-r1/` (34 files).
- **Homeowner** `client@patina.dev` / `password123` — profile "Client User",
  project **Aspen Loft Refresh** `b0000000-…-0000000000d1`.
- **Stack NOT reset**, per the brief.

## Two things the brief assumed that were not true

1. **`web-walk-env.md` does not exist.** §5 of the wave report says it was "written beside this
   report"; it is not in `waves/w2/`. The env was reconstructed from `waves/w2/env.md`,
   `playwright.config.ts` (`webServer.env`) and `supabase status -o env`.
2. **The brief's homeowner and the fixture's homeowner are different people.** The wave report
   names `client-solo@patina.dev` (Nora Ellison, Cedar Lane Study); walk-r3's seed recipe
   (`workflow-gate-fixture.sql`, which the brief told me to reuse) is hard-wired to
   `client@patina.dev` on Aspen Loft. I walked the fixture's homeowner, so the rows the iOS
   walker sees are the rows I saw. Cedar Lane was opened once to look for the door
   (`13-solo-doorstep.png`) and carries no approvals and no door.

## The stack was not carrying Wave 2, and is shared with a live peer

`supabase_migrations.schema_migrations` read `00571, 00568, 00567 …` with **no 00569** — the
carry advisory's warning, still true. `project_approval_artifacts` had no `why`, and
`respond_project_approval` was the pre-00569 4-arg form.

Rather than reset (the brief forbids it), **00569 alone was applied** with `psql -f` and its
ledger row recorded. Safe by inspection: the peer's `00571_studio_invoices.sql` and our 00569
share **no** object (`comm -12` over both files' `CREATE …` targets → empty). After it:
`why` + `why_author_name` present, `create_project_approval_decision(uuid,jsonb,text,text)` and
`supersede_project_approval_decision(…,text)` widened.

**A peer walker is live on this same stack and project.** An approval I did not seed —
"Walk W1 — Walnut for the island joinery", why by "Leah", created 19:32 — appeared on the
doorstep two minutes after mine, and the proposal `…cd102` flipped `sent` → `accepted`
underneath me mid-walk. I therefore acted only on rows I minted. Recorded as advisory 1.

## Seed, verified by SELECT

`workflow-gate-fixture.sql` produced the eight G-rows walk-r3 describes:

```
 Fixture G1 - Draft awaiting review           | draft     | f | 2026-09-19
 Fixture G2 - Published, awaiting household … | pending   | t | 2026-09-15
 Fixture G3 - Approved and sealed             | responded | t | 2026-09-14
 Fixture G4 - Superseded edition              | expired   | t | 2026-09-13
 Fixture G5 - Successor edition               | responded | t | 2026-09-17
 Fixture G6 - Overdue household response      | pending   | t | 2026-08-31
 Fixture G7 - Draft ready to publish          | draft     | f | 2026-09-21
 Fixture G8 - Changes requested               | responded | t | 2026-09-11
```

The fixture carries **no `why`**, so P-13 could not be walked from it. Seven further approvals
were composed through the real RPCs (`create_project_approval_decision(…, p_why)` →
`confirm_project_decision_review` → `publish_client_decision`), each with a frozen why, so the
freeze path itself was exercised rather than a hand-written column:

```
 47cc8d7b… G9   why='The shelves grew two inches…'  why_author_name='Leah'
 68457e64… WEBR · Return leg      4ecc7299… WEBK · keyboard leg
 52fbed59… WEBS · assistive leg   0ff1fc40… WEBH · hold leg
 0…/…      WEBT · pointer-tail leg    WEBM1/2/3 · motion legs
```

`why_author_name` freezes the composer's **given** name ("Leah", not "Leah Hartwell"). That is
00569's own rule (`:739` — "caller's own given name as why_author_name (P-13)"), not a defect,
but it differs from the ruling's wording ("the composing designer's display name") and from the
designer reviewer's `'Leah Quist'` probe. Recorded as nit `W1-n4`.

Projection read back as the homeowner:
`{"why": "The shelves grew two inches…", "whyAuthorName": "Leah", "viewerRole": "lead"}`.

---

## 1 · The approval on the doorstep — PASS, with one sentence wrong

Read off `01-ask-g9-1280.png` / `02-ask-g9-390.png`:

| piece | what it says |
|---|---|
| plate | `Issue 01 - Design Development Set` · `Edition 901 · Issued September 5` |
| maker's mark | `b1b1b1b1b1b1` — twelve characters, drawn uppercase |
| pull-quote | `Do the library elevations read right to you?` |
| why | `The shelves grew two inches so the art fits standing up.` |
| attribution | `— Leah` (`approval-attribution`, em dash, under the why) |
| weighing | `The cost rises by $1,250, the schedule moves out by three days, and the lead time grows by seven days.` |
| ledger | `Cost +$1,250 · Schedule +3 days · Lead time +7 days` |
| standing | `You're the one who answers this.` |

**Zero delta is said in words and the ledger is withheld** (G2, deltas 0/0/0):
`No cost, schedule or lead-time change.`, `approval-impact-ledger` **absent** — it does not print
`$0 · 0 days`. (Stage-A's `W2A-06` did not reproduce on this data.)

**Three equal doors.** `APPROVE` `RETURN` `HOLD`, all `da-secondary`, all 44 px tall, on one row
(widths 71/62/46 px track the words). The **consequence is not on the door** — it arrives on the
confirm step as `Approve · Accept this exact edition and its stated impacts.` /
`Return · Send this edition back for revision and a new approval request.` /
`Hold · Keep this open while you and your designer talk it through.` That is the built design,
not a defect, but the brief's "verb-then-consequence labels" is delivered one step later than the
words suggest.

**R11's baseline is not observable.** `costBaselineCents` is dormant — no projection carries it
(the read says so at `approval-ask.tsx:885`), so the cost delta stands without the figure it
moves from. Not a Wave-2 regression; recorded so the ruling is not assumed satisfied.

### Return — PASS

`03-return-chosen.png` → `03c-return-submitted.png`.

- Instructional, not an error: label `Tell your designer what to change.`, help
  `It goes into the discussion below with your answer.` No "required", no error state.
- **Not red**: label `rgb(139,115,85)`, help and consequence `rgb(92,74,60)`. Neither is a red ramp.
- **No signature on Return** (`approval-signature` count 0) and no name is asked for.
- Submit is unlit on an empty note, lit once the note is typed.
- A **250 ms** press does not submit; a **1400 ms** press does.
- Stamp reads **RETURNED**, never "Declined".
- The row, by SELECT: `status=responded`, `changes_requested` selected,
  `client_consent_method` NULL, `client_signature` NULL — and the note landed **on the approval**
  as a `decision_comments` row authored by the homeowner, 28 ms before the outcome.

`client_consent_method` NULL on Return is stage-B's `W2B-R2-13`, unchanged and still owed a
steward reading (the ruling says the method "stays portal_clickthrough on web"; the column is NULL).

### Approve — PASS

`05-approve-signature-empty.png` → `06-approved-stamp.png`.

- `SignatureLine` mounts with the typed-name rule, `5 September 2026`, and
  `Your typed name acts as your electronic signature.`
- Submit unlit with no name, lit with one.
- **Early release cancels**: a 300 ms press left no stamp (`05c`).
- Mid-hold `data-hold-state="holding"`, ink sweeping (`05d`).
- **APPROVED** stamp lands. Its computed style: ink `rgb(92,74,60)` = `--color-mocha`,
  `background-color: rgba(0,0,0,0)` (**no fill**), `box-shadow: none` (**no shadow**),
  `transform` = a −1.1° rotation. The acts block is gone (`approval-acts` count 0).
- The row, by SELECT: `status=responded`, **`client_consent_method='electronic_signature'`**,
  **`client_signature='Client User'`**, `approved` selected.

### Hold — PASS, hold-only

Choosing HOLD mounts **no** signature line and **no** note field, and Submit is lit immediately
(`04-hold-chosen.png`). Carried through on WEBH: `status=responded`, `needs_discussion` selected,
`client_consent_method` NULL, no signature. Hold consents to nothing and is asked for nothing.

### The keyboard and assistive paths — PASS

- **Keyboard**: focus Submit, hold **Enter** 1400 ms → WEBK recorded
  `electronic_signature` / `Client User` (`07-keyboard-enter-approved.png`). A 500 ms Enter hold
  does not submit.
- **Assistive**: the pointer-tail guard behaves exactly as `W2B-R2-02` ruled, proven on WEBT in a
  real browser for the first time (jsdom cannot forge `isTrusted`):

  | gesture | result |
  |---|---|
  | quick real pointer tap (50 ms down/up) | **not** taken |
  | `element.click()` ~150 ms later, inside the 700 ms tail | **refused** (`09-pointer-tail-refused.png`) |
  | `element.click()` well outside the tail | **taken** → APPROVED |

  A sighted hand's tap-click is refused; an activation with no pointer behind it is honoured.

### Reduced motion — PASS (fill), with the known retreat defect

Sampled with a page-side rAF loop so no round-trip perturbs the press (`10-hold-fill-*.png`):

```
reduce         40ms holding --hold-fill:1  clip inset(0 0% 0 0)      ← ink arrives at once
no-preference  40ms holding --hold-fill:1  clip inset(0 98.1% 0 0)
               400ms                       clip inset(0 57.4% 0 0)   ← linear over 900ms
```

Instant fill is correct **and the hold keeps its 900 ms length** — a 400 ms press submits in
neither mode. (An earlier reading of "no fill at 70 ms" was my own harness sampling before the
first frame after pointerdown; and a WEBH submission on an apparently short press was a screenshot
held inside the press. Both were harness artefacts, not product behaviour.)

The **retreat** is not stilled: at release under `reduce` the pool computed
`transition-duration: 0.18s` and was mid-way back at `inset(0 38.2% 0 0)`. This is stage-B's
`W2B-R2-06` — `.da-hold[data-hold-state='idle'] .da-pool` (0,3,0) outranking both
`.da-hold-still .da-pool` and the `prefers-reduced-motion` block (0,2,0) — now confirmed in a
browser rather than by reading CSS.

## 2 · The door — PARTIAL, and the seed had to be built

**Neither seeded house carries an unsigned commercial instrument**, so there was no door to walk.
`list_client_proposals` reads `proposals.document_kind` / `commercial_state` (not the binding
row), and both Aspen Loft candidates were `legacy`/NULL. A door was built by binding
`…cd102` "Aspen Loft — Stair and rail" as a `trade_scope` in `sent` (`seed-door.sql`,
`seed-door2.sql`; the second needed `session_replication_role = 'replica'` — a
`guard_commercial_proposal_authority` trigger refuses "document kind is immutable after draft").

With that, the door draws correctly (`14-door-1280.png`):

- **Sign is the scored primary**: `SIGN AND AUTHORIZE` is the only `da-primary` on the leaf;
  `READ IT IN FULL`, `ASK A QUESTION`, `REQUEST A CHANGE`, `DECLINE` are all `da-tertiary`.
- **Consent + typed name gate the act**, and both are needed: disabled with nothing, **still
  disabled with the name alone**, lit only once the consent line is ticked (`16-door-armed.png`).
- The consent line, the kind eyebrow (`TRADE SCOPE · $9,600`), the date and
  `Your typed name acts as your electronic signature.` all stand.
- `Press and hold to sign.`

**The swing and the SIGNED stamp were not reached.** The 1400 ms hold fired the real act —
`data-hold-state` went `holding` and `POST /api/proposals/…/sign` went out on schedule — and the
server answered **500**. That refusal is a consequence of my hand-built seed (the sign route
validates a scaffold the binding alone does not create), **not** a product defect, and it is
recorded as such. What the refusal exposed is a product defect: see `W1-02`.

**At 390 px the other acts are not reachable without scrolling** (`15c-door-390-acts.png`).
With the Sign act in view it sits at y=720 inside a **sticky** container; the other four sit at
y=809 and y=865 in a static one, i.e. two of them are entirely below the 844 px fold and none of
the four is wholly in the viewport. This is stage-B's `W2B-R2-08` measured.

## 3 · Previously — PASS

Four lines (`19-previously-open.png`). Opening the signed trade scope draws its reading
(`19b`): `TRADE SCOPE · Aspen Loft — Paintwork and plaster · EXECUTED · VERSION 1 ·
SIGNED AUGUST 6, 2026 · Fully executed on August 6, 2026.`

- **`SIGNED` ink `rgb(92,74,60)` = `--color-mocha`** on all three signed lines.
- **No green anywhere.** A sweep of every element under Previously for a colour whose green
  channel leads red and blue by >12 returned **zero** hits across `color`, `background-color` and
  `border-color`.
- **No `CheckCircle2`, no checkmark.** The six SVGs are the drawing instruments
  (`stroke-current stroke-1`, `max-w-[280px]` / `max-w-[560px]` figures), not icons.

The open line's leader word `Sent` is `rgb(139,115,85)`, a plain span rather than a `Stamp` —
stage-A's `W2A-04`, unchanged.

## 4 · axe on the doorstep, with an open approval

Run with axe-core 4.11.1 against the whole document with an armed approval on screen
(`20-axe-subject-ask.png`). **Two violations.**

```
[serious]   color-contrast   104 nodes  (39 inside a single doorstep-approval)
            #8b7355 on #faf7f2 at 11px → 4.19:1, needs 4.5:1
[moderate]  landmark-unique    1 node
            section[data-testid="approval-discussion"] — no unique accessible name
```

`#8B7355` is `--color-aged-oak`, aliased to the client portal's **`--text-muted`**
(`globals.css:12,38`). Wave 2 did **not** change it (`git diff origin/main...HEAD` on
`globals.css` is +54 lines, none touching the token), so this is not a regression — but Wave 2
mounts a great deal of new copy in that register (the ledger line, the maker's mark, the
change-note label, the eyebrows), which is why 39 of the failing nodes sit inside one approval.

Worth the steward's eye: iOS-C's `IOSC-R2-02` moved the phone's muted ink **off `8B7355`** onto
`4E4339`, describing `4E4339` as "the portals' `--text-muted`". On the client portal
`--text-muted` is `#8B7355`. The two surfaces do not agree, and the web value is the one that
fails AA.

## 5 · Vocabulary sweep of rendered text

Over `document.body.innerText` of the settled doorstep:

```
gate       : 2 hits   — both inside MY fixture's own `context` strings:
                        "Fixture gate in draft with no review confirmation yet."
                        "Fixture gate reviewed and ready for the studio to publish."
gates · task · tasks · overdue · dashboard · AI · Declined · declined · confetti · badge : clean
emoji: none
```

The two `gate` hits are **fixture-authored data, not product copy** —
`workflow-gate-fixture.sql` writes them into `context`, and the product renders the field
faithfully. No refused word reaches a homeowner from a Patina string. `RETURNED` is the stamp
word and `Returned` the prose word; "Declined" appears nowhere.

---

## Findings

### W1-01 · major · 0.95 — the immutability sentence is unconditional, and is wrong in three states

`approval-ask.tsx:956-962` renders

```
You are approving edition {n}, exactly as shown.
```

with **no** guard — not on `recordedOutcome`, not on `canRespond`, not on `viewerAnswers`. Walked
on the lead homeowner's own doorstep, it is false in three of the five states she can reach:

1. **Draft, review outstanding** (`21-draft-immutability.png`). `approval-acts` count **0** — the
   only act is `REVIEW EXACT EDITION`. She is being asked to confirm she has *read* the edition;
   she is told she is approving it.
2. **Reviewed, awaiting the studio** (`22-awaiting-studio-immutability.png`). The same card
   carries, in this order: `You are approving edition 902, exactly as shown.` …
   `You've confirmed edition 902. Your designer issues it next.` … `Nothing is waiting on you.`
   The card contradicts itself twice in four lines.
3. **Immediately after answering** (`03c-return-submitted.png`, `06-approved-stamp.png`). Beside a
   `RETURNED` or `APPROVED` stamp and an eyebrow reading `YOUR APPROVAL · ANSWERED`, the present
   tense stands: she *is* approving something she has already returned.

iOS deliberately suppresses this sentence in exactly these states — walk-r3's `W1R2-M1` proved it
closed there: *"Review screen (draft, review outstanding): no 'You are approving edition N…'
anywhere"* and *"After she answers it is **gone**"*. Web is the divergent surface.

This is the same line as stage-B's `W2B-R3-01`, but that finding is scoped to `viewerRole:
'studio'` and its proposed fix (`viewerAnswers ? … : …`) **would not close any of the three above**
— the lead does answer. The guard needs the lifecycle and the recorded outcome, not the chair.

Fix: draw the present tense only while the act is actually offered (`canRespond && !recordedOutcome`);
on a draft say what the review leg is for, and after the answer say what was done.

### W1-02 · major · 0.9 — a raw Postgres message is printed on the door

`app/api/proposals/[id]/sign/route.ts` returns the database's own message to the browser at three
sites — `:140`, `:190`, `:237`, each `NextResponse.json({ error: executeError.message || 'sign_failed' }, { status: 500 })`
— and `consent-copy.ts:92` `refusalSentence()` renders any token it does not recognise **verbatim**
(`return REFUSALS[trimmed] ?? trimmed`).

Walked, the homeowner's door read (`17b-door-sign-debug.png`):

```
trade scope b0000000-0000-0000-0000-0000000cd102 not found or access denied
```

A bare UUID and "access denied", in Patina's voice, on the leaf of a legally consequential act.
The 500 itself was my seed's fault; the sentence is not — any unmapped refusal from that route
reaches the reader unedited.

The repo already rules this out for the sibling route: `api/trade-scopes/[id]/accept`'s own tests
assert `expect(body.error).not.toContain('not found or access denied')` — twice, for `XX000` and
`42501`. The sign route has no equivalent guard.

Fix: map to a token at the route (`sign_failed`) and let `REFUSALS` speak, or make
`refusalSentence` fall back to its own default rather than echoing an unknown token.

### W1-03 · major · 0.95 — during a keyboard hold the act's label is invisible

Measured on the doorstep's Submit act with focus on it and **Enter** held (`11-keyboard-hold-midfill.png`):

```
mid keyboard hold: state=holding  :active=false
                   word ink  rgb(44,41,38)
                   pool bg   rgb(44,41,38)
                   clip      inset(0 44.4% 0 0)   ← ink halfway across the word
contrast ratio: 1.00
```

`globals.css:284` paints `.da-primary .da-pool` with `--color-charcoal`; the word turns off-white
only under `.da-primary:active` (`:389`), and a keyboard hold never gets `:active` because
`onKeyDown` calls `preventDefault()`. So for the full 900 ms of a terminal, signed act, the
keyboard reader watches the only label on the control disappear under the ink at contrast **1.00**.

This is stage-B's `W2B-R2-07`, which could only say "may never get `:active`". It does not.

### W1-04 · major · 0.9 — axe: 104 serious contrast failures, 39 inside one approval

`#8b7355` on `#faf7f2` at 11 px = **4.19:1** against a 4.5:1 floor (§4). The token is inherited
from `main`, so this is **not a Wave-2 regression**, and the steward may well rule it out of the
wave — it is filed at this severity because it is a serious WCAG AA failure sitting on the wave's
own new copy, and because iOS moved off this exact pigment for this exact reason while web did not.

### W1-05 · minor · 0.9 — the door's other acts fall below the fold at 390 px

§2, `15c-door-390-acts.png`. Sign is docked sticky at y=720; `READ IT IN FULL` / `ASK A QUESTION`
at y=809 and `REQUEST A CHANGE` / `DECLINE` at y=865, in a static container, against an 844 px
viewport. Stage-B parked this as `W2B-R2-08` ("arguably delivered by construction"); here are the
numbers for the ruling.

### W1-06 · minor · 0.85 — `Return` records no consent method

§1. `client_consent_method` and `client_signature` are both NULL on the returned row. The
mid-Wave-2 ruling says the method "stays `portal_clickthrough` on web"; `approval-ask.tsx:857-858`
sends `undefined`. Stage-B's `W2B-R2-13`, unchanged, confirmed against the database.

### W1-07 · minor · 0.8 — reduced motion stills the fill but not the retreat

§1. Under `prefers-reduced-motion: reduce` the pool computes `transition-duration: 0.18s` and
animates back on release (`inset(0 38.2% 0 0)` mid-retreat). Stage-B's `W2B-R2-06`, now measured
in a browser.

### W1-08 · minor · 0.8 — axe: the discussion landmark has no unique name

`section[data-testid="approval-discussion"]` is flagged `landmark-unique` (moderate). Several
approvals stand on one doorstep, each with a section headed `THE DISCUSSION`; the `aria-labelledby`
does not make them distinguishable to axe. Fix: give each an `aria-label` naming its approval.

### W1-n1 · nit · 0.9 — the weighing sentence spells to twenty, then prints figures

G6 reads "the schedule moves out by **eleven** days, and the lead time grows by **21** days" in one
sentence. `COUNT_WORDS` (`standing-sentence.ts:120-144`) is a fixed table with
`COUNT_WORDS[whole] ?? String(whole)`, so the crossover is deliberate — recorded only because the
mixed register is visible inside a single clause.

### W1-n2 · nit · 0.85 — the door's other acts are four peers with no ranking among them

`READ IT IN FULL`, `ASK A QUESTION`, `REQUEST A CHANGE`, `DECLINE` are all `da-tertiary`, so
"read it" and "decline it" carry identical weight on the leaf.

### W1-n3 · nit · 0.8 — R11's baseline never renders

§1. `costBaselineCents` is dormant; the cost delta stands without the figure it moves from on
every approval reachable in this seed. Documented at the read, so this is a note, not a defect —
but the ruling should not be recorded as satisfied.

### W1-n4 · nit · 0.75 — the why is signed with a given name, not a display name

`why_author_name` froze as `Leah`, not `Leah Hartwell`. 00569 says given name (`:739`); the ruling
says "display name" and the designer reviewer probed `'Leah Quist'`. Code and ruling should agree
in words.

---

## Advisories (none blocked the walk)

1. **The shared local stack has a live peer on the same project.** An approval I did not seed
   appeared mid-walk, and `proposals.…cd102` changed status underneath me. Two walkers on one
   Postgres will take each other's rows; every act here was performed on a row this walk minted.
2. **`web-walk-env.md` was promised and is missing**, and the account it would have named is not
   the account the reused seed recipe serves. Both cost real time.
3. **The dev server must be reached at `localhost`, never `127.0.0.1`.** At `127.0.0.1` Next 16
   blocks its own dev resources ("Blocked cross-origin request to Next.js dev resource
   /_next/webpack-hmr from 127.0.0.1"), the page never hydrates, and it fails **silently** — full
   server HTML, no React fibers on any node, no page error, and the sign-in disclosure simply does
   nothing. `playwright.config.ts` already uses `localhost`; anything hand-rolled must too.
4. **The dev server died once mid-walk** with a clean exit and no error in the log, and was
   restarted. Worth knowing before a long unattended run.
5. **Playwright cannot launch chromium inside the sandbox** — `bootstrap_check_in … Permission
   denied (1100)` from the Mach port rendezvous. Every browser call ran unsandboxed.
6. **Timing assertions need care in this harness.** A Playwright locator query on an absent
   element blocks for its full 30 s timeout, and a screenshot taken between `mouse.down` and
   `mouse.up` lengthens the press. Two early readings were wrong for these reasons and were
   re-taken; both re-measurements are the ones reported above.
7. **Neither seeded house carries an unsigned commercial instrument**, so the door does not exist
   on a fresh reset. If the door is to be walked again, the seed needs one — or
   `seed-door.sql` + `seed-door2.sql` here can be reused.

## Housekeeping

- Local stack **not reset**. Mutations, all local: `00569` applied + its ledger row; the
  workflow-gate fixture's own teardown/setup; eight walk approvals minted through the RPCs; the
  five outcomes the browser itself recorded (one Return, four Approves, one Hold); one
  `project_commercial_documents` binding and one `proposals` row edited to build the door.
- No production mutation. Nothing pushed. No `git add -A`. No product code written.
- Dev server killed at the end of the walk (`pkill -f` scoped to this worktree's client-portal).
