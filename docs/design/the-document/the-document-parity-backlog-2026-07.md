# The Parity Backlog — 2026-07-01 (verified)

_The build queue that closes the portal→Document gap, derived from the v2 re-sweep (`portal-vs-desk-feature-gap-matrix-v2.md`, audit head `03537b18` @ 00235) reconciled with the live walk (`the-document-reaudit-walk-2026-07.md`). Every item below is verifier-confirmed at HEAD; P0s are walk-confirmed. Scope ruling (Kody, 2026-07-01): build **P0 + P1**, then execute the R21 dissolve._

**Headline:** 202 zone rows → FULL 66 · PART 50 · XFRM 51 · ABSENT 33 · RETIRED 2 (+33 Document-native). Over PART+ABSENT: **P0 6 · P1 39 · P2 38**. The 2026-06-14 baseline's 86 ABSENT collapsed to 33 — Tracks 4–6, the People Room, the Decision Composer, the Piece, the watch view and the Account sheet did the work the banner claimed, and the verifiers confirmed it row by row (11 over-optimistic claims overturned, all downgrades).

---

## 0 · Funnel repair — walk-found breaks in shipped surfaces (fix FIRST, small, no rulings except F7)

The live walk broke the new lead→proposal funnel three ways. These are bugs in Document-native features (Tracks 4/6), not parity rows — but they block the exact loop the Document exists for.

| # | Fix | Source |
|---|-----|--------|
| 0.1 | **Discovery readiness contract** — persist `project_type` from the Scope block (today the select displays but never writes), align the UI ready-gate with `begin_direction_from_discovery` (00224), and stop counting empty rows as captured essentials. Every new lead currently dead-ends at "Begin the Direction" with "unexpected error occurred". | Walk F2 (P0) + F5 |
| 0.2 | **No-login household send path** — `ClientPicker` silently refuses rows without a Patina account (`client-picker.tsx:209` gates on `linkable`); a captured household (the R46/R62 normal case) can never be linked → discovery-born proposals cannot be sent. Needs a ruling: invite-on-send, or email-send without `client_id`. Same systemic gate blocks decision authoring for profile-less clients (DEC verifier, I37 pattern). | Walk F7 (P0, ruling) |
| 0.3 | **Open-the-project act** — `proposal-watch.tsx:133-145` renders "Signed — the project is open." without checking a project exists and offers no act; the Desk `proposal_signed` need is unfulfillable when auto-activation didn't run. Add the existence check + the R44 two-step act. | Walk F10 (P0) / PRJ-01 |
| 0.4 | Accepted-lead URL: `/doc/{leadId}` → redirect to `/doc/{designerClientId}` (mirror the R6 proposal fallback) instead of "No document answers to this name". | Walk F1 (P1) |
| 0.5 | Discovery money fields: debounced-save truncation (60000→600) + dollar-magnitude written to a cents column → "budget 6–850" renders in Direction. Audit the shared self-save debounce (last-keystroke loss, F4) while in there. | Walk F3 (P1) + F4 |
| 0.6 | "Open the Drafting Room →" work-band button no-ops intermittently (URL nav works). | Walk F6 (P2) |
| 0.7 | Relationship-doc title: coalesce `designer_clients.client_name` before 'New client' in document_state's relationship branch. | Walk F8 (P2) |
| 0.8 | Error grammar: failures surface as red toasts (twice observed), against D2's no-toast law — needs a ruled error surface. | Walk F2b (ruling) |

## 1 · P0 — the two verified clusters

### A. Money completion — the Accounts book learns to write (→ Track 8, rulings R77–R79)
| Row | Gap | Note |
|---|---|---|
| BIL-02 | Record payment | No act anywhere in the Document |
| BIL-03 | Invoice line kinds (milestone/time/FF&E/ad-hoc) | 00204 drafts **header-only invoices with zero line items** |
| BIL-04 | Unbilled-time pull-through | Hours ledger "Export week → Accounts" is a **disabled stub** ("Arrives with the Accounts book (Slice 6)") though the book shipped |
| BIL-05 | FF&E-line invoicing | Old `?ffeItemIds=` prefill + 00187 coverage bridge has no home |
| BIL-09 | Invoice detail & actions | Ledger rows open the document, not an invoice folio; no issue/send/void/print/record acts |
| + P1 riders | BIL-01 print/PDF · BIL-06 resend · BIL-07 void · BIL-08 resolved rates · BIL-10 issue+send depth · BIL-11 project time ledger · BIL-12 time-entry delete · BIL-15 currency/tax | Same surfaces, same package |

