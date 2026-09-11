# People room evidence plates

Worktree-relative paths. Dates = git log -1 --format=%ci of the source file. All copies under 3 MB. Prototype renders are NOT the shipped product.

## Attempts

| # | Attempt | Result |
|---|---|---|
| 1 | Existing screenshots in docs/ and artifacts/ | RAN. 12 candidates by filename; 4 kept (2 dropped as duplicate or wrong room) |
| 2 | Live render of /people | ABANDONED. Local Supabase up (auth health 200) but nothing serving on 127.0.0.1:3000 (curl 000). No dev server started per brief |
| 3 | Prototype HTML render (file://) | RAN. 1440 and 390 captured via Playwright 1.58.2 from the main clone's pnpm store; Chromium needed a sandbox bypass for the Mach port check-in |
| 4 | Visible strings grep | RAN. 40 files, 581 strings, see strings-today.md |

## Plates

| file | source | date | shows |
|---|---|---|---|
| existing-2026-08-28-w1440-room-people.png | artifacts/document-life-directions-2026-08-28/shots/w1440-room-people.png | 2026-08-28 | Shipped People room, 1440, Directory view, ALL chip. Header "THE PEOPLE ROOM · 9 people", "+ ADD PERSON". "ASK THE ENGINE" field "Find someone, or ask who to reconnect with". Left rail groups: DIRECTORY (Directory 9) / RELATIONSHIPS (Threads, Nurture, Reviews) / PRACTICE (Portfolio, Outreach, Your Eye). Engine card "5 people drifting". Chip row ALL FIELD CLIENTS LEADS MAKERS TEAM GCS SUBS INSTALLERS RECEIVERS COMPANIES. MINE / STUDIO scope lens with "The whole studio's book, not just yours" + REVIEW WHAT SEEDED. Person rows: avatar, name, role chip, one-line status ("Active project · last touched today · STUDIO", "New lead · full room · respond within 24 hours"), dot, chevron. Note: an earlier near-identical 2026-08-25 plate exists (artifacts/document-wayfinding-directions-2026-08-25/shots/w1440-room-people.png); dropped as duplicate |
| existing-2026-07-29-e2-people-role-maker.png | docs/design/the-document/screenshots/dissolve/e2-people-role-maker.png | 2026-07-29 | Older People room (6 people), MAKERS chip selected. YOUR ROSTER / THE MARKETPLACE sub-tabs, "0 ADMITTED". Empty state: "No makers yet. Makers you order through Patina and your own shops gather here. BROWSE THE MARKETPLACE". Flat rail (no group headers). Engine card "4 people drifting out of touch. The Ashfords (no-login household) is your strongest dormant tie (1mo ago)". Pill search bar. Tester-notes widget bottom right |
| existing-2026-07-29-d1-people-add-client-open.png | docs/design/the-document/screenshots/dissolve/fix-round/d1-people-add-client-open.png | 2026-07-29 | Add Person sheet (older copy). Eyebrow "ADD · TO YOUR ROSTER", title "Bring someone in", kind switch A CLIENT / A MAKER / A GC / A SUB / AN INSTALLER / A RECEIVER, fields FULL NAME (OPTIONAL) + EMAIL, checkbox "Send a magic-link invite to Patina", "Not a client yet? Add a lead in the pipeline", actions ADD TO ROSTER / CANCEL |
| existing-2026-08-25-w1440-shelf-callsheet-doorway.png | artifacts/document-wayfinding-directions-2026-08-25/shots/w1440-shelf-callsheet-doorway.png | 2026-08-25 | Project document, left THE SHELVES rail with the "Call sheet · NOBODY ON IT YET" doorway. Shows where people attach to a project today (not the People room itself) |
| PROTOTYPE-people-room-w1440.png | docs/design/the-document/people/patina-people-room-prototype.html (rendered) | rendered 2026-09-11 | PROTOTYPE, not shipped. Static HTML mock: 8-person directory with rich one-liners ("Proposal sent · hesitating · opened twice", "Past client · 8 months quiet · time to reconnect", "Maker · 12 orders · 3-week lead · upholstery"), rail counts per view, banner "closes gap matrix: CRM / People · 17 gaps" |
| PROTOTYPE-people-room-w390.png | same, 390 wide | rendered 2026-09-11 | PROTOTYPE at phone width |

## Gaps

1. No 390-wide plate of the shipped room exists in the repo; only the prototype has one.
2. No plates of Threads, Nurture, Reviews, Portfolio, Outreach, Your Eye, or a person profile. Copy for those views is in strings-today.md.
3. Shipped plates predate 2026-09-10 studio-asks work (People edit, lead phone+email); today's copy in strings-today.md is authoritative over the plates.
