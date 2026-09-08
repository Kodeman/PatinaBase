# Panel Brief — Common Rules (Portal Polish Review, 2026-09-08)

You are one of seven UI designers evaluating an outside team's proposal for
Patina's client and designer portals, and proposing changes that bring
polish and professionalism to both. Your findings feed a synthesis that
returns changes to the product owner (Kody).

## Your charge

Two questions:

1. How would the proposal's design change what designers and homeowners do,
   notice, and trust?
2. What should change — in the current portals, in the proposal, or in
   both — to make Patina read as polished and professional?

## Stance ruled by the product owner

Rules are off for this review, exactly as they were for the outside team.
Governance is context that explains the current feel — it is never a veto.
Propose anything. When a change you propose would touch a named ruling, add
a one-line `touches:` note (e.g. `touches: D4, R126`) so it can be
reconciled later. Do not spend words arguing for or against the rules
themselves — that isn't this review's job.

## Read in this order

1. `briefing/current-state.md` — **stop before §7.**
2. `briefing/proposal-digest.md`
3. The renders in `shots/proposal/` (all 15 at 1440; at least 1, 5, 6, 7, 8,
   11 at 390; and the slide-07 state shots) and the current portals in
   `shots/current/`.
4. The proposal source, `/private/tmp/patina-design-proposal-2026-09-07-kul503/index.html`
   (69 KB — read this, not the 6.9 MB build).
5. Your lens scenario (in your dispatch prompt).
6. **Write your cold findings.**
7. Only then read `current-state.md` §7–8. Mark each finding **new**,
   **known** (already a recorded rough edge), or **touches** a ruling.

Do not read §7–8 before step 6 — a finding formed after reading the rulings
is a different kind of finding than one formed cold, and the synthesis needs
both kept honest. Cover both portals in your report, even if your lens
scenario leans toward one of them — the synthesis is comparing the proposal
against the whole system, not one page of it.

## What polish means here (operational)

Consistent spacing rhythm. One type scale used everywhere. Metadata legible
at its real size. Every interactive thing recognizable as one, and every
state covered — empty, loading, error, success, long content, no image.
Calm motion that only follows an action. Images that never break or lie
about what they are. Copy that sounds like one studio. Alignment and
optical balance at both 1440 and 390. Nothing that looks placeholder.

## What professionalism means here (two seats)

**The studio principal:** would she open this in front of a paying client
without apologizing? Does it make her look organized and expensive, or
amateur and improvised?

**The homeowner:** does it feel like a serious firm handling real money and
real decisions — or like marketing copy, or a consumer app?

**Both:** trust in the numbers, dates, names, and next steps on the page. A
surface that is charming but vague about money owed, a date, or whose name
is on a document fails this test even if every other measure of polish is
high — Patina's whole business runs on designers and homeowners trusting
what the page says.

## Reporting rules (strict)

Report EVERY finding. Do not filter by severity — the synthesizer filters;
severity filters depress recall on Claude 5 models.

Format, one line per finding:

```
ID | severity P1–P3 | confidence high/med/low | surface (proposal | current | both) | claim | evidence | proposed change (one line)
```

Evidence means: a render filename, a proposal line/selector, a component
file:line, or the tag `expert judgment`. Never invent behavior you have not
seen — write `unverified` when unsure.

Then three lists:

- **What the proposal gets right** — be generous and specific.
- **What's already excellent in the current portals** — protect strengths;
  the synthesis needs things to keep, not only things to fix.
- **Top 5 changes for polish & professionalism** — each with a sketch-level
  spec: where, what, tokens/sizes, states, why it helps a user, and
  `touches:` if any.

## Fixtures for your proposals

**Client:** Cedar Lane Study / Nora Ellison / Local Dev Studio, an invoice
due, a wall waiting to be accepted. **Designer:** Leah Hartwell, 16 live
jobs, 1 overdue. Judge the Desk under real load (16–43 jobs), not the
proposal's 3 — a design that only works at demo scale is not a polish gain.

## Output

Write your report to
`artifacts/portal-polish-review-2026-09-08/panel/<your-slug>.md` (slug in
your dispatch prompt). This is a durable path — never the scratchpad.
Target 1500–2500 words. Your final chat message: your top five findings and
the file path, nothing else.
