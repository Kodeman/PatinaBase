# 02b · Fix log — document review (round 1b)

Every DR-01…DR-50 dispositioned. Applied in the same pass as `01b`, so line references in
`02-document-review.md` no longer resolve; the change is described instead.

Gates after this round: `check-fixture.mjs` exit 0 (65/65) · `check-prose.mjs` exit 0 (628/900,
every section under cap). Files touched: `proposal.html`, `README.md`, `source/proposal.md`.

| id | sev | disposition | what changed |
|---|---|---|---|
| DR-01 | blocker | applied | The drift example is inverted as ruled: the **designer** preview says "What you will receive" `service-agreement-preview.tsx:100`; the **client** shell says "Deliverables" `commercial-document-shell.tsx:203`. Both cites are in the cell. |
| DR-02 | blocker | applied | M5 now renders M1's exact eleven parts in M1's exact order: Services · What you will receive · Not included · How design time is billed · Ceiling · Furnishings deposit · Retainer · Billing cadence · Change orders · Termination · Terms. Cadence and the deposit are their own typed parts, not sentences inside Terms (annotation 4 says so). Termination is Termination on both. The attachment leaf is *not* claimed as part of the correspondence — the figcaption says it is absent from M1's rail because jurisdiction notices are Wave 3. |
| DR-03 | major | applied | M6's rail drops the separate `Schedule of values` part (now **Parts · 9**) and carries "The schedule of values is carried by Pricing basis, not by a part of its own." |
| DR-04 | major | applied | The `Projects into proposal_service_terms.retainer_cents` row is deleted; the subhead reads "Money · must be filled in · the client sees this"; the activation select shows "when the retainer is paid". A new M1 annotation says the mechanism lives in §4's table, not in the designer's face. Every mockhead in M3, M6 and M8 that read `schedule · variant …` now reads "Money part · …". |
| DR-05 | major | applied | M0's readiness list is the thirteen production strings verbatim, unmet ones first, headed "3 of 13 checks unmet" with a `▪ unmet · ▫ met` legend (also DR-30). The figcaption says every string in the rail is the production string. |
| DR-06 | major | applied | Both "32-word" claims removed. §13 and M7 now say "the standing disclaimer" / "the wording recommended in 03 §5" — no checkable count is left uncheckable. |
| DR-07 | major | applied | §3's e-sign note is a plain counted `<p>`, inside the existing 60-word cap (§3 is 57/60). The lede was shortened to pay for it; the enumeration of the floor's elements and the press-and-hold hedge moved into a caption, which is what a caption is for. The other named dodges are all promoted or justified — see DR-25 and EV-67 in `01b`. |
| DR-08 | major | applied | Opening sentences added to §4 ("The proposal is one sentence long…what that costs in schema is set out below, honestly"), §5 ("A studio keeps its own shelf…"), §8 ("A studio holding trades signs two different documents, and Patina has neither"), §12 ("Each of these is a recommendation, not a decision"), §13 ("Two of these are closed by an earlier ruling"). Prose rose 421 → 628 of 900. §14 and §10 keep list-shaped bodies by design. |
| DR-09 | major | applied | Ceiling now carries the required dot in M1's rail (consistent with D-2's amended R4); the right-rail heading is **Satisfied** and the items are `Ceiling · $24,000` / `Retainer · $5,000`; the "remove the part and the check goes with it" sentence moved into annotation 3. |
| DR-10 | major | applied | The promise is fixed rather than the figure: §2's line now reads "§4 adds the parts layer to this chain" and links to `#model`, which is true of D1. |
| DR-11 | major | applied | The matrix was rebuilt: `scope="col"` on every header with `<abbr title>` carrying the full part name, `<th scope="row">` on each variant, every data cell `<span aria-hidden>glyph</span><span class="sr-only">standard\|sometimes\|not applicable</span>`, a `<caption class="sr-only">`, and the legend moved **above** the scroller. A `.sr-only` utility was added to the stylesheet. Still inside `.mockscroll`. |
| DR-12 | major | applied | M8's subhead → "the Okonkwo house · changes one part". |
| DR-13 | minor | applied | "The counter is 7 minus the unmet checks, ignoring the missing-client one and clamped at zero `:192-195, :269`." |
| DR-14 | minor | applied | `licence`→`license`, `licences`→`licenses`, `labour`→`labor`, `labelled`→`labeled`. Zero British spellings remain. |
| DR-15 | minor | applied | All 26 in-section `<h4>` promoted to `<h3 class="mono-head">`; the CSS rule is now `h4,h3.mono-head{…}` so presentation is byte-identical. `.wave` and `.qgroup` selectors updated. Zero `<h4>` remain; the outline is h2 → h3 throughout. |
| DR-16 | minor | applied | `scope="col"` on every `<thead>` header cell in the document (verified: no `<th>` without `scope` outside the `sr-only` head). First cells converted to `<th scope="row">` on the ask table, rigidity ledger, ASID map, fee models, six kinds, variants, projection rule, readiness, two-objects, seeded templates, act table, three-surfaces, record-keeps, trade-scope evidence, eight essentials, contract structures, turnkey template, licensing, both ledgers, rulings and the panel tables. `tbody th{…}` keeps the body register so nothing looks different. |
| DR-17 | minor | applied | The Wisconsin notice renders in `.dtx` (Newsreader 15px, `--body`) inside the leaf; `.caption` is left for the provenance/gating line. Conspicuousness is named as part of counsel's R11 review. |
| DR-18 | minor | applied | M3 now quotes the client's actual sentence: "Furniture and materials are billed at our cost plus 30%. You will see both the cost and the markup on every invoice." |
| DR-19 | minor | declined | The fix is a change to `source/check-prose.mjs`, which this round is not authorized to edit. The attribute value (900) equals the script's default, so no gate behaviour differs today. Logged for a later round together with EV-38. |
| DR-20 | minor | applied | All six moved out of the chrome. M4's panel headers are plain `Billing` / `Templates` / `Parts` / `Defaults`; the deployed-and-unchanged note, the `P3` marker and the dashed-button note are annotations 2–3. M1's "present, so checked" sentence moved to annotation 3. M6's `Gate` → `Licensing`. |
| DR-21 | minor | applied | M4 is three columns at ≥860px (Billing · Templates · Parts) with Defaults inside the Parts panel and the save action in the Templates panel's own footer, so the two objects read as two objects. |
| DR-22 | minor | applied | The flow strip has `→` separators at ≥900px and `↓` below, and station 03 carries an `isnew` treatment (clay top rule, mocha border) plus the label "03 · new". |
| DR-23 | minor | applied | The two `←` glyphs are removed from inside the boxes so nothing points the wrong way when the columns stack, and the caption now says "Three **relations** carry the whole model", naming why a three-column box grid cannot draw the other two honestly. |
| DR-24 | minor | applied | §13 opens by saying two items are closed and the rest are recommendations; amend-in-place, the general contract builder and verifying licenses each name the ruling that owns them (R6, R7, R10). |
| DR-25 | minor | applied | §12 opens with "Each of these is a recommendation, not a decision. The owner column names who rules; disagreement is the useful response." |
| DR-26 | minor | applied | M8's mock-cap carries `illustrative`, an annotation says the $28,000 is drawn, and §9's closing caption enumerates all four drawn figures (M3's three per-phase fees, M3's 30%, M8's ceiling). |
| DR-27 | minor | applied | A sixth **Massachusetts** row was added, marked `not confirmed — mass.gov returned 403 on re-fetch`; the table is retitled "Licensing in six states". P11 carries the same flag. |
| DR-28 | minor | applied | Appendix B gains a leading caption defining the `27/197` notation as ASID's own product-page path segments and saying the list is deduplicated hostnames, plus a linked list of the ten sources the body rests on as real `<a href>` URLs. Lane 02's fifteen missing hostnames (buildingadvisor, angi, constructioncoverage, markupandprofit, hollingtonlawfirm, boomandbucket, zigaflow, eb3construction, docutrax, lukesfurniturecompany, woodweb) were added (also EV-20). |
| DR-29 | minor | applied | `.chip.on::before` renders `✓` and `.chip.off::before` a hollow `○`, so selection is not colour-only; M1's credit-rule chips use them. M6's header chips drop `.on` entirely — nothing there is selectable. |
| DR-30 | minor | applied | See DR-05: heading is "3 of 13 checks unmet" with an explicit two-item legend. |
| DR-31 | minor | applied | "Hand-written sections in a fixed order — five headings `:92, :100, :116, :126, :205` over the seven facets." |
| DR-32 | minor | applied | M4's Billing card reads `Card fee (%) 3.0` and `Check remit-to · Make checks payable to Middle West Studio LLC, 118 S Bedford St, Madison WI 53703`, cited to `account-studio-page.tsx:813, :821`. |
| DR-33 | nit | applied | The masthead names Middle West Studio as the team addressed and says "The mockups draw their studio by name"; §9's lede is now "The houses and the clients are invented; the studio name is Leah's own, and the arithmetic is checked" — the stray "makers" is gone. |
| DR-34 | nit | applied | `.rowend` carries the shared row-end behaviour; `.hoveract` is now a modifier that adds the italic hover semantics and is used only for M1's `⋯ Remove · Rename · Move`. |
| DR-35 | nit | applied | The dead `mockgrid mg-2` wrapper in M3 is deleted; `.cols.cols-3` stands alone. |
| DR-36 | nit | applied | The `&nbsp;` filler is a real `→`, and the fourth box now states the true relation ("design time is authorized against this · 00414:911-913" — also EV-04). |
| DR-37 | nit | applied | Section cross-references are anchors (`#turnkey`, `#proposals`, `#model`, `#fixture`, `#waves`, `#today`, `#rulings`); `id="r1"…"r16"` were added to the ruling number cells and every in-body ruling reference links to them. |
| DR-38 | nit | applied | The index shows `—` for the appendix and the eyebrow reads "Appendix" rather than "Fifteen"; the heading is now "Citations, sources, panel, vision test". |
| DR-39 | nit | applied | The column sketch is `<pre class="sketch no-prose"><code>…</code></pre>` with the CSS rebound to `pre.sketch`. |
| DR-40 | nit | applied | M2's blank money row reads `Money` with the dropdown showing `Flat · Per phase · Rate card · Retainer · Ceiling · Deposit …`. The word "variant" no longer appears in any mockup. |
| DR-41 | nit | applied | Lowercase `patina` and `studio` in both M2 and M4. |
| DR-42 | nit | applied (no defect) | The `#` column is kept as an improvement and each cell now carries `id="rig1"…"rig12"`, so Appendix A's back-references resolve. The spine's amendment note records the deliberate deviation. |
| DR-43 | nit | applied | §0 line 5: "Wave 1 loosens today's room: one migration, and the client's copy does not change." |
| DR-44 | nit | applied | A `.val` class (mono, faint, wrapping, no tabular-nums) replaces `.num` on `Middle West Studio`, `design services` and `monthly`. |
| DR-45 | nit | applied | M5's rate table gains `<thead class="sr-only"><tr><th scope="col">Role</th><th scope="col">Hourly rate</th></tr></thead>`. |
| DR-46 | nit | applied | §5's lede: "Both sit on the one template table already scoped to a studio rather than a person." No verdict on prior decisions; Constraint 6 carries the evidence. |
| DR-47 | minor | declined, noted | The proposed fix (`body` back to `visible`, `.shell{overflow-x:clip}`) cannot be verified here — Chromium will not launch under the sandbox, and the reviewer's own confidence is low. `overflow-x:hidden` on `body` is inherited verbatim from the published house precedent, whose sticky index is known to work in production, so changing it blind risks a regression the gates cannot catch. **Left as-is and flagged for the render check at ≥1100px.** |
| DR-48 | nit | applied | `.annlist li::before` is 12px in a 1.35rem circle with matching line-height. |
| DR-49 | minor | applied | M5's figcaption now claims only the typography ("the Threshold's own typography") and adds that the part titles are *proposed* and differ from today's shell — the drift §2 names. |
| DR-50 | nit | declined | No change required by the reviewer's own finding, and "Zero" is the better mark for a prefatory summary. Recorded so the orchestrator can set the house convention; the precedent is the file that should move. |

## Not applied, in one place

- **DR-19** — needs a `check-prose.mjs` edit; out of scope this round, no behavioural difference today.
- **DR-47** — needs a real browser at ≥1100px; left unchanged and flagged for the render check.
- **DR-50** — register note only; the reviewer proposes no change to this document.

## Round 2 layout fix

The gate (`render-check.mjs`) reported real `document.documentElement.scrollWidth` overflow at
390/760/1280 (up to 1044px) in all three theme conditions, naming `table.tight.min1080` as the
offender. That table is genuinely inside a `.mockscroll` (`overflow-x:auto`) wrapper at both of
its two call sites (§3 "Which contract parts…" and §5's money-terms table) — the gate's own
offender heuristic (largest `getBoundingClientRect().right`, no containment check) is misleading
there; a large right edge inside a horizontally-scrollable box is expected and harmless.

A purpose-built diagnostic (Playwright, same fragment-wrapper as `render-check.mjs`) was used to
walk every element whose right edge exceeds the viewport, then bisect which ones actually
contribute to `document.documentElement.scrollWidth` versus which are properly clipped by a
containing scroll wrapper. Two distinct, unrelated root causes were found:

1. **`.sr-only` accessibility spans escaping their scroll container's clip.** The two wide
   variant/money tables carry per-cell `<span class="sr-only">standard</span>`-style text for
   screen readers (`.sr-only{position:absolute; …}`). Neither `.mockscroll` nor `.tablewrap`
   (their `overflow-x:auto` wrappers) declared a `position`, so those absolutely-positioned spans
   had no positioned ancestor and their containing block escaped all the way to the initial
   containing block (the viewport). Their static position placed them at the table's *logical*
   (unscrolled) x-coordinate — hundreds of pixels past the visible, scroll-clipped table — which is
   exactly what was inflating `document.documentElement.scrollWidth` (bisection confirmed: hiding
   `.sr-only` alone, or hiding the tables, or hiding `.mockscroll`, each independently fixed the
   overflow; nothing else did). Fix: added `position:relative;` to `.mockscroll` and `.tablewrap`
   so they become the containing block for these descendants, keeping them inside the properly
   clipped, already-scrollable box. Pure CSS, no markup or content change.

2. **M2 ("Add a part") dropdown-mock text inheriting `nowrap` from its row wrapper.** The blank
   "Money" row's `<span class="selectmock">Flat · Per phase · Rate card · Retainer · Ceiling ·
   Deposit …</span>` sits inside `<span class="rowend">`, and `.partlist .rowend{white-space:nowrap;}`
   was inherited by `.selectmock` (which never set its own `white-space`), forcing that ~34-character
   string onto one unbreakable line (479px) inside a 344px-wide column at 390px and a similar
   overflow at 1280px. This was genuine, unclipped overflow inside `figure.mock` (no `.mockscroll`
   involved), matching the gate's separate `figures-sized-and-not-clipped` finding for
   `figure.mock:nth-of-type(3)`. Fix: added `white-space:normal;` to the `.selectmock` rule itself
   (checked the other three `.selectmock` usages — none relied on `nowrap`, so this is a safe,
   general fix rather than a scoped override).

CSS changes (both existing rules, no new selectors, no markup/content changes):

```css
.tablewrap{overflow-x:auto;position:relative;margin:1.4rem 0;border-top:1.5px solid var(--ink);border-bottom:1px solid var(--rule-2);}
.mockscroll{overflow-x:auto;position:relative;}
.selectmock{
  display:inline-block;border:1px solid var(--rule-2);background:var(--paper-inset);border-radius:2px;
  padding:.26rem 1.4rem .26rem .5rem;font-family:var(--font-mono);font-size:12px;color:var(--ink);
  position:relative;white-space:normal;
}
```

Result: `render-check.mjs` now reports 63/63 pass (was 63 total checks, previously failing
`no-horizontal-overflow` at every viewport/theme combination). `check-fixture.mjs` and
`check-prose.mjs` both still pass unchanged — no words, figures, table content, ids, or section
structure were touched, confirming this was a pure layout defect.

This also resolves **DR-47** above: with the real root cause fixed, `body{overflow-x:hidden}` no
longer needs to be revisited — it was never the problem; the leak was the two issues above.
