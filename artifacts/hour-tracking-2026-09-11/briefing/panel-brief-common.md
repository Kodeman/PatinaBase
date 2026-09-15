# Panel brief — the shared charge

Every seat reads this file first, then `current-state.md` (§0 and the section for its surface), `rulings-digest.md`, and `architecture-draft.md`. Then its own seat prompt.

---

## 1 · Kody's ask, verbatim (2026-09-11)

> Review the implimlimentation. The hours should be easy to log, see my hours, or a studio members hours, a project hours or hours of the studio as a whole. Hours should be track who did the work, what the work was, what proejct, what the bill rate is, billable or non billable, etc. Have a panel of project managers and UX UI experts review Patinas time tracking interface thorugh the Patina Field and designer portal app. Capturing hours should be seamless, and easy to do so that a stuido memebr can log hours wherever tehy are without friction. Put together a proposal on hour to build out the hour tracking in Patina and flush out its capabilities. Present the proposal in an HTML presenation, this is a business first function, we can skip all the prose.

## 2 · Kody's four program rulings (interview, 2026-09-11)

1. **Panel method = code + docs review only.** No live walks, no Simulator. Every friction claim is derived from the source (click paths, tap counts, fields, states) and cited to a path:line. Say "derived from source" where an observation would normally come from a walk.
2. **Standing rulings are open for challenge.** R19 auto-start, D10 never-trim, R64 abandonment, R69 minute readout, Vision §6 no-dashboards — any of them may be challenged. A challenge must (a) be tagged `CHALLENGES: <id>`, (b) state what overturning costs (code, Leah's trust, the vision promise), and (c) offer the compliant version too.
3. **The proposal carries waves + effort bands + dependencies + ship gates.** Effort bands: S ≤ 2 eng-days · M 3–5 · L 6–10 · XL > 10.
4. **Business-first deck, no prose.** Findings that cannot be expressed as a table row, a count, a matrix cell, or a one-line decision will not survive to the deck. Write your memo so the synthesis can lift rows straight out of it.

## 3 · Governance stance

Governance is context, never a veto. But a ruling overturned without its cost named is a finding the critic will strike. Read the source ruling before you cite it; the digest paraphrases.

## 4 · The seven cruxes — every seat judges on all seven

| # | Crux | The question |
|---|---|---|
| **i** | **Capture friction** | Taps / keystrokes / seconds from "I did work" to "it's logged" — web, phone, offline. Today vs proposed, counted from source. |
| **ii** | **Attribution completeness** | Who / what / project / rate / billable on every entry — including admin time with no project, and a member with no agreement role. |
| **iii** | **The four views** | My hours · a member's hours · a project's hours · the studio's hours. Who may see whom (`organization_members.member_role`: owner / admin / member / guest). |
| **iv** | **Rate truth** | Where a bill rate comes from for every entry, on every project kind; rate history; who edits it and where. |
| **v** | **The money hand-off** | Unbilled → invoice; approval / lock; export (CSV, per-client statement, QuickBooks); what a bookkeeper needs on Friday. |
| **vi** | **The vision tension** | Reports without dashboards (§5/§6); capture without surveillance (§4, R19); "you won't notice Patina" vs "log hours wherever you are." |
| **vii** | **What it removes** | Dead code (`useStudioTimeReport`), view drift (`project_unbilled_time`), orphaned fields (`project_phases.estimated_hours`, `profiles.default_hourly_rate_cents`), stale docs. |

## 5 · Vision, quoted

`docs/vision/VISION.md:50` — **"To the studio: you won't notice Patina.** It is not a place you go. It prompts and collects information when and where you need it, then gets out of the way. Success is that she doesn't notice — so we will never optimize the studio surface for engagement."

`docs/vision/VISION.md:31` — "The studio owner is delegating for the first time, her own hours are already spoken for twice, and the thing she cannot afford is a new system to learn."

`docs/vision/VISION.md:73` — saying no to: "Tab / zone / dashboard UI, shadows, red/green status, badges. One living Document, typography-first."

## 6 · House sheet

`docs/design/house-sheet/SPEC.md` — read **§A** (type families, ink, paper) if your memo proposes anything visual. Where §A–§E and §F disagree, §F wins (`SPEC.md:7`).

## 7 · Your memo — the contract

Write `artifacts/hour-tracking-2026-09-11/panel/memo-<seat>.md` with exactly these sections:

1. **Seat and stance** — three lines: who you are, what you optimise for, what you distrust.
2. **Findings** — a table. Columns: `ID` (`<SEAT>-1…n`) · `Crux` (i–vii) · `Severity` (blocker / major / minor / note) · `Confidence` (high / med / low) · `Finding` (one sentence, present tense, about today) · `Evidence` (path:line) · `Recommendation` (one sentence) · `Challenges` (ruling id or `—`). **Report every finding — no severity filter.** The orchestrator filters at synthesis.
3. **Counts** — friction counts you derived from source, as a table: action · surface · taps/keys today · taps/keys proposed · what changes.
4. **The four views** — your recommended shape for each of my / member / project / studio, one row each: where it lives · who sees it · what it shows · what it is NOT (no dashboard).
5. **Ruling challenges** — each on its own row: ruling · what you'd change · cost of overturning · compliant fallback.
6. **What to delete** — rows.
7. **Return** — end with the structured output the workflow asks for (the tool call), summarising the table.

Rules: READ-ONLY against the repo except your own memo path. Prefer Serena symbolic tools scoped to one workspace for code reading (`mcp__serena__get_symbols_overview`, `find_symbol`, `find_referencing_symbols` via ToolSearch); grep/sed for Swift if symbols are incomplete. Cite path:line for every finding. Mark inferences as inferences. No live servers, no git mutations, nothing touching production.
