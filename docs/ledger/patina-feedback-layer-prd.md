---
Status: Draft
Owner: Kody
Last Updated: 2026-07-06
Primary user: Leah (Middlewest Studio)
Related: Designer Portal · design deck "Building the Feedback Loop"
---

**Purpose.** Specify the in-portal feedback layer for the Patina Designer Portal — a persistent, always-available way for the portal's first daily user to capture what's working, what's not, what's missing, and what she'd change, and for those notes to be triaged and closed out without leaving the portal.

# Feedback Layer — Designer Portal

## 1. Summary

The feedback layer lets the Designer Portal's daily user leave a note about the product from **any** screen, in seconds, and lets those notes be triaged and resolved. Capture is a persistent control that sits above the interface on every screen — deliberately **not** tied to the margin, which only appears on some screens. Every note is auto-tagged with where it came from and sorted into one of four buckets: **Working, Not working, Missing, Change**. Notes collect in a **Ledger** with a simple status lifecycle, and shipped changes are reflected back to the person who asked for them.

## 2. Context & problem

- Leah is the first person using the portal in real daily work while it's still in active development. Her friction and delight are the highest-value signal we have for what to build next.
- That signal is perishable. If capturing a thought means leaving the portal — a Slack message, a text — most of it evaporates by end of day.
- The **margin** (the portal's contextual annotation space) only appears on certain screens. Friction often lives on the screens *without* a margin: settings, list views, empty states, the error she just hit. So capture cannot borrow the margin — it has to be independent of screen structure.
- **Goal:** make logging a thought as fast as having it, from anywhere, and make it visible that the note was heard.

## 3. Goals and non-goals

**Goals**
- Capture is available on every screen, in a fixed location, on its own layer.
- Logging a note takes two taps and no context-switch.
- Every note arrives pre-categorized (four buckets) and pre-contextualized (screen auto-captured).
- Notes are reviewable in one place with a status that shows progress.
- Shipped work is reflected back to the person who requested it (the loop closes).
- Backing store is dead simple to start and lives on the existing stack.

**Non-goals** (explicitly out of scope for this layer)
- A public or multi-tenant feedback widget for many designers at once.
- Support ticketing, live chat, or an SLA.
- Roadmap voting, NPS/CSAT surveys, or sentiment scoring.
- Analytics dashboards or reporting.
- Anonymous feedback (this is a known, signed-in user).

## 4. Success signals

Single-user context, so these are directional rather than statistical:

- **Volume without prompting** — notes captured per week when nobody asked for them.
- **Actionability** — share of notes with enough context to act on *without* a follow-up question.
- **Time-to-triage** — median time from a note landing to a status other than *Noted*.
- **Loop closure** — share of shipped items that get seen or reacted to.
- **Qualitative** — Leah's own sense that capture is effortless and that she's being heard.

## 5. Users

| User | Role | Needs |
|---|---|---|
| **Leah** (primary) | Daily designer user; non-technical re: portal internals | Log a reaction in the moment without breaking flow; see that it landed and that it moved |
| **Kody** (secondary) | Builder / reviewer | A single, pre-prioritized place to triage; optional hand-off into existing tools (OmniFocus, Ada) |

## 6. The layer at a glance

| Component | Role |
|---|---|
| **Capture button** | Persistent control on every screen. Opens the capture sheet. Later carries a badge when something ships. |
| **Capture sheet** | Focused, screen-agnostic overlay. Bucket + note + auto-context + optional weight/screenshot. |
| **Confirmation** | Lightweight, non-blocking acknowledgment after submit. |
| **Ledger** | Dedicated review view. Every note, filterable, with a status lifecycle. |
| **Loop** | "Shipped from your note" surface + reactions + reopen. Closes the feedback loop. |
| **Store & fan-out** | One table to begin with; optional webhook into Kody's own workflow. |

> **Model note.** In the portal's Desk / margin / ledger / Document model, this layer belongs at the **Desk** level — the frame that's always present — not the page. The review view reuses the **Ledger** concept (a running record). Map these to the canonical model as needed.

## 7. Functional requirements

### 7.1 Capture button

A single persistent control, fixed in the same position on every screen, rendered above the interface on its own layer.

- **R7.1.1** Present on every authenticated screen, including screens with no margin (settings, lists, empty states, error states).
- **R7.1.2** Fixed position; default bottom-right. Must not overlap primary actions — see Open Question Q1 on placement/collision.
- **R7.1.3** Visually separated from page chrome (its own elevation/shadow), so it reads as a system control, not content.
- **R7.1.4** Rest state is compact (a mark). On hover/focus it expands to reveal a text label ("Leave a note").
- **R7.1.5** Opens the capture sheet on click, `Enter`, or `Space`. Keyboard-focusable with a visible focus ring.
- **R7.1.6** Minimum 44×44px hit target; respects safe-area insets on mobile.
- **R7.1.7** (Phase 3) Shows a small badge when an item the user flagged has changed status to *Shipped* and hasn't been seen.

**States:** rest · hover/focus (labeled) · open (sheet showing) · badged (Phase 3).

### 7.2 Capture sheet

A focused overlay that is identical on every screen. It does not depend on the underlying screen's layout.

- **R7.2.1** **Bucket** — single-select, required. Four options: Working, Not working, Missing, Change. Each has a fixed color and glyph (see Appendix).
- **R7.2.2** **Note** — free text. Encouraged but not required if a bucket is chosen (a one-tap "Working 👍" with no text is still a valid signal). Placeholder adapts to the selected bucket.
- **R7.2.3** **Context** — auto-captured and shown read-only (screen name + route). The user never types where they are.
- **R7.2.4** **Screenshot** — optional toggle, default on. Captures the current screen at the moment the sheet opened (not the sheet itself).
- **R7.2.5** **Weight** — optional priority (Low / Medium / High). Absent = unweighted. Priority is the user's call, not an inferred guess.
- **R7.2.6** **Submit** — primary action labeled "Leave note". Disabled until a bucket is selected. On success → confirmation, sheet closes, button returns to rest.
- **R7.2.7** **Cancel / dismiss** — button, `Esc`, or scrim click. Never destructive without content; if text was entered, confirm before discarding.
- **R7.2.8** Opens focused on the bucket row; fully keyboard-operable; traps focus while open; returns focus to the button on close.

**States:** empty · bucket selected · filled · submitting · error (submit failed) · offline (queued).

**Edge cases:** empty note + no bucket → submit disabled; very long note → scrolls, no hard cap for Phase 1; submit failure → inline error, note preserved, retry; offline → queue locally and sync when back (Phase 2+).

### 7.3 Confirmation

- **R7.3.1** Non-blocking (toast or inline), auto-dismiss ~4s, manually dismissible.
- **R7.3.2** Copy in the interface's voice, e.g. "Noted — thanks." with a link "See it in the Ledger →".
- **R7.3.3** Never interrupts the underlying task or steals focus.

### 7.4 The Ledger

A dedicated view collecting every note.

- **R7.4.1** List of notes, most-recent first by default; sortable by date and by weight.
- **R7.4.2** Filter by bucket (All / Working / Not working / Missing / Change) and by status.
- **R7.4.3** Each row shows: bucket dot, note (truncated), weight indicator, status, date.
- **R7.4.4** Status lifecycle: **Noted → Building → Shipped**, with **Archived** as a terminal "won't do / superseded" state. Status is set by Kody (or via fan-out sync).
- **R7.4.5** Selecting a row opens the note detail (7.5).
- **R7.4.6** Empty / first-run state invites the first note and points to where the button lives.

### 7.5 Note detail

- **R7.5.1** Full note text, bucket, weight, author, timestamp.
- **R7.5.2** Captured context: screen name, route, app version, viewport, and the screenshot thumbnail (expandable).
- **R7.5.3** Status timeline (Noted → Building → …) with dates.
- **R7.5.4** Replies/updates from Kody (Phase 2+), so the note is a short thread, not a dead entry.
- **R7.5.5** Actions: react, reopen (Phase 3), archive.

### 7.6 Loop (close-the-loop)

- **R7.6.1** When a note moves to *Shipped*, surface a "Shipped from your note" card that quotes the original note and states what changed.
- **R7.6.2** Reaction affordance (e.g. 👍 / 🎉) and a **Reopen** ("not quite") that returns the item to *Building* with a comment.
- **R7.6.3** The capture button badge (R7.1.7) is the ambient entry point to unseen shipped items.

### 7.7 Optional layers (Phase 3+, each independently shippable)

- **Keyboard drop** — a global shortcut (e.g. ⌘⇧F) opens the capture sheet from anywhere.
- **Quick-jot / voice** — a few words or a voice memo for when typing is too slow.
- **Gentle prompt** — if the user has been quiet a while, a light, dismissible nudge asking the four questions directly.
- **Weight by default** — surface weight more prominently once there's enough volume to prioritize.

## 8. Context capture

**Captured automatically with every note:** route/path, human-readable screen name, app version, viewport size, timestamp, author.

**Optional:** element reference (if the note was pinned to a specific element) and a screenshot of the screen as it was when the sheet opened.

**Screenshot handling:** captured client-side; stored in a private bucket; referenced by URL on the note. Because the only user is internal, exposure risk is low — but the screenshot must capture the underlying screen, not the sheet, and per-note opt-out is required (R7.2.4). Consider light redaction of obvious sensitive fields before general rollout.

## 9. Data model

Phase 1 is a single table. Postgres (Supabase) — the store the portal already runs on.

```sql
-- Phase 1
create table feedback (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  author        text not null,                 -- 'leah' for now; multi-user later
  bucket        text not null,                 -- working | not_working | missing | change
  note          text,                          -- optional if bucket is set
  weight        text,                          -- low | med | high | null
  screen_name   text,                          -- 'Project board'
  route         text,                          -- '/projects/kilkenny/board'
  app_version   text,
  viewport      text,                          -- '1440x900'
  element       text,                          -- optional selector/label
  screenshot_url text,                         -- optional, private storage ref
  status        text not null default 'noted'  -- noted | building | shipped | archived
);
```

```sql
-- Phase 2+: turn each note into a short thread (status history, replies, reactions)
create table feedback_events (
  id           uuid primary key default gen_random_uuid(),
  feedback_id  uuid not null references feedback(id) on delete cascade,
  created_at   timestamptz not null default now(),
  actor        text not null,                  -- 'kody' | 'leah'
  kind         text not null,                  -- status_change | reply | reaction
  payload      jsonb not null                  -- { from, to } | { text } | { emoji }
);
```

**Enums (as text for now):** `bucket ∈ {working, not_working, missing, change}` · `weight ∈ {low, med, high}` · `status ∈ {noted, building, shipped, archived}`.

## 10. Architecture & integration

- **Capture client** — the button and sheet live in the portal frontend; screenshot via a client-side capture lib. Writes to Supabase through the portal's existing API / row-level security.
- **Store** — Supabase (Postgres). Screenshots in a private storage bucket.
- **Ledger** — reads from the same store; no separate service.
- **Fan-out (optional, Phase 3)** — a Supabase edge function / webhook on insert can hand a note off into Kody's workflow: an OmniFocus task, a line in Ada's digest, or a direct ping. Decoupled and non-blocking — the layer works with none of it.
- **Deployment** — alongside the portal on **Coolify**.

The capture path (write) and the review path (read) are independent, so Phase 1 can ship with no Ledger UI at all — Kody can triage from a simple query/view until the Ledger lands.

## 11. Rollout

- **Phase 1 — this week.** Capture button + sheet (four buckets + note + auto-captured screen) → `feedback` table + a lightweight confirmation. No Ledger UI yet; triage via a Supabase view. Roughly 80% of the value.
- **Phase 2 — next.** The Ledger (list, filters, statuses) + note detail + screenshot capture + `feedback_events`.
- **Phase 3 — then.** Close the loop (shipped card, reactions, reopen, button badge) + fan-out + the optional layers as they earn their place.

## 12. Open questions / decisions

- **Q1 — Button placement.** Bottom-right is conventional but most likely to collide with a primary "Save"/action or a future chat affordance. Options: bottom-left, or a nudge-able position. **Decision needed before Phase 1.**
- **Q2 — Screenshot default.** On by default (proposed), or off to keep capture instant and privacy-simple?
- **Q3 — Weight.** Ship the 3-level weight in Phase 1, or add it once there's enough volume to prioritize?
- **Q4 — Triage home.** Does Kody triage inside the Ledger, or primarily via fan-out (OmniFocus)? This decides how much the Phase-2 Ledger needs to do.
- **Q5 — Multi-designer readiness.** Keep the schema single-user-simple, or carry `author`/tenant fields now to avoid a migration when more designers arrive? (Schema above hedges with `author`.)
- **Q6 — Auth / RLS.** Confirm the portal's per-user auth model so notes are correctly attributed and access-controlled.

## Appendix — glossary

**Buckets**
- **Working** ✓ — what feels good and should never break. *("Protect this.")*
- **Not working** ✕ — friction, confusion, the thing that broke. *("This tripped me up.")*
- **Missing** + — the gap between what it does and what she needs. *("I wish it could…")*
- **Change** ↻ — right idea, wrong execution. *("This, but different.")*

**Statuses**
- **Noted** — logged, not yet triaged.
- **Building** — accepted and in progress.
- **Shipped** — done and reflected back to the requester.
- **Archived** — won't do, duplicate, or superseded (with a reason).

**Model mapping** — Desk (persistent frame; where the capture button lives) · margin (contextual annotation space; *not* where capture lives) · Ledger (running record; the review view) · Document (the artifact being worked on).
