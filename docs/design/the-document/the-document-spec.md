# THE DOCUMENT — Design & Engineering Specification

**Workstream:** Designer Portal navigation replacement ("The Document" model)
**Status:** Concept locked · decisions D1–D11 ratified · ready for codebase audit + phased build
**Last updated:** April 2026 · v1.0
**Authority order:** Codebase (current behavior) → this spec (intent & contracts) → prototypes (look, feel, motion)
**Prototypes:** `prototypes/patina-the-document-prototype-v3.html` (latest), v0.2, v0.1, plus `patina-the-document-concept.html` (16-slide rationale deck)

---

## 0. How to use this document (instructions to the implementing agent)

1. **The codebase is the authority on what exists today.** This spec was developed in design sessions that do not capture all shipped functionality. Your first deliverable is `CODEBASE-MAP.md` (see §13, Slice 0) — do not write feature code before it.
2. **This spec is the authority on intent.** Where the codebase and this spec conflict, do not silently choose either. Record the conflict in `DECISIONS.md` as an open item and surface it for human review.
3. **The prototypes are the authority on look, feel, and motion.** They are vanilla HTML/CSS/JS; port the *intent* (tokens, spacing rhythm, stamp recipe, stacked-edge recipe, motion timing) into the repo's stack (Next.js 15 / React 18 / TypeScript / Tailwind). Do not port markup literally.
4. **`DECISIONS.md` is append-only.** Every locked decision below is seeded there. New decisions made during implementation get appended with date and rationale, never edited in place.

---

## 1. The concept in one page

The Designer Portal's zone navigation (Today / Pipeline / Procurement / Products / Clients + utility bar) fragments one client relationship across five places. The Document model replaces it with an architecture that matches the designer's existing mental model — the job folder:

- **The Desk** — the home surface. Shows documents that *need the designer's hand today*, documents in motion, and nothing else. No dashboard furniture, no metric tiles, no ambient badges.
- **The Document** — one living document per client relationship. It grows through seven sections: **Brief → Discovery → Direction → Proposal → Project → Install → Care.** Nothing converts; the document gains sections. The FF&E line drafted in the Proposal is *the same row* that carries procurement stamps in the Project section. Settled sections compress to a letterhead bar + seal; tap to unfold in place.
- **The Margins** — decisions, messages, money, the Weekly Pulse, and time records are *marginalia*: anchored to the exact line or section they concern. The margin is also the notification model — events accumulate silently in unopened documents; the document rises on the Desk if it needs a hand.
- **The Ledgers** — cross-project views are reference books in a persistent **Studio Drawer**: Library (the three-layer product catalog), Orders, Accounts, People, Hours. Ledgers are *lenses over the documents* — every ledger line links back to its home document. They open as sheets sliding over whatever the designer is holding; they never navigate away.

**The ledger rule:** worked for one client → lives in the document. Worked across clients → it's a ledger. Nothing belongs to both.

**The focus model:** strict one-document-at-a-time. Pick up → work → put down. No split views, no document tabs, no global nav while a document is open. The command bar (⌘K) jumps anywhere, but every destination is a document or a ledger, never a zone.

---

## 2. Locked decisions (seed for DECISIONS.md)