### B. Vendor creation (→ Track 9, rulings R80–R81)
| Row | Gap | Note |
|---|---|---|
| PRC-03 | Add a vendor | **No create-vendor door anywhere in the Document** while the FF&E line-unfold blocks ordering without a vendor — the one P0 outside money |
| + P1 riders | PRC-01 directory search/filter/save · PRC-02 vendor detail (products/reviews/quote request) · PRC-04 saved vendors | People Room maker shelf vs Orders-book Vendors page split needs the R80 ruling |

## 2 · P1 — grouped into build tracks (39 rows)

**Track 7 — Project lifecycle & the Amendment (rulings R73–R76):** PRJ-01 create/open project (incl. 0.3's act; standalone no-proposal projects), PRJ-02 edit vitals/phase estimates, PRJ-03 complete/closure checklist, PRJ-04/05/06 scope-change list/create/review-apply-send, PRJ-07 project list depth, PRJ-09 FF&E pipeline overview strip, PRJ-14 time ledger depth (history + unbilled + bill-it handoff; pairs with BIL-04/11). Rider: DEC-11 expired-decision reopen (Extend should recover expired→pending).

**Track 8 — Money completion:** the BIL rows above.

**Track 9 — Makers/vendors:** PRC-01/02/03/04 above.

**Track 11-M — procurement mechanical ports (existing rulings):** PRC-07 log-acknowledgment, PRC-11 damage-claim creation/notify lifecycle, PRC-12 ETA quick-edit, PRC-24 multi-line Order Assistant grain (today line-unfold only mounts single-item), PRC-27 mark-sent mode for phone-ordered POs, PRC-06 by-status project+payment facets, PRC-09 order-all workflow, PRC-10 receiving KPIs depth.

**Track 11-R — ruled long tail:** LIB-01 bulk XLSX/CSV import (R83 candidate), LIB-10 teaching validation queue (R84), LIB-12 field-level product search, LIB-15 ambient help layer (+ RMS-11 help center destiny), PRO-02 mood-board/palette depth, PRO-03 space-plan upload (Folio on proposal docs), PRO-07 terms/signature block, CRM-01 client-directory depth (add-client for profile-less: ties to 0.2), CRM-15 template creation depth, RMS-02 3D scan viewer doorway (R86 candidate).

**Track 10 — the Post:** the drawer bell still exits to `/portal/inbox` (walk-proven; R72 logged it provisional). Not a parity row (margins are the sanctioned notification model) but **dissolve-blocking**: the old Inbox cannot retire until the bell has a Document home (R82 candidate).

## 3 · P2 — 38 rows, defer or fold opportunistically

Mostly presentation/analytics depth on live surfaces (ledger filters BIL-13, decision delete DEC-03, collections cluster LIB-05..08, categories LIB-04, catalog matching tab LIB-13, teaching notes LIB-17, quick-tags multi-select LIB-27, notification-settings depth RMS-07, sessions RMS-09, digest/unsubscribe RMS-10, bulk archive PRJ-12, lead-history CRM-20, etc.). Full list in the v2 matrix roadmap. None block the dissolve; several ride along with their track's surface anyway.

## 4 · Deliberate exiles & retired (no build)

Insights dashboard → ledger front-matter (R21/ruled) · companion thread → stateless ⌘K Ask-the-Engine (I30) · dashboard metrics → the Desk has no numbers (D-series) · RETIRED ×2 (pure-redirect stubs). PRC-20 "Order via Patina" stays ABSENT-by-intent (R30 rules the future rail, unbuilt — the old CTA was a disabled stub too).

## 5 · Sequencing

Per the approved program plan: **0 · Funnel repair** ships first (small, mostly ruling-free). Then ruling round R73+ (needs-ruling ledger: `the-document-needs-ruling-2026-07.md`, 45 rows + F7/F2b) → track packages → Wave 1 (T7 · T8 · T9 · T11-M parallel worktrees) → Wave 2 (T10 the Post · T11-R) → Checkpoint B → the R21 dissolve. Prod catch-up (00230–00235 + proposal-nudge fn) precedes any track's prod deploy — blocked on LAN access as of 2026-07-01.
