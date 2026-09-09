# Shared brief — The Desk project card (panel of 2026-09-09)

You are one lens on a small panel of UI/UX experts working with Patina's designers. The ask from Kody (founder):
"Revisit and focus on just the project cards on the Desk. What information should be in them, how should they be
formatted, what shape should they take? Propose 3 updated project cards."

Your memo feeds a synthesis; another agent will then build an HTML presentation of three cards. Be concrete and
opinionated. Report every finding with a confidence (high/med/low); do not self-filter for severity.

## The screenshot Kody sent (described; you cannot see it)

A designer-portal page titled "The Desk". Header: "Good morning, Kody", then a line "15 projects". Below, a
three-column grid of project cards on a warm paper ground, each with a thin hairline border. Each card carries:
- the project name in a serif display face (e.g. "Kochaver Residence", "Pricing Test Residence", "Test Residence 1757…"),
- a small sans sub-line such as "1 · Client: Kody" or "Client: Kody Kochaver",
- a status/pulse line such as "Waiting on Kody for 30 days", "Proposal pending 44 days",
  "Working on Concept — Room / 1 pending", "Awaiting client — 49 days", "Sample, chosen 43 days",
  "Living room 4, chosen 3 days",
- on some cards a small stage strip reading "Presented / Approved / In Production / Installed".
The data is Kody's own test studio on prod (real project rows, test names).

Important context: this grid does not exist in the codebase or on prod today. The live Desk (app.patina.cloud/desk,
verified 2026-09-09) renders a one-line-per-job ROSTER grouped by stage plates (Brief / Discovery / Direction /
Proposal / Project / Install / Care), with a "day's line" above it ("Six things are overdue — Walker … and 3 more"),
facets "Only what needs me" / "By person", and per-row acts ("Open the job", "Send reminder", "Open the schedule").
The roster replaced a two-column folder-card grid on 2026-08-26 with the recorded rule: "one line per job, wrapping to
two or three; never a card; headings never fold; nothing folded on first paint." Kody is now explicitly asking for
cards again. Treat that as the client's decision: design the best possible card, and say plainly where a card must
honor (or knowingly departs from) the rules below.

## What Patina is (docs/vision/VISION.md — wins over every other doc)

