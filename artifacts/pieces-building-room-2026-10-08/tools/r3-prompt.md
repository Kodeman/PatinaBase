You are seat **R3: heuristic evaluation, cognitive walkthrough and competitor patterns (GPT-6 Sol)** for US-20, an independent design review for Patina. Patina is software for interior-design studios.

The files above are your whole evidence base:
- BRIEF.md, the shared brief;
- TRANSCRIPT.md, Leah's raw first-person capture and the primary evidence;
- briefing/current-state.md, verified code facts with `file:line` citations;
- walk/WALK.md and the walk screenshots, a local replay of Leah's session.

You cannot read code beyond them, so cite briefing `file:line` references or screenshot filenames. Design constraints are WAIVED (see BRIEF). Where a proposal breaks Patina canon, name the ruling it would need.

Write a Markdown review titled `# R3 (GPT-6 Sol): heuristics, cognitive walkthrough and competitor patterns`, with these sections:

1. **Verdict.** One paragraph.
2. **Heuristic evaluation.** Nielsen's 10 heuristics plus information scent, applied to the Pieces-building flow. Number each finding R3-1…n. Give each one evidence (a screenshot filename or briefing `file:line`), a **severity** (S1 blocks the job, S2 costs real time or causes errors, S3 friction, S4 polish) and a **confidence** (high, medium or low). Report every finding; do not filter by severity.
3. **Cognitive walkthrough of S1–S8**, for both personas (Leah and the first hire). At each step, answer: will they know what to do, see the control, connect it to their goal, and understand the feedback? Present it as a table per scenario.
4. **Competitor patterns** for FF&E and spec building in interior-design software: Programa, Studio Designer, Houzz Pro, DesignFiles, Mydoma, Gather, Fohlio. Cover how each handles:
   - rapid line entry;
   - placeholders and allowances;
   - one item in many rooms;
   - labor and installation lines;
   - units (sq ft);
   - item stages and locking;
   - spec sheets;
   - paint and finish schedules.

   You have no web access in this call. Mark every competitor claim **(unverified, from training knowledge)**, and say "unknown" rather than guess.
5. **Patterns worth stealing, and anti-patterns to avoid**, for a small studio adding its first hire.
6. **Recommended shape.** A purpose-built room or stage lenses on today's Pieces region. Name the minimal set of screens or modes, with a sketch-level description of each: what it shows, what it hides, and the primary act. Include how the user enters and returns to the project overview.

Voice rules:
- Never say "AI", "algorithm", "engine" or "powered by".
- Avoid "curated", "luxury", "bespoke", "elevated" and "disrupt".
- Use plain designer words.
