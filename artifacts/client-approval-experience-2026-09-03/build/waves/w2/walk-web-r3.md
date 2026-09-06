# Wave 2 web walk — round 3, targeted (2026-09-05)

The final-fix round walked in a real headless Chromium against the LOCAL stack, on the Wave-2
integration branch. No product code was written.

- **Worktree** `git -C … rev-parse --show-toplevel` →
  `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-integration`,
  branch `approvals/w2-integration`, HEAD at launch **`df3ca3ffe`**
  ("docs(approvals): the W2 final-fix round, its gates and the rebuilt walk app"). The brief named
  `3428dca48`; that is the base the nine fix commits sit on, and `df3ca3ffe` is its tip.
- **Server** `pnpm dev` (Next 16.2.10) from that worktree's `apps/client-portal`, booted in one
  `nohup` call with the env reconstructed from `env.md`, `playwright.config.ts` (`webServer.env`)
  and `supabase status -o env`. Log: `web-walk-dev-r3.log`. **Killed at the end** — `lsof -ti
  tcp:3002` empty, `pgrep -fl …/apps/client-portal` empty.
- **Browser** Playwright 1.58.2 headless chromium, viewports **1280×1100** and **390×844**.
  Scripts `web-walk-r3/*.mjs`; shots `web-walk-shots-r3/` (34 files). Every browser call ran
  unsandboxed — chromium cannot launch inside the sandbox (round 2, advisory 5).
- **Homeowner** `client@patina.dev` / `password123` — "Client User", project **Aspen Loft Refresh**
  `b0000000-…-0000000000d1`, studio **Local Dev Studio**.
- **Stack NOT reset.** Ledger tail by psql: `00571, 00569, 00568, 00567` — `00569` present, nothing
  replayed.
- `web-walk-env.md` does not exist in the **main checkout's** `waves/w2/` (where rounds 1 and 2
  looked); it does exist on this branch — see advisory 4. The env was reconstructed from `env.md`,
  `playwright.config.ts` and `supabase status -o env`, per the brief, and matches what that doc
  prescribes for the three variables.

## Seed, verified by SELECT

`apps/designer-portal/e2e/helpers/workflow-gate-fixture.sql` re-run (teardown + setup) — the eight
`Fixture G*` rows came back in their documented states. Then twelve approvals were composed through
the real RPCs (`create_project_approval_decision(…, p_why)` → `confirm_project_decision_review` →
`publish_client_decision`, `web-walk-r3/seed-leg.sql`), each freezing its own `why`; all read back
`why_author_name = 'Leah'`. Three trade-scope doors (`…cd201`, `…cd202`, `…cd102`) were put back to
unsigned so the swing could be walked (`web-walk-r3/reset-doors.sql`); the studio/terms/draws
scaffold round 2 built was still in place.

Outcomes recorded by the browser, read back by SELECT:

```
 Walk R3 R3A    | responded | approved          | electronic_signature | Client User
 Walk R3 R3AT   | responded | approved          | electronic_signature | Client User
 Walk R3 R3AT2  | responded | approved          | electronic_signature | Client User
 Walk R3 R3AT4  | responded | approved          | electronic_signature | Client User
 Walk R3 R3AX   | responded | approved          | electronic_signature | Client User
 Walk R3 R3KEY  | responded | approved          | electronic_signature | Client User
 Walk R3 R3HOLD | responded | needs_discussion  | click_through        | (null)
 Walk R3 R3RET  | responded | changes_requested | click_through        | (null)
```

---

## VERIFY 1 — the door swings on signature · PASS

