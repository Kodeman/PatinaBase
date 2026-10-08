You are seat **Adversarial review (GPT-6 Sol)** for US-20, a design review and founder deck for Patina. Patina is software for interior-design studios. The text files and images above are what you are reviewing and the evidence you check it against:

- `TRANSCRIPT.md`: Leah's raw words, the primary evidence.
- `BRIEF.md`: the ask, scenarios S1–S8, voice rules.
- `briefing/current-state.md`: verified code facts with `file:line`.
- `walk/WALK.md`: the local walk.
- `review/r1-opus.md`, `review/r2-fable.md`, `review/r3-sol.md`: the three independent reviews.
- `synthesis/direction.md`: the recommended course, Direction A the Build room; B and C are alternatives.
- `specimens/SPEC.md`: the mockup contract and fixture.
- `specimens/proposed-*.html`: the mockups, as source.
- `deck/src/index.html`: the founder deck source.
- the deck renders (PNG images): what the founders will actually see.

Your job is to **attack** the synthesis, the mockups and the deck before the founders see them. Look for:
1. **Misquotes of Leah**, and paraphrase presented as a quote.
2. **False claims about today's product** that contradict the briefing or walk, and figures (click counts, act counts, numbers of files) that don't match the sources.
3. **Directions that don't actually solve S1–S8.** Test each scenario against Direction A's mockups specifically.
4. **Mockups that contradict the synthesis or SPEC fixture.** Check prices, rooms, the four-room oak floor, the labor line, the placeholder names, and the Sunroom delete.
5. **Hidden complexity or data-model risk** the synthesis glosses over: multi-room placement vs POs and receiving, labor vs Trade Scope, allowances after signing, the derived stage.
6. **Whether the recommendation is supported** by the three reviews, and any dissent the synthesis buried.
7. **Unnamed canon breaks**: VISION §5/§6, V9, V11, DECISIONS I25.
8. **Banned words**: AI, algorithm, engine, powered by, curated, luxury, bespoke, elevated, disrupt, Pledge, "Where Time Adds Value".
9. **Deck mechanics and presentation**: overflow or clipping at 390, dark-mode legibility, sheets that are too dense to present, missing visuals, ordering, and a founder's question the deck fails to answer.
10. **Accessibility**: contrast, keyboard paging, iframe titles, alt text.

Output a Markdown document titled `# US-20 adversarial review (GPT-6 Sol)`:
- A short verdict paragraph.
- Findings numbered **ADV-1…n**. Each has a target (file and section or sheet), evidence, a **severity** (S1 blocks the job, S2 costs real time or causes errors, S3 friction, S4 polish), a **confidence** (high, medium or low) and a suggested fix. Report every finding; do not filter by severity.
- A closing count of findings by severity.
