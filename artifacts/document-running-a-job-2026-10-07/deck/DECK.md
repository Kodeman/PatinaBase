# DECK: "Running a Job", the founder deck

This is the build contract for the deck builder. You write `deck/src/index.html` and `deck/build.mjs`. The orchestrator runs the build once the specimens land.

**Audience:** Patina's founding team. They are smart, busy, and will read this on a laptop and sometimes a phone.
**Job of the deck:** show why designers get lost running a job in The Document, and get the founders' input on three directions and eight canon questions.
**Tone:** plain, direct, evidence first. Every claim points at a screenshot, a finding id or a file:line.

## 0. Sources (read all of them before writing)

All under `/Users/kody/Code/patina-merged/artifacts/document-running-a-job-2026-10-07/`:
- `synthesis/direction.md`: **the spine of the deck.** It holds the thesis, the agreement table, the splits, the three directions, the slices, the founder questions and the asks for Leah. Deck copy may tighten its wording, but must not change its claims.
- `walk/WALK.md` and the walk JPEGs: the evidence.
- `briefing/current-state.md` (stage action tables, 13 contradictions) and `briefing/prior-art-delta.md` (what August promised and what's live).
- `review/r1-opus.md`, `review/r2-fable.md`, `review/r3-sol.md`: the three reviews. Quote at most one short line from each, attributed.
- `specimens/SPEC.md`: the frame ids and what each frame shows.
- `BRIEF.md`: the ask, canon and scenarios.
- **The house deck to match:** `/Users/kody/Code/patina-merged/artifacts/procurement-buying-review-2026-10-05/deck/src/index.html` and `.../deck/build.mjs`. Read both fully. Reuse the deck's CSS architecture, sheet grammar, iframe-scaling technique, keyboard paging and theme handling. Don't reinvent them.
- Voice: `/Users/kody/Code/patina-merged/.claude/skills/patina-brand-voice/SKILL.md`.

## 1. Files

| File | What |
|---|---|
| `deck/src/index.html` | The deck source, with placeholders |
| `deck/build.mjs` | Adapted from the procurement build.mjs (see §3) |
| `deck/index.html` | Build output. You build it with `--placeholder` to check layout; the orchestrator rebuilds it for real |

**Page contract** (the Artifact host wraps the file in its own skeleton):
- `src/index.html` begins with `<title>Running a Job</title>`, then the Google Fonts `<link>` tags, then one `<style>`.
- After that comes the content, then `<script>`.
- **No** `<!doctype>`, `<html>`, `<head>` or `<body>` tags of its own.
- Fonts: Playfair Display, Inter and DM Mono from Google Fonts only, each with a fallback stack.
- No other external resource. Vanilla JS.

**Theme:**
- Tokens on bare `:root`. Use the token block from `procurement-buying-review-2026-10-05/specimens/SPEC.md` lines 66–145.
- Dark values under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…; color-scheme: dark} }` and again under `:root[data-theme="dark"]`.
- `body` paints `var(--paper)`.

**Phone:**
- At 390 there is no horizontal page scroll, and the side gutter is 16px or more.
- Wide tables and specimen frames sit in their own `overflow-x: auto` container, or scale down to fit.

**Bans:**
- No `box-shadow`, no `text-overflow`.
- None of these words: "AI", "curated", "luxury", "bespoke", "Pledge", "Where Time Adds Value", "seamless", "unlock", "empower".
- No emoji. No `window.print`. No download links.

**Model names:** naming the reviewers' models is fine (Opus 5.5, Fable 5.1, GPT-6 Sol). Never call the product or the reviewers "AI".

## 2. Sheets

Each sheet is one scroll-snap section with an `id` that's a plain token (`#s-thesis`). Keyboard paging works: ←/→, PgUp/PgDn, space, Home/End.

A sheet may run taller than the viewport when it holds a specimen frame. In that case, turn snapping off for that sheet (`scroll-snap-stop` normal) so the reader can scroll through it.

Number sheets in a DM Mono running head only, e.g. `07 / 24`. The numbers encode real order.