Measured at frame resolution with a page-side rAF sampler scoped to **one** door section by id
(round 2's document-wide sampler could not tell a signed door from the next shut one).
`web-walk-r3/05-swing-scoped.mjs`, `…cd102`:

```
leaf state frame counts : {"shut":163,"swinging":63,"null":846}
swinging span           : 514 ms, 63 frames, 20 distinct transforms
door-way removed at     : ms 1891  (doorState === 'open' — the doorway renders only while !== 'open')
                          1891 − 1369 (first swinging frame) = 522 ms  ≈ SWING_MS 520
section unmounted at    : ms 1949  (the invalidation, released after the leaf)
```

- **The 520 ms swing draws.** 20 distinct `matrix3d` values across 514 ms — round 2 saw the section
  gone at the first sample after the press.
- **The reopened head shows**: `Open. It opened on your name.` from ms 1366 onward.
- **The door receipt reads the ruled P-19 sentence** — measured verbatim, twice, on two papers:
  `Aspen Loft — Stair and rail · signed 5 September · Local Dev Studio has your signature. You’ll
  have a copy.` and the same on `Aspen Loft — Primary bath stone`. "countersigns" is gone from the
  receipt.
- **`countersign` in the rendered DOM: zero.** `document.body.innerText` → 0 hits;
  `document.documentElement.outerHTML` → 0 hits, after signing a trade scope, at 1280.
  In source, `consent-copy.ts`'s two surviving lines are scoped to `design_services` /
  `service_addendum`, where a countersignature is real (wave report, advisory 1).
- The signature landed: `commercial_document_signatures` carries `party_role='client'`,
  `signed_name='Client User'`, `signed_ip='::1'`; three `POST …/sign` → 200 in the dev log.

**But the receipt is unreadable — see `W3-01`, and the recovery act with it, `W3-02`.**

## VERIFY 2 — Return and Hold record a consent method · PASS on meaning, DIVERGES on the word

```
 Walk R3 R3RET  | changes_requested | click_through
 Walk R3 R3HOLD | needs_discussion  | click_through
 Walk R3 R3A    | approved          | electronic_signature | Client User
```

Never NULL — `W2-02` is closed. The token is **`click_through`, not `portal_clickthrough`**, and
that is forced by the schema, not a slip. Read off the live DB:

```
client_decisions_client_consent_method_check
  CHECK (client_consent_method IS NULL OR client_consent_method =
         ANY (ARRAY['electronic_signature','click_through','paper']))
_respond_project_approval_checked  → allowlists 'electronic_signature', 'click_through'
```

`portal_clickthrough` would be refused outright. The **ruling's wording is what is wrong**, not the
code — recorded as `W3-n1` so a later reader does not "fix" it back.

## VERIFY 3 — the plate, axe, and the discussion landmark · PART PASS

**The maker's mark is gone.** Across the whole doorstep: `approval-makers-mark` nodes **0** on 14
plates (and **0** on 8 plates in the later state); a sweep for any bare twelve-character
`^[0-9A-F]{12}$` string inside a plate returned **0**. `W2-04` / `W2-n5` closed.

**axe-core 4.11.1, whole document, an armed approval on screen** (`20-axe-subject-open-approval.png`):

```
[serious]   color-contrast  2 nodes  — inApproval=0  inDoor=1  elsewhere=1
[moderate]  landmark-unique 2 nodes  — inApproval=2
```

- **Zero serious contrast nodes inside a doorstep-approval.** The clause verifies.
- The two serious nodes are the spine gate's kind line — `Your name is needed before the line
  continues.` / `Your acceptance is…`, `#8e7a37` on `#eee6db` at 10.08 px = **3.4:1**. **Inherited,
  not this wave**: `spine-gate.tsx`'s last touch is `ee5ea8889`, and `git merge-base --is-ancestor
  ee5ea8889 origin/main` succeeds. Round 2 did not see it because every door was already signed
  when it ran axe. Recorded as `W3-03`.
- **The discussion landmark does NOT have a unique name — `W2-05` is not closed.** See `W3-04`.

## VERIFY 4 — reduced motion stills the fill *and* the retreat · PASS

`web-walk-r3/17-motion.mjs`, sampled from a page-side rAF loop on a 420 ms press:

```
reduce          ms=  23  holding  fill=1  dur=0s     clip=inset(0 0% 0 0)      ← ink arrives at once
                ms= 440  idle     fill=0  dur=0s     clip=inset(0 100% 0 0)    ← and leaves at once
no-preference   ms=  20  holding  fill=1  dur=0.9s   clip=inset(0 100% 0 0)
                ms= 401  holding  fill=1  dur=0.9s   clip=inset(0 57.4% 0 0)   ← linear over 900ms
                ms= 442  idle     fill=0  dur=0.18s  clip=inset(0 53.7% 0 0)   ← retreat over 180ms
```

`W2-03` closed: under `reduce` the retreat computes `transition-duration: 0s` and snaps, where
round 2 measured `0.18s` and a 180 ms animation back. The hold keeps its 900 ms length in both
modes — the 420 ms press submitted in neither (`R3M1`/`R3M2` still `pending` by SELECT).

## VERIFY 5 — 390 px: the door's secondary acts are reachable · PASS

`web-walk-r3/18-door-390.mjs`, 390×844, Sign in view, on a fresh door:

```
 "SIGN AND AUTHORIZE"  y=772  h=44  inViewport=true  sticky  [data-hold-dock]
 "READ IT IN FULL"     y=683  h=44  inViewport=true  sticky  [data-acts-dock]
 "ASK A QUESTION"      y=683  h=44  inViewport=true  sticky  [data-acts-dock]
 "REQUEST A CHANGE"    y=731  h=44  inViewport=true  sticky  [data-acts-dock]
 "DECLINE"             y=731  h=44  inViewport=true  sticky  [data-acts-dock]
```

All five in the viewport with no scrolling. The two docks abut without overlapping —
`acts` 670→783 (`bottom: 61px`), `hold` 783→844 (`bottom: 0`), Sign 792→836; `elementFromPoint` at
Sign's top edge and centre both return the Sign button, so nothing is occluded. `W2-06` closed
(round 2 measured y=840 / y=896, below an 844 px fold).

## VERIFY 6 — regression on the ceremony · PASS

| leg | evidence |
|---|---|
| **Approve** | signature line mounts (`Type your full name` · `5 September 2026` · `Your typed name acts as your electronic signature.`); Submit unlit with no name, lit with one; a **300 ms** press leaves no stamp; mid-hold `state=holding`, word ink `rgb(250,247,242)` on pool `rgb(44,41,38)`; **APPROVED** stamp ink `rgb(92,74,60)` = `--color-mocha`, `background-color: rgba(0,0,0,0)`, `box-shadow: none`, −1.1°. SELECT: `electronic_signature` / `Client User`. |
| **RETURNED + note** | label `Tell your designer what to change.` (`rgb(78,67,57)`), help `It goes into the discussion below with your answer.` — instructional, no red, no "required"; no signature line. Submit unlit on an empty note, lit once typed; **250 ms** does not submit, **1400 ms** does. Stamp **RETURNED**, `rgb(44,41,38)`, no fill, no shadow. The note landed on the approval — it reads back under THE DISCUSSION as `YOU · 5 SEPTEMBER AT 17:21`. |
| **Hold** | no signature line, no note field, Submit lit immediately; **HELD** stamp, no fill, no shadow; SELECT `needs_discussion`, no signature. |
| **Keyboard Enter hold** | a **500 ms** Enter hold does not submit; a full hold does → **APPROVED**. Mid-hold: `state=holding`, `:active=false`, word `rgb(250,247,242)` on pool `rgb(44,41,38)`, **contrast 13.53:1**. |
| **AT synthetic click** | measured against a page-side clock rather than assumed (`16-assistive-timed.mjs`): a **50 ms** real tap is not taken; `element.click()` at **+308 ms** after `pointerup` — inside `POINTER_TAIL_MS = 700` — is **refused**; at **+3137 ms** it is **taken** → APPROVED. `scored-action.tsx` is byte-identical to what round 2 walked (`git merge-base --is-ancestor f15894922 a65b212c7`). A first, un-timed pass of round 2's script *did* let a synthetic click through — the harness's own round-trips had pushed it past 700 ms. Harness artefact, not a defect; recorded so a later walk times the tail instead of counting `waitForTimeout`s. |

## Vocabulary sweep of rendered text

`gate: 4` — all four inside the **fixture's own `context` strings**
(`Fixture gate in draft with no review confirmation yet.` etc.), fixture-authored data the product
renders faithfully. `gates · task · tasks · overdue · dashboard · AI · Declined · declined · badge ·
confetti`: **clean**. Emoji: **none**. Stamps read APPROVED / RETURNED / HELD; APPROVED in mocha.

---

## Findings

### W3-01 · major · 0.9 — the ruled P-19 receipt is on screen for 0.38 s, then exists nowhere

The receipt now renders (`W2-01` half-closed) but the door section is unmounted 520 ms after the
swing starts, and the sentence goes with it. Measured on two papers with a scoped rAF sampler:

```
…cd102   receipt present 1366 → 1891 ms   (525 ms)
…cd202   receipt present 2509 → 3026 ms   (517 ms);  at opacity ≥ 0.99: 2649 → 3026 ms (377 ms)
         section gone 3072 ms
```

The receipt fades in over 420 ms, so it is at full ink for **377 ms**. The sentence is 108
characters. After the unmount:

```
"has your signature" on the page : 0
/proposals/…cd202  (redirects to /?proposal=…#door) : 0 hits
/proposals/…cd102                                   : 0 hits
```

Previously shows the paper as `SIGNED`; the seal sentence itself is not reachable on the web
surface again, ever. The ruling ("the seal sentence names the studio … on the web door receipt")
is satisfied in the DOM and not in the reading. `door-gate.tsx:246-272` — the swing timer opens the
leaf at `SWING_MS`, and the awaited invalidation is released at the same `SWING_MS`, so the door
opens and dies in the same frame. Fix: hold the door (or the receipt) past the swing — a dwell the
sentence can be read in — or carry the sentence into what replaces the door.

### W3-02 · major · 0.85 — the "Resend confirmation notice" recovery flashes for 0.53 s

Same root cause, worse consequence: this one is an **act**, not copy. With the local edge runtime
down, all three signatures returned `notificationDelivery.state === 'pending_retry'` (dev log:
`commercial notification pending retry { documentId: …, transition: 'trade_scope_executed' }`,
six times), so `deliveryPending` was set and the block rendered:

```
door-delivery-pending present: 1148 → 1679 ms  (531 ms)
  "Your signature remains recorded, but confirmation delivery is still pending. You can retry
   safely." + [Resend confirmation notice]
after the door goes: door-delivery-pending nodes = 0, "confirmation delivery" text = 0
```

`door-gate.tsx:230-236` calls the Threshold "the page that param lands on", but nothing on the
client portal reads `?delivery=pending_retry` — `grep -rn "CommercialNotificationRecovery"
apps/client-portal/src` finds only the type alias in the route files. The door's inline block is
the *only* surface, and it lives half a second. A homeowner whose confirmation genuinely failed to
send cannot reach the retry. `pending_retry` is a real production state, not only a local one.

### W3-03 · minor · 0.9 — the door's gate line fails AA at 3.4:1 (inherited, newly exposed)

`spine-gate.tsx:35-36` draws `Your name is needed before the line continues.` in `#8e7a37` at
10.08 px on `#eee6db` — **3.4:1** against a 4.5:1 floor, and it is the only serious axe violation
left on the surface (2 nodes: one `signature` gate, one `acceptance`). Not this wave's: the file's
last touch `ee5ea8889` is on `origin/main`. Round 2 missed it because it ran axe after every door
was signed, so no gate was drawn. Fix or accept, but record it — `W1-04`/`W2-04` retired the
doorstep's contrast failures and this is the same pigment problem one component over.

### W3-04 · minor · 0.9 — the discussion landmark is still not uniquely named; `W2-05` is not closed

The `aria-label` landed, but its text is the **artifact title**, which every approval on the same
artifact shares. Census of the settled doorstep:

```
  6x  "Discussion about Issue 01 - Design Development Set"
  2x  "Discussion about Issue 02 - Design Development Set, Rev B"
  → 8 landmarks, 2 distinct names
```

(and 14 landmarks / 2 distinct names earlier in the walk, before rows were answered). axe still
reports `landmark-unique`, moderate, **2 nodes, both inside doorstep-approvals** — the same rule
round 2 filed as `W2-05`. The wave report's own suggested wording ("Discussion · Issue 01, edition
901") would have worked; the shipped label dropped the edition. Fix: put the edition (or the
decision id) in the label.

### W3-n1 · nit · 0.95 — the ruling says `portal_clickthrough`; the schema only takes `click_through`

Recorded above under VERIFY 2. The build is right and the ruling's word is wrong. One line of
`rulings-2026-09-04.md` ("Return and Hold record `client_consent_method = 'click_through'` — the
column's own token; `portal_clickthrough` belongs to the review leg") would stop a future reader
"fixing" a homeowner's Return into a constraint violation.

### W3-n2 · nit · 0.8 — `W2-n1` … `W2-n4` are unchanged and were not in this round's scope

Re-observed in passing and not fixed: the weighing sentence spells to twenty then prints figures
(`COST +$1,250 · SCHEDULE +3 DAYS · LEAD TIME +7 DAYS` beside "…the schedule moves out by three
days…"); the door's four non-signing acts carry identical weight (all `da-tertiary`);
`approval-budget` is absent on every approval (R11's baseline still unbuilt); the why is signed
`— Leah`, a given name where the ruling says display name.

---

## Round-2 findings, re-verified

| id | verdict |
|---|---|
| `W2-01` the door never swings, the receipt is unreachable | **HALF CLOSED.** The swing draws (514 ms, 20 transforms), the head reopens, and the receipt carries the ruled P-19 sentence. The receipt is still not *readable* — 377 ms at full ink, then gone for good → `W3-01`; and the delivery-retry act goes with it → `W3-02`. |
| `W2-02` Return and Hold record no consent method | **CLOSED.** `click_through` on both, by SELECT. Token wording → `W3-n1`. |
| `W2-03` reduced motion stills the fill, not the retreat | **CLOSED.** `dur=0s` on both legs under `reduce`, measured. |
| `W2-04` / `W2-n5` the maker's mark | **CLOSED.** Zero mark nodes, zero twelve-character strings, on every plate. |
| `W2-05` the discussion landmark has no unique name | **NOT CLOSED** → `W3-04`. The label is present but shared. |
| `W2-06` the door's acts below the fold at 390 | **CLOSED.** All five acts in the 844 px viewport; the two docks abut without overlap. |
| `W2-n1` … `W2-n4` | **OPEN**, unchanged and out of scope → `W3-n2`. |

## Advisories

1. **The local edge runtime is down** (`supabase status`: `Stopped services:
   [supabase_edge_runtime_supabase supabase_pooler_supabase]`), so every commercial notification
   answered `pending_retry`. That is what made `W3-02` observable; it did not affect any other
   measurement, and every `POST …/sign` still returned 200.
2. **Sample a door scoped to its own section id.** A document-wide `querySelector` silently starts
   reading the *next* shut door the moment the signed one unmounts — round 2's "leaf=shut, head=
   Shut since 2 September" tail is that, not a state the signed door entered.
3. **Time the pointer tail, don't count `waitForTimeout`s.** `POINTER_TAIL_MS = 700`; round 2's
   script reaches the synthetic click at roughly that boundary, so it can pass or fail on machine
   speed. `16-assistive-timed.mjs` marks `pointerup` at the document and reports the real delta.
4. **`web-walk-env.md` exists after all — on the branch, not in the main checkout.**
   `artifacts/…/waves/w2/web-walk-env.md` is tracked on `approvals/w2-integration` (`19370b3b2`)
   and absent from `/Users/kody/Code/patina-merged/artifacts/…`, which is where rounds 1 and 2
   looked and reported it missing. Two things follow. First, its recipe is a **different**
   homeowner — `client-solo@patina.dev` / Nora Ellison / **Cedar Lane Study**
   `b0000000-…-00000000c0d1`, and it says plainly "the seed carries no project-approval review for
   either client", i.e. the doorstep ceremony is not reachable on its data without authoring an
   approval first. This walk followed the brief and reused round 2's recipe (`client@patina.dev`,
   Aspen Loft, approvals minted through the RPCs), which is why it had thirteen approvals to walk.
   Second, a walk doc that only the worktree carries is a doc every walker reading from the main
   checkout will miss — worth one line in `env.md` pointing at it.
5. **Reach the dev server at `localhost`, never `127.0.0.1`** (round 2, advisory 4) — still true.
6. **Playwright cannot launch chromium inside the sandbox**; every browser call ran unsandboxed.

## Housekeeping

- Local stack **not reset**; ledger tail `00571, 00569, 00568, 00567` before and after. Mutations,
  all local: the gate fixture's own teardown/setup; twelve walk approvals minted through the RPCs;
  eight outcomes the browser recorded (one Return, one Hold, six Approves); the three trade-scope
  doors reset to unsigned twice and signed three times through the product's own sign route.
- No production mutation. Nothing pushed. No `git add -A`. No product code written.
- **Dev server killed** — `pkill -f "agent-cae-w2-integration/apps/client-portal"`, then
  `lsof -ti tcp:3002` empty and `pgrep -fl …` empty.

## Verdict

**fix** — two majors (`W3-01` the P-19 receipt is unreadable and unreachable; `W3-02` the retry act
flashes), two minors, two nits. Four of the six round-2 findings are closed and proven in a browser;
`W2-05` is not closed, and `W2-01` is closed only as far as the animation.
