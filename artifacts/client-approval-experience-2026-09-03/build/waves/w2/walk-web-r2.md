# Wave 2 web walk — round 2 (2026-09-05)

The ceremony walked again in a real headless Chromium against the LOCAL stack, on the Wave-2
integration branch, after the round-1 fixes. No product code was written.

- **Worktree** `git -C … rev-parse --show-toplevel` →
  `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-integration`,
  branch `approvals/w2-integration`, HEAD **`a65b212c7`**
  ("docs(approvals): the W2 walk fixes, their gates, and the rebuilt walk app").
- **Server** `pnpm dev` (Next 16.2.10) from that worktree's `apps/client-portal`, env inlined on
  the command line (local Supabase URL + the CLI's demo anon/service keys). Log:
  `web-walk-dev-r2.log`. Killed at the end (below).
- **Browser** Playwright 1.58.2 headless chromium, viewports **1280×1100** and **390×844**.
  Scripts: `web-walk-r2/*.mjs`. Shots: `web-walk-shots-r2/` (49 files).
- **Homeowner** `client@patina.dev` / `password123` — "Client User", project **Aspen Loft Refresh**
  `b0000000-…-0000000000d1`.
- **Stack NOT reset**, per the brief. It already carried `00569` (applied by hand in round 1) —
  ledger tail `00571, 00569, 00568, …`, `project_approval_artifacts.why` + `why_author_name`
  present, `create_project_approval_decision(uuid,jsonb,text,text)` and
  `supersede_project_approval_decision(…,text)` widened. Nothing was replayed.
- `web-walk-env.md` **still does not exist** in `waves/w2/`. The env was reconstructed again from
  `env.md`, `playwright.config.ts` (`webServer.env`) and `supabase status -o env`.

## Seed, verified by SELECT

`apps/designer-portal/e2e/helpers/workflow-gate-fixture.sql` was re-run (teardown + setup), which
restored the eight G-rows walk-r3 describes:

```
 Fixture G1 - Draft awaiting review        | draft     | f | 901
 Fixture G2 - Published, awaiting househol | pending   | t | 901
 Fixture G3 - Approved and sealed          | responded | t | 901 | approved
 Fixture G4 - Superseded edition           | expired   | t | 901
 Fixture G5 - Successor edition            | responded | t | 902 | approved
 Fixture G6 - Overdue household response   | pending   | t | 902
 Fixture G7 - Draft ready to publish       | draft     | f | 902
 Fixture G8 - Changes requested            | responded | t | 901 | changes_requested
```

The fixture carries no `why`, so ten further approvals were composed through the real RPCs
(`create_project_approval_decision(…, p_why)` → `confirm_project_decision_review` →
`publish_client_decision`), each freezing its own why (`web-walk-r2/seed-leg.sql`):

```
 Walk R2 R2A    125000/3/7   why='The shelves grew two inches…'   why_author_name='Leah'
 Walk R2 R2RET  0/0/0        Walk R2 R2HOLD 48000/2/0
 Walk R2 R2KEY  125000/3/7   Walk R2 R2AT   75000/1/4
 Walk R2 R2M1/2/3 20000/1/2  Walk R2 R2AX   33000/2/5
 Walk R2 R2NUM  250000/11/21 (the counting-register probe)
```

All ten read back `why_author_name = 'Leah'` and `source_version = 901`.

---

## 1 · The approval on the doorstep — PASS

| piece | what it says (`01-ask-r2a-1280.png`) |
|---|---|
| plate | `Issue 01 - Design Development Set` · `Edition 901 · Issued September 5` |
| maker's mark | `B1B1B1B1B1B1` — twelve characters, `aria-hidden="true"` |
| pull-quote | `<blockquote>` with a clay left rule: `Do the library elevations read right to you?` |
| why | `The shelves grew two inches so the art fits standing up.` |
| attribution | `— Leah` (`approval-attribution`, em dash, under the why, ink `rgb(78,67,57)`) |
| immutability | `You are approving edition 901, exactly as shown.` |
| weighing | `The cost rises by $1,250, the schedule moves out by three days, and the lead time grows by seven days.` |
| ledger | `COST +$1,250 · SCHEDULE +3 DAYS · LEAD TIME +7 DAYS` |
| standing | `You're the one who answers this.` |

**Zero delta is said in words and the ledger is withheld** (R2RET, 0/0/0):
`No cost, schedule or lead-time change.`, `approval-impact-ledger` **absent**
(`01b-ask-zero-delta.png`).

**Three equal doors.** `APPROVE` `RETURN` `HOLD`, all `da-secondary`, all 44 px, on one row
(71/62/46 px). At 390 all three sit in the viewport together (y=578). The **consequence is not on
the door** — it arrives on the confirm step (`Approve · Accept this exact edition and its stated
impacts.` / `Return · Send this edition back for revision and a new approval request.` /
`Hold · Keep this open while you and your designer talk it through.`). That is the built design,
unchanged from round 1; the brief's "verb-then-consequence labels" is delivered one step later
than the words suggest.

### Return — PASS
`03-return-chosen.png` → `03c-return-submitted.png`.
Label `Tell your designer what to change.` (ink `rgb(78,67,57)`), help
`It goes into the discussion below with your answer.` (`rgb(92,74,60)`) — instructional, no
"required", **no red**. No signature line, no name asked. Submit unlit on an empty note, lit once
typed. A **250 ms** press does not submit; **1400 ms** does. Stamp reads **RETURNED**, never
"Declined". By SELECT: `status=responded`, `changes_requested`, and the note landed **on the
approval** as a `decision_comments` row authored by the homeowner.

### Approve — PASS
`05-approve-signature-empty.png` → `06-approved-stamp.png`. `SignatureLine` mounts with
`Type your full name`, `5 September 2026`, `Your typed name acts as your electronic signature.`
Submit unlit with no name, lit with one. A **300 ms** press leaves no stamp. Mid-hold on the
pointer path: `state=holding`, word ink `rgb(250,247,242)` on pool `rgb(44,41,38)`.
**APPROVED** stamp: ink `rgb(92,74,60)` = `--color-mocha`, `background-color: rgba(0,0,0,0)`
(**no fill**), `box-shadow: none`, −1.1° rotation. Acts gone. By SELECT:
`client_consent_method='electronic_signature'`, `client_signature='Client User'`.

### Hold — PASS, hold-only
No signature line, no note field, Submit lit immediately (`09-hold-chosen.png`). **HELD** stamp,
no fill, no shadow. By SELECT: `needs_discussion`, no signature.

### Keyboard and assistive — PASS
- **Keyboard**: focus Submit, hold **Enter** 1400 ms → APPROVED, `electronic_signature`. A 500 ms
  Enter hold does not submit.
- **Assistive** (`08-pointer-tail-refused.png`): a quick real pointer tap (50 ms) is **not** taken;
  `element.click()` ~120 ms later, inside the tail, is **refused**; `element.click()` well outside
  the tail is **taken** → APPROVED.

### Reduced motion — fill stilled, retreat still moving
Sampled from a page-side rAF loop (`09-motion.mjs`):

```
reduce         23ms holding fill=1 dur=0s    clip inset(0 0% 0 0)      ← ink arrives at once
no-preference  16ms holding fill=1 dur=0.9s  clip inset(0 100% 0 0)
              399ms holding                  clip inset(0 57.4% 0 0)   ← linear over 900ms
```

The hold keeps its 900 ms length in both modes: a 420 ms press submitted in neither
(`R2M1`/`R2M2` still `pending` by SELECT). The **retreat** is still not stilled — see `W2-05`.

### The stamp dials, read as designed
`APPROVED`/`SIGNED` are mocha (`rgb(92,74,60)`); `RETURNED` and `HELD` take charcoal ink
(`rgb(44,41,38)`) with a clay-ink / golden-hour border. That is `STAMP_DIALS` as written
(`instruments/stamp.tsx:63-105`) and reads as R13's intent — recorded so "stamps in mocha" is not
mistaken for a failure here. **No fill and no shadow on any of them.**

---

## 2 · The door — the paper is signed; the ceremony around it is not drawn

The round-1 door (`…cd102`, "Aspen Loft — Stair and rail") still stood. Two more were built
(`…cd202`, `…cd201`) so the swing and the narrow-width ranking could both be walked.
**The seed does not build a signable trade scope**: `execute_trade_scope_with_trusted_ip` also
needs the project to carry a studio the designer owns (every seeded project has `studio_id` NULL)
and a `trade_scope_draws` schedule (no `trade_scope_terms` or `trade_scope_draws` row exists
anywhere in the seeds). `web-walk-r2/seed-door-scaffold.sql` supplies both.

- **Sign is the scored primary**: `SIGN AND AUTHORIZE` is the only `da-primary` on the leaf;
  `READ IT IN FULL` / `ASK A QUESTION` / `REQUEST A CHANGE` / `DECLINE` are all `da-tertiary`.
- **Consent + typed name gate the act, and both are needed**: disabled with nothing, **still
  disabled with the name alone**, lit only once the consent line is ticked (`13-door-armed.png`).
- **Press and hold signs it.** Three real signatures, three rows by SELECT:
  `commercial_document_signatures` carries `party_role='client'`, `signed_name='Client User'`,
  `signed_ip='::1'`; the proposals read `accepted` / `executed`; a deposit invoice was issued
  (`INV-0001 · $2,880`), and the paper reappears under **Previously** as `SIGNED` in mocha.
- **The swing, the reopened head and the receipt are never drawn** — `W2-01`.
- **At 390 px the other four acts fall below the fold** with Sign docked — `W2-06`, unchanged.

---

## 3 · Previously — PASS

Six lines (`14-previously-open.png`):

```
 5 SEPTEMBER  Trade scope · Aspen Loft — Primary bath stone      SIGNED
 5 SEPTEMBER  Trade scope · Aspen Loft — Stair and rail          SIGNED
30 AUGUST     I have asked the mill for a second walnut sample…  SENT
 6 AUGUST     Trade scope · Aspen Loft — Paintwork and plaster   SIGNED
26 JULY       Furnishings authorization · Authorization No. 1    SIGNED
16 MAY        Design services agreement · Aspen Loft — Design…   SIGNED
```

- **`SIGNED` ink `rgb(92,74,60)` = `--color-mocha`** on every signed line; `SENT` is
  `rgb(78,67,57)`.
- **No green anywhere.** A sweep of every element under Previously for a colour whose green
  channel leads red and blue by >12 returned **zero** hits across `color`, `background-color` and
  `border-color` — and the same sweep over the whole signed-instrument reading
  (`/proposals/…cd102`, which redirects to `?proposal=…#door`) also returned **zero**
  (`22-reading-cd102.png`).
- **No `CheckCircle2`, no checkmark.** No SVG on either page carries a check-shaped class; the
  six SVGs under Previously are the drawing instruments (`stroke-current stroke-1` figures).
- `--color-sage` is still defined (`#A8B5A0`) but nothing on these surfaces takes it. `INSTALLED`
  draws in `rgb(100,104,93)` — a material state, which the mid-Wave-2 ruling keeps in sage.

---

## 4 · axe on the doorstep, with an open approval

axe-core 4.11.1, whole document, an armed approval on screen (`19-axe-subject-ask.png`).
**Two violations, down from round 1's two — but the serious one shrank from 104 nodes to 11.**

```
[serious]   color-contrast   11 nodes   (11 of 11 inside a doorstep-approval)
            #938b83 on #faf7f2 at 10px → 3.13:1, needs 4.5:1
            all of them figure > .bottom-1.5.right-2 — the maker's mark
[moderate]  landmark-unique   1 node
            section[data-testid="approval-discussion"] — no unique accessible name
```

`--text-muted` now resolves to **`#4E4339`** (`--color-oak-ink`); `--color-aged-oak` is still
`#8B7355` and no longer feeds the text token. **`W1-04` is closed** — the 104 nodes are gone. What
remains is a different pigment: the maker's mark is `--text-muted` at `opacity-60`, which composites
to `#938b83`. See `W2-04`.

---

## 5 · Vocabulary sweep of rendered text

Over `document.body.innerText` of the settled doorstep:

```
gate       : 4 hits — all four inside MY fixture's own `context` strings
                      ("Fixture gate in draft with no review confirmation yet.", etc.)
gates · task · tasks · overdue · dashboard · AI · Declined · declined · badge · confetti : clean
emoji: none
```

The four `gate` hits are **fixture-authored data, not product copy** — `workflow-gate-fixture.sql`
writes them into `context` and the product renders the field faithfully. `RETURNED` is the stamp
word on a returned row; "Declined" appears nowhere.

---

## Round-1 findings, re-verified

| id | verdict |
|---|---|
| `W1-01` immutability sentence unconditional | **CLOSED.** Draft with review outstanding now reads `You would be approving edition 901, exactly as shown.` (`02-draft-conditional-sentence.png`); the reviewed-awaiting-studio card draws **no** sentence (`02b`); after RETURNED / APPROVED / HELD the sentence is **gone** (count 0 in all three, at 1280 and 390). Surveyed across all 13 approvals on the doorstep. |
| `W1-02` raw Postgres message on the door | **CLOSED.** The refused sign now reads `This paper could not be signed just now. Your designer can help from their side.` (`12b-door-refusal.png`); the detail stays server-side — `web-walk-dev-r2.log` carries `trade scope execution failed { proposalId: …, error: 'trade scope … not found or access denied' }`. No UUID, no "access denied", reaches the reader. |
| `W1-03` keyboard hold at contrast 1.00 | **CLOSED.** Mid Enter-hold: `state=holding`, `:active=false`, word ink `rgb(250,247,242)`, pool `rgb(44,41,38)`, **contrast 13.53:1** (`07-keyboard-hold-midfill.png`). The pointer path is unchanged (13.53:1 too). |
| `W1-04` 104 serious contrast failures | **CLOSED as filed.** 104 → 11 nodes, and `--text-muted` = `#4E4339`. The residual is a different element and is refiled as `W2-04`. |
| `W1-05` door acts below the fold at 390 | **OPEN, unchanged** → `W2-06`. |
| `W1-06` Return records no consent method | **OPEN, unchanged** → `W2-07`. |
| `W1-07` reduced motion stills the fill, not the retreat | **OPEN, unchanged** → `W2-05`. |
| `W1-08` discussion landmark has no unique name | **OPEN, unchanged** → `W2-08`. |
| `W1-n1` counts spelled to twenty, then figures | **OPEN, unchanged** → `W2-n1`. |
| `W1-n2` four peer acts on the door leaf | **OPEN, unchanged** → `W2-n2`. |
| `W1-n3` R11's baseline never renders | **OPEN, unchanged** → `W2-n3`. |
| `W1-n4` the why is signed with a given name | **OPEN, unchanged** → `W2-n4`. |

---

## Findings

### W2-01 · major · 0.9 — the door never swings, and the receipt line is unreachable

`door-gate.tsx:213-241`. `onSign` **awaits** `invalidateSignedCommercialDocument(...)` before it
sets `signedAt` / `doorState='swinging'`. The invalidation refetches the papers, the signed
proposal stops being a `door` mark, and `threshold.tsx:640` (`renderDoor` returns `null` for a mark
whose paper is gone) unmounts the whole `DoorGate` **section** — before the component ever enters
the swinging state.

Measured at frame resolution on a real signature (`18-swing-frames.mjs`), sampling every rAF:

```
ms=   1  sec=true  way=true  leaf=shut  head="Shut since 2 September · it opens on your "
ms=1094  sec=false way=false leaf=null  head=null
```

The act fires at 900 ms into the press; `POST …/sign` answers in ~150 ms (four 200s in the log);
~40 ms later the section is gone. Three signatures, three identical results — `door-way` was
already 0 at the first sample after the press on all three (`16c-swing-200.png` …
`16c-swing-3600.png` are the same frame).

What is never drawn as a consequence:

- the 520 ms leaf swing (`data-door-state='swinging'` → `'open'`);
- the reopened head, `Open. It opened on your name.`;
- `door-receipt` — count **0** at every sample on all three signatures.

That last one matters beyond the animation: `door-receipt` is where the mid-Wave-2 ruling put the
**P-19 sentence** ("`{Studio} has your signature. You'll have a copy.` replaces the unsubstantiated
'countersigns' line"). On web that receipt still reads
`${title} · signed ${date} · ${studio} countersigns` (`door-gate.tsx:275-278`) — the old sentence,
on a **trade scope**, whose own consent line is pinned by test never to assert a countersignature
(`consent-copy.test.ts:92`). The new sentence exists only on iOS
(`ProposalSignActCopy.swift:72`); `grep -r "has your signature"` finds nothing under
`apps/client-portal`.

The `onSign` ordering is inherited from `main`, not minted this wave — but Wave 2 rebuilt this act
(`ScoredAction` → `HoldAction` on the leaf, `door-gate.tsx` +78 lines) and a mid-Wave-2 ruling
placed new copy in the block that never renders. The paper is signed correctly either way; the
ceremony around it is not.

Fix: set `signedAt` and start the swing **before** awaiting the invalidation (or keep the mark
until the swing timer completes), and apply the P-19 sentence to `receipt`.

### W2-02 · minor · 0.9 — `Return` and `Hold` still record no consent method

`approval-ask.tsx:879` sends `clientConsentMethod: signing ? 'electronic_signature' : undefined`.
Proven by SELECT on this round's rows:

```
 Walk R2 R2RET  | responded | changes_requested |        (null)        | (null)
 Walk R2 R2HOLD | responded | needs_discussion  |        (null)        | (null)
 Walk R2 R2A    | responded | approved          | electronic_signature | Client User
```

The mid-Wave-2 ruling says the method "stays `portal_clickthrough` on web" for Return and Hold;
`00569` accepts `click_through` with no signature, so it is buildable. This is `W1-06` / stage-B's
`W2B-R2-13`, unchanged and still owed a steward reading. Fix: send the token, or record the
divergence against the ruling.

### W2-03 · minor · 0.85 — reduced motion stills the fill but not the retreat

Under `prefers-reduced-motion: reduce` the pool arrives instantly (`dur=0s`, `clip inset(0 0% 0 0)`
at 23 ms) but on release computes `transition-duration: 0.18s` and animates back:

```
reduce  ms=443 state=idle dur=0.18s clip=inset(0 0% 0 0)
        ms=483 state=idle dur=0.18s clip=inset(0 73.55% 0 0)
        ms=558 state=idle dur=0.18s clip=inset(0 98.99% 0 0)
```

`.da-hold[data-hold-state='idle'] .da-pool` at specificity (0,3,0) outranks both
`.da-hold-still .da-pool` and the `prefers-reduced-motion` block, each (0,2,0)
(`globals.css:563-574`). `W1-07` / stage-B's `W2B-R2-06`, unchanged. Fix: raise the stilled and
reduced-motion rules above the idle rule, or scope the idle transition so it does not apply to a
stilled control.

### W2-04 · minor · 0.85 — the maker's mark is the wave's own new AA failure, at 3.13:1

`approval-ask.tsx:284`: `text-[var(--text-muted)] opacity-60` at `text-[10px]`. With `--text-muted`
now `#4E4339`, 60% over `#FAF7F2` composites to **`#938b83` → 3.13:1** against a 4.5:1 floor. It is
the **only** serious axe violation left on the doorstep, 11 nodes, **all 11 inside a
doorstep-approval**. Unlike `W1-04` this is not inherited: `git merge-base --is-ancestor a546231e6
origin/main` fails — the maker's mark arrives with Wave 2's `feat(client): the artifact shown, and
the ask in her hand (P-14)`.

Mitigating: it is `aria-hidden="true"` and decorative-adjacent. Fix: drop the `opacity-60` (the
token is already the quiet ink), or raise the size.

### W2-05 · minor · 0.8 — axe: the discussion landmark has no unique accessible name

`section[data-testid="approval-discussion"]` is flagged `landmark-unique` (moderate). Thirteen
approvals stood on one doorstep, each with a section headed `THE DISCUSSION`; the
`aria-labelledby` (`approval-discussion-${decisionId}` → the heading, whose text is identical on
every one) does not make them distinguishable. `W1-08`, unchanged. Fix: give each an `aria-label`
naming its approval, e.g. `Discussion · Issue 01, edition 901`.

### W2-06 · minor · 0.9 — the door's other acts fall below the fold at 390 px

Measured with the Sign act in view at 390×844 on a fresh door (`15c-door-390-acts.png`):

```
 "SIGN AND AUTHORIZE"  y=751  inViewport=true   container=sticky
 "READ IT IN FULL"     y=840  inViewport=false  container=static
 "ASK A QUESTION"      y=840  inViewport=false  container=static
 "REQUEST A CHANGE"    y=896  inViewport=false  container=static
 "DECLINE"             y=896  inViewport=false  container=static
```

`W1-05` / stage-B's `W2B-R2-08`, unchanged. Steward ruling: accept the ranking as built, or bring
the four acts above the dock at narrow width.

### W2-n1 · nit · 0.9 — the weighing sentence spells to twenty, then prints figures

Probed deliberately on `Walk R2 R2NUM` (11/21):
`The cost rises by $2,500, the schedule moves out by eleven days, and the lead time grows by
21 days.` `COUNT_WORDS[whole] ?? String(whole)` (`standing-sentence.ts:143`) makes the crossover
deliberate; recorded only because both registers appear inside one clause.

### W2-n2 · nit · 0.85 — the door's four non-signing acts carry identical weight

`READ IT IN FULL`, `ASK A QUESTION`, `REQUEST A CHANGE` and `DECLINE` all resolve to `da-tertiary`;
only `SIGN AND AUTHORIZE` is `da-primary` (`11-door-1280.png`). Consider ranking `DECLINE` below
the three reading/asking acts.

### W2-n3 · nit · 0.8 — R11's baseline beside the cost delta never renders

`approval-budget` is absent on every reachable approval, at 1280 and at 390, on `plan_issue` rows
carrying real cost deltas — no projection carries `costBaselineCents`. Not a Wave-2 regression;
record R11's baseline half as unbuilt rather than satisfied.

### W2-n4 · nit · 0.75 — the why is signed with a given name, where the ruling says display name

`why_author_name` froze as `Leah` for `designer@patina.dev` (full name "Leah Hartwell") on all ten
rows this round; the doorstep renders `— Leah`. `00569:739` says "caller's own given name as
why_author_name (P-13)"; the mid-Wave-2 ruling says "the composing designer's display name". Code
and ruling should agree in words; the rendered result reads well either way.

### W2-n5 · nit · 0.7 — the maker's mark is drawn on screen and hidden from AT

R6 keeps the twelve characters "on the printed Record of Decision only", but the plate draws them
on the doorstep, `aria-hidden="true"` — visible to a sighted reader, invisible to a screen reader,
on a surface the ruling did not name. Worth one line of the ruling either way.

---

## Advisories (none blocked the walk)

1. **The shared local stack has a live peer.** The iOS walker minted its own rows on the same
   project mid-walk (`Walk R2 - the return leg`, `… the approval`, `… the lapsed`, six in all) and
   they appeared on my doorstep. Every act here was performed on a row this walk minted.
2. **`web-walk-env.md` was promised again and is still missing.** The env was reconstructed a
   second time. The seeded homeowner it would have named is still not the account the reused
   `workflow-gate-fixture.sql` recipe serves (`client@patina.dev`, Aspen Loft).
3. **The seeds cannot produce a signable trade scope.** Three things are missing: `projects.studio_id`
   is NULL on every seeded project (1 of 6 carries one), and no `trade_scope_terms` or
   `trade_scope_draws` row exists anywhere. `web-walk-r2/seed-door-scaffold.sql` +
   `seed-door2.sql` + `seed-door3.sql` supply them; a future walk can reuse those rather than
   rediscover it. Both guarded tables need `session_replication_role='replica'`.
4. **Reach the dev server at `localhost`, never `127.0.0.1`** — at `127.0.0.1` Next 16 blocks its
   own dev resources and the page never hydrates, silently.
5. **Playwright cannot launch chromium inside the sandbox** (`bootstrap_check_in … Permission
   denied (1100)`). Every browser call ran unsandboxed.
6. **A Playwright locator query on an absent element blocks for its full 30 s timeout** — a poll
   loop that reads an element which has just unmounted takes 30 s per iteration. Frame-resolution
   observations were taken with a page-side rAF sampler instead.

## Housekeeping

- Local stack **not reset**. Mutations, all local: the gate fixture's own teardown/setup; ten walk
  approvals minted through the RPCs; the seven outcomes the browser recorded (one Return, five
  Approves, one Hold); three door scaffolds (`projects.studio_id`, `trade_scope_terms`,
  `trade_scope_draws` for `…cd102`/`…cd202`/`…cd201`); three real signatures through the product's
  own sign route; one of those (`…cd201`) reset back to unsigned so the swing could be sampled,
  then signed again.
- No production mutation. Nothing pushed. No `git add -A`. No product code written.
- Dev server killed at the end of the walk (`pkill -f` scoped to this worktree's client-portal).

## Verdict

**fix** — one major (`W2-01`, the door's swing and its receipt), five minors, five nits. All four
round-1 majors are closed and verified in a browser.
