# Handoff — The Document, Track 3 (the Library, the Engine, the Accounts book, the Composing Page)

**To:** Claude Code (implementation authority)
**From:** the design session — 2026-06-13
**Reads against:** `DECISIONS.md` (R36–R40, last id = R40) · `the-document-spec-v1.4.md` · the prototypes named below.
**One-line context:** Track 1 (in-document parity) and Track 2 (the Orders book) shipped; the flip is live. Track 3 is the dissolve's last design block — it stands up the **Rooms** weight (D14) and folds the marketplace, the Engine, and the studio's money into the model.

---

## Part A — DECISIONS.md state (already appended; footer restored)

The rulings are **already in the repo log**, appended this session via the safe-write primitive — do not re-paste:

- **R36–R40** appended in order; integrity footer restored to
  `*Entries: D1–D14 · O1–O7 (resolved) · I1–I28 · R1–R40 · L1–L3 · THE GO · FLIP CONFIRMED · last id = R40*`.
- **Spec cut to v1.4** logged (note entry under R40); §-numbers frozen, so existing `spec §N` cross-references remain valid. v1.3 preserved.
- The rulings to build to: **R36** (Accounts book) · **R37** (Aesthete fold) · **R38** (the Engine) · **R39** (the Library / Rooms shell) · **R40** (the Composing Page). D14 (Sheets & Rooms) is the parent decision; R30 (Via Patina), R32 (Library origin), R31 (Engine origin) are the prior context.

