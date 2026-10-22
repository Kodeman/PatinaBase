I wrote both files. I haven't run `node --check` or opened them in a browser. I had no shell, so Codex still needs to run that gate.

**Paths** (both in `/Users/kody/Code/patina-merged/.codex/worktrees/agent-room-proof-round4-notes/artifacts/room-proof-round4-2026-10-22/`):
- `notes.js`
- `notes.css`

**Behaviors to know:**
- **Window calls:** `Notes.home()` returns its HTML and also renders it into `#job-correspondence` if that element exists. `Notes.line(id)` returns a `<details data-notes-line>` that stays open or closed across rerenders. `Notes.refresh()` rewrites only the inner contents of the home area and those line details.
- **Typed text:** `refresh()` keeps unsaved text, select values and open/closed state in the other forms. It clears only the body of the form that was just saved.
- **Handlers:** The click, change, submit and toggle handlers check for the `.nt` wrapper before acting. Save actions call `Job.save()` and `Job.log()`. They never call `renderSheet()`, so the FF&E table isn't touched.
- **Subject jump:** Line subject buttons call `Job.open('spec', line.room, id)` only. Room, job and order subjects show as plain text.
- **Drafts:** An unsent draft keeps its own "Open draft" details with an edit form and a local preview. Saving an edit changes only that draft and never turns a private note into a draft. Nothing is marked sent and there is no Send button.
- **`addClientResponse(id, body)`:** It appends the entry, saves and refreshes. It returns `null` for an empty body and never touches line approval or purchasing.

**Choices and limits:**
- `created` is stored as an ISO string.
- The author for new entries is hard-coded as "Leah".
- `clientComments(id)` returns one `<p class="nt-cc"><strong>Author:</strong> body</p>` per received client entry, all escaped. Root should wrap that string if it needs a container.
- The audience filter shows "All (internal studio view)", Studio, Client and Maker, and matches on the entry's audience field. Drafts to the client or maker therefore appear under Client or Maker, and also under All.
- The subject filter covers the whole job, rooms and lines. A room filter also includes entries on lines in that room. Order scopes are displayed and filtered by exact match, but they aren't offered in the dropdowns.
- The summary counts are always for the whole job, not the current filter.
- The CSS reads `--ink`, `--paper` and `--serif` if root defines them and falls back to forest, paper and Georgia otherwise.
- Nothing reads the private `notes` field on FF&E lines.
