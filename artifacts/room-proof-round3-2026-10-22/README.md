# Room Proof — The whole job

Third design round, 22 October 2026. Open **index.html** for the founder presentation and **job.html** for the continuous job prototype.

The proposal preserves the current project sequence and unfolds the operational FF&E editor inside Pieces. The starting sample contains 80 FF&E lines: 36 in the living room, 28 in the primary bedroom, 12 in the entry, two Throughout and two Unassigned. The prototype demonstrates the editor at working density, including preliminary entry, specifications/COM/labor, pricing, purchasing-draft preview and a separate painter’s finish schedule.

## Run

Keep this folder beside `room-proof-round2-2026-10-21` (and `room-proof-workflows-2026-10-21`, used by that round’s comparisons). From the parent artifacts folder run:

```sh
python3 room-proof-round3-2026-10-22/serve.py --port 8080
```

Open `http://127.0.0.1:8080/room-proof-round3-2026-10-22/index.html`. Fonts and imagery are local; no application service, CDN or network API is used. The supplied server binds to localhost only.

## Seven entry points, one page

- `job.html?scene=reading` — continuous job, room imagery and running contents.
- `job.html?scene=rough` — preliminary selections, 36 living-room lines.
- `job.html?scene=spec` — the sofa specification and COM.
- `job.html?scene=price` — pricing and totals.
- `job.html?scene=release` — whole-job purchasing review and local draft.
- `job.html?scene=finishes` — separate room surface schedule.
- `job.html?scene=change` — a local change draft against a protected released rug.
- Additional fixture: `job.html?scene=release&client=none` — client-link gate.

Room and line query parameters preserve context. Return closes the editor at the current room. Escape closes the editor only when a field or dialog does not own the key. Browser back from an opened sheet returns to the job reading.

## Working scope

The table and its local edits, calculations, paste/import preview, library selection, grouping, move/remove/restore, COM and labor, cost-change choice, draft snapshots, and finish print preview work. Non-FF&E chapters are layout studies; they do not pretend to recreate all business workflows. The capability map in the presentation and **SOURCE-MAP.md** names both implemented and deferred behavior.

No real client, vendor, price, order or authorization is represented. Everything is fictional and simulated. There is no Send, Sign, Pay or Release order action. The production portal and database are unchanged.

## Storage

- Sample: `patina-room-proof-round3-job-v1`.
- Founder notes: `patina-room-proof-round3-review-notes-v1`.

Reset sample changes only the sample key. Founder notes save separately and can be exported as Markdown. Multiple tabs share the stored sample but do not merge concurrent edits; use one working tab at a time. Browser storage can be unavailable; the UI then says changes are session-only.

**COLLABORATION.md** records Claude Code’s participation and integrated findings. **VERIFICATION.md** records the checks and their limits. Existing generated room/chair imagery is carried forward from the approved design; the bedroom photo is an illustrative reference. Font licenses are bundled.