**Artifacts — all landed (no Mode F gap):** `patina-library-room-prototype.html` (the Room shell + Library — look/feel authority for R39), `patina-composing-page-prototype.html` (R40), `patina-dissolve-eleven-surfaces-v1.html` §10–12, `patina-strata-mark-progress-system.html` (R35 — the sweep + fill you'll reuse). Port intent, never markup.

---

## Part B — build plan

Standing rules (unchanged): build behind the `the-document-pilot` flag (default-on); one slice per PR titled `the-document: track3 N — <name>`; **real data from day one, no mock layers**; end each slice with ≥1280px and ~390px screenshots + an honest acceptance checklist + the `DECISIONS.md` I-entry. **Audit before you build** — Track 1/2 repeatedly found the table/endpoint already existed (I25 project_tasks, I26 vendor links, I27 conflict classifier). Assume the same here.

### Audit-first (do this pass before any code — most of Track 3 already exists somewhere)

1. **The three-layer Library** — the Products/catalog zone already ships My / Studio / Patina, capture→promote→nominate, Chrome-extension/photo/URL capture, Needs-Teaching/Drafts. Re-house it into the Room; do not rebuild the data layer.
2. **Teaching** — the Aesthete zone already ships the Teaching Queue, Quick Tags (~5 min) and Deep Analysis (~15 min), daily-goal/accuracy/impact stats. Reuse; relocate into the Room.
3. **The Engine backend** — `/portal/companion` is a working conversational/recommendation API. **Reuse the API; re-skin the surface.** Confirm its request/response shape before designing the ⌘K result-line.
4. **Billing** — Invoices, A/R aging buckets, Send-reminder dunning, "Your Earnings" (design fee + commissions), QBO export all exist in the Billing zone; the procurement QBO exporter was reused by R26. Reuse for the Accounts book.
5. **Put-down + timer chain-out** — `DocumentTimeProvider` + the log-offer strip already serialize hold/release/chain-out (I16). Room entry reuses this exact path; do not fork it.
6. **Reusables** — `LedgerFrontMatter` (I23), the Orders-book page grammar (R28), `StrataSweep` + `StrataMark` fill (R35), the folio (R24), `desk-derivation.ts` + the R22 tier split, the shared `DocSheet`. Compose from these.

### The slices (dependency order; flight telemetry may re-rank within)

**1 · The Rooms shell (R39 / D14).** The reusable physics, before any Library content.
- Build: entering a Room runs the normal **put-down** of the open document (reuse #5 — timer chains out through the log offer); the **Drawer persists** (D8); the Room is **full-bleed paper** (D12) with **zero shadows** (extend the D4 lint to the room dirs); the Drawer marks room-weight objects with a **doorway affordance** (spine tick + "↗"); **leaving returns to origin** (stash last surface — reuse the `last_document_in_hand` localStorage pattern from the flip telemetry).
- Accept: opening a Room puts the held document down (timer chains out, log strip offered); the Drawer bar is present inside; no shadow/zone/badge; leaving lands back on the prior surface; reduced-motion safe.
- Schema: **none** (presentation + localStorage).

**2 · The Library — the first Room (R39, R32).** Mount the audited three-layer Library into the shell.
- Build: three shelves separated by **Strata rules** — My Library (raw captures, no taxonomy/queue), Studio Library (proven), Patina Catalog (Via-Patina marks + maker nomination); capture→promote→nominate as the movement. Teaching while browsing: Quick Tags inline on Golden-Hour-tagged cards; Deep Analysis opens as a **paper sheet over the Room**. Stats compress to one foot line ("N taught today · accuracy · future matches improved"). Route `/library`. Old Teaching Queue + Products zone become ⌘K-reachable only (staged exile).
- Accept: `/library` renders the three shelves on real catalog data; capture lands raw in My Library; promote/nominate move pieces; Quick Tags + Deep Analysis work in place; foot stats are real; nothing gamified.
- Schema: additive read views only if needed; reuse catalog tables.
- **Review milestone — L4 device check:** put the Library Room on Leah's phone (the Rooms physics are new, like the D13 walk). Green = the shell is trustworthy for future Rooms.

**3 · The Engine — a presence (R38, R31).** Two homes, on the reused backend.
- Build: **⌘K reads intent, no mode** — destination-like → jump (current behavior); question-like → ask, rendering **paper result-lines** with one act **Place → [document]**; the **R35 Strata sweep** (never a spinner) while thinking. The **Library librarian** = the standing input atop the Library Room for longer work. **Placement carries provenance** — a quiet "via the Engine" mark on the placed item (document + folio); the Engine profile updates silently. **No thread, no history, no avatar.** Re-skin `/portal/companion`'s backend behind both; exile the conversational page (⌘K-reachable until removal).
- Accept: a question in ⌘K returns Engine result-lines; Place → adds the item to the open document with the provenance mark; nothing conversational persists; the librarian does the same for longer asks; copy is "the Engine / Designer-Taught Intelligence," **never "AI."**
- Schema: additive placement provenance (`source = 'engine'` on the placed row); reuse the companion API.

**4 · The Accounts book (R36).** A Drawer **Sheet**, three pages.
- Build: **Ledger** (invoices), **Receivables** (A/R aging + dunning), **Earnings** (design fees + commissions + teaching royalties) as DM-mono page links (R28 grammar, never tabs). Front-matter band (reuse `LedgerFrontMatter`): **Revenue · AR · margin** + a one-line teaching lens. **Aging AR rises on the Desk** as a need line (extend `desk-derivation.ts`; act = send reminder) **and** carries the dunning action on the Receivables page (one act, both surfaces). Roll up the per-engagement Account Pages (R26) + cross-engagement rows; **no figure authored twice.** Studio-eyes-only; bookkeeper access via the colophon Team… (R29/§14.6).
- Accept: Accounts opens as a Sheet (document stays mounted); three pages; front-matter correct; an overdue invoice appears as a Desk need line whose act sends the reminder and clears both surfaces; no double-count vs the Account Page.
- Schema: additive read models (revenue/AR/margin + earnings aggregations); an AR-aging constant beside the R10/R22 set.

**5 · The Aesthete fold (R37).** The Earnings page's brand crescendo.
- Build: two bands — *What you earn* (design fees + Via-Patina commissions) / *What teaching returns* (teaching royalties + the running Pledge). The **25% Pledge is two-sided**: each event renders a pair of labelled sub-lines — **returned to you** (royalty, accrues to a YTD total) and **given to the commons** — never blurred. A **one-line teaching lens** in the front-matter (not a dashboard). R30's order-moment line shows both halves and lands here.
- Accept: two bands present; each Pledge event shows the twinned labelled sub-lines; YTD "returned to you" accrues; the front-matter teaching lens is exactly one line.
- Schema: earnings/royalty/Pledge read model + Via-Patina commission rows (additive). **Open input (§14.15):** the commission rate + Designer-Selections-vs-Style-Matches split are brand/config — wire from config; render real-or-placeholder and **flag in the I-entry** if config is absent. Never invent the rate silently.

**6 · The Composing Page (R40).** The anti-wizard creation grammar.
- Build: a **self-composing paper artifact** — sections fillable in **any order**, gaps shown, a usable **draft at every percent**, save anytime; **the Strata Mark (R35) is the only progress indicator** (the three movements map to the three lines; state reads Capture → Draft → Catalog-ready off the same fill). First instance **"Compose a piece"**, reached from the Library: *the record* (identity + piece), *the catalog* (commerce + the folio — reuse R24), *the eye* (the teaching — the same Quick-Tags act as inline). **Two-sided authorship:** the maker fills price/lead time in their portal; the designer adds the eye. The librarian (R38) is available; nothing is required to save. No Next/Back/Step N of M.
- Accept: the page composes from any starting section; the mark is the only progress; it saves as a real draft at any %; "Compose a piece" opens from the Library and writes a catalog piece; the maker/designer split holds.
- Schema: additive draft state for the composed piece (reuse catalog piece tables; a draft/percent-composed read).

**Cross-cutting · Via Patina (R30).** Wires through slices 2–5: the Patina Catalog shelf (slice 2) carries the Via-Patina mark + nomination; at order, one quiet line shows the commission → Accounts and the two-sided Pledge (slices 4–5); PATINA HANDLED is a PO-cell state, never a line stamp. Reuse the Order Assistant's Patina branch + preview-as-confirm. **Stub the Accounts destination until slice 4 lands — never stub the line itself.**

### Telemetry / sequence gates

- **Flight telemetry** (live since the flip) ranks the dissolve; surface week-one `document_zone_flight` data at the next review — the predicted hot gap was the Engine (C-1), so if the data confirms it, slice 3 may jump ahead of 4–5 (it has no hard dependency on Accounts).
- **Hard sequence:** slice 1 (shell) gates slice 2; slice 2 gates the librarian half of slice 3 and slice 6; ⌘K (slice 3a) and the Accounts book (slice 4) have no upstream Track-3 dependency.
- **No destructive migrations** until dissolve Stage 3 (R21); everything above is additive (D7 still in force for the surviving zones until exile).

---

## Kickoff line (paste to start Claude Code)

> Begin Track 3 with the **Rooms shell + the Library as its first tenant (R39)**: run the audit-first pass (the three-layer catalog, the put-down/timer chain-out, the companion API) and report what already exists before building; stand up the reusable Room physics behind the `the-document-pilot` flag; mount the Library's three shelves on real data; then **stop for review with ≥1280 and ~390px screenshots** and prep the L4 device check before touching the Engine.
