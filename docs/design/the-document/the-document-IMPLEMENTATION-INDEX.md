# THE DOCUMENT — Implementation Index

**Drive Claude Code from this one page.** Updated 2026-07-02.
Authority order: **codebase → spec → prototypes → `DECISIONS.md`.**

## Snapshot
- `DECISIONS.md` through **R91 · I48** (R71 = proposal-watch, logged in the project log) · spec **v1.6** (a **v1.7 fold is owed** — now spans **R61–R90** + the parity re-audit I43) · flipped to default (flag `the-document-pilot`).
- **The parity re-audit + gap-closure program is complete on `main`** (2026-07-02, head `53e69069`): re-swept v2 gap ledger (I43), funnel repair (I45), **Wave 1** (Tracks 7/8/9/11-M — I46, all P0s closed), the R73–R91 ruling round, and **Wave 2** (the Post R82 · proposal depth + tier mirror R85/R86 · decision edges R87 · Library import/validate/search R88 · help affordance R89 · scan sheet R90 — I47/I48). Only the **R21 dissolve** remains (old-URL redirects → Document surfaces, zone removal, `next.config.js` redirect table, DocumentGate retirement).
- Migrations: Document stack **00191–00253** (00239–00251 = a separate aesthete workstream; the Document's own new numbers are 00252 proposal-folio anchor + 00253 apply_scope_change guard). **Prod is at 00229** — owes **00230–00253** + the `proposal-nudge` edge fn (blocked on LAN access to the prod box).
- **Spec v1.7 fold owed** = consolidate R61–R90 + I43 into `the-document-spec-v1.7.md`; until then `DECISIONS.md` (through I48) is the authoritative record and the gap ledger is `portal-vs-desk-feature-gap-matrix-v2.md`.

## Built & live — verified in the running app
Slices 0–6 · **THE FLIP** · Track 1 (in-document parity) · Track 2 (the Orders book) · Track 3 (Library Room · Engine · Accounts book · Composing Page) · Track 4 (Proposal Authoring) · Track 5 (Project Coordination / the ball-in-court) · the Decision Composer (R55–R56) · the People Room (R57–R60) · **Track 6 (R61–R66 + R65 refinements — merged `54885b1a`)** · the Account sheet & nameplate (R67) · the household (R68 + `set_document_client` 00225) · the Direction work band (R68.1) · the quiet timer (R69) · **the Piece** `/library/[id]` (R70) · **proposal watch + nudge** (R71, migrations 00230–00231) · **the light Desk** (R72).

## Track 6 (R61–R66) — BUILT & MERGED (reference)
Package: **`the-document-track6-package.md`** · look/feel: `patina-p0-intake-and-proposal-prototype.html`, `patina-discovery-section-prototype.html`

| Slice | Ruling | What it built |
|---|---|---|
| 1 — Intake triage | R61 | `useBeginDiscovery`; Accept→Discovery / Nurture (dated touchpoint) / Pass on the Desk folder |
| 2 — Capture + ⌘K | R62 | "＋ Capture a lead" CTA + alias-aware ⌘K "new lead" → `CaptureLeadSheet`, route to `/doc/{leadId}`; people in ⌘K |
| 5 — Discovery | R66 | self-composing section, 5 **structured** essentials, margin = unstructured notes only, essentials→**ready**, **auto-seed** the proposal |
| 3 — Proposal action | R63 | expired/declined instruments (Revise · Preview · Resend) + stage-consistent letterhead; follow-up = Send a note |
| 4 — Runaway timer | R64 | 30-min abandonment bound + auto-pause (extends D10) |

## IN FLIGHT — the parity re-audit (2026-07-01)
The 2026-06-14 gap matrix is being re-swept against HEAD (Tracks 4/5/6 + R67–R72 shipped after it). Outputs land here as `portal-vs-desk-feature-gap-matrix-v2.md` (+ `.rows.json`, `.html`), `the-document-parity-backlog-2026-07.md`, and `the-document-needs-ruling-2026-07.md`. Next build rounds (project lifecycle · invoicing depth · vendor directory · the Post) start from the **verified** backlog, then the R21 dissolve stages execute.

## Handoff packages (all in `docs/design/the-document/`)
- `the-document-track6-package.md` — R61–R66 — built
- `the-document-track3-package.md` + `-fixes-package.md` — Tracks 1–3 + F1–F4 — built
- `the-document-proposal-authoring-package.md` — Track 4 — built
- `the-document-decision-composer-package.md` — R55–R56 — built
- *(People Room R57–R60 built live; no separate package.)*

## The build loop
1. Open **Claude Code in `~/Code/patina-merged`**; paste the track package's **kickoff line**.
2. Claude Code builds **audit-first**, one slice per PR, logging an **I-entry + screenshots** (`screenshots/track-N/`).
3. **Bring each slice back to the design session** for review (Mode B): bless + numbered fixes → merge to `main`.

## Open threads
**Spec v1.7 fold** (now R61–R72) · **§14.15** Via-Patina rate finals + the Aesthete-fold Accounts rendering · **prod catch-up** (00230–00231 + `proposal-nudge` fn; blocked on LAN access 2026-07-01) · the parity re-audit v2 ledger + verified backlog (in flight).
