# Prod walk phase 1 — inventory of existing docs (2026-08-13)
*(Browser walker, read-only pass, signed in as kody@kochaver.com / Middle Studio. Text findings VERIFIED; the screenshots from this pass are UNUSABLE — they captured the terminal, not Chrome — recapture needed with window-ID technique.)*

## Projects inspected

| Project | URL | Phase |
|---|---|---|
| Winkys winktastic loft | app.patina.cloud/doc/0cafa955-a0dc-49cf-844a-bf6b01017e92 | Project · Active, Week 2 — best-populated |
| SMS House | app.patina.cloud/doc/473d982c-6834-4163-9d0a-d1dfad9ef02d | Project · Active, Week 1 — sparse, no decision lead |
| Test Walker | app.patina.cloud/doc/a42e4fa4-30b6-49aa-9ab2-20784c518945 | Project · Active — NO schedule composed at all |
| UX Audit — Harper Vale | app.patina.cloud/doc/861286b5-7952-4f8a-a045-2d41ad45ad1c | Install: Settled → Care: Ongoing — only past-project example |

Also surveyed: /desk, /people, /rooms, studio books menu.

## Screen-by-screen findings

**Desk (/desk)**: reads clearly as inbox/triage ("Good morning", "Needs your hand" cards), NOT a project roster. No page anywhere lists all projects with phases — "show me everything in Install" has no path. "REVEAL 3 MORE FOLIOS ↓" click produced no visible change (inert or indistinguishable). Bottom sections (Studio Pulse, Recent Boards, The Studio) are dense text lists with weak hierarchy.

**Winkys winktastic loft (project phase)**: header legible (name, client, dates, budget band, "PROJECT · ACTIVE WORK · GATE" chip). Left rail Brief→Care with settled dates works well. **Contradiction**: header/rail say "Active · Week 2" while schedule caption says "NO ACTIVE OR DELAYED PHASE IS CONFIGURED." Always-visible dashed "Name a phase…" input after Completion reads dead. Financial stack (Design Authority / Working Budget · Version 2 / Authorizations & Trade Scopes / The accounts) = four concepts, near-identical typography, no strong breaks. Mood boards + plan room EMPTY even on this most-alive project.

**SMS House**: banner "1 decision overdue — oldest due Aug 12" mirrors desk card, but below: "This project does not have a designated decision lead yet" → ASSIGN PROJECT CLIENT — the desk-surfaced task is blocked by a setup gap the desk never mentions. Target date renders literal `mm/dd/yyyy` placeholder. Budget band renders `$ from – to $0` when unset (also on Test Walker). Empty: authorizations, $0/$0 accounts, mood board, plan room, unanswered call-sheet prompt.

**Test Walker**: test artifact live in prod queue with real-looking overdue-invoice nudge (INV-0019). Same no-decision-lead gate. **Schedule entirely unconfigured** — shows picker "COMPOSE A SCHEDULE · THREE STARTING POINTS" (The Patina Six / From a past project / Start blank) while header says "Active Work · Needs Attention" and desk pushes the invoice. Desk surfaces the invoice, hides the real gap (no schedule, no lead).

**UX Audit — Harper Vale (install→care)**: left rail all-SETTLED + Care ONGOING works well as at-a-glance tracker. Good pattern example: "CARE · CLOSE THE LOOP · NEEDS ATTENTION — Two installs collide — week of Nov 30 → RESOLVE THE SCHEDULE". Same no-decision-lead gate persists into Care. **Engineering copy leaked**: "2 ACTIVE PHASES NOT CLASSIFIED TO A CANONICAL STAGE" and "DERIVED FROM THE PROJECT SCHEDULE · NO TEMPLATE PROVENANCE RECORDED" in the doc body. "The book closed Jul 31" sits above "Install: 0 OF 1 INSTALLED · BILL 1 UNINVOICED" ($3,200 custom reading chair, SPECIFIED, never installed/invoiced) — closed book with outstanding work, no reconciliation. Mood boards + plan room empty at closeout too.

**People (/people)**: CRM roster with filters works OK; status labels unreliable. **Contradiction**: Mara Whitfield row "Active project · last touched 1mo ago" vs profile "PROJECTS — No projects yet" vs "NURTURE — On an active project together — the relationship is live". Duplicate rows ("Kody Winky" ×4, "Unnamed client" ×5).

**Rooms (/rooms)**: scanned-room gallery, fine; not phase-aware either.

**Console**: no errors on any page checked.

## 5 worst breakdowns (phase 1)

1. Phase-state contradictions within one document (Winky header vs schedule caption).
2. "Active" projects that are structurally empty; desk surfaces the wrong priority (invoice) and hides the blocker (no schedule/lead).
3. Cross-surface contradictions on client/project status (Mara Whitfield ×3 answers).
4. Engineering copy leaking into designer-facing doc ("canonical stage", "template provenance").
5. Closeout with unresolved installs and no forcing function; no-decision-lead gap survives to Care.
