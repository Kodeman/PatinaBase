# THE DOCUMENT — Design & Engineering Specification

**Workstream:** Designer Portal navigation replacement ("The Document" model)
**Status:** v1.3 — **supersedes v1.2.** Slices 0–5 complete, stack rebased onto main `d249b49a` (procurement Waves 4–5) · **Session 02 is the next action** · Slice 5.5 (send weave, R18) inserted before Slice 6 · default-flip gates unchanged.
**Last updated:** 2026-06-12 (design session, post-Slice-5 + O7 review)
**Authority order:** Codebase → this spec → prototypes → `DECISIONS.md` (D1–D13, R1–R18, I1–I17, L1, O7-resolved folded in here)
**Repo reality:** patina-merged monorepo, `@patina/*` packages, React 19, Next.js 15, Tailwind, self-hosted Supabase. Document-stack migrations now **00191–00198** post-rebase.
**Canonical prototypes** (in `docs/design/the-document/`): `patina-the-document-prototype-v4.html` (desktop) · `patina-the-document-mobile-d3-v1.html` (mobile, D13). Session instrument: `leah-session-01-first-tuesday.html` — reuse for Session 02 with the §12.2 capture list.

Section numbering is unchanged from v1.1/v1.2 — existing `spec §N` references in `DECISIONS.md` remain valid. §14 items keep their numbers permanently; resolved items are marked, never renumbered.

---

## 0. How to use this document

1. **The codebase is the authority on what exists.** Now shipped and canon: `document_state` + claim counts, the `/doc/[id]` resolver with R6 redirect, `margin_items` index, `weekly_pulses` + single-transaction send, **per-item claim attribution** (`damage_claims.ffe_item_id`), **`margin_notes`** with live escalation to `client_decisions` AND `scope_change_requests` (artifact exists — 00066/00084/00114), the **R4 time extensions** on `project_time_entries`, `DocumentTimeProvider` with serialized hold/release/chain-out, and main's procurement send lifecycle (po-send, PO numbering, payment-due/delivery-week crons, expediting, partial receiving).
2. **This spec is the authority on intent.** Conflicts → `DECISIONS.md` as open items.
3. **The prototypes are the authority on look, feel, motion.** Port intent, never markup.
4. **`DECISIONS.md` is append-only**, lives ONLY in the repo, edited only by commit, and carries the integrity footer (entry count + last id) on every append.

---

## 1. The concept in one page

Unchanged from v1.2 §1 (Desk · Document-per-engagement growing Brief→Care · six-kind anchored Margins · Ledgers in the persistent Drawer · the ledger rule · strict one-document focus), with the pilot record updated: **Session 01 GREEN (L1)**; Leah's three findings ratified and now **shipped** (R10 thresholds, the R14 Note, R15 fill-state). Session 02 is due now — Slice 5 put the time system and the hotter Desk in front of her; her numbers settle D11, the idle threshold, the R10 precision check, and the R18 send thresholds.

---

## 2. Ratified decisions

**D1–D11** as logged · **D12** full-bleed · **D13** mobile pattern (Leah device validation gates the flip).

**R1–R15:** unchanged one-liners from v1.2 §2 (full text in `DECISIONS.md`).

**New since v1.2:**

