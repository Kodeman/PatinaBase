# Re-audit live walk log — 2026-07-01 (COMPLETE)

Env: localhost:3000, designer@patina.dev (-004, "Leah Hartwell"), flag override on, db reset @00235 + demo seeds + `scripts/the-document-reaudit-walk-seed.sql` (committed; proposal total corrected to cents). People demo on admin@patina.dev (-002) was NOT needed — the -004 walk data lit the People Room. Screenshots in-conversation only (`save_to_disk` yields no file — standing constraint; screenshot debt logged per convention).

## Stations

| # | Station | Result | Notes |
|---|---------|--------|-------|
| 0 | Desk derivation (6 needs-your-hand folders, R72 light paper, triage bar) | PASS | All walk-seed chains derive: lead folder w/ TriageBar + deadline; Chen PAST-DUE invoice chase; signed→open-the-project; Olsen CLAIM OPEN. |
| 1 | Capture a lead (R62) | PASS | Sheet → lead → /doc/{leadId} Brief; timer auto-starts. |
| 2 | Intake triage in-doc (R61) | PASS | Accept·begin → quiet inline "ACCEPTED — NOW IN DISCOVERY" (R51, no toast). |
| 3 | Discovery 5 essentials → ready (R66) | PASS w/ findings F3–F5 | Self-save blocks, Aesthete style chips, ready gate + Strata fill work. |
| 4 | Begin the Direction (auto-seed) | **FAIL → SQL-unblocked** | F2: server RPC "discovery not ready" vs UI "Ready" (project_type never persists). After fix: draft seeded, Direction + work band + mirror render. |
| 4b | Drafting Room doorway (R68.1) | FLAKY (F6) | Work-band button no-ops; direct URL works. |
| 5 | Drafting Room 8 facets + live client copy | PASS | Scope seeded; FF&E facet + Capture Inbox (5 pending — field-captures 00232-00235 surfaced); client copy live. |
| 5b | Send weave: link-a-client → send | **BLOCKED (F7)** | Picker options unselectable by mouse/ref/keyboard. Discovery-born proposal cannot be linked → cannot send. |
| 6 | Proposal watch view (R71), Aspen sent | PASS | SENT stamp, figures strip, client's copy as-sent, THE RECORD, Request-a-change · Revise · Nudge; household chip "for the Users »". |
| 7 | Expired instruments (R63), Nair | PASS (after cron-equivalent flip) | proposals.status→'expired' via daily cron 00098; then EXPIRED stamp + Revise → / Resend · New expiry; Desk shows EXPIRED tier. F9 downgraded to cron-latency note. |
| 8 | Signed → open the project | **FAIL (F10)** | No project exists; band renders static "Signed — the project is open." with NO act (proposal-watch.tsx:133-145 has no project-existence check). Desk need "Signed — open the project" dead-ends. |
| 9 | Coordination resolve (Aspen, R46-R54) | PASS | RFI sheet: ball-in-court banner, blocking list, thread, answer → court shifts to GC, bar re-derives (2→1 yours), waiting panel (Nudge/Extend/Change court). One-act-many-surfaces verified. |
| 10 | Coordination/decision composer (R55) | PASS (render) | 5 kind chips, subject chips, 4 courts, options materialization. Not submitted. |
| 11 | FF&E line unfold (Chen) | PASS | PO NA-2026-041 "not yet sent · fifty fifty", movement, receiving, folio, +Note/Fold. |
| 12 | Log strip chain-out | PASS | Aspen 1-min offer at Chen's foot; Log → Hours today ticked. |
| 13 | Orders book | PASS | Ledger (vendor-grouped, stamps, pdf/send/open-doc), Receiving ("warehouse day": awaiting-log 2, claims 1, Inspect), Week/Vendors pages present. |
| 14 | Accounts book | PASS | Ledger (3 walk-seed invoices w/ stamps + open-doc), front-matter ($0 rev · $6,200 A/R · 19% margin), Aesthete fold ($729 returned → Library), Receivables aging ($6,200/$2,400/$3,800 + 15D OVERDUE). |
| 15 | Receivables chase (Send reminder) | PASS (wiring) / env-fail | Calls invoice-reminders edge fn; local edge_runtime stopped → inline "EDGE FUNCTION RETURNED A NON-2XX STATUS CODE" + duplicate error toast (F2b). |
| 16 | Hours ledger | PASS | Week groups, live IN HAND row, inline activity/minutes edits, UNBILLED chips, batch add, Export week → Accounts. |
| 17 | Bell | CONFIRMED GAP | Exits the Document to /portal/inbox — full old zone chrome renders (Track 10 justification, walk-proven). |
| 18 | Account sheet (R67) | PASS | Identity, availability, Profile/Notifications/Security/Devices, self-serve password. |
| 19 | Library Room + Engine ask | PASS | 3 shelves, Capture/Compose acts, Teach/Promote per piece; Engine empty-state answer in paper grammar. |
| 20 | The Piece (R70) | PASS | /library/[id]: layer chips, retail/trade, Strata, Add-to-project/Promote, self-save record fields. |
| 21 | ⌘K negative probes | CONFIRMED GAPS | "new project" / "invoice" / "vendor" → ONLY "Ask the Engine". No create-project, no invoice acts, no vendor add in ⌘K. (Also: ledger rows don't alias-match "invoice"→Accounts, "vendor"→Orders — discoverability note.) |
| 22 | People Room (R57-R60) | PASS | Directory picked up all walk-created parties w/ role chips (Marlowes CLIENT, Nair LEAD w/ deadline, Reyes Build GC, makers); 6 views; ask bar; live Engine nudge. Quirk: Marlowes = "strongest dormant tie" 1h after capture (§14.20 tuning). |

Not walked: /compose (Composing Page — L4-validated previously), client-portal mirror, mobile <980px (prior L4), teaching validate/XLSX/team/scan-viewer (absence confirmed by code agents; ⌘K pattern proves the fall-through).

## Findings (final)

- **F2 (P0, bug)** Discovery readiness contract mismatch: UI ready ≠ RPC gate. `project_type` select value displayed but never persisted → `begin_direction_from_discovery` (00224) always rejects → **every new lead dead-ends at Direction**. Fix: persist project_type (+ align UI/RPC readiness definitions).
- **F7 (P0, design gap — needs ruling)** Send-sheet link-a-client: rows without a Patina account are silently unselectable (`client-picker.tsx:209` gates on `linkable`; no cue beyond a small "NO PATINA ACCOUNT" tag, no invite-and-link act, no email-only send). A captured household (no login — the R46/R62 normal case) can never be linked → **discovery-born proposals cannot be sent**. Ruling needed: the no-login household send path (invite-on-send, or email-send without client_id).
- **F10 (P0, bug)** Signed-proposal band claims "the project is open" without checking a project exists; no open-the-project act (R44 two-step safety net missing) → Desk `proposal_signed` need unfulfillable for non-auto-activated signs.
- **F1 (P1, bug)** Accepted lead's `/doc/{leadId}` dies ("No document answers to this name") — identity moves to designer_clients.id with no redirect (unlike the R6 proposal fallback).
- **F3 (P1, bug)** Discovery budget fields: truncated mid-typing save (60000→600) + dollar-magnitude stored in cents column (85000) → "budget 6–850" renders downstream in Direction.
- **F4 (P2, bug)** Self-save keystroke race: last chars lost on blur ("weekend hostin").
- **F5 (P2, UX)** Empty rows satisfy essentials (empty room/household rows check the block) — feeds F2's UI-ready illusion.
- **F6 (P2, bug)** "Open the Drafting Room →" work-band button flaky/no-op; URL navigation works.
- **F8 (P2, bug)** Relationship/discovery doc titled "New client" — document_state relationship branch ignores designer_clients.client_name for no-login households.
- **F2b (design note)** Errors surface as red toasts (Begin-the-Direction failure; reminder edge-fn failure duplicated an already-inline error) — D2's no-toast grammar has no ruled error path; needs-ruling candidate.
- **Obs-1** Nair "$185 proposed" was the walk seed's dollars-vs-cents authoring slip (fixed in the seed); Document consistently treats proposals.total_amount as cents.
- **Obs-2** proposal expiry realizes only via daily cron (00098) — an expired proposal reads "sent" until the cron runs (day-scale latency by design; note for R63 copy).
- **Obs-3** People Engine nudge calls a 1-hour-old client the "strongest dormant tie" — §14.20 threshold tuning.
- **Obs-4** Desk/⌘K walk-through confirmed: project create/complete, invoice create/record/void/print, vendor add, XLSX import, teaching validate, team mgmt, scan viewer have NO Document doorway (P0/P1 gap set confirmed).
- **Obs-5** Bell → /portal/inbox exits the Document (R72 provisional, walk-proven; Track 10).
