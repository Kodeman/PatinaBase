# L3 — Door acts · verification re-review (fix round)

Reviewer: fresh context, wrote neither the lane nor the first review. Branch `client-page-2/l3`
@ `3f7f21896` ("fix(client): l3 — the door withholds the acts it cannot honour, and hears the answer
it took"), worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l3` (read-only; no
file in it was written by this review).

Fix-round diff `301b62e2b..3f7f21896`: 10 files, +589/−64 — 5 components, 4 test files, the impl doc.
Nothing outside the lane's own paths was touched; the only shared-file edit is still
`threshold.tsx` (+3 lines, one field).

## Gate output (run by the reviewer, verbatim tails)

`pnpm --dir …/apps/client-portal type-check`
```
> @patina/client-portal@0.1.0 type-check /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l3/apps/client-portal
> tsc --noEmit
```
(no diagnostics; the workspace dists were already built in this worktree — no pre-build needed)

`pnpm --dir …/apps/client-portal test -- threshold making`
```
Test Suites: 32 passed, 32 total
Tests:       603 passed, 603 total
Snapshots:   0 total
Time:        10.467 s
Ran all test suites matching /threshold|making/i.
```

`npx eslint src/components/threshold` (from `apps/client-portal`) → `exit=0`, no output.

Both gates reproduce the fix round's reported result exactly (588 → 603, +15 cases). No sandbox
retry was needed. Coverage thresholds and any browser/e2e pass remain out of this lane's gate.

---

## Prior blockers and majors — confirmed against the diff

The first review recorded **0 blockers**, so there is nothing in that class to re-confirm. All six
majors below, plus the fifteen minors and nits, were checked in the code rather than in the report.

| # | Sev | Claim | Verdict |
|---|---|---|---|
| 1 | major | unresolved kind read as legacy | **FIXED** |
| 2 | major | signature block stays armed after a decline | **FIXED** |
| 3 | major | "Read it in full" unfolds onto nothing | **FIXED** |
| 4 | major | focus dropped when a panel closes | **PARTIALLY FIXED** — see N2 |
| 5 | major | legacy reader / per-line feedback not absorbed | **RULING recorded**, not code |
| 6 | major | expiry gate lost | **FIXED** — but see N3 |

### 1 · major — FIXED
`door-gate.tsx:154-158` now resolves `resolvedKind: CommercialDocumentKind | null` and keeps the
`?? 'legacy'` fallback only for the copy (`kind`, line 158). `door-acts.tsx:77` types the prop
`CommercialDocumentKind | null`; `door-acts.tsx:221` (`answerable && kind`) withholds **Decline**
while it is null, and `door-acts.tsx:216` (`kind && !isLegacy`) withholds **Read it in full** too.
`isLegacy` (line 117) is now a positive `kind === 'legacy'`, so nothing can take the legacy rail and
skip `POST /api/proposals/[id]/decline`'s fail-closed resolution. Witnessed at
`door-acts.test.tsx:243-252` and `door-gate.test.tsx:330-335`.

### 2 · major — FIXED
`door-gate.tsx:541` passes `onDeclined={() => setDeclined(true)}`; the flag (declared :128) reaches
every part of the block that was reversing itself — header line `Shut. You declined it.`
(:311-313), consent checkbox `disabled` (:462), name field `disabled` (:481), `ready` false so the
Sign act disarms (:176 → :487 `disabled={!ready}`), and the hint reads
`You declined this paper. Your studio has been told.` (:504-505). Witnessed at
`door-gate.test.tsx:346-357`, which asserts all five. Finding **#14** (dead `onDeclined` surface)
falls with it.

### 3 · major — FIXED
`instrument-reading.tsx:44` folds `!bundle.data` into the refusal branch
(`This paper could not be drawn just now. Reload to try again.`, `role="alert"`), and the legacy row
gets its own quiet line at :52-61. No branch of `InstrumentReading` now returns `null`, so no unfold
in the door or in Previously can open `aria-expanded="true"` on an empty region. Witnessed at
`instrument-reading.test.tsx:97-121` (both branches now assert sentences, replacing the two
`toBeEmptyDOMElement()` cases). See **N5** for a copy reservation on the null case.

