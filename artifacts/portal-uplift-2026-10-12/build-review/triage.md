# US-28 — build triage (orchestrator)

This file is the fix list for SQ-836. Each item carries one ruling:
- **FIX**: SQ-836 does it.
- **KEEP**: the behaviour stands as built.
- **OWED**: Kody rules after the ship; nothing is built until then.

It covers findings from the build, the frontier reviews, the local walk (SQ-834) and the release review (SQ-835).

## Rulings made during the build

| # | Source | Finding | Ruling |
|---|---|---|---|
| T1 | S9 (SQ-823) | The specimen showed "Send to Tom and Ellery Vance" on the Drafting Room paper. | **KEEP retired.** The earlier ruling retired legacy send from the Drafting Room, and the contract tests forbid it. Kody may reopen it (OWED, low). |
| T2 | S10b (SQ-825) | The People "On these jobs" stage ticks need a per-person stage join that does not exist. | **KEEP the honest subset.** The ticks are left out (OWED: a data change, if Kody wants them). |
| T3 | S11 (SQ-827) | The board eyebrow has no client name or stage, there is no "sent to X on date", and the index has no "New board". | **KEEP the honest subset.** Present moved to S12 (SQ-829). The data gaps are OWED. |
| T4 | S1/S8 | The PR-v pigment tokens were removed from globals.css. The deprecated `STATE_WORD_PIGMENTS` alias remains. | **FIX in SQ-836:** delete the alias once grep shows no caller. **FIXED (SQ-836)** in `packages/types/src/studio-config.ts`. `STATE_WORD_PIGMENTS`, its `StateWordPigmentTokens` type and the `StateWordResolution.tokens` field are deleted. Only two tests read them, and they now assert the alias is gone: `apps/designer-portal/src/lib/document/__tests__/state-word-inks.test.ts` and `apps/designer-portal/src/components/document/people/__tests__/people-primitives.test.tsx`. |
| T5 | S6, S9 | No browser visual check was possible, because `.env.local` reads were denied in those executors. | **FIX via SQ-834:** walk the chrome, `/drafting`, `/compose`, `/ceremony` and the rooms at 1440 and 390. |
| T6 | S0 | The I91 contract test was updated: the Desk head has no primary act (U-Q3). | **KEEP.** |
| T8 | S7b (SQ-830) | The two e2e specs lock in the old editing flow, so the specimen's at-rest frames are not matched. The book opens with its first piece unfolded, the tab reads "Specification editor" (it should be "Specification"), the save act reads "Save specification" (it should be "Save the finish"), and the trade price fact is missing from an opened piece. | **FIX in SQ-836.** It may edit `e2e/document/spec-book-workspace.spec.ts` and `e2e/library-configuration/spec-book-dimensions.spec.ts`. **FIXED (SQ-836)** in `apps/designer-portal/src/components/document/spec-books/spec-book-workspace.tsx`:<br>• The book opens at rest. Only a line addressed by `?ffeItemId=` arrives unfolded (the SP-19/F57 arrival).<br>• The tab reads "Specification".<br>• An opened piece shows its Trade price fact, cents-exact as the preview prints it. Only a viewer who may see margin sees it (R1), and only when the line has a price.<br>• The save act names the change. It reads "Save the finish" when the fold opened from "Add a finish", and "Save the specification" otherwise, because that one act saves every field.<br>Tests: `spec-book-workspace.test.tsx` and `__tests__/spec-book-way-back.test.tsx` (margin mock). The two e2e specs are re-pointed (open the piece first; the new labels) but not run here: SQ-833 holds the runtime. |
| T9 | S12 (SQ-829) | The design-system canvas, painter and BoardsBlock paths were refused. | **FIX via SQ-846**, which also changes the client-portal share page, so the client portal deploys too. |
| T10 | S12b (SQ-846) | Handles have a 24 px hit area on a fine pointer and 44 px on a coarse one, where the spec said 44 px. Painter images are object-contain, but the editor uses cover (pre-existing). The zone colour control stays beside its word. | **KEEP.** 44 px is the touch target and holds on coarse pointers, and contain-versus-cover is pre-existing and pinned by tests. The SQ-834 walk checks whether the export matches the screen. |
| T7 | S5 (SQ-832/839/840) | Teammates' state is read through the facts-only RPC, and the table is own-row only. service_role keeps EXECUTE. | **KEEP** (see rls-review.md). |

## Frontier review of 00767 (SQ-842)

The review was GPT-6 Astra, read-only, pinned to e29a956a1, and its verdict was not approved to ship. A read-only check on Strata (2026-10-13) found 00766 and 00767 unapplied, with 12 books, 15 room chapters (0 customised) and 23 settings.

| # | Severity / confidence | Finding | Ruling |
|---|---|---|---|
| F1 | med / high (reproduced) | External addenda marked a re-filed line as changed. | **Closed** by SQ-843 (09e5ecf4b). |
| F2 | high / high | The re-file deleted customised room chapters, losing their content. | **FIX** in SQ-844: a customised chapter becomes hand-made and keeps its lines. |
| F3 | med / med | A concurrent prune could set a new line's membership to null. | **FIX** in SQ-844: serialise per book. |
| F4 | low / high | The client's null-room fallback matched every trade chapter. | **FIX** in SQ-830. |
| F5 | med / high | A fresh local seed granted EXECUTE on the new SECURITY DEFINER helpers. | **FIX** in SQ-844: regenerate the seed. |
| F6 | med / high | Taxonomy was resolved by the designer, not the studio. | **FIX** in SQ-844. |
| F7 | med / high | Taxonomy edits leave existing lines in the old trade. | **KEEP** as a known limitation, documented in the header (OWED: tell Kody). |
| F8 | low / high | Concurrent departures or a soft removal could leave Unsorted empty but visible. | **FIX** in SQ-844 (prune) and SQ-830 (count active lines only). |
| F9 | low / high | The PDF eyebrow says "Room" over a trade chapter. | **FIX** in SQ-844. |
| ops | — | The migration had no lock_timeout. | **FIX** in SQ-844: `SET LOCAL lock_timeout = '10s'`. |

