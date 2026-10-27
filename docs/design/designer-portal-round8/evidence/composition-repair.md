# Composition repair — WP-01.V-R evidence

Wave 1, US-52. A visual evaluation (SQ-1833) compared the first round-8 job paper and studio against the approved reference (`artifacts/room-proof-round8-2026-10-23/`, `reference-cover-1440.png`). It found five layout defects. Two tickets repaired them: SQ-1952 (layout, copy and states) and SQ-1954 (title scale). This page records what changed, what proves it, and what was not checked.

## Findings and outcomes

| Finding (SQ-1833)   | Defect                                                                                   | Repair                                                                                                                          | Ticket  |
| ------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------- |
| F1                  | A third 232px grid lane for the margin at 1440                                           | The margin stacks inside the single 200px contents column, below "In this job"                                                  | SQ-1952 |
| F3                  | Job title painted at 34px, not commission scale                                          | The cover title's painted button uses the scoped `.r8-d0` display scale                                                         | SQ-1954 |
| F4                  | A floating "MARGIN · n" tab collided with the contents at 1180                           | No floating trigger from 1180 up; the margin acts stay keyboard-reachable through `OPEN_MARGIN_EVENT`                           | SQ-1952 |
| F5                  | First-use copy pointed at a left rail that does not exist                                | Round 8 gets its own first-use copy that names the real controls; legacy copy is unchanged                                      | SQ-1952 |
| F6                  | Studio commission spread gap was 45px                                                    | The gap uses mapped tokens: 48px at 1440, 24px at 1180                                                                          | SQ-1952 |
| SQ-1953 F1/F2 (LOW) | The loading status sat inside the busy skeleton, and the read-failure copy was imprecise | The status moves outside the `aria-busy` region; the read-failure copy is truthful, and retry happens only on an explicit press | SQ-1952 |

**Decisions held during the repair:**

- There is one margin column, not a third lane.
- The dock stays.
- Below 1180px, the existing MobileSheets margin sheet is unchanged.
- No data authority or mutation changes.

## Source

**SQ-1952** (candidate `edb14f70d`):

- `frame/round8-paper-frame.tsx` and `frame/round8-states.tsx`
- `margin-rail.tsx` and `margin-note.tsx`
- `paper/contents-margin.tsx`, `paper/margin-layout.tsx` and `paper/round8.css`
- `studio/commission-spread.tsx`
- tests

The page still builds `slots.margin` once (it is the unchanged `ResponsiveMarginRail`), and the round-8 frame places that slot after the contents. Legacy rendering keeps its defaults, including the compact margin drawer.

**SQ-1954** (candidate `d4af82865`): a CSS selector change plus tests. The F3 assertion now checks the **painted** title button. SQ-1952's own check measured only the `h1`, which proved nothing because the visible text is the button inside it.

## Executable proof

All runs used the live F01 fixture on local Supabase: 80 lines, 36 of them in the living room. Every run tore the fixture down to 0 projects and 0 actors afterwards.

| Check                                                 | Result                                                                                                                                                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQ-1952 capture `7b4e2f8f`                            | type-check; 13 Jest suites / 281 tests; Chromium composition + first-slice + states 14/14, no skips, retries 0                                                                                     |
| SQ-1952 negative control (original composition bytes) | 6 assertion failures: 34px titles at every width, 45px gaps                                                                                                                                        |
| SQ-1952 unit negative control                         | 4 assertion failures, 31 passes; the unaffected tests are accounted for                                                                                                                            |
| SQ-1954 capture `95177a3e`                            | type-check; 12 Jest suites / 275 tests; 9 Chromium e2e. Painted title is 68 / 56.64 / 49.152 / 40px at 1440 / 1180 / 1024 / 390. Width-growth ≥ 1.15. Edit mode keeps 68px, and Escape keeps focus |
| SQ-1954 negative control                              | 5 assertion failures on the prior bytes                                                                                                                                                            |
| Merged-tree G4, `c3bed1fd7` (after SQ-1963)           | `e2e/round8` on chromium + webkit-iphone: 83 passed, 3 skipped (viewport-conditional `test.skip`s in `paper-frame` and `ffe-unfold`), 0 failed                                                     |
| Merged-tree G2, `c3bed1fd7`                           | full designer Jest: 945 suites / 13,555 tests passed                                                                                                                                               |

The composition spec asserts these things:

- exactly two grid children (two columns);
- the main column is ≥ 1000px wide at 1440;
- the margin is stacked with no floating trigger at 1180 and 1440, and its controls are reachable by keyboard;
- the exact orientation copy;
- the painted title scale;
- the phone margin sheet;
- the studio gaps of 48 and 24.

## Screenshots

The screenshots are in the Sidequest verification store; they are not committed, to keep `docs/` small:

- Before: `verification/SQ-1952/negative-control/composition/before-{job-1440,job-1180,job-1024,job-390,studio-1440,studio-1180}.png`
- After, layout: `verification/SQ-1952/candidate/composition/after-*.png`
- After, title scale: `verification/SQ-1954/final/composition/after-job-{1440,1180,1024,390}.png`

The orchestrator compared the after-images against the reference:

- F1, F4, F5 and F6 at 1440 and 1180;
- the commission-scale title at 1440 and 390.

## Not verified

- **Manual screen reader pass.** Not done; it is owed in WP-11.
- **Image-led cover.** F01 has no cover image, so the cover with a photograph is unverified.
- **Full legacy G3 on WebKit.** Not run for this repair.
- **Code complexity and coverage.** No quality-gate plugin is installed here. SQ-1954 reported complexity only.

## Review

The merged wave was reviewed by another model (SQ-1832, Astra). Rounds 1–3 raised F1–F3, R2-F4/F5 and R3-F6, which were repaired in SQ-1958, SQ-1960 and `9f147f086`. Round 4 passed.