### 4 · major — PARTIALLY FIXED
The wiring is right: `openerRef` (`door-acts.tsx:110`) is parked in `toggle()` from
`event.currentTarget` (:123) and handed to both the confirm and the "Never mind" act of every panel
(:288, :310, :337 → `Panel` :431, :441), which is exactly what `ScoredAction`'s
`restoreFocus` (`scored-action.tsx:95-98`, rAF + `.focus()`, run in the click handler's `finally`)
exists for. It closes the "Never mind" path and the ask/change success paths.

It does **not** close the decline-success path — the one the review named first. See **N2**.

### 5 · major — RULING recorded, not absorbed
`l3-impl.md:183-192` records it as the review offered: *when `/proposals/[id]` is retired, legacy
proposals and per-line feedback go with it*, with an explicit reversal condition if the studio still
holds live legacy papers at cutover. Confirmed in code that the premise holds —
`threshold.tsx:294` and `:312` both drop `commercial.kind === 'legacy'`, from `signatureGates` and
`instrumentReceipts` respectively. **Still owed: plan-level acceptance.** A lane cannot close this.

### 6 · major — FIXED
`door-acts.tsx:60-64` is the old page's date arithmetic verbatim — compare `page.tsx:124-129`:
falsy → not expired, `NaN` → not expired, `< Date.now()` → expired. `expired` (:118) feeds
`answerable` (:214), which withholds **Ask / Request a change / Decline** (:217-221). The date
reaches it through `DoorProposal.validUntil` (`door-gate.tsx:79-84`), filled from the row at
`threshold.tsx:305` and passed at `door-gate.tsx:538`. The old page's extra `!isSigned &&
!isExpiredStatus` conditions are moot here: `signatureGates` is built only from
`partitionProposals().pending`, and a signed paper unmounts the acts (`door-gate.tsx:536`).
**Read it in full** deliberately survives expiry, which matches the old route (it printed the
document for an expired proposal too). Witnessed at `door-acts.test.tsx:262-277` and
`door-gate.test.tsx:337-344`. The knock-on inconsistency with the sign block is **N3**.

### Minors and nits — all confirmed fixed

| # | Where | Confirmed |
|---|---|---|
| 7 | `door-acts.tsx:217-219` | `'question'` drops out of `acts` when `projectId` is null; test rewritten (`door-acts.test.tsx:236-241`) |
| 8 | `door-acts.tsx:113-115` + `:132/:143/:157`, `:169/:178`, `:183/:186/:207` | three refs, set before the await, cleared in `finally`; double-click case at `door-acts.test.tsx:295-312` |
| 9 | `door-acts.tsx:127`, `:195` | `toggle()` and `onDecline` both clear `receipt`; case at `:314-323` |
| 10 | `previously.tsx:87-89`, `:141-147` | `truncated` hoisted, the full label printed above the reading; case at `previously.test.tsx:134-152` |
| 11 | `door-acts.tsx:252` | `role="status"` on `door-declined`; case at `:325-332` |
| 12 | four test files | +15 cases; the six named behaviours are all present (see gap note below) |
| 13 | `door-acts.tsx:146-150` | `About <title>\n\n<question>`, bare question when the title is empty; case at `:132-141`. Copy ruling still owed with L4 |
| 14 | — | resolved by #2 |
| 15 | `l3-impl.md:239-245` | recorded as a plan-level ruling. **Still owed: plan-level acceptance** |
| 16 | `l3-impl.md:248-253` | the byte-copy claim is corrected in the report; the ellipsis exception is named |
| 17 | `door-acts.tsx:335`, `:361`, `:382`, `:429` | `confirmVariant="danger"`, defaulting to `secondary`; asserted at `:356` |
| 18 | `door-acts.tsx:392` | the panel title is an `<h3>`; asserted at `:259` |
| 19 | `door-acts.tsx:226`, `:241`, `:269` | one panel id per act, `aria-controls` absent while collapsed — **but this is what introduces N1** |
| 20 | `l3-impl.md:263-266` | print recorded as retired for proposals |
| 21 | `previously.tsx:87` | `entry.id.replace(/:/g, '-')` in the id only |

**Coverage gap in #12's answer**: the new `aria-controls` case (`door-acts.test.tsx:345-357`)
exercises only the **Decline** act, which is the one act whose panel id cannot collide with its own
field id. Had it used the ask, N1 would have failed the suite.

---

## NEW defects introduced by the fix round

**N1 · major · high confidence · `apps/client-portal/src/components/threshold/door-acts.tsx:226`
(with `:269` and `:277`) — the ask panel now renders two elements with the same DOM id.**
`panelIdFor(key)` is `` `${panelId}-${key}` ``, so with the ask open the panel region is
`id="door-acts-Rxx-question"` (`:269`). The question textarea's `fieldId` is
`` `${panelId}-question` `` (`:277`) — byte-identical. `Panel` then renders
`<label htmlFor="door-acts-Rxx-question">` (`:399`) and `<textarea id="door-acts-Rxx-question">`
(`:404`) inside that very div. Two elements, one id: the label and any id lookup resolve to the
**wrapper div** (first in tree order, being the textarea's ancestor), so "Your question" stops
naming the textarea in the accessibility tree and the document is invalid HTML. Introduced by the
fix for nit #19 — before it, the region id was the bare `panelId` and no field collided. `change`
(`-change` vs `-feedback`) and `decline` (`-decline` vs `-reason`) are safe by accident of naming;
the ask is the one act this lane invented. *Fix:* namespace one of the two, e.g.
`` panelIdFor = (key) => `${panelId}-panel-${key}` ``, and add the assertion to the ask act.

**N2 · minor · high confidence · `door-acts.tsx:214` with `scored-action.tsx:95-98` — focus is still
dropped on the one path that matters most, so #4 is not fully closed.** A successful decline sets
`declinedAt` (`:196`), which makes `answerable` false (`:214`) and removes the **Decline** act from
`acts` (`:221`). React flushes that before `ScoredAction`'s `finally` runs `restoreFocus`, so
`openerRef.current` is a detached button and `.focus()` on a detached node is a no-op — the keyboard
lands on `<body>`, exactly the behaviour #4 was raised about. The ask and change paths are fine
(their acts survive the send) and so is "Never mind". Not caught, because #4 has no test by the
lane's own admission (`l3-impl.md:317-320`). *Fix:* restore to something that survives the act —
the acts row container with `tabIndex={-1}`, or the `role="status"` stamp — on the decline path.

**N3 · minor · medium confidence · `door-acts.tsx:214-222` vs `door-gate.tsx:176`, `:487`, `:504` —
an expired paper now withholds three acts while the signature block above them stays fully armed.**
The old page held every act back together under one `isActionable` (`page.tsx:131`). After fix #6,
a paper past `valid_until` shows the acts row withdraw Ask / Request a change / Decline while the
block six lines up still says `Ready when you are.` and offers an enabled Sign — which
`/api/proposals/[id]/sign` will refuse on the same date the acts just honoured. That is the same
class of thing #2 fixed (a page offering an answer it cannot take), created on the other side of the
leaf by fix #6. The sign path itself was never expiry-gated on the door, so the exposure is not new;
the visible contradiction is. *Fix:* carry `expired` into `ready` and the hint, or record a ruling
that the door deliberately lets a client sign past the date and the acts should not have been gated
either.

**N4 · nit · high confidence · `door-acts.tsx:153` vs `:174` — the two receipts disagree on
punctuation.** `Your question was sent.` (full stop, new copy) sits beside `Your note was sent` (no
stop, byte-copied from `ProposalRequestChangeDialog`'s toast). They render in the same slot, one
after the other, in the same type. *Fix:* pick one; the house's other one-line receipts take the
stop.

**N5 · nit · medium confidence · `instrument-reading.tsx:41-49` — a legitimately empty read is now
printed in error ink and told to reload.** `clientCommercialDocumentQueryOptions`
(`use-commercial-client.ts:43-51`) resolves to `adaptCommercialDocumentBundle(data)`, which is
`null` when the RPC returns nothing for this client — not an error, and not something a reload
changes. Folding it into `bundle.isError` was what #3 asked for, but the sentence it inherits
(`Reload to try again.`) makes a promise the null case cannot keep. *Fix:* give the null case its
own quieter line, e.g. the wording the legacy branch already uses at `:52-61`.

**N6 · nit · medium confidence · `previously.tsx:89` — every instrument line is now a control,
including ones whose unfold can only refuse.** `foldable = truncated || proposalId !== null` makes
the whole receipt list foldable; combined with N5, an unfold can open on a red alert. Acceptable as
built (an offer that says why is better than one that opens on nothing), but it is the reason N5 is
worth a quieter sentence.

### Not defects, recorded so integration does not re-litigate them

- The `!projectId` guard in `onAsk` (`door-acts.tsx:139-142`) and the legacy branch in
  `instrument-reading.tsx:52-61` are both now unreachable by clicking. Deliberate, stated at
  `l3-impl.md:202-204`; they are type narrowing and belt-and-braces, and cost nothing.
- `hasPassed` reads `Date.now()` at render (`door-acts.tsx:63`), so a door left open across the
  boundary withdraws its acts only on the next render. The old page had the same property; the lane
  says so at `l3-impl.md:321-322`.
- `resolvedKind` is never actually null from the Threshold — `threshold.tsx:301` always sets
  `kind: commercial.kind`. Fix #1 is defensive depth, not a live path. Correct to have it.
- Shared-file discipline holds: `threshold.tsx` gains one field (`:305`), `door-gate.tsx` stays
  inside the signature block and the `DoorActs` call, `previously.tsx` inside the one map body.
  The expected merge conflict with L4 in `previously.tsx` is unchanged.

### Still owed before integration closes

- Plan-level acceptance of rulings **#5** (legacy papers + per-line feedback retired with the route)
  and **#15** (archived papers must land somewhere before `/proposals` is retired). Both are
  recorded, neither is decided.
- The **#13** copy ruling (`About <title>` prefix) confirmed against L4's letters.
- One keyboard pass in the browser for #4/N2, and a phone-width look at the reading laid into the
  leaf — both still on the lane's own "not verified" list.

---

VERDICT: MERGEABLE_WITH_FIXES — of the prior 6 majors, 4 are fixed in code, 1 is fixed with a
remaining gap (#4 → N2) and 1 is a recorded ruling awaiting the plan (#5); all 15 minors and nits
are fixed. 6 new defects (0 blockers, 1 major, 2 minor, 3 nit): fix **N1** before integration, take
**N2** and **N3** at integration, and get the two rulings decided.
