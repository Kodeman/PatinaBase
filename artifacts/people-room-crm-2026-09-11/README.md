# Everyone on the Job: the People room as a construction CRM (panel, 2026-09-11)

Index for this panel's work: what was asked, who sat, how the direction was built, where the files are, and what still needs a ruling.

## 1. The ask

> Assemble a team of construction experts with a team of UX UI designers. Their goal is have a working session and brainstorm what the perfect CRM for construction looks like. Tracking people involved from every aspect of the project and different forms of contact from account access, app access, email or text only, etc. The team should identify the key components and pieces to track, then think about how that integrates into Patina's People room… This is a tactical business function, we can skip all the prose and use real world business terms.

## 2. Rulings taken by interview

Before the panel sat, two rulings fixed the scope: a studio-led residential design-build lens, and one converged redesign direction rather than three competing ones. Both stand as recorded in `briefing/panel-brief-common.md` §2.

## 3. The session

Six construction seats produced the field dictionary and the CRM model. Six UX seats then folded that model into the People room and the Call Sheet.

Construction seats:

| Seat | Role | File |
|---|---|---|
| CS1 | General contractor / project manager | `panel/construction/cs-1-gc-pm.md` |
| CS2 | Superintendent / field lead | `panel/construction/cs-2-superintendent.md` |
| CS3 | Estimator / preconstruction | `panel/construction/cs-3-estimator.md` |
| CS4 | Trade subcontractor owner | `panel/construction/cs-4-trade-sub-owner.md` |
| CS5 | Owner's representative / homeowner-side PM | `panel/construction/cs-5-owners-rep.md` |
| CS6 | Office manager, compliance and payables | `panel/construction/cs-6-office-compliance.md` |

UX seats:

| Seat | Role | File |
|---|---|---|
| IA | Information architecture | `panel/ux/ux-1-ia.md` |
| IX | Interaction | `panel/ux/ux-2-interaction.md` |
| VC | Visual and typography | `panel/ux/ux-3-visual.md` |
| FM | Field and mobile, 390px | `panel/ux/ux-4-field-mobile.md` |
| LH | Leah's walk (studio principal) | `panel/ux/ux-5-leah-walk.md` |
| AX | Accessibility and systems critic | `panel/ux/ux-6-a11y-systems.md` |

## 4. Method

1. Briefing: every seat read `briefing/panel-brief-common.md`, `briefing/fixture.md`, and `briefing/current-state.md` §A–§D and §F before writing a word.
2. Construction seats: six memos, cold findings first, each mapped against the gaps register only after writing.
3. CRM synthesis: `synthesis/crm-model.md` merged the six construction memos into one fifteen-entity model, a field dictionary, and a ranked top-10 gap list.
4. UX seats: six memos folded the CRM model into the People room's information architecture, interaction, visual craft, mobile, a designer's real walk, and an accessibility pass.
5. Direction plus SPEC: `synthesis/direction.md` converged the six UX memos into one direction, with every seat conflict resolved and named. `specimens/SPEC.md` turned the direction into a buildable state machine.
6. Two specimens: `specimens/people-room-1440.html` and `specimens/people-room-390.html`, seven states each (Directory, Person, Company, Roster, Add, Access, Bring forward), against the Okonkwo fixture.
7. Three-lens review rounds: design, technical, and a construction reread, three passes each, with fix logs after the first two.
8. Deck: `deck/build.mjs` inlined both specimens into `deck/index.html` for the walkthrough.

## 5. Folder map

| Path | What it holds |
|---|---|
| `briefing/` | The shared charge, the Okonkwo fixture, current-state read, and reference shots |
| `panel/construction/` | Six construction seat memos |
| `panel/ux/` | Six UX seat memos |
| `synthesis/` | `crm-model.md` (the merged CRM model) and `direction.md` (the one converged direction, rulings, and parked list) |
| `specimens/` | `SPEC.md`, the two width specimens, the shared style fragment and tokens, and `publish/` for the published URLs |
| `deck/` | The deck source and the built, inlined `index.html` |
| `shots/` | Rendered state captures at 1440 and 390, plus console logs |
| `tools/` | `render.mjs`, the render harness named in `specimens/SPEC.md` §9 |
| `rulings.md` | This panel's rulings, awaiting Kody |
| `README.md` | This file |

## 6. The verdict in ten lines

1. The room's unit changes from the party row to the person card; every project seat becomes a line beneath the human, and a firm becomes a card that owns paper and payment.
2. One list, two entry types: people are circles, firms are 42px rounded squares; eleven role chips collapse to six (Everyone, Clients, Crew, Makers, Studio, Firms) with trade on a second line.
3. Reach moves onto the Directory row, the three words Account / Field link / On paper stay, and a forbidding or routing contact rule prints beside them as a sentence, never as a fourth word.
4. Consent becomes one record per studio per channel value, printed against the number with its date and the job it came from, everywhere that number appears.
5. The company card becomes the only place a compliance document, a payee identity, a signer, or a paperwork contact is written; every other surface reads it.
6. Authority (who signs, up to what number, who only prepares) is written on the seat, defaulted from the agreement, and read on the person card and the Call Sheet.
7. The Call Sheet regroups by window (this week, later, done), puts bidders in their own band, and gains a site access card at its head.
8. Closing a seat becomes a dated act with a reason, Remove stops being a hard delete, and access grants end with the job's window instead of a flat 90 days.
9. Every phone is a live `tel:` link at every width, search matches phone digits, rows wrap instead of truncating, and the bare status dot retires.
10. What stays: the room and its rail, the six other views, MINE / STUDIO with STUDIO default, the Call Sheet as a DocSheet on the letterhead, code-resident vocabulary, and the Document's paper, scored ink, and zero box-shadow.

## 7. Published

| What | URL |
|---|---|
| Deck "Everyone on the Job" | https://claude.ai/code/artifact/9be6c6e0-af40-43be-a46f-4ba6f29ab766 |
| Specimen 1440 | https://claude.ai/code/artifact/b031f8e8-faf3-4bbf-b760-8af60f22c0d1 |
| Specimen 390 | https://claude.ai/code/artifact/3889be5e-4acc-4f00-83b4-45d2c95d629a |

Private artifacts, published 2026-09-11 from this session.

## 8. Rebuild

Build the deck from the two specimens:

```bash
node deck/build.mjs
```

Render the twelve state captures (specimens/SPEC.md §9):

```bash
node /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-crm/artifacts/people-room-crm-2026-09-11/tools/render.mjs \
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-crm/artifacts/people-room-crm-2026-09-11/specimens/people-room-1440.html \
  --out /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-crm/artifacts/people-room-crm-2026-09-11/shots \
  --name people-room \
  --widths 1440 \
  --hashes state-directory,state-person,state-company,state-roster,state-add,state-access \
  --console

node /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-crm/artifacts/people-room-crm-2026-09-11/tools/render.mjs \
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-crm/artifacts/people-room-crm-2026-09-11/specimens/people-room-390.html \
  --out /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-crm/artifacts/people-room-crm-2026-09-11/shots \
  --name people-room \
  --widths 390 \
  --hashes state-directory,state-person,state-company,state-roster,state-add,state-access \
  --console
```

## 9. Rulings owed

Twenty-five rulings and five orchestrator decisions are recorded in `rulings.md`. Seven need Kody's ruling before build starts.
