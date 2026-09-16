# Wave fix log — the Agreement Room galley

Lane: fix. Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agreement-galley-fix`,
branch `agreement-room/galley-fix` off `4035eab00`. Yardsticks: `build/review/wave-review.md`
(WR-01…WR-37), `build/review/t1-review.md` P2 rows, `specimens/SPEC.md` §4 Direction I and §5,
`synthesis.md` §5, `rulings.md`.

`FIXED` = changed in this lane. `DECLINED` = deliberately not changed, with the reason.

---

## P1

| id | disposition | change | verified how |
|---|---|---|---|
| **WR-01** | **FIXED** | `galley.css` — `.g-part__acts-ghost, .g-part__acts-live` take `flex-wrap: wrap` and `min-width: 0`; `.g-part__acts` takes `min-width: 0`. The reserved box now wraps at the measure instead of holding an unwrappable 369px row of three nowrap labels against a 310px paper. Ghost and live carry identical children and wrap identically, so the reserved height still equals what a reveal costs. | Rendered proof at 390: `document.documentElement.scrollWidth` measured in three states (resting, Services fold, Role rates fold) — see `shots/galley-fix/measure.json`. Δ = 0px on the part above an unfold re-measured at 1440 and 390 in the same run. |
| **WR-02** | **FIXED** | `agreement-composer.tsx` — `<GalleyPart key={part.partKey}>` (was `part.id`). `part-outline.tsx` — `<li key={part.partKey}>` (was `part.id`). `keptPartIds: Set<uuid>` → `keptPartKeys: Set<partKey>`, so the Library "kept" mark also survives a save. `openKey`, `GalleyFold`'s key and `idsFor()` were already on the part key. | Three new cases in `__tests__/agreement-composer.test.tsx` ("the open fold survives a save"): the save mock re-mints every id, the test asserts the `<section>` node, the `<textarea>` node and the outline row are the **same DOM nodes** (`toBe` / `isSameNode`) after the persist, that the typed clause survives and that `document.activeElement` is still the textarea. Full designer suite green. |
| **WR-03** | **DECLINED-ACCEPTED** | No code change. `their signature` stands: a name carries no gender and no field supplies one. **Spec amendment owed** — `synthesis.md` §5 #25/#26 and `specimens/SPEC.md` §5 #25/#26 should read `their signature`, and build-sheet T1 acceptance 6 should be restated against the amended strings. T1R-02 is disposed of here. | `__tests__/agreement-copy.test.ts` now pins the sentence with `their`, so the amended string is asserted rather than merely read. |

---

## P2 · fixed

| id | disposition | change | verified how |
|---|---|---|---|
| **WR-04** | **FIXED** | `galley.css` — the below-1248 rule `.g-strip .g-strip__standing { display:none }` becomes `.g-strip:not(.g-studio-run) .g-strip__standing`. The gathered run exists to carry the standings and was hiding its own payload. | `measure.json` `390-voice.strips` shows the `g-studio-run` strip visible and carrying `Creates authority`; read in `390-resting.png`. |
| **WR-05** | **FIXED** | `readiness.ts` — the fee-floor blocker is filed against the rate-card part when the composition carries one (`add(rateCardPart?.id ?? null, …)`), the way the ceiling blocker already is. It therefore prints in the Role rates strip (notes column ≥1248, in-flow strip after that part below 1248), lights `needs attention` on the outline row, and makes the held Send's focus land on the part the sentence is about. With no rate-card part at all it stays a document blocker and the foot carries it, remedy included. | `measure.json` `*-voice.strips` / `.attention`; `1440-resting.png` and `390-resting.png` read. `readiness.test.ts` and the composer's "names the class floor" case still green. |
| **WR-06** | **FIXED** | `readiness.ts` — `AgreementBlocker` gains `quiet?: boolean`; the client-link blocker is marked `quiet: true` (SPEC §5 marks #20 "comment, not rendered") and `documentBlockers()` filters it out. With WR-05 landed the part-filed blockers move to their strips, so on the standard composition the foot's `.g-blockers` block renders **nothing** — the readiness region owns the count and the foot carries only what it does not. The sheet's own `Finish before sending` list is unaffected (it reads `readiness.blockers`, not `documentBlockers`). | `measure.json` `*-voice.foot` is `[]` on the seeded draft while `*-voice.status` carries the sentence. `readiness.test.ts` R-3 updated to pin the new blocker shape. |
| **WR-08** | **FIXED** | `agreement-composer.tsx` — a new `localRefusal()` names the room's own refusal (`duplicateMoneyBlocker(label)` / `BLANK_ROLE_BLOCKER`), and `persist()`'s `refusedAtSave` branch now writes it into **both** `saveNote` and `announcement` before returning `false`, so `#room-status` says why a fold-close saved nothing. `sayWhyHeld()` falls back to the same sentence when no readiness blocker is available. | Full designer suite green; code path is the same one the review forced with an unnamed rate-card role. |
| **WR-27** | **FIXED** (rides WR-05/WR-06) | `sayWhyHeld()` announces `heldOn?.message` first — the blocker whose part takes the focus — before falling back to the document blockers, the first blocker, then `localRefusal()`. The announced reason and the focused part are now the same blocker. | Suite green; measured `sendDescribedBy` in `measure.json`. |
| **WR-11** | **FIXED** | `agreement-composer.tsx` — the prepared-for act carries `aria-describedby` on **both** held paths (`agreement-client-reason` when the reader does not own the agreement, `agreement-frozen-reason` when the agreement has left the studio); the owner-reason paragraph is no longer gated on `authStatus !== "loading"`, so the describedby never points at a node that does not exist; the read-only paragraph gained `id="agreement-frozen-reason"`. Held Send's `aria-describedby` resolves the same way, falling back to `room-status` (never empty) when neither a part strip nor the foot carries a sentence. | Suite green; `measure.json` records the live `aria-describedby` on the held act. |
| **WR-10** | **FIXED** | `service-agreement-send-sheet.tsx` — `held={!readiness.ready}` replaces the bare `held`. `Button` computes `isHeld = held && (disabled || loading)`, so a bare `held` also fired while the send was **in flight**: `aria-disabled` with no `aria-describedby` (check 7), and an activation announcing that a ready agreement was not ready. | Suite green (`service-agreement-send-sheet.test.tsx` included). |
| **WR-10b** | **FIXED** (call site) | `service-agreement-send-sheet.tsx` — the two inert utilities (`normal-case tracking-normal`) are dropped from the note hint. The house-sheet block is unlayered CSS emitted after `@tailwind utilities`, so `.t-meta` always won; the class list now says what the browser does. The rendered line is unchanged and matches synthesis §5's "the placeholder becomes a `.t-meta` line". Layering `globals.css` under `@layer components` is **not** done here — that is a portal-wide cascade change and belongs to a house-sheet lane. | Suite green; no visual change by construction (the utilities never applied). |
| **WR-30** | **FIXED** | `service-agreement-send-sheet.tsx` — `terms?.furnishingsDepositPercent == null` (was `=== null`). A document with **no** terms row yields `undefined`, so the strict test called an unset deposit "set" and the sheet showed no caution. | Suite green. |