- Customer = a growing design studio (Leah's studio first) at the moment it adds its first hands while workload doubles.
  Homeowners are the studio's clients; makers are the studio's vendors.
- The Document (designer portal) is the ranked-first surface. Promise to the studio: "you won't notice Patina."
  "We will never optimize the studio surface for engagement." Explicitly saying no to: "Tab / zone / dashboard UI,
  shadows, red/green status, badges", engagement metrics for the studio surface.
- "Designer-Taught Intelligence" — never the word "AI".

## The design contract (apps/designer-portal + docs/design/house-sheet/SPEC.md)

- D1 strict focus: no split views/tabs/persistent nav. D4 zero shadows: no box-shadow/drop-shadow. Depth = value
  contrast + flat stacked edges + a tab. One exception token `--elevation-sheet: 0 1px 2px rgba(44,41,38,.08)` used
  only at margin chips, the open ledger sheet, the studio drawer — "no new site, no new token" (re-affirmed 2026-09-08).
- Three paper stocks: `--paper #FAF7F2` (ground), `--paper-doc #FCFAF6` (a document laid on the ground),
  `--rail #E8E3DB` (spine/deeper sheet). Ink `#2C2926`, muted `#4E4339`, subtle `#5A4E43`, faint `#65594E`.
  Hairline `#E8E3DB`, strong `rgba(44,41,38,.14)`. Rest-rule pigment oak `#8B7355`.
- State pigments (material / paper-ink pairs): clay `#C4A57B`/`#7C5E30`, golden `#E8C547`/`#79651E`,
  terracotta `#D4A090`/`#9C5340`, sage `#A8B5A0`/`#5F6B57`, dusty-blue `#8B9CAD`, mocha `#5C4A3C`. "State pigments only" —
  no red/green.
- Seven stage plates: brief `#497093`, discovery `#307063`, direction `#366A3A`, proposal `#575D1D`, project `#6D4E24`,
  install `#823832`, care `#823832`. White label on the plate.
- Type: Playfair Display (display: 34/26/20px, weight 500; italic 400 for "authorship"), Inter (body 16/14),
  DM Mono (meta 12px .08em; head 11px uppercase .08em). A 15px `.t-money` step. 24px module; radii 2px/3px only.
  Wrap, never truncate. Tabular numerals wherever digits line up.
- Action tiers by consequence: tertiary = single oak-scored word; secondary = two-score word (ink + clay);
  terminal = filled charcoal, only where money moves or a paper is signed. Acts are DM Mono 13px uppercase.
  44px minimum hit target. Focus ring 2px clay-ink.
- Existing roster row anatomy: 7px mark (terracotta-ink urgent · clay quiet · hairline ring none) · name (Playfair 20,
  oak underline) · state sentence (Inter 14, muted) · dotted leader · one act (right).
- Folder-card precedent (retired 2026-08-26, still in code): status-colored folder tab over a white paper face with two
  tinted sheets stacked behind for depth; asymmetric radius `0 8px 8px 8px`; name Playfair 1.6rem; stage line
  "Direction · Concept Development"; footer: need sentence + status chip; next-act row "Send reminder →".

## The data that can feed a card (document_state view — every field, rendered or not)

engagement_kind ('project'|'proposal'|'lead'|'relationship'), engagement_id, title, client_name, project_status,
current_phase (e.g. Concept Development), active_section (brief|discovery|direction|proposal|project|install|care),
is_paused, is_archived, proposal_status, proposal_sent_at, proposal_viewed_at, proposal_updated_at,
proposal_open_count, proposal_last_opened_at, lead_response_deadline, lead_status, overdue_decision_count,
earliest_overdue_due, awaiting_inspection_count, blocked_item_count, in_flight_count, installed_count, item_count,
updated_at, open_claim_count, open_claim_po, unsent_pulse_count, pulse_week_of, draft_unsent_po_count,
oldest_draft_po_created_at, draft_po_label, unacked_po_count, oldest_unacked_sent_at, unacked_po_label,
due_task_count, earliest_task_due, due_task_title.
Client-side derivations layered in: schedule conflicts/drift, overdue invoices (amount, oldest due), client-flagged
proposal lines, arrival-ceremony state, "last note answered at".
NOT available: budget, cover image, room count, next install date (install date exists only via schedule derivation).

Need kinds (each maps to one act label and one stamp pigment): overdue_decision, overdue_invoice, proposal_signed,
damage_claim, proposal_declined, proposal_expired, lines_flagged, new_lead, ceremony_pending, reconnect_due,
hesitating_proposal, awaiting_inspection, schedule_conflict, schedule_proposal, task_due, schedule_unconfigured,
po_unsent, po_unacknowledged, pulse_due.
Each need has an owner: 'client' (studio waiting on the client) | 'designer' (the studio's own pen) | 'maker'.
Existing sentence grammar in code: "1 decision overdue — oldest due 3 Sep", "$17,500 overdue — oldest due 12 Aug",
"Sent 1 Sep — not yet opened", "Opened 3× — last 5 Sep, no signature yet", "With client since 30 Aug",
"3 pieces on the way", "New lead — respond by 10 Sep". Roster state line = client · phase · need text.
A card links to /doc/{engagement_id} (the project's Document).

## Realistic fixture to design against (use these, not lorem)

Studio: Leah Hartwell, Local Dev Studio, Des Moines. 16 live jobs today, 1 overdue. Examples across stages:
- Vandersteen — install — overdue since 4 Sep (urgent, owner designer) — act "Open the schedule"
- Halvorsen townhouse — proposal — sent 2 Sep, opened 3×, last 7 Sep, no signature (owner client) — "Send reminder"
- Cedar Lane Study — direction — Nora Ellison replied last night; 2 rooms awaiting mark-up (owner designer) — "Review decisions"
- Sonnenberg residence — project — 6 of 11 pieces in production, 1 blocked; $17,500 overdue since 12 Aug — "Send reminder"
- Marcus Wright — brief — new lead, respond by 10 Sep — "Reply"
- Reinhardt lake house — discovery — Green Lake WI, site visit not yet scheduled — "Open the job"
- Osterberg residence — care — quiet, nothing needs your hand — "Open the job"
- Kochaver Residence (Kody's own) — direction — Concept Development, 1 room pending client, waiting 30 days.

## Deliverable format for your memo

Markdown, 600–1100 words, headed with your lens. Sections: (1) Findings on the screenshot's card (each with
confidence); (2) Your recommendation — what goes on the card, in what order, in what type step, with the exact copy
grammar; (3) Shape — geometry, ground, edges, tab/mark, hover/focus/press, how the grid behaves at 15 and 45 jobs
and at 390px; (4) Where it honors or departs from the contract above (D1/D4/no badges/never-a-card/no engagement),
and why the departure is worth it if you take one; (5) One risk you would want Kody to rule on.
Write to the file path you were given AND return the memo in your final message.