| ID | Decision | Detail |
|----|----------|--------|
| D1 | **Strict one document at a time.** | No split view, no peek/hold. Esc or "Put down" is the only exit from a document. Switching costs one trip through the Desk (or a ⌘K jump). |
| D2 | **Interruptions are designer-driven, never system-dictated.** | Default: nothing breaks through while a document is open; events accumulate at the Desk/margins. Each designer may configure break-through rules in their settings. The system ships with zero rules enabled. *(Interpretation flagged to and unchallenged by the team.)* |
| D3 | **Mobile pattern: margin items collapse to anchored chips on their lines; the spine becomes a bottom sheet.** | The current responsive pass in prototypes is interim. The dedicated mobile pattern is its own design+build milestone (see §14). Mobile is ~60% of designer usage — do not ship the default flip (D7) before this exists. |
| D4 | **No shadows. Anywhere. No exceptions.** | Object feel comes from value contrast (light paper on charcoal desk) + the flat stacked-edge device + the folder tab. Enforce mechanically: a stylelint/eslint rule banning `box-shadow` and `drop-shadow` in the designer-portal app (see §10). |
| D5 | **The Weekly Pulse lives in the margin.** | Drafted as a margin item (kind `pulse`) anchored to the Project section, beside the stamps it summarizes. On Fridays, documents with unsent Pulses rise on the Desk. |
| D6 | **Documents are visible to all studio members. No exclusive holds.** | Any member may pick up any document. A soft presence line in the spine ("In this document: Leah") prevents collisions. Each member's Desk computes "needs *your* hand" individually. *(Interpretation flagged to and unchallenged by the team.)* |
| D7 | **Ship alongside, phase in.** | The Document view ships as a parallel route behind a flag, alongside the existing zones, against real data. It becomes the default when validated with Leah; zones dissolve afterward. See §12. |
| D8 | **The Studio Drawer is persistent on every screen.** | A quiet fixed strip at the bottom edge — part of the desk, never the paper. Ledgers open as overlay sheets above the held document. Discipline: collapsed by default, no badges, no pulsing counts. |
| D9 | **Time: capture in the document, review in the drawer.** | The timer is document-bound and lives in the spine. The Hours ledger (drawer) is the cross-project book: review, edit, batch entry, export → Accounts. |
| D10 | **Suggestive, adjustable capture. The timer counts; the designer adjusts; nothing auto-trims.** | Pick up = clock in (see D11). Put down = log offer with **editable duration**, pre-filled with elapsed, adjustable up *or* down (idle time gets trimmed; off-screen work — sketching, calls, tear sheets — gets added). Elapsed < 60s discards silently. Idle detection, when built, only *annotates* the offer ("includes 14 quiet minutes"); it never modifies the number. All logged durations remain editable in the Hours ledger. |
| D11 | **Timer auto-starts on pick up — pending Leah's gut-check.** | Confirmation-at-put-down is the consent moment, so auto-start avoids double-asking. If Leah reports feeling surveilled by the running clock in her first session, fall back to a one-tap "start" in the spine. Treat as provisional until validated. |

---

## 3. Information architecture & navigation contract

```
DESK (route: /desk — the app's home when flag enabled)
 ├── "Needs your hand" stack (actionable documents only; never a feed)
 ├── "In motion" chips (progressing without the designer; not actionable)
 └── [Studio Drawer — persistent, see §8]

DOCUMENT (route: /doc/[projectId])
 ├── Spine: Put down · 7 section markers · timer · presence
 ├── Main: letterhead · settled bars (unfold in place) · active section
 └── Margin: anchored items (decision/message/invoice/pulse/time)

LEDGER SHEETS (overlay state, not routes — must not unmount the document)
 ├── Library · Orders · Accounts · People · Hours

COMMAND BAR (⌘K, global)
 └── Jumps to: a document, a section in a document, a line in a document,
     or a ledger. Never to a "zone."
```

Navigation invariants:
- Opening a ledger sheet must preserve all document state (scroll position, unfolds, in-progress margin compose, running timer).
- "Put down" and Esc are equivalent. Esc priority order: help overlay → log strip (= discard) → open sheet → put down document.
- Old-nav mapping (for the phase-in period and for the audit): Today → Desk · Pipeline → Desk arrangement · Procurement → line stamps + Orders ledger · Products → Library ledger · Clients → People ledger · utility bar (messages/notifications/search) → margins + Desk + command bar.

---

## 4. Document anatomy

**Sections (fixed sequence):** Brief, Discovery, Direction, Proposal, Project, Install, Care.
Each section is in exactly one state: `future` (ghost in spine), `active` (exactly one per document — "where the pen is"), `settled` (compressed to letterhead bar + stamp; unfolds in place to full content, read-only).

**Section lifecycle is derived, not duplicated.** Sections map onto the existing project stage progression — the audit (Slice 0) must produce the authoritative mapping from current `projects.stage`/status fields to section states. Expected shape: lead pending → Brief active; accepted → Brief settled, Discovery active; direction shared → Direction active; proposal sent → Proposal active; signed → Proposal settled (sealed), Project active (same FF&E rows wake up); install scheduled/complete → Install active/settled; → Care active (permanent).

**Opening a document lands at the active section,** not the top. The spine shows everything.

**The signing moment (highest-craft transition):** the Proposal section compresses + receives the SIGNED seal; the Project section unfurls beneath it; the FF&E lines do not move — they gain stamp affordances. No route change, no data copy. (Data model already supports this: the proposal IS the project definition.)

**Letterhead:** mini Strata Mark + client/project display name + one-line vitals (parties · rooms · key date · contract value).

**Presence (D6):** spine footer shows who currently has the document open ("Just you · visible to all of Middlewest" / "Leah is in this document"). Supabase Realtime presence channel per document; soft indicator only — no locking.

---

## 5. The Margins