## P3 · fixed

| id | disposition | change | verified how |
|---|---|---|---|
| **WR-18** (also T1R-03) | **FIXED in part** | New `__tests__/agreement-copy.test.ts` (10 cases) pins `agreementCountWord`, `agreementPartNounPhrase` and `agreementConsequenceSentence` to synthesis §5 #25/#26 on the Okonkwo fixture — the six-part sentence verbatim, the seven-part money state, the hidden-part exclusion, the unnamed-client form and the empty composition. **DECLINED half:** adding a `test` script to `packages/types` — it would newly run five suites that have never run, which is a verification-lane change, not a galley fix. | The file runs inside the designer gate (`10 passed`), which is the gate that actually executes. |
| **WR-19** | **FIXED** | `agreement-composer.tsx` — the header record is the **agreement's** (`… · This agreement not yet saved`) and the fold record stays the **part's** (`… · Role rates not yet saved`), so the two lines are complementary instead of the same string printed twice on one page. | Read in `1440-services-open.png`; suite green. |
| **WR-20** | **FIXED by the same change** | The dirty header string is now one string in every state, open fold or not. It is still not pinned in synthesis §5 — **spec note owed**, not a code defect. | As above. |
| **WR-23** | **FIXED** | `galley-fold.tsx` marks the rename input `data-fold-rename="true"`; `galley-part.tsx`'s open effect focuses the first field that is **not** the rename input, falling back to it when the fold has no other field. SPEC §4's fold markup has no rename field and its keyboard model lands the caret in the part's own first field. | Composer suite green (the rename case still finds its input by label); read in `1440-services-open.png` / `390-services-open.png`. |
| **WR-24** | **FIXED in part** | `galley.css` — `.g-outline__foot .g-act, .g-outline__foot button { min-height: 44px }`, so `Save as template…` takes its neighbour's act metrics (was 147×30, AX-17). **DECLINED half:** `Link a client` at 90×29 — SPEC's own two rules conflict ("every act ≥44×44" vs "`.act--inline` is an act inside a sentence"); a ruling is owed, and boxing an inline act would break the sentence it sits in. | Read in `1440-resting.png`. |
| **WR-25** | **FIXED** | `agreement-composer.tsx` — comment recording that the comparison is outside the updater; the setter pair is unchanged in behaviour and the updater stays idempotent. StrictMode double-invocation is harmless here. | Suite green under the existing StrictMode cases. |
| **WR-32** | **FIXED** | `agreement-composer-library-off.test.tsx` header comment no longer names the retired acts, so the standing greps have no last false hit. | `grep 'Return to the seven facets\|Preview client copy'` over the agreement tree returns nothing. |
| **WR-36** | **FIXED** | `part-outline.tsx` — the `needs attention` span gains an id and the row button an `aria-describedby` at it, so a screen-reader walk of the outline hears the attention word (SPEC §5 #22). Row keys moved to `partKey` in the same edit (WR-02). | Suite green (`attentionRows()` cases unchanged). |

---

## Declined, with reasons

| id | sev | reason |
|---|---|---|
| **WR-07** (the 1024 band) | P2 | **DECLINED by orchestrator ruling.** One column below 1248 is the built specimen's final rule and it supersedes SPEC §4's earlier 216px notes-column number. SPEC §4's 1024 CSS is what should be amended. |
| **WR-12** (portal-wide focus trap) | P2 | Dropping the `aria-disabled` filter is right for N-4, but the matching change to `mobile-sheets.tsx:80` plus the folio-preset test the review asks for are a portal-wide behaviour change with no coverage in this lane's file set. Landing half of it — or landing it untested — is worse than recording it. Owner needed. Record it in the ship report as a portal-wide behaviour change. |
| **WR-13** (`Preview client copy` in `service-agreement-instruments.tsx`) | P2 | AR-d's known remainder. Retiring a live act on a second shipped surface is a product change, not a galley fix, and the build sheet scoped AR-d to the composer. Owner needed. |
| **WR-14** (unwritten rate card prints) | P2 | The review's own words: a ruling is owed, not a code call. Either `partDrawsNothing` treats a role-less rate card as silent (closing N-12) or SPEC §4's Direction I RESTING markup is amended. The two cannot both stand and this lane may not pick. |
| **WR-15** (Estimate pill over the strips) | P2 | Pre-existing floating act belonging to another component; which of the two yields the right margin is a ruling, and offsetting it blind risks a new collision elsewhere in the room. |
| **WR-16** (move/hide invisible at rest) | P2 low | The review's own confidence is low and it asks for Kody's eye at the walk. The build sheet asks for the ghost/live pair by name; reversing it is a design change. |
| **WR-17** (`per-phase-editor` native `disabled`) | P2 | Both lines are **unchanged from `origin/main`** and outside the galley. A correct fix needs `held` + a visible resolving reason inside an editor's phase list — new copy and new tests. The cheaper true close is the review's second option: add them to the build sheet's exemption list so the standing grep has a fixed baseline. |
| **WR-21** (money without cents) | P3 | Carried. TY-3 and the shipped body renderer disagree and the brief requires the renderer to stay unchanged. The **sentence** money is correct and is now pinned by `agreement-copy.test.ts`. |
| **WR-22** (`scroll-margin-top` 84 vs 24) | P3 | Deliberate and documented in the source: 60px sticky bar + one 24px module. Measurably harmless (Δ 0 at scroll 900). Amend SPEC §4 to `24px + the sticky bar`. |
| **WR-26** (two effects with no dep array) | P3 | Both are deliberate post-render measurements — the marginalia placement must re-measure after **every** render (a strip's height changes with any content change), and the move-focus effect consumes a ref and returns early. Adding dependency arrays risks stale marginalia placement, which is the thing N-15 exists to prevent. |
| **WR-28** (two drawings of one act) | P3 | Swapping the sheet's `Button` for `DocumentAction variant="terminal"` changes the send act's primitive, its loading behaviour and its tests. A design-system decision, not a galley fix. |
| **WR-29** (sheet status empty at rest) | P3 | The resting sentence it wants is copy nobody has authored; synthesis §5 does not pin one. Copy owed first. |
| **WR-31** (`discard_agreement_parts` unconsumed) | P3 | The ruling sheet says the ruling is owed. Deleting a hook or an RPC on a guess is the one option that cannot be undone cheaply. |
| **WR-33** (one `box-shadow` in the tree) | P3 | Pre-existing RoomShell mobile bar, `hidden` at 1440, outside the galley's own CSS. Nothing owed by this wave; recorded so the house-sheet audit does not read the grep as a full pass. |
| **WR-34** (head row wraps at 1024) | P3 | Falls out of WR-01 — same root cause, same fix. |
| **WR-35** (`.g-seam` 48 vs SPEC 44) | P3 | Module-aligned and larger, so AX-17 is satisfied more generously. Amend SPEC §4 to 48. |
| **WR-37** (sheet title not painted) | P3 low | Pre-existing `DocSheet` behaviour, outside this lane's file set; the title is in the DOM and is the dialog's `h2`. |
| T1R-12 (`agreementCountWord(0)`) · T1R-13 (empty-composition sentence) | P3 | Not raised as defects against SPEC/synthesis in the wave review; `agreement-copy.test.ts` now pins the empty-composition sentence as it stands, so a future ruling has a fixture to change. |
| T1R-09/10/15/20 (globals.css token deviations) | P3 | House-sheet lane, not the galley's file set. |

---

## Gates

Run in the fix worktree, sandbox off. Tails are in the lane's report.

- `pnpm --filter @patina/designer-portal type-check` — exit 0, no output.
- `pnpm --filter @patina/designer-portal test -- src/components/document/rooms/drafting src/components/document/commercial src/components/ui src/lib/document` — **156 suites / 2892 tests passed**.
- `pnpm --filter @patina/designer-portal test` (full) — **569 suites / 7119 tests / 1 snapshot passed**. (Baseline at `4035eab00` was 568 / 7106; +1 suite and +13 tests are this lane's.)
- `npx eslint` over `src/components/document/rooms/drafting/agreement/` and `service-agreement-send-sheet.tsx` — exit 0, no findings.
- Render proof: `artifacts/agreement-room-2026-09-10/shots/galley-fix/` — resting, Services fold and Role rates fold at 390 and 1440, plus `measure.json`.

`packages/types` was not touched, so no types rebuild and no client-portal type-check were required.

---

## The render proof, measured

Local production build of this worktree (`next build --webpack`, then `next start -p 3005` —
:3000 was left to the e2e lane), flags
`procurement-workspace-pilot,the-document-pilot,agreement-parts,agreement-library,design-build`
all `true`, signed in as `designer@patina.dev`, on a throwaway draft seeded by
`shots/tools/seed-draft.mjs` (`04e60f29-f91c-40cf-8e47-4192489b838b`). The server was killed at
the end. Capture script: `shots/tools/capture-galley-fix.mjs`.

**WR-01 — `document.documentElement.scrollWidth` at 390**, three states, `[scrollWidth, clientWidth]`:

| state | 390 | 1440 |
|---|---|---|
| resting | **390 / 390** | 1440 / 1440 |
| Services fold open | **390 / 390** | 1440 / 1440 |
| Role rates fold open | **390 / 390** | 1440 / 1440 |

`overflowing` (every element whose right edge passes `innerWidth`) is `[]` in all six states.
`390-services-open.png` shows the reserved box wrapping: `WRITE` on the head row,
`MOVE DOWN · HIDE FROM THE CLIENT` on the line beneath, inside the measure.

**Check 18 — Δ = 0px, still holding after the wrap change.** Measured from resting, on the part
above the one opened, in DOCUMENT coordinates (`rect.top + scrollY`) so a click's auto-scroll
cannot be mistaken for reflow:

| width | fold opened | Δ on the part above |
|---|---|---|
| 1440 | Services | **0px** |
| 1024 | Services | **0px** |
| 390 | Services | **0px** |
| 1440 | Role rates | **0px** (`docDelta`; `viewportDelta` −514 is the click's own scroll, `scrollY` 0 → 514) |
| 390 | Role rates | **0px** (`docDelta`; `viewportDelta` −1190, `scrollY` 0 → 1190) |

**WR-02 — the remount proof.** Not a screenshot: the three jest cases compare DOM node identity
across a persist whose mock re-mints every uuid. `expect(document.getElementById("part-patina-services")).toBe(section)`,
`expect(screen.getByRole("textbox",{name:"Body"})).toBe(body)`, `expect(document.activeElement).toBe(body)`
and the outline row `toBe(row)` — all pass with `key={part.partKey}`.

**WR-05 / WR-06 / WR-04, measured on the page** (`shots/galley-fix/measure.json`):

- `1440-voice.strips[0]` = `g-strip` (not quiet), text `The studio · Role rates · creates authority · This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.` — in the **notes column** beside the Role rates seam at 1440, and in the **in-flow strip immediately above Role rates** at 390. Read in `1440-resting.png` and `390-resting.png`.
- `*-voice.foot` = **`[]`** at both widths, while `*-voice.status` carries `Two things before this can go: name a fee; link a client.` The foot now prints only the consequence sentence and the two acts.
- `390-voice.strips[5]` — the `g-studio-run` — is `visible: true` and carries `creates authority · Role rates · Ceiling · Retainer · Billing cadence` plus `creates authority · deposit only · Furnishings deposit`. At 1440 it is `visible: false`, as designed.
- `*-voice.attention` = `["needs attention"]`, on the Role rates row.

**Check 7 — every held act's reason resolves** (probed on the live page):

| act | `aria-describedby` | resolves to |
|---|---|---|
| `Send the agreement · $5,000.00 retainer` | `part-patina-role-rates-blocker-0` | `This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.` |
| outline row `Role rates` | `outline-attn-patina.role_rates` | `needs attention` |

**WR-23 / WR-24, probed.** Opening Services lands `document.activeElement` on the `TEXTAREA`
inside the `Body` label (`data-fold-rename` is `null`), not the rename input; on a role-less rate
card the rename input is still the fallback because the fold has no other field. `Save as
template…` measures **147×44** (was 147×30) and `Start from a template…` 195×44.

**Screenshots** — all six read:
`shots/galley-fix/{1440,390}-{resting,services-open,role-rates-open}.png`,
plus `measure.json` and `delta.json`.

---

# Round 2 fixes — WR-101, WR-102, WR-103, WR-104

Lane: fix 2. Worktree `.codex/worktrees/agent-agreement-galley-fix2`, branch
`agreement-room/galley-fix2`, base **`b2321da62`**. Nothing pushed.
One source file touched: `agreement-composer.tsx`. Two test files.

| ID | sev | disposition |
|---|---|---|
| **WR-101** | P1 | **FIXED** — `persist()` is serialized; 4 new cases |
| **WR-102** | P2 | **FIXED** — both server-side replacements bump `revision`; 1 new case |
| **WR-103** | P3 | **DECLINED** — no code change was asked for |
| **WR-104** | P3 | **FIXED** — the reviewer's first option: the invariant is written down |

---

## WR-101 · exactly one save in flight

Three refs and a loop, all in `agreement-composer.tsx`.

- **`inFlight`** holds the promise of the save currently in the air. A
  `persist()` that arrives while it is set does **not** issue an RPC: it sets
  `pendingSave` and returns *that same promise*. So the second call cannot
  overtake the first, and the pair the server could apply out of order never
  exists. `reviewAndSend` and the fold-close persist go through this one door.
- **The queue runs once, with the latest parts.** The chain is
  `let outcome = await flight(); while (pendingSave.current) { pendingSave.current = false; outcome = await flight(); }`
  — so N acts taken during one flight queue **one** save behind it, not N, and
  the caller awaiting `persist()` is resolved by the **final** landing. That is
  what keeps `reviewAndSend` from opening the send sheet on the first one.
- **`saveSeq`** tags each flight. A landing whose `seq !== saveSeq.current` is
  discarded outright — it may not write the paper and it may not clear the
  record. With the serializer in place this is belt-and-braces (a landing is
  always the latest), and it is deliberately kept as the guard the next author
  needs if anything ever fires a save outside the door.
- **`dirty` clears only when the room can vouch for it.** Integration 2's rule
  is kept and one term added:
  `behindThePage = revision.current !== sentAt || pendingSave.current`.
  A save with another already queued behind it never reports `Saved`.
- **A refusal defers to the queued save.** If a flight fails with
  `pendingSave` set, it says nothing; the queued save carries the same
  composition and is the one that gets to speak. If that one fails too,
  `#room-status` and the line beside the record both print it.

**`partsRef` — the reason this needed more than four lines.** A queued save
runs *after* the flight it is queued behind lands, so it cannot read `parts`
from the render closure that asked for it, and a `setParts` updater does not
run until React flushes — a queued save would have sent the pre-landing
composition, with the ids the RPC had just re-minted. Every write to the
composition now goes through `commitParts`, which lands the value in
`partsRef` in the same tick; `flight()` sends `partsRef.current`. All five
`setParts` sites route through it, so the ref cannot drift. The "pair of
setters in one handler" contract N-?/`mutate` depends on is preserved, because
`commitParts` reads the ref rather than the render's `parts`.

### Why case (a) is not literally "the first lands last"

The brief asked for a case where two overlapping saves land out of order. After
the fix **that case cannot be composed from the page**: the second RPC is not
issued until the first is down, which is precisely the fix, so there is no pair
to invert. The case pins the absence instead — it takes the exact WR-101 walk
(write, take the act, write again, take the act again mid-flight) and asserts
that only one call is ever in the air, that the older landing does **not** clear
the record, and that the last call the RPC took carries the newer clause.

### The four cases (`__tests__/agreement-composer.test.tsx`)

`describe("AgreementComposer · two saves may not fly at once (WR-101)")`

1. `holds the second save back, so an older landing cannot bury a newer clause`
   — call count stays 1 while the first flies; after its landing
   `record()` still reads `not yet saved`; the queued call carries
   `The ground floor and the stair hall.`; the last RPC payload and the
   textarea agree.
2. `runs a save requested mid-flight exactly once, with the latest parts`
   — three acts during one flight; **spy call count = 2**, second payload
   `Fourth.`, and no third call after the second lands.
3. `lets the queued save speak for a failed one that it succeeds behind`
   — first flight rejects with a save queued: **0** refusal sentences on the
   page; the queued save succeeds and the record goes clean.
4. `reports the refusal in the status region when the queued save fails too`
   — both reject: 2 sentences (the live region and the line beside the
   record), `#room-status` carries `The agreement could not be saved.`, and
   the record reads `Not saved yet` — no save is dated that never landed.

**The cases bite.** Swapping only `agreement-composer.tsx` back to its
`b2321da62` content and re-running the file:
```
    ✕ holds the second save back, so an older landing cannot bury a newer clause (124 ms)
    ✕ runs a save requested mid-flight exactly once, with the latest parts (185 ms)
    ✕ lets the queued save speak for a failed one that it succeeds behind (128 ms)
Tests:       3 failed, 34 passed, 37 total
```
(Case 4 passes on both sides by design — it pins the "only if" half of the rule.)

---

## WR-102 · a composition replaced outside `mutate` bumps the revision

`replaceParts(next)` = `revision.current += 1; commitParts(next)`. It is what
`applyTemplate` and the materialize effect call now, so the next path that
replaces the composition from the server cannot forget the counter. `dirty` is
left exactly as each path set it (both replace from the table, so both stay
clean) — the bump is what makes an in-flight save take the stale branch and
adopt ids by `partKey` instead of laying the pre-template parts back down.

**The case** (`__tests__/agreement-composer-library-on.test.tsx`):
`keeps a Template laid in during a save when that save lands` — write, take the
act so a save is in the air, lay in `Full-service residential` while it flies
(the refetch answers with a part the pre-template composition does not carry,
`studio.house-rules`), then land the save. The outline still holds exactly one
row, `House rules`, and the template's sentence still stands.

That suite's `useSaveAgreementParts` mock was a throwaway `jest.fn()` returning
`undefined`; it is now the module-level `mockSaveParts` with the same default
implementation the main suite uses, so a persist there answers like the RPC.

**It bites.** With `replaceParts(landed)` put back to `commitParts(landed)`:
```
    ✕ keeps a Template laid in during a save when that save lands (261 ms)
Tests:       1 failed, 10 passed, 11 total
```

---

## WR-103 · DECLINED

The finding's own proposed fix is "None needed if it is intended; say so in the
ship report." There is no code change to make: the client-link remedy sentence
is `quiet` by SPEC §5 #20, the voice still counts it, and the prepared-for line
carries `Link a client` as the better remedy. **Owed: one line in the ship
report** confirming the act replaced the sentence deliberately.

## WR-104 · FIXED (6 lines, the reviewer's first option)

`heldOnPart`'s `parts.find((entry) => entry.id === heldOn.partId)` is correct
and stays; the comment above it now says why it is the one lookup in this room
that may be made on a uuid — `readiness` is memoized from the same render's
`parts`, so a blocker never outlives the render that filed it. Nothing else
changed.

---

## Gates (tails, verbatim)

**`pnpm --filter @patina/designer-portal type-check`**
```
> @patina/designer-portal@0.1.0 type-check
> tsc --noEmit
```
exit 0, no output.

**`pnpm --filter @patina/designer-portal test -- src/components/document/rooms/drafting/agreement`**
```
Test Suites: 20 passed, 20 total
Tests:       348 passed, 348 total
Snapshots:   0 total
Time:        8.279 s
```
(Round 2 baseline for this path was 343.)

**`pnpm --filter @patina/designer-portal test`** — the FULL suite
```
Test Suites: 569 passed, 569 total
Tests:       7125 passed, 7125 total
Snapshots:   1 passed, 1 total
Time:        31.334 s
Ran all test suites.
```
Round 2 baseline 569 / 7120 → **+5 tests, no new suite, no red.**

**`npx eslint` on the three touched files** — no output, `ESLINT EXIT=0`.

**`npx prettier --check`** on the three touched files —
`All matched files use Prettier code style!` (the library-on test was
prettier-clean at `b2321da62` and was re-formatted after editing, so no
unrelated churn).

No e2e run in this lane — integration 3 re-runs them.
