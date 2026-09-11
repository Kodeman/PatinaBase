---
Status: Active
Owner: Kody
Last Updated: 2026-09-01
---

**Purpose.** Append-only log of every change to `VISION.md` and every open vision ruling. Never edit past entries; corrections get a new dated entry referencing the old one. Ruling ids are V-numbers; learnings from the market are L-numbers; re-cuts of the page are C-numbers. Same discipline as `docs/design/the-document/DECISIONS.md`.

---

# VISION-DECISIONS.md — the Patina vision log

## Settled — 2026-09-01 workshop (C1, VISION.md v0.1)

| ID | Decision | Source |
|----|----------|--------|
| C1 | VISION.md v0.1 cut from the five-question workshop. Supersedes `my-company.md` §"What we are" and §"Pricing", the Jan spine's "AI-powered / consumer-first / affiliate" framing, and the v4 one-pager's "designers never pay" line. | `workshops/2026-09-01-vision-workshop.md` |
| S1 | Three surfaces are ranked, not equal: The Document → iOS app (studio's front door) → marketplace (the till). The designer tool is the one surface kept if only one could be. | Kody, Q1 |
| S2 | The customer is a growing studio at the moment it adds its first hands while workload doubles. Leah's studio first. Homeowners are the studio's clients; makers are the studio's vendors. (Kody's phrase for the first homeowner cohort was "active Patina customers" — read as Middle West's current clients; confirm.) | Kody, Q2 |
| S3 | Two revenue streams: studio subscription (floor) + furniture margin (upside). First real dollar = margin on a furniture sale. Studios *do* pay for The Document. | Kody, Q3 |
| S4 | Service promise. Studio: "you won't notice Patina." Homeowner: "engaged daily, one agreed direction." Never optimize the studio surface for engagement. | Kody, Q4 |
| S5 | Differentiators ranked for 12 months: Document · Pledge · makers · capture · Engine. Customer-visible refusal: no lock-in, no hidden fees, no unclear pricing. | Kody, Q5 |
| S6 | Patina remains a venture of Middle West Studio for now (see V4). | Kody, Q1 |

---

## Open — needs a ruling

### V1 · Margin pocket — 2026-09-01

**Question:** Patina's furniture margin — carved from the maker's trade discount (v4: 18% blended, "carved not stacked") or a slice of the studio's own 25% procurement markup?
**Why it matters:** Different parties pay. v4's whole maker argument ("defensible because it's carved") depends on the first answer; `my-company.md`'s $10K procurement line assumes the second.
**Blocks:** Any maker pricing conversation; the recruiting sheet's money line; Design Chicago maker pack.

### V2 · Studio price — 2026-09-01

**Question:** Keep Designer Pro $49 / Studio $149 (my-company.md), or a single studio tier? Is a solo tier coherent with the "first hires" trigger?
**Why it matters:** Sets the floor stream and the number on the recruiting sheet.
**Blocks:** Recruiting sheet money line; pricing page.

### V3 · Consumer cohort — 2026-09-01

**Question:** Pause the consumer Founding Circle (0/200, ten weeks at zero) until at least one studio beyond Leah's is live on The Document?
**Why it matters:** The marketing engine's lead cohort is one the vision says isn't the customer. Its three re-queued recommendations are all consumer-facing.
**Blocks:** Next marketing-engine run's cohort targets.

### V4 · Entity — 2026-09-01

**Question:** Stay a venture of Middle West Studio, or form a separate LLC before Design Chicago?
**Why it matters:** Co-founder equity, IP chain-of-title, trademark filings (Patina, Aesthete Engine, Strata Mark), Pledge contract counterparty, separate Cloudflare account.
**Blocks:** Trademarks; Pledge counsel review; any public "co-founder" byline.

### V5 · Thesis line — 2026-09-01

**Question:** "Where Time Adds Value" — canon or retire?
**Why it matters:** Lives in memory and pitch decks, not in any repo file. If canon, it belongs in VISION.md §1 and the brand doc; if not, it should stop appearing.
**Blocks:** Nothing. Cosmetic until Design Chicago copy.

### V6 · Pledge × subscription — 2026-09-01

**Question:** Studios pay a subscription (S3) *and* receive Pledge royalties. Different streams on paper — does "you pay us and we pay you" survive Leah's ear and counsel's review?
**Why it matters:** Shapes how the Pledge is described to designers; the workshop flagged it and v0.1 nearly stated it as settled.
**Blocks:** Any designer-facing Pledge copy (already legal-gated).

---

## Drift owed (documents now contradicted by C1)

| Doc | Contradiction | Fix |
|-----|---------------|-----|
| `Strata/.../my-company.md` (2026-06-23) | Three equal surfaces; $49/$149 + 15% + 25% numbers | Rewrite §"What we are" to point at VISION.md; strike pricing pending V1/V2 |
| `Patina-docs/CLAUDE.md`, `02-product/master-prd.md`, `01-vision/brand.md` | "AI-powered", consumer-first personas, affiliate revenue | Mark Superseded in status header; link VISION.md |
| `docs/design/the-document/leah-session-05-one-pager.md` + `Strata/.../Pricing-Strategy.md` | "no platform fee for designers on their own client relationships" | Add superseded note referencing S3 |
| `Patina/aesthete-engine-product-brief.md` (2026-07-01) | Engine framed as #1 differentiator | Add "long-term thesis, not the 12-month wedge (S5)" to its status header |
| `Patina/marketing-engine/PATINA-MARKETING-ENGINE-PLAN.md` | Consumer 200 / Designer 50 / Maker 15 with consumer lead | Re-order cohorts studio-first once V3 rules |

---

## Ruled — 2026-09-02 (First Flight, the iOS TestFlight round)

### V7 · The iOS app may use a tab bar — 2026-09-02

**Question:** VISION §6 refuses tab / zone / dashboard UI. The iOS app's shipped root under ruling **D1**
is a four-tab bar (Today · Spaces · Pieces · Studio, with the Companion in the bar's trailing slot).
Does §6's refusal bind surface #2, or only surface #1?

**Decision:** **The iOS app — surface #2, "the studio's front door" — may use a tab bar. The Document —
surface #1 — still may not.** The refusal is about the *studio's working surface*: a designer's document
is one continuous thing and splitting it into tabs is what makes competitors' tools feel like software.
The homeowner app is a different instrument with a different job — four fixed places a client returns to
daily — and the flag that mounts that root (`house-first`) is on for every round-one tester, so the
four-tab root is what ships, not a variant. This is a **scoped exception**, not a softening of §6:
every other refusal in §6 (no zones or dashboards, no shadows, no red/green status, no badges as
decoration, no engagement optimisation, no "AI" label) applies to the iOS app unchanged, and nothing here
licenses a tab bar anywhere in The Document.

**Source:** Kody interview, 2026-09-02 —
`artifacts/ios-testflight-polish-2026-09-01/build/rulings-2026-09-02.md` (rulings **D1** and **V7**).
Consequences of the same ruling: `artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/retier-D1.md`
(twelve findings re-tiered against the shipped root) and `build/PROGRAM.md` §11.

*Entries add: C1 · S1–S6 · V1–V6 · V7 · last id = V7*

---

## Ruled — 2026-09-04 (the client page)

### V8 · The web client page is surface #1's client-facing face, not a fourth surface — 2026-09-04

**Question:** S1 ranks three surfaces — The Document → iOS app → marketplace. The client portal
(`apps/client-portal`, `client.patina.cloud`) is a fourth codebase with its own deploy, its own domain,
its own route tree. Does it stand as a fourth surface alongside the ranked three, or is it part of one
of them?

**Decision:** **The web client page is surface #1's client-facing face — the homeowner-facing side of
The Document — not a fourth ranked surface.** The Document is where the studio keeps the record; the
client page is where the studio's own client reads it. One record, two doors. This is a naming and
ranking correction, not a rebuild: the client portal keeps its own codebase, deploy, and domain: what
changes is how it counts against S1. Ranking a fourth surface never served the point of S1, which was to
force a choice under constraint ("the designer tool is the one surface kept if only one could be") — a
homeowner-facing view of the studio's own document was never a candidate for that trade, because cutting
it would not free the studio from anything; it would just stop delivering what The Document already
promises the studio's client.

**Consequence for S4.** S4's promise is two-sided: the studio "won't notice Patina," the homeowner is
"engaged daily on one agreed direction," and the rule "never optimize the studio surface for
engagement" binds explicitly to **the studio's own surface** — The Document and the iOS app's Studio
tab, the tools a designer uses to run her practice. It does not bind the homeowner-facing page. The web
client page **may be designed for daily return** the same way the iOS client app already is under V7:
a person checking in on her own house is not the engagement Patina refuses to chase in a designer's
working tools. Nothing here licenses tabs, badges, shadows, or engagement chrome in The Document itself
— those refusals in VISION §6 are unchanged and unrelated to this ruling.

**Source:** Kody, 2026-09-04, in the same interview that ruled the client portal's retirement
(`docs/design/the-document/DECISIONS.md` **R135**; `docs/superpowers/plans/2026-09-04-client-portal-retirement.md`;
`docs/superpowers/plans/2026-09-04-client-page-completion.md`; `docs/design/the-client-page/README.md`).

*Entries add: C1 · S1–S6 · V1–V7 · V8 · last id = V8*

---

## Ruled — 2026-09-08 (portal polish)

### V9 · The five principles of polish are doctrine; P1 binds client pages only — 2026-09-08

**Question:** A six-designer panel reviewed both portals against a professional-polish proposal and
returned five principles, three built specimens and a hundred-odd findings
(`artifacts/portal-polish-review-2026-09-08/synthesis.md`). Rules were deliberately off for the review
itself, so the panel could argue with what shipped rather than with the log. Two things needed
deciding before a line of build code: are the five principles doctrine or one design session's
opinion — and does the first of them, *the studio is the author; Patina is the press*, bind the
designer portal as well as the homeowner's page?

**Decision:** **All five are adopted as doctrine, and P1 binds client pages only.** In the order the
deck puts them (sheets 10–13):

1. **The studio is the author; Patina is the press.** Every *client* surface — the house page, the
   decision papers, the standalone invoice at `/pay/<token>` — opens with the studio's two-sided
   letterhead and closes with a colophon reading *"Prepared by {studio} · Sent through Patina"*, and
   no Patina wordmark stands above that colophon. Patina is the press: named once, at the foot, in the
   place a printer signs a book. **The Desk is carved out by name** (PP-9): the designer portal keeps
   its PATINA wordmark and its footer identity, because a designer's working tool is not a letter the
   studio sends to a client. This is the same distinction V8 already drew between the two faces of
   surface #1 — the studio keeps the record on one, the studio's own client reads it on the other —
   applied now to whose name is on the paper.
2. **Money, dates and names carry the largest true type.** A 15px floor in sentence case for money,
   dates, party names and consequence sentences; running heads and captions stay 11–12px metadata; one
   family for money (DM Mono, tabular); one date style, *11 September 2026*; the owed figure outranks
   the agreed figure.
3. **Every act shows its weight and its consequence.** Three tiers assigned by consequence and never by
   page, plus a fourth — a filled charcoal `terminal` act carrying its own amount, spent only where
   money moves or a paper is signed. One consequence sentence above every terminal act in every state;
   `aria-disabled` with a named reason, never `disabled`; the act replaced by its dated record.
4. **Honest imagery at real scale.** A source hierarchy enforced by caption — installed photograph,
   then the studio's own board or scan, then the maker's product photograph, then a drawn silhouette.
   Piece plates at 96–120px on desktop above a value threshold. An empty room is a name, a floor line
   and one sentence, never an outlined rectangle. Never stock, never a gradient standing in for a
   material.
5. **One scale, one rhythm; absence is silence.** `docs/design/house-sheet/SPEC.md` is the type and
   rhythm contract for both portals — seven type steps plus the money step, a 24px module, three radii,
   three paper stocks, state pigments only — **applied surface by surface as each is touched**, not as
   a licence to restyle a surface nobody is working on. Wrap, never truncate. A region with nothing to
   say renders nothing.

**And concept renders are admitted, under a fence** (PP-7). A render the studio uploads for that
project, carrying a ≥14px label on the image itself reading *"Concept · not installed"*, may be the
first image in a room band when no installed photograph of that room exists. Generated imagery from any
other source is not permitted, and nothing generated is ever captioned as the client's home. This is the
one place the five principles' honesty rule bends, and it bends because a studio's own concept work *is*
honest work — it just has to say what it is, on the image, at a size a person reads.

**Rules are back on.** They were off for the review; the amendments this ruling requires are written
into `docs/design/the-document/DECISIONS.md` as **R139** (amending I107), **R140** (amending R126),
**R141** (amending R135), **R142** (extending R107, the Room View entry) and **I153** (the house
sheet's canonical home), and into `apps/designer-portal/CLAUDE.md`. Build starts on amended rules, not
on a proposal (PP-6).

**Consequence for the refusals in VISION §6 — what this does not license.** Nothing here relaxes a
single refusal, and the whole of it is worth stating plainly because "polish" is the word under which
chrome usually arrives:

- **No shadows.** No depth was adopted anywhere in this program. R126's one `--elevation-sheet` token
  stays at its three sites, the CSS-level shadow gate stays, and the eslint `no-restricted-syntax` D4
  rules stay. A filled terminal act is flat charcoal, not a raised button.
- **No badges, no status dots, no pills, no ✓ glyphs, no spinners, no green success fills.** The
  `terminal` tier is one filled control at one kind of moment; it is not permission for a button
  library.
- **No dashboards, and no engagement metrics.** Nothing in these five principles asks a surface to
  count anything at a person. The landmark ledger under the doorplate is a table of contents for the
  page a reader is already on, not a header and not a nav; V8's carve-out that the *homeowner's* page
  may be designed for daily return still does not license measuring her.
- **No tab bars anywhere in The Document** (V7 · D1, unchanged), and no engagement chrome in the
  studio's own working tools (S4, unchanged).

**Source:** Kody, 2026-09-08 — `artifacts/portal-polish-review-2026-09-08/rulings.md` (**PP-1**…**PP-9**),
the deck `artifacts/portal-polish-review-2026-09-08/deck/index.html` (sheets 10–13 the principles,
14–16 the specimens, 17 the ruling), and the panel synthesis
`artifacts/portal-polish-review-2026-09-08/synthesis.md`. Carried out in
`docs/superpowers/specs/2026-09-08-portal-polish-build-design.md` and
`docs/superpowers/plans/2026-09-08-portal-polish-build.md`.

*Entries add: C1 · S1–S6 · V1–V7 · V8 · V9 · last id = V9*

## Ruled — 2026-09-11 (hour tracking)

### V10 · A ledger is not a dashboard — §6 strengthened, not weakened — 2026-09-11

**Ruled.** VISION §6's refusal of dashboards gains one explicit exception, written as a test rather
than as a carve-out: **a total is permitted as the front matter of the rows that produced it; a total
with no rows beneath it is a dashboard.** The Hours sheet is a permitted reporting surface on exactly
that condition — its scope lens (mine · a member · this project · the studio) shows day-grouped rows
in every scope, and every total it prints sits above the rows it came from.

**This strengthens §6; it does not relax it.** The refusal now has a falsifiable test, so the next
proposal for a tile, a card, or a "studio week at a glance" number is refused by rule rather than by
taste. Specifically still refused, and named so they cannot be re-argued as polish: a per-member
utilisation score, a leaderboard, a ranking, a streak, a target, a burn-down, a progress bar, a
sparkline, a red/green state, a bare studio total on the Desk `hours` card (HT-29 — the card is
act-bearing or absent), a `/hours` page, an admin-portal hours route, a tab bar, and a staff dropdown
ranked by hours (HT-8, HT-32). The billing-state chip stays as built — a 1px-bordered text pill with
no fill, which is a table's state column and not a status badge (HT-40).

**Two companion entries ruled the same day, recorded here because both are VISION-level and neither
costs a line of code:**

- **Patina Field is The Document off-desk, not a fourth surface** (HT-33). §5's ranking is unchanged:
  The Document → the iOS app → the marketplace. Field's capture surfaces are doors into The
  Document's own Hours ledger, so a literal §8 test does not park them as a side journey.
- **D9 is amended** (HT-32) to read: *capture belongs wherever the work happened; review belongs only
  in the drawer ledger, never a page.* The old wording was at once too narrow to authorise ⌘K / Field
  capture and too weak to forbid the `/hours` page someone will propose.

**The sentence §6 itself gains**, to be inserted as a new bullet immediately after `VISION.md:73`
(`**Tab / zone / dashboard UI, shadows, red/green status, badges.** One living Document,
typography-first.`), at the same indent:

> - **The one exception, and its test.** A ledger is not a dashboard: a total is permitted as the
>   **front matter of the rows that produced it**, and a total with no rows beneath it is a
>   dashboard. The Hours sheet is a permitted reporting surface on exactly that condition. Nothing
>   here licenses a utilisation score, leaderboard, ranking, streak, target, burn-down, progress bar,
>   sparkline or red/green state — those stay refused (V10, 2026-09-11).

**`VISION.md` is untracked in git** (`git ls-files docs/vision/` returns only this file; the document
lives in Kody's working tree alone), so the bullet above could not be committed with this entry. It is
recorded here verbatim and owed as a one-line paste. Nothing else in §6 changes; the bullets at
`:70-72` and `:74-76` are untouched.

**Source:** Kody, 2026-09-11 — `artifacts/hour-tracking-2026-09-11/rulings.md` (**HT-30**, **HT-32**,
**HT-33**), the panel synthesis `artifacts/hour-tracking-2026-09-11/synthesis.md`, and the build plan
`artifacts/hour-tracking-2026-09-11/build/plan-v2.md`.

*Entries add: C1 · S1–S6 · V1–V7 · V8 · V9 · V10 · last id = V10*