Margin item kinds (all share one component shell with a kind accent — left border 2.5px):
- `decision` (Golden Hour) — question + options + designer recommendation + deadline; resolving stamps the anchored line; overdue decisions surface the document on the Desk.
- `message` (Dusty Blue) — threads anchored to a line/section/letterhead; replies round-trip with the Client Portal and email (designer reply-to addresses), same anchor preserved.
- `invoice` / money (Clay) — milestone invoices draft automatically from stamp triggers (e.g., first FF&E line hits `production` → M2 drafts); send/paid stamps mirror onto the payment schedule inside the settled Proposal.
- `pulse` (Sage, D5) — Friday auto-draft from the week's stamps/decisions/milestones; review-and-send inline; sent Pulses archive into the margin.
- `time` (Mocha, D9/D10) — daily summary record of time logged to this document; opens the Hours ledger.

**Anchoring model:** every margin item carries `anchor_kind ∈ {line, section, letterhead}` + `anchor_id` (FF&E item id or section key). Hovering a margin item highlights its anchor; on mobile (D3) the item collapses to a chip rendered on the anchor itself.

**The margin is the notification model (D2):** events in unopened documents accumulate silently; the Desk re-sorts in the background; nothing toasts mid-focus unless the designer's own break-through rules say so.

**One-act-many-surfaces invariant:** resolving a margin item must update, in one transaction: the anchored line's stamp, the margin item state, the Desk card, and (where applicable) the client-portal mirror. No background "sync" steps.

---

## 6. Procurement woven in

The FF&E table inside the Project section *is* the procurement UI for one client.

**Line stamp state machine:** `to_order → ordered → in_production → shipped → received → installed`, with exception states `decision_due / extended` (pre-order gate) and `damaged / returned` (branch from received). Stamps derive from the existing order/receiving data — the audit maps current procurement status fields onto this vocabulary; do not invent a parallel status store.

**Line unfold:** tapping a line expands an inline detail (PO number + terms, movement, receiving summary + photos, actions: message vendor / view PO / receiving log). The existing Order Assistant and Mobile Receiving flows mount *inside* the unfold — they are re-homed, not rebuilt.

**Cross-project procurement** (weekly receiving plan, vendor PO batching) lives in the Orders ledger. Batch actions write back into each affected document.

---

## 7. The Desk

- **"Needs your hand"** — only genuinely actionable documents (overdue/expiring decisions, unsigned proposals showing hesitation signals, new leads, Friday unsent Pulses per D5, designer-flagged items). Urgent = Golden Hour outline on the folder (no glow).
- Folder card contents: tab (client surname), title, stage line, single need line with stamp. The need line states *the one thing* and, where natural, the suggested act.
- **"In motion"** — non-actionable chips, one line each. Capped, never a feed.
- Date + "find anything" (⌘K affordance) are the only chrome.

---

## 8. The Studio Drawer & Ledgers (D8, D9)

Persistent bottom strip, charcoal, hairline top border, present on Desk and inside documents. Contents: drawer label · five ledger buttons (Library Clay / Orders Dusty Blue / Accounts Sage / People Terracotta / Hours Mocha — each with a 3px "book spine" tick) · right-aligned quiet readout **"In hand today · 1h 45m"** (opens Hours).

Ledger sheets: slide up over the current screen (max ~72vh), charcoal, dismissed by Esc/close. Rows always carry "open document →" links. The Library ledger is the existing three-layer catalog re-homed; capture and promotion flows unchanged.

Discipline (non-negotiable): no badges, no unread counts pulsing, no growth of the drawer into navigation. The drawer is part of the desk, never the paper.

---

## 9. The time system (D9, D10, D11)

**Timer lifecycle:**
1. `openDoc(projectId)` → timer starts for that document (D11, provisional auto-start). Spine widget: "IN HAND" label + live mm:ss + Pause/Resume + "+ Log".
2. One timer, ever. Picking up another document (including via a ledger jump) first closes out the previous timer through the log offer.
3. `putDown()` → if elapsed ≥ 60s, show the **log strip** (above the drawer): "*{Doc}* was in hand for *{elapsed}* — log [ N ] min as [activity] · Log it / Discard." Duration input pre-filled with elapsed, freely adjustable **up or down** (D10). Elapsed < 60s discards silently. Esc = discard.
4. Idle detection (later milestone): after N quiet minutes (threshold = Leah calibration, start at 8), the timer keeps counting but the eventual log offer carries an annotation: "includes ~14 quiet minutes." Annotation only — never auto-trim (D10).
5. **"+ Log"** in the spine: manual in-context entry (minutes + activity + optional note) for off-desk work.
6. **Hours ledger:** all entries across documents (doc · activity · source timer/manual · duration **editable inline** · billed/unbilled stamp · open-document link), week/today totals, after-the-fact batch add row, "Export week → Accounts." Job-costing view (hours absorbed vs. proposal pricing per project) is a fast-follow within this ledger.
7. The day's logged time per document also appears as a `time` margin item in that document.

