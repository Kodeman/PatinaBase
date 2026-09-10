# Rulings — the Agreement Room (Kody, September 2026)

The deck's sheet 17 asks these questions and carries the panel's lean; the Ruling column stays blank until Kody rules.

| No. | Question | Panel's lean | Ruling |
|---|---|---|---|
| AR-a | Which direction ships. | Ship D, keeping A as the live alternative. | |
| AR-b | The rename of the return act, and whether the "composed elsewhere" sentence moves with it. | Rename it, and move both strings in one change. | |
| AR-c | "Fields on paper" into the house sheet as a new §A14. | Adopt it as pasted in the build contract. | |
| AR-d | Does the Preview act survive? | Retire it in D and A for a full read of the paper. | |
| AR-e | Hide-a-part outside the turnkey lane. | No recommendation — IA-32 and LH-15 ask only that the act live with the other part acts; neither proposes extending it. | |
| AR-f | D's 1200 band exceeds the house sheet's 1100 page measure, which governs a client page. | Name a studio working band at 1200, prose still capped at 65ch. | |
| AR-g | The paper never adds to one total: a design-services homeowner sees a ceiling, a retainer and a flat fee, each alone. | Of the two options the synthesis offers, say plainly none exists yet. | |
| AR-h | D's fold act needs a word. The specimen shows "Write" on the part heads; the build contract pins no string, and "Write this part" is A's. | The panel leans to "Write" as the shortest word that is not A's — but no source pins it, so this is an ask, not a recommendation. | |
| AM-1 | Rename `Return to the seven facets` (ED-50, IA-17, LH-28). R24 fixes that the act exists, not what it is called, and it is the last of that vocabulary on the studio's face. | The compliant version built: label unchanged, verbatim, in the quietest tier at the outline's/page's foot, with a consequence sentence and a press-and-hold confirm. | |
| AM-2 | Permit `.t-authorship` (the authorship italic) as a part heading (TY-8); the shipped editor and the shipped paper both print one today. | The compliant version built: every part head roman at `.t-d3`, one head per part, never two. | |
| AM-3 | Step the page title down below 480px (TY-25); the house sheet has no responsive steps. | The compliant version built: the h1 holds `.t-d2` at every width — the ask was filed against an email title, which the header reduction retires. | |

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
- How AM-1–AM-3, once ruled, amend `docs/design/house-sheet/SPEC.md`/`DECISIONS.md` in writing — this program only builds the compliant version pending that amendment.
- N-1's fork: whether the designer and client body renderers ever become one component, or stay two kept in sync by the shared-sentence rule.
