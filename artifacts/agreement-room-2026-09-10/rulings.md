# Rulings — the Agreement Room (Kody, 10 September 2026)

The deck's sheet 17 asked these questions and carried the panel's lean; the Ruling column below is Kody's, taken by interview on 10 September 2026. `(rec)` marks a ruling that took the panel's lean.

| No. | Question | Panel's lean | Ruling |
|---|---|---|---|
| AR-a | Which direction ships. | Ship D, keeping A as the live alternative. | **Ship D · the galley. (rec)** A is the live alternative on record — the alternative, not a fallback rule. |
| AR-b | The rename of the return act, and whether the "composed elsewhere" sentence moves with it. | Rename it, and move both strings in one change. | **REVERSED — removed.** Kody: *"I go back on this. Lets remove this concept all together. We have the parts, the templates and saved states that cover all this."* The return act is removed and the seven-facet room retired, so there is nothing left to rename; `composedElsewhere` goes with it. This reverses **R24** (`artifacts/agreement-composed-2026-09-06/build/rulings-2026-09-06.md`) and retires the **R17** flag-off notice. |
| AR-c | "Fields on paper" into the house sheet as a new §A14. | Adopt it as pasted in the build contract. | **Adopt as house sheet §A14. (rec)** Verbatim as pasted in `specimens/SPEC.md` §2. |
| AR-d | Does the Preview act survive? | Retire it in D and A for a full read of the paper. | **Retire "Preview client copy" in D and in A. (rec)** A full read at the paper's own measure replaces it — an overlay, never a route. |
| AR-e | Hide-a-part outside the turnkey lane. | No recommendation — IA-32 and LH-15 ask only that the act live with the other part acts; neither proposes extending it. | **The hide act is on every agreement (rec)**, beside the other part acts. **R33 stands** — a hidden fee never bills, and readiness names it. **R48 stands** — pricing basis and draws are never hidden. |
| AR-f | D's 1200 band exceeds the house sheet's 1100 page measure, which governs a client page. | Name a studio working band at 1200, prose still capped at 65ch. | **Name a studio working band at 1200px in the house sheet. (rec)** Prose stays capped at 65ch; 1100 remains the client-page measure. |
| AR-g | The paper never adds to one total: a design-services homeowner sees a ceiling, a retainer and a flat fee, each alone. | Of the two options the synthesis offers, say plainly none exists yet. | **The paper says plainly that no total exists. (rec)** One sentence: professional time is billed as worked up to the ceiling, and no total is promised. No arithmetic. |
| AR-h | D's fold act needs a word. The specimen shows "Write" on the part heads; the build contract pins no string, and "Write this part" is A's. | The panel leans to "Write" as the shortest word that is not A's — but no source pins it, so this is an ask, not a recommendation. | **The word is "Write". (rec)** |
| AM-1 | Rename `Return to the seven facets` (ED-50, IA-17, LH-28). R24 fixes that the act exists, not what it is called, and it is the last of that vocabulary on the studio's face. | The compliant version built: label unchanged, verbatim, in the quietest tier at the outline's/page's foot, with a consequence sentence and a press-and-hold confirm. | **REVERSED — removed.** Kody: *"I go back on this. Lets remove this concept all together. We have the parts, the templates and saved states that cover all this."* The return act is deleted, not renamed, and the seven-facet room is retired with it. |
| AM-2 | Permit `.t-authorship` (the authorship italic) as a part heading (TY-8); the shipped editor and the shipped paper both print one today. | The compliant version built: every part head roman at `.t-d3`, one head per part, never two. | **Declined. (rec)** Part heads stay roman at `.t-d3`, one per part; `.t-authorship` is never a heading. |
| AM-3 | Step the page title down below 480px (TY-25); the house sheet has no responsive steps. | The compliant version built: the h1 holds `.t-d2` at every width — the ask was filed against an email title, which the header reduction retires. | **Declined. (rec)** The h1 holds `.t-d2` at every width; the sheet gains no responsive step. |
| AR-i | The "Estimate to quote" widget (ROM estimate · Quote ready · Issued) floating over the drafting route. | Not asked by the panel; found overlapping the paper. | **Removed entirely (Kody, 10 September 2026).** Its hours value was write-only — nothing read it — and its middle step was unreachable on a composed agreement. |

## Consequences for the build wave