1. **Cover.** Title "Running a Job". Subtitle: "Why designers get lost in The Document, and three ways to show them the way." Meta line: `7 October 2026 · for the founding team · reviewed by Opus 5.5, Fable 5.1 and GPT-6 Sol`.
2. **The ask.** Kody's words: designers are getting lost and don't know what to do. One paragraph on who is lost: the first hire, opening a job someone else wrote (VISION §2's studio moment).
3. **The thesis.** The synthesis §1 bold sentence, set large. Under it, the six devices that each answer "what now?" (band, spine, letterhead, region heads, margin, ⌘K), drawn as a simple inline-SVG or HTML diagram. Each device carries its own word for the same next step, taken from the briefing's contradictions.
4. **We tried this in August.** A dated sequence: 25 Aug wayfinding review (92 findings), R124/R125 built, 28 Aug the lens proposal R127, the job ticket deleted (48d5b0de5). Then why it didn't land: every gate was geometric and none was a task. Source: synthesis §1 and `prior-art-delta.md`.
5. **Five tasks, two people.** A table: the five scenarios × Leah and the first hire, using WALK.md's results (found immediately / found after search / not found / found only via key) and step counts. A thumbnail of the key screenshot per row.
6. **What the walk saw (1).** Large screenshots with captions: `s3-step1-cmdk-no-match.jpg` ("sectional": No match) and `s5-step1-olsen-opened.jpg` (cold open: no stage word, two needs at equal weight).
7. **What the walk saw (2).** `install-1440.jpg` (install week led by a setup chore) and `care-1440.jpg` (ONGOING vs "Project completed.", two Care heads). Also mention `direction-1440.jpg` (a leaked engineering note), with a small image.
8. **Where all three reviewers agreed.** The synthesis §2 table, A1–A10. Columns: finding · R1 · R2 · R3 · severity. Use a mark per reviewer, not colour alone.
9. **Where they split.** Synthesis §3 as four short blocks, plus "unique catches".
10. **Three directions, one move.** Three columns: A One Voice, B Whose Move, C Ask the Paper. Each with one line, its four tags (surface · moment · stream · promise) and the findings it resolves. Under them: "These are layers, not rivals."
11. **A · One Voice.** Today `walk/project-1440.jpg` beside or above frame **a1**, then the "what changed" list.
12. **A · one name for each act.** Today `walk/direction-1440.jpg` and frame **a2**, then frame **a3** (the label table).
13. **A · on the phone.** Today `walk/project-390.jpg`, then frames **a4** and **a5**.
14. **B · Whose Move.** Today `walk/s5-step1-olsen-opened.jpg` and frame **b1**.
15. **B · the Desk hands work out.** Today `walk/s1-step1-desk-landing.jpg` and frame **b2**; frames **b3** and **b4** (phone).
16. **C · Ask the Paper.** Today `walk/s3-step1-cmdk-no-match.jpg` and frame **c1**.
17. **C · Record a change.** Today `walk/s2-step1-chen-opened.jpg` and frame **c2**.
18. **C · install week.** Today `walk/install-1440.jpg` and frame **c3**; frames **c4** and **c5** (phone) beside `walk/install-390.jpg`.
19. **Recommendation.** The synthesis §5 slice table (Slices 0–3), with "why first" for each.
20. **How we'll know.** Acceptance: the five scenarios, walked by someone who didn't build the job, at 1440 and 390, with step counts. This replaces geometry-only gates.
21. **Questions for the founders.** Synthesis §6, Q1–Q8. Each is a numbered card with the ruling id in DM Mono, the question, and one line on the cost of saying no. The numbering is real, because the questions are referenced as Q1–Q8.
22. **What we need from Leah.** Synthesis §7.
23. **Repairs, whatever we choose.** Slice 0's list as a plain checklist-style list (no checkboxes), each with its evidence id.
24. **How this was made.** A team table:

    | Seat | Model | Tickets |
    |---|---|---|
    | B0 briefing + walk | Sonnet | SQ-471/472 |
    | R1 | Opus 5.5 | SQ-473 |
    | R2 | Fable 5.1 | SQ-474 |
    | R3 | GPT-6 Sol, produced single-shot through the local model gateway (provenance header in r3-sol.md) | SQ-475 |
    | Specimens | Opus 5.5 | SQ-476–478 |
    | Deck | | |

    Then: evidence is code plus a local seeded walk, no production. Name the file paths of the reviews.

**Today vs proposed pairing.**
- At ≥1100px: today (the JPEG, scaled to the column) sits above the proposed frame, each with a DM Mono label: `TODAY · walk/<file>` and `PROPOSED · frame a1`.
- Side by side only when both are phone frames.
- At 390 everything stacks.

## 3. build.mjs

Adapt the procurement build:

1. **Specimen placeholders:**

   | Token | File | Uses |
   |---|---|---|
   | `{{SPECIMEN_A_1440}}` | `specimens/proposed-a-1440.html` | 3 |
   | `{{SPECIMEN_A_390}}` | `specimens/proposed-a-390.html` | 2 |
   | `{{SPECIMEN_B_1440}}` | `specimens/proposed-b-1440.html` | 2 |
   | `{{SPECIMEN_B_390}}` | `specimens/proposed-b-390.html` | 2 |
   | `{{SPECIMEN_C_1440}}` | `specimens/proposed-c-1440.html` | 3 |
   | `{{SPECIMEN_C_390}}` | `specimens/proposed-c-390.html` | 2 |

   Each is used as `<iframe name="frame-a1" srcdoc="{{SPECIMEN_A_1440}}" title="…">`. The `title` names the frame.
2. **Bootstrap:** the same as procurement's, but it reads `/frame-[a-z0-9]+/` from `window.name` and sets `location.hash = m[0] + "&nobar"`. It hides `.bar, #bar, .framebar, #framebar` and keeps the deckSpecH height postMessage. The specimens' frame bar is whatever class the builders chose. The `nobar` hash token hides it regardless; keep the CSS hide as a fallback.
3. **Walk images:**
   - `{{WALK:<file>.jpg}}` tokens are replaced with `data:image/jpeg;base64,…` read from `../walk/<file>.jpg`.
   - A missing file fails the build.
   - Use `<img src="{{WALK:…}}" alt="…">` with meaningful alt text, `loading="lazy"` and `decoding="async"`.
4. **Sentinel check, the `--placeholder` mode and the 16 MB guard,** exactly as in procurement. In `--placeholder` mode, a walk image still inlines; only specimens get the pending page.
5. **Exit codes:** 0 on success, and 1 with a named reason otherwise.

## 4. Done when

- `node deck/build.mjs --placeholder` exits 0.
- You rendered `deck/index.html` at 1440 and 390, light and dark, and looked at it, using `node /Users/kody/Code/patina-merged/artifacts/people-room-crm-2026-09-11/tools/render.mjs <file> --out <artifact>/deck/_renders --name deck --widths 1440,390 [--dark]` with the sandbox off. `_renders/` is not committed.
  - There is no horizontal scroll at 390.
  - Keyboard paging works.
- `grep -nE 'box-shadow|text-overflow|\bAI\b|curated|luxury|bespoke|Pledge|Where Time Adds Value' deck/src/index.html` prints nothing.