**Activities (initial vocabulary, designer-extensible later):** Design, Sourcing, Client, Site visit, Admin.

**Schema (new table — adjust naming to repo conventions after audit):**

```sql
create table time_entries (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id),
  designer_id uuid not null references designers(id),
  section     text,                          -- section key if attributable
  activity    text not null,
  seconds     integer not null check (seconds > 0),
  source      text not null check (source in ('timer','manual')),
  started_at  timestamptz,                   -- null for after-the-fact manual
  logged_at   timestamptz not null default now(),
  edited_at   timestamptz,                   -- set on any duration edit
  raw_seconds integer,                       -- original timer elapsed, pre-adjustment (audit trail)
  idle_seconds integer,                      -- annotation only, never subtracted
  note        text,
  billable    boolean not null default true,
  invoice_id  uuid references invoices(id)   -- set when exported/billed
);
-- RLS: studio-scoped read (D6); writes by owning designer; align with existing studio_members policies.
```

`raw_seconds` vs `seconds` preserves the adjustment audit trail without judging it.

---

## 10. Visual & craft system

Tokens (use the repo's brand token source; hex for reference): Off-White `#FAF7F2`, Pearl `#E5E2DD`, Clay `#C4A57B`, Aged Oak `#8B7355`, Mocha `#5C4A3C`, Charcoal `#2C2926`, Sage `#A8B5A0`, Dusty Blue `#8B9CAD`, Terracotta `#D4A090`, Golden Hour `#E8C547`, paper `#FCFAF6`, stacked sheets `#EFE9DD` / `#E2DACA`, ink border `rgba(44,41,38,0.18)`. Type: Playfair Display (display/letterhead/durations), Inter (UI/body), DM Mono (labels, stamps, spine subs).

**Recipes (port intent, not markup):**
- *Ink stamp:* DM Mono 600 uppercase, ~0.1em tracking, 1.5px solid border in state color, 3px radius, `transform: rotate(-1.5deg)`, transparent fill. The rotation is the entire skeuomorphism budget for state.
- *Flat stacked edge (D4):* two offset solid sheets behind paper (≈2.5px and 5px down-right; folder radius), each 1px ink border, sheet2/sheet3 fills, z-indexed under the paper. Hover: paper translates −3px; no shadow, no blur, ever.
- *Folder tab:* paper fill, ink border (no bottom), 5px top radii, DM Mono label, overlapping the doc top edge by 14px.
- *Paper grain:* repeating-linear-gradient, 4px period, `rgba(139,115,85,0.01–0.012)` — threshold of perception.
- *Urgent:* `outline: 1.5px solid rgba(232,197,71,0.55)` inset on the folder paper.
- *Spine markers / letterhead / ledger spines:* the Strata Mark (3 lines, descending width) at small scales; Sage = settled, Clay = active, Pearl = future.
- *Motion:* pick up/put down 250–280ms ease-out lift-and-settle; unfolds are vertical max-height folds; stamps settle in ~80ms; nothing slides in from screen edges (paper doesn't do that). Full `prefers-reduced-motion` support.

**Mechanical enforcement of D4:** add a stylelint rule (or eslint-plugin-tailwindcss check) rejecting `box-shadow`, `drop-shadow`, and Tailwind `shadow-*` classes within `apps/designer-portal`. CI-blocking.

---

## 11. Data model mapping (directives, finalized by the audit)

- **Documents are a presentation layer.** A "document" = the existing project row + its relations. Do **not** create a `documents` table. Sections derive from stage (§4).
- **Margin items:** prefer a unified read model (Postgres view or query-layer union) over `decisions`, `messages`, `invoices`, `weekly_pulses`, `time_entries`, normalized to `{kind, anchor_kind, anchor_id, state, timestamps, payload}`. Add `anchor_kind`/`anchor_id` columns to source tables where missing — propose the minimal migration after auditing what anchoring already exists.
- **Stamps:** derive from existing FF&E/order/receiving status fields; map vocabularies in the audit; no parallel status store.
- **Desk query:** "needs your hand" is a computed query per designer (overdue decisions, hesitating proposals, new leads, Friday unsent Pulses, designer flags) — server-computed, cheap, real-time-ish (poll or Realtime).
- **Presence:** Supabase Realtime presence channel per open document (D6).
- **New tables:** `time_entries` (§9) and, if the audit finds no home, `designer_interruption_rules` (D2: designer_id, rule_kind, enabled) and `desk_flags` (designer pins). Keep additive; zero destructive migrations during phase-in (D7).

---

## 12. Phase-in plan (D7)

1. **Parallel route.** `/desk` and `/doc/[id]` behind a feature flag (env or per-designer DB flag), real data, read-mostly first. Old zones untouched.
2. **Internal validation.** Leah works real Tuesdays in the Document view; old nav one click away. Collect friction notes in `DECISIONS.md`.
3. **Action parity.** Margin actions, stamps, drawer, time system reach parity for daily work (per slices below).
4. **Mobile pattern (D3) built and validated.** Gate for step 5.
5. **Default flip.** Document view becomes the post-login default; zones remain reachable but undiscovered (no nav links — direct URL only).
6. **Dissolve.** Remove zone routes once usage telemetry flatlines; redirect old URLs into documents/ledgers (e.g., `/procurement` → Orders ledger deep link).

---

## 13. Build order (vertical slices with acceptance criteria)

**Slice 0 — Audit (no feature code).** Deliver `CODEBASE-MAP.md`: existing routes/components/packages relevant to designer portal; schema inventory for projects/FF&E/orders/decisions/messages/invoices/pulses; stage→section mapping proposal; stamp vocabulary mapping; anchoring gaps; conflicts with this spec; reusable components (Order Assistant, Mobile Receiving, proposal builder, three-layer Library). *Accept:* a human can read it in 15 minutes and approve the mappings.

**Slice 1 — The Desk (read-only).** Flagged route, real projects, needs-your-hand query, folders with stacked-edge/tab/stamps, in-motion chips, drawer strip rendering (sheets stubbed). *Accept:* Leah's real Tuesday shows the correct 2–4 folders with truthful need lines; zero shadows; lighthouse a11y pass.

**Slice 2 — The Document shell (read-only).** Spine with derived section states; letterhead; settled bars with unfold-in-place (Proposal first); active Project section rendering real FF&E with derived stamps; presence line. *Accept:* every real project renders correctly at its lifecycle stage; open lands at active section; Esc puts down.

**Slice 3 — Margins (read, then act).** Unified margin read model rendered with anchors + hover highlight; then actions: decision resolve (one-act-many-surfaces invariant §5), message reply (client-portal round trip), invoice send, Pulse send (D5). *Accept:* the Whitfield-style loop from prototype v0.3 works end-to-end on real data.

**Slice 4 — Line unfolds + Orders ledger.** FF&E unfold mounting existing order detail/receiving; Orders ledger sheet over the document with open-document links and one batch action. *Accept:* document state survives sheet open/close intact.

**Slice 5 — Time.** Timer (D11 auto-start), log strip with adjustable duration (D10), `time_entries` migration, "+ Log", Hours ledger with inline edit + batch add + week totals, "in hand today" readout, time margin record. *Accept:* doc-switch chains the log offer; sub-60s silent discard; adjusted entries persist `raw_seconds`; durations editable after the fact.

**Slice 6 — Polish + default-flip gates.** Command bar jumps; Friday Pulse desk-rise; designer interruption settings (D2, empty default); idle annotation (D10); motion + reduced-motion; the D3 mobile pattern (separate design input — request updated mockups before building).

---

## 14. Open questions (do not resolve unilaterally)

1. **D11 validation:** auto-start vs opt-in start — decided by Leah's first real session.
2. **Idle annotation threshold** (start 8 min) — Leah calibration; required before billing flows.
3. **Mobile D3 pattern details** — anchored-chip behavior and bottom-sheet spine need dedicated design; request from the design session (chat) before Slice 6 mobile work.
4. **Activity vocabulary** — fixed five vs designer-extensible; revisit after two weeks of real entries.
5. **Multi-designer Desk semantics under D6** — when two members both "need a hand" on one document, does it appear on both desks? (Current answer: yes, computed per member. Validate when Middlewest adds a second designer.)
6. **Billable default** — `true` per schema; confirm against Middlewest's flat-fee-dominant pricing (job-costing may want default `false` with per-project override).

---

## 15. References

- `prototypes/patina-the-document-prototype-v3.html` — canonical interaction reference (Desk, document, margins, drawer, time).
- `patina-the-document-concept.html` — 16-slide rationale deck (the "why," old-nav mapping, craft kit).
- Designer-client journey docs (designer portal / client portal / email templates) — the relationship touchpoints the Document surfaces serve.
- Three-layer catalog handoff — the Library ledger's internals (unchanged, re-homed).
