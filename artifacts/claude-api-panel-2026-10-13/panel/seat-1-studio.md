# Seat 1 · The studio: features that give Leah's hours back

## Corrections to the recon brief (checked)

- **The 54-click walk was not done by Leah.** It comes from a panel persona: "Memo — seat 4, the practicing designer · Leah Hartwell" (`artifacts/agreement-room-2026-09-10/panel/memo-leah.md:1-3`). The only first-person Leah capture on record is `artifacts/pieces-building-room-2026-10-08/TRANSCRIPT.md`, as its own header says (line 4). I gave it more weight.
- **Component paths.** `overlays/`, `discovery/`, `buying/` and `coordination/` live under `apps/designer-portal/src/components/document/`, not under `app/(document)/`.
- **The Build room already has the confirm steps:**
  - pasting a list previews it and asks `ADD N LINES` before calling `batch_create_named_project_needs` (`pieces/paste-preview.tsx`);
  - an elevation pane she "types from" (`pieces/elevation-pane.tsx`);
  - an inline library search (`pieces/library-inline-search.tsx`).

  Claude can feed these existing confirms without adding a surface.
- **The Engine ask already runs through `aesthete-ask`** (vector plus full-text search). `useCrossLayerSearch` is only the fallback (`components/document/engine/engine-results.tsx:71`). The approved re-ranking follow-up (`docs/design/the-document/DECISIONS.md:1607`) would sit on top of `aesthete-ask`.
- **The auto-apply is in `sms-inbound/pipeline.ts:1825`** (`confidence >= 0.8`). `_shared/field-parse.ts:131` only names the confidence bucket. FC-R12 itself asks Kody to rule the whole family: capture enrichment already writes model output to `field_captures` with no review (`field-companion-rulings.md:723-728`; `00515:250,:287`).
- **The open ruling covers buying drafts specifically.** Its wording is "No Designer-Taught Intelligence composes drafts until a studio member can review agent output" (`artifacts/procurement-buying-review-2026-10-05/synthesis/direction.md:317`), because review of `agent_tasks` is admin-only. A studio-side review screen for composed drafts now exists: `components/document/buying/draft-review.tsx` (C-28, "Nothing leaves without this click").
- **The lexicon bans more than the brief listed.** Beyond AI, algorithm and "powered by", it also bans `automat*`, LLM, ML, machine learning, chatbot and "driven by" (`marketing/canon/lexicon.json:53,90-105`). None of the names below use them.
- **Only one function has the full cost tooling.** `aesthete-dna-draft` has prompt caching, json_schema output and a spend ledger (`aesthete-dna-draft/lib.ts:325-353`, `aesthete_spend_ledger`). The other four call sites `fetch` `api.anthropic.com` directly, and `companion-message/model.ts:12` still uses `claude-sonnet-4-20250514`. Turn that pattern into a shared `_shared/` module before building the second feature below.

**Hours assumption.** An owner and a first hire, about 10–14 active jobs, 1–2 new jobs a month, 2–3 discovery calls a week. These are working estimates, not measurements.

**One rule for every proposal.** Claude only fills a step that already has a confirm. Nothing is written until a person accepts it (FC-R12). An ask does not save a thread (R38). Nothing leaves the studio unless a person sends it.

---

## Proposals

### 1. Line out the room
- **Surface:** The Document, Build room, Rough in lens. Components: `pieces/paste-preview.tsx` and `pieces/elevation-pane.tsx`.
- **Moment:** Building a new job's pieces from the elevations or SketchUp. In her words: "Here's all the things in this room… and just go down the line" (`TRANSCRIPT.md:61`). Also outlining the components of a shower and backfilling them later (`:51`).
- **Feature test:** Surface: The Document. Moment: the first hire builds pieces while the workload doubles. Stream: furniture margin (these lines become POs). Promise: she won't notice Patina, because it rides the paste she already does.
- **What Claude does:** Takes an elevation PDF or image filed in the Plan Room, or her shorthand pasted in ("Hardware, 2 knobs for custom cabinet"), plus the job's rooms. Returns proposed placeholder lines: name, quantity, room, and an optional group heading (V15 Q9). It never sets a product, maker or price, because a placeholder means "no product and no maker" (V15 Q3).
- **Human confirms:** In the existing preview, with `ADD N LINES` or `CANCEL`. Each line is editable before it is added.
- **Hours saved:** 1.5–3 h/week (2–4 h per new job).
- **Extends:** `project-ffe-document-extract` (Sonnet 5, staged rows) and `_shared/pdf-text.ts`. The paste write path is unchanged.