| ID | Ruling |
|----|----|
| R16 | Slice 4/5 blesses: write-first close-out is a D10 refinement (truth logged, fully editable; Esc = discard stands) · pause-as-segment · activity default Design (provisional) · IN HAND / TYPED labels · "same truck" wording blessed but narration says "ETA aligned," never "acknowledged" · fill-state: project-exists ⇒ line 2 filled regardless of lineage · tab fallback = first word of document title, never a role noun · claim need lines must be engagement-scoped (AP-012 check). |
| R17 | `activate_proposal_as_project` drops `vendor_id` (main-lineage bug, procurement session owns) — fix + backfill land **before Session 02**, or the session script gains a seam answer. |
| R18 | **The send weave (resolves O7):** dedicated Slice 5.5 after Session 02 · send action in BOTH the unfold action row and Orders ledger row actions · confirm = **PDF preview as the confirm** (review-then-send, R11 precedent) · need lines "drafted — not yet sent" 2d / "sent — unacknowledged" 3d (provisional; Leah's numbers at Session 02) · payment-due flips = Money margin items · expediting = quiet Movement sub-lines · unscheduled shipment = row mark · §6 gains PARTIAL. |

---

## 3. Information architecture & navigation contract

Unchanged from v1.2 §3 (Desk / full-bleed Document / ledger sheets / ⌘K; the `/doc/[id]` resolver with R6 redirect; Esc priority — note the log strip listens on capture, Esc = discard, per I16; the D13 mobile pattern paragraph; R5 destinies mapping).

---

## 4. Document anatomy

Unchanged from v1.2 §4 (engagement identity, stage→section mapping, edge cases, signing moment, presence, `document_state` as shared derivation, R8 rendering honesty), plus:

- **Tab fallback (R16):** when no surname resolves, the folder tab renders the first word of the document title — never "CLIENT", "USER", or any role noun.
- **Letterhead and tab marks** carry fill-state per §10; manual projects render line 2 filled at Project-active (R16 — a project's existence IS commitment).

---

## 5. The Margins — six kinds

Unchanged from v1.2 §5 in structure; status updates:

- **`note` (R14) — SHIPPED.** `margin_notes`, one-tap capture from the rail header and line unfolds (pre-anchored), optional due dates joining needs-action. **Both escalation paths are live**: draft `client_decision`, or draft `scope_change_request` (the SCA artifact exists with create/send/approve flows — §14.9 CLOSED). RLS is author-scoped pending studio membership (00150 limitation). Studio-visible, never client-visible.
- **Ordering (R12 + I15 mechanics, canon):** needs-action ranks overdue decisions (0) → dued notes (1) → the week's unsent Pulse (2, Friday-gated), most-overdue-first → anchor order = letterhead band → section band → line band (lines ranked by the document's rendered FF&E order; unknown anchors sink within band) → within one anchor, newest first → "Settled · N" collapsed, newest-first expanded. The fold label is the only number anywhere in the margin.
- **`invoice`:** the 00189 payment-due flips arrive as Money margin items through the existing auto-draft narration (R18).
- **Decision override button** personalizes from `document_state.client_name` first name; falls back to "Record the pick" (I15).

---

## 6. Procurement woven in — stamps & the send lifecycle

**Stamp vocabulary (R2 + amendments, canon):** SPECIFIED / QUOTED / APPROVED / ORDERED / PRODUCTION / SHIPPED / DELIVERED / INSTALLED (STAGE_CONFIG canonical) · derived **RECEIVED** (delivered + clean inspection; "delivered, awaiting inspection" is a visible to-do) · **DECISION DUE** (always the current date) · **DAMAGED** — per-item, claims attributed via `ffe_item_id` (00193); the inspection flow drafts one claim per attributed piece; unattributed claims stay PO-grain and never stamp a line (Desk **CLAIM OPEN** need line + unfold + Orders only) · **PARTIAL** — the partial-receiving state, already truthful in the unfold's "N of M inspected" cell (R18).

**The send lifecycle (R18, Slice 5.5):**
- **Unfold:** the Purchase order cell narrates the lifecycle — "PO-00012 · sent to vendor Jun 12 · acknowledged." Drafted POs gain **Send to vendor** in the action row. The confirm is the **PDF preview as paper over the document** — "This is what the vendor receives" — one action, send. No confirm dialogs.
- **Expediting flags** render as quiet Movement sub-lines. Never badges.
- **Receiving** composes both per-item systems post-rebase: received quantities (`items[]`) + per-item claim attribution (`damagedFfeItemIds`) in one inspection flow.

Line unfolds (Order Assistant v2 mounts unchanged), Orders batching, unified query keys: unchanged from v1.2 §6, plus the R16 narration rule on "same truck" (history says "ETA aligned across POs," never vendor acknowledgment).

---

## 7. The Desk

**Inputs (canon):** overdue/expiring decisions · hesitating proposals · new leads · signed-awaiting-activation · DELIVERED-awaiting-inspection · CLAIM OPEN (engagement-scoped — R16) · Friday unsent Pulses · dued Notes · **PO drafted — not yet sent (2d, provisional)** · **PO sent — unacknowledged (3d, provisional)** (R18; Leah's numbers at Session 02) · Care follow-ups · designer pins.

**Thresholds (R10, live):** hesitating = sent **1 day** unopened OR opened **2 days** unsigned (≥ boundary — rises ON day one) · lead urgency **24h**. Precision watch: Session 02 captures the Q1/Q2 data L1 missed. Per-studio settings at studio #2.

---

## 8. The Studio Drawer & Ledgers

Unchanged from v1.2 §8, plus **Orders ledger v2 (Slice 5.5, R18):** `po-send-actions` as row actions (send / resend / PDF preview, same preview-as-confirm), unscheduled-shipment as a quiet row mark, "same truck" batch ETA with the R16 narration rule. **Hours ledger (shipped):** week view, day-grouped, inline activity/duration edits, invoice-claimed rows locked (00177 guard), "Export week → Accounts" stubbed until the Accounts book (Slice 6). The "in hand today" readout sums completed + live elapsed — a readout, not a badge.

---

## 9. The time system — SHIPPED (I16)

R4 as ruled, now live: additive 00195 (`raw_seconds` / `idle_seconds` / `source` defaulting `'timer_manual'` so the header TimerButton writes honestly with zero old-zone edits / `activity`) · one `DocumentTimeProvider` owns hold/release/chain-out through a serialized promise queue · **write-first close-out** (R16): the entry logs, then the strip offers adjustment; dismissed = logged truth, Discard = delete, Esc = discard · pause = close-out + resume latch (quiet segment, adjustable in Hours) · chained-out rows auto-fill phase from their own project when missing (header starts) · timer attaches to PROJECT documents only in v1 · activity default Design (provisional, Session 02) · spine timer hidden <980px until the D13 bar glance (Slice 6); components take state via the provider, unforked per surface.

**Session 02 settles:** D11 auto-start gut-check · idle threshold (start 8 min) · activity-default and pause-noise checks.

---

## 10. Visual & craft system

Unchanged from v1.2 §10 (tokens, recipes, D12 full-bleed, R3 enforcement, mobile materials), with fill-state finalized:

- **Fill-state fractions (I14 + R16):** within each movement group, settled sections count 1, the active section ½. **Project-exists ⇒ line 2 filled**, lineage or not — the lineage-blind tab approximation is replaced, not patched.
- **The breath** (active spine marker only, ~3s, reduced-motion safe) remains Slice 6 motion-pass work. Nothing on the Desk ever moves.

---

## 11. Additive schema work (status-consolidated)

**Shipped (post-rebase numbering 00191–00198):** document_state + claim counts · margin_items · weekly_pulses + send · per-item claims (`ffe_item_id`) · `margin_notes` + dual escalation · time extensions (00195/00198-range). Main carries po-send columns, PO numbering, procurement crons, expediting, partial receiving (00188–00190).

**Remaining:**
1. **Main-lineage (procurement session, before Session 02 — R17):** `activate_proposal_as_project` vendor_id fix + backfill.
2. Slice 5.5: PO need-line derivation on `document_state` (drafted-unsent / sent-unacknowledged ages) — view extension only.
3. Slice 6 / flip: `desk_flags` · `designer_interruption_rules` (ships empty) · Pulse email leg (Resend, journey template — R13) · studio-membership RLS widening for notes.

---

## 12. Phase-in plan (D7) — with gates

1. ✅ Parallel flagged route, real data.
2. ✅ ongoing. **Session 02 — NOW (post-Slice 5). Capture list:** D11 auto-start gut-check · idle threshold · **precision/recall at the R10-hot Desk** (missed at L1 — mandatory) · R12 ordering + the Note under real load · R18 send thresholds (her numbers) · name any old-portal-flight trigger · after the debrief, hand her the D13 prototype **on her phone** (early flip-gate data, off the record).
3. Action parity per slices (5 of 6 complete + 5.5 pending).
4. **Default-flip gates (unchanged):** D13 built + Leah device validation · Pulse email leg · idle annotation · R5 destinies staged · Desk precision verified at R10 thresholds.
5. Default flip · 6. Dissolve (unchanged).

---

## 13. Build order (status + scope)

**Slices 0–5 ✅** (audit · Desk · shell/full-bleed · margins · unfolds/Orders/Note/fill-state · time) — rebased onto main `d249b49a`, 13/13 acceptance assertions, 367/367 jest.

**→ Session 02** (the §12.2 capture list) — before any further build.

**Slice 5.5 — Orders ledger v2 + the send weave (R18).**
Unfold PO cell narrates the send lifecycle; Send to vendor (drafted POs) with PDF-preview-as-confirm; Orders row actions (send/resend/preview); unscheduled-shipment row marks; expediting sub-lines; PO need lines at provisional 2d/3d (constants beside R10's in `desk-derivation.ts`, updated with Leah's numbers); payment-due → Money margin items.
*Accept:* a drafted PO sends from both homes through the same preview-confirm; the need lines rise and clear truthfully; no badge, banner, or dialog anywhere in the weave.

**Slice 6 — polish + flip gates** (trimmed of orders work): ⌘K extension with fill-state rows · Friday Pulse desk-rise · Pulse email leg · interruption settings (empty) · idle annotation · ledger front-matter · Aesthete fold · the breath + motion pass · **D13 mobile build** + Leah device validation · R5 exiles staged.

---

## 14. Open questions (numbers permanent; resolved items marked)

1. **D11** auto-start — Session 02.
2. **Idle threshold** — Session 02.
3. **Desk precision at R10 thresholds** — Session 02, mandatory capture.
4. **Activity vocabulary** (+ sticky-default question, R16) — after two weeks of entries.
5. **Billable default** — travels with time data.
6. **Multi-designer Desk semantics** + per-studio thresholds — at studio #2. Note RLS widening for notes rides this.
7. **Direction-share upgrade** — when client board reactions ship.
8. **Mobile Receiving placement** — iOS-first vs web parity.
9. ~~SCA artifact~~ — **RESOLVED**: `scope_change_requests` exists; escalation live (I14).
10. **Inbox retirement** — verify at Slice 6.
11. **Old-portal flight trigger** — name it if it recurs at Session 02.
12. **R18 send thresholds** — provisional 2d/3d until Leah's numbers (Session 02).
13. **AP-012 engagement-scoping** — verify one claim cannot produce two folders (R16).
14. **vendor_id fix landed?** — R17 gate on Session 02.

---

## 15. References

Prototypes v0.4 + mobile-d3-v1 · session instrument (reuse for 02) · `CODEBASE-MAP.md` + §11 procurement addendum · `DECISIONS.md` (D1–D13 · O1–O7 resolved · I1–I17 · R1–R18 · L1) · journey docs (Pulse email template) · catalog handoff.
