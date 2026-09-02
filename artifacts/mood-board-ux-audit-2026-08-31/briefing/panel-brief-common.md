# Panel Brief — Common Rules (Mood Board UX Audit, 2026-08-31)

You are one member of an expert panel auditing the mood board creation suite in Patina's designer portal (live in production). Your findings feed a synthesis that will propose improvement paths to the product owner.

## Inputs (read in THIS order — the sequencing is a deliberate ruling by the product owner)
1. `briefing/current-state-inventory.md` (this folder's parent) — verified ground truth of what's built. STOP at the "Known-gap seed list" section; skip it for now.
2. `prod-test/report.md` — the production test report with findings and UX observations from a live signed-in session.
3. Your role-specific scenario/lens (in your dispatch prompt).
4. FORM YOUR COLD FINDINGS FIRST — write them down before step 5.
5. Only then read `docs/prds/MoodBoard/06-acceptance-evidence.md` (waived/adapted acceptance criteria) and `docs/prds/MoodBoard/README.md` (decision log + open items). Mark each of your findings as **new**, **known-waived** (matches a waived/adapted AC), or **ruled** (touches a locked ruling — keep it, but flag it and justify why it deserves revisiting).

## Reporting rules (strict)
- Report EVERY finding. Do NOT filter by severity — the synthesizer filters. Severity filters depress recall.
- Each finding: `ID | severity P1–P3 | confidence high/med/low | area | claim | evidence | suggested direction (one line, optional)`.
- Evidence means: a specific prod-test observation, a specific code fact from the inventory, or an explicit "expert judgment, no direct evidence" tag. Never invent behavior you haven't seen evidence for — if unsure whether something exists, say "unverified".
- Also produce a short "what's already excellent" list (the synthesis needs to protect strengths, not just fix gaps).
- Product context: Patina connects interior designers with manufacturers for custom furnishings. Boards are wired into a procurement spine (pins know their product/price, send-to-schedule, client verdicts feed decisions). This business wiring is the differentiator vs Canva/Milanote/Morpholio — weigh improvements that deepen it.

## Output
Write your report to `artifacts/mood-board-ux-audit-2026-08-31/panel/<your-slug>.md` (slug given in your dispatch prompt). Durable path — never the scratchpad. Your final message: top findings + file path only.