- **Retire `ServiceAgreementEditor`** — the seven-facet room in `apps/designer-portal/src/components/document/rooms/drafting/service-agreement-drafting-room.tsx`. Every agreement is parts on first open, which is already what the live flags do; the flag-off path goes with the room.
- **Retire `returnedToFacets`** and the UI path to **`discard_agreement_parts`**. The RPC itself may stay for admin use — **ruling owed at build time** on the RPC.
- **Delete `AGREEMENT_PART_COPY.returnToFacets` and `.composedElsewhere`** (`packages/types/src/agreement-copy.ts`), the **`facet` count in the RoomShell header**, and the **send sheet's facet sentence** (N4 — already in the shared treatment).
- **The hide act extends to all agreements**, not the turnkey lane alone.
- **The send trigger moves onto the page at every width**, closing the 1180px gap at `room-shell.tsx:155`. Folded into this wave, not hotfixed.
- The estimate widget and its hooks are deleted (AR-i).

## Carried, not decided here

- N-1. The two body renderers (designer, client) are a fork, not a shared import — no direction may promise "the same component," only the same sentences and the same silent-part rule. (`designer :6-8` · `client :14-16`)
- N-2. The seven type steps and `.t-money` do not exist in this portal; a parallel `.type-*` scale ships instead, its smallest step rendering at 10.08px. (`typography.css:106-125`)
- N-3. `maximumScale: 1` blocks pinch-zoom portal-wide — until it goes, no 390 claim made here is testable on a phone. (`layout.tsx:37-41`)
- N-4. `doc-sheet.tsx:80` filters `aria-disabled="true"` out of the focus trap, so a held Send inside a sheet cannot be reached by Tab. Binds every direction; a defect, not a ruling.
- N-5. The turnkey room keeps design-services chrome; the rename affordance never landed and `proposals.title` has no rename RPC, so a stale title still reaches the keepsake footer. (`waves/w3/wave-report.md:173, :184`)
- N-6. The moment `disabled` becomes `aria-disabled`, the 1.20:1 label becomes a live AA failure — the `--ink-faint`-on-`--rail` pair (5.32:1) must land in the same change. (`button.tsx:29-30`)
- N-7. No per-part autosave without a projection-idempotence test: Services projects into `scope`, and `materialize_standard_parts` seeds it back from `scope`. (`00575_agreement_parts.sql:2942-2946` · `:3073`)
- N-8. Fold, open and focus state must key on `partKey`, never a uuid — the save RPC re-mints every id. A bug in three of four directions if missed. (`agreement-composer.tsx:602-618`)
- N-9. Two suites snapshot the whole composer tree — ten calls, 3,111 recorded lines. Replace with named assertions before a build wave.
- N-10. `$5,000.05` cannot be typed into the Retainer — `toCents` re-rounds every keystroke with no transient text state. (`part-kinds.ts:367-373`)
- N-11. The homeowner's words: "fully executed" is shorthand Nora would not follow, and `composedElsewhere` must never reach her copy. (`agreement-copy.ts:19-20, :54-55`)
- N-12. The keepsake-versus-portal renderer pair stands: an unset rate card prints "Recorded with your agreement." where the silent-part rule says it should print nothing. M5 (the empty first-open rail) is closed and carried only as the regression the durable fix must not reopen. (`PROGRAM-REPORT.md:221, :265, :300`)
- N-13. The count that moves with no sentence is closed by the shared readiness voice — but only for the three directions built here.
- N-14. The aged-oak meta voice fails AA: `The client's copy · live` measures 4.48:1, the meta voice 4.20:1. Carried with the viewport-meta issue at N-3. (`globals.css:13` · `agreement-composer.tsx:961-962`)
- N-15. In D and in A the marginalia do not sit line-for-line with the parts they name at 1440 — drift up to 243px — which is why every strip carries its part's name in words. (`02-fix-log-direction-1.md §4` · `02-fix-log-direction-2.md §4.8`)
- N-16. D draws the sheet in segments so the strips can sit between them, so moving a part across a segment boundary re-pairs strip to part; keyboard reorder, its announcement and its focus return are unaffected — measured 0px of inter-segment gap and 0px of reflow on revealing a move act, where it cost 44px. (`02-fix-log-direction-1.md §4`, round 2)

## What these rulings do not decide

- Which wave builds the shipped direction, or in what order against the rest of the roadmap.
- N-1's fork: whether the designer and client body renderers ever become one component, or stay two kept in sync by the shared-sentence rule.
