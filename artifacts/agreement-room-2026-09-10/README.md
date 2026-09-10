# The Agreement Room, Reconsidered

**The ask.** Kody, 2026-09-10, on a production screenshot of `/drafting/<id>`: the composer is clunky, the preview too thin — "maybe it is the page and the builder is more of an overlay?"

**Kody's three program rulings.**

| # | Ruling |
|---|---|
| 1 | Three comparable directions, built to the same depth; the deck compares them and names the panel's pick. |
| 2 | Evidence = his screenshot + the source + the house sheet/rulings + a best-effort local production build of a seeded draft rendered at 1440 / 1024 / 390. No prod access. |
| 3 | Scope = the composer page + its "Preview client copy" sheet, **plus** the Review & send sheet and the "Return to the seven facets" act. |

**Folder map.**

- `briefing/` — brief, current-state capture, the four candidate directions, fixture, screenshot
- `panel/` — seven seat memos (editor, information, typography, Leah, critic, feasibility, Nora), 240 findings
- `synthesis.md` — the panel's synthesis; build contract at `specimens/SPEC.md`
- `specimens/` — `SPEC.md` + `direction-1.html` (D · the galley), `direction-2.html` (A · the paper is the page), `direction-3.html` (B · builder as overlay)
- `deck/` — `src/index.html`, `build.mjs`, built `index.html` — "The Paper, Under the Pencil"
- `shots/` — capture ledger (`README.md`, `capture-log.json`, `tools/`) committed; the 18 plates under `shots/current/` uncommitted
- `review/` — `01a-specimens-technical.md`, `01b-specimens-design.md`, `01c-deck-content.md`, `01d-deck-technical.md`, `02-fix-log-deck.md`, `02-fix-log-direction-1.md`, `02-fix-log-direction-2.md`, `02-fix-log-direction-3.md`, `03-rereview-deck-content.md`, `03-rereview-deck-technical.md`, `03-rereview-specimens-design.md`, `03-rereview-specimens-technical.md`
- `rulings.md` — this program's ruling sheet, blank until Kody rules

**The verdict, in three.** The panel's pick is D, "the galley" — four of seven seats rank it first, surer (2 moments of doubt) over A's faster run (3). Leah's re-walk of all five:

| | Today | A | B | C | D |
|---|---|---|---|---|---|
| Clicks | 54 | 33 | 41 | 53 | 39 |
| "Where am I / did it save" | 17 | 3 | 5 | 5 | 2 |

After the fix waves, the design reviewer's re-review reads the built specimens **A > D > B**: A now proves all seven cruxes and the gap has widened — D's only remaining edge is the one sentence Leah named, whether the printed part stays on screen while you rewrite it; B's unique advantages went to D and A while its 390 cost (no visible Send behind the open drawer) stayed put.

**One live prod defect, unrelated to any direction.** The paper and the room's only `Review & send` trigger are both `hidden min-[1180px]:block` — no way to open the send sheet at 1024 or 390 today. `room-shell.tsx:155`.

**Published**
- Deck: https://claude.ai/code/artifact/736766d5-60cb-4c17-a264-fa09cf972eb3
- Specimen D: https://claude.ai/code/artifact/3d453096-20bf-41bb-a948-b1c65af07d3d
- Specimen A: https://claude.ai/code/artifact/2523109d-5aff-45e6-a708-e76be7abf752
- Specimen B: https://claude.ai/code/artifact/3be5938d-c745-4b1b-beaf-4408f950b959

**Rebuild.** Deck: `node deck/build.mjs`. Re-render a specimen (per `specimens/SPEC.md` §8):

```bash
R=/Users/kody/Code/patina-merged/artifacts/portal-polish-review-2026-09-08/tools/render.mjs
node "$R" specimens/direction-1.html --out shots/specimens/direction-1 \
  --widths 1440,1024,390 \
  --state resting=#state-resting --state clause=#state-clause --state money=#state-money \
  --console
```

**What this program does not decide.** Which direction ships, and six other open questions — see `rulings.md`.