### 2. Read the acknowledgment
- **Surface:** The Document, buying. Component: `buying/ack-check.tsx`.
- **Moment:** The first hire checks each vendor acknowledgment against the PO, and later types in tracking, the BOL (bill of lading) and the ETA.
- **Feature test:** Surface: The Document. Moment: the first hire takes over buying (V14's test already passed). Stream: margin. Promise: she won't notice Patina.
- **What Claude does:** Takes the vendor's acknowledgment (PDF, photo or pasted email) and the PO's lines. Returns values per line for what the vendor says: ship date, quantity, unit price, finish, freight. It also returns tracking, BOL and ETA fields when present.
- **Human confirms:** The pre-filled "vendor says" column. The agrees/differs comparison stays deterministic (`buying/ack-check-model.ts` mirrors `log_po_acknowledgment_v2`, 00705, which stays the authority). She records the check.
- **Hours saved:** 1.5–3 h/week in buying-heavy weeks.
- **Extends:** `project-ffe-document-extract` (the same upload, stage and review grammar as `schedule/document-import-review.tsx`).

### 3. Fill the placeholder
- **Surface:** The Document, Build room Spec lens. Components: `pieces/library-inline-search.tsx` → the T-29 fill preview.
- **Moment:** "Is there an easy way, once I add that kind of blanket line item, for me to sub it out with product?" (`TRANSCRIPT.md:49`).
- **Feature test:** Surface: The Document. Moment: backfilling specs. Stream: margin (catalog pieces carry Patina margin). Promise: she won't notice Patina; the Engine stays a presence (R38).
- **What Claude does:** Takes the placeholder text, the room, and pieces already on the job. Re-ranks `aesthete-ask` candidates from her own Library shelves and the Catalog. Returns the top 5, each with one plain reason ("satin brass, matches the pulls already on this kitchen").
- **Human confirms:** She picks one. Nothing swaps until she chooses. The ask is not saved; the placement carries the existing "via the Engine" mark.
- **Hours saved:** 1–2 h/week.
- **Extends:** `aesthete-ask` and `engine/engine-results.tsx`. This is exactly the approved, non-saving follow-up at `DECISIONS.md:1607`.

### 4. Spec from the cut sheet
- **Surface:** The Document, Spec lens. Component: `pieces/spec-fields-pane.tsx`.
- **Moment:** Backfilling dimensions, finish, material, lead time and care for each line before release.
- **Feature test:** Surface: The Document. Moment: getting lines to Specced or Ready. Stream: margin. Promise: she won't notice Patina.
- **What Claude does:** Takes a cut-sheet PDF or product URL. Returns the spec fields, each with "how it was found." It runs after the deterministic page extractor, which only reads Open Graph and JSON-LD tags and so misses dimensions and lead times (`_shared/product-page/extract.ts`).
- **Human confirms:** Accept, edit or skip per field. A price is never filed with a guessed basis (R-DI4).
- **Hours saved:** 1.5–3 h/week.
- **Extends:** `_shared/product-page/extract.ts`, `project-ffe-document-extract`, and the json_schema pattern from `aesthete-dna-draft`.

### 5. The call, filed
- **Surface:** The Document, Brief, discovery. Component: `discovery/call-plan.tsx`.
- **Moment:** Straight after a discovery call. Her notes are in a notebook or a voice memo. The checklist wants "facts fill the blocks" (`call-plan.tsx` header).
- **Feature test:** Surface: The Document. Moment: a new lead while she's stretched. Stream: both (the design-services agreement is the floor; the rooms become margin lines). Promise: she won't notice Patina.
- **What Claude does:** Takes pasted notes or a transcript (text only in v1, so no audio is kept). Returns proposed fills for each structured block (rooms, budget, timeline, household), plus the "Note from the call" for the margin.
- **Human confirms:** Accept per block.
- **Hours saved:** 0.5–1.5 h/week.
- **Extends:** The discovery editors (`discovery/editors.tsx`). Uses Haiku with the cached-prefix pattern.

### 6. The inquiry, read
- **Surface:** The Desk, capture sheet. Component: `overlays/capture-lead-sheet.tsx`.
- **Moment:** An inquiry arrives by email, Instagram DM or text, and she retypes it.
- **Feature test:** Surface: The Document. Moment: a new lead. Stream: the floor. Promise: she won't notice Patina (the sheet's goal is under 5 seconds).
- **What Claude does:** Takes the pasted message. Returns Name, Email, Phone, a one-line project description, and Where from (from the existing suggestion chips).
- **Human confirms:** The sheet is the confirm; she presses Begin.
- **Hours saved:** 0.25–0.5 h/week. Small, but it's a cheap Haiku call.
- **Extends:** The existing sheet fields (00583).

### 7. Services and exclusions, first pass
- **Surface:** The Document, Drafting room. Components: `rooms/drafting/service-agreement-drafting-room.tsx` and `facet-section.tsx`.
- **Moment:** Writing each design-services agreement's Services and Exclusions. The persona walk spent about 3.5 of its 17 minutes typing these (`memo-leah.md:133,140`).
- **Feature test:** Surface: The Document. Moment: a new engagement. Stream: the floor. Promise: every outbound document is a draft a person sends.
- **What Claude does:** Takes the Brief, the discovery blocks, and the studio's own past agreements (so it writes in her voice). Returns paragraphs for the Services and Exclusions parts, unsaved. It never writes **Terms**, which are the studio's standing, counsel-facing text.
- **Human confirms:** She edits and saves. Nothing reaches the client until she sends.
- **Hours saved:** 1–2 h/week.
- **Extends:** The drafting room's parts editor, plus a cached system prefix holding her past agreements.

