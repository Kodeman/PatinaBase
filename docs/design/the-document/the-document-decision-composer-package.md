# Handoff — The Document: the Decision Composer (R55–R56)

**To:** Claude Code (implementation authority)
**From:** the design session — 2026-06-15
**Closes:** Feature Gap Matrix — **Decisions zone, the composition cluster** (#1 P0). The read/act half is already FULL and Track 5 generalized the decision in place; this builds the **authoring** half — create / build / publish a decision from inside the Document.
**Reads against:** `DECISIONS.md` R55–R56 · `patina-decision-system-prototype.html` (canonical look/feel, landed) · `portal-vs-desk-feature-gap-matrix.md` (the gap source, landed).

> **Reconciliation note (read first).** The original decision-system package (uploaded, intentionally **not** landed — it is superseded by this file) bundled four rulings (R46–R49) assuming a proposal-authoring precursor and a repo at R45. Reality moved past it: **Proposal Authoring shipped as Track 4 (R42–R45, I35)** and **Project Coordination — the ball-in-court generalization — shipped as Track 5 (R46–R54, I36)**, which is exactly `patina-project-coordination-prototype.html`. So that package's R48 (generalization) and most of R49 (the resolve/one-act cascade) are **already built**; only the **composer + enriched detail** remained. This round is therefore just **R55 (composer) + R56 (detail)** — do not rebuild Track 5.

---

## Part A — DECISIONS.md state (already appended; footer restored)

- **R55–R56** are appended; the integrity footer is recomputed and healthy:
  `*Entries: D1–D14 · O1–O7 (resolved) · I1–I36 · R1–R56 · L1–L4 · THE GO · FLIP CONFIRMED · last id = R56*`.
  (The pre-existing corrupted multi-line footer — which had hand-noted a duplicate O7 — was normalized in the same pass; the O7 dup is still explained in the Track-5 O7 entry body.)
- Build to **R55** (the composer) and **R56** (the enriched detail). Nothing to re-paste.

---

## Part B — build plan

Standing rules unchanged: additive-only, real data, behind the `the-document-pilot` flag, one PR per track titled `the-document: decision-composer N — <name>`, end with the `DECISIONS.md` I-entry + screenshots. **Audit first** — the gap matrix is capability-grain, not schema-verified, and Tracks 1–5 repeatedly found the table/hook/component already existed behind `/portal`. This round is largely **new sheet surfaces over an existing data layer**, like the Library and the Drafting Room were.

### Track A — The decision composer (R55)

**Audit first (most of this exists behind `/portal`):** `client_decisions` (with `decision_kind` 00202 **and** Track 5's `coordination_kind` / `court` / `blocks_kind` 00213) · the options child (`decision_options` / `client_decision_options`) · `useCreateDecision` · `useUpdateDecision` · `usePublishDraftDecision` · `useDeleteDecision` · `useMaterializeDraftOptions` · the `DecisionOptionBuilder` component · `linked_phase`. The **sheet machinery** to reuse: Track 4's Drafting Room / proposal instruments and the Track 3 `RoomSheet`; the **fill-in-any-order grammar** is the Composing Page's (R40).

1. **The composer sheet** — opened from the margin "+ New" and from a project section; an editing-mode **sheet**, never a full-page modal or a separate route. Reuses the Track 4 sheet machinery.
2. **Compose facets, any order:** `decision_kind` picker (the taxonomy) · title · context · the option builder (name, price, qty, image/swatch, designer note, recommended "pick") · **materialize options from the Library** (`useMaterializeDraftOptions` — the librarian seeds options) · due date · phase link · blocking toggle + the FF&E line it gates.
3. **Lifecycle:** save **draft** (`useCreateDecision`/`useUpdateDecision`, unsent + client-invisible + editable in the margin) · **publish** (`usePublishDraftDecision`, draft→pending) · **delete** (`useDeleteDecision`). Editing a draft re-opens the composer on it.
4. **The authoring side of §5:** publishing a *blocking* decision **lights the `decision_due` stamp** on its FF&E line the instant it goes pending — the mirror of Track 5's resolve cascade (which clears it). Reuse `stamp-derivation.ts`; do not re-implement the clear/resolve side (Track 5 owns it).
5. **Front door for coordination kinds:** the same sheet composes an RFI / submittal / sign-off / punch (set `coordination_kind` / `court` from Track 5's columns) — the composer writes the row, `resolve_coordination_item` resolves it. One create-surface, one resolve-path.

*Accept (each maps to a matrix Decisions row):* create a decision from a project margin · **edit an unsent draft** · **publish draft→pending** · **delete** · build options with full attributes · **materialize options from the Library** · **link to a phase** · set blocking + the FF&E line · a draft is unsent and client-invisible until published · publishing a blocking decision lights the `decision_due` stamp · composing an RFI/submittal/etc. writes a Track-5 coordination item that then resolves through the existing cascade. Declined from scope: a full-page composer, a modal, a separate "+ New" picker route, decision analytics (P2), internal designer notes in the client-visible margin.

### Track B — The enriched decision detail (R56)

**Audit first:** `margin-bodies.tsx` `DecisionBody` · `useDecision` · `useDecisionOverrides` · `client-mirror.tsx` (where context already renders) · `useApplyDecisionOverride` · `useSendDecisionReminder` · the extend/nudge controls (the matrix says present in `DecisionBody`).

1. **Deepen `DecisionBody`** into an expandable sheet: `decision_kind` on the kind-line · rich context (port from the client mirror to the designer view) · full option attributes (price/qty/imagery/designer note/"Your pick") · status lifecycle legibility (draft/pending/overdue/responded/resolved) · extend + nudge when pending/overdue · the full resolution audit trail (choice / recorded-by / consent method / evidence / timestamp — previously a quiet "Resolved · date" line).
2. **Preserve verbatim** the two FULL flows: override-consent (`useApplyDecisionOverride` — option select, method radio, evidence, Record) and reminder (`useSendDecisionReminder`). Both keep the §5 one-act invariant (margin + Desk + line stamp in one act).
3. Discussion points at the project comms thread (R27) + the one-thread-per-item model (R50) — no per-decision feed.

*Accept:* the designer sees context + full option attributes inline (both were PARTIAL/mirror-only) · the audit trail shows method + evidence + who (was date-only) · override-consent works identically and invalidates margin + Desk + line stamp in one act · nudge/extend work when overdue · analytics and internal designer-notes do NOT surface.

### Schema / sequence

- **Additive only.** The data layer + hooks exist behind `/portal`; this is new sheet surfaces + enrichment over them. No destructive migrations (D7 holds for surviving zones). Build **Track A first** (the gap), then **Track B** (enrichment).
- **Track 5 compatibility:** the composer writes onto the widened `client_decisions`; verify the publish path is compatible with `resolve_coordination_item` (a composed coordination item must resolve cleanly through the existing cascade).

### Gates & follow-ups

- **Review milestone:** compose a new decision on a real project — kind taxonomy, option builder, materialize from the Library, publish → it lights the FF&E `decision_due` stamp; then record/resolve it → it clears via Track 5's cascade and unblocks procurement, in one act. Screenshots ≥1280 (+ the mobile fold) committed to `screenshots/decision-composer/`.
- **Spec fold owed (flag, not blocking):** the spec is still **v1.4** (pre-Track-4/5). A **v1.5 cut** is owed that folds Tracks 4–5 (R42–R54) *and* the composer (R55–R56) into the body, updates the gap matrix Decisions/Proposals rows toward parity, and carries the §14.15 open items. Until then, this log + the prototypes are the authority.
- **Unrelated open threads (not this round):** §14.15 Via-Patina rates, the People book placeholder, and the Track 3 merge gates (L4 done; F1 screenshots) remain on the board.

---

## Kickoff line (paste to start Claude Code)

> Build the Decision Composer (R55–R56), the authoring half of the Decisions zone — onto the existing foundation (Track 4 sheet machinery, Track 5's widened `client_decisions` + resolve cascade), NOT a rebuild of either. Track A first: audit `client_decisions` + the options child + `useCreate/Update/Publish/Delete/Materialize` hooks + `DecisionOptionBuilder` (most exist behind `/portal`), then build the composer **sheet** opened from the margin "+ New" — compose any-order (kind/title/context/options/materialize/due/phase/blocking), draft→publish→delete, and publishing a blocking decision lights the `decision_due` stamp. Then Track B: deepen the margin `DecisionBody` (context, full option attributes, audit trail), preserving override-consent + nudge verbatim. Additive, behind the flag, one PR per track, ending with the I-entry. Review milestone: compose → publish → it lights the stamp; record → resolves and unblocks procurement in one act.
