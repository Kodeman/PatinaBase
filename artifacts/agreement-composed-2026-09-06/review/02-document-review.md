# 02 · Document review — *The Agreement, Composed*

Adversarial review of `artifacts/agreement-composed-2026-09-06/proposal.html` (1,959 lines, 137 KB)
against its spine `source/proposal.md`, the house precedent
`artifacts/pricing-mechanics-2026-09-05/proposal.html`, and `.claude/skills/patina-brand-voice/SKILL.md`.

Reviewer did not write the document. Every finding is reported regardless of severity; the
orchestrator filters.

**Gates re-run for context (both green, so neither gate caught any of what follows):**

```
node source/check-fixture.mjs  → exit 0 · fixture math ok (65 figures) · all 65 present
node source/check-prose.mjs    → exit 0 · total 421 / 900 words, no section over cap
node review/render-check.mjs   → could not run (Chromium blocked by the sandbox)
```

Codebase claims were spot-verified against the repo at HEAD; where a claim is wrong the
verifying command is quoted in the finding.

---

## Findings

### DR-01 · The document's flagship drift example is inverted
**Severity:** blocker · **Confidence:** high
**Location:** §2 `#today`, table "Three renders of one agreement", row *Client shell*:
> Its own headings, already diverged — “What you will receive” where the designer's copy says “Deliverables”.

**Problem.** It is the other way round. `"What you will receive"` exists in exactly one place in
the repo, and it is the **designer** preview:

```
apps/designer-portal/src/components/document/commercial/service-agreement-preview.tsx:100
          <AgreementHeading>What you will receive</AgreementHeading>
```

The **client** shell says `Deliverables`:

```
apps/client-portal/src/components/commercial-document-shell.tsx:203
          <h2 className="type-section-head">Deliverables</h2>
```

This is the single concrete piece of evidence the document offers that the three renders have
drifted — the thing §2, §7 and P0 all lean on — and it names the surfaces backwards. Anyone on
the team who opens either file will stop reading at this row. It also silently propagates: M5,
the *client* door mock, uses the *designer's* strings (`What you will receive`,
`How design time is billed`).

**Fix.** Swap the attribution: *the designer preview says “What you will receive” where the
client shell says “Deliverables”.* While in there, the real divergence set is richer and worth
listing, since it strengthens the argument rather than weakening it — preview
`Services / What you will receive / Not included / How design time is billed / Agreement terms`
against shell `Services / Deliverables / Rates & design authorization / Terms / Not included`.
Then decide deliberately which wording M5 should carry, and say so in the caption.

---

### DR-02 · M5's part set is not M1's part set, but its caption says it is
**Severity:** blocker · **Confidence:** high
**Location:** §7 `#client`, `figure` M5 `<figcaption>`:
> The order is the designer's order from M1; studio-only parts never reach this page.

**Problem.** M1's rail (§4) is: Services · Deliverables · Exclusions · Role rates · **Ceiling** ·
**Retainer** · Cadence · Change orders · Termination · Terms.
M5's door is: Services · What you will receive · Not included · How design time is billed ·
**Retainer** · **Ceiling** · **Cancellation** · Terms.

Four separate contradictions:

1. Ceiling and Retainer are in the opposite order.
2. `Cadence` and `Change orders` are absent from M5 — Cadence reappears smuggled into the Terms
   body text (“Billing is **monthly**”), which is precisely the “prose carries the money”
   failure R5 forbids.
3. `Termination` (M1) has become `Cancellation` (M5) — and M2's Library lists *Cancellation* as a
   distinct studio clause, so this reads as a different part, not a rename.
4. `Attachment A · Notice of cancellation` appears on M5 but is nowhere in M1's rail.