SQ-845 re-reviewed the repair before the integration gate. It was GPT-6 Astra, read-only, pinned to 926b048c2, and found **CLEAN, no new findings**: F2, F3, F5, F6, F8a and F9 are closed and the lock_timeout is present. One residual is accepted: archiving a line does not, on its own, physically prune an emptied chapter, which the client hides anyway.

## Release review (SQ-835)

The review was GPT-6 Astra, read-only, pinned to 401c1a02b. Its verdict: release not recommended, with 1 high, 13 medium and 1 low finding. Every finding is triaged here. The repairs are split by surface into parallel fix tickets, followed by a fresh re-review of the fix diff.

| # | Severity / confidence | Finding | Ruling |
|---|---|---|---|
| R1 | med / high | The record-payment act rounds cents: "Record $3,401" submits 340050. | **FIX** (payments ticket): use a cents-exact, currency-aware formatter on every money string in the sheet. |
| R2 | **high** / high | `nextUnacted` replaces a PO chased today with the next PO, so Today refills or re-ranks without anything being resolved. | **FIX** (Desk ticket): a record acted today keeps its identity and rank, settled in place (U-Q2). The other open records stay reachable from the job. Add a six-line regression test that crosses the cutoff. |
| R3 | med / high | Below 768 px the board Tools sheet looks modal but doesn't isolate focus. | **FIX** (board ticket): use the shared modal/focus seam on narrow widths only. |
| R4 | med / high | The zone drag grip was removed, so a drag can only start in the 8 px gap. | **FIX** (board ticket): an explicit drag target, 24 px on a fine pointer and 44 px on a coarse one (T10), that doesn't steal rename or colour clicks. |
| R5 | med / high | The shared `Dialog` still has `shadow-lg`, which shows on board Export. | **FIX** (board ticket): a designer-side override on the export dialog only. Don't widen into other portals. |
| R6 | med / high | A successful Undo drops focus and announces nothing (Today and the ledger). | **FIX** (Desk ticket): move focus to the restored need's act and give a polite "Undone" status. |
| R7 | med / high | An expired own deferral suppresses today's holder act. | **FIX** (Desk ticket): an expired own row doesn't shadow the holder's fact. |
| R8 | med / high | Inbound lead rows lose the consent, reach and contact-rule lines. | **FIX** (People/Library ticket): reuse the PersonRow safety facts. |
| R9 | med / high | When the payment reads fail, the sheet shows "Reading" forever. | **FIX** (payments ticket): separate pending, error with retry, and missing. |
| R10 | med / high | The payment sheet hardcodes USD. | **FIX** (payments ticket): use the invoice's currency, and the PO's where it exists. |
| R11 | med / high | `library-piece-usage` isn't invalidated after placing a piece. | **FIX** (People/Library ticket). |
| R12 | med / med | Usage reads cap at 1000 rows with no pagination. | **KEEP** as a known scale limit. Leah's studio is orders of magnitude below it. OWED: aggregate server-side when a studio approaches it. |
| R13 | med / high | Long captions outgrow the saved tile geometry in BoardsBlock. | **FIX** (board ticket): consistent minimum caption geometry across edit, present and painter. Never truncate. |
| R14 | med / high | A failed teammate-facts read is invisible: settled work reads as open. | **FIX** (Desk ticket): carry the facts' status into the unread or "not checked" caveat. |
| R15 | low / high | The Rooms index makes one document-state request per job. | **KEEP** for this release (about 16 jobs). OWED: roster-provided titles. |

## Release re-review (SQ-851), round 2

The re-review was GPT-6 Astra, read-only, pinned to 4c5ce7804, and its verdict was NOT CLEAN.
- **Closed:** R1 (USD/EUR/GBP), R2, R4, R5, R7–R11, R14, T4 and T8.
- **KEEP stands:** R12 and R15.

| # | Severity / confidence | Finding | Ruling |
|---|---|---|---|
| R3b | med / high (reproduced in Chromium) | Tools starts focus on a p[tabIndex=-1], so the first Shift+Tab escapes. The background isn't inert, and the Tidy capture listener eats Escape. Shift+T acts behind the sheet. | **FIX** in SQ-853 (shared trap helper, inert, modal-aware shortcuts). |
| R13b | med / high (reproduced) | The caption overflows the saved box and is clipped at the canvas bottom; neighbours can overlap it. | **FIX** in SQ-853: the composition grows to contain captions, plus a caption-aware minimum height if contained; parity holds. |
| R16 | low / high | The closed create picker fetches templates eagerly. | **FIX** in SQ-853. |
| R6b | med / high | When Undo of her own deferral reveals the holder's settlement, there's no focus or announcement, and the pending flag stays armed. | **FIX** in SQ-854. |
| R1b | med / med | For non-two-decimal currencies (JPY), the label rounds while the payload is cents. | **FIX** in SQ-854: the sheet always prints two fraction digits, matching the system's ×100 storage. |

## Local walk (SQ-834)

Pending. It runs once the integration gate frees the shared local runtime.
