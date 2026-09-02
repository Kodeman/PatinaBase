# RESUME — Designer portal /doc UX review (paused 2026-08-13)

## The ask (Kody, verbatim intent)
Full UI/UX review of the designer portal's /doc, especially PROJECT and INSTALL phases. Full reign on prod (app.patina.cloud) logged in as kody@kochaver.com to create new leads/projects and walk them through the process. Deliverable: **a full feedback HTML presentation on where the UI/UX falls apart — how it fits together from the designer's view, NOT data changes — including mock THREE new proposed layouts for the doc.** Use a team of agents with right-sized models (Fable orchestrates, never executes — see CLAUDE.md Model dispatch).

## State at pause

DONE (evidence in this dir):
- `01-code-map.md` — structural map of the (document) route group, phase model, per-section composition, FF&E GA additions, flags.
- `02-prod-inventory.md` — verified phase-1 prod walk of 4 existing docs (Winky/SMS House/Test Walker/Harper Vale) + desk/people/rooms; 5 worst breakdowns.
- `03-ux-critique.md` — Opus adversarial synthesis: themes T1–T6, install-as-a-mode assessment, top-10 ranking, fix directions. This is the backbone of the presentation.

NOT DONE:
1. **Phase-2 walk** (was running when paused; work lost): create labeled test lead "UX Walk Aug 13" → brief/discovery/direction → proposal in Drafting Room → (if reachable) signed project → compose schedule ("The Patina Six") → assign decision lead → add FF&E lines via new add-to-project sheets → KEY QUESTION: does the UI offer any way to advance a project into install (current_phase=installation)? → what actually changes in install mode. Rules: no external sends (email/SMS/client invites — drafts fine; a send-only path is a finding), only kody+uxwalk@kochaver.com emails, no Stripe, don't alter existing real data's business state, no JS alerts, no uploads/drag-drop possible. Deliverable = chronological friction log + walls + 5 worst breakdowns of the creation→install journey.
2. **Screenshots — ALL unusable and must be recaptured.** Phase-1 shots captured the terminal, not Chrome (`screencapture -x` grabs the display). Correct technique, verified per-shot by Reading the PNG afterward:
   `screencapture -o -l $(osascript -e 'tell application "Google Chrome" to get id of front window') <shots-dir>/<nn>-<slug>.png`
   Key screens to recapture: desk top; Winky doc (header+rail, schedule region incl. "NO ACTIVE OR DELAYED PHASE IS CONFIGURED", financial stack, empty mood/plan bands); Harper Vale (rail Install SETTLED/Care ONGOING, "book closed Jul 31" + "0 OF 1 INSTALLED · BILL 1 UNINVOICED", "CANONICAL STAGE"/"TEMPLATE PROVENANCE" captions). Plus the phase-2 journey screens.
3. **HTML presentation** (Opus builds, Fable reviews then publishes via Artifact tool — load `artifact-design` skill first; dataviz skill if charts): themes T1–T6 with screenshot evidence, journey friction log, top-10, and **three mock /doc layout proposals** (HTML/CSS mocks, composition/hierarchy/navigation only — e.g. candidates: (A) canonical-spine doc with elected status organ + nested money region; (B) install-as-true-mode with room-axis + punch band + close checklist; (C) roster-tier/fleet-view above the doc with desk-as-exceptions). Constraint from Kody: don't suggest changing data — only how it fits together from the designer's view.

## Key doc URLs
- Winkys winktastic loft (project, populated): app.patina.cloud/doc/0cafa955-a0dc-49cf-844a-bf6b01017e92
- UX Audit — Harper Vale (install settled → care): app.patina.cloud/doc/861286b5-7952-4f8a-a045-2d41ad45ad1c
- SMS House (sparse): /doc/473d982c-6834-4163-9d0a-d1dfad9ef02d · Test Walker (unconfigured): /doc/a42e4fa4-30b6-49aa-9ab2-20784c518945

## Orchestration notes
- Browser agents: general-purpose/Sonnet; load Chrome MCP tools in ONE ToolSearch; tabs_context_mcp first; new tab; magic-link login only (stop if signed out); no JS alerts.
- Critique/deck: Opus, separate context from implementer/walker; report-everything briefs (no severity filters).
- Subagents can't be resumed across sessions — brief fresh ones with context inline.

## Resume prompt (paste into a new session)
"Resume the designer-portal /doc UX review. Read artifacts/doc-ux-review-2026-08-13/RESUME.md and the three evidence files there, then continue from 'NOT DONE': re-run the phase-2 prod walk (create test lead → project → install, with the fixed window-ID screenshot technique and recapture list), then build and publish the HTML feedback presentation with three mock /doc layouts. Same authorization as before: full reign on prod under kody@kochaver.com to create leads/projects and walk them through; no external sends."