The caption asserts a correspondence the two figures do not have. The document's central promise
— *order is the document order* (M1 annotation 1) and *a removed part is absent, not blank*
(M1 annotation 2) — is demonstrated by a pair of mockups that disagree with each other. The spine
did specify the two lists separately; the false binding claim is the builder's own addition
(the spine's M5 annotations say only “attachments are leaves” and “the record keeps the part set”).

**Fix.** Make M5 render M1's exact part list in M1's exact order, minus anything marked
studio-only, plus the attachment leaf — and show Cadence as its own part with a client-facing
title rather than a sentence inside Terms. If the two must differ, delete the caption claim and
say why they differ.

---

### DR-03 · M6 shows `Schedule of values` as its own schedule part, which §4 explicitly merged away
**Severity:** major · **Confidence:** high
**Location:** §8 `#turnkey`, M6 parts rail, `li` 2:
`<span class="kg">$</span>Schedule of values` — versus §4 `#model` caption:
> Fifteen kept. `schedule_of_values` is merged into `pricing_basis` and `retainage` into `draws`
> rather than carried as variants of their own.

**Problem.** §4 makes the merge a stated design decision; §5's `design_build` template row honours
it (`pricing_basis`, `draws` (+retainage), `allowances` — no schedule of values); §8's own
"turnkey template, part by part" table honours it (*Pricing basis … carries the schedule of
values*). M6 alone reintroduces it as a sixteenth schedule variant with a `$` kind glyph. The
retainage merge is handled correctly in the same figure (retainage lives inside the Draws part),
which makes the inconsistency look like an oversight rather than a decision.

**Fix.** Drop `Schedule of values` from M6's rail (making it *Parts · 9*), or render it as a
non-schedule sub-view of the selected `Pricing basis` part with a note that it is a projection,
not a part.

---

### DR-04 · M1 puts a database column name and the word “variant” into the designer's UI
**Severity:** major · **Confidence:** high
**Location:** §4 `#model`, M1 centre panel:
```html
<span class="lab">Projects into</span><span class="field blank">proposal_service_terms.retainer_cents</span>
```
and, directly above it: `<p class="subhead">schedule · variant retainer · required · client sees this</p>`

**Problem.** These are rendered as product chrome — a field label and its value inside the part
editor a designer would use. No designer will ever see, or should ever see,
`proposal_service_terms.retainer_cents`. The same panel exposes the internal kind/variant
vocabulary as a status line. This is exactly the jargon-in-mockup-UI failure the brief calls out;
it is fine in §4's tables and §5's column sketch, and it is not fine in a drawing of the room.
It also makes the mock read as an engineer's schema browser rather than the paper register the
Contract Room actually is, which undercuts B (“the studio won't notice Patina”).

Related, same class, lower stakes: M2's Blank column renders `Schedule` with a
`<span class="selectmock">variant</span>` — the spine asked for `Schedule ▾`.

**Fix.** Delete the `Projects into` row from the mock and move the projection fact to the
figcaption or to §4's projection-rule table, where it already lives. Rewrite the subhead in the
designer's own words — e.g. `Money · required · the client sees this`. In M2, restore
`Schedule ▾` with the variant names in the dropdown, not the word “variant”.

---

### DR-05 · M0's readiness list mixes ten verbatim production strings with three invented ones
**Severity:** major · **Confidence:** high
**Location:** §2 `#today`, M0 right rail `ul.readylist`

**Problem.** Ten items are copied exactly from
`apps/designer-portal/src/lib/document/commercial-documents.ts:180-250`. The three red ones —
the three the reader is asked to look hardest at — are not:

| M0 shows (red) | Production string |
|---|---|
| `At least one role rate` | `Add at least one role with an hourly rate.` |
| `Ceiling must be above $0` | `Set the design authorization ceiling.` |
| `Terms are empty` | `Write the agreement terms.` |

A reader walking the prod room against M0 (which §14 explicitly asks them to do) will find that
the blockers Patina actually prints are gentler and more actionable than the ones the document
shows, which weakens the “thirteen literal blockers are a rigidity” argument rather than
supporting it. The spine specified the paraphrases, but the mockup's job is fidelity to the
deployed product. Note also that M1 then quotes the *real* string (`Terms — write the agreement
terms`), so the two figures disagree about what the product says.

**Fix.** Use the production strings verbatim in M0, red or not. If a short label is wanted in the
red rows, put the production string in the annotation callout beside it.

---

### DR-06 · “the 32-word line” is 34 words
**Severity:** major · **Confidence:** high
**Location:** §8 `#turnkey`, M7 figcaption (“the 32-word Patina wording”) and §13 `#out`
(“every template carries the 32-word line”). The text itself, M7 `p.caption`:
> Patina helps you assemble and send agreements from parts you write and own. It is not a law
> firm and does not give legal advice — have an attorney review your templates before first use.

**Problem.** 13 + 12 + 9 = 34 words. In a document whose entire credibility rests on “every
figure is checked” (§9, `check-fixture.mjs`, all 65 present), a countable claim that is wrong by
two, stated twice, is disproportionately damaging — and it is the one number in the document that
a reader can falsify in ten seconds without leaving the page.

**Fix.** Either cut two words (e.g. drop “first” and “own”) or stop counting: call it *the
standing disclaimer* / *the legal-advice line*. Do not leave a checkable number uncheckable.

---

### DR-07 · §3's closing argument is 62 words of running prose marked `no-prose` to clear its cap
**Severity:** major · **Confidence:** high
**Location:** §3 `#trade`, `<p class="note no-prose">The trade's e-sign floor is a typed name…`

**Problem.** This is three full sentences of load-bearing argument — the ESIGN/UETA floor, the
claim that Patina already meets it, and a genuinely useful caveat that press-and-hold is
unconfirmed in any surveyed source. It is not a caption, a label or a figure. `check-prose.mjs`
excludes it solely because of the `no-prose` class: §3 counts 40 of 60 words, and this paragraph
is ~62, so without the class §3 would fail at 102/60. That is the definition of dodging the cap
rather than respecting it — and the document had 479 words of total headroom it never used.

The same pattern, less flagrantly, in: §2 `p.caption.no-prose` under the money chain (the
“returns in §4” claim), §4's variant-merge rationale, §7's ESIGN line, §9's fixture caption, and
the three Wave captions in §11, each of which carries substantive content rather than labelling a
figure.

**Fix.** Remove `no-prose` from the §3 note and pay for it out of the budget — raise §3's cap to
110, or move two of its three sentences into §7 where the same floor is discussed and the cap has
room (§7 is at 30/60). Reserve `no-prose` for what it was for: figure captions, chips, effort
keys, and mock-internal labels.

---

### DR-08 · The document is in a colder register than the house precedent it is asked to match
**Severity:** major · **Confidence:** medium
**Location:** whole document; compare `pricing-mechanics-2026-09-05/proposal.html` §`#short`

**Problem.** *The Number That Holds* argues in prose and uses tables as evidence: its §0 alone is
five substantial paragraphs, and its `<section>` elements carry no `data-prose-cap` at all. This
document totals **421 prose words across sixteen sections**, and five sections
(`rulings`, `out`, `respond`, `appendix`, and effectively `short`) count **one word or fewer**.
§12 Rulings — fifteen decisions the team is being asked to make — opens with a bare table and no
sentence at all.

The CSS, tokens, fonts and instruments match the house precedent exactly. The *voice* does not.
The result reads as a specification handed to an implementer rather than a proposal handed to
colleagues, which works against dimension H and against the brand-voice rule
(“Confident yet unpretentious — expert warmth”). It is also harder to skim for an argument: a
reader who wants to know *why* Core + Parts is right must reconstruct it from cells.

**Fix.** This is a spine-level tension the orchestrator should rule on, not a defect the builder
introduced. The cheapest fix that closes most of the gap: give §4, §5, §8 and §12 a two-to-three
sentence opening that states the argument and invites disagreement, and spend the ~479 unused
words there. §12 in particular needs one line: *these are recommendations, not decisions; each
names an owner.*

---

### DR-09 · M1 contradicts itself about whether Ceiling is required
**Severity:** major · **Confidence:** high
**Location:** §4 `#model` — the "Readiness, derived" table says Ceiling is
> Required only if a `ceiling` part is present

M1's rail shows `Ceiling` with **no** `req` dot (unlike Services, Deliverables, Role rates,
Retainer, Terms), and M1's right rail files it under a heading reading **“Not required here”**
with the text:
> Ceiling — present, so checked; remove the part and the check goes with it

**Problem.** Three statements, three different answers. The table says present ⇒ required. The
rail's missing dot says not required. The panel heading says “Not required here” while its own
item says “present, so checked”, which means required. A reader trying to understand the single
most important mechanic in the proposal — required-ness moving from code to data — gets no
consistent reading.

**Fix.** Pick one. Recommended: give Ceiling the `req` dot (it is present, therefore checked),
rename the panel heading from “Not required here” to `Satisfied`, and shorten the item to
`Ceiling · $24,000`. Put the “remove the part and the check goes with it” sentence in annotation 3,
which already makes that point.

---

### DR-10 · §2 promises a diagram that returns in §4; it does not return
**Severity:** major · **Confidence:** high
**Location:** §2 `#today`, `p.caption.no-prose` under the money chain:
> This diagram returns in §4 with the parts layer added.

**Problem.** §4's D1 is a three-column core/parts/projections diagram in a completely different
visual form (`.dgrid-3` boxes, not the `.chain` strip). Nothing in §4 reprises the §2 chain. The
spine did intend a reuse (“This diagram is reused in §4 with the parts layer added”) and the
builder rendered a different figure instead while keeping the promise in place. A cross-reference
that does not resolve is worse than no cross-reference: the reader scrolls to §4 looking for a
figure that is not there and concludes they missed something.

**Fix.** Either add the parts layer to the `.chain` and repeat it as the last element of §4
(`proposal_agreement_parts` → `proposal_service_terms` → `project_billing_authorities`), which is
the more persuasive option because it shows the projection as a one-line delta on a diagram the
reader already understands; or delete the promise and let D1 stand alone.

---

### DR-11 · The 18 × 7 engagement matrix is unreadable to a screen reader and abbreviated past comprehension
**Severity:** major · **Confidence:** high
**Location:** §3 `#trade`, `table.tight.min1080`, 126 cells of the form
`<td class="dot mid">&#9679;</td>`

**Problem.** Three compounding issues:
1. Every data cell's entire content is a bare glyph (`●`, `◐`, `—`) with no `title`, `aria-label`
   or visually-hidden text. A screen reader announces “black circle” 126 times, or nothing.
2. The legend (`● standard · ◐ sometimes · — not applicable`) lives in the caption *after* the
   table, so it is encountered last in both visual and reading order.
3. Column headers are truncated below the point of self-explanation — `Deliv.`, `Excl.`,
   `Procure.`, `Change ord.`, `Client resp.`, `Termin.`, `Insur.`, `Liab. cap` — with no `abbr`
   attribute and no expansion anywhere on the page.

There are also no `scope="col"` attributes (see DR-16), so a screen reader has no way to associate
a `●` with either its row or its column.

**Fix.** Add `scope="col"` to the header row and `scope="row"` to the variant cell; give each data
cell a text alternative (`<td class="dot mid"><span aria-hidden="true">●</span><span class="sr-only">standard</span></td>`,
with a `.sr-only` utility added to the stylesheet); move the legend above the scroller; and either
un-abbreviate the headers or add `abbr="Deliverables"` etc.

---

### DR-12 · M8's subhead says the addendum “adds one part”; the figure shows it changing one
**Severity:** major · **Confidence:** high
**Location:** §6 `#compose`, M8 `<p class="subhead">the Okonkwo house · supersedes nothing, adds one part</p>`
above a Ceiling part reading `Was $24,000 · Now $28,000`

**Problem.** A `was → now` on an existing Ceiling is an amendment to a part, not an addition of
one. §6's own "What each act may touch" table classifies exactly this as *Edit a money part ·
Executed · Addendum, and it re-projects*. The subhead describes a different act than the figure
draws, on the one mechanic (post-signature change) where precision is the whole point.

**Fix.** `the Okonkwo house · supersedes nothing, changes one part`. The “supersedes nothing”
half is good and worth keeping.

---

### DR-13 · M0's figcaption states the counter formula incorrectly
**Severity:** minor · **Confidence:** high
**Location:** §2 `#today`, M0 figcaption:
> The counter is literally `7 − blockers.length` `:192-195`.

**Problem.** The cited lines say something else:

```ts
// service-agreement-drafting-room.tsx:192-195
const completed =
  7 -
  readiness.blockers.filter((blocker) => !blocker.startsWith("Link a client"))
    .length;
```

…wrapped at the call site in `Math.max(0, completed)`. Two omissions: the “Link a client” blocker
is excluded from the count, and the result is clamped at zero. As written, the stated formula
applied to the thirteen-item list in the figure yields −6, not the “4 of 7” the counter shows — so
the caption invites the reader to catch the figure in a contradiction that is not actually there.

**Fix.** `The counter is 7 minus the unmet blockers, ignoring the missing-client one and clamped
at zero (:192-195, :269).`

---

### DR-14 · British spellings appear only in §8 and §13, against American spellings everywhere else
**Severity:** minor · **Confidence:** high
**Location:** `licence` ×10 (lines 1436, 1437, 1439, 1547, 1548 ×2, 1549, 1550, 1551) and
`labour` ×1 (line 1550, California row) — against `license`/`licensing` (925, 926, 1154, 1399,
1878, 1944) and `labor` (681 M0, 1340 M5) elsewhere; `licences` again at 1853 (§13).

**Problem.** The same concept is spelled both ways within four lines of each other
(§8's table says *licence*, §4's part-kind table says *license certificate*). §8's California row
reads “labour plus materials” while M0 and M5 both render the production string
“Construction labor”. Patina is a Midwest US product quoting US statute; British spellings read as
an unedited seam between research lanes.

**Fix.** Normalise to US spelling throughout: `license`, `licenses`, `labor`. Ten of the eleven
occurrences are in the two §8 tables.

---

### DR-15 · Heading levels skip h2 → h4 in ten of sixteen sections
**Severity:** minor · **Confidence:** high
**Location:** §1, §2, §3, §4, §5, §6, §7, §8, §11, §14 — every `<h4>` in these sections has an
`<h2>` as its nearest preceding heading. Only §9, §10 and the appendix use `<h3>`.

**Problem.** `h4` is styled as the mono eyebrow (`font-size:12px; letter-spacing:.18em; uppercase`)
and `h3` as a Playfair sub-title, so the *visual* choice is deliberate and correct — but the
document ends up with a heading outline that jumps two levels in most sections, and §11's Wave
cards use `<h4>` as the card title. Assistive-technology outline navigation and any
table-of-contents generator will render this as broken nesting.

**Fix.** Add an `h3.eyebrowish` style (or apply the `h4` rules to `h3` as well) and promote every
in-section `h4` to `h3`, keeping the mono presentation. Zero visual change, correct outline.

---

### DR-16 · No `scope` attributes on any header cell; row headers are `<td><strong>`
**Severity:** minor · **Confidence:** high
**Location:** every table in the document — `grep -c 'scope="' proposal.html` → `0`. Example, §12
Rulings: `<td class="num">R1</td><td><strong>Reverse R85 for agreements?</strong></td>`

**Problem.** With 20+ tables carrying the entire argument, and several of them wide enough to
require horizontal scrolling (`.min900`, `.min1080`), header association is the difference
between a navigable document and a wall of cells. The first column of almost every table is a
row header semantically (Ask, Rigidity, Model, Variant, Part, Template, Act, Surface, Draw, State,
Persona) but is marked up as data.

**Fix.** `scope="col"` on every `<thead> th`; convert the first cell of each body row to
`<th scope="row">` and add `tbody th{font-family:var(--font-body);font-size:inherit;text-transform:none;letter-spacing:normal;color:var(--ink);font-weight:600;white-space:normal;}`
so the appearance is unchanged.

---

### DR-17 · The Wisconsin cancellation notice is set in the smallest, faintest type on the page
**Severity:** minor · **Confidence:** high
**Location:** §7 `#client`, M5 `.leaf`:
```html
<p class="caption" style="margin:0 0 .6rem">You may cancel this transaction, without penalty
or obligation, within three business days from the date above.</p>
```
`.caption` computes to DM Mono 12px in `var(--faint)`.

**Problem.** This is a statutorily mandated consumer notice, drawn on the homeowner's copy, in the
same style the document uses for its own editorial asides — smaller and lower-contrast than the
surrounding Newsreader 15px body. The figure's own annotation argues that “attachments are leaves,
not paragraphs — their own rule, their own acknowledgement line”, which is exactly right, and then
the drawing gives the leaf less visual weight than the Terms paragraph above it. It also reads as
Patina's voice rather than the statute's.

**Fix.** Render the notice in `.doorpart .dtx` (Newsreader 15px, `var(--body)`) inside the leaf,
and keep `.caption` for the “Attachment A” provenance line only. This also matters legally:
mandated notices generally carry conspicuousness requirements, which is worth a line for counsel
under R11.

---

### DR-18 · M3's cost-plus card quotes a description of the disclosure, not the disclosure
**Severity:** minor · **Confidence:** high
**Location:** §6 `#compose`, M3 card 3:
> Disclosure line on the client's copy: “shown to the client as cost-plus”.

**Problem.** As drawn, the sentence the homeowner reads is literally *shown to the client as
cost-plus* — which is meta-commentary, not a disclosure. It says nothing about what cost-plus
means, what the markup is, or what the client is agreeing to. The spine's phrasing was ambiguous;
the HTML resolved the ambiguity the wrong way.

**Fix.** Write the actual client sentence and quote that — e.g. *“Furniture and materials are
billed at our cost plus 30%. You will see both the cost and the markup on every invoice.”* Then
label it `Disclosure line on the client's copy:` as it is now. This also gives R9 something
concrete to rule against.

---

### DR-19 · `data-prose-total="900"` is on `.shell`, where the gate never reads it
**Severity:** minor · **Confidence:** high
**Location:** line 552, `<div class="shell" data-prose-total="900">` — versus
`source/check-prose.mjs`:
```js
if (name === 'body') {
  const totalAttr = getAttr(token, 'data-prose-total');
  if (totalAttr) bodyTotalCap = parseInt(totalAttr, 10);
}
```

**Problem.** Artifact-published HTML correctly has no `<body>` tag, so the attribute is inert and
the gate silently falls back to its hard-coded default of 900. It happens to be the same number
today, so nothing breaks — but the total cap is now unpinnable from the document, and anyone who
edits the attribute expecting the gate to follow will be misled by a green run.

**Fix.** Teach `check-prose.mjs` to read `data-prose-total` from the first element that carries it
(`body` *or* `.shell`), and leave the attribute where it is.

---

### DR-20 · Meta-commentary is drawn inside the product chrome of four mockups
**Severity:** minor · **Confidence:** high
**Location:**
- §5 M4, panel header: `<p class="mockhead">Billing — deployed, unchanged</p>`
- §5 M4, inside the Billing panel: “Drawn faithfully and not restyled — the Library card sits beside it.”
- §5 M4, strip header: `Defaults <span class="chip">P3</span>`
- §5 M4, under the button: “Dashed: appears only when the page is opened from a draft.”
- §4 M1, right rail: “Ceiling — present, so checked; remove the part and the check goes with it”
- §8 M6, right rail header: `<p class="mockhead">Gate</p>`

**Problem.** Each of these is the document talking to its reader from inside a drawing of the
product. `Billing — deployed, unchanged`, `P3` and `Dashed: …` are notes to the Patina team
rendered as if they were panel titles and UI labels; `Gate` is the document's word for the
licensing check, not a heading a designer would see (M7 handles the same idea correctly, with
`Before this studio can send a design-build agreement`). Every mock in the document already has a
`figcaption` and, where needed, a numbered `.annlist` — both of which sit *outside* the chrome and
exist precisely for this.

**Fix.** Move all six into the figcaption or the annotation list. `Gate` → `Licensing`. The
`.chip` for `P3` belongs in the caption sentence, not beside a strip title.

---

### DR-21 · M4 collapses the spine's two Library panels into one and relocates the save action
**Severity:** minor · **Confidence:** medium
**Location:** §5 `#library`, M4 — spine: *“Two panels: `TEMPLATES` list … ; `PARTS` list grouped
by kind with counts … A third strip `DEFAULTS` … Right: `Save current agreement as template`
appears only when opened from a draft.”*

**Problem.** The rendered figure is a two-column `mg-2` where the left column is the Billing card
and the right column stacks Templates + Parts + Defaults + the save button in one panel. So the
Library reads as one dense card rather than the two-panel shelf the spine described, and the save
action — the only *action* on the page — sits at the bottom of a scroll rather than in its own
position. The reader cannot tell from the drawing that Templates and Parts are separate objects,
which is the point §5's "Two objects, one shape" table just made.

**Fix.** Three columns at ≥860px (Billing · Templates · Parts), with Defaults as a full-width strip
beneath and the save button in its own right-hand slot; or keep two columns but give Templates and
Parts separate `.mockpanel` boxes so the two objects read as two objects.

---

### DR-22 · §6's flow strip has no arrows
**Severity:** minor · **Confidence:** high
**Location:** §6 `#compose`, `.flowstrip` — spine: *“Flow strip (five stations, mono labels,
arrows)”*

**Problem.** The five stations render as five independent bordered boxes in a 5-column grid at
≥900px and as a vertical stack below it. Nothing indicates sequence except the `01`–`05` numbers,
and nothing indicates that station 03 is the only new one (which is the lede's whole claim). At
narrow widths the stack reads as an unordered list of five features.

**Fix.** Add `→` separators between stations at ≥900px and `↓` below it — the `.chain .carr` and
`.darrow` patterns already in the stylesheet do exactly this. Give station 03 the
`border-top:2px solid var(--clay)` treatment alone, or a `.dbox.strong`-equivalent, so “only the
third is new” is visible.

---

### DR-23 · Two of D1's three named arrows are not drawn as arrows
**Severity:** minor · **Confidence:** high
**Location:** §4 `#model`, D1 — spine: *“Arrow labels: ‘materialize’ (Library → Parts), ‘project’
(money parts → terms row), ‘hash every part’ (Parts → Evidence).”* The caption repeats all three:
> Three arrows carry the whole model: **materialize**, **project**, **hash every part**.

**Problem.** Only `materialize` is rendered as a `.darrow`. `project` appears as a `←` glyph inside
a `.dbox` body (“← money parts project here at every save”) and `hash every part` likewise
(“← hash every part”). Both `←` point leftward into boxes that sit in the *right* column, so at
≥760px the arrowhead points away from the source. Below 760px the three columns stack vertically
and every directional glyph is wrong. The caption promises three arrows and the figure has one.

**Fix.** Draw all three as `.darrow` elements between the columns — or, since a three-column CSS
box grid cannot carry cross-column arrows honestly, restate the caption as *three relations* and
drop the arrow glyphs from inside the boxes so nothing points the wrong way when stacked.

---

### DR-24 · §13 forecloses territory that R6 is still asking the team to rule on
**Severity:** minor · **Confidence:** medium
**Location:** §13 `#out`: “**Amend-in-place after send** — an addendum or a supersede, never a
silent edit.” Versus §12 R6: “**When parts freeze** · At send, today's rule; unsend is supersede ·
Kody · P1 P7”.

**Problem.** R6 is offered as an open ruling with a *recommendation*; §13 states the same question
as already closed, in a section whose framing (“What stays out”) sits beside genuinely settled
items (drawn signatures — *closed, approvals R2*; co-signer login — *deferred, approvals P-29*).
A reader who wants to argue that parts should freeze at `client_signed` rather than `sent` — which
is exactly what rigidity 5 raises — will read §13 as being told not to bother.

**Fix.** Either move the amend-in-place bullet out of §13 and let R6 carry it, or reword it to
`Amend-in-place after send — recommended out; see R6`. Same treatment would help “Verifying
licences” (R10 owns it) and “A general contract builder”, neither of which has a cited closure.

---

### DR-25 · §12 Rulings opens with a bare table and no invitation
**Severity:** minor · **Confidence:** high
**Location:** §12 `#rulings` — `data-prose-cap="60"`, actual prose count **1 word**

**Problem.** Fifteen decisions the team is being asked to make, presented as a table with no
sentence before it. The column is headed *Recommendation*, which does the right work quietly, and
§14 explains the mechanic three sections later — but the section that most needs to read as “these
are proposals, argue with them” is the section with the least framing. Compare the house
precedent, whose equivalent section opens in prose. Twelve words would fix it and the cap has 59
to spare.

**Fix.** One line under the opener: *Each of these is a recommendation, not a decision. The owner
column names who rules; disagreement is the useful response.*

---

### DR-26 · M8's $28,000 is invented and unlabelled while M3's invented figures are labelled
**Severity:** minor · **Confidence:** high
**Location:** §6 `#compose`, M8: `<span class="lab">Now</span><span class="field">$28,000</span>` —
against M3 card 2, which carries `illustrative` in its `mock-cap`, a bolded
`<b>Illustrative.</b> These three figures are drawn to show the shape of the part; they are not
fixture figures and carry no claim.` and a matching disclaimer in §9's closing caption.

**Problem.** The document sets itself a visible discipline — every figure is fixture-derived, and
anything that is not says so twice. `$28,000` is neither in `fixtures.json` nor labelled, and §9's
caption enumerates the exceptions (“The three illustrative per-phase figures in M3”) without
mentioning it. So the one place the discipline lapses is also the place the document claims it
does not.

**Fix.** Add `illustrative` to M8's `mock-cap` and extend §9's caption to “The three illustrative
per-phase figures in M3 and the addendum ceiling in M8”. Alternatively add a `ceiling_after_addendum`
figure to `fixtures.json` and let `check-fixture.mjs` cover it — cleaner, since the addendum
mechanic is central to P7.

---

### DR-27 · Massachusetts is cited twice but absent from “Licensing in five states”
**Severity:** minor · **Confidence:** high
**Location:** §8's turnkey table (`WI ATCP 110 · MN 325G · IL · CA BPC §7159 · NY · MA 142A`) and
P11 (“Seeded notices for WI, MN, IL, CA, NY and MA”) — versus the "Licensing in five states"
table, which covers WI, IL, MN, CA, NY only. Appendix B notes `mass.gov (142A, 403 on re-fetch)`.

**Problem.** Six jurisdictions get seeded notices; five get a rule row. A reader checking whether
Patina understands MA's exposure finds MA named in the build plan and nowhere in the research.
The appendix quietly explains why (the source 403'd on re-fetch), but that explanation is buried
in a domain list and never surfaces where it matters.

**Fix.** Add a sixth row for Massachusetts marked `not confirmed` with the `mass.gov 403 on
re-fetch` note, and retitle the table “Licensing in six states”. Better to show the gap than to
have the reader find it.

---

### DR-28 · Appendix B lists bare domains rather than URLs, unlinked, with an unexplained notation
**Severity:** minor · **Confidence:** high
**Location:** §Appendix `#appendix`, `ul.srclist` — spine: *“Sources by lane (01, 02, 03 URLs,
deduplicated)”*. Example:
`asid.org (Residential 27/197, Commercial 28/205)`; the three lanes run to ~85 bare hostnames.

**Problem.** Three things at once: they are hostnames, not URLs, so a reader cannot reach the cited
page; they are plain text, not `<a>` elements, so they cannot be clicked even where the hostname
would do; and `(Residential 27/197, Commercial 28/205)` is used without a key anywhere in the
document (page counts? item counts? clause counts out of a total?). The document is otherwise
scrupulous about citation — Appendix A is exemplary, with `path:line` throughout — which makes B
the weak half of the same appendix.

**Fix.** At minimum, define the `27/197` notation in a leading caption. Better: link the ten or so
sources the body actually leans on (asid.org, dsps.wi.gov, cslb.ca.gov, law.justia.com BPC 7159,
regulations.justia.com ATCP 110.05, revisor.mn.gov 326B.805, mydomastudio.com, buildertrend.com)
as real `<a href>` URLs and leave the rest as a deduplicated hostname list under a heading that
says so.

---

### DR-29 · Colour is the only carrier for three UI states
**Severity:** minor · **Confidence:** high
**Location:**
- §4 M1 credit-rule chips: `<span class="chip on">Credited</span><span class="chip">Non-refundable</span><span class="chip">Replenishing</span>` — `.chip.on` differs only by `border-color`, `background` and text colour.
- §2 M0: `.field.zero` renders `$0` in `--terracotta-ink`; the plain `.field` in M1 renders `$5,000` in `--ink`. The text is identical in kind.
- §8 M6 header chips: three are `.chip on`, two are plain, with no stated meaning for either state.

**Problem.** Which retainer credit rule this agreement uses is a substantive fact of the mockup and
is legible only to a reader who can distinguish a mocha border from a stone one. The document is
otherwise careful here — `.yes`/`.partly`/`.no` carry words, the matrix carries distinct glyphs,
`.btnmock.off` and `.leaf` use dashed borders — so these three are the exceptions rather than the
pattern. M6's case is worse than an a11y issue: reusing the *selected* state as emphasis means
`Cost basis`, `Fee` and `GMP` appear chosen while `Retainage` and `Design fee` appear unchosen, for
no reason a reader can recover.

**Fix.** Prefix the selected chip with `✓` (or `●`) and the unselected with a hairline dot; in M6,
drop `.on` entirely and use one chip style, since nothing there is selectable.

---

### DR-30 · M0 labels thirteen items “blockers” when ten of them are satisfied, with no legend
**Severity:** minor · **Confidence:** high
**Location:** §2 `#today`, `<p class="mockhead">Readiness · 13 blockers</p>` above a 13-item list
of which 3 carry `.red` and 10 carry `.ok`

**Problem.** The heading counts thirteen blockers; the drawing shows three unmet conditions and ten
met ones. Both readings are defensible and the figure supports neither cleanly. The distinction is
carried by `--terracotta-ink` plus a filled-vs-hollow bullet (`▪` at `::before` for `.red`, `▫` for
the default) — a real non-colour carrier, credit where due, but a 12px glyph difference with no
legend anywhere. A reader is likely to conclude the room refuses to send for thirteen reasons,
which then makes the “4 of 7 facets written” counter look wrong (see DR-13).

**Fix.** `Readiness · 3 of 13 checks unmet`, and add a two-item legend line to the panel
(`▪ unmet · ▫ met`) or split the list under two `mockhead`s (`Blocking` / `Satisfied`), which is
what M1 already does correctly with `Review & send` / `Not required here`.

---

### DR-31 · The designer preview is described as “Seven sections”; the cited range contains five headings
**Severity:** minor · **Confidence:** medium
**Location:** §2 `#today`, "Three renders of one agreement", row 1:
> Designer preview · `service-agreement-preview.tsx:91-244` · Seven sections, written out in order.

**Problem.** Within the cited range the file has five `AgreementHeading` elements:

```
service-agreement-preview.tsx: 92 Services · 100 What you will receive · 116 Not included
                              126 How design time is billed · 205 Agreement terms
```

Seven may be reachable by counting unheaded blocks (the ceiling and retainer sub-blocks inside
"How design time is billed" plausibly bring it to seven), but the document does not say so, and
"seven" reads as a deliberate echo of the seven facets — which is the point being made and is
therefore worth being right about. Medium confidence because I checked headings, not blocks.

**Fix.** Either say "five headings over seven blocks" with the sub-block names, or drop the count:
"Hand-written sections in a fixed order." The row's argument does not need a number.

---

### DR-32 · M4's Billing mock drops “check” from the remit-to label
**Severity:** minor · **Confidence:** medium
**Location:** §5 M4: `<span class="lab">Remit-to</span><span class="field blank">Middle West Studio, Madison WI</span>`
versus the deployed card:
```
account-studio-page.tsx:813  The card fee and check remit-to instructions a client sees when…
account-studio-page.tsx:821  Card fee (%)
```

**Problem.** The figure's whole claim is that this card is “drawn faithfully and not restyled”. The
card-fee half is faithful (`Card fee` / `3.0%`, matching `card_surcharge_bps` 300 at 00428). The
remit-to half is not: the deployed field is *check* remit-to and holds free-text payment
instructions, not a postal address of the studio. Small, but it is the one place the document
claims literal fidelity to a deployed surface.

**Fix.** `Check remit-to` with an instruction-shaped value (e.g. `Make checks payable to Middle
West Studio LLC`), or read the component and copy its label and placeholder exactly.

---

### DR-33 · The fixture studio and the addressed team share a name, and §9 disclaims “makers” who do not appear
**Severity:** nit · **Confidence:** medium
**Location:** masthead eyebrow (“proposal for the Patina and Middle West team”), §9 lede (“The
makers and the clients are invented; the arithmetic is not”), `Middle West Studio` ×5 throughout
the mockups including M4's remit-to.

**Problem.** Two small seams. First, “Middle West Studio” is simultaneously the invented fixture
studio and, apparently, the real studio the document is addressed to — so §9's disclaimer leaves a
reader unsure whether the Okonkwo ledger is about them. Second, the disclaimer names *makers*,
and neither ledger contains a maker; the word appears to have travelled from a fixture set where it
belonged. It reads as an unedited sentence in the one section whose entire authority is precision.

**Fix.** “The houses and the clients are invented; the studio is yours and the arithmetic is
checked.” And if Middle West is a real studio, say so once in the masthead so the mockups read as
about them rather than about a namesake.

---

### DR-34 · `.hoveract` is reused for persistent chips and counts
**Severity:** nit · **Confidence:** high
**Location:** `.partlist .hoveract{margin-left:auto;…}` — introduced in M1 for the transient
`⋯ Remove · Rename · Move` affordance, then reused in M2 for the permanent `studio`/`Patina` source
chips and in M4 for the permanent counts (`9`, `3`, `5`, `1`).

**Problem.** Purely a naming problem in the stylesheet, invisible to a reader — but it means a
future editor changing hover behaviour will silently change three unrelated figures.

**Fix.** Rename the shared behaviour to `.rowend` and keep `.hoveract` as a modifier that adds the
hover-only semantics.

---

### DR-35 · Dead wrapper markup in M3
**Severity:** nit · **Confidence:** high
**Location:** §6 M3:
`<div class="mockgrid mg-2" style="grid-template-columns:minmax(0,1fr)"><div class="cols cols-3">`

**Problem.** The outer `mockgrid mg-2` is immediately overridden to a single column by an inline
style, so it contributes nothing except a `gap` that the inner `.cols` also sets. Leftover from an
earlier layout.

**Fix.** Delete the wrapper; `<div class="cols cols-3">` alone produces the identical result.

---

### DR-36 · Empty arrow cell in the §2 chain diagram
**Severity:** nit · **Confidence:** high
**Location:** §2, `<div class="carr">&nbsp;</div>` between `project_billing_authorities` and
`the studio bills against this`

**Problem.** At ≥760px `.chain` is a fixed 7-column grid, so the fourth box needs a filler cell —
hence the `&nbsp;`. It renders as a visible gap where the reader expects the fourth `→`, which
makes the last box look detached from the sequence rather than being its consequence.

**Fix.** Put a real `→` there (the relation is true — authority is what the studio bills against),
or drop the fourth box and fold its text into the third box's body, restoring a clean 3-box chain
that matches the spine.

---

### DR-37 · Cross-references are plain text where anchors exist
**Severity:** nit · **Confidence:** high
**Location:** §1 status cell “Open; §10 P0”; §5 seeded-templates row “see §8”; §2 caption “returns
in §4”; §9 caption “the three illustrative per-phase figures in M3”; several `.ref` spans citing
`R3`, `R9`, `R10`, `R13`, `P12`.

**Problem.** Every one of these targets has an `id` on the page (`#proposals`, `#turnkey`,
`#model`, `#fixture`) and the running index proves the anchor pattern works. In a 137 KB document
that the team will read on a phone as much as a laptop, "see §8" that cannot be tapped is a small
tax paid many times. The ruling references (`R3`, `R9`…) are the most valuable case, since a reader
in §8 evaluating a part almost always wants the ruling behind it.

**Fix.** Wrap section references in `<a href="#turnkey">`. For rulings, add `id="r1"`…`id="r15"` to
the `.num` cells in §12 and link every `.ref` that names one. Styling already exists
(`a{color:var(--accent);border-bottom:1px solid var(--rule-2)}`), and `a:focus-visible` is defined.

---

### DR-38 · The appendix is numbered as a sixteenth section
**Severity:** nit · **Confidence:** high
**Location:** index `<span class="n">15</span>` / `<p class="eyebrow">Fifteen</p>` — versus the
spine, which runs §0–§14 and then “Appendix” unnumbered.

**Problem.** Trivial in isolation, but it interacts with the eyebrow words: the document runs
Zero…Fourteen and then Fifteen, so the appendix is the only back-matter element wearing a section
ordinal, and “§14” in a cross-reference is ambiguous between the fifteenth entry and the section
labelled Fourteen.

**Fix.** Index number `—` or `A`, eyebrow `Appendix`. (The precedent starts its first section at
“One”; this document starts at “Zero”, which is the better choice for a §0 “In short” — worth
keeping, just noting the divergence.)

---

### DR-39 · The column sketch is a `<div>`, not `<pre><code>`
**Severity:** nit · **Confidence:** high
**Location:** §5 `#library`, `<div class="sketch no-prose">` with `white-space:pre-wrap`

**Problem.** Renders correctly, but carries no code semantics, so assistive technology reads three
SQL-ish table definitions as ordinary prose with odd spacing, and the `--` comment lines lose
their status as comments. Elsewhere the document uses `<code class="mono">` correctly for inline
identifiers, so this is the one inconsistency.

**Fix.** `<pre class="sketch no-prose"><code>…</code></pre>` and drop `white-space:pre-wrap` in
favour of `pre-wrap` on the `pre` (same declaration, correct element).

---

### DR-40 · M2 exposes the internal word “variant” in the part picker
**Severity:** nit · **Confidence:** high
**Location:** §4 M2, Blank column: `<li><span class="kg">$</span>Schedule<span class="hoveract"><span class="selectmock">variant</span></span></li>`

**Problem.** Sub-case of DR-04, listed separately because the fix differs. The spine asked for
`Schedule ▾`; the drawing labels the dropdown with the schema word for what it selects. A designer
picking a blank money part wants to see the money shapes, not the noun for the field that holds
them.

**Fix.** `Schedule ▾` with `Flat · Per phase · Rate card · Retainer · Ceiling · …` shown as the
open state, or as chips beneath.

---

### DR-41 · `Patina` chip is capitalised in M2 and lowercase in M4
**Severity:** nit · **Confidence:** high
**Location:** M2 `<span class="chip src-patina">Patina</span>` versus M4
`<span class="chip src-patina">patina</span>` (and `studio` lowercase in both)

**Problem.** Two figures three sections apart use the same chip class with different casing for the
same source. R7 makes naming a ruling; the document should be internally consistent about the one
name it cannot get wrong.

**Fix.** `Patina` and `Studio`, or `patina` and `studio`, in both. Given the mono-uppercase
treatment used for eyebrows elsewhere, lowercase in both reads better against `.chip`'s letterspacing.

---

### DR-42 · The rigidity ledger has four columns; the spine specified three
**Severity:** nit · **Confidence:** high
**Location:** §2 `#today`, `<thead><tr><th>#</th><th class="w-name">Rigidity</th><th class="w-why">Where</th><th class="w-what">What a composed agreement changes</th></tr></thead>`

**Problem.** The added `#` column is an improvement, not a defect — it is what makes the Appendix A
back-references (`Rigidity 1`…`Rigidity 12`) resolvable. Logged only so the spine-fidelity audit is
complete and so the deviation is recorded as deliberate.

**Fix.** None. Consider updating the spine to match, and linking `#` to Appendix A per DR-37.

---

### DR-43 · §0 line 5's “without a new table for the client to see” is ambiguous
**Severity:** nit · **Confidence:** medium
**Location:** §0 `#short`, ledger item 5:
> Wave 1 loosens today's room without a new table for the client to see.

**Problem.** “Table” here means a Postgres table, and “for the client to see” means the client's
copy is unchanged — but the sentence parses most naturally as *a new table (grid) rendered on the
client's page*, which is not what Wave 1 is about. It is the fifth line of a six-line summary that
many readers will treat as the whole document.

**Fix.** Split the two ideas: *Wave 1 loosens today's room. One migration, and the client's copy
does not change.* §11's Wave 1 caption already says this well and can be borrowed.

---

### DR-44 · `.num` is applied to non-numeric strings, giving them `white-space:nowrap`
**Severity:** nit · **Confidence:** high
**Location:** §9 Ledger A: `<td class="num">Middle West Studio</td>`, `<td class="num">design
services</td>`, `<td class="num">monthly</td>` — `.num{font-family:var(--font-mono);font-variant-numeric:tabular-nums;color:var(--faint);white-space:nowrap;}`

**Problem.** Cosmetically these are studio/engagement labels rendered in the faint numeric style,
which reads as if they were figures. Functionally, `white-space:nowrap` on “Middle West Studio”
inside a `.min720` table gives the column an unnecessary minimum width at narrow viewports.

**Fix.** Add a `.val` class (mono, `--faint`, wrapping, no tabular-nums) for non-numeric fixture
values, or simply drop `.num` from those three cells.

---

### DR-45 · M5's rate table has no header row
**Severity:** nit · **Confidence:** high
**Location:** §7 M5, inside the "How design time is billed" part: a `.mocktable` with `<tbody>`
only — three `Role / $rate` rows, no `<thead>`.

**Problem.** Defensible as a faithful drawing of how a rate list looks on a signed agreement, and
the surrounding eyebrow supplies the context. Still, it is the one table in the document with no
headers at all, and a screen reader reaching it announces six unlabelled cells.

**Fix.** Add a visually-hidden `<thead><tr><th scope="col">Role</th><th scope="col">Hourly rate</th></tr></thead>`
(needs the `.sr-only` utility from DR-11), or `role="presentation"` if it is genuinely a layout
table.

---

### DR-46 · §5's lede passes judgement on the repo's other template tables
**Severity:** nit · **Confidence:** medium
**Location:** §5 `#library` lede:
> modeled on `board_templates` — the only template table in the repo that gets ownership and
> namespacing right.

**Problem.** True on the evidence (Appendix A, Constraint 6 shows `phase_templates` and
`proposal_templates` are per-user while `board_templates` is not), and the point is worth making.
But “gets it right” in a document circulated to the team frames prior decisions as errors rather
than as different-scope choices. The precedent's register — plainly stated facts, judgement left to
the reader — does this better.

**Fix.** “modeled on `board_templates`, the one template table already scoped to the studio rather
than the person.” Same claim, no verdict; Constraint 6 carries the evidence.

---

### DR-47 · `overflow-x:hidden` on `body` may defeat the sticky index at ≥1100px
**Severity:** minor · **Confidence:** low
**Location:** `body{…overflow-x:hidden;}` (line 84) with `.index{position:sticky;top:0;…}` inside
`@media (min-width:1100px)` (line 537)

**Problem.** An `overflow` value other than `visible` on an ancestor makes that ancestor the
sticky element's containing scroll box; when that box does not itself scroll, the sticky offset can
be ignored and the index scrolls away with the page. Behaviour varies by engine and by whether the
overflow is on `html` or `body`, which is why confidence is low. Inherited verbatim from the house
precedent, so if the precedent's index sticks in practice this is a non-issue — but it is untested
here (`render-check.mjs` could not launch Chromium in this sandbox).

**Fix.** Verify in a browser at ≥1100px before hand-back. If it fails, move the horizontal clamp to
`.shell{overflow-x:clip}` (which does not create a scroll container for sticky purposes in
current engines) and leave `body` at `visible`.

---

### DR-48 · One rule sits exactly at the 11px floor
**Severity:** nit · **Confidence:** high
**Location:** `.annlist li::before{…font-size:11px;}`

**Problem.** The numbered annotation badges are the smallest type in the document, exactly at the
stated minimum, in `var(--faint)` inside a 1.25rem circle. Everything else respects a 12px floor,
including the deliberate `max(12px, .82em)` and `max(12px, .74em)` guards on `.mono` and `.ref`,
which shows the floor was thought about. The badges are decorative (the list is still ordered
without them), so this is not a violation — just the one place with no margin.

**Fix.** 11.5px or 12px with `line-height:1.25rem`; the circle has room.

---

### DR-49 · M5's figcaption claims the client register “as deployed”, but the deployed headings differ
**Severity:** minor · **Confidence:** high
**Location:** §7 M5 figcaption:
> client register — Playfair title, Newsreader body, mono rules, as deployed on the Threshold.

**Problem.** The typographic claim checks out — `.doorpaper .dtitle` uses `--font-display`
(Playfair), `.doorpart .dtx` uses `--font-body` (Newsreader), `.doorpart .dey` is mono/uppercase,
and the typed-name-plus-press-and-hold signature matches the approvals program. The *content*
claim does not: the deployed client shell's headings are `Services / Deliverables / Rates & design
authorization / Terms / Not included`, while M5 draws `Services / What you will receive / Not
included / How design time is billed / Retainer / Ceiling / Cancellation / Terms`. Four of eight
are strings that live on the designer surface, not the client one (see DR-01).

M5 is a *proposal*, so it is entitled to change the wording — but “as deployed” tells the reader
this is what the Threshold looks like today, and it is not.

**Fix.** Narrow the claim to what is true: *client register — Playfair title, Newsreader body, mono
rules, the Threshold's own typography.* Then add one clause saying the part titles are proposed and
differ from today's shell, which is the point §7's table is already making.

---

### DR-50 · Section eyebrows start at “Zero” where the precedent starts at “One”
**Severity:** nit · **Confidence:** high
**Location:** §0 `<p class="eyebrow">Zero</p>` versus `pricing-mechanics-2026-09-05/proposal.html`
`<section id="short"><div class="opener"><p class="eyebrow">One</p><h2>The short version</h2>`

**Problem.** Register divergence only, and arguably the better choice — “Zero” correctly marks the
summary as prefatory rather than as the first argument, which is what §0 is. Logged so the
orchestrator can decide whether the house convention is “first section is One” or “summary is
Zero”, since the next document will face the same fork.

**Fix.** None required. If house consistency matters, the precedent is the one that should move.

---

## Summary

| Severity | Count |
|---|---|
| Blocker | 2 |
| Major | 10 |
| Minor | 22 |
| Nit | 16 |
| **Total** | **50** |

**By dimension** — A (spine fidelity): DR-03, DR-10, DR-21, DR-22, DR-23, DR-28, DR-42, DR-50.
B (mockup fidelity): DR-01, DR-02, DR-04, DR-05, DR-13, DR-20, DR-31, DR-32, DR-40, DR-49.
C (copy): DR-06, DR-14, DR-18, DR-33, DR-41, DR-43, DR-46.
D (prose budget spirit): DR-07, DR-08, DR-19, DR-25.
E (structure/nav): DR-15, DR-37, DR-38, DR-39. F (responsiveness): DR-35, DR-36, DR-47, DR-48.
G (accessibility): DR-11, DR-16, DR-17, DR-29, DR-30, DR-44, DR-45.
H (tone): DR-08, DR-24, DR-25, DR-46.

**No findings** on: theme tokens (all 19 colour tokens defined on bare `:root`, in
`@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`, and in `:root[data-theme="dark"]`
— complete and correctly guarded); `body` background (explicit `var(--ground)`); document
structure (no `<!DOCTYPE>/<html>/<head>/<body>`; `<title>` is `The Agreement, Composed`, matching
the spine); external assets (only the Google Fonts stylesheet and its two preconnects; no images,
no scripts); index links (all 16 `href="#…"` resolve to a section `id`, verified by grep); prose
budget (421/900, every section under cap); fixture arithmetic (all 65 figures present and
recomputed); brand-voice hard rules (no “AI”, no marketing vocabulary, no emoji, no exclamation
marks outside `!important`); wide-table containment (every `.min720/.min900/.min1080` table sits
inside a `.mockscroll` or `.tablewrap`, both `overflow-x:auto`); `V6` (verified real —
`docs/vision/VISION-DECISIONS.md:59 · V6 · Pledge × subscription`).

---

## Top five fixes, in priority order

1. **DR-01 — invert the drift example.** “What you will receive” is the *designer* preview's
   heading (`service-agreement-preview.tsx:100`); “Deliverables” is the *client* shell's
   (`commercial-document-shell.tsx:203`). It is the document's only concrete drift evidence and it
   names the surfaces backwards. One cell, and it decides whether the team trusts §2.

2. **DR-02 — make M5 render M1's part set.** Same order, same parts, minus studio-only, plus the
   attachment leaf — or delete the figcaption's claim that it already does. Two mockups that
   contradict each other on *order is the document order* undo the argument they exist to make.

3. **DR-04 + DR-05 — get the mockups out of the schema and back into the product.** Delete
   `proposal_service_terms.retainer_cents` and the `variant` status line from M1; restore the ten
   production blocker strings in M0. §14 asks the team to walk prod against these figures, so any
   string that is not the product's costs the document credibility on contact.

4. **DR-03 + DR-09 + DR-12 — close the three self-contradictions.** M6's `Schedule of values` part
   against §4's stated merge; M1's Ceiling required in the table, unmarked in the rail, and filed
   under “Not required here”; M8's “adds one part” over a `was → now` edit. Each is a few words,
   and each currently gives a careful reader a reason to doubt the model.

5. **DR-07 + DR-25 + DR-08 — spend the 479 unused prose words.** Unmark the §3 e-sign note as
   `no-prose` and pay for it out of the budget; give §12 one sentence saying these are
   recommendations awaiting a ruling; give §4, §5 and §8 an opening line each. The document
   currently reads as a spec for an implementer rather than a proposal to colleagues, and the
   budget was never the constraint — the cap was used at 47%.

**Also worth doing before hand-back, cheap and mechanical:** DR-06 (the line is 34 words, not 32 —
stated twice), DR-14 (`licence`/`labour` → `license`/`labor`, eleven occurrences, all in §8 and
§13), DR-15 + DR-16 (promote in-section `h4` → `h3` with identical styling; add `scope` attributes),
and DR-17 (render the Wisconsin statutory notice in body type, not caption type).

**Cannot be assessed here:** `review/render-check.mjs` could not launch Chromium under the sandbox
(`bootstrap_check_in … Permission denied`), so no finding in this review rests on rendered output.
The responsiveness and colour findings above were derived by reading the CSS. DR-47 in particular
needs a real browser at ≥1100px.