### 8. The Friday letter
- **Surface:** The Document, the Weekly Pulse in the margin. Data: `weekly_pulses` (00193; `body NULL` means it is composed from the week's stamps at render). Send: `api/pulse/send-email/route.ts`.
- **Moment:** Friday client updates across about 12 jobs.
- **Feature test:** Surface: The Document. Moment: workload doubled. Stream: margin (an engaged homeowner decides faster). Promise: the homeowner is engaged daily on one agreed direction.
- **What Claude does:** Takes the week's stamps, decisions and deliveries. Returns 3–5 plain sentences in the studio's voice with no taste claims.
- **Human confirms:** She edits the draft, then `send_weekly_pulse`.
- **Hours saved:** 1–2 h/week.
- **Extends:** The pulse draft row and the send path, both unchanged.

### 9. The chase letter
- **Surface:** The Document, buying. Components: `buying/draft-review.tsx` and `buying/exceptions.ts`.
- **Moment:** Install week, when something is late and a vendor needs a nudge.
- **Feature test:** Surface: The Document. Moment: the first hire runs buying. Stream: margin. Promise: every outbound message is a draft a person sends.
- **What Claude does:** Takes the exception, the PO, and the vendor's last acknowledgment. Returns the body of a `procurement_drafts` row.
- **Human confirms:** Send in `draft-review.tsx`, which already exists.
- **Hours saved:** 0.5–1.5 h/week.
- **Extends:** C-28 SQL-composed drafts. Only the body text changes.

### 10. Paper on file
- **Surface:** The Document, People room. Components: `people/record-document-sheet.tsx` and `people/inbound-queue-band.tsx`.
- **Moment:** A trade's COI or W-9 arrives.
- **Feature test:** Surface: The Document. Moment: delegating to trades. Stream: the floor. Promise: she won't notice Patina.
- **What Claude does:** Takes the PDF. Returns insurer, policy number, coverage limits, expiry and name for a COI; name, EIN or SSN mask and business type for a W-9.
- **Human confirms:** The labelled fields are pre-filled. The V10 rule still applies: the document stays unverified until a studio member confirms it.
- **Hours saved:** 0.25–0.5 h/week.
- **Extends:** The extract path. Use a short retention window for W-9s.

---

## Ranking

| Now | Next | Later |
|---|---|---|
| 1 Line out the room · 2 Read the acknowledgment · 3 Fill the placeholder · 4 Spec from the cut sheet | 5 The call, filed · 6 The inquiry, read · 7 Services and exclusions | 8 The Friday letter · 9 The chase letter · 10 Paper on file |

**Why the drafting proposals (7, 8, 9) wait.** Proposals 1–6 compose no outbound prose, so no open ruling blocks them. Proposals 7, 8 and 9 do, and the agent-drafts ruling is still open. I recommend the panel ask Kody for one narrow ruling: "A draft she asked for, inside the sheet she is already in, unsaved until she saves or sends, is not an agent draft." Proposal 9 is a buying draft, which falls squarely inside the open ruling (`direction.md:317`), so it stays Later until Kody rules. Don't resolve this in code.

## Build first

1. **Line out the room.** It is the only proposal backed by Leah's own words (`TRANSCRIPT.md:49-61`). It saves the most hours, and it reuses a confirm that already ships (`ADD N LINES`) and an extract function that already ships. It sends nothing.
2. **Read the acknowledgment.** It hands the first hire the most repetitive buying task. The comparison stays with the deterministic 00705 authority, and V14 already passed this moment's feature test.
3. **Fill the placeholder.** It completes 1: placeholders become catalog pieces, which is the first-dollar margin stream. It is the approved non-saving Engine path (`DECISIONS.md:1607`), and the "via the Engine" mark already exists.

Before the second of these ships, move `aesthete-dna-draft`'s caching, json_schema output and spend ledger into a `_shared/` module, and cap spend per studio.

## Rejected

- **A chat sidebar ("Ask Patina anything").** R38 rules out a thread, a history and an avatar (`DECISIONS.md:1558-1564`). `companion-message` saves `companion_messages`, which conflicts. Leah already finds the tool "so big… where am I" (`TRANSCRIPT.md:55`). Asking stays in ⌘K and the librarian.
- **Filing on high confidence.** For example, vendor emails or trade texts that update the schedule unattended at ≥0.8, as `sms-inbound/pipeline.ts:1825` does today. FC-R12 says nothing auto-applies at any confidence. The panel should flag the existing pipeline line, and the unreviewed capture-enrichment writes (00515), for Kody to rule as one family.
- **A morning digest or "studio week" brief.** For example, "here's what to do today", or summaries of how each member is doing. A total with no rows beneath it is a dashboard (V11). It is also built to be noticed, which breaks VISION §4 ("won't notice"). Contact dedupe also stays deterministic (`people/compare-merge-sheet.tsx`); a model adds risk there and saves no meaningful time.
