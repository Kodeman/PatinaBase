# DECISIONS.md — The Document workstream

> Append-only shared log between the implementation side and the design session.
> Never edit past entries; corrections get a new dated entry referencing the old one.

---

## Locked decisions (seeded from spec §2, v1.0 April 2026)

| ID | Decision |
|----|----------|
| D1 | Strict one document at a time. No split view, no peek/hold. Esc or "Put down" is the only exit; switching costs one trip through the Desk or a ⌘K jump. |
| D2 | Interruptions are designer-driven, never system-dictated. Nothing breaks through by default; per-designer break-through rules, shipping with zero enabled. |
| D3 | Mobile pattern: margin items collapse to anchored chips; spine becomes a bottom sheet. Dedicated mobile milestone gates the default flip (D7). |
| D4 | No shadows. Anywhere. No exceptions. Value contrast + flat stacked edges + folder tab; mechanically enforced via lint, CI-blocking. |
| D5 | The Weekly Pulse lives in the margin (kind `pulse`, anchored to the Project section). Friday unsent Pulses rise on the Desk. |
| D6 | Documents visible to all studio members; no exclusive holds. Soft presence line in the spine; per-member "needs *your* hand". |
| D7 | Ship alongside, phase in. Parallel flagged route against real data; zones dissolve only after validation + mobile pattern. |
| D8 | Studio Drawer persistent on every screen; ledgers open as overlay sheets; collapsed by default, no badges, no pulsing counts. |
| D9 | Time: capture in the document (spine timer), review in the drawer (Hours ledger). |
| D10 | Suggestive, adjustable capture. Timer counts, designer adjusts up or down, nothing auto-trims. <60s discards silently. Idle detection only annotates. |
| D11 | Timer auto-starts on pick up — provisional, pending Leah's gut-check; fall back to one-tap start if it feels surveilling. |

---

## Open — needs design ruling

### O1 · Document identity vs codebase lifecycle split — 2026-06-11

**Conflict:** Spec §1 says one document per *client relationship*; spec §3 routes `/doc/[projectId]`. Codebase: the lifecycle is split across `designer_clients` (lead→proposal→active→completed→nurture), `proposals` (own status chain, version supersede), and `projects` — and a project row **only exists after signing** (`activate_proposal_as_project`). A client may have several projects; projects can also be created manually with no proposal lineage.
**Proposed resolution (CODEBASE-MAP §4):** document = project when one exists; pre-signing, document = live proposal chain (or lead). Desk unions the three shapes. A client with two projects shows two folders. Manual projects render Brief→Proposal as ghost sections. Also: no "direction shared" marker exists — Direction is proposed as "latest proposal in draft".
**Blocks:** Slice 1.

### O2 · Stamp vocabulary divergence — 2026-06-11

**Conflict:** Spec §6 stamps `to_order → ordered → in_production → shipped → received → installed` (+ `decision_due/extended`, `damaged/returned`). Codebase FF&E machine (00184, DB-enforced ratchet): `specified → quoted → approved → ordered → production → shipped → delivered → installed`, plus `blocked`/`blocked_by_decision_id`, inspection outcomes (clean/damaged/partial), damage-claim states. Specifics: `to_order` collapses three designer-meaningful pre-order states; spec `received` = codebase `delivered`; `extended` and `returned` have no data behind them.
**Proposed resolution (CODEBASE-MAP §5):** stamps render the codebase machine 1:1 where it's richer (sub-state as the stamp's second line), `received` derives from `delivered`, drop `extended`/`returned` from v1.
**Blocks:** Slice 1 (need-line stamps), Slice 2.

### O3 · Time system collision — 2026-06-11

**Conflict:** Spec §9 designs a fresh `time_entries` table (seconds, activity vocabulary Design/Sourcing/Client/Site visit/Admin, `raw_seconds`, `idle_seconds`, `source`). The codebase **already shipped** `project_time_entries` (00177) with UI (header TimerButton, stop dialog, ⌘K commands): minutes granularity with **min-1-minute round-up** (spec: sub-60s silent discard), phase/task attribution (no activity vocab), invoice claim/release + guard triggers, one-running-timer-per-user. D11 auto-start also inverts the current manual-start UX.
**Proposed resolution:** extend `project_time_entries` additively (new columns per spec needs); never fork a second table. Needs rulings on: seconds vs minutes; discard vs round-up; activity vocabulary vs/alongside phase attribution; how the existing header timer coexists with the spine timer during phase-in.
**Blocks:** Slice 5 (and the drawer "In hand today" readout).

### O4 · D4 scope vs D7 — 2026-06-11

**Conflict:** D4 demands a CI-blocking shadow ban "in this app" from PR 1. The app currently has 111 `shadow-*` usages in old zones that D7 forbids touching, and `@patina/design-system` primitives (Dialog/Popover/Command) ship shadows into anything that mounts them.
**Proposed resolution:** PR 1 adds the CI-blocking lint scoped to Document surfaces (`/desk`, `/doc`, document/drawer/ledger components) + `shadow-none` overrides wherever design-system primitives are reused inside those surfaces; widen the ban app-wide at the dissolve step.
**Blocks:** Slice 1 PR.

### O6 · R10–R12 referenced but absent from this log — 2026-06-12

**Gap:** Session 02 prep cited "R10–R15 appended," and R14 references R12's
"needs-action ordering," but only R13–R15 are present in this file — the
R10–R12 text appears to have been truncated in the paste. Blocked on the
missing text: the I6 Desk-heuristics constants retune (R10's calibrated
values exist nowhere in the repo) and dued-note ordering (R12). Slice 4
proceeds on the fully-specified scope (unfolds, Orders ledger, per-item
DAMAGED, R14 Note, R15 fill-state); notes with due dates provisionally rank
with due decisions pending R12.
**Blocks:** I6 retune; final dued-note ordering.

### O5 · Portal surfaces with no Document-model home — 2026-06-11

**Conflict:** The portal has grown past the five zones the design sessions mapped (spec §3). Unmapped: **Aesthete** (Teaching + Aesthete Engine), Insights, Portfolio, Resources, Team, Reviews, Nurture queue, rooms directory, and the vendor directory (People vs Orders ledger?).
**Proposed resolution:** none yet — these stay untouched through the phase-in (D7), but each needs a destiny (ledger, document section, margin, or deliberate exile) before the default flip.
**Blocks:** Slice 6 / default flip only.

---

## Implementation decisions (code-level; designers wouldn't notice)

### I1 · Feature flag mechanism — 2026-06-11

PostHog flag `the-document-pilot` via the existing `useFeatureFlag` hook (fail-closed, same as `procurement-workspace-pilot`), with the existing `NEXT_PUBLIC_FLAG_OVERRIDES` env override serving as the spec's env override. No per-designer DB flag store exists; if per-designer targeting is needed later, PostHog targeting by email covers it without schema work.

### I2 · Brand token source — 2026-06-11

Document surfaces use the CSS vars in `apps/designer-portal/src/app/globals.css` (`--color-clay` etc. — exact spec hexes), not `@patina/design-system/tokens/colors.ts` (different OKLCH values). Fonts already loaded. "Strata Mark" has no existing asset — it will be a new primitive; final name TBD given the repo brand is Patina.

### I3 · Repo-reality corrections to workstream docs — 2026-06-11

The spec/CLAUDE.md reference a "strata monorepo", `@strata/*` packages, and React 18. Reality: patina-merged, `@patina/*`, React 19, Next.js 15. The workstream CLAUDE.md was placed at `apps/designer-portal/CLAUDE.md` with a dated correction note. Also: only prototype v0.3 (`patina-the-document-prototype-v3.html`) exists in `docs/design/the-document/` (no `prototypes/` subdir, no v0.1/v0.2, no concept deck) — references resolved to the file that exists.


## Rulings — design session, 2026-06-11
 
### R1 · Ruling on O1 — Document identity — 2026-06-11
 
A document = one **engagement**: the project once one exists (`/doc/[projectId]`);
pre-signing, the live proposal chain (keyed by chain root); pre-proposal, the
lead/designer_client. The Desk unions all three shapes. A client with N projects
gets N folders (tab = surname, title distinguishes); the client-level view is the
People ledger — the ledger rule applied to relationships. Direction derives from
latest-proposal-in-draft (accepted as approximate; the settled state means
"direction work concluded," not "client reacted" — upgrade the derivation when a
direction-share feature ships). Manual projects ghost Brief→Proposal and open at
Project. Edge cases blessed as audited: `on_hold` = paused in-motion chip, never
"needs your hand"; `archived` = ⌘K/People only; declined/expired proposals hold
at Proposal-active with the state in the need line. Spec §1/§3/§4 updated to
engagement language in v1.1.
 
### R2 · Ruling on O2 — Stamp vocabulary — 2026-06-11
 
Stamps render the codebase FF&E machine 1:1: SPECIFIED / QUOTED / APPROVED /
ORDERED / PRODUCTION / SHIPPED / DELIVERED / INSTALLED, with
`src/components/portal/ffe/stages.ts` STAGE_CONFIG as the canonical label/color
source. RECEIVED is a derived ninth state: `status='delivered'` + clean
receiving inspection logged — "delivered, awaiting inspection" is therefore a
visible studio to-do and a valid need-line input. DAMAGED derives from
inspection outcome / open damage claim, with claim state in the unfold.
DECISION DUE derives from `blocked_by_decision_id` → pending blocking decision
and always displays the *current* due date; extensions are narrated by the
decision margin item, never a stamp. EXTENDED and RETURNED are dropped from v1
(no data). Spec §6 vocabulary superseded.
 
### R3 · Ruling on O4 — Shadow ban scope & defense — 2026-06-11
 
CI-blocking lint scoped to Document directories (/desk, /doc, document/drawer/
ledger component dirs) from the Slice 1 PR; widened app-wide at the dissolve
step. Defense is two ESLint rules (flat config): (1) `no-restricted-syntax`
catching `shadow-*` class strings and `box-shadow`/`drop-shadow` CSS within
Document dirs; (2) `no-restricted-imports` banning direct design-system overlay
primitives (Dialog/Popover/Command/Sheet/Tooltip) in Document dirs — overlays
enter only through Document-local `Doc*` wrappers that bake in `shadow-none`
plus the paper treatment (ink border, flat edges, spec §10 recipes). Wrappers
are portal-local first, promoted per the catalog-ui precedent when the client
portal mirrors need them. Old zones untouched until dissolve (D7 upheld).
 
### R4 · Ruling on O3 — Time system unification — 2026-06-11
 
Extend `project_time_entries` additively; never fork. `duration_minutes`
remains canonical (invoice guard triggers, `project_unbilled_time` view, and
shipped data untouched); add `raw_seconds` (pre-adjustment elapsed, audit
trail), `idle_seconds` (annotation only — never subtracted, per D10), `source`
('timer_auto' | 'timer_manual' | 'manual_entry'), and `activity`. Attribution
is two-dimensional: `phase_key` auto-fills from the document's current phase at
log time (the spine knows where the pen is — the designer is never asked), and
the picker asks only `activity` (Design / Sourcing / Client / Site visit /
Admin in v1); `task_id` stays optional. The sub-60s rule follows start mode:
`timer_auto` discards silently, `timer_manual` keeps the shipped
round-up-to-1-minute. Picking up a document chains out ANY running timer
(header-started included) through the log-offer strip — one mechanic
everywhere. The header TimerButton continues unchanged in old zones through the
phase-in and dissolves with them. Granularity ruled at implementation level
(designer-invisible): minutes canonical + raw_seconds additive. D10/D11
otherwise stand; D11 auto-start remains provisional pending Leah's first
session.
 
### R5 · Ruling on O5 — Destinies for unmapped surfaces — 2026-06-11
 
Four destinies exist: document section / ledger / margin / quiet exile
(⌘K-reachable, no nav presence). Assignments:
- **Reviews** → Care section + margin item on arrival; aggregate column in People.
- **Nurture** → dissolves: due follow-ups rise on the Desk as need lines; the
  cadence lives in Care; the queue becomes a People filter.
- **Rooms directory** → dissolves into documents (project_rooms / proposal scope).
- **Portfolio** → quiet exile; sources Install/Care photos; ⌘K-reachable.
- **Resources** → quiet exile behind the help affordance.
- **Team** → settings region; D6 presence covers in-document visibility.
- **Inbox** → retire after Slice-6 verification that margins + Desk cover all
  unique functions.
- **Aesthete** folds, not shelves: teaching becomes a mode of the Library
  ledger (classification lives with products); Engine stats and teaching
  royalties move into Accounts — the 25% Pledge rendered as a line in the
  studio's own account book.
- **Insights** distributes as each ledger's front-matter summary page
  (Accounts: revenue/AR · People: pipeline conversion · Orders: procurement
  throughput · Hours: utilization). No dashboard book.
- **Vendors** → Orders ledger directory pane; People stays clients-only.

---

## Implementation decisions — Slice 1 (2026-06-11)

### I4 · Desk reads engagements from a `document_state` view — 2026-06-11

Migration 00188 creates a SECURITY INVOKER view unioning the R1 shapes
(project / live proposal chain / open lead / pre-proposal relationship) with
derived `active_section` (§4) and need-input counts (§7), so Desk, the Slice 2
spine, and ⌘K share one source (§11.6). Slice 1 renders pre-signing
engagements as Desk folders only — no `/doc` route exists yet; the route
scheme for proposal-chain/lead documents (spec §3 permits a canonicalizing
resolver) will be decided and logged in Slice 2.

### I5 · DocSheet built without design-system overlay primitives — 2026-06-11

The first `Doc*` wrapper implements its own minimal dialog semantics (Esc,
backdrop dismiss, focus in/restore) rather than wrapping a shadowed
design-system primitive. The R3 `no-restricted-imports` ban is in place for
Document dirs; when a future wrapper genuinely needs a primitive, that file
gets an explicit exemption in `eslint.config.mjs` (documented inline there).

### I6 · Desk heuristics v1 — 2026-06-11

Hesitating proposal = sent >3 days unopened, or opened >5 days unsigned.
Lead urgency = response deadline inside 48h (or passed). Motion chips capped
at 6. All thresholds are constants in `desk-derivation.ts` — tune with Leah
during phase-in step 2.

### I7 · Signed-awaiting-activation proposals surface on the Desk — 2026-06-11

An `accepted` proposal with no project row (signed, `activate_proposal_as_project`
not yet run) was invisible in the original union — the Desk would silently
omit the signing moment. Now surfaces as a needs-your-hand folder: need line
"Signed — open the project", SIGNED stamp (sage), ranked directly under
overdue decisions. §4 doesn't enumerate this sub-state; flagged for design
review in the Slice 1 PR since the need line is designer-visible.

### D12 · Full-bleed document — 2026-06-11

A document in hand fills the entire viewport. No charcoal surround, no page
border or radius, no stacked edge — those are Desk-state devices, for objects
ON the desk; in hand, the paper IS the screen (D1 expressed spatially). The
Studio Drawer is the only persistent layer above the paper — the desk edge
still showing beneath the work. Ledger sheets, the log strip, Doc* popovers,
and ⌘K are the only other overlays; nothing else coexists with an open
document. The spine and margin become sticky full-height rails (Put down,
timer, presence, and margin items always reachable); main content scrolls
between them, padded clear of the drawer. Pick up = raise-to-fill scale
(~270ms; reduced-motion: crossfade); put down recedes to the Desk. The Desk
itself is unchanged. Prototype v0.4 is the canonical reference; spec §3/§10
amended at next revision. Mobile interim: spine = sticky horizontal paper
strip at top, margin flows after main — the dedicated D3 pattern still gates
the flip.

---

## Implementation decisions — Slice 2 (2026-06-11)

### I8 · Document route: one `/doc/[id]` + canonicalizing resolver — 2026-06-11

All three engagement shapes share a single route. The id accepts ANY of the
engagement's keys — engagement_id (canonical: project id / proposal-chain
root / lead id / relationship id), or the live proposal id — resolved by one
`document_state` lookup (`.or()` across the key columns); the URL is not
rewritten. Per spec §3's "canonicalizing resolver is acceptable." Limit: an
ACTIVATED proposal's id no longer resolves (shape B excludes proposals with
a project row) — those engagements are addressed by project id, which is how
the Desk and ⌘K link them anyway.

### I9 · DAMAGED stamp attribution is PO-level — 2026-06-11

`receiving_inspections` / `damage_claims` hang off `purchase_orders` (00150)
with no FF&E-item FK, so every line on a PO with an open claim (drafted /
vendor_notified) stamps DAMAGED until the claim resolves. Per-item
attribution would need additive schema; deferred until the Slice 4 unfold
shows claim detail. Designer-visible over-attribution on multi-item POs —
flagged for design review.

### I10 · Slice 2 presentation seams — 2026-06-11

Sequencing artifacts a designer will notice, all per the §13 build order,
flagged for review in the slice PR: the margin rail ships present but empty
(fills in Slice 3); the spine ships without the timer box (Slice 5); only
the Proposal settled bar unfolds (Brief/Discovery/Direction bars are inert
until their unfolds are designed); Discovery and Care active bodies are one
quiet line each (Care grows its Guide/reviews/cadence at R5 in Slice 6).
Spine sub-labels only claim dates the data actually carries.

## Rulings — design session, 2026-06-11 (Slice 2 review)

### R6 · Ruling on I8 — Resolver redirects activated proposal ids — 2026-06-11

I8 blessed with one amendment: the stated limit (an activated proposal's id no
longer resolves) is a dead link across the signing moment — the document grew,
the URL must agree. The resolver catches ids of proposals that have a project
row and redirects to `/doc/[projectId]` (one extra lookup on the miss path;
`router.replace`, no history pollution). Bookmarked or shared pre-signing
links survive activation. No URL rewriting otherwise; I8 stands as logged.

### R7 · Ruling on I9 — DAMAGED stamp deferred to per-item attribution — 2026-06-11

The over-attributing stamp does not ship. Stamps are the document's truth
device (R2: pure renderings of real state); PO-level claim data stamping every
line on a multi-item PO lies at the item grain and teaches the designer to
discount stamps. Until per-item attribution exists, claims surface where they
are true: the line unfold's PO detail, the Orders ledger, and a Desk need line
("PO-0214 has an open damage claim"). In Slice 4, add the additive
`ffe_item_id` FK to damage_claims/receiving_inspections and ship DAMAGED as a
truthful per-item stamp. Spec §6 DAMAGED row amended accordingly at next
revision.

### R8 · Ruling on I10 — Slice 2 seams — 2026-06-11

Margin rail ships present with one quiet placeholder line in muted italic
("The margin — decisions, messages, and money gather here") — honest
scaffolding that keeps the D12 full-bleed geometry stable when Slice 3 fills
it. Inert settled bars (Brief/Discovery/Direction pre-unfold) must NOT render
the "unfold ↓" hint — affordances that do nothing teach the document to lie;
hint copy appears only when a bar's unfold ships. Spine sub-labels claiming
only real dates: blessed as logged. Timer box absent until Slice 5: blessed.

### R9 · Pilot checkpoint — Leah's first structured session — 2026-06-11

Informal peeks anytime; the first structured first-Tuesday session happens
after Slice 3, when the margin loop (decision → stamp + margin + Desk in one
act) works against Middlewest's real data. Rationale: first impressions don't
repeat, and the margin is the concept's heart — a shell with a placeholder
margin risks anchoring on "pretty but hollow." The D11 auto-start gut-check
and idle-threshold calibration still occur at Slice 5.

---

## Implementation decisions — Slice 2 amendments (2026-06-11)

### I11 · R6–R8 implementation notes — 2026-06-11

R6: implemented as one extra `proposals.project_id` lookup on the resolver's
miss path; `router.replace`, loading state holds until the redirect lands.
R7: migration 00189 appends `open_claim_count` / `open_claim_po`
(vendor_po_number, falling back to sidemark) to `document_state`; the line
stamp and its PO→inspections→claims select are removed. The Desk need line
reads "AP-012 has an open damage claim" (pluralizes without a PO identifier)
and ranks below overdue decisions and the signing moment, above everything
else. Its stamp label is **CLAIM OPEN** — not DAMAGED, which R7 reserves for
the truthful per-item stamp in Slice 4 — designer-visible word choice,
flagged for review. R8: placeholder line rendered verbatim in muted italic;
inert settled bars were already affordance-free (hint shows only the settled
date; "unfold ↓" appears solely on bars whose unfold exists).

---

## Implementation decisions — Slice 3 (2026-06-11)

### I12 · Pulse v1 mechanics — 2026-06-11

The Friday draft job is pure SQL (pg_cron, Fridays 13:00 UTC): one draft
`weekly_pulses` row per active project per ISO week — no edge function, no
email. The client mirror is the project comms thread: `send_weekly_pulse`
(00192) flips the pulse and posts the message in ONE transaction, so the
client sees it in their portal Messages and the existing comms notification
machinery fires. An email leg (Resend) can ride later without schema change
— **flagged for design**: is in-portal + comms-notification enough for v1?
The default draft body composes from the week's REAL movement (FF&E stamp
changes this week + decisions settled/pending), editable before send.

### I13 · Margin mechanics — 2026-06-11

The `margin_items` view (00191) is an INDEX (kind, anchor, state, thin
payload); expanding an item fetches content through the existing domain
hooks. Message `unread` derives from the caller's `last_read_at`; opening
the item marks the thread read. Time rows are read-only daily summaries
until Slice 5. Decision resolution from the margin uses the shipped
override-with-consent path (`useApplyDecisionOverride` → `apply_decision`)
— the designer records the client's pick with method + evidence, audit row
included; UI wording "Record the pick" — **flagged for design review**.
Decision due-date extension is a plain `due_date` patch; the margin item
narrates it (R2: the stamp shows only the current date). Invoice send =
`issue_invoice` RPC + the existing `invoice-send` edge function.

### R13 · Pulse email leg — v1 as built; email gates the flip — 2026-06-12
Slice 3's Pulse ships as logged (portal message + existing comms
notification): for the pilot, Leah's clients get a Friday inbox touch via the
comms-notification email, which is acceptable scaffolding. The full-body
Friday email (Resend leg, using the already-designed Pulse template from the
journey email set) is added to the DEFAULT-FLIP GATES — the Pulse's product
truth is reassurance arriving where the client lives, and that is the inbox.
No schema change required per I12. Flip gates now: D3/D13 mobile validation ·
Pulse email leg · idle annotation (D10) · R5 destinies staged.

### R14 · The Note — sixth margin kind — 2026-06-12
Ratifying Leah's Session 01 finding: designer-authored marginalia, the most
literal margin item of all. Spec: kind `note`, Mocha-adjacent accent (distinct
from time; suggest Aged Oak), authored by any studio member, anchored like all
margin items (line / section / letterhead; default letterhead). CAPTURE MUST
BE ≤5 SECONDS — one tap from the margin rail header ("+ Note") on desktop and
from the spine sheet's margin section on mobile; from a line unfold, the note
pre-anchors to that line. Optional due date; a dued note joins needs-action
ordering (R12), otherwise notes sit in anchor order. ESCALATION is what makes
it structural: a note converts in place to (a) a client decision via the
shipped decisions machinery, or (b) a Scope Change Authorization when the
call was a change request — if no SCA artifact exists in the codebase yet,
Claude Code stubs the action and flags it (audit-first; do not invent the
artifact). Notes are studio-visible (D6), never client-visible — the margin's
private layer. Sequencing: rides Slice 4 as an add-on while the margin
machinery is fresh; storage is additive (margin_notes or equivalent — naming
to repo conventions).

### R15 · Strata Mark fill-state + the breath — 2026-06-12
Ratifying Leah's Question 9, moderated. The mark becomes a progress device:
its three lines render as fill-state mapped to the engagement's three
movements — line 1 fills through SHAPING (Brief→Direction), line 2 at
COMMITMENT (proposal signed), line 3 through DELIVERY (Install→Care).
Unfilled lines render at the ghost opacity already in the recipe. Surfaces:
folder tabs' mark, the letterhead mark, ⌘K result rows — anywhere the mark
stands for a document. Spine section markers keep their per-section state
colors (settled/active/ghost) — they answer "which section," the fill-state
answers "how far." MOTION: exactly one — a slow breath (~3s ease, subtle
opacity swell) on the ACTIVE spine marker only, where "alive" is literally
true; `prefers-reduced-motion` disables it; nothing on the Desk ever moves.
"Pulsing" beyond this is declined — ambient motion is what the no-badge
discipline exists to prevent. Sequencing: fill-state is static rendering and
ships with Slice 4 (Leah gets her brand moment next session); the breath
joins the Slice 6 motion pass.

---

## Implementation decisions — Slice 4 (2026-06-12)

### I14 · Slice 4 implementation notes — 2026-06-12

Per-item DAMAGED (R7 follow-through): `damage_claims.ffe_item_id` (00193);
the inspection flow drafts ONE claim PER attributed item when the designer
picks pieces in LogInspectionDrawer (additive prop — old-zone callers
unchanged); unattributed claims stay PO-grain and never stamp a line. Note
(R14): `margin_notes` table; capture is one tap from the rail header or a
line unfold (pre-anchored); escalation paths are BOTH real — a draft
client_decision, or a draft scope_change_request (audit found the artifact
R14 thought might be missing: `scope_change_requests` + create/send/approve
flows, 00066/00084/00114) — no stub needed. RLS is author-scoped (the 00150
single-lead-designer limitation; widen with studio membership). Dued-note
ordering is PROVISIONAL (groups with overdue decisions) pending the missing
R12 (O6). Orders ledger batch action: "same truck" — a shared confirmed_eta
across selected same-vendor POs via repeated `log_po_acknowledgment`
(coalesce semantics; vendor_po_number untouched) — wording + semantics
flagged for design review. R15 fill-state fractions: settled sections count
1, the active section ½, per movement group; the Desk folder-tab mark uses a
lineage-blind approximation (manual projects overstate SHAPING there) —
flagged. The breath waits for the Slice 6 motion pass per R15.

---

## Rulings ratified via spec v1.2 — 2026-06-12

### R10–R12 confirmed — resolves O6 — 2026-06-12

Spec v1.2 (supersedes v1.1; §-numbering unchanged) landed in-repo with the §2
one-line ruling table and the R10 constants in §7; R12's full text is now in
the design-session log. O6 is RESOLVED: R10 = I6 retune to Leah's numbers
(hesitating = sent **1 day** unopened OR opened **2 days** unsigned · lead
urgency = deadline inside **24h**; precision watch at Session 02; per-studio
settings when studio #2 onboards) · R11 = CLAIM OPEN blessed + the
decision-override action personalized ("Record Sarah's pick") · R12 = margin
ordering under load (needs-action floats, urgency-ranked like the Desk →
anchor order → resolved items fold into a collapsed "Settled · N" group; the
fold label is the only number anywhere in the margin). R10/R11 full session
text remains absent from this log — spec v1.2 §2/§7 taken as authoritative.

### I15 · R10/R11/R12 landed — Slice 4 amendments — 2026-06-12

R10: `desk-derivation.ts` constants retuned 3d/5d/48h → **1d/2d/24h**, with
≥ boundary semantics ("sent 1 day unopened" rises ON day one); landed
immediately per §13, not gated on the slice. R11: the override button
personalizes from `document_state.client_name` first name; falls back to
"Record the pick" when no name. R12 mechanics (implementation-level):
needs-action = overdue decisions (0) → dued notes (1) → the week's unsent
pulse (2 — Friday-gated like the Desk, per D5), ordered most-overdue-first;
anchor order = letterhead band → section band → line band, lines ranked by
the document's rendered FF&E order (the rail supplies the rank map; unknown
anchors sink within their band); within one anchor, newest first; "Settled ·
N" is collapsed by default, newest-first when expanded. ⌘K fill-state rows
(R15) ride the Slice 6 ⌘K extension per §13. Ops notes: a `supabase db
reset` from main wiped the transient demo engagements + unmerged document
migrations locally — rebuilt via the new idempotent
`scripts/the-document-local-seed.sql` (resolves the Whitfield id through the
R6 redirect; activation ids are random — supersedes the slice-3 seed's
pinned ids). Migration-number collision: main now carries
`00188_po_send_columns` (procurement); this stack's 00188–00194 renumber to
00189–00195 at rebase.

---

## Implementation decisions — Slice 5 (2026-06-12)

### I16 · Slice 5 implementation notes — 2026-06-12

Time (R4): migration 00195 extends `project_time_entries` additively —
`raw_seconds` / `idle_seconds` / `source` (default `'timer_manual'`, so the
header TimerButton keeps writing honestly with ZERO old-zone edits) /
`activity`. One `DocumentTimeProvider` above the Desk and every document
owns the mechanics; hold/release/chain-out operations run through a
serialized promise queue (an unmounting document and a mounting one must
never race over the single running-row). Close-out WRITES the entry first,
then offers adjustment in the strip — a dismissed strip still leaves the
truth logged; Discard deletes. The chained-out row's phase auto-fills from
its own project's `current_phase` when the row carries none (header starts).
Pause logs the segment quietly (no strip; adjust later in Hours) — the
schema has no paused state, so pause = close-out + local resume latch.
Designer-noticeable defaults flagged for the session: the strip's activity
select defaults to Design (prototype parity); the spine "+ Log" form
likewise. Timer attaches to PROJECT documents only in v1
(`project_time_entries` FK — proposal/lead documents carry no spine timer).
The spine timer is hidden in the <980px interim pattern; the D13 bar timer
glance arrives with the Slice 6 mobile build (the timer/strip components
take state via the provider, unforked per surface, per §13). Hours ledger:
this week, day-grouped, inline activity/duration edits disabled once an
invoice claims the entry (00177 guard); "Export week → Accounts" is a
disabled stub until the Accounts book exists (Slice 6). The "in hand today"
readout sums the designer's own day (completed + live elapsed) — it is a
readout, not a badge (D8 discipline upheld). Esc priority per §3: the strip
listens on capture (Esc = discard) ahead of sheets and put-down.

---

## Rebase + procurement integration (2026-06-12, post-Slice-5)

### I17 · Stack rebased onto procurement Waves 4–5 — 2026-06-12

The five-slice stack (PRs #3–#7) was rebased onto main `d249b49a`
(po-send, PO numbering, procurement crons, expediting, partial receiving).
Conflicts in exactly two files, both resolved as compositions: the
receiving-inspection hook carries BOTH per-item received quantities
(their W5-T2 `items[]`) and per-item claim attribution (our
`damagedFfeItemIds`); the inspection drawer keeps their self-fetched
"Items received" counts section and our "Which pieces?" claims picker —
now fed by the drawer's own PO-item query (the document's `ffeItems` prop
was retired as redundant). The Order Assistant v2 step architecture kept
the v1 core mount props — the line-unfold mount carries over unchanged
(verified live from the unfold, step 1-of-3 rendering over the paper).
Migrations renumbered at the stack tip: 00188–00195 → **00191–00198**
(earlier slice trees keep old prefixes; lexical apply order stays correct).
All 13 scripted acceptance assertions re-run green; 367/367 jest.
⚠ Surfaced pre-existing gap: `activate_proposal_as_project` copies
`vendor_name` but DROPS `vendor_id` on FF&E lines — the Order Assistant
can't mount on activated un-ordered lines anywhere in the portal. Local
seed backfills; the real fix belongs on main's activation lineage.

### O7 · Weaving the PO send/expedite lifecycle into the Document — 2026-06-12

**Context:** procurement now carries a full send lifecycle (po_number →
PDF → vendor email → sent_at → acknowledgment → expediting flags →
partial receiving) plus time-driven events (payment-due flips,
delivery-week notifications). The document currently renders the PO cell
(number/placed/ack), Movement, and Receiving — but the SEND act and the
expediting signals have no document-model home.
**Proposed resolution (CODEBASE-MAP §11):**
1. **Unfold** — the Purchase order cell narrates the send lifecycle
   ("PO-00012 · sent to vendor Jun 12 · acknowledged"); a **Send to
   vendor** action (po-send: PDF + email) joins the action row for
   drafted POs; expediting flags surface as quiet Movement sub-lines
   (never badges).
2. **Orders ledger** — adopts `po-send-actions` as row actions
   (send / resend / PDF preview); the unscheduled-shipment condition
   renders as a row mark, not a banner.
3. **Desk need lines** — candidates: "PO drafted — not yet sent" and
   "sent — unacknowledged N days" (thresholds need Leah's numbers, R10
   style); the 00189 payment-due flips arrive as Money margin items via
   the existing invoice/auto-draft narration.
4. **Spec §6** gains the PARTIAL receiving state (already truthful in the
   unfold's "N of M inspected" cell).
**Sequencing proposal:** rides Slice 6 as "Orders ledger v2 + the send
weave" (alongside ⌘K and front-matter), unless the session prefers a
dedicated slice before the mobile build. Designer-visible calls needed:
send-action placement (unfold vs ledger vs both), need-line thresholds,
and whether vendor email send requires a confirm step inside the paper.
**Blocks:** nothing current — Slice 6 scoping only.

### R18 · Ruling on O7 — the send weave — 2026-06-12

**Sequencing:** a dedicated **Slice 5.5 — "Orders ledger v2 + the send
weave"** lands after Session 02 and before Slice 6, keeping the flip's
critical path (mobile build + gates) unburdened, and sequencing the weave's
thresholds behind Leah's numbers. **Placement: both homes**, per the ledger
rule — sending one PO while working its line is engagement work (the unfold's
action row, drafted POs only); sending/resending across vendors and projects
is cross-engagement work (Orders ledger row actions: send / resend / PDF
preview). Same act, two honest homes. **Confirm: the PDF preview IS the
confirm** — review-then-send per the R11 invoice precedent. The PO renders as
paper over the document ("This is what Sawkille receives"), one action: Send
to vendor. No "are you sure" dialogs; the confirm step is the document
showing you the document. **Need lines:** "PO drafted — not yet sent" after
**2 days** · "sent — unacknowledged" after **3 days** — both PROVISIONAL,
Leah's numbers captured at Session 02 (R10 contract). **The rest as
proposed:** payment-due flips arrive as Money margin items through existing
narration; expediting flags render as quiet Movement sub-lines, never badges;
unscheduled-shipment is a row mark, not a banner; spec §6 gains the PARTIAL
receiving state. O7 RESOLVED.

### R16 · Slice 4/5 blessings + refinements — 2026-06-12

*Provenance: ratified via spec v1.3 §2 (the table text below is quoted
verbatim). The session's long-form text did not reach this log — only the
§2 one-liner arrived (same gap as O6); a correcting entry can follow if
longer text exists.*

Slice 4/5 blesses: write-first close-out is a D10 refinement (truth logged,
fully editable; Esc = discard stands) · pause-as-segment · activity default
Design (provisional) · IN HAND / TYPED labels · "same truck" wording blessed
but narration says "ETA aligned," never "acknowledged" · fill-state:
project-exists ⇒ line 2 filled regardless of lineage · tab fallback = first
word of document title, never a role noun · claim need lines must be
engagement-scoped (AP-012 check).

*Implementation note: the build-bearing items (fill-state line-2 rule, tab
fallback, same-truck narration) are HELD until after Session 02 per the
session's build-hold directive; they land with Slice 5.5 alongside the
R18 weave.*

### R17 · Activation vendor_id gap — fix before Session 02 — 2026-06-12

*Provenance: ratified via spec v1.3 §2, quoted verbatim (long-form text
not received — see R16 note).*

`activate_proposal_as_project` drops `vendor_id` (main-lineage bug,
procurement session owns) — fix + backfill land **before Session 02**, or
the session script gains a seam answer.


### R16 (full text) · Slice 4/5 review — blesses and small rulings — 2026-06-12

*Correcting entry: the session's long-form text, superseding the §2-quoted
placeholder above (which noted it had not arrived).*

**Write-first close-out (I16): blessed as a D10 refinement.** Capture remains
suggestive because the designer retains full edit/delete (Hours inline edits);
the system errs toward preserving truth — losing time silently is the worse
failure. Esc = discard stands. **Pause-as-segment**: blessed; revisit only if
Session 02 shows pause-noise in Hours. **Activity default = Design**: blessed
provisionally; Session 02 entry data decides whether a per-document sticky
default earns its complexity. **IN HAND / TYPED source labels**: blessed.
**"Same truck"**: the wording is blessed — exactly Midwest-plain — but the
history narration must say "ETA aligned across POs," never "acknowledged";
a batch ETA is not a vendor act and the log may not claim it is.
**Fill-state tab fix**: a project's existence IS commitment — manual projects
render line 2 filled at Project-active regardless of proposal lineage; this
replaces the lineage-blind approximation that overstated SHAPING.
**Tab fallback rule**: when no surname resolves, the tab shows the first word
of the document title — never "CLIENT"/"USER"/any role noun. Fix the Olsen
Lake House tab. **AP-012**: verify claim need lines are engagement-scoped;
one claim must never produce two folders.

### R17 (full text) · vendor_id activation gap — priority — 2026-06-12

*Correcting entry: the session's long-form text, superseding the §2-quoted
placeholder above. Status: LANDED on main as `00199_activation_carry_vendor_id`
(`83a2171c`) — function fix + backfill, applied and verified locally.*

The `activate_proposal_as_project` vendor_id drop is a main-lineage bug
(procurement session owns the RPC fix + backfill migration), but its symptom
lands on Middlewest's REAL activated projects — Leah cannot mount the Order
Assistant on un-ordered lines. Fix + backfill land BEFORE Session 02, or the
session script gains a seam answer for it.


## Pilot record

### L2 · Leah Session 02 — findings — 2026-06-12

**Build:** Slice 5 (rebased, d249b49a) · **Desk at start:** 4–6 folders
(R10 heat — real conditions) · **Signal: GREEN, with two capture debts**
**Numbers.** Time-to-true-read: <1 min at 4–6 folders (clean read-back —
a materially stronger result than L1's one-folder minute) · Unaided margin
acts: 1–2 · Old-portal flights: **2+ — triggers NOT captured, second
session running** · R17 seam answer armed (vendor_id fix had not landed).
**The Note (R14).** Reached for **unaided** — her own Session 01 finding,
shipped in Slice 4, used without prompting. The teaching loop closed on
itself; strongest qualitative signal of the pilot to date.
**D11 verdict.** Timer never mentioned unprompted during the work block;
on direct ask (Q10): "punch card — comfortable." → R19.
**Write-first close-out (R16) in the wild.** She missed the log strip at
put-down entirely, moved to the next task, noticed later, adjusted her
minutes. Under confirm-first the time would have been lost; under
write-first her inattention cost nothing. → R20. (Adjustment venue —
strip vs Hours — not captured.)
**Margin read-back (R12).** Mostly matched her triage order; quibbled an
item or two — specifics not captured.
**NOT captured (debts):** Q1/Q2 precision-recall (MISSED A SECOND TIME —
now owed async, see constants watch) · Q11 idle number · Q12 R18 threshold
numbers · Q14 flight triggers · margin quibble specifics · Q9 verbatim ·
D13 phone hand-off result (flip gate remains unsatisfied).
**Disposition.** Proceed to Slice 5.5. Capture debts collected async —
they are questions, not sessions.

## Rulings — design session, 2026-06-12 (Session 02)

### R19 · D11 RESOLVED — auto-start ratified — 2026-06-12

The two-part evidence is exactly what D11 asked for: the timer went
unnoticed through a full real-work block (unnoticed = punch card, not
camera), and on direct ask Leah's verdict was "punch card — comfortable."
Auto-start on pick-up is no longer provisional. Implementation
consequence: retire any one-tap-start fallback path scaffolding; manual
start remains only as the spine/bar control for documents picked up
without intent to work. The D-table's D11 entry stands with this ruling
as its resolution. Spec §14.1 CLOSED.

### R20 · Write-first close-out vindicated; strip persistence — 2026-06-12

R16's bless now has field evidence: a missed strip cost nothing because
the truth was already logged. No design change. One verification rides
the slice: confirm the log strip has NO timeout — if unengaged it
persists quietly until acted upon or the next pick-up chains it out. If
any auto-dismiss exists, remove it. The strip's quietness is correct;
its patience must match.




## Implementation decisions — Slice 6 (2026-06-12)

### I19 · Slice 6 increment 1 — motion, capture, command, interruptions — 2026-06-12

Slice 6 is the flip-gate omnibus; built as increments. **Increment 1**
(this entry): **The breath (R15)** — a single `doc-breath` keyframe (~3s
opacity swell, prefers-reduced-motion stills it), opt-in via a `breathing`
prop, applied to EXACTLY the active spine marker; the script asserts 1
breathing element in the spine and 0 on the Desk (nothing on the Desk ever
moves). **Idle annotation (D10)** — the time provider listens for activity
pings (pointer/key/wheel/visibility, coalesced to ~20s) while a timer runs;
at close-out `idleSecondsFromPings` sums gaps over the PROVISIONAL 8-min
threshold (Session-02 async Q11) and writes `idle_seconds` (00198); the
strip annotates "~N quiet minutes" beside the number, NEVER subtracting it
(verified: 40 min logged unchanged with idle recorded). **The ⌘K command
bar** — a Document-local paper surface (R3-clean: no design-system Command
import), every row a document (with its fill-state Strata Mark, R15) or a
ledger or an action; documents navigate to `/doc/[id]`, ledgers open the
Studio Drawer sheet via a `document:open-ledger` CustomEvent, the Desk's
"Find anything" affordance opens it via `document:open-command-bar`.
**Interruption settings (D2)** — migration 00201
`designer_interruption_rules` (author-scoped RLS, SHIPS EMPTY = the D2
zero-interruptions default); a sheet opened from ⌘K lists the six margin
kinds all-OFF; a toggle upserts a row (the louder channel that reads these
is later — this is storage + surface). **Friday Pulse desk-rise** confirmed
already shipped (the Friday-gated `pulse_due` need line, Slice 3/5). 5/5
scripted acceptance (`the-document-slice6-shots.mjs`); 384/384 jest.
**Flip-gate status:** the idle-annotation gate is now CLOSED. Remaining
Slice 6 work + gates: Pulse email leg (R13, buildable — increment 2) ·
ledger front-matter (Hours/Orders exist; Accounts/People still stubs) ·
Aesthete fold (large, touches old zone) · R5 exiles staged · ⚠ **D13
mobile build BLOCKED** — the canonical mobile prototype
`patina-the-document-mobile-d3-v1.html` is NOT in the repo (design
authority); Leah device validation + Desk precision at R10 (async Q1/Q2,
missed twice) are externally gated. Migrations now 00191–00201.



### I20 · Slice 6 increment 2 — the Pulse email leg (R13) — 2026-06-12

R13's flip gate built. The Friday email arrives where the client lives:
a new journey-set template `WeeklyPulse` (`@patina/email`) wraps the
designer's composed/edited Pulse prose; a Node-runtime route
`/api/pulse/send-email` authenticates the designer (`createServerClient`
from `@patina/supabase/server` — the working route pattern; the po/generate
copy authenticated as nobody, fixed), loads the sent pulse + project +
client, resolves the recipient, renders the template, and sends via Resend
(`sendEmail`). **Decoupled + non-fatal (I12):** `useSendWeeklyPulse` calls
the route AFTER the `send_weekly_pulse` RPC commits; a non-2xx or network
failure is swallowed — the in-transaction portal mirror already reached the
client, so the inbox touch is best-effort. No schema change (I12). Verified
end-to-end: the Pulse sends (status→sent + mirror posted) AND the email
renders + Resend accepts it (`emailSent:true` + message id) to the test
recipient; template render asserted by 2 vitest cases (50/50 email pkg).
**`@patina/email` added to the app's `transpilePackages`** (it ships raw
TS from `src/`, was absent — the import would not have transpiled).
⚠ **Faithful template:** the design session's referenced "already-designed
Pulse template from the journey set" was NOT in the repo; `WeeklyPulse` is
built to the package's conventions (eyebrow · project heading · prose
paragraphs · See-the-project CTA · designer reply line). If a designed
template lands, swap the chrome — the props contract (clientName /
designerName / projectName / body / weekOf / portalUrl) is stable.
**Flip-gate status: the Pulse email leg gate is now CLOSED (R13
satisfied).** Remaining gates are the externally-blocked three: D13 mobile
build (missing prototype) · Leah device validation · Desk precision at R10
(async Q1/Q2). Prod needs `RESEND_API_KEY` (already true for all email).



### I21 · Slice 6 increment 3 — the D13 mobile build — 2026-06-12

The canonical mobile prototype `patina-the-document-mobile-d3-v1.html`
landed in-repo (design session) and is committed alongside (full CSS — the
look/feel/motion authority; demo body elided as scaffolding). The React
shell ports its INTENT (never markup), active only below the 980px
breakpoint; the desktop spine rail, margin rail, and Studio Drawer nav all
hide there. The three rulings, built:
  • **D3-1 unified bar** (`mobile-bar.tsx`): one bar owns the thumb edge —
    Desk = drawer handle + "in hand today"; document = section handle
    (→ spine sheet, labelled with the active section) + timer glance
    (→ timer sheet, live from the time provider) + drawer book.
  • **D3-2 anchored chips** (`mobile-margin-chips.tsx`): margin items render
    as chips beneath their FF&E line (line anchor) and the letterhead
    (letterhead/section anchors); a tap raises the full item as a paper
    sheet with its actions — the SAME body as the desktop rail, via the
    extracted `MarginItemBody`.
  • **D3-3 the spine sheet doubles** (`mobile-sheets.tsx`): a paper sheet
    with Put-down + the seven sections on top, "In the margin · N" beneath,
    each summary row jumping to its margin item.
Materials honored: paper sheets for document parts (spine, item, timer),
charcoal sheets for desk books (the drawer's five books open the existing
DocSheet ledgers via the `open-ledger` event). Scrim dimming, no shadows
(D4). State: a `MobileShellProvider` holds the active doc (published by the
page via `useMobileActiveDoc`, lifted above the early returns so the hook
is unconditional) + the open sheet. The log strip's bottom offset is now
responsive (56px mobile bar / 42px desktop strip). 6/6 scripted acceptance
(`the-document-mobile-shots.mjs`, 390px) + 384/384 jest; lint/tsc clean.
**Flip-gate status: D13 pattern BUILT — the gate is closed for the build;
Leah's on-device validation (the gate's other half) remains hers.**
Remaining flip gates are now only the two externally-held: Leah device
validation + Desk precision at R10 (async Q1/Q2). Migrations unchanged
(00191–00201; this increment is presentation-only).

### Slice 6 review — blessed as logged, verification rides L3 — 2026-06-12

The three increments (motion/capture/command/interruptions · Pulse email
leg · D13 mobile) are blessed per report: prototype canonical in-repo,
intent-ported shell below 980px, all three D3 rulings scripted-green,
materials honored, the breath as the only ambient motion, margin item
bodies shared with the desktop rail so the two surfaces cannot drift.
No designer-visible items were flagged; accordingly the design review
rides the L3 walk (the real device IS the review). Two confirmations
owed in the log before flip: R17 vendor_id landed (was made in-slice at
5.5 — confirm or name the blocker) and the AP-012 engagement-scoping
verification result (§14.13). R20's strip-timeout check: log the finding.

### R21 · The flip protocol — 2026-06-12

**Gate satisfaction, defined.** (1) D13 gate = the L3 walk lands GREEN:
Leah discovers the spine sheet and opens a chip unaided or with at most
one hint, no material-confusion moments, and her verdict is usable
("works on a job site" energy, not "where am I"). (2) Precision gate =
Q1/Q2 finally CAPTURED at her real desk heat, with either ≤1 false
positive and no high-cost miss, or thresholds retuned to her numbers
and re-checked async. Captured-and-tolerable flips; captured-and-noisy
retunes first.

**Mechanics — stage now, toggle later.** The flip is prepared as ONE
change: `/portal` root resolves to `/desk`; zone routes stay URL-reachable
with no nav entry points (spec §12.5); her existing bookmarks keep
working; the pilot flag graduates to default-on for the studio. Rollback
is the same toggle in reverse — instant, no migration, no data effect.

**Flight telemetry replaces the twice-missed Q14.** At flip, every
old-zone route visit fires a lightweight event carrying from-route and
last-document-in-hand. The triggers we failed to capture twice by
observation will name themselves as data within the first week. This is
the dissolve criterion's instrument as well.

**Week-one watch:** daily zone-visit count and contexts · strip
engagement rate · timer entries/day against her historical baseline.
**Rollback criteria:** Leah asks, or >50% of her work sessions route
through old zones in week one (voting with her feet), or any
data-integrity issue. Un-flipping is cheap; pretending is not.

**Dissolve staging (post-flip, telemetry-gated, each stage its own PR):**
Stage 1 (flip +2 weeks, flat zone telemetry): R5 quiet exiles staged
(Portfolio / Resources / Team) · Inbox verification (§14.10).
Stage 2: ledger front-matter (Insights distribution) · the Aesthete fold —
NOTE: the fold's Accounts rendering (teaching royalties, the 25% Pledge
as lines in the studio's own book) is brand-critical and RETURNS TO THE
DESIGN SESSION for a pass before build; it is the one remaining named
design deliverable in the dissolve.
Stage 3: old-URL redirects · zone removal · app-wide shadow ban (R3) ·
Inbox retirement. Spec v1.4 cuts when the gates check — the flip-state
consolidation, one cut, not three.

## Pilot record

### L3 · Leah validation walk — findings — 2026-06-12

**Build:** Slice 6 / PR #9 (real build, her phone, <980px) · **Both gates: GREEN**
**D13 gate.** Spine sheet: unaided · chip: tapped unaided · put-down: spine
sheet handle · Hours + reply asks: both clean · one brief stall opening the
drawer (first-run affordance — polish watch, not a build item) · first
sentence, verbatim: **"Very slick."** · Q9, verbatim: **"It almost seems too
easy."** GATE SATISFIED per R21.
**Precision gate.** At 4–6-folder heat: **0 false positives, 0 misses** —
and still "slightly noisy," located precisely: the day-one SENT need line
("was there action needed?"). Noise without inaccuracy = a tier problem,
not a threshold problem. → R22. GATE SATISFIED (captured-and-tolerable,
with one nudge landing in the flip window).
**Flights (Q14).** Completeness-seeking, not friction: "Loves where this is
going but still needs the complete functionality available in the portal."
No broken moments named. Post-flip flight telemetry ranks the dissolve.
**Her numbers.** Idle: <1 min · PO drafted-unsent: 1 day · PO
sent-unacknowledged: 1 day.

### R22 · The action test — the awareness tier — 2026-06-12

A Desk folder claims "needs your hand"; the claim is honest only if an act
is AVAILABLE. New rule for every need-line input: **if the designer's only
available act is waiting, it renders as an In-motion chip carrying its
state — not a folder.** First application (Leah's finding): proposal sent,
unopened day 1 → In-motion chip ("Aspen Loft — sent, unopened 1d");
promotes to a needs-your-hand folder at 2 days unopened. Opened-2d-unsigned
stays a folder (act: follow up). DELIVERED-awaiting-inspection stays (act:
inspect). PO lines stay folders at her thresholds (acts: send / chase).
The chip tier is the pressure valve for every future "hot threshold vs.
noisy desk" tension — thresholds can run as hot as her instincts without
the Desk ever nagging. Lands in the flip PR window; constant
`SENT_UNOPENED_PROMOTE_DAYS = 2` beside the R10 set.

### Constants — FINAL (I-entry on land) — 2026-06-12

idle_annotation: 8 min → **1 min** (her number, honored literally; watch
item: if week-one annotations exceed ~⅓ of entries or go ignored, revisit
with data) · po_drafted_unsent: 2d → **1d** · po_sent_unacknowledged:
3d → **1d** · R10 thresholds: **stand as-is** (zero-FP/zero-miss at heat) ·
sent_unopened: 1d → chip tier; folder at **2d** (R22).

### THE GO — 2026-06-12

Both human gates satisfied. Sequence per the Flip Package §4: (1) R22 +
final constants land (one PR window) · (2) pre-flip checklist confirmed in
the log — R17, AP-012, R20 strip timeout, rollback tested both directions ·
(3) toggle: /portal → /desk · (4) Kody's one line to Leah · (5) week-one
watch runs with two added eyes: idle-annotation volume at 1 min, and
sent-unacknowledged noise at 1d (the R22 chip tier is the remedy if either
runs hot). Flight telemetry ranks the dissolve from day one. The Aesthete
fold remains the one named design deliverable, post-flip. Spec v1.4 cuts
at flip-state. — The Document workstream is feature-complete, validated,
and cleared to become the default.

### Pre-flip checklist — confirmed (B3) — 2026-06-12

The three owed confirmations, verified before the toggle:
- **R17 vendor_id — LANDED.** `00199_activation_carry_vendor_id` is on main
  (`83a2171c`); `activate_proposal_as_project` carries `v_item.vendor_id`
  onto FF&E lines (verified in `pg_proc.prosrc`) + backfill via
  `source_proposal_item_id`. No blocker — the Order Assistant mounts on
  activated un-ordered lines.
- **AP-012 / §14.13 — engagement-scoped by construction.** A claim reaches
  its project through the single-FK chain claim → receiving_inspection → PO
  → project; max claim→project fanout across all data = **1**. One claim
  can never produce two folders. §14.13 CLOSED.
- **R20 strip timeout — none exists.** `log-strip.tsx` holds zero
  `setTimeout`/`setInterval`; the strip persists until Logged, Discarded,
  Esc, or the next pick-up chains it out. Confirmed.
- **Rollback — tested both directions** (`the-document-flip-shots.mjs` +
  the rollback walk): flag ON → `/portal` resolves to `/desk`, zone routes
  stay URL-reachable; flag OFF → `/portal` stays on the old Today and
  `/desk` fails closed to `/portal`. Instant, no migration, no data effect.

### I22 · The flip mechanics — implementation (B1–B2) — 2026-06-12

R22 awareness tier in `desk-derivation.ts`: a sent-unopened proposal is an
In-motion chip carrying state ("sent, unopened 1d") via `deriveMotion`
until `SENT_UNOPENED_PROMOTE_DAYS = 2`, where `deriveNeed` promotes it to a
folder; the In-motion chip is now a tappable `Link` to `/doc/[engagement]`
(opens the document, never urgency-outlined). Final constants landed:
idle_annotation `IDLE_THRESHOLD_SECONDS` 8→**1 min**; `PO_DRAFT_UNSENT_DAYS`
2→**1**; `PO_SENT_UNACKED_DAYS` 3→**1**; R10 set unchanged. The flip
toggle: `/portal` (the old Today) redirects to `/desk` when
`the-document-pilot` is on — the bare landing flips, `/portal/*` zone
routes stay reachable; rollback = flag off. Flight telemetry
(`document-events.ts` + `zone-flight-telemetry.tsx` in the portal layout):
a post-flip old-zone visit fires `document_zone_flight` with from-route +
`last_document_in_hand` (stashed in localStorage from `/doc/[id]`).
Week-one watch events: `document_desk_rendered` (folder/chip counts +
need-kind mix — reads sent-unack frequency) on every Desk load;
`document_log_strip_acted` (log/discard, adjusted, had_idle) on strip
action. 386/386 jest; tsc/lint clean.

### FLIP CONFIRMED — 2026-06-12

THE GO executed. (1) R22 + final constants landed (this PR window). (2)
Pre-flip checklist confirmed in the log — R17 landed, AP-012 scoped (§14.13
closed), R20 no strip timeout, rollback tested both directions. (3) Toggle:
`the-document-pilot` graduated to default-on for the studio → `/portal`
resolves to `/desk` (verified live: the portal root flips, zone routes stay
URL-reachable, the R22 awareness chip renders correctly). (4) Kody sends
Leah the one line. (5) Week-one watch is wired: `document_zone_flight`
(from-route + last-document-in-hand) ranks the dissolve; `document_desk_
rendered` carries the sent-unacknowledged frequency at 1d; `document_log_
strip_acted` carries idle volume at the 1-min threshold. Rollback remains
the same toggle in reverse — instant, no migration, no data effect. The
Document is the default. Post-flip: the Aesthete fold returns to the design
session before build; spec v1.4 cuts at flip-state; dissolve stages run
telemetry-gated. — The workstream is flipped.

### I23 · Ledger front-matter (R5 / Insights distribution) — 2026-06-12

Post-flip feature build (production flagging deferred; building the model
out). R5's "Insights distributes as each ledger's front-matter summary
page — no dashboard book": the two ledgers that exist gain their opening
summary. Pure aggregations in `ledger-summary.ts` (tested): `ordersThrough
put` (Open · Arriving this week · Unsent · No ack — the last three only when
present) and `hoursUtilization` (logged minutes + billable share). A shared
`LedgerFrontMatter` band renders them at the top of the ledger sheet (Orders
on the Orders view, not the Vendors pane; Hours always) — charcoal-sheet
styling, a mono lens caption + stat pairs, no dashboard furniture. The
mobile ledgers inherit it for free (same components via the drawer's
DocSheet). Accounts/People front-matter (revenue/AR · pipeline conversion)
await those ledgers being built; the Aesthete-fold Accounts rendering stays
the design-session deliverable. 392/392 jest; lint/tsc clean.


## Rulings — design session, 2026-06-12 (the Dissolve design package)

> Source for all entries below: the live old-portal walk (the-document-parity-map.md)
> and the approved design package (patina-dissolve-eleven-surfaces-v1.html), which is
> the canonical look/feel reference for everything in this block.

### D14 · Sheets & Rooms — the drawer's two weights — 2026-06-12

Drawer objects declare a weight. **Sheets** (existing): charcoal overlays for
quick reference — pull, glance, put back; the document stays mounted beneath.
Orders, Hours, Accounts, People remain sheets. **Rooms** (new): full-screen,
paper-material workplaces you walk into. Entering a Room puts the current
document down through the normal put-down flow — D1 holds, a Room IS the
thing in hand; the timer chains out through the log offer. The drawer bar
persists inside Rooms (D8), Rooms render full-bleed paper (D12), no shadows
(D4). The drawer renders room-weight objects with a doorway affordance
(spine tick + "↗") so the hand learns which pull opens which physics.
**The Library is the first Room.** Leaving a Room returns to wherever you
were.

### R23 · The Work — tasks, deliverables, and gates-are-decisions — 2026-06-12

Resolves C-4, the philosophy ruling: the document absorbs the work and
refuses the task manager. Each active section carries a quiet block, "The
work": deliverables/tasks as checkable lines in the paper's grammar (square
tick that fills sage — a stamp, not a SaaS checkbox), ≤5-second capture
("+ Task", the Note's contract), optional due dates. **A dued task passes
the R22 action test and may rise to the Desk; undated tasks never nag.**
Hour estimates live in the work-head meta ("est. 2–4 wks · 9h of 14h est.")
and give Hours its "of N est." readout. **The gate ruling: an approval gate
IS a client decision** — `client_decisions` with kind 'approval', anchored
to the section, requested from the gate line, mirrored to the client portal,
overdue on the Desk, resolvable from the margin. Client approval SETTLES the
section (stamp + date — the settled stamp becomes something the client
grants). Declined approval holds the section active with the gate narrating
why. Declined from scope: kanban, assignees, priority flags, "+ Add Phase"
(custom sections deferred; six phases cover Middlewest).

### R24 · The Folio — files clipped to the paper — 2026-06-12

Resolves C-5. Files are material, not conversation — NOT a seventh margin
kind. They clip where they belong: a thin folio strip under any section head,
and on FF&E line unfolds (cut sheets, spec PDFs). Drag-anywhere-on-a-section
= the folio catches it (dashed clay dropzone on drag-over). **Versioning
renders literally: a re-uploaded file stacks behind its predecessor using
the Desk's stacked-edge recipe** — one click slides older versions out.
Letterhead unfold "The folio · N files" lists all, grouped by section.
Files open in a full-screen paper viewer (Doc* wrapper), never a new tab.
Per-file client_visible flag, DEFAULT STUDIO-ONLY — the folio respects the
same private layer as Notes; the client mirror renders only flagged files.

### R25 · Rooms on the schedule — 2026-06-12

Resolves C-3. Rooms are how a real FF&E schedule is written: room headings
as Playfair-italic sub-heads in the Project section (name + allocation +
progress meta), Strata mini-rules as dividers, lines beneath keeping every
existing behavior (stamps, unfolds, chips, anchors). "+ Room" adds inline
(name + optional budget allocation); lines assign by drag or from the
unfold; unassigned lines fall under "Throughout · unassigned". Room headings
join the mobile spine sheet as jump rows. Allocations feed the Account
Page's by-room variance — one source. The old Pipeline "Rooms" tab
dissolves: rooms are paper structure, not a directory.

### R26 · The Account Page — engagement financials in the document — 2026-06-12

Resolves C-2, the biggest in-document parity gap, under the ledger rule:
engagement-scoped money lives IN the document. A settled-bar band at the top
of the Project section — "The accounts · this project" — collapsed to one
honest line (budget · committed · margin %), unfolding in place to: the
variance table by room × category (DM Mono numerals; SAGE under, TERRACOTTA
over — never red/green), the margin line (trade vs client, with coverage
note), the designer-earnings block (design fee + est. commissions, linking
→ Accounts), and payment milestones with INLINE TRIGGER CONFIG (on signing ·
on production start · when [section] settles · on date) — R23's gates make
"when a section settles" a real client-granted trigger. Actions: Generate
invoice (drafts into the Money margin, review-then-send) and Export (QBO,
reusing the procurement exporter). **Marked "Studio eyes only" and excluded
from the client mirror — enforce with a CI test, not a convention.**

### R27 · The letterhead instruments — 2026-06-12

Resolves C-6 as one quiet DM-mono row under the letterhead subtitle.
**View as the [clients]** renders the real client mirror full-screen under a
thin charcoal banner ("You're seeing what they see · ← back to your copy") —
read-only preview session. **Send a note** is the Pulse's ad-hoc sibling
("the Pulse handles Fridays; this is for now"): compose sheet → comms post →
letterhead-anchored message item; no new schema. **The scan** is a Discovery
artifact card (floor-plan thumbnail from iOS RoomPlan, full-screen viewer);
scan dimensions become available to R25 room headings — the first physical
iOS↔portal handshake (advances §14.8).

### R28 · The Orders book grows pages — 2026-06-12

Resolves C-7, C-8, C-9 in one structure. The Orders book gains DM-mono page
links — LEDGER · THE WEEK · RECEIVING · VENDORS — never tabs.
**Vendors (C-7):** each vendor page carries terms, open POs, and the thread —
vendor comms in the margin's message grammar, PO-anchored chips deep-linking
into documents; "+ Brief vendor" (R29 colophon) opens it pre-addressed.
**The Week (C-8):** the old calendar in book material (weeks across,
projects down; expected / received / conflict events). The intelligence gets
promoted, not just preserved: **conflicts rise on the Desk as need lines**
("Two installs collide — week of Jul 13") because a calendar you must
remember to check fails the action test; R22 tier rules apply (collision =
folder; drift with no act = in-motion chip).
**Receiving (C-9):** front-matter stat line (arriving · awaiting log ·
claims · 30-day pass rate) + the warehouse-day queue; every Inspect mounts
the SAME inspection drawer the unfolds use — one component, two doors;
cleared items use the Settled fold.

### R29 · The Colophon — 2026-06-12

Resolves C-11. The paper's last line states its own facts: a quiet DM-mono
row at the document's foot — studio · hands on the work · Brief a vendor ·
Hold · Archive · Team… Click → small paper popover. Hold → the Desk's paused
in-motion chip. Archive → "the document goes to the cabinet — find it any
time in ⌘K" (confirm copy as written). Team… → invite designer / add
bookkeeper / reassign lead — **and the §14.6 studio-membership RLS widening
rides this exact popover.** Brief a vendor deep-links the R28 vendor pane
with PO context.

### R30 · Via Patina — the marketplace rail — 2026-06-12

Resolves C-10. Catalog vendors carry the Via-Patina mark (Strata micro-mark
+ "PATINA CATALOG" chip) on unfold PO cells and vendor pages. Ordering via
Patina = the same Order Assistant with a fulfillment branch (Patina handles
production/freight/claims) and the same review-then-send: the preview shows
what Patina receives. The PO cell narrates PATINA HANDLED thereafter — a
PO-cell state, never a line stamp. Vendor-pane "Order all via Patina"
batches through the same preview-as-confirm. **The brand moment ships with
v1: at the instant of ordering, one quiet line shows the commission flowing
to her own book and the Pledge's share of it** ("Commission to your
Accounts: ~$336 · the Pledge returns $84 as teaching royalty"). Ledger rows
land in the Accounts book (stub the destination until B-2 builds; never
stub the line itself).

### R31 · The Engine — a presence, not a place — 2026-06-12

Resolves C-1. The Engine gets NO standalone surface, no chat thread, no
history, no avatar. It answers in exactly two places where asking already
happens: **(1) ⌘K speaks** — the intent splits jump-vs-ask; asks return
Engine results as paper result-lines with one act, "Place → [document]";
ask-and-place, no conversation. One honest footer line: "The Engine · every
ask teaches your profile · deeper: open the Library ↗". **(2) the Library's
librarian** — the standing input at the top of the Library Room for style
recs, market trends, longer work. All Engine output renders in document
grammar (lines, cards, stamps). /portal/companion retires at dissolve with
its capability fully absorbed; its backend API is reused, re-skinned.

### R32 · The Library — the first Room — 2026-06-12

Builds B-1 under D14. Full-screen paper Room at /library: three layers as
SHELVES separated by Strata rules — My Library (raw captures: Chrome
extension, photos, URL paste) · Studio Library (proven) · Patina Catalog
(the marketplace, with Via-Patina marks and maker nomination) — with
capture → promote → nominate as the movement between shelves. The Engine
stands at the top as the librarian (R31). **Teaching happens while
browsing:** needs-teaching cards carry a Golden-Hour tag; tap = Quick Tags
inline on the card; Deep Analysis opens as a paper sheet over the Room for
15-minute sittings. Teaching stats (today's progress · accuracy · impact)
compress to one quiet line in the Room's foot — present, never gamified.
The old Teaching Queue page and Products zone dissolve into this Room.

---

## Implementation decisions — the Dissolve (2026-06-12)

### I24 · Dissolve package logged — two referenced artifacts absent — 2026-06-12

The R23–R32/D14 block above is appended verbatim as received. Two artifacts
it references did NOT arrive in the repo or any local path (searched):
the canonical design package `patina-dissolve-eleven-surfaces-v1.html`
(named the look/feel authority for this block) and the companion walk
evidence `the-document-parity-map.md`. Same gap class as the D13 prototype
(I19) — which later landed. The Track 1 build proceeds on the rulings'
written detail plus the shipped document grammar (prototype v0.4 +
mobile-d3 recipes); designer-visible calls return with screenshots per the
standing protocol, and the package file gets committed the moment it
arrives. Track 1 build entries follow below.

### I25 · Dissolve Track 1 — in-document parity (R23–R27, R29) — 2026-06-12

Built on `the-document/dissolve-track-1` (stack tip); migrations
**00202–00205** (00199 stays main's). All five SQL acceptance assertions +
8 scripted browser checks + 404/404 jest green. Audit-first findings and
implementation calls:

**The Work (R23) · 00202.** The package's `section_tasks` table was
pre-empted by the codebase: `project_tasks` (00169) already carries
title/status/due_date/completed_at — extended additively with
`section_key` / `estimate_minutes` / `created_by`. Gates ride
`client_decisions` exactly as ruled: `decision_kind` ('choice' default ·
'approval') + `section_key`; the approving option carries an explicit
`approves` flag (a fact on the option, never a name match). The gate is
created through the SAME machinery as any decision (options +
`notify_decision_required`) so the client-portal mirror and notification
came free. **Settlement is server-side and one-transaction** (00204
SECURITY DEFINER trigger, §5): an approved gate advances the project's
REAL vocabulary — section 'project' → `current_phase='installation'`,
'install' → `status='completed'` — so spine, Desk, and old zones read one
truth; the settled bar wears "Approved · date" from the gate. Dued tasks
join `document_state` (due_task_count/title; due-today counts, R10
boundary semantics) and rise as a TASK DUE folder ranked below
awaiting-inspection, above the send-weave nudges — at Whitfield/Olsen demo
heat the task is rightly shadowed by overdue-decision/claim needs (the
one-thing discipline); derivation proven at unit + view layers. Tasks are
project-scoped in v1 (the I16 timer precedent). Hours gains an "of open
work est." front-matter stat; the work-head meta reads "Xh of Yh est."

**The Folio (R24) · 00203.** The package's `engagement_files` was likewise
pre-empted: `project_documents` (00169) + the `project-documents` bucket
(00170) extended additively with margin-grammar anchors
(anchor_kind/anchor_id/section_key), `version_of` (literal stacking — the
Desk's stacked-edge recipe at chip scale, one click slides versions out),
and `client_visible` DEFAULT FALSE. **Backfill: pre-folio rows →
client_visible=true** (they were already client-readable; D7 — no live
engagement loses anything). Client RLS narrowed to flagged rows on BOTH
the table and the storage-objects read policy. Drag-anywhere-on-section is
caught by the page and lands on the strip; per-file studio/shared toggle;
full-screen paper viewer (shared with the scan). Drag-to-ASSIGN-rooms and
cross-section drag are polish debt — assignment ships via the unfold.

**Rooms (R25) · no migration.** The audit answered R25's question:
`project_rooms` (00066) already carries name/budget_cents(allocation)/
sort_order with activation lineage, and `project_ffe_items.project_room_id`
exists. The paper just renders the truth: Playfair-italic headings with a
Strata mini-mark (state = the room's own progress), live
committed-of-allocation + placed counts, "Throughout · unassigned",
"+ Room" inline; room jump rows join the mobile spine sheet. The Account
Page variance reads the SAME rows (one source, as ruled).

**The Account Page (R26) · 00204.** Settled-bar band; collapsed line =
budget · committed · margin% from the same aggregates as the unfold.
Variance by room (sage under / terracotta over) with a muted category line
per room (full room × category matrix deferred until a real schedule needs
it). Margin line carries the trade-coverage note; earnings block links to
the Accounts ledger (stub destination per R30's rule). **Milestone
triggers:** additive trigger_kind/trigger_section_key/invoice_id on
project_payment_milestones; `draft_invoice_from_milestone` is the ONE
drafting path (idempotent, drafts only — review-then-send via
issue_invoice stands; designer door is the checked
`generate_milestone_invoice` RPC). WIRED to auto-draft: on_section_settled
(the gate trigger — "when Install settles" drafts Delivery, asserted in a
rolled-back transaction) and on_production_start (first line into
production). on_signing/on_date are stored config; their drafting stays
with the designer's Generate-invoice act (activation already seeds the
signing milestone outstanding) — flagged: if the session wants them
auto-drafting, say so. Band placement: renders above the FF&E schedule in
project/install/care states (the "top of the Project section" home, kept
reachable through delivery) — designer-visible, flagged for review.

**Instruments (R27).** One DM-mono row under the letterhead vitals: View
as the [surname]s · Send a note · The scan (only when the client has a
RoomPlan scan with imagery). The client mirror is a designer-portal
projection component (NOT an iframe of the client app): full-screen under
the charcoal banner, read-only by construction, querying ONLY
client-visible material. **The R26 CI test is twofold:** a source-contract
jest suite (client-mirror-contract.test.ts — the R3 shadow-lint precedent)
asserts the flag filter, forbids account/task/note references and any
mutation call; the browser script additionally asserts the accounts band,
studio tasks, and unflagged files are absent from the rendered mirror.
Send-a-note posts through rpc_start_project_thread + comms_messages (zero
schema, as ruled) and lands letterhead-anchored in the margin.

**The Colophon (R29) · 00205.** Foot row: studio (resolved from
organization_members) · hands on the work (D6 presence) · Brief a vendor ·
Hold/Resume · Archive (confirm copy verbatim) · Team…. Hold/archive ride
project status (paused chip / cabinet; archived stays ⌘K-findable per R1).
**§14.6 landed as 00205:** margin_notes gains studio READ (active org
co-membership with the engagement's lead, or project-team membership);
authoring stays author-scoped. The Team popover adds members by email
(project_team_members). Brief-a-vendor opens the Orders book — it
pre-addresses the vendor pane when Track 2.1 builds it.

**Seed/scripts:** the-document-track1-seed.sql (idempotent addendum),
the-document-track1-assertions.sql (5 SQL asserts incl. the rolled-back
settlement chain + client-RLS folio check), the-document-track1-shots.mjs
(8 checks + 8 screenshots → screenshots/track-1/), rebuild script now
applies 00202–00205 + both seeds. Gotcha for posterity: client_decisions
embeds of options must disambiguate
`!client_decision_options_decision_id_fkey` (recommended_option_id is a
second FK).

---

## Rulings — design session, 2026-06-12 (Track 1 review)

### R33 · Track 1 review — blessed, with six fixes — 2026-06-12

**Blessed as built:** the project_tasks/project_documents pre-emptions
(audit-first working as designed — the package proposes, the codebase
disposes) · gates-as-decisions with the explicit `approves` option flag
and SERVER-SIDE one-transaction settlement advancing the project's real
vocabulary (spine, Desk, and old zones reading one truth is the whole
model in one trigger) · the settled bar wearing "Approved · date" · TASK
DUE ranked below awaiting-inspection, above send-weave nudges · the folio
backfill (pre-folio rows → client_visible=true; D7 honored — no live
engagement loses anything) with RLS narrowed on table AND storage ·
rooms rendered with zero migration off 00066 · variance as room rows
with a muted per-room category line (the full matrix stays deferred
until a real schedule demands it) · the mirror as a projection component
with the twofold contract test · the colophon carrying §14.6's RLS
widening (00205) · Brief-a-vendor pre-addressing a pane that doesn't
exist yet · the Account band's placement above the FF&E schedule through
project/install/care — blessed as built.

**The fixes (F1–F6, designer-visible):**
**F1 — Own-authored messages settle.** A comms post authored by a studio
member must NEVER render as a needs-attention margin message (the
designer's own Pulse mirror currently surfaces as MESSAGE · unread-ish).
Studio-authored posts render pre-settled (the Settled fold), excluded
from needs-action and unread derivation. The margin asks for her hand;
her own voice never qualifies.
**F2 — Mirror attribution.** The client mirror groups the CLIENT's own
message under "From the studio." Split attribution: studio-authored
under "From the studio," client-authored rendered as their own ("You
asked," or thread-style) — a mirror that misattributes the client's own
words breaks the trust the instrument exists to build.
**F3 — Pulse idempotency.** The mirror shows the same Pulse posted twice
(Jun 12 ×2). Verify one-mirror-post-per-pulse (the status flip should
guard it); if seed artifact, fix the seed; if real, guard the RPC.
Assert it in the acceptance script either way.
**F4 — "NO TRIGGER" → "MANUAL."** The signing milestone's trigger cell
reads NO TRIGGER; the honest word for a designer-act milestone is
MANUAL. Same cell, better word.
**F5 — Room vocabulary.** Room meta reads "0 of 1 placed" while the
section meta reads "underway" — one schedule, two vocabularies. Rooms
adopt the section's word: "committed $X of $Y · N of M underway."
"Placed" retires until it can truthfully mean installed.
**F6 — Sender names.** "MESSAGE · DESIGNER USER" is the USER-bug's third
cousin. Sender labels always render profile display names; the seed gets
real names; a production guard falls back to the studio name, never a
role noun (R16 extended to senders).
**Sanity line (not a reopening):** §14.13 closed at flip — confirm in
one log line that the two AP-012 desk folders reference two DISTINCT
claims (seed coincidence), not one claim crossing engagements.

### R34 · Milestone triggers — the flagged question resolved — 2026-06-12

**on_date: WIRE IT** to `draft_invoice_from_milestone` — a date the
designer deliberately configured arriving IS the drafting moment; drafts
only, review-then-send unchanged, idempotent path already guards repeats.
**on_signing: STAYS a designer act** — activation already seeds the
signing milestone outstanding; an auto-draft would duplicate the
existing flow's output and the moment is ceremonial anyway (she's in the
document when it signs). Config stored, drafting manual, as built.

---

## Implementation decisions — Track 2 (2026-06-12)

### I26 · Track 1 fixes (F1–F6) + Orders book Track 2 (R28) — 2026-06-12

Built on `the-document/track1-fixes` (PR #11) → `the-document/track2-orders-book`
(stacked). Migrations **00206** (margin own-voice + milestone-date cron) and
**00207** (vendor pane links). 47 jest suites / 433 tests green; Track 1
asserts 1–8 + Track 2 asserts 1–4 green; 6 review screenshots in
`screenshots/track-2/`.

**F1–F6 / R34 (PR #11):** own-voice messages settle (00206 derives `own_voice`
= latest post not from a client/vendor participant; excluded from unread,
sunk to the Settled fold) · the mirror splits "From the studio" / "You asked"
by `client_id` · the pulse-×2 was the shots-script reset orphaning the prior
mirror (RPC guard sound; scripts now retire the orphan; ASSERT 6 holds it) ·
MANUAL replaces NO TRIGGER · rooms speak "committed $X of $Y · N of M
underway" · senders render display names (seed designer = Leah Hartwell;
00206 falls back to the STUDIO name for nameless studio senders only, never a
role noun) · on_date milestones now draft via `milestone-date-invoices-daily`
pg_cron, on_signing stays manual.

**R28 — audit-first findings:**
- **00207 was a latent bug, not just an addition:** the shipped Orders-ledger
  vendor directory already rendered `trade_account_email` / `trade_portal_url`
  but NO migration ever defined them — they read undefined on every row.
  Defined now (additive, D7), alongside `contact_profile_id` (the missing link
  between vendor COMPANIES and vendor comms PROFILES).
- **The conflict classifier already existed** (`delivery-conflicts.ts`, Wave
  2.1) with overlap/late/drift per-project. R28's cross-project install
  collision is the one shape it lacked — added `detectInstallCollisions`
  (two+ DISTINCT projects, same ISO Mon-week; same-project installs never
  collide — one home, one crew).
- **The inspection drawer is reused wholesale** — Receiving and the line
  unfold mount the SAME `LogInspectionDrawer` (one component, two doors;
  source-contract test holds it), so the two doors write identical rows.

**R28 build:** Orders book grows four DM-mono page links — LEDGER · THE WEEK ·
RECEIVING · VENDORS (never tabs; source-contract forbids Tabs primitives).
The Week is weeks-across / projects-down over `delivery_events`; its
intelligence is **promoted, not just preserved** — `desk-conflicts.ts` maps
the classifier onto the Desk's two tiers (collision/late → folder need line
ranked under awaiting-inspection per R33's blessed order; drift/overlap →
in-motion chip per R22) through `use-desk-engagements` (one 60s cycle reads
both sources). Receiving carries the I23 front-matter stat line (arriving ·
awaiting log · claims · 30-day pass) + the warehouse-day queue + the Settled
fold. Vendors resolves the thread through `contact_profile_id` (vendor_brief
threads with the company's comms profile); "+ Brief vendor" and the R29
colophon both pre-address it with the document's project. Mobile inherits via
the shared DocSheet (the open-ledger event mounts the same book).

---

### I27 · Design-authority audit + grammar polish; I24 CLOSED — 2026-06-13

The two artifacts logged absent in **I24** arrived and are now committed:
`patina-dissolve-eleven-surfaces-v1.html` (the look/feel authority) +
`the-document-parity-map.md`. **I24 is closed.** Track 1 (R23–R27/R29) and
Track 2 (R28) were both built against the rulings text alone, without these
mocks — so a 12-agent adversarial audit compared the shipped code against
the authority.

**Verdict: logic-correct, right C-gaps closed, visual grammar systematically
under-built.** Of 11 surfaces: 3 full parity, 6 partial, 2 divergent — zero
wrong on logic. The parity map confirms Track 2 closed C-7/C-8/C-9 and Track 1
closed C-2..C-6/C-11; no C-cluster mis-targeted. The recurring miss was
load-bearing grammar classes (`.mitem`, `.wk-ev` pills, the `.gate` stamp,
`.minirule`, `.mono-link` palette) skipped or approximated with one-off
Tailwind — the data true, the paper not yet looking like the paper.

**Polished (high-leverage subset, this PR):** shared primitives `MItem`/
`MItemContent` (the margin rail AND the vendor thread now render through one
grammar — anti-drift, I21; §6 had drifted to flat `<li>`s) + `StrataMiniRule`.
**§6 Vendor pane** → a bookbar (Terms · Thread · Orders · N, DM-mono links
never tabs), messages as `.mitem` with the studio's own posts reading "You"
in clay (ownVoice) over the vendor's dusty-blue, and a PO-anchored "re:
{project} →" deep-link into the document. **§7 The Week** → `.wk-ev` pill
chips with "✓ recvd" / "⚠ collides" annotations (only true cross-project
install collisions wear the word — overlaps get the cell border, no word) +
the legend. **§1 The Work** → the Golden-Hour "Gate" stamp on the gate row +
"Request sign-off" + the `.work` container + a sage ✓-glyph tick + head
"N of M". **§3 Rooms** → the Strata mini-rule under each heading. New
source-contracts hold the anti-drift + pill + gate-stamp + mini-rule grammar
(`dissolve-grammar-contract.test.ts`). 48 jest suites / 442 tests green;
screenshots re-captured. **No migration** — presentation-only.

**Correctly superseded — the v1 HTML is the OLD version, code is right (NO
action):** §3 room vocabulary "placed" → "underway" (R33 F5 retired "placed");
§7 conflict-count word generalization + `<table>` vs CSS-grid (a11y) + concise
chip dates; §4 band placement; §2 viewer/D12. Flag the HTML stale at the next
spec cut.

**Deferred (gap inventory, a later polish session):** §8 Receiving
product-name-first queue rows + ARRIVING in-flight rows (needs an ffe-items
query join) · §2 folio `.f-kind`/`.f-meta` card anatomy · §5 instrument
three-color palette + scan-date suffix · §9 colophon `.cdot` separators +
clay-default actions · the `MonoLink` color-variant util · the broader RLS
spot-checks (§14.6 widening, folio storage-objects policy) + the full-surface
mobile walk. **Week-count:** The Week shows 8 weeks (not the mock's 5) —
deliberate visibility choice, logged here rather than diverged silently.

**Track 3 — NOT gaps, unbuilt by design:** §10 Via Patina (R30), §11 The
Engine (R31), §12 The Library Room + D14 Rooms physics (R32) — return with the
Accounts/Aesthete design session. Any future audit must scope these as
not-yet-built, never regressions.

### R35 · Strata Mark progress system — extends R15 — 2026-06-13

Ratifies the Strata Mark as a working progress device and adds two things R15
left open: the per-line gradient coloring and the component build contract.
Canonical reference: patina-strata-mark-progress-system.html.

**The three-hue gradient (NEW — extends R15's single-hue fade).** Each line
carries its own MOVEMENT color, fading back through time rather than one hue
at decreasing opacity:
  - Line 1 · Mocha #5C4A3C — Shaping (Brief→Direction), the deepest layer
  - Line 2 · Clay #C4A57B — Commitment (the signing), the middle layer
  - Line 3 · Dusty Blue #8B9CAD — Delivery (Project→Care), the newest layer,
    rendered at ~55% opacity so the canonical gradient fade survives.
The brand's 100/80/60 width ratios and the soft third line are preserved; the
movement-to-line mapping is exactly R15's. Movement hues are for the mark
ONLY — never the stamp palette (sage/terracotta) and never equalize the three.

**The fill API (build contract).** One CSS custom property per line, `--f`
(0..1), drives a left-clipped color fill over a ghost track; unfilled = track.
The component reads engagement stage and sets three values. Stage→fill triples
(canonical): Brief [0.15,0,0] · Discovery [0.5,0,0] · Direction [1,0,0] ·
Proposal [1,0.5,0] · Signed [1,1,0] · Procurement [1,1,0.4] · Install
[1,1,0.7] · Care [1,1,1]. Commitment (line 2) is binary — signed is 0 or 1.
Fill transitions ~.6s ease on stage change; otherwise still.

**Three behavior classes.** (none)+fill = determinate progress / static brand
mark at fill=1. `.breathing` = R15's single sanctioned ambient motion (~3s
opacity swell, staggered per line), used on EXACTLY the active element (the
spine marker of the held document), never on the Desk, reduced-motion → steady
glow. `.sweeping` (NEW) = indeterminate loader for scans / saves / Aesthete
thinking: lines fill in sequence then the set fades and restarts (~2.2s),
reduced-motion → static partial. The sweep replaces spinners portal-wide.

**Surfaces (per R15, now with fill).** Folder tab, letterhead, ⌘K result rows,
and the spine's seven markers each carry the engagement's fill — a glance reads
how far along. Size variants set the mark's overall width (sm/md/lg/xl =
48/88/120/150px) so the descending taper and per-line fill stay legible; the
⌘K and tab marks render at the wider end so result-row progress is readable
before opening. Decreasing line HEIGHT (brand canon for large lockups) is
available via per-line height vars but equalized for crispness at small sizes;
width ratios and the opacity fade are always honored.

Build note for Claude Code: ships as the `Strata` component's progress mode —
a presentation concern, no schema. Fill derives from the existing
`document_state` stage; the breath already shipped (I19). The `.sweeping`
loader and the three-hue fill are the new surface. Folds into spec §10 (visual
system) at the next cut. If the single-hue fade is ever wanted back for a pure
brand context (wordmark lockup), the component takes a `mono` flag — the
progress system is the default in-product.

---

### I28 · Strata progress system built (R35) — 2026-06-13

Built the Strata Mark's progress mode per R35 (presentation only, no schema);
artifact `patina-strata-mark-progress-system.html` committed.

**Three-hue gradient.** `StrataMark` fill mode now paints each line its
movement hue — line 1 `--color-mocha` (Shaping), line 2 `--color-clay`
(Commitment), line 3 `--color-dusty-blue` (Delivery) at 0.55 opacity (the
canonical fade) — as a left-clipped `scaleX(--f)` over a ghost track, with a
`mono` flag for pure-brand contexts. Four size variants sm/md/lg/xl =
48/88/120/150 (lines at 100/80/60). The stage→fill mapping was already R15's
(`fillStateForDesk`/`deriveFillState`); added `fillStateAtSection` so the
spine's seven markers read as a filling staircase (active breathing). Verified
on real data: Desk folder tabs, ⌘K rows, the spine, and the letterhead all
fill (the letterhead mark shows Mocha-full · Clay-full · Dusty-Blue-partial).

**The sweep.** New `StrataSweep` (`components/ui/strata-sweep.tsx`) + globals
keyframes (`strata-sweep-1/2/3` + `-fade`, byte-faithful to the blessed HTML;
reduced-motion → static partial). The lines fill in sequence then the set
fades and restarts. Replaces spinners on the **permanent surfaces**: the
canonical `Button` loading affordance (so every `loading`-prop button
portal-wide now sweeps), the **live-scan LoadingOverlay** (the review surface
— %/bar/stage dots preserved, blue rebranded to clay), auth (signin/callback),
and the room-scan family (RoomScanViewer save, room-scan-detail,
associated-room-scans ×3, lead-room-scans). Source-contract
`strata-progress-contract.test.ts` holds the three-hue + sweep + spine +
overlay + button grammar. 48 suites / 450 tests green.

**Deferred spinner inventory (dissolving old zones — rebuild into the Library
Room, R32; not churned now):** `catalog/image-uploader.tsx:154`,
`catalog/search-autocomplete.tsx:174`, `catalog/duplicate-detection-panel.tsx:308`,
`teaching/QuickTeachModal.tsx:110`, `vendors/vendor-form.tsx:267`,
`vendors/vendor-slide-over.tsx:60`, `products/validation-issues-panel.tsx:172`,
`portal/account-menu.tsx:160`. Their submit buttons already sweep via the
canonical Button; the standalone spinners ride the zone's eventual rebuild.
(`validation-issues-panel.tsx:203` is a RefreshCw affordance, not a loader —
intentionally left.)

---

## Rulings — design session, 2026-06-13 (Track 3 — the Accounts book, the Aesthete fold, the Engine, the Library, the Composing Page)

> Opens Track 3 of the Dissolve. Source for look/feel: `patina-dissolve-eleven-surfaces-v1.html` §10–12 (landed I27), the shipped Orders book (R28), ledger front-matter (I23), and the Strata progress system (R35) — now joined by two prototypes landed in the workstream dir: `patina-library-room-prototype.html` (the Room shell + the Library, R39) and `patina-composing-page-prototype.html` (the Composing Page, R40). These rulings unblock the build I27 deferred ("return with the Accounts/Aesthete design session").

### R36 · The Accounts book — the studio's money ledger — 2026-06-13

R26 put per-engagement money inside the document (the Account Page, a Project-section band, studio-eyes-only). What stays inherently studio-wide — cross-engagement receivables, the studio's own earnings, the Pledge — needs its own Drawer ledger. R5 named the destiny ("Accounts: revenue/AR … the 25% Pledge rendered as a line in the studio's own account book"); this rules its shape.

The Accounts book grows pages in the R28 grammar — DM-mono page links, never tabs — and carries three: **Ledger** (invoices: draft / sent / paid / partially-paid / void — the old Billing list), **Receivables** (A/R aging buckets plus the Send-reminder dunning Billing carried), and **Earnings** (design fees + Via-Patina commissions + teaching royalties; the Aesthete fold lives here per R37). The opening **front-matter** band (the I23 treatment — a mono lens caption with stat pairs, charcoal sheet, no dashboard furniture) states **Revenue · AR · margin**: money in, money owed, margin percent. This extends R5's revenue/AR lens with margin now that the per-engagement Account Pages (R26) roll up into the book. A teaching lens joins this band — ruled in R37.

Aging receivables obey the action test (R22): an invoice past due **rises on the Desk as a need line** — the available act is "send the reminder / chase" — and the Receivables page carries the same dunning action, so one act updates both surfaces. A receivable still within terms has no available act and therefore stays an in-motion reading on the page, never a Desk folder. The book aggregates; it does not re-author. The per-engagement Account Page (R26) is the leaf, this book is the sum — it rolls up the Account Pages and the cross-engagement rows (studio AR, earnings) that have no single-document home, with no figure entered in two places. Studio-eyes-only carries over from R26; bookkeeper access rides the colophon's Team… affordance (R29 / §14.6). Drawer weight: Accounts is a **Sheet** (D14), not a Room — pull, glance, put it back; the document stays mounted beneath.

### R37 · The Aesthete fold — teaching royalties and the two-sided Pledge — 2026-06-13

The brand-critical rendering, and the one named design deliverable the flip left open (R21, THE GO). The Designer-Taught loop (R31) earns the designer money; R5 routed teaching royalties and the 25% Pledge into Accounts. This rules how that money reads, on the Earnings page of the Accounts book (R36).

The Pledge mechanic, as confirmed this session (correct against brand if it differs): ordering via Patina earns the designer a commission, and 25% of it is the **Pledge** — rendered **two-sided**: what it returns to her, and what it gives to the commons (R30's worked example: a $336 commission, $84 at 25%).

The **Earnings page reads in two bands.** *What you earn* gathers design fees and Via-Patina commissions — client-work income. *What teaching returns* gathers teaching royalties and the running Pledge — taught-taste income. Keeping them apart lets the Designer-Taught loop speak in its own voice instead of dissolving into the invoice stream. The **Pledge is twinned, and the two directions never blur**: each Pledge event renders as a pair of distinctly labelled sub-lines — **returned to you** (royalty income, accruing to a year-to-date total: "the Pledge, returned to you: $X") and **given to the commons** (the share that funds the shared catalog and maker community). Money she keeps and money she contributes are labelled on the face of the line, so "is this mine?" is answered without a tooltip. R30's order-moment line now shows both halves at the instant of ordering, then lands both in this band.

Teaching also appears in the Accounts **front-matter as one quiet stat pair** — a teaching lens beside Revenue · AR · margin — to make the loop visible where the book opens. This is rendered strictly as a single mono lens pair (for example "Taught this month · royalties returned"), never a dashboard: a deliberate, bounded extension of R5's "no dashboard book," and it must stay one line and not grow furniture. Teaching *progress* — accuracy, impact — stays where R32 put it, in the Library Room's foot line; Accounts shows only the monetary face, and the front-matter pair links into the Library for the progress detail.

**Open (brand input, not ruled here):** the commission rate and the Designer-Selections-vs-Style-Matches split that feed these lines are a marketplace-config / brand decision. The rendering is built to receive them; promote them to spec §14 at the v1.4 cut.

### R38 · The Engine — built as a presence (R31, build-grade) — 2026-06-13

R31 ruled the Engine "a presence, not a place." This deepens it to what Claude Code can build and resolves C-1, the highest-stakes undefined item: where a conversational capability lives in a model whose whole thesis is "no chrome, just paper."

**⌘K speaks by read intent, with no mode.** One box: a destination-like input jumps (the existing ⌘K behavior); a question-like input asks the Engine, whose answer renders inline beneath the query as **paper result-lines** — each a product or idea in document grammar carrying one act, **Place → [document]**. No toggle, no "ask mode," no chat affordance. Ask-and-place; the Engine is summoned where asking already happens and leaves no surface behind it. While it works, the Engine "thinking" state uses the R35 Strata sweep, never a spinner.

**No thread, no history, no avatar — but the placement carries provenance.** The ask itself does not persist; what persists is the *act* — a placed item wears a quiet "via the Engine" mark in the document and its folio, and the Engine profile updates silently (the teaching). This holds R31's no-room rule while giving trust a faint, honest footprint ("where did this come from?") without reconstructing a conversation log. The **Library's librarian** is the second and only other home: the standing input at the top of the Library Room (R32, built in R39) takes the longer work — style recommendations, market trends, deeper sittings — in the same paper grammar and the same no-history stance ("Ask the librarian … every ask teaches your eye"). Two homes, both places where asking is already native. `/portal/companion` retires at the dissolve, re-skinned rather than rebuilt: its backend capability is reused behind these two surfaces while the conversational web surface is exiled (⌘K-reachable only until removal). Always the Engine / Designer-Taught Intelligence in copy — never "AI."

### R39 · The Library — the first Room, on a reusable Rooms shell (D14) — 2026-06-13

R32 builds the Library as the *first Room*; D14 ruled the Sheets-versus-Rooms model but no Room has been built yet. This rules the build order and what the Room is. Canonical look/feel: `patina-library-room-prototype.html` — the Room shell and the Library together; the Desk marks a Room "walk in" and a book "a sheet" ("A Room is a place you walk into. A book is a sheet you pull"), and exiting reads "Putting the Library down…".

**Build the Rooms shell first; the Library is its first tenant.** The reusable physics land as a foundation before any Library content: entering a Room runs the normal **put-down** of the current document (D1 — a Room *is* the thing in hand, so the timer chains out through the log offer), the **Drawer persists** inside the Room (D8), the Room renders **full-bleed paper** (D12) with **zero shadows** (D4), the Drawer marks room-weight objects with a **doorway affordance** (a spine tick and "↗" so the hand learns which pull opens which physics), and **leaving a Room returns you to wherever you were.** This costs more upfront than a one-off surface, but it validates the physics once and makes the second Room nearly free.

The Library itself is **three shelves separated by Strata rules** (R32, unchanged): **My Library** (raw captures — Chrome extension, photos, URL paste — landing raw, no taxonomy, no queue, taught when ready), **Studio Library** (proven, promoted from captures), and **Patina Catalog** (the marketplace, with Via-Patina marks and maker nomination), with capture → promote → nominate as the movement between shelves. The Engine stands at the top as the librarian (R38). **Teaching happens while browsing** (R32): needs-teaching cards carry a Golden-Hour tag; a tap opens Quick Tags inline on the card, and Deep Analysis opens as a paper sheet over the Room for fifteen-minute sittings. Teaching stats compress to one quiet line in the Room's foot ("taught today · accuracy · future matches improved") — present, never gamified. Authoring a new piece opens the Composing Page (R40). The old Teaching Queue page and the Products zone dissolve into this Room.

### R40 · The Composing Page — detailed processes as self-composing paper — 2026-06-13

Ratifies `patina-composing-page-prototype.html` as the canonical pattern for "detailed processes" in The Document — the model's answer to the wizard, the modal, and the multi-step form. A detailed process is **a paper artifact that builds itself**: there is no Next, no Back, no "Step N of M." Sections fill in **any order**, the artifact shows its own gaps, and it is a real, usable **draft at every percentage**, saveable at any point. The **Strata Mark (R35) is the only progress indicator** there is; the three movements map to the three Strata lines, and the state reads Capture → Draft → Catalog-ready off the same fill the mark shows.

Three weights, one continuum — **inline · sheet · room**: the same compositional act can happen inline (Quick Tags on a card, R32), as a sheet over a surface, or as a full room/page (the Composing Page) for the deepest work. The weight changes; the grammar does not.

First instance — **Compose a piece** (a catalog product), reached from the Library (R39): three movements mapping to the three Strata lines — *the record* (identity + the piece: name, maker, dimensions, materials), *the catalog* (commerce + the folio: trade/retail price, lead time, min order, images & cut sheets — the same folio as R24), and *the eye* (the teaching — style & character, the exact Quick-Tags act of R32, here as one section of the larger composition). It is **composed from both sides of the marketplace**: the maker fills price and lead time in their own portal; the designer adds the eye — one page, two authors. The librarian (the Engine, R38) stands by, but nothing is required to save — a piece can rest at draft and be taught later from the shelf. This pattern governs detailed creation flows generally, not the Library alone; other "compose" surfaces adopt it as they arrive.

### Spec cut — v1.4 (flip-state consolidation) — 2026-06-13

`the-document-spec-v1.4.md` cut, superseding v1.3 (preserved). Folds the flip
(THE GO / FLIP CONFIRMED), Dissolve Tracks 1–2 (R23–R34, I25–I27), the Strata
progress system (R35 / I28), and the Track 3 rulings R36–R40 — with the
`patina-library-room-prototype.html` and `patina-composing-page-prototype.html`
references — into the body. §-numbers are frozen, so every existing `spec §N`
cross-reference in this log remains valid. New: §16 (the Dissolve) and §14.15
(Via Patina commission rate + the Designer-Selections-vs-Style-Matches split,
open). The I27 "HTML is the old version" flags are carried as §0/§10 notes.

### I29 · Dissolve Track 3 — the Rooms shell + the Library (R39/R32, slices 1–2) — 2026-06-13

Built on `the-document/track3-rooms-library`. **No migrations** — presentation plus reuse of the shipped catalog / teaching / time layers; the audit (`the-document-track3-audit.md`) confirmed the data already exists everywhere Track 3 needs it. type-check + lint (including the D4 shadow ban, scope unchanged — the Room components live under `components/document/**`, already covered) are green on every new file; live-verified against real data on local Supabase.

**Slice 1 — the reusable Rooms shell.** `RoomShell` (`components/document/rooms/room-shell.tsx`): full-bleed paper (D12), zero shadows (D4), a thin head (leave · ident · one action slot), reduced-motion-safe enter/leave. It mounts under the `(document)` group (`app/(document)/library/page.tsx`) so the Drawer (D8), the log strip, and ⌘K persist around it. **Put-down on entry rides the existing path, not a fork** — navigating off `/doc/[id]` unmounts the page, whose `useHoldDocument` cleanup chains the timer out through the log offer (R39 reuse #5). **Return-to-origin** is a new session-scoped stash (`lib/document/room-origin.ts`, distinct from the telemetry-only `rememberDocumentInHand`); leaving reads it and navigates back (verified live: `/library` → ← → `/desk`). The Drawer marks the Library room-weight with a **doorway affordance** (Strata spine-tick + "↗"); clicking it — or ⌘K "Library", or the mobile drawer row — navigates IN rather than opening a sheet, centralized in the Drawer's `open-ledger` listener so all three entry points agree. A room-weight book reads "· here" when current.

**Slice 2 — the Library, first Room.** Three Strata-ruled shelves on the real catalog (`useLayerProducts` / `useLayerCounts`; layer enum `personal | studio | catalog`) — re-housed, data layer untouched. Capture lands raw in My Library (`useCaptureProduct`; verified end-to-end — the count ticked and the card appeared with its Promote CTA). Promote (personal→studio) reuses `PromoteToStudioModal`; nominate (studio→catalog) reuses `NominateToCatalogModal` from Studio cards (vendor resolved on click, studio from `useOrganizations`). Teaching in place: inline **Quick Tags** (a doc-grammar panel over `useStyleArchetypes` + `useAssignStyle`) and **Deep Analysis** as a paper sheet over the Room (`RoomSheet`) reusing the proven `StyleAttributionPanel` + `StyleSpectrumSlider` + `ClientMatchingPanel` → `useSubmitTeaching`. The foot compresses teaching to one quiet line (`useDesignerTeachingStats`); gamification (badges, daily-goal bars) stripped per R32/R37. The **librarian** input stands atop the Room (R38) but the ASK is deferred to slice 3 (the Engine) — present, honestly noted, no companion call. The old Teaching Queue page and the Products zone stay URL/⌘K-reachable (staged exile, D7).

**Flagged for the design session (none blocking slices 1–2):**
1. **Non-project Room time.** The library-room prototype's Hours sheet shows a "Sourcing · the Library" line, implying a Room logs its own time. The shipped time system is project-scoped and R39's physics list requires only putting the held *document* down — slice 1 does that and does NOT capture Library time. Wants a ruling if "studio time" inside a Room is intended.
2. **Via-Patina mark + Golden-Hour signal are derived, not columns.** The Catalog "Patina" mark renders off `layer='catalog'`; "needs teaching" renders off `teaching_queue` membership. Nothing invented; a distinct Via-Patina / Golden-Hour signal would need an additive read view (R30 territory).
3. **Foot stat granularity.** `designer_teaching_stats` is lifetime, not per-day — the foot reads "taught" (lifetime), not "taught today". A daily cut needs a new read.
4. **Grammar seam.** Promote / Nominate reuse the existing portal-grammar modals (functional, correct movement); a doc-grammar re-skin is a follow-up, not a slice-2 blocker.

**Next:** the L4 device check — the Library Room on Leah's phone (the Rooms physics are new, like the D13 walk) — before the Engine (slice 3). Screenshots ≥1280 were captured live; the local Chrome automation renders at a fixed ~1886px logical viewport, so the ~390px capture folds into the L4 device walk.

### I30 · Dissolve Track 3 — the Engine, a presence (R38, slice 3) — 2026-06-13

Continues `the-document/track3-rooms-library`. Migration **00208** (additive: `project_ffe_items.added_via`). type-check + lint green; live-verified end-to-end on real data (both homes → ask → real result-lines → Place → the "via the Engine" mark + SPECIFIED stamp on the FF&E line); adversarially reviewed (3 confirmed fixes, 2 false alarms refuted).

**The ask sources from the real catalog, not the companion edge fn — deliberately.** R38 says reuse `/portal/companion`'s backend, but the audit found its product extraction stubbed (`parseAIResponse` returns null) AND `companion-message` **persists** conversation (`companion_messages`) — which R38 forbids for the Engine ("no thread, no history; the ask does not persist"). So the Engine answers from a **non-persisting cross-layer catalog search** (`useCrossLayerSearch`) — the designer's own taught/captured shelves, which *is* Designer-Taught Intelligence. Only the **placement** persists. This honors the no-persistence rule, is reliable, and is locally verifiable (the edge fns aren't served in local dev — `useCompanionQuickActions` already treats them as optional). **Follow-up:** LLM-curated re-ranking via a NON-persisting companion path (Claude tool_use, no message write) is a one-line swap of the result-line source.

**⌘K (3a) — no mode.** A destination-like input filters documents/ledgers/actions (jump, unchanged); a non-empty query always also offers an **"Ask the Engine"** row (last option) — when nothing matches, it is the natural Enter target. Choosing it answers INLINE in the same paper panel: the R35 sweep while reading, then paper **result-lines** (real piece · maker · layer), each carrying **Place → [document]**. The held document (resolved from `/doc/[id]` via the desk data) is the place target; off-document, a quiet "Place into" picker of active projects. No route change, no persistence; "← results" / Esc steps back.

**The librarian (3b)** — the Library Room's standing input (replacing the slice-2 deferred stub) does the same ask-and-place inline.

**Placement + provenance.** `usePlaceInDocument` inserts a `project_ffe_items` line (mirroring the 00175 feed-through shape) with `added_via='engine'`; the FF&E `select('*')` carries it through and the line wears a quiet **"via the Engine"** mark (ffe-section). Dual-pricing honored (00185): `unit_price_cents` = client `price_retail` (the budget source of truth), `trade_price_cents` = `price_trade`.

**Review fixes (3 confirmed):** (1) HIGH — placement wrote trade cost into the client-price column (budget understatement); now mapped per 00185. (2) HIGH + (3) MED — `doPlace` lacked try/catch, so a team-member RLS rejection failed silently + leaked an unhandled rejection; now caught with an inline "you may not be the lead designer" message. (Refuted: the ⌘K Escape `stopPropagation` is correct; the ⌘K-results-have-no-toast is intentional — the inline "placed ✓" suffices and the bar stays open for a multi-place session.)

**Copy:** the Engine surfaces say "the Engine / Designer-Taught Intelligence," never "AI." `/portal/companion` is already nav-less post-flip (exiled, ⌘K-unreached); its legacy copy stays pending Stage-3 removal — it is NOT the Engine surface.

**Flags (none blocking):** the companion edge backend stays stubbed-for-products + persists, so the ask doesn't use it (above); R30's Via-Patina order-moment line into Accounts is slice 4–5; placed lines land `item_type='tbd'`, unassigned-room (designer assigns). **Next:** the Accounts book (R36, slice 4) + the Aesthete fold (R37, slice 5), then the Composing Page (R40, slice 6). The L4 device check (Rooms-shell physics, R39) is still pending.

### I31 · Dissolve Track 3 — the Accounts book, a Drawer Sheet (R36, slice 4) — 2026-06-13

Continues `the-document/track3-rooms-library`. Migration **00209** (additive: `invoices.ar_last_chased_at` + the `chase_invoice` RPC). type-check + lint + 36 desk-derivation tests green; **live-verified end-to-end on real data** (all three pages render; the overdue→Desk→chase→clear loop walked with INV-0001 temporarily backdated, then restored); adversarially reviewed (no critical bugs; 3 fixes applied).

**The book reuses the Billing data layer wholesale — no rebuild.** The audit found everything already shipped: `useInvoices` (Ledger), `useArAging`/`computeArAging` + `useSendInvoice({type:'reminder'})` (Receivables + dunning), `useEarningsStats` (Earnings). The book is a re-housing in document grammar, not a new data layer. The `accounts` LEDGERS entry (weight `sheet`, spine sage) already existed with a stub — slice 4 fills it. Three pages in the R28 grammar (DM-mono links, never tabs): **Ledger · Receivables · Earnings**; the I23 front-matter states **Revenue · A/R · margin**. Studio-eyes-only.

**No figure authored twice (R36).** Revenue (Σ `amount_paid_cents`) and A/R (`computeArAging` balance) come straight off invoice rows; the front-matter margin uses the SAME committed-line trade→client definition as the per-engagement Account Page (`useStudioMargin` mirrors `use-account-page.ts`, aggregated studio-wide, one query). The book is the sum; the R26 Account Page is the leaf (its `→ Accounts ↗` button already pointed here).

**The overdue receivable rises on the Desk via the R28-conflict precedent — no `document_state` surgery.** `buildDeskReceivables` (mirroring `desk-conflicts.ts`) classifies invoices client-side in `use-desk-engagements` and injects a `ReceivableSignal` map into `partitionDesk` (4th arg, like `conflicts`). A new `overdue_invoice` NeedKind (rank 1 — money owed sorts just under a blocking decision) carries `need.ledger` so the folder **opens the Accounts book onto Receivables** (the act surface) rather than the document — `folder-card` renders a button for ledger-acted needs. AR thresholds (`AR_OVERDUE_NEEDS_DAYS=1`, `AR_CHASE_COOLDOWN_DAYS=7`, provisional like the send weave) sit beside the R10/R22 set.

**One act clears both surfaces (R36 / R22).** The automated reminder cadence owns `last_reminder_at`/`ar_flagged_at` — a manual nudge must not perturb it — so the designer's chase gets its OWN stamp, `ar_last_chased_at` (00209, `chase_invoice` SECURITY DEFINER + ownership + status guard). The Receivables dunning act emails the reminder AND stamps the chase; the Desk need gates on overdue **AND** not-chased-within-cooldown, so chasing drops it (verified live: the PAST DUE folder cleared and Chen fell back to its next need). The Desk reads invoices under its OWN key (`['document-state','desk']`), so `doChase` invalidates `['document-state']` too — the Orders-book same-truck precedent.

**Review fixes (3):** (1) server-side status guard on `chase_invoice` (a direct RPC call can't stamp a paid/void invoice); (2) corrected the `useChaseInvoice` comment (it does NOT clear the Desk — the Receivables page does, separately) to kill a maintenance trap; (3) Ledger "owed" tail now only reads for issued receivables (a draft isn't owed). Also fixed a bare-DATE timezone off-by-one in desk-derivation's `fmtDay` (the invoice due_date rendered a day early).

**Open input carried forward (R37, §14.15):** the Earnings page builds the *What you earn* band on real earnings (design fees + Via-Patina commissions); the *What teaching returns* band + the twinned 25% Pledge are the Aesthete fold (slice 5). There is **no `teaching_royalty` earnings source_type and no stored commission/Pledge rate** in the schema yet — flagged here, to be wired from brand/marketplace config in slice 5 (render real-or-placeholder, never invent the rate).

### I32 · Dissolve Track 3 — the Aesthete fold (R37, slice 5) — 2026-06-13

Continues `the-document/track3-rooms-library`. **No migration** — the Pledge is a client-side read model computed from existing `designer_earnings`. type-check + lint green; **live-verified** (a test commission temporarily seeded then removed: $336 commission → $84 Pledge, R30's exact worked example, rendered twinned).

**The Earnings page now reads in two bands (R37).** *What you earn* (slice 4) gathers design fees + Via-Patina commissions; *What teaching returns* (new) gathers the Designer-Taught loop's income — the **two-sided 25% Pledge**. Each Pledge event renders the twinned, distinctly-labelled sub-lines — **returned to you** (sage) and **given to the commons** (clay) — never blurred; the brand-critical **"returned to you, YTD"** crescendo accrues at the band head. A one-line **teaching lens** ("N taught · $X returned → Library ↗") joins the front-matter beside Revenue·A/R·margin and links into the Library Room for the progress detail (R37: the monetary face here, the progress in the Library's foot).

**The Pledge is computed, not stored — 25% is confirmed, the commons split is NOT.** `pledge.ts`: `PLEDGE_RATE = 0.25` (R37/R30, confirmed). The Pledge = 25% × the Via-Patina commission (`product_commission` earnings — real). Per R30's worked example ("the Pledge returns $84 as teaching royalty") **returned-to-you = the full Pledge** (real, accrues YTD — satisfies the acceptance). `COMMONS_MATCH_RATE = null` (OPEN §14.15): the commons share renders "—" with a visible flag ("the commons share awaits brand config — never invented"). There is **no `teaching_royalty` source_type and no stored rate** — the structure is built to receive the config; nothing is invented.

**⚠ Open — needs design ruling (R30 vs R37 tension):** R30's example frames the Pledge as *returning* to the designer ("returns $84 as teaching royalty"), but R37 says "money she **contributes**" to the commons — i.e. the commons share may be carved OUT of her Pledge rather than a separate match alongside it. The build follows R30 (returned = full Pledge; commons = a separate, pending rate) so the YTD crescendo is real, but the commons mechanic (carve-out vs match) + its rate are the design session's to rule. Flagged, not silently chosen.

**Money-unit correction (caught in build):** the Track-3 audit map called `designer_earnings` money "dollars," but the schema (`net_amount` integer) and the live `/portal/earnings` page (`cents/100`) prove it is **CENTS**. The earnings surfaces format with `fmtUsd` (cents); the misleading `fmtUsdFromDollars` helper was removed. (Invisible at the seed's $0 earnings; a 100× error with real data — fixed before it shipped.)

### I33 · Dissolve Track 3 — the Composing Page (R40, slice 6) — 2026-06-13

Continues `the-document/track3-rooms-library`. **No migration** — reuses the shipped catalog tables. type-check + lint green; **live-verified** (entered from the Library; "Heirloom Oak Dining Table" by "Nordic Atelier" → the mark advanced to 17% / DRAFT off the fill; Save draft wrote a real `products` row, layer `personal`/status `draft`; test row removed).

**The anti-wizard, as a Room (R40).** `/compose` is a full-bleed paper Room (reuses RoomShell). The page is a paper artifact that **builds itself**: five sections fill in **any order**, each shows its own completion, and the piece is a usable draft at every percent. There is **no Next/Back/Step N of M** — the **Strata Mark is the only progress indicator**: the three movements map to the three lines (*the record* = identity + the piece → line 1; *the catalog* = commerce + the folio → line 2; *the eye* = the teaching → line 3), and the state band reads **Capture → Draft → Catalog-ready** off the same fill (`compose-progress.ts`, pure). A sticky live preview + the librarian's offer line (⌘K, never blocks) sit at the top.

**It writes a real catalog draft (no migration).** `useComposePiece` creates/updates a `products` row on the designer's own shelf (`layer 'personal'`, `status 'draft'`) — saveable at any completeness; `savedId` is held so re-saves UPDATE (no duplicates). The eye reuses `product_styles` (the same upsert `useAssignStyle` uses) — the exact Quick-Tags act of R32, here one section of the larger composition. **Percent-composed is DERIVED from what's filled** (the "draft/percent-composed read" the plan called for) — no stored progress column. Prices: the form takes dollars, persisted as integer cents (`price_trade`/`price_retail`); **min-order is dropped (no column)** — schema is authority. **Two-sided authorship** holds in copy (the maker fills price/lead time in their portal; the designer adds the eye); nothing is required to save.

**Nested-Room return (RoomShell `backTo`).** Compose is always reached from the Library, but `rememberRoomOrigin` no-ops on a Room path (the single origin slot holds the surface *before* the Library), so the leave read "← the Desk." Added an optional `backTo`/`backLabel` to RoomShell: a nested Room returns to its parent and leaves the stashed origin intact (so leaving the Library still returns to the real prior surface). `isRoomPath` now also covers `/compose`. Verified: "← the Library."

**The Composing Page is the pattern, not the one screen (R40).** This is the model's answer to the wizard/modal/multi-step form generally — `inline · sheet · room`, one grammar, three weights. Other "compose" surfaces adopt it as they arrive.

---

## Rulings — design session, 2026-06-13 (Track 3 review)

### R41 · Track 3 review — blessed, with rulings on the flagged calls and four fixes — 2026-06-13

Reviews the Track 3 build (I29–I33, slices 1–6 on `the-document/track3-rooms-library`): the Rooms shell + the Library, the Engine, the Accounts book, the Aesthete fold, the Composing Page. Built fast, additive-only (00208 `added_via`, 00209 `chase_invoice`), live-verified, each slice adversarially self-reviewed with fixes applied. The substance is sound; this ruling blesses it, rules the four designer-visible questions Claude Code raised, and names the gates to merge.

**Blessed as built:**
- **The Engine's no-persistence deviation (I30).** R38 said reuse `/portal/companion`; the audit found that backend *persists* messages — which R38 forbids ("the ask does not persist") — so Claude Code answered instead from a non-persisting cross-layer catalog search over the designer's own taught/captured shelves. That *is* Designer-Taught Intelligence, and choosing the rule over the instruction is exactly right. Blessed. The follow-up — LLM re-ranking via a non-persisting companion path (no message write) — is a code-only swap when wanted.
- **The Desk-receivable model (I31).** An overdue invoice rises as an `overdue_invoice` need (ranked just under a blocking decision) whose folder opens the Accounts book onto Receivables — the *act surface*, not the document — and the manual chase carries its own `ar_last_chased_at` stamp so it never perturbs the automated reminder cadence. One act clears both surfaces. The action test (R22) applied to money, done right. Blessed.
- The Composing Page writing a real `products` draft with **derived** percent (no stored progress column), the **cents** money-unit correction (a caught 100× error), and the derived Via-Patina / Golden-Hour signals (no invented columns) — all blessed as built.

**Ruling — the Pledge is a separate match on top (resolves the R30/R37 tension).** "Returned to you" is the **full 25%** — R30's $84 on $336 stands and the YTD crescendo is real; "given to the commons" is a **separate Patina contribution alongside it**, never a carve-out of her share. The Pledge is generative — it does not shrink what she keeps. Rates ship as **visible provisional defaults** (tune later, the send-weave precedent), wired as named constants and flagged in-product as provisional: `PLEDGE_RATE = 25%` (confirmed); `COMMONS_MATCH_RATE` provisional **10%** of the commission, clearly labelled provisional; the **Designer-Selections vs Style-Matches commission differential** is an upstream earnings/marketplace concern (provisional-equal until brand differentiates) — the document renders whatever commission lands and needs no change when the split is set. §14.15 stays open for the FINAL brand/finance numbers; the build no longer renders "—".

**Ruling — Room time is project-scoped in v1.** Rooms do not log time; the timer stays attached to project documents (I16 holds). Browsing/teaching in the Library is not billable project time, so the prototype's "Sourcing · the Library" Hours line is **deferred, not built** — "studio time" inside a Room is a deliberate later expansion, logged here as a known prototype-vs-build divergence rather than a silent drop.

**Ruling — the foot stat reads the day.** R32's foot line is "taught **today**"; the build's lifetime `designer_teaching_stats` is a stand-in. Add a per-day read so the foot reads the day's teaching, matching the prototype (F3).

**Ruling — Promote / Nominate may keep portal grammar for now.** The reused `PromoteToStudioModal` / `NominateToCatalogModal` are functional and the movement is correct; a document-grammar re-skin is a **follow-up polish, explicitly non-blocking** for the merge (F4).

**Fixes (F1–F4):**
1. **F1 — land the screenshots.** Track 3 committed none (only track-1/2 + the slice dirs exist). Capture and commit the ≥1280 set for each new surface — the Library, the Engine ask-and-place, the Accounts three pages + the Desk receivable, the Aesthete fold's twinned Pledge, the Composing Page; the ~390px set rides the L4 walk. The record cannot show its own surfaces until this lands.
2. **F2 — the provisional rate constants.** Wire `COMMONS_MATCH_RATE` (provisional 10%) and the commission handling as named, tunable constants beside the R10 / R22 / send-weave set; render the commons line as a real provisional number, flagged provisional in-product — never present a provisional as final.
3. **F3 — daily teaching read** (above): the Library foot reads "taught today," not lifetime.
4. **F4 — doc-grammar re-skin of Promote / Nominate** — follow-up, non-blocking.

**Gates to merge `the-document/track3-rooms-library` → main:** (1) the **L4 device check** — the Library Room, the Composing Page, and the Engine ask-and-place on Leah's phone (the Rooms physics are new, as the D13 walk was); GREEN means the shell is trustworthy for every future Room. (2) **F1 screenshots** landed. F2–F4 may ride the same PR or follow as a short polish slice; they do not block the merge. Rollback remains the pilot flag.

---

## Implementation decisions — Track 3 review fixes (2026-06-13)

### I34 · F1–F4 landed — the Track 3 review fixes — 2026-06-13

All four R41 fixes shipped on `the-document/track3-rooms-library`, additive-only,
behind the `the-document-pilot` flag, in one PR. Each was adversarially
self-reviewed (a 4-lens pass over the diff against the R41 rulings + D4 /
additive / flag constraints); the catches it surfaced are folded in below.

**F1 — the ≥1280 screenshot set landed.** `docs/design/the-document/screenshots/track-3/`
now holds 15 desktop (1440px) captures, live against real/seeded data: the
**Library Room** (shelves + librarian bar; the populated My Library) and its
**foot reading "Taught today · 1"** (F3); inline **Quick Tags**, the **Deep
Analysis** paper sheet, the **Capture** paper sheet; the **Promote paper
RoomSheet** (F4); the **Engine** ⌘K ask ("credenza") → result-lines → **placed ✓**
into Whitfield; the **Accounts** Ledger / Receivables (the overdue INV-0001 +
the chase) / **the Aesthete fold** (the twinned Pledge with the real provisional
commons figures — F2); the **Desk** PAST DUE receivable need; and the **Composing
Page** at 17% and 83% (the Strata Mark the only progress). The capture harness is
`apps/designer-portal/scripts/the-document-track3-shots.mjs` (the per-slice
convention). The **~390px set is NOT here — it rides the L4 device walk** (R41).

**F2 — provisional rate constants; the commons renders a real flagged number, no "—".**
`pledge.ts`: `COMMONS_MATCH_RATE = 0.10` (was `null`) + `COMMONS_MATCH_PROVISIONAL = true`
— named, tunable constants beside `PLEDGE_RATE` (the R10/R22/send-weave precedent).
`returnedToYou` stays the **full 25%** (R41: a separate match on top, never a
carve-out); `givenToCommons = commission × 0.10`. The Earnings band renders each
commons sub-line as a real number with an in-product **"provisional · 10%"** tag
and a band note ("the commons share is provisional (10%) — final rate awaits
brand config §14.15"). The **Designer-Selections vs Style-Matches commission
differential** is upstream earnings (provisional-equal until brand sets it) — the
document renders whatever commission lands, so **no document change is needed and
none was built** (R41/F2). §14.15 stays open for the FINAL brand/finance number;
wiring it later is a one-constant change, no rebuild.

**F3 — the Library foot reads "taught today."** Audit first (R41): `designer_teaching_stats`
is a lifetime base table and `teaching_sessions` is unused, so the daily cut is a
new additive read — `useDesignerTaughtToday()` counts distinct `product_styles`
rows the designer wrote today (the canonical Quick-Tags / Deep-Analysis target),
scoped to the designer's local day folded into the queryKey so it resets daily.
**No migration** (a date filter on existing rows sufficed). The review caught a
missing invalidation: `useAssignStyle` / `useSubmitTeaching` now invalidate
`['designer-taught-today']` so the foot's count refreshes with accuracy / matches
after a teach (verified live: the count ticked to 1). Accuracy and matches stay
lifetime quality measures.

**F4 — Promote / Nominate re-skinned as paper RoomSheets (non-blocking).** Both
shared modals gained an opt-in `asSheet` prop that renders the unchanged form
inside the Document `RoomSheet` (paper, flat edges, no shadow — D4; the
white-card wrapper dropped, padding de-doubled, Esc owned by the sheet) instead
of the portal-modal card. Default off — every existing portal caller (teaching
page, layer-view, promotion banner) is untouched; only the Library Room passes
`asSheet`. The movement (personal→studio, studio→catalog) and RPCs are unchanged.
Shipped in this PR though R41 made it non-blocking.

**Local demo seed:** `scripts/the-document-track3-demo-earnings.sql` (dev-only,
idempotent) seeds for `designer@patina.dev` the Via-Patina commissions + design
fees the Aesthete fold renders, one raw My Library piece (for the Promote shot),
and flips INV-0001 overdue (the Desk/Receivables need). These are **real rows the
document renders truthfully** — no figure is mocked; the Pledge arithmetic is
computed from them.

**Merge status:** F1 + F2 landed (the two merge-gating fixes), F3 + F4 ride the
same PR. The remaining gate is the **L4 device walk** (human, Kody + Leah — the
~390px captures get taken there). Do not merge until L4 is GREEN.

---

## Pilot record — the L4 device walk (2026-06-14)

### L4 · Leah's phone — the Rooms shell + Track 3 surfaces — 2026-06-14

**Gate:** the R39/R41 device check — the Rooms **physics** are new (a full-screen
paper place you *walk into*), so they get validated on a real phone before they're
trusted for every future Room. Per R41 the walk covers **three** surfaces: the
Library Room, the Composing Page, and the Engine ask-and-place.

**Build under test:** `the-document/track3-rooms-library` incl. the F1–F4 commit
(`22006e8a`) — reached on Leah's phone via a local tunnel to :3000, so the "taught
today" foot (F3), the paper Promote/Nominate sheets (F4), and the live Engine were
all present in what she tapped. Flag default-on; rollback = the toggle.

**Signal: GREEN — all three surfaces, clean.**
- **The Library Room** — GREEN. The Rooms physics held one-handed: the doorway
  read as walk-in vs pull, full-bleed paper, the Drawer persisted, no
  shadow/zone/badge, walking in put a held document down (timer chained out),
  capture + teach worked in place, leaving returned to origin.
- **The Composing Page** — GREEN. Sections fill in any order, the Strata Mark is
  the only progress, a usable draft at every percent, saved.
- **The Engine ask-and-place** — GREEN. The ask returned real paper result-lines
  and Place dropped a piece into a document. (The librarian is no longer inert —
  the slice-2 deferred stub is closed.)
- **Reduced motion** — GREEN. Run with Reduce Motion on: enter/leave fell to
  plain fades, the put-down veil skipped, nothing janked or was lost.
- **Findings:** none — a clean green. No physic felt off; nothing to route back.

**The ~390px set landed (F1 closeout).** The walk is where the mobile frame gets
taken (desktop automation couldn't — fixed viewport). Committed 14 ~390px
captures (`screenshots/track-3/mobile-*.png`) generated via the capture harness at
a 390px viewport (`SHOT_W=390 SHOT_H=844 SHOT_PREFIX=mobile-`), corroborating the
green walk: the Library Room, foot, Quick Tags, Deep Analysis, Promote sheet, the
Engine ask→placed, the Composing Page, the Desk receivable, and the Accounts
pages all render in mobile form. **Harness-render note (NOT a gate failure, device
walk was green):** at a strict 390px headless frame the *overlay* surfaces (the ⌘K
command bar, the ledger DocSheets) and the Room head action row sit a touch wide —
right-edge content (e.g. the commons dollar figure on the Aesthete fold, the
"Capture" head button) clips. Full-page surfaces (Library, Compose, Desk) are
clean. Confirm the overlay width on a real device in a later mobile-polish pass;
note that Accounts was a bonus capture, not one of the three walked surfaces.

**Disposition:** the L4 gate is **satisfied** — the last merge gate for
`the-document/track3-rooms-library` → main. With F1 + F2 landed and L4 green,
**Track 3 is cleared to merge** (PR #13 marked ready for review; the merge itself
is Kody's / a reviewer's call). After merge: deploy migrations 00191–00209,
surface week-one flight telemetry at the next review.

---

## Rulings — design session, 2026-06-14 (Proposal Authoring + Desk integration)

> Source: the approved prototypes (patina-proposal-authoring-prototype.html primary)
> and the Feature Gap Matrix (portal-vs-desk-feature-gap-matrix.md), Proposals zone.
> Closes the matrix's #1 P0 gap: proposal authoring (20 absent capabilities).

### R42 · The Drafting Room — proposal authoring as a Room — 2026-06-14

Resolves the matrix's largest gap: the legacy 8-tab Scope Builder
(/portal/proposals/[id]/scope) and the block-based section editor
(/portal/proposals/[id]) are reconceived, not ported. **Proposal authoring
is a Room** (D14) — "The Drafting Room" — entered from the Proposal section
of a document, never a top-level zone. Inside, the eight scope-builder tabs
become **eight facets that compose in any order** (R40 anti-wizard): Rooms
in scope · FF&E schedule · Palette · Mood boards · Phases & fees ·
Exclusions · Payments · Change-order terms. **The Strata Mark is the only
progress** (R35) — no "step N of 8" — filling across three movements:
*scope* (Rooms + FF&E, line 1) · *the offer* (Phases, Exclusions, Payments,
Terms, line 2) · *the vision* (Palette, Boards, line 3). Each facet is a
checkable section showing its own completion and summary; draft saves at any
percentage (the proposal is a real, usable draft throughout). The drawer bar
persists inside (D8) — the Library is one tap away for FF&E selections.
Declined from scope: a wizard stepper, hard gates between tabs, a separate
"generate" step (see R43).

### R43 · The live proposal — generate-as-you-compose — 2026-06-14

Resolves "Generate Proposal from Scope" (matrix ABSENT) by dissolving it.
There is no generate button. The Drafting Room shows a **live proposal
preview** (right rail) that builds itself as facets fill — "Sarah's copy" —
rendering rooms, palette, pieces, exclusions, and the investment total in
client-mirror grammar (NO cost breakdown, NO margin, NO TBD logic; CI-tested
exclusion per R27). The full client view opens via the existing client
mirror (R27). The FF&E schedule carries the three line types from the
lead→proposal flow as canonical: **Fixed** (a specific piece at a set price)
· **Allowance** (a budget for a category not yet chosen) · **TBD** (to be
determined), tap-to-cycle. Section editors (Concept/Space Plan/Selections/
Investment/Timeline/Terms — all matrix ABSENT) are the facet editors; asset
uploads (mood boards, palette, space plan) clip via the Folio (R24).

### R44 · Send and revise — letterhead instrument + supersede — 2026-06-14

Resolves "Send Proposal to Client" and "Revise Proposal (Supersede/Clone)"
(both matrix ABSENT, P0). **Send is a letterhead instrument** (R27 family):
a sheet carrying recipient, CC, expiry, and a personal note (the matrix's
/send ClientPicker form), flowing into the client mirror and the
signature-as-decision (R23). Sending a proposal does NOT mutate the sent
copy thereafter. **Revise creates a new version:** "Sarah asked for a
change" opens a revise sheet showing her feedback on v1, then opens **v2**,
which **supersedes v1 and carries the feedback forward** (the matrix's
useCreateProposalRevision); v1 is kept in version history on the document,
never deleted (D7). Signature settles the Proposal section and opens the
Project in the same document — nothing converts (R23, the lead→proposal
spine). Proposal *list/filter* and *tracking dashboard* (matrix ABSENT) stay
TRANSFORMED into Desk need-derivation and the margin, per the matrix's own
"TRANSFORMED ≠ gap" caveat — not rebuilt as zones.

### R45 · The proposal on the Desk — lifecycle tiers — 2026-06-14

Defines how an authoring/sent proposal surfaces on the Desk, completing the
thread from Drafting Room to Desk. The Desk's two populations (R1/R22)
classify a proposal by its lifecycle state, derived — never a list:
- **Drafting, actively** → quiet; nothing waits, nothing shows.
- **Drafting, untouched** past a threshold → an **in-motion chip**
  (`drafting` kind) — one quiet line ("Aspen Loft — drafting, untouched
  3d"), awareness tier, no urgency stamp.
- **Sent, unopened ≥1 day** → an **in-motion chip** (`sent_unopened`) —
  awareness tier; the client hasn't acted, no hand needed yet.
- **Hesitating** (opened, no signature past the R10 threshold) → **promotes
  to a needs-your-hand FolderCard** (`hesitating_proposal` need-line — "sent
  6 days ago, opened twice, no signature"), because a nudge is the available
  act (passes R22).
- **Signed** → the folder resolves; the engagement re-enters the Desk as a
  **project** with its first real need. The Drafting Room's send is the hinge
  that drives this whole chain.
The Drafting Room is reachable only through the document (Desk → folder →
document → Proposal section → the Room doorway), consistent with D14/D1.

### I35 · Track 4 — Proposal Authoring built (R42–R45) — 2026-06-14

Proposal authoring landed as one program on `the-document/track4-proposal-authoring`
(off `origin/main` f70de9df, which already carries Track 3). Closes the gap matrix's
#1 P0 gap. **Audit-first finding:** the data layer was far more complete than "20
absent" implied — all `proposal_*` tables, hooks, and the `send_proposal`/
`clone_proposal`/`activate_proposal_as_project` RPCs already existed; this was
mostly a new *surface* over existing data (like the Library Room).

**Migrations (additive, D7):** `00210` — `sign_proposal` (SECURITY DEFINER, client-
invoked): one transaction settles an `approval` `client_decision` (R23), flips the
proposal to `accepted`, logs a `signed` engagement, and auto-activates the project
(the §5 one-act-many-surfaces invariant, modeled on `send_weekly_pulse`); idempotent
via the `accepted` short-circuit + a partial unique index on
`(linked_proposal_id) where decision_type='approval'`. Also `request_proposal_change`
(client feedback capture). `00211` — `document_state` gains `proposal_updated_at`
(greatest of the proposal + its child rows) for the R45 drafting-untouched tier.

**Sign→project ruling (Kody, this session):** `sign_proposal` ships parameterized
(`p_auto_activate`, default **true**) — the project opens the instant the client
signs (R44 "nothing converts"); the existing `proposal_signed` "Signed — open the
project" Desk folder is **retained as a safety net** (fires only if activation is
deferred). Revisit with Leah whether to keep the two-step ever available.

**Surfaces:** the Drafting Room (`/drafting/[proposalId]`, a RoomShell tenant
cloning the Composing Page) — eight facets (the reused scope-builder editors)
composing in any order, the Strata Mark (`draftingFill`, three movements:
Scope/The Offer/The Vision) as the only progress, FF&E Fixed/Allowance/TBD tap-to-
cycle, and a NEW proposal-grain live client mirror (`proposal-mirror.tsx`) — the
shipped `client-mirror.tsx` was project-grain, so a parallel projection + its own
CI contract test was added (excludes cost/margin/TBD, R43). Send/Revise are
`DocSheet` overlays (`ProposalInstruments` on the document's Proposal section: a
doorway into the Room for drafts; Send/Preview/Revise + version-history once live;
D1 — the document never unmounts beneath). The client sign route now calls
`sign_proposal` while keeping the `proposal-sign-confirmation` email (the RPC does
not send it). Desk (R45): `deriveMotion` gates drafting (actively-drafting = quiet;
untouched ≥ threshold = a `drafting` chip), typed `MotionKind`.

**Verification:** `00210`/`00211` apply clean on a fresh `db reset`; functional SQL
smoke green (sign creates exactly one approval decision + a project, idempotent on
re-sign); both portals type-check with **zero Track-4 errors** (260 designer + 91
client errors are all pre-existing email/scans/msw noise); 186 document/Desk Jest
tests pass incl. the two new contract suites. **Live Chrome walk GREEN** against
real seed data: the Desk shows the accepted proposal as a *Signed — open the
project* folder, the sent one as a *sent, unopened 1d* chip, and a fresh draft
correctly absent (actively-drafting = quiet); the draft document shows the
*Into the Drafting Room ↗* doorway + *Send* instrument; the Room renders the
three movements, the Strata Mark (17% drafted), and the live *Client's copy* rail
excluding cost; the Send sheet opens as an overlay over an intact document.

**Provisional / needs-Leah (shipped truthful, revisit):** `DRAFTING_UNTOUCHED_CHIP_DAYS`
= 3d (provisional, like the send-weave constants); the hesitating-proposal copy
ships as "Opened {date} — no signature yet" (the matrix's "opened twice" is not
backable — only `proposal_viewed_at` first-open is tracked, no open-count); revise
supersedes **on send** (v1 stays a real option until v2 ships); the Room's facet
display order is Scope → The Vision → The Offer (movement labels L1/L3/L2) — a
Leah-facing ordering call, flagged. **Known follow-ups:** `screenshots/track-4/`
not auto-captured (Chrome automation can't reliably save files — manual ≥1280 +
~390px pass pending); the `['desk-engagements']` invalidation is a harmless no-op
(real key `['document-state','desk']` is prefix-covered). NOT yet merged; prod
deploy of `00210`–`00211` rides the pending `00191`–`00209` deploy (migrations
before app).

---

## Rulings — design session, 2026-06-15 (Track 5 — Project Coordination · the ball-in-court)

> Opens Track 5 of the Dissolve. **Project Coordination generalizes
> `client_decisions` in place** — an RFI, a submittal, a sign-off, and a punch
> item are all a decision with an owner (a court). The table is the widened
> `client_decisions` (coordination_kind · court · blocks_kind are new columns,
> orthogonal to the existing decision_type/decision_kind axes), the option child
> is `client_decision_options`, the resolve path is the one-tx SECURITY DEFINER
> `resolve_coordination_item`, and the read models are
> `coordination_court_summary` / `task_blocked_state`. All work is **additive,
> D7-clean — migrations 00212–00220**; the old decision/FF&E/phase machinery is
> untouched and reads truthfully through the reused `blocking_status` axis. The
> canonical look/feel reference is
> `docs/design/the-document/patina-project-coordination-prototype.html`. These
> rulings open the build; the the-document-spec.md Track-5 fold is owed post-merge
> (R54).

### O7 (Track 5) · Quiet inline confirmation vs. toast for coordination acts — 2026-06-15

> NOTE: an earlier O7 (the PO send/expedite weave) was opened and RESOLVED at R18
> on 2026-06-12. This is a distinct Track-5 open item that the session opened and
> resolved in the same sitting (R51); logged here to keep the O-number trail honest.

**Conflict:** the coordination acts (resolve / nudge / extend / reassign /
resubmit) are mutations that a SaaS reflex would confirm with a toast. D2 forbids
anything breaking through by default, and the document's whole grammar answers
"did that work?" by the surface itself changing — the stamp, the court bar count,
the margin row — not by a transient overlay shouting it.
**Proposed resolution:** the acts confirm by the surfaces updating in place (the
one-act-many-surfaces invariant, §5) and at most a quiet inline "recorded ✓"
beside the act; never a toast.
**Resolved by R51.**

### R46 · Tracked parties — GC and vendor courts without a login — 2026-06-15

The ball-in-court needs four courts (designer / client / gc / vendor), but a GC or
a vendor has no Patina login in v1 and onboarding one is not Track 5's job.
**Parties are tracked, not authenticated.** `project_parties` (00212) holds a
GC / vendor / client_rep / other per project — display name, company, email,
phone, optional `vendor_id` — and `profile_id` is **NULLABLE**: a v1 party does
NOT log in. The designer records the party's move on its behalf through
`resolve_coordination_item` (the same one-act path a designer uses to record a
client's pick, R11). This is additive and forward-compatible: giving a party a
real login later is a flag flip (set `profile_id = auth.uid()`, the party then
reads its own court via 00217's party-self read path), never a migration. The
court bar groups open items by court so the designer sees, at a glance, whose move
each item is waiting on — even when "whose move" is a party who will never sign in.

### R47 · RFI answer authority — the designer writes, the GC court is tracked — 2026-06-15

An RFI's answer is the designer's to record. The RFI sits with the GC court while
open (`court='gc'`, the question is theirs to answer); resolving it WRITES the
`answer` and stamps `answered_by` / `answered_at`, and the default ball hand-off
returns the item to the designer's reading (`next_court_for`: rfi → gc while open,
designer on resolve). Because the GC is login-less in v1 (R46), the answer is
**designer-recorded** — the designer captures the GC's reply through
`resolve_coordination_item` exactly as a client's pick is recorded. The authority
to settle the item is the designer's; the court column tracks accountability (whose
answer this is), not write access. No new write surface for GCs ships in v1.

### R48 · The submittal split — vendor resubmits, only the designer approves — 2026-06-15

A submittal is a review loop, not a one-shot answer, so its two moves are split
across two acts and two parties. **A vendor resubmit creates a new
`coordination_item_revisions` row** (Rev-N history, 00214) via the RPC-only
`submit_coordination_revision` — the revisions table carries no broad write policy,
so a round can only be added through the function; **the item stays `pending`** (a
resubmit does not resolve anything — it puts a fresh revision in front of the
designer). **Only the designer approves a revision and resolves the item:**
`resolve_coordination_item` takes the approved `revision_id`, marks that revision
approved, and settles the submittal. The two acts never collapse into one —
submitting is the vendor's move (designer-recorded in v1, R46), approving is the
designer's. This is why the submittal carries its own RPC write path while the
other kinds resolve through the shared dispatch.

### R49 · The punch two-step — open with the GC, close by designer verify — 2026-06-15

A punch item is two moves: the GC fixes it, the designer verifies the fix. While
open the punch sits with the **GC court** (`court='gc'` — the fix is theirs).
**Resolving is the designer's verify-and-close step:** the resolve records the
verification note and the designer steers the ball home with the
`p_next_court` override (gc → designer) rather than the kind's default — the punch
does not auto-return, the designer's act is the closure. This is the one place the
explicit `p_next_court` argument earns its keep: a punch's "done" is a designer
assertion ("I checked it"), not a status the GC can set. Until that verify, the
punch stays an open GC-court item carrying its state.

### R50 · One thread per item — `comms_threads.coordination_item_id` — 2026-06-15

A coordination item's conversation — the back-and-forth on an RFI, the notes across
submittal rounds — lives in **ONE canonical thread** anchored to the item via
`comms_threads.coordination_item_id` (00216, partial unique index: one thread per
item). The item row's preview reads the latest post on that thread; the per-item
margin/row surfaces all point at the same thread, so the conversation never
fragments across the item's life. **`decision_comments` is retained for
back-compat** — existing decision comments keep working untouched (D7); the new
thread link is additive and the legacy comment surface coexists. New coordination
conversation flows through the one thread; old comment history stays readable where
it already lives.

### R51 · Quiet inline confirmation, never a toast (D2) — resolves O7 (Track 5) — 2026-06-15

A coordination act confirms by the document changing, not by an overlay shouting.
The resolve/nudge/extend/reassign/resubmit acts fan out across their surfaces in
one transaction (the §5 one-act-many-surfaces invariant) — the item's status, the
court bar's per-court count, the dependent task flipping blocked→todo, the margin
row — and **that visible change IS the confirmation**, optionally joined by a quiet
inline "recorded ✓" beside the act. **No toast, ever** (D2: nothing breaks through
by default). This is the same discipline the ⌘K ask-and-place follows (I30, the
inline "placed ✓" with no toast) and the no-badge ledger discipline (D8): the
surface answers "did that work?" by being true, not by interrupting. O7 (Track 5)
RESOLVED.

### R52 · Block-on-phase unlocks, it does not auto-advance — 2026-06-15

A coordination item can block FF&E, a task, or a phase (`blocks_kind`), mapped onto
the existing `blocking_status` axis so the legacy machinery and the Desk need-lines
read truthfully. **Resolving a blocking item UNLOCKS what it gated — it does not
advance the project's phase.** Clearing an FF&E block lets procurement proceed;
flipping a blocked task to todo lets the work resume; clearing a phase block lifts
the gate — but the phase advances only when its own gate is granted. The one
exception is the **sign-off**, which keeps its existing settle path: a sign-off is
an approval gate (R23) and its settlement still advances the project's real
vocabulary through the 00204 trigger, unchanged. Coordination unblocks; only the
gate-as-decision (the sign-off) settles a section. The distinction keeps "the GC
answered the RFI" from silently moving the project forward.

### R53 · Cycle prevention — DB self-reference only; multi-hop is app-side for v1 — 2026-06-15

The dependency web (an item blocks an FF&E line / a task; a task can be blocked by
an item) can, in principle, form a cycle. **The database enforces only the direct
self-reference guard** — an item cannot block itself, a task cannot depend on its
own blocker in a one-hop loop — because that is the constraint a trigger can hold
cheaply and correctly. **Multi-hop cycle detection (A blocks B blocks C blocks A
across mixed item/task edges) is handled app-side for v1** — the create/resolve
surfaces refuse to wire an edge that would close a longer loop. Pushing full
transitive-closure cycle detection into the database is deferred; the v1 webs are
shallow (an item gates a few lines or a task), the app-side check covers the real
shapes, and the DB self-ref is the floor that nothing can slip past. Promote to a
DB-side closure check if real coordination webs ever grow deep enough to need it.

### R54 · The Track 5 prototype is the canonical reference; the spec fold is owed — 2026-06-15

`docs/design/the-document/patina-project-coordination-prototype.html` is the
canonical look/feel reference for Project Coordination — the court bar, the
kind-grouped coordination band, the per-item rows, the resolve/nudge/extend/
reassign/resubmit acts, and the quiet-inline confirmation (R51) all read from it,
exactly as the Library and Composing Page prototypes governed Track 3. The
**the-document-spec.md Track-5 fold is owed post-merge** — the rulings R46–R54 and
the I36 implementation note land in the spec body at the next cut (alongside the
§14.15 open items still carried from Track 3), with the coordination_kind/court/
blocks_kind axes documented against §6 (stamps) and §11 (the presentation-layer
contract). Until that cut, this log plus the prototype are the authority; any
designer-visible call returns with screenshots per the standing protocol.

### I36 · Track 5 — Project Coordination built (R46–R54) — 2026-06-15

Project Coordination landed as the verified foundation
(`packages/supabase/src/hooks/use-coordination.ts` + migrations 00212–00220) plus
the designer surfaces, on `the-document/track5-project-coordination`. Built
additive-only (D7) — `client_decisions` is widened in place, never forked.

**`coordination_kind` is a NEW third axis, orthogonal to the two that already
existed.** The codebase carried `decision_type` (00084) and `decision_kind`
(00202); Track 5 adds `coordination_kind` (selection · rfi · submittal · signoff ·
punch) as a separate column (00213) and **leaves both prior axes untouched** — so
the existing gate logic (decision_kind 'approval' = R23's sign-off gate) and the
existing choice logic (decision_type) keep working unchanged. A coordination item
rides `decision_kind='choice'` and carries its real shape on the new axis; the
sign-off is the bridge (coordination_kind='signoff' is a decision_kind='approval'
gate, R52). `court` and `blocks_kind` join it (00213); `blocks_kind` maps onto the
reused `blocking_status` axis (ffe→blocks_procurement, phase→blocks_phase,
task/none→non_blocking) so the legacy FF&E/phase machinery and the Desk need-lines
read truthfully with zero edits.

**Submittal revisions are RPC-only-writable.** `coordination_item_revisions`
(00214) has no broad write policy; a Rev-N row can be added only through
`submit_coordination_revision` (R48) and the item stays pending. Approval/resolve
flows through `resolve_coordination_item` (00218, SECURITY DEFINER), which
dispatches by kind, then in the SAME transaction clears FF&E blocks, flips
downstream tasks blocked→todo (00215 `blocked_by_item_id`), and shifts the ball via
`p_next_court` / `next_court_for` (R47/R49). The one-act-many-surfaces fan-out
(§5) is the resolve hook's invalidation pass (coordination-items + section-tasks +
margin-items + document-state + project-decisions + FF&E), with an optimistic
cascade preview (the item resolves, its dependent tasks unblock) and rollback.

**GC/vendor courts are login-less, so the existing notify covers all kinds.**
`project_parties.profile_id` is nullable (R46); a v1 GC/vendor never signs in, the
designer records its move. Because no new external actor receives notifications,
the shipped client+designer notify path (`notify_decision_required` /
`notify_decision_resolved`, 00173/00174 + the overdue cron) already addresses
every party that can act — the client when the ball is in their court (they read
their coordination items through the SAME `designer_clients.client_id=auth.uid()`
RLS that already let them read decisions), and the designer otherwise. **00220 is
therefore an intentional NO-OP** — a documentation migration confirming the notify
coverage rather than adding DDL; every coordination_kind is already a first-class
citizen of the decision notify path. Read models: `coordination_court_summary` /
`task_blocked_state` (00219); one thread per item via
`comms_threads.coordination_item_id` (00216, R50). Migrations now **00191–00220**.

---

## Rulings — design session, 2026-06-15 (The Decision Composer — the authoring half)

> Closes the Feature Gap Matrix's **Decisions zone #1 P0 cluster — composition.** The read/act half is already FULL (margin `DecisionBody`, override-consent, nudge) and Track 5 (R46–R54, I36) generalized the decision in place (coordination_kind · court · blocks_kind) and built the resolve cascade. What remained absent is the **authoring** half — creating, building, and publishing a decision from inside the Document. These two rulings build it, ratifying `patina-decision-system-prototype.html` (the composer depth) against `portal-vs-desk-feature-gap-matrix.md`. The project-coordination half of the original decision-system package is NOT re-ruled here — it shipped as Track 5. Source/look-feel: `patina-decision-system-prototype.html`; build foundation: Track 4 (the Drafting Room sheet machinery, R42–R45) + Track 5 (the widened `client_decisions`, R46–R54) + the Composing Page's fill-in-any-order grammar (R40).

### R55 · The decision composer — create / build / publish from the margin — 2026-06-15

Resolves the Decisions zone's seven P0 composition rows. The legacy create/edit surfaces — `/portal/clients/[id]/decisions/new`, the `DecisionComposerModal` on project detail, the `DecisionNewPicker` "+ New" picker, `/portal/decisions/[id]/edit` — are reconceived as **one composition sheet**, opened from the margin ("+ New") or from a project section, never a full-page modal or a separate route. It reuses the editing-mode sheet machinery from Track 4 (the Drafting Room / proposal instruments) and the Composing Page's grammar (R40): the sheet composes **in any order**, shows its own gaps, and is a savable draft at every point.

The sheet composes: **decision_kind** (the taxonomy — Material/Color · Product · Layout · Finish · …) · **title** · **context** (the client-facing explanation) · **options** via a `DecisionOptionBuilder` carrying full attributes (name, price, quantity, image/swatch, designer note, the recommended "pick") · **materialize options from the Library** (the draft-product-seeding path, `useMaterializeDraftOptions` — the librarian seeds options one tap away) · **due date** · **link to a project phase** · **blocking** (a toggle plus the FF&E line it gates). The **lifecycle** is draft → publish → delete: save as **draft** (unsent, client-invisible, editable in the margin — `useCreateDecision` / `useUpdateDecision`); **publish** to the client (draft→pending, `usePublishDraftDecision`); **delete** (destructive). Editing an unsent draft re-opens the composer on it.

**The authoring side of the one-act invariant (§5):** publishing a *blocking* decision lights the `decision_due` stamp on its FF&E line the instant it goes pending — the mirror image of Track 5's resolve cascade (which clears the stamp and unblocks procurement). The clearing/resolve half is Track 5's `resolve_coordination_item`, unchanged; this ruling owns only the create→publish→light direction.

**The composer is the authoring front door for the generalized item, too.** A selection is the default decision; an RFI, submittal, sign-off, or punch (Track 5's coordination kinds) is *composed* through this same sheet — the composer writes the row, Track 5 resolves it. One create-surface, one resolve-path. Declined from scope: a full-page composer, a modal, a separate "+ New" picker route, decision *analytics* (P2), and internal-only designer notes surfaced in the client-visible margin.

### R56 · The enriched decision detail — the deep margin sheet — 2026-06-15

Resolves the dozen PARTIAL Decisions rows by deepening the read-only margin `DecisionBody` into an expandable sheet — in the **designer's** view, not only the client mirror. It adds: the **decision_kind** on the kind-line; the **rich context** (ported from the client mirror to the designer's view); **full option attributes** (price, quantity, imagery, designer note, the "Your pick" recommended badge — previously option names + badges only); the **status lifecycle** made legible (draft / pending / overdue / responded / resolved); **extend + nudge** controls when pending or overdue; and the **full resolution audit trail** (choice, recorded-by, consent method, evidence, timestamp — previously a quiet "Resolved · date" line only).

The two FULL flows are **preserved verbatim**: apply **designer override** (`useApplyDecisionOverride` — option select → consent-method radio verbal/written/text/email → evidence → Record) and **send reminder** (`useSendDecisionReminder`). Both keep the one-act-many-surfaces invariant (§5): a record updates the margin item, the Desk need-line, and the FF&E line stamp in a single act. Discussion stays **transformed** into the project comms thread (R27) and the one-thread-per-item model (R50, Track 5) — never a per-decision feed. Decision analytics (P2) and internal designer notes stay out of the Document.

### I37 · Track A — the decision composer built (R55) — 2026-06-15

The audit confirmed what the handoff predicted: R55's "front door for Track 5" was **already built**. Track 5's `ItemComposer` + `useCreateCoordinationItem` already compose all five kinds, draft/publish, materialize Library options, and — crucially — already set `project_ffe_items.blocked=true` + `blocked_by_decision_id` on gated lines (the exact write that lights `decision_due` once status flips to pending). So R55 = **generalize-and-extend the existing composer + give it a margin home**, not a rebuild. One create-surface, one resolve-path, literally.

**Built (additive, NO migration — new sheet surfaces + 3 hooks over the existing data layer):**

- **`ItemComposer` generalized** (`components/document/coordination/item-composer.tsx`): added the **FF&E-line gate** picker (the missing R55 piece — selecting FF&E lines sets `blocksKind='ffe'` + `blockedFfeItemIds`, which lights the stamp on publish), the **subject-matter taxonomy** chips, a **separate client-facing context** field (R55 lists title *and* context), the **phase link** (`phase_id`, hidden when a project has no phases), and **edit mode** (hydrate a draft → update → optionally publish; "EDIT DRAFT" header). The blocks-kind ladder is a tested pure helper `deriveBlocksKind` (ffe > phase > task > none).
- **Margin "+ New"** (`margin-rail.tsx`): a "+ New" affordance beside "+ Note" opens the composer as a `DocSheet` (document stays mounted, D1; zero shadow, D4), gated on a resolved `designer_clients.id` (the band's `useDesignerClientForClientUser` pattern — the historical RLS-bug guard). A **"Drafts · N"** disclosure lists unsent drafts (read from `useCoordinationItems` filtered to `status='draft'`); clicking one re-opens the composer in edit mode. Threaded `clientUserId` from `doc/[id]/page.tsx`. The band's "+ New open item" gets the same enriched composer.
- **Three lifecycle hooks** (`use-coordination.ts`): `useUpdateCoordinationItem` (patch + option-replace + FF&E/task re-tag), `usePublishCoordinationItem` (draft→pending with the §5 invalidation set the legacy `usePublishDraftDecision` omits), `useDeleteCoordinationItem` (clears the dependency web first so no line is stranded blocked, then deletes). `CreateCoordinationItemInput` gained `decisionType` + `phaseId`.

**Reconciliations (implementation-authority calls; surfaced here per the workstream):**
1. The handoff's *"decision_kind taxonomy (Material/Color/Product/Layout/Finish)"* maps to the **`decision_type`** column (00084), **not** the literal `decision_kind` column (00202: choice|approval, the section-gate axis — left at 'choice', untouched). "Finish" folds into the existing seven values (no CHECK-redefine migration).
2. **Light-on-publish**: a draft sets `blocked=true` at create but the stamp stays dark (status='draft'); publishing flips status→pending and the stamp lights — no new stamp logic, just the two ends of `project_ffe_items.blocked` (R55 owns the light; Track 5's `resolve_coordination_item` owns the clear).
3. Phase link writes the real FK `phase_id`, not the legacy free-text `linked_phase`.

**Verified:** designer + supabase type-checks clean (Track-A files zero errors; only the pre-existing `packages/email` React-18/19 noise remains); `deriveBlocksKind` unit 25/25; a self-rolling-back **SQL smoke** proving draft(dark)→publish(lit)→`resolve_coordination_item`(cleared); and a **LIVE CHROME WALK GREEN end-to-end** on Olsen Lake House (`b65803e7-…`, designer@patina.dev): margin "+ New" → compose a blocking selection gating *Cloud Pendant Cluster 19* → **Publish lights the `DECISION DUE` stamp** + the court bar, the open item, and a margin decision all update in one act → **record the pick → the stamp clears to SHIPPED, the court empties, FF&E returns to 3-of-3, the margin folds to Settled** (one act); plus save-as-draft → "Drafts · 1" (client-invisible) → re-open hydrated → delete (inline two-tap confirm). Demo aid: `scripts/the-document-decision-composer-demo.sql` (wires Olsen a client so the composer resolves).

⚠ **Owed / notes:** screenshots-to-disk + the ~390px mobile fold (the `save_to_disk` no-file env constraint, as Track 5 — captured in-conversation only); during the walk two **local-only** infra artifacts surfaced and were cleared by a PostgREST restart (a stale schema cache blocking writes, and the Track-5 `project_parties` RLS-recursion noise — both fixed on `main`, not code); **Track B (R56)** — the enriched margin `DecisionBody` — is the next PR.

### I38 · Track B — the enriched decision detail built (R56) — 2026-06-15

Deepened the read-only margin `DecisionBody` (`components/document/margin-bodies.tsx`) into the enriched detail, in the **designer's** view (not only the client mirror). **No migration** — the body already reads the full `client_decisions` row via `useDecision` (`select('*, options(*)')`) and the trail via `useDecisionOverrides`; nothing in the schema was missing.

**Added** (the dozen PARTIAL Decisions rows): a **kind-line** (the subject `decision_type` · the shape+court when not a plain client selection · an approval-gate note · the lifecycle word); the **rich context** (the `decision.context` paragraph, the client-mirror pattern ported to the designer view); **full option attributes** (image swatch · name · `fmtUsd(price·qty)` · ×qty · designer note · the "your pick"/"chosen" badges — was option names + badges only); **status lifecycle** made legible (pending / overdue / resolved / expired); and the **full resolution audit trail** — chosen option + value + responded-at + response time + each override-consent record (who recorded it · consent method · evidence · timestamp), replacing the date-only "Resolved · date" line. The four non-selection Track-5 shapes (rfi/submittal/signoff/punch) render **read-only** in the margin (they resolve in coordination; `apply_decision` is selection-only) — a small branch on `coordination_kind`.

**Preserved verbatim** (R56 mandate): `useApplyDecisionOverride` (the option→method→evidence→Record consent flow), `useSendDecisionReminder` (nudge), and `useUpdateDecision` (extend) — same params, same `onSuccess → invalidateMarginSurfaces`. The "expandable sheet" is realized as the margin item's **inline unfold** (its existing expand), which keeps the one-act controls in the margin where §5 wants them rather than behind a separate overlay. One §5 tightening: `invalidateMarginSurfaces` now also invalidates `['coordination-items', projectId]`, so a decision recorded from the margin keeps the coordination band in sync in the same act (it reads the same widened row).

**Verified:** designer type-check clean (Track-B files zero errors); **LIVE CHROME WALK GREEN** on Olsen Lake House — a seeded pending blocking selection with imagery/price/qty/notes rendered the full enriched body (kind-line, context, swatched options, nudge/extend); recording the client's pick through the preserved **override-consent** strip (option · email-excerpt · evidence) resolved it in one act (FF&E `DECISION DUE` → SHIPPED, margin → Settled) and the settled body showed the complete **Resolution** trail ("Chosen: Glazed stoneware lamp · $3,780 · same day to decide" + "YOU RECORDED · email excerpt · …" + the evidence). ⚠ Owed: screenshots-to-disk + the ~390px mobile fold (the `save_to_disk` env constraint).

### I39 · The spec v1.5 fold — Tracks 3–5 + the Decision Composer (R54's owed cut) — 2026-06-16

`the-document-spec-v1.5.md` written, **superseding v1.4** and discharging R54's owed "spec fold." A self-contained "supersedes" cut on the v1.4 structure: header bumped (status, authority order `I1–I38 · R1–R56 · L1–L4`, migrations through **00220**, the three new prototypes added); the §2 ratified-decisions table extended **R41–R56**; the existing sections folded in place (§3 the Rooms-shell physics now reusable; §4 the Drafting Room doorway + the Coordination band + the enriched detail; §5 the Decision margin's authoring half + coordination-as-decisions + the band joining the §5 invalidation set; §6 `blocks_kind`↔`blocking_status` + the `decision_due` light/clear hinge; §8/§16 **Track 3 SHIPPED**; §10 zero-shadow across the new surfaces; §11 schema through 00220; §12/§13 the gap-matrix #1/#2 P0 clusters CLOSED). **Three new sections** added (numbers permanent, as §16 was): **§17 Proposal Authoring — the Drafting Room** (R42–R45) · **§18 Project Coordination — the ball-in-court** (R46–R54) · **§19 The Decision Composer** (R55–R56). **§14 open questions** carries §14.15 (Via-Patina rate) and adds §14.16–§14.19 (the Track-4 provisional thresholds + facet order; the sign→project two-step; GC/vendor logins + deferred cycle/PO links; the `decision_type` "Finish" taxonomy call) — all flagged for Leah. The **gap matrix** (`portal-vs-desk-feature-gap-matrix.md`) gains a dated **PARITY UPDATE banner** recording the two closed clusters (the source-verified per-row baseline is left intact, not rewritten). v1.4 is retained as history (the spec is versioned cuts). ⚠ Designer-visible calls flagged in §14.16–§14.19 still route to the design session per the standing protocol.

## Rulings — design session, 2026-06-14 (The People Room)

> Source: `docs/design/the-document/people/patina-people-room-prototype.html` +
> `…/the-document-people-room-package.md`, against the Feature Gap Matrix
> CRM/People zone (17 gaps — the placeholder book). Renumbered from the package's
> R50–R53 to the true next-R (the live repo was at R56 after the Decision
> Composer; the package's "assume R49" snapshot was stale). Resolves the
> People-placeholder dependency that the decision ball-in-court (R46–R54) needed:
> GCs/vendors are first-class via project_parties (00212).

### R57 · The People Room — the unified party directory, as a Room — 2026-06-14 (pkg R50)

The People book opens as a **walk-in Room** (D14 — full-bleed paper, put-down
returns to the origin stash), NOT a Studio Drawer sheet like Orders/Accounts. Its
spine is a **unified directory of every party Patina works with — clients,
makers/vendors, GCs, studio team, and open leads — in one roster**, role-filterable
(All/Clients/Makers/GCs/Team/Leads), each row carrying a role badge + a
role-appropriate relationship line + a status dot. A left rail switches between
six **views** (Strata-ruled, not tabs): Directory · Threads · Nurture · Reviews ·
Portfolio · Outreach. An **ask bar** queries over people + history (derivation-
backed v1 — keyword routing + the nurture-derived Engine nudge; semantic people-
search deferred). New leads enter the directory; lead detail cross-links to the
Brief. Declined: a clients-only CRM; a sheet form; a separate per-zone contacts
page.

### R58 · The relationship journey — the role-adaptive profile — 2026-06-14 (pkg R51)

Opening a person opens a **role-adaptive Person Profile** whose heart is the
**Relationship Journey** — a single woven timeline (inquiry → proposal → project →
messages → decisions → touchpoints → install → care). **The journey is a
DERIVATION, not a stored activity log** (`deriveRelationshipJourney`) — woven from
the person's document history (projects, proposals, decisions), their threads,
their nurture touchpoints, and their reviews, the same way sections/Desk/margin
are derived. The pre-existing `client_activity_log` is NOT extended. For
**clients** the profile also shows **Style DNA — the Engine's read** (taste tags +
palette + narrative, from `designer_clients.style_tags/style_preferences/
inspiration_quote` + the `styles` taxonomy; no parallel store), plus Projects,
Trust & history, Nurture, and a private note. For **makers/GCs/team** the profile
adapts: makers/GCs cross-link to the Orders book + the coordination view; team
links to document margin visibility (the colophon).

### R59 · Relationship operations — threads, nurture, reviews, portfolio — 2026-06-14 (pkg R52)

Four operating views over the directory. **Threads** is a unified inbox — every
conversation in one list, scope-filterable (all/direct/project/vendor), opening to
a conversation (read + reply) — reusing the `use-comms` shared model: a thread is
**one conversation surfaced everywhere** (it lives on the person AND on their
document margin, R27), never duplicated. **Nurture** is the touchpoint queue —
relationships ranked by dormancy + trust (`deriveNurtureQueue`, a derivation), the
proposal-hesitating/dormant-high-trust ties floating to "reconnect now". **Reviews**
is three-state collection (pending/collected/queued). **Portfolio** is the
finished-rooms gallery (completed projects).

### R60 · Outreach + People on the Desk + the cross-link contract — 2026-06-14 (pkg R53)

**Outreach** is the marketing-ops view: **campaigns** (list/compose/send/stats), an
**email template library** (browse/author/edit/delete), and **audience segments**
which **draw from the same directory** (segment by role/status/history/trust).
**People on the Desk:** nurture-due / reconnect surfaces as a Desk **need-line** (a
`desk-derivation` extension — a dormant high-trust tie is a need); the inbox
*notifications* tab + the Sales Pipeline stay TRANSFORMED into the Desk/margin
model (not rebuilt). **Cross-link contract (not rebuilt here):** maker/GC
terms+orders live in the Orders book; GC open-items in the coordination view; team
invite/management stays /portal/team (the colophon handles margin-visibility);
lead detail cross-links to the Brief. The People Room is the *people* layer over
those, not a re-home of them.

### I40 · The People Room — Wave 0 architect foundation built (R57–R60) — 2026-06-16

The blocking foundation the four build tracks plug into. **Migration 00221** —
`public.people_directory`, an **additive security_invoker VIEW** (D7) that
`UNION ALL`s clients (`designer_clients`) + open leads (`leads`) + makers
(`vendors` saved via `saved_vendors` or engaged via `project_parties.vendor_id`) +
GCs (`project_parties` party_kind='gc') + team (`project_team_members`, de-duped to
one row per teammate) into one roster: `(person_id, role, display_name, email,
phone, profile_id, project_id, designer_id, status_raw, last_touch_at, meta)`. RLS
is inherited (security_invoker) + explicit `auth.uid()`/project-ownership filters;
verified scoping (a designer sees only their own roster). **`people-derivation.ts`**
freezes the contracts: `DirectoryPerson`, `JourneyEvent`, `NurtureEntry`,
`JourneyInputs`, tunable thresholds (NURTURE_DUE_DAYS=240, DORMANT=180,
LEAD_RESPOND_HOURS=24, MAKER_WARM_DAYS=75), the implemented directory helpers
(`deriveStatusDot`/`deriveRelationshipLine`/`isNurtureDue`/`roleLabel`) + a working
`deriveNurtureQueue`, and the **stubbed `deriveRelationshipJourney`** (Track B fills
the body; the input contract is frozen). Key model call: the directory **status
dot** and the nurture **"due" accent** are SEPARATE signals — a proposal-stage
client reads a warm dot but is nurture-due (David Chen). **`use-people.ts`**
(`usePeopleDirectory`/`usePerson`) + barrel + the view added to `database.types.ts`.
**The Room skeleton:** `(document)/people/page.tsx` + `people-room.tsx` (RoomShell +
ask bar + Strata-ruled left rail + the live Engine nudge from the nurture queue) +
the frozen view contract (`types.ts`) + shared primitives (`person-bits.tsx`
avatar/badge/dot, `view-shell.tsx`) + the minimal-real **Directory** view + stub
slots for B/C/D. **Drawer flip:** People `weight:'sheet'`→`'room'` in
`studio-drawer.tsx` + `mobile-sheets.tsx` (the dead generic-sheet placeholder
removed). **Verified:** view applies + scopes correctly against the live schema;
supabase pkg tsc clean; designer-portal People files tsc-clean (0 new errors);
15/15 `people-derivation` Jest tests green. ⚠ Wave 1 (Tracks A–D) builds the view
bodies + the journey/nurture/desk derivations against these frozen contracts;
spec-fold of R57–R60 + the gap-matrix CRM parity update are owed post-review (Wave 3).

### R61 · Lead intake triage on the Desk — Accept→Discovery, Nurture, Pass (Track 6 / G1) — 2026-06-18

Closes gap-analysis **G1** (lead intake has no in-Document home). The data layer is
already complete: `document_state` (00211) unions Shape **C** `lead` (Brief active,
`leads.status in ('new','viewed','contacted')`) and Shape **D** `relationship`
(Discovery active, `designer_clients.status='lead'` AND no live proposal/project).
So a captured lead **already** surfaces as a Brief folder; triage is the missing act.

**The three triage verbs (prototype P0 §G1):**
- **Accept → Discovery.** New mutation **`useBeginDiscovery`** (`@patina/supabase`,
  Wave 0): sets `leads.status='accepted'` + upserts `designer_clients.status='lead'`
  → the folder flips Brief→Discovery ("Schedule the discovery call"). **Conflict
  found + SQL-verified:** the old-portal `useAcceptLead` sets `status='active'`,
  which is **invisible** in `document_state` (no project → not Shape A; not 'lead' →
  not Shape D). Empirically 3 active/no-project rows → 0 visible; flipped to 'lead'
  → 1 Discovery row. `useAcceptLead` is **left untouched** (D7 — old zone keeps
  working); the Document uses `useBeginDiscovery`.
- **Nurture → People (off the Desk).** `useUpdateLeadStatus('contacted')`. Because
  Shape C still includes `'contacted'`, `desk-derivation` must **gate the `new_lead`
  needs-hand folder to `status in ('new','viewed')`** so a nurtured lead leaves the
  needs-hand band and lives in People's nurture/reconnect queue. Additive, no migration.
- **Pass → declined.** Existing `useDeclineLead` (`status='declined'`) — drops Shape C,
  stays in People as declined. Works as-is.

**One-act-many-surfaces:** the triage component invalidates the Desk/document-state
query keys in its own onSuccess (the desk key lives in the app) so the folder
re-derives without reload. ⚠ Provisional (flag to design): whether Nurture also
schedules a concrete touchpoint vs. only marks 'contacted'; the post-accept need
verb ("Schedule the discovery call").

### R62 · The Capture front door + people in ⌘K (Track 6 / G1 capture, G3) — 2026-06-18

A **"＋ Capture a lead"** CTA on the Desk header and a ⌘K **"new lead"** command
both open a `CaptureLeadSheet` (DocSheet overlay, D1/D4) collecting name · contact ·
project one-line · source → `useCreateLead`. Set a default `response_deadline`
(**+1 day**, per R10's "respond within a day" lead window) so the new lead rises as a
`new_lead` need on the Desk (Shape C already surfaces it). ⌘K filter is **alias-aware**
("new lead"/"new client"/"capture" all match the command, not only "Ask the Engine").
**G3:** ⌘K also returns **"jump to [person] →"** rows from `usePeopleDirectory` — the
missing noun beside documents + ledgers. ⚠ Provisional: the capture source list +
whether capture routes to `/doc/{leadId}` or stays on the Desk with optimistic insert.

### R63 · The proposal action — expired-state instruments + stage-consistent letterhead (Track 6 / G2) — 2026-06-18

Closes **G2** (the proposal stage is read-only). Root cause: `proposal-instruments.tsx`
gates its actionable row to `isLive = sent|viewed|accepted|revised` — an **expired**
(or declined) proposal matches neither `isDraft` nor `isLive`, so **no instrument
renders**, even though the Desk advertises "Proposal expired — revise or follow up."
**Close it:** expired/declined offer **Preview · Resend · Revise** (reuse the existing
`SendSheet`→`send_proposal` and `ReviseSheet`→`clone_proposal`). Make the **letterhead
instruments stage-consistent** (View as the client · Send a note) across Brief→Care
instead of project-only. **Follow-up needs no migration:** route "Send a note" through
the existing **`rpc_start_direct_thread(counterpart)`** (00103) — a designer↔client 1:1
thread that needs no `project_id` — using the proposal's/relationship's `client_id`.
(`rpc_start_project_thread` is project-keyed and can't serve a pre-project proposal.)

### R64 · The runaway-timer bound (Track 6 / G4) — 2026-06-18

Closes **G4** (a 36h, ~2,187-quiet-minute timer was offered as a loggable close-out).
`time-derivation.ts` has `idleSecondsFromPings`/`IDLE_THRESHOLD_SECONDS=60` and
`LogOffer.idleSeconds`, but **idle is annotation-only (D10) with no runaway bound** —
`closeOutTimer` proposes the full elapsed regardless. **Extend D10 with an abandonment
guard** (does NOT reverse it — normal short idle still annotates, never trims): a
**contiguous idle gap ≥ a runaway threshold** (provisional **30 min**) marks the timer
abandoned; on abandonment the close-out proposes the **active** duration
(elapsed − idle), idle annotated, not summed; and `document-time-provider` **auto-pauses
accumulation** at last-activity (+grace) on long idle / session end so raw seconds can't
balloon while a tab is closed. ⚠ Provisional + Leah-facing (flag to design): the 30-min
runaway number and the auto-pause behavior — mirror the IDLE_THRESHOLD "watch with data"
posture.

---

## Rulings — design session, 2026-06-18 (Track 6 provisionals resolved)

### R65 · Track 6 provisionals resolved — intake, capture, the proposal act, the timer bound (resolves the R61–R64 ⚠ flags) — 2026-06-18

Resolves the four "flag to design" provisionals carried in R61–R64, from a design interview. Track 6 is fully specified for build after this.

**R61 — Nurture schedules a touchpoint (not merely 'contacted').** Tapping **Nurture** on a lead captures a **reconnect date**; the lead leaves the Desk's needs-hand band immediately (`useUpdateLeadStatus('contacted')` + the R61 gate to `status in ('new','viewed')`) and **rises again as a Desk need when that date is due** — a dated thing earns a return (R22); an undated nurture is only a hope. A skipped date falls back to shelve-to-People (the Engine's "worth reconnecting" still covers it). Build it as a nurture/touchpoint row `desk-derivation` surfaces on/after its due date. The **post-accept need verb stays "Schedule the discovery call"** (confirmed, not reopened).

**R62 — capture opens the new Brief; the source field is free-text with suggestion chips.** After `useCreateLead`, **route to `/doc/{leadId}`** — the captured lead opens as its Brief document so the designer continues filling it immediately (the sheet is the ≤5s front door; depth continues in the doc). The **"Where from" field is free-text with the common sources as quick chips** (Referral · Website / style quiz · Instagram · Past client · …), flexible for odd channels. **Build note:** store a canonical `source` when a chip is chosen (free text otherwise) so People's pipeline-conversion and referral-rate stats stay clean despite the free entry.

**R63 — confirmed as written; Revise is the primary expired/declined act.** For an expired or declined proposal, **Revise** (a superseding new version via `clone_proposal`) is the prominent instrument; **Preview** and **Resend** are secondary; there is **no distinct "Follow up" button** — follow-up is the letterhead's **"Send a note"** (the 1:1 `rpc_start_direct_thread`, R63). The Desk's "revise or follow up" maps to Revise + Send-a-note. Letterhead instruments stay stage-consistent Brief→Care (R63 stands).

**R64 — confirmed as written.** A **contiguous idle gap ≥ 30 min** marks the timer abandoned; the close-out then proposes the **active** duration (idle annotated, never summed — D10 upheld); `document-time-provider` **auto-pauses accumulation at last-activity (+grace)** on long idle / session end so raw seconds can't balloon while a tab is closed. The 30-min number and the auto-pause both carry the IDLE_THRESHOLD "watch with data" posture — revisit if week-one data shows false pauses.

The spec fold for Track 6 (R61–R65) rides the next cut (v1.7); the prototype `patina-p0-intake-and-proposal-prototype.html` is the look/feel reference for the intake + proposal-action surfaces.

---

## Rulings — design session, 2026-06-18 (Track 6 addendum — the Discovery section)

### R66 · The Discovery section — structured capture between intake and the proposal (Track 6 / the lead→proposal gap) — 2026-06-18

Closes the hole between Track 6 intake (lead→Discovery, R61) and the proposal (Track 4): the Discovery section's body — previously an inert spine bar ("Brief/Discovery/Direction bars are inert until their unfolds are designed") — now has a capture method. Grounded in discovery best practice (the written intake captures facts; the call captures hesitation, tone, priorities, decision-making style) and ruled to the Document's grammar in a design interview.

**Discovery is a self-composing section (R40 grammar), designer-captured.** No client-facing questionnaire in v1 — the designer captures Discovery from the intake + the discovery call, one source of truth. The section fills **in any order**, shows its own completion, is usable at any percent, and the **Strata mark is the only progress device** — the anti-wizard pattern, never a SaaS form.

**Structured essentials, unstructured margin — the load-bearing split.** The Discovery blocks capture **structured data**, typed fields rather than freeform prose: project **type** (enum) + a **room list** · a **budget range** · **target / hard dates** · **style tags** (the Aesthete vocabulary) · per-room **lifestyle**. Structured on purpose — the readiness check must be real, and the data must seed the proposal cleanly (field → field). The **margin holds only unstructured notes** — the call's tone, hesitations, the designer's hand (a Note, R14) — and **never** structured discovery facts. Facts live in the blocks; the human read lives in the margin.

**The blocks — five essentials + deepening.** Essentials (structured; they open the proposal): **Scope & rooms · Budget · Timeline · Style & inspiration · How they live** (the per-room lifestyle that makes a proposal specific). Deepening (structured where it helps, not gating): **Keep & avoid · Decision-makers · The site & scan**. The room scan (R27 iOS RoomPlan) and the inspiration board clip into the **folio** (R24).

**The discovery call writes into the structured blocks.** R61's "Schedule the discovery call" need leads to a **call checklist** (scope · how-they-live · budget · timeline · style · keep/avoid · deciders) that records facts into the structured fields; the call's tone and hesitations land in the **margin** as a Note (unstructured).

**"Successful discovery" = essentials filled → ready (soft gate).** When the five structured essentials are captured, Discovery reads **"ready for Direction,"** the spine stamp settles, and Direction/the proposal opens. The fill-state is the Document's native "done" — no sign-off ceremony, no hard block on authoring (R23 gates are reserved for client-granted approvals; discovery is not one).

**Auto-seed (interview ruling).** On readiness, the **structured essentials auto-seed the Direction and the proposal Drafting Room** — type, rooms, budget range, style tags, and the keep-list map field → field into the concept and the proposal draft (clean precisely because they're structured). Not reference-only.

**Internal (interview ruling).** Discovery stays **fully internal in v1** — no client-confirm summary step; the Direction begins on the designer's readiness. A client-facing discovery questionnaire / confirmation can return later if pilots ask for it (flag, not built).

Look/feel: `patina-discovery-section-prototype.html`. Builds onto Track 6 intake (R61–R62), feeds Track 4 (the Drafting Room). **Additive** — the Discovery body is a structured-capture + presentation layer over the existing `leads` / `designer_clients` / engagement shapes (Shape D, R61); the structured essentials map to existing project/proposal fields the auto-seed populates. **Audit-first:** confirm where type / rooms / budget / style / dates already persist before adding columns.

---

## Implementation — The Document, Track 6, Slice 5 (the Discovery section, R66) — 2026-06-19

### I41 · The Discovery section is live — structured capture → seeded draft proposal

Built R66 as `the-document: track6 5 — the Discovery section`, additive, behind
`the-document-pilot`. The inert `DiscoverySection` stub (quiet-sections.tsx) is replaced
by a self-composing structured-capture body (`components/document/discovery/`). The data
layer was genuinely missing (audit-first): the five essentials had no Discovery-stage home.

**Migration `00224_client_discovery.sql` (additive, D7):**
- `client_discovery` — a 1:1 structured table keyed on `designer_clients.id` (Shape D),
  NOT enriching the hot `designer_clients` row. Typed scalars (project_type, budget_min/max,
  target/hard dates, style_tag_ids) + jsonb for the list-shaped fields (rooms, lifestyle,
  keep/avoid, decision_makers). Designer-scoped RLS via a denormalized `designer_id`.
- **`begin_direction_from_discovery(designer_client_id)`** — the readiness act: validates the
  five essentials, creates a seeded DRAFT `proposals` row (+ `proposal_scope_rooms` field→field,
  a `vision` style section, the budget range on the description), stamps the discovery row.
  Idempotent. After it commits, the engagement leaves `document_state` Shape D (a proposal now
  exists) and enters Shape B with `active_section='direction'` (00211) — **the Drafting Room
  opens pre-seeded**, no view change. Verified live: "Begin the Direction" → the Direction body
  showed "Seeded from Discovery · budget 60,000–80,000" + PER-ROOM BUDGETS Living/Dining.

**Design rulings resolved (the audit's C1–C4, ratified with Kody):**
- **C1 / margin at Discovery.** R66's load-bearing split (structured facts in the blocks; the
  call's tone as an unstructured Note in the margin) needs the margin to work pre-project.
  `margin_notes` gains a nullable `designer_client_id` (relaxed `chk_margin_notes_engagement`).
  Since the Note is the *only* margin kind possible at Discovery (no project/proposal → the
  project/proposal-keyed `margin_items` view can't reach it), the Discovery margin reads
  relationship-keyed notes **directly** from `margin_notes` (`use-discovery-margin.ts`, mapped to
  the view's note-branch shape). The rail can only write a Note (no structured-upsert access), so
  the "margin never holds structured facts" invariant holds by construction.
- **C2 / folio at Discovery.** `project_documents` gains a nullable `designer_client_id`
  (`project_id` NOT NULL relaxed; storage policies gain the relationship leg). The inspiration
  board clips here (`useDiscoveryFolioFiles`/`useUploadDiscoveryFolioFile`, folder = the
  designer_client_id); the room scan plugs into the existing `room_scans` (no new table).
- **C3 / the call checklist material.** Added `DocPaperSheet` (centered cream paper, ink
  hairline, zero shadow) alongside `DocSheet` — the prototype's checklist is paper, not the
  charcoal bottom-ledger. Same Esc/backdrop/focus semantics (D1).
- **C4 / style vocabulary.** Style tags read the global `styles` table via `useStyles()` and
  store `style_tag_ids uuid[]` (matches `product_styles` grain).

**v1-pragmatic seed (flag to design if a richer seed is wanted):** rooms map field→field to
`proposal_scope_rooms`; the budget range + style read seed the proposal envelope (description +
a `vision` narrative). Per-room budget allocation and style→palette swatches stay for the
designer in the Drafting Room.

**Readiness is a soft gate (R66/R23):** authoring the blocks is never blocked; only the
Begin-the-Direction CTA + the seed RPC require all five essentials. No client sign-off.

**Verification:** SQL smoke 8/8 (`scripts/the-document-discovery-smoke.sql` — Shape D→B flip,
2 scope rooms, idempotent, not-ready raise); 24 unit tests (`discovery-readiness` + `discovery-seed`);
designer-portal tsc at the 260 baseline (0 new); **live Chrome walk GREEN** (designer@patina.dev,
:3000): section renders (0 console errors), blocks open in-place with typed editors, a UI edit
persists via the debounced upsert, 5 essentials → "Ready for Direction" (StrataMark fills, ticks
fill, CTA enables), Begin the Direction → Direction opens pre-seeded, and a margin Note persists
notes-only at Discovery. Migrations now **00191–00224**.

⚠ Owed / provisional: ~390px mobile screenshots; a standalone `next build` was deferred to avoid
clobbering the live dev server (the dev runtime compiled every new surface — same SWC/webpack
path — with zero errors); the folio upload couldn't be driven under the env's file-upload
constraint (schema + RLS + UI in place, verified by construction). NOT yet on prod (prod owes
00221–00224 + apps).

---

## Rulings — design review, 2026-06-22 (Account visibility in the Desk)

### R67 · The maker's nameplate + the Account sheet — account visibility in the Desk — 2026-06-22

Closes a review finding: the Desk (now the default landing surface) gave the designer **zero account visibility**. You could not tell *what account you were logged into*, and there was **no path** to settings, profile, security, devices, or sign-out from inside the Document model — that machinery existed only on the dissolving `/portal` zone shell (its `AccountMenu` + `/portal/settings/*` pages were never reachable from `/desk`, and ⌘K had no account actions). Ruled in a design review with Kody.

**Account enters the Document vocabulary, not a new top bar (D1).** No utility bar, no header. Identity lives on the one chrome D1 already sanctions — the **Studio Drawer** — and its actions live in a **Drawer-weight sheet** (D14, like Orders/Accounts/Hours). "Date + ⌘K are the only chrome" is a statement about the **Desk page**; the drawer is already-accepted persistent chrome, so the nameplate is consistent with it.

**The maker's nameplate (persistent).** The plain "Studio" micro-label on the drawer becomes the designer's **signature**: monogram (or avatar) + **display name** + the **active studio** + a declared-availability dot. Always visible — it is the at-a-glance answer to "what account is this." Click opens the Account sheet.

**Identity shown = person + studio (the literal question).** Name · email · **studio/org name + role** (the first `design_studio` membership, graceful person-only fallback when there's no org). Structured to carry a multi-studio switcher later; single active studio in v1.

**The Account sheet — settings re-skinned into the language, not linked-out.** A charcoal `DocSheet` with an identity front-matter (person + studio + the availability selector, the same declared-status model as the old AccountMenu) and **R28 page links** (DM-mono, never tabs): **Profile · Notifications · Security · Devices**, plus **Sign out** at the foot. Each page is the *same data layer* as the corresponding `/portal/settings` page — only the presentation moves to charcoal/paper. No bounce back to the old light-theme zone shell.

**Disambiguation (load-bearing).** The drawer's **"Accounts" book is the studio's MONEY ledger** (R36); this is the designer's **LOGIN account**. They never share a label — the login account is reached **only through the nameplate / ⌘K**, never as a drawer book.

**Reachable three ways, one surface.** The sheet is opened by the desktop nameplate, the mobile drawer sheet's identity header (D13), and ⌘K (`Settings`, `Sign out`) — all via a single `document:open-account` event (the InterruptionSettings pattern). The identity is answered by the persistent nameplate; ⌘K carries the *actions*.

**Additive, no migration (D7).** Every data layer already exists (`profiles` incl. `availability_status` 00183, `user_settings`/`notification_preferences` via `/api/user/preferences`, Supabase MFA, `organizations`). The old `/portal/settings/*` routes + portal `AccountMenu` stay untouched during the phase-in; a later dissolve slice can redirect/remove them. **Leah-facing** (a new interaction pattern) — logged here for the spec fold.

---

## Implementation — The Document (Account visibility, R67) — 2026-06-22

### I42 · The maker's nameplate + the Account sheet are live

Built R67 on branch `the-document/account-visibility`, additive, zero migrations. New `components/document/account/`:
- **`account-sheet.tsx`** — the always-mounted sheet (in `(document)/layout.tsx` beside `InterruptionSettings`); owns `open` state + the `document:open-account` listener and exports `openAccount()`. Identity front-matter + availability selector (reuses `useAvailability`/`useSetAvailability`; the **sole** `useAvailabilityRealtime` subscriber so the channel isn't double-bound) + R28 page links + Sign out.
- **`account-profile-page.tsx`** — display name/bio (`useUpdateProfile`), avatar (`useUploadAvatar`), password (`useUpdatePassword`).
- **`account-notifications-page.tsx`** — the four email toggles via the canonical `/api/user/preferences` fetch/PATCH (same endpoint as the old settings + the public preferences page).
- **`account-security-page.tsx`** — 2FA enroll→scan→verify→unenroll (`useMfaFactors`/`useEnrollMfa`/`useVerifyMfaEnrollment`/`useUnenrollMfa`), charcoal re-skin.
- **`account-devices-page.tsx`** — reuses `PairDeviceQR` unchanged on a paper card.
- **`account-nameplate.tsx`** (desktop drawer) + **`mobile-account-header.tsx`** (mobile drawer sheet) — read the shared availability query; the nameplate replaces the drawer's "Studio" label.
- Shared helper `lib/document/account-identity.ts` (`monogramOf`, `activeStudio`).

Modified: `studio-drawer.tsx` (nameplate + divider in place of the "Studio" span), `mobile/mobile-sheets.tsx` (identity header atop the drawer sheet), `command-bar.tsx` (`Settings` + `Sign out` actions, alias-aware), `(document)/layout.tsx` (mount), and `@patina/supabase` `use-settings.ts` `UserProfile` gained the real `display_name`/`business_name` columns (the old settings page had been casting to `any` to dodge the missing fields).

**Verification:** designer-portal `tsc` clean for every touched file (the only remaining errors are the pre-existing `packages/email` React-email JSX mismatch, untouched here); full monorepo `next build` GREEN (exit 0, `/desk` + `/doc/[id]` compiled); D4 zero-shadow confirmed across the new files. **Live Chrome walk GREEN** (designer@patina.dev = Leah Hartwell · Local Dev Studio · owner, :3000, flag `the-document-pilot:true`): the drawer nameplate renders name + studio + status dot; click → the Account sheet slides over the Desk without unmounting it; front-matter reads "Leah Hartwell · designer@patina.dev · LOCAL DEV STUDIO · OWNER"; availability Busy→Online flips the monogram dot; Profile/Notifications/Security/Devices all render in-language; **2FA enroll fired live** (real QR + secret, Cancel unenrolled the pending factor); the iOS pairing QR rendered; ⌘K `Settings` opened the sheet and `Sign out` showed (not executed); `dialog "Account"` + named radios/links expose cleanly; zero console errors from the new code (only the pre-existing PostHog surveys-script error).

⚠ Owed / provisional: ~390px mobile drawer-sheet walk + desktop ≥1280 / ~390px screenshots to disk (the env's `save_to_disk` yields no file — captures are in-conversation only, as prior tracks); spec fold of R67; org/studio **switcher** deferred (front-matter is switcher-ready); the old `/portal/settings/*` + portal `AccountMenu` left in place for the phase-in. NOT on prod.

---

## The Document — Direction/Proposal flow polish — 2026-06-22

### R68 · The household — view / set / change / edit the client on an open document

The client a document is *for* had no standing surface: it was a passive name in the letterhead vitals, and the only place to attach or change one was the buried `ClientPicker` inside the Send sheet (discovered only when Send failed). Distinct concept from R67 (the **login account** = the maker) and the project money **Account band** — hence named **"the household"**, never "Account".

**Ruling.** A quiet mono `HouseholdChip` rides under the letterhead (project + proposal engagements) showing `For {familyLabel}` — or a clay **"No client linked · attach one"** so the gap is visible at the letterhead, not at send time. It opens a `HouseholdSheet` (a charcoal `DocSheet`, the SendSheet's sibling — D1/D4) with four capabilities:
- **View** — name · email · phone · relationship status (resolved `useDesignerClientForClientUser` → `useClient`; name renders immediately, contact hydrates on the join).
- **Set / Change** — the existing `ClientPicker` (carries "+ Add new client" + "Clear selection"). Writes through the new `set_document_client` RPC (00225).
- **Edit** — the relationship's working name/email (captured clients without a Patina account) + notes (`useUpdateClientContact`). A profiled client's name/email/phone stay read-only — they belong to the client's own account.

**`set_document_client` (00225, additive, `SECURITY DEFINER`):** one act, many surfaces (§5). Re-authorizes ownership (`projects/proposals.designer_id = auth.uid()`), refuses a `client_id` that isn't one of the designer's `designer_clients` (would orphan the relationship resolution), flips the proposal/project `client_id`, and **advances the newly-linked relationship status** in the same transaction — `project → active`, `proposal → at least proposal`. The hook then invalidates `document-state`, `desk-engagements`, `designer-clients`, and the proposal/project keys together.

**Gating.** Changing the client is gated to **draft** for proposals — a `sent`/`accepted` proposal keeps its client so a signature can't be mis-attributed (the sheet says so and points to Revise). Projects and unlinked drafts change freely.

**Open question (non-blocking, shipped conservative).** When a project's client is *changed* mid-engagement, the RPC advances the **new** client's relationship but deliberately does **not** demote the **prior** client's `designer_clients.status` (non-destructive, D7) — the old relationship simply stops being linked. If the design session wants the prior household auto-demoted (e.g. back to `nurture`) or a confirmation step on re-pointing an active project, that's a follow-up ruling.

**The "the Flats" fix.** `useFamilyLabel` had naively pluralized the *last word* of the client name, and `document_state.client_name` is the linked profile's `full_name` — which a seed had set to the project title "Reyes — Garden Flat", yielding "the Flats". Replaced by shared `lib/document/family-label.ts`: take the household part before a `—`/separator, then pluralize the surname with the -es rule ("Reyes" → **"the Reyeses"**), falling back to "the client" for generic/blank names.

### R68.1 · The Direction work band — making "draft the proposal" obvious (refinement)

The first cut shipped the draft/send actions as a *weighted* mono row (clay "Draft the proposal" vs muted "Send"). Live smoke confirmed it still read as one more tiny line while the empty **"$0"** proposal preview (`proposal-blocks-readonly.tsx` always renders the Investment + Payment blocks) dominated the eye — typographic weight can't beat a `1.2rem` number.

**Ruling.** The draft state now carries a **work band** — the same grammar as Discovery's readiness band (the designer's known "next move" device): a tinted band (`rgba(229,221,208,0.5)` drafting / `rgba(168,181,160,0.16)` ready) with the `StrataMark size="lg" fill` (the shared drafting fill), a state sentence (**Not started yet** / **A draft taking shape · N% written** / **Ready to send**), and **one SOLID clay-filled CTA** that swaps **"Open the Drafting Room →"** → **"Send the proposal →"** at 100%. The non-lead act steps back to a quiet mono second below; live/terminal states keep their quiet instrument rows untouched. The empty proposal preview now collapses to **"Nothing drafted yet."** instead of the `$0` husk.

**Deviation logged:** this is the **first filled button in the document body** (filled buttons were overlay-only; the body used bordered/hover-fill, e.g. Discovery's "Begin the Direction →"). A deliberate, user-approved push for prominence, scoped to the single "work to be done" moment. Bordered/hover-fill remains the default body grammar.

## The Document — Time readout polish — 2026-06-23

### R69 · The running-timer readout rests at minute resolution — no per-second motion

Reported live (Kody): with a document open and a timer running, the elapsed clock **re-counted every second** in the always-on chrome — the spine timer (desktop left rail) and the mobile bottom bar both rendered live `mm:ss`. That ticking in the periphery pulled the eye off the text box / dropdown being filled in. The clock is the system's only *unbounded* per-second motion: it's not the breath (R15, a slow bounded swell on the active marker) and not a notification — it's just a counter changing in the corner. It also contradicts the Studio Drawer's own discipline (D8: "no badges, no unread counts, no pulsing"), where "In hand today" already rests at minute granularity for exactly this reason.

**Ruling.** The **at-rest** running readout drops to **minute resolution** (`fmtElapsedQuiet`: "under a min" → "1 min" → "1h 23m", floored, never rounded up) so the digits change at most once a minute — the corner goes still while you type. The sage "In hand" running dot is unchanged, so "it's running" still reads at a glance. The precise `mm:ss` survives only where the timer is opened **on purpose** — the mobile timer sheet (`mobile-sheets.tsx`), a focused view, not peripheral chrome. The provider's 1s tick is untouched (that sheet still wants live seconds when open; the per-second re-render is cheap and confined to timer components — the form inputs never consumed the timer context, so this was always a pure visual-motion issue, not focus theft).

**Scope.** Spine timer + mobile bar only. The **R15 breath stays untouched** (Kody's call — much subtler than the ticking clock, and `prefers-reduced-motion` already stills it; revisit as a separate item only if it still tugs). The old portal header chip (`running-timer-chip.tsx`, with its `animate-ping` dot) and `stop-timer-dialog.tsx` are not rendered inside the `(document)` layout, so they're out of scope here.

**Status.** Directed by Kody from a live report — to confirm with Leah. If she wants the live `mm:ss` back in the spine, the cheapest reversal is swapping `fmtElapsedQuiet` → `fmtElapsed` at the two call sites; a "reveal-on-hover precise time" middle ground was offered and can be added without touching the resting state.

## The Document — The Piece (library item view + edit) — 2026-06-24

### R70 · A piece you walk into — full-screen view & edit of one library item at `/library/[id]`

The Library Room (R32/R39) let you browse three shelves, but tapping a `LibraryCard` did nothing — there was no way to open a single piece and see, let alone edit, the ~35 real columns a `products` row carries (identity, form & material, pricing, sourcing, media, teaching, provenance). **The Piece** closes that: a Room reached by tapping a card's image or title, a sibling of the Composing Page (R40) and the Drafting Room (R42).

**The shape.** A full-bleed paper Room (`RoomShell`, `backTo="/library"`) — not a sheet — at `/library/[id]` (`room-origin` already classifies it as a Room labelled "the Library", so no plumbing). A **letterhead hero** (folio gallery + the piece named in the hand + the Strata Mark *completeness* fill reading **Capture → Draft → Catalog-ready** off the same `pieceFill`) over three Movements reusing the Composing grammar verbatim — **the record** (identity · the piece · the story · categorization) · **the catalog** (commerce · sourcing · listing metadata) · **the eye** (teaching, delegating to the existing `DeepAnalysisSheet`) — and a quiet **colophon** of provenance/lifecycle. System columns (`embedding`, `aesthete_vector`, `search_vector`) are hidden; read-only/derived fields (slug, quality_score, audit) read as quiet metadata.

**Save model.** R40's law applied to an existing row: **every facet self-saves on blur** (chips/toggles immediately), no Save button. New `usePieceField` hook = a raw `products` UPDATE with optimistic write to `['product', id]` + rollback, and the two invalidations `useUpdateProduct` was missing (`['layer-products']`, `['layer-counts']`) so the shelf reflects an edit. RLS 0-row writes (PGRST116) surface as "no permission"; CHECK violations (23514) as "a Studio piece needs this field."

**Permission & layer.** `canEdit` = super_admin OR (personal && owner) OR (studio && **non-guest** member — matched to the `products_studio_update` RLS role gate). Read-only is a **typeset specimen sheet**, not greyed inputs. `layer` is **never** an editable field — only Promote/Nominate move it (the existing rails, `asSheet`). Catalog pieces (read-only for designers; editable only by super_admin) offer **Save to My Library** + **Add to a project** (`usePlaceInDocument`) — Kody's ruling on catalog actions, 2026-06-24.

**Scope ruling (Kody, 2026-06-24).** Expose **only columns that genuinely exist** on the `products` row. The aspirational `@patina/types` `Product` interface lists phantom fields (weight, msrp, currency, sale price, care/assembly, variants) with no column — out of scope, no migration; backlog if studio/catalog curation later needs them.

**Verified.** db reads clean; designer-portal `next build` green + the route in the manifest; type-check clean for all new files; a 6-dimension adversarial review (40 agents) → 15 confirmed findings → 13 fixed, 2 deferred (below); **live Chrome walk green** as `designer@patina.dev`: personal piece editable (SKU self-save persisted to DB), catalog piece read-only specimen sheet + Save/Add rail + correct cents→dollars, Add-to-a-project picker opens. D4 shadow audit clean.

**Deferred (logged, not blocking).**
- **O1 (still open):** the `Movement`/section-rule device is copied locally into `piece-room.tsx` (≈25 lines) rather than shared with Compose/Drafting — de-dup into `components/document/` later.
- The `#b89a2e` draft-amber literal (Compose/Drafting/card) wants promoting to a token — pre-existing, untouched here.
- The **studio** path renders the sourcing bundle with soft "studio needs" hints, but no studio rows are seeded locally to walk it; logic is the same surface, verified by review.
- Screenshots captured in-conversation only (env `save_to_disk` constraint).

## The Document — Desk light restyle (the Folio, the white dock) — 2026-06-27

### R72 · The Desk goes to light paper — off-white surface, the lift-on-pickup folio, the white dock

Directed by Kody (design authority) from a self-contained restyle spec. (R71 is the proposal-watch work in the project log; this file had not carried it, so the restyle takes R72.) The Desk (home) moves off the dark charcoal surface onto **light Patina paper** — keeping the "job document you can pick up" metaphor (the **Folio**) but trading flat stacked-paper-on-charcoal for off-white paper, hairline borders, and typographic hierarchy. The shared **Studio Drawer** (dock) moves from charcoal to a white 60px bar. Built against existing tokens only (no invented values). This **reverses two locked decisions** for the Desk + dock surfaces; logged here per the workstream's append-on-deviation rule.

**1 — Charcoal Desk → off-white `#FAF7F2`** (reverses §10 + the `(document)/layout` "the charcoal surface is the desk itself"). The `(document)` layout now paints `--bg-primary`. The open document is unaffected: `/doc/[id]` already paints its own `--doc-paper` full-bleed, which occluded the layout charcoal anyway. The **doc-view restyle is explicitly out of scope** (a follow-up); only the shared chrome (dock, LogStrip) crosses into it, and white-dock / light-strip over doc-paper reads clean.

**2 — D4 (zero shadows) relaxed for exactly two surfaces.** The folio's pickup affordance — `translateY(-10px)` + a drop-shadow growing `0 2px 4px /0.06` → `0 22px 34px /0.18` on hover, `translateY(-4px)` on press, `grab`/`grabbing` cursors — and the dock's hairline surface. Implemented as a **CSS class (`.folio-face`) in `globals.css`**, gated to `prefers-reduced-motion: no-preference`, so the **D4 lint stays unchanged and still bans every shadow literal in TSX** (the ESLint `no-restricted-syntax` selectors only scan TSX string/template literals). Reduced-motion users get a still, shadowless folio. Amends O4/R3 (shadows were overlay-motion-only).

**3 — The folio tab is type-only; R15 fill-state leaves it.** The old tab carried a `StrataMark fill` (R15 "how far along"). The restyle's tab is a **status-colored fill + a DM Mono uppercase label** (`SURNAME · SECTION`, white ink), no mark — type does the work. The fill-state indicator is gone from the Desk folio (it survives on the spine / inside the document). **Flag for Leah:** if she misses the at-a-glance "how far" on the Desk, the cheapest restore is a thin fill bar under the tab.

**4 — Stamp → dot+mono StatusChip on the folio.** The rotated ink `Stamp` (−1.5°, bordered) is replaced on the folio face by a quiet **6px status-dot + DM Mono label** (`StatusChip`) — no pills, no rotation. The `Stamp` is retained inside the document view. New folio sheet tints `--doc-sheet-front #F7F2EB` / `--doc-sheet-back #F1EBE2`; folio body is white (`--bg-surface`) over the prior `--doc-paper`.

**5 — The white dock (shared chrome).** 60px, `--bg-surface`, hairline top border. Left: the **Patina wordmark** (Playfair, `0.2em`, → `/desk`) + a quiet breadcrumb. Center: the five room doors with **Lucide** icons (1.5px), Clay-6% hover, a 2px Clay active underline (per-door correct — matched by href, not the generic `isRoomPath`). Right: the in-hand readout (**"Hands free"** off a document; the day's minutes inside one), a **notification bell** (`Bell` + a Clay dot from `useUnreadInboxCount`, → `/portal/inbox`), and the **identity nameplate** (restyled light) opening the existing `AccountSheet` (per Kody — no new upward popover this pass). `DoorwayTick` and the per-book spine bars retire. The dock renders ≥980px (MobileBar below); no horizontal overflow at 980.

**Provisional / to confirm with Leah.**
- White tab ink on the lighter status hues (terracotta / clay / golden) is low-contrast for the small mono label — spec-mandated white; revisit if it reads poorly.
- Bell destination `/portal/inbox` leaves the document model (no doc-model inbox surface exists yet) — provisional.
- Folio meta line keeps **Section · Phase** (the Desk read model carries no location/budget for the mockup's "Wauwatosa · $15k–$25k").

**Verified.** designer-portal type-check clean for all restyle files (the only `tsc` errors are pre-existing `packages/email` React 18/19 `@types` JSX noise); ESLint clean on the changed set — **the D4 shadow ban stays green** (no shadow literal in TSX). Live Chrome walk: [pending].

---

## The Document — the parity re-sweep — 2026-07-01

### I43 · The v2 parity ledger — re-sweep + adversarial verify + live walk

The 2026-06-14 gap matrix had been overtaken by Tracks 4–6, the People Room, the Decision Composer, the Piece, the watch view and the Account sheet. Re-verified all 200 baseline rows (+2 route-delta stubs, +33 Document-native) against HEAD `03537b18` @ migration 00235 with a 23-agent workflow — 10 zone claim agents (three evidence legs per row: surface `file:line` · doorway traced from /desk · data parity) → 10 adversarial verifiers (falsify upgrades, sweep every FULL doorway, audit XFRM sanctions against the ruling index, 25% spot-check) → merge — then a 22-station live Chrome walk (designer@patina.dev, db reset @00235 + demo seeds + new `scripts/the-document-reaudit-walk-seed.sql`).

**Result: FULL 66 · PART 50 · XFRM 51 · ABSENT 33 · RETIRED 2 (+33 NATIVE)** vs the baseline 47/53/14/86. ABSENT collapsed 86→33 — mostly into sanctioned XFRM (14→51). 224 verdicts CONFIRMED, **11 OVERTURNED — every one a downgrade of an over-optimistic claim** (incl. PRJ-01 XFRM→PART: the I7 signed-folder safety net has no activation act; PRC-24: OrderAssistant mounts single-line only; RMS-05, CRM-01, LIB-27 depth caps). Priorities over PART+ABSENT: **P0 6 · P1 39 · P2 38** — the six P0s cluster in exactly two places: **invoice authoring/settlement** (BIL-02 record-payment, BIL-03 line kinds — 00204 drafts header-only invoices, BIL-04 unbilled-time pull-through — the Hours "Export week → Accounts" button is a disabled stub, BIL-05 FF&E-line invoicing, BIL-09 invoice detail acts) and **vendor creation** (PRC-03 — no create-vendor door while the line unfold blocks ordering without one). 45 rows carry drafted ruling questions.

**The walk confirmed the core loop is real** (capture→triage→discovery→drafting→watch→coordination-cascade→FF&E/PO→receiving→chase→hours→People, one-act-many-surfaces held throughout) **and found three P0-grade breaks in the newest funnel**: F2 — Discovery's `project_type` select never persists and the UI ready-gate disagrees with `begin_direction_from_discovery` (00224), dead-ending every new lead at "Begin the Direction"; F7 — the send sheet's ClientPicker silently refuses no-account households (`linkable` gate), so discovery-born proposals cannot be sent (needs a ruling: the no-login send path); F10 — `proposal-watch.tsx` renders "Signed — the project is open." with no existence check and no act. Plus P1/P2: dead `/doc/{leadId}` after accept, budget cents/dollars corruption ("budget 6–850"), self-save keystroke races, flaky Drafting Room doorway button, "New client" titles, toast-shaped errors against D2 (needs an error-grammar ruling).

**Artifacts:** `portal-vs-desk-feature-gap-matrix-v2.md` (+ `.rows.json`, `.html`) · `the-document-parity-backlog-2026-07.md` (the P0+P1 build queue: funnel repair first, then Tracks 7–11 + the Post) · `the-document-needs-ruling-2026-07.md` (45+2 questions, rulings resume at R73) · `the-document-reaudit-walk-2026-07.md` · run data `.claude/runs/parity-reaudit/`. The 2026-06-14 matrix is banner-frozen as the baseline.

⚠ Owed / provisional: screenshots in-conversation only (standing `save_to_disk` constraint); prod catch-up 00230–00235 + `proposal-nudge` fn blocked on LAN access to the prod box; spec v1.7 fold still owed (now R61–R72 + this re-sweep); first workflow run lost its inventory agent to a connection drop — the workflow script was retry-hardened and re-run (23/23 agents, zero errors).

---

## The Document — the ruling round — 2026-07-01

Nineteen rulings from Kody's session over `the-document-needs-ruling-2026-07.md` (45 matrix rows + 2 walk items → every question answered). Asked one at a time, multiple-choice; the recommended shape was taken in all but one (R-execution: full send). These rulings authorize funnel repair + Tracks 7–11.

### R73 · Invite-on-send — the no-login household send path

Linking a no-account household to a proposal (or a decision, or any client-facing act) sends a **magic-link invite carrying the document**; the client-portal account is created when they open it. The ClientPicker's dead "NO PATINA ACCOUNT" rows become a live **"invite & link"** act (the `client-invite` edge fn + `useAddClient(invite:true)` machinery exist). Signing stays in the client portal — `sign_proposal` unchanged. One identity model, one new email leg. Resolves walk F7 and the DEC verifier's systemic profile-less-authoring gap.

### R74 · The Invoice folio + the composer — where money is written

Invoice detail = an **Invoice folio** (paper DocSheet) opened from Accounts-ledger rows, margin MONEY items, and ⌘K — carrying **Issue & send · Record payment · Resend · Void · Print**, reusing `useInvoice/useIssueInvoice/useSendInvoice/useRecordPayment/useVoidInvoice` + the `invoice-send` edge fn 1:1. Print = the folio with a print stylesheet. Authoring = an **anti-wizard composer sheet** with self-composing pull-through sections (**milestones · unbilled time · FF&E · ad-hoc**, typed line kinds per 00178/00187), totals via `computeInvoiceTotals`. Closes BIL-02/03/09 (P0).

### R75 · Export opens the composer — the time→invoice pull-through

The Hours ledger's "Export week → Accounts" stub comes alive: it opens the R74 composer with that week's unbilled entries **pre-claimed as a time section** (per-entry include/exclude, resolved rates shown) — one act, review before draft. The composer's time section also works standalone per project. Closes BIL-04 (P0).

### R76 · Bill from the line — FF&E invoicing

The FF&E line unfold (and section multi-select) gains a quiet **"Bill →"** act opening the R74 composer prefilled — the Document descendant of `?ffeItemIds=`. Coverage stamps (invoiced/paid/unpriced) render on the line via the existing 00187 bridge. Closes BIL-05 (P0).

### R77 · The full Hours ledger

Week paging through history; an **all-time unbilled balance** with a "bill it" handoff into R75's flow; a **per-document lens** (the Account band links in pre-filtered); **delete-with-confirm on unbilled entries** (billed entries stay immutable). Retires `/portal/time` and `/portal/projects/[id]/time`. Closes PRJ-14/BIL-11/BIL-12.

### R78 · Makers in People, trade in Orders — vendor creation & the roster

The People Room's **'+ Add' grows a maker path** (vendor creation — closes P0 PRC-03); discovery/search/category browse + **save-as-admission** live in a People **Makers marketplace lens**; the role-adaptive maker profile carries products/reviews/quote-request; the Orders book Vendors page keeps terms/POs/threads and cross-links both ways (R60's split upheld). Closes PRC-01/02/04.

### R79 · The OpenProjectSheet — projects that skip the proposal

A capture-lead-sheet sibling on the Desk header + ⌘K ("open a project"): essentials only — household (R73 machinery), title, budget band, start date — one RPC, then compose in `/doc/[id]`. The old wizard's Step06 client-visibility-tier choice becomes a letterhead instrument. **The 7-step wizard does not port.** Closes PRJ-01's manual-creation half (the signed-safety-net act is walk bug F10, built in funnel repair).

### R80 · Self-save vitals + the Care band — edit and close the project

Letterhead vitals and phase hour estimates become **blur-save fields** (R40/R70 law), estimates beside actuals in the Work block. Completion = the **Care section's work band**: closure checklist + portfolio snapshot → one "Close the book" act (one transaction; reuses closure-checklist + portfolio-snapshot logic). Change history = the settled fold. Closes PRJ-02/03.

### R81 · The Amendment sheet — scope changes

An **Amendment** paper DocSheet (revise-sheet sibling) opened from the R14 margin escalation and the Account band: compose with fee/timeline impacts (`use-scope-changes` + the old impact math), send, apply-on-approval. Applied amendments settle into the fold + Account-band history; open ones ride the margin as MONEY items. **No list page — the margin and band ARE the status tracking.** Closes PRJ-04/05/06.

### R82 · The Post — what the bell opens

A Drawer-weight charcoal sheet with two R28 page links: **Letters** (`useInboxMessages`, rows deep-link to People threads / margin anchors) and **the Record** (a dated quiet ledger over `useInboxNotifications`). Rows whose subject already derives a Desk need render as cross-references ("on your Desk") — never duplicate acts. Read-on-open; the clay dot stays awareness-not-count (D8). Retires `/portal/inbox`; resolves the R72 provisional.

### R83 · Inline at the act — the error grammar

Failures render as a **quiet inline band at the act site** — R51's success grammar in terracotta, with the reason and a retry act (the receivables chase already does it right). **The toast layer is removed from (document) surfaces entirely.** Closes D2's open error path; resolves walk F2b.

### R84 · The procurement eight — all of them

Ack-logging (PO preview/ledger rows) · damage-claim creation/notify (Receiving + line unfold) · single-PO ETA quick-edit (the unfold's Movement cell) · **multi-line Order Assistant** (from the Orders vendor page) · mark-sent mode in PoPreview (phone/fax orders) · project+payment facets as quiet DM-mono lenses on the ledger · order-all on the vendor page · the receiving KPI strip. Closes PRC-06/07/09/10/11/12/24/27.

### R85 · Proposal depth — ad-hoc draft · Folio on proposals · free-text terms; templates retired

⌘K **"draft a proposal"** for an existing household (skips lead/discovery for repeat clients; R73 linking). The **Folio mounts on proposal-stage documents** (space plans reach the client copy pre-project). The Terms facet gains the **free-text agreement body** (the old TermsSection is still client-rendered — the designer must be able to author it). **Proposal templates are retired** — the seeded-from-Discovery path covers the job. Closes PRO-01/03/07.

### R86 · The portal copy is canonical — tier-governed preview

The client portal's rendering (itemized lines, payment schedule) is what the client sees, governed by the existing `client_visibility_tier`. The Drafting mirror upgrades to render **the same component at the chosen tier** — preview-is-truth (R44's law extends to the mirror). Closes PRO-25.

### R87 · Extend revives; delete stays draft-only — decision edges

Extend on a stored-expired decision runs the expired→pending recovery so the client can respond again. Published/pending decisions are never deleted — only expired or resolved; the R56 audit trail stays intact. Closes DEC-11/03.

### R88 · The Library's working acts — import · validate · find; collections deferred

My Library gains a shelf-header **"Import…"** act (existing XLSX/CSV parse; pieces land as raw captures needing teaching). The **validation queue** becomes a teach-fold lens beside Quick Tags/Deep Analysis. The librarian bar gains **field-grain search** (name/SKU/maker/category) beside the Engine's ask. **Collections/categories defer to P2** as possible shelf-pins later — boards + projects cover curation. Closes LIB-01/10/12; LIB-04..08 deferred with destiny.

### R89 · ⌘K help + ambient — the help affordance

⌘K gains an alias-aware **"Help…"** row opening the contextual panel scoped to the current surface; SurfaceKeys mount across (document) surfaces; the browsable Help Center re-homes to `/help` (outside the portal tree, paper-styled) at dissolve. Closes LIB-15/RMS-11 and defines R5's long-owed "help affordance".

### R90 · The scan opens as a sheet

The interactive 3D `RoomScanViewer` opens as a doc-file-viewer-sibling sheet from Discovery/Brief artifacts and the Folio — the WebGL component reused as-is. Retires `/portal/rooms/[id]`. Closes RMS-02 (parity-map C-6).

### R91 · The P2 basket defers — with destinies logged

Full notification-settings depth (RMS-07), sessions & sign-out-others (RMS-09), declined-lead history in People (CRM-20 — noting it contradicts R61's letter today), bulk archive (PRJ-12), and the LIB-13/17/27 library-depth trio all **defer**: none block the dissolve; each folds in when its track touches the surface. The public email-unsubscribe landing (RMS-10) survives the dissolve as a standalone page regardless.

**Execution ruling (Kody):** *full send* — funnel repair first, then Wave 0 seam freeze, then Tracks 7 · 8 · 9 · 11-M as parallel worktree builds, then Wave 2 (the Post · 11-R), then the R21 dissolve.

---

## The Document — funnel repair + Wave 1 landed — 2026-07-01

### I45 · Funnel repair — the lead→proposal→project chain is unbroken

Commit `a256ef3c`. All ten walk findings fixed and re-walked green the same day: F2 (Discovery persists lead prefills incl. project_type; UI ready-gate strictly tighter than the 00224 RPC; serialized saves with blur/unmount flush — F3/F4's true root cause was racing upserts from an unstable mutation object in effect deps), F5 (content-bearing rows only + new-row autofocus), F6 (doorway prefetch + "Opening…" acknowledgment), F1 (accepted-lead /doc/{leadId} resolves onward, mirroring R6), F8 (00236 — relationship docs title from designer_clients.client_name), F10 (SignedSeal reads project existence; the act calls activate_proposal_as_project — the R44/I7 safety net, one act re-derives the Desk), R73 (ClientPicker invite-and-link: service-role invite creates the auth user + profile and links the SAME designer_clients row — walked fully live: capture → discovery → direction → drafting → invite & link → SENT), R83 (mutation meta errorSurface='inline' opts Document mutations out of the global toast; inline terracotta bands; zero toasts through the whole re-walk). Re-walk table in `the-document-reaudit-walk-2026-07.md`.

### I46 · Wave 1 — Tracks 7 · 8 · 9 · 11-M on main

Four parallel worktree builds over frozen seams, merged same-day (T9 `6bb6c19f` → T11-M `60eaef9e` → T7 `f22c8776` → T8 + integration): **R79/R80/R81** (OpenProjectSheet + `open_project_direct` 00237 · self-save vitals/phases + Care "Close the book" + `close_project` 00238 · the Amendment sheet), **R74–R77** (Invoice folio + anti-wizard composer, zero migrations — 00177/00178/00187/00204 carried it · Export week → composer · FF&E Bill acts + coverage stamps · full Hours ledger), **R78** (maker path on '+ Add' · Makers marketplace lens, save-as-admission · maker profile depth + Orders cross-links), **R84** (ack logging · mark-sent · inline ETA · damage-claim lifecycle · multi-line Order Assistant/order-all · ledger lenses · receiving KPI strip). Orchestrator integration pass: ⌘K "Open a project" + "Draw an invoice" (capture-lead pending-flag pattern), Hours ledger drawer pre-addressing, line-unfold "Bill →", account-band "Amendment →". **All six P0 rows closed** (BIL-02/03/04/05/09, PRC-03). Verified: tsc 0 new · 325 doc jest · next build green · db reset clean through 00238 · live Chrome walk (open-a-project → project doc with vitals/Sharing/Close-the-book · Amendment sheet · folio-first Accounts ledger + folio acts · composer entries). ⚠ Owed: margin MONEY fold for open amendments (helpers ready in amendment-derivation.ts) · ⌘K "add a maker" + FF&E add-a-vendor doorway · AccountBand passes clientName='' to the Amendment sheet (familyLabel falls back to "the client") · `apply_scope_change` (00084) lacks an internal ownership guard (pre-existing; follow-up migration candidate) · phase-estimates placed in the letterhead "Phases" fold not the Work block (design flag) · screenshots in-conversation only.

---


---

## The Document — Track 8 · money completion — 2026-07-01

### I44 · The Accounts book learns to write (R74–R77 built)

Branch `the-document/track8-accounts-writes`, four slices, ZERO migrations (00177/00178/00187/00204 carried everything).

**R74a — the Invoice folio.** A paper sheet above the charcoal ledgers (`PaperFolioSheet`: z-60, capture-phase Esc so the Accounts book beneath survives the keypress, body portal). One invoice: number + paper-ink stamp, client · project doorway, typed lines (milestone/time/ffe/adhoc), totals, payment history, and the acts row — Issue & send · Record payment · Resend · Void · Print — the old Billing detail's logic 1:1 over `useInvoice/useIssueInvoice/useSendInvoice/useRecordPayment/useVoidInvoice`, all `errorSurface:'inline'` (R83; the options param was added to the four hooks that lacked it). Print = the folio itself (`@media print` hides every body sibling of the portal). Opens from: Ledger rows + Receivables rows (folio-first, `document ↗` doorway kept), the Money margin's InvoiceBody, and `openInvoiceFolio()` for ⌘K.

**R74b — the composer.** An anti-wizard sheet: Milestones (unbilled+unclaimed) · Unbilled time (00177 view, resolved rates) · FF&E (00187 partition — covered/unpriced fall out with a notice) · Ad-hoc, tax/terms/memo, running `computeInvoiceTotals`, one "Draft the invoice →" act → the folio opens (review-then-send). Time claim with compensating-delete on conflict. Prefill contract: `openInvoiceComposer({ projectId?, initialFfeItemIds?, initialTimeEntryIds? })`; context-free opens a document picker. Entry points: Ledger head, the Account band acts row. Pure line assembly in `lib/document/invoice-composer.ts` (11 contract tests).

**R75.** "Export week → Accounts" is alive: the shown week's unbilled entries arrive ticked; one document → pre-scoped, several → the composer asks and ticks that document's share.

**R76.** FF&E section head: "Bill N uninvoiced →" (bill-all-uninvoiced prefill — the composer IS the multi-select surface); per-line coverage notes invoiced·N°/paid/unpriced off the 00187 bridge. `line-unfold` untouched (Track 11-M).

**R77.** Hours ledger: week paging, all-time unbilled balance + "bill it →", per-document lens via optional `initialContext` prop, delete-with-confirm on unbilled entries (billed immutable), rows carry resolved money (BIL-08), R83 inline notes.

**Verified.** designer-portal tsc: zero non-`packages/email` errors; packages/supabase tsc clean; 306 document jest (incl. client-mirror + dissolve-grammar contracts) + 20 use-invoices vitest green; D4 shadow grep green.

**Provisional / owed (post-merge wiring):**
- ⌘K "draw an invoice" row → `openInvoiceComposer()` (command-bar not touched this wave).
- Studio drawer: pass `initialContext={sheetContext}` to `<HoursLedger />` (one line) so the Account band's "Hours · this project ↗" lands pre-filtered; the link ships now and opens unfiltered until then.
- The per-line Bill act in the line unfold (Track 11-M's surface).
- The folio's own `document ↗` doorway navigates but cannot close an Accounts sheet open beneath (no close-ledger event exists); the rows' doorways still close properly. Minor; revisit if it reads poorly.
- R74b's third entry point ("the per-project money margin") deferred — the margin composer lives in margin-rail (not this wave's ownership); the Account band + InvoiceBody cover in-document money authoring.
- R77's route retirement (`/portal/time`, `/portal/projects/[id]/time`) rides the dissolve, not this track (D7 — old zones keep functioning).

**Live walk (same day, worktree dev server :3010 against the shared local stack).** Desk → Accounts book: "Draw an invoice →" head act + folio-first rows render; INV-2026-W02 folio opened ABOVE the ledger sheet (paper over charcoal, D14 held); **Record payment $800 landed end-to-end** — stamp SENT→PART PAID, payments row appended, quiet sage confirmation, Void act correctly withdrew (paid > 0), and the ledger BENEATH updated in the same act (revenue $0→$800 · A/R $6,200→$5,400 · row stamp/owed). Esc closed only the folio; the Accounts book stayed mounted with focus restored. The composer sheet opened with its document picker. ⚠ Walk cut short mid-composer: a concurrent session ran `supabase db reset` on the shared stack (picker emptied + session invalidated — DB truth, not a Track 8 bug); the composer's ticked sections were exercised by the 11 contract tests + tsc instead.

---

---

## The Document — Wave 2 · Proposal depth + the tier mirror (R85 · R86) — 2026-07-02

### I47 · Proposal depth + the tier mirror built (R85 · R86)

Worktree branch, four slices, **one additive migration (00252)**.

**R85a — the Terms free-text agreement body.** The Drafting Room's Terms facet now carries the free-text agreement prose ABOVE the structured `ChangeOrderTermsEditor` (both render; the structured editor is untouched). New `terms-agreement-body.tsx` persists to `proposal_sections.body` (type `terms`) via `useUpsertProposalSection` — the SAME row the client's proposal copy already renders (proposal-document.tsx shows `section.body` for the terms section), so what the designer writes is what the client signs. Debounced self-save, `errorSurface:'inline'` (R83, no toast). `useUpsertProposalSection` gained an additive `{ errorSurface }` option.

**R85b — the Folio mounts on proposal-stage documents.** Migration **00252** adds `project_documents.proposal_id` (nullable) + widens the owner CHECK + a designer read/manage RLS pair (proposals.designer_id) mirroring 00224's discovery legs, PLUS a **client read leg** (`client_visible AND proposals.client_id = auth.uid()`) so flagged space plans reach the client's proposal copy pre-project — the discovery folio had no client leg; the proposal folio does, because the client sees the proposal. Storage object policies for both legs (folder[1] = proposal_id). `use-folio.ts` gains `useProposalFolioFiles` / `useUploadProposalFolioFile` / `useSetProposalFolioVisibility` (keyed on `proposal_id`, version chaining like the project folio); `ProposalFolioStrip` mounts on the proposal render in `doc/[id]/page.tsx` (engagement_kind==='proposal' branch). **Folio proposal leg is keyed on `proposal_id`; files live under `project-documents/{proposal_id}/…`.**

**R85c — ad-hoc "draft a proposal" for an existing household.** `useOpenDraftProposal()` → `openDraftProposal({ clientId, clientName? }): Promise<string /* proposalId */>` creates an EMPTY draft (no template) linked to the household, stashes the room origin, and walks into `/drafting/[id]`. `DraftProposalSheet({ open, onClose })` reuses the R73 `ClientPicker` (invite-and-link included) so the ⌘K cold start can pick the household. `useCreateProposal` gained the additive `{ errorSurface:'inline' }` option (toast-free on the Document surface). **The ⌘K "draft a proposal" row is left to integration** (command-bar untouched per ownership).

**Templates retired (R85).** The ad-hoc + Discovery-seeded paths are both template-free. The legacy `/portal/proposals/new` template picker is **left untouched per D7** (old zones keep functioning until the dissolve) — retirement is the posture, not a deletion of the phased-out zone page.

**R86 — the portal copy is canonical, tier-governed.** A single pure law — `proposalTierVisibility(tier)` in **`@patina/utils`** (imported by BOTH the client render and the mirror; the two provably cannot drift) — decides which blocks render. The Drafting mirror (`proposal-mirror.tsx`) now renders the **same shared @patina/design-system blocks** the client renders (LineItemsBlock · PaymentScheduleBlock · ScopeRoomsBlock · ExclusionsBlock · TimelinePhasesBlock), gated by the tier, plus a **tier setter instrument** on the preview (reuses `useUpdateProposal` `client_visibility_tier`, `errorSurface:'inline'`). The client render (`proposal-document.tsx`) gates the same blocks on the same law.

**The tier-gating contract — what each tier hides:**
| block | full | milestone | curated |
|---|---|---|---|
| itemized line items (per-line prices) | shown | **hidden** | **hidden** |
| per-room budgets | shown | **hidden** | **hidden** |
| payment schedule (milestone amounts) | shown | shown | **hidden** |
| timeline · exclusions · scope-room names · the one rolled-up total | shown | shown | shown |

`lineItems`/`roomBudgets` mirror the shipped `isClientHidden('cost', tier)` (full shows, milestone/curated hide). At milestone/curated `LineItemsBlock` is handed no items, so it renders the single rolled-up **Total** row (preview = truth). ⚠ **Design call a designer would notice (flagged for ruling):** `paymentSchedule` shows at milestone but hides at curated — that is NOT derivable from `isClientHidden` (which treats milestone==curated); it is the R86 refinement giving the three tiers a monotonically-narrowing render. If curated should also show the schedule (or milestone should hide it), change the one table in `packages/utils/src/proposal-visibility.ts` and both surfaces follow.

**R43 contract refined for R86.** The mirror now DOES carry the client-facing SELL figures the client sees at 'full' (line_total_cents, allowance ranges, per-room budgets) — tier-gated, not forbidden. The refined `proposal-mirror-contract.test.ts` still forbids the truly-internal columns the client sees at NO tier (trade cost, markup, margin, design_fee), still filters `tbd`, still bans stray writes in the projection. New `proposal-tier-gating.test.ts` pins the per-tier table AND asserts both surfaces import the shared law (anti-drift). **Consistency fix:** the client itemized list now also filters `tbd` pieces (R43's "the client must never see tbd" belongs on the canonical client render), and the legacy `SelectionsList` hides per-item prices when `lineItems` is gated off.

**Verified.** 00252 applied locally clean (column + widened owner CHECK + 3 table policies + 2 storage policies; proposal-anchored insert smoke-tested with project_id null). designer-portal + client-portal tsc: **zero errors in every touched file** (remaining app errors are the pre-existing unbuilt-`@patina/api-routes` / demo-page baseline). 334 designer document jest green incl. the two proposal contracts (12 assertions). D4 shadow grep clean on all touched files. No toasts — every new Document mutation carries `errorSurface:'inline'`.

**Provisional / owed (integration):**
- ⌘K "draft a proposal" row → mount `DraftProposalSheet` + trigger it (command-bar left to integration).
- The client's proposal copy does not yet RENDER the flagged proposal-folio files — 00252 opens the client read leg (the data path is ready); a small flagged-file list on `apps/client-portal proposals/[id]` is the remaining leg of "space plans reach the client copy."
- `proposalTierVisibility`'s `paymentSchedule`-at-curated call awaits a design ruling (see the ⚠ above).
- `@patina/utils` + `@patina/design-system` dist were rebuilt so client-portal (dist-resolved) type-checks; a clean CI runs `pnpm build` first anyway.

---

## The Document — Wave 2 · the Post + the long tail + integration — 2026-07-02

### I48 · Wave 2 tracks + integration on main (R82 · R87 · R88 · R89 · R90)

Five parallel worktree builds over frozen seams (command-bar left frozen; ⌘K wired in the integration pass — the Wave-1 pattern), merged in order: Decisions `611cc651` → the Post `a39c378b` → Library `7ad5a902` → Help+Scan `6b610b02` → Proposal `fb20e6e5` (one additive import conflict in `drafting-room.tsx`, resolved keeping both) → integration.

**R82 — the Post.** The Studio Drawer bell no longer exits to `/portal/inbox`; it dispatches `document:open-post` and a charcoal Drawer-weight `PostSheet` (bubble-phase Esc, a drawer peer of the ledgers) mounts beside them with two R28 pages: **Letters** (`useInboxMessages`) and **the Record** (`useInboxNotifications`), read-on-open via the mark-read route, D8 dot unchanged. `post-derivation.ts` classifies each notice: a type that already derives a Desk need renders as a quiet **"on your Desk ↗" cross-reference** (never a duplicate act), unmapped notices are plain records. Letters open a **shared** People thread via a new `/people?thread=` reader (mirrors the person-param block). A mobile bell was added (there was none). ⚠ two design flags for Leah (non-blocking): the bell lands on the Record while Letters is the leftmost link; the dot reflects Record unread only (`useUnreadInboxCount` unchanged).

**R87 — decision edges.** In the margin `DecisionBody`, **Extend on a stored-expired decision now revives it** (bump due_date via `useUpdateDecision`, then `useUpdateDecisionStatus` expired→pending — the 00171 transition already existed; button "Extend & reopen") so the client can respond again; on a still-live decision Extend keeps due-date-only. **Delete stays draft-only** (guard in `item-composer`; the shared `decision-edges.ts` predicates `extendRevivesDecision`/`canDeleteDecision` are the one law both surfaces read). No migration.

**R88 — the Library's working acts.** A shelf-header **Import…** on My Library (reuses `catalog/import`'s CSV/lazy-SheetJS parse → `/api/catalog/import`; rows land as `status:'draft'` raw captures that fire the teaching-queue trigger → "Needs teaching"); a **validate** teach-fold lens per card (Agree/Disagree over `useValidationQueue`/`useSubmitValidation` — the distinct `needs_validation` queue) rendered where Quick Tags would otherwise be (a piece is in one queue or the other); **field-grain search** beside the librarian bar extending `useCrossLayerSearch` from name+brand to name/SKU/maker/category. Collections/categories stay deferred (R88). No migration. Note: the 4-field default widens the Engine's keyword fallback + legacy `/portal/library/search` too (strictly more inclusive).

**R89 — the help affordance.** The Document shell wraps in `SurfaceKeyProvider` and mounts `ContextualHelpPanel` (layout siblings; the shell has no utility bar). Each surface declares its key via `useDocumentSurface`; `openHelp()` (window event) opens the panel scoped to the current surface. The browsable Help Center is re-homed to a paper `/help/**` route group (old `/portal/help` stays until the dissolve, D7). The shared panel is reused minus its design-system shadow (the sanctioned `shadow-none`); a full paper repaint of the Layer-2 slide-out would touch `packages/help-system` (deferred).

**R90 — the scan opens as a sheet.** A new `scan-viewer-sheet.tsx` (a `doc-file-viewer` sibling, z-[60] paper, capture-phase Esc) fetches the `RoomScan` by id (`useRoomScan`) and renders the reused-as-is `RoomScanViewer`. The letterhead "The scan" instrument now opens the interactive sheet instead of the static image; it also opens from the Folio and Discovery. `/portal/rooms/[id]` is superseded (deletion rides the dissolve, D7). ⚠ the Folio scan door is dormant until a producer writes a `room_scan` folio chip (flagged, commented). No migration.

**Integration pass (`main` after the five merges).** ⌘K registry rows added: **the Post** (`openPost`), **Draft a proposal** (R85 — `openDraftProposalPicker` + a layout-mounted `DraftProposalOverlay` hosting the R73 ClientPicker cold start), **Help…** (`openHelp`), and the Wave-1 owed **Add a maker** (R78 — `/people?add=maker` cold-starts the add sheet in maker mode via a new `initialKind` prop). `AccountBand` now forwards the household name to the Amendment sheet (was `''` → "the client"). **Migration 00253** closes an IDOR: `apply_scope_change` (00084, SECURITY DEFINER) now requires the caller to own the project before it mutates budget/fee/timeline + inserts rooms/FF&E.

**Verified (integration on main):** tsc 0 new errors, 399 designer document+help jest green, `next build` exit 0, db reset clean through **00253**, `project_documents.proposal_id` column + the `apply_scope_change` guard SQL-confirmed.

**Deferred / owed:**
- **Margin MONEY fold for open amendments** — needs a new margin kind + read-model change (not cheap); the Amendment sheet's own on-project strip already surfaces open amendments. Helpers ready in `lib/document/amendment-derivation.ts`.
- **FF&E line-unfold "add a vendor" doorway** — the ⌘K "Add a maker" now covers vendor creation globally; the per-line doorway is a further convenience, deferred.
- **Client proposal-folio render** (R85b's client leg is data-ready; the client-portal file list is owed), the **R86 `paymentSchedule`-at-curated** ruling, the **R82 bell-landing/dot** flags, and the **spec v1.7 fold** (R61–R90).
- Prod catch-up (00230–00253 + `proposal-nudge` fn) still blocked on LAN access to the prod box.

---

*Entries: D1–D14 · O1–O7 (resolved) · I1–I48 · R1–R70 (+R68.1) · R72–R91 (R71 = proposal-watch, logged in the project) · L1–L4 · THE GO · FLIP CONFIRMED · last id = I48 (rulings end at R91)*

*Entries add: I47 · migration 00252 · last id = I47*

---

## The Document — the offline signature (R92) — 2026-07-02

### R92 · The designer can record a signature made on paper

When a client signs a physical contract, the designer needs a way to move the proposal past the proposal phase. `sign_proposal` (00210, R44) can't do it — it is client-authorized (`client_id = auth.uid()`) and a designer session is rejected by design. Its designer-authorized sibling is **`record_offline_signature`** (migration **00254**): the same one-act/many-surfaces grammar — settle the `approval` `client_decisions` row, flip the proposal to `accepted`, log an engagement event, and (default) activate the project via `activate_proposal_as_project` — but the caller is the proposal's **designer** and consent is recorded as **`'paper'`** (new value on the `client_decisions.client_consent_method` CHECK) rather than `'electronic_signature'`.

Because it delegates to the same activation, the whole proposal (rooms, FF&E, phases, milestones) carries into the new active project exactly as a digital sign would.

**The rulings inside R92:**
- **Issued proposals only.** Signability is `('sent','viewed','expired')`. A `draft` (never issued) is out — the designer Sends it first; the act does **not** appear in the Drafting Room. `declined` (explicit client rejection → must be re-issued) and `revised` (superseded) are excluded.
- **A paper signature is not time-boxed** — there is no `valid_until` expiry guard, so a proposal that lapsed digitally (`expired`) can still be recorded.
- **The engagement event is `'signed_offline'`**; the signer's printed name lands on `signed_by_name` / `client_signature`; `signed_ip` is null. The optional signing date the designer enters seeds the activated project's `start_date` (phase/milestone anchoring).
- **No client confirmation email.** Unlike the client sign route (which fires `proposal-sign-confirmation`), an in-person paper signing doesn't send one.

**The surface.** A **Mark signed →** act on the proposal watch view (`proposal-watch.tsx`), beside Request-a-change / Nudge, shown for `sent`/`viewed`/`expired`. It opens `MarkSignedSheet` (two fields — who signed, when — on the DocSheet frame, D4/D1/R83) → `useRecordOfflineSignature` → invalidate `document-state` → walk into `/doc/{projectId}`. Extends the I7 two-step activation net; sibling to R44's `sign_proposal`.

**Verified.** db reset clean through **00254**; SQL smoke green — the CHECK admits `'paper'`; the designer path produces `accepted` + back-linked proposal, exactly one `paper` approval decision, an `active` project matching the returned id, and a `signed_offline` event; idempotent on re-call (same project, no duplicate approval/project); a **client** caller is rejected (`insufficient_privilege`) and `declined`/`draft` raise `check_violation`. `@patina/supabase` + designer-portal tsc: **zero errors**. Additive only (D7): `sign_proposal` and the legacy /portal sign route untouched. ⚠ Not on prod (rides the 00230–00254 catch-up); live Chrome walk owed. Spec v1.7 fold still owed (R61–R92).

*Entries add: R92 · migration 00254 · last id = R92*

---

## The Schedule & Boards program — Wave 0 · defects & dead wiring — 2026-07-07

### I49 · Wave 0 built: boards carry through revision · RFQ email real · the Record reads procurement · bulk vendor reassign

Program source: the Programa parity-or-beyond plan (Kody's ruling round 2026-07-07: full loop · tokenized view-only share links + account-bound verdicts · boards leapfrog, no Pinterest v1 · build straight through, worktree waves). Two branches off `main`, Fable adversarial review, merged together.

**Boards (0A).** Migration **00260** re-declares `clone_proposal` (verified byte-identical to 00176 outside the additions) + a boards deep copy: `scope_room_id` → `v_room_map`, `palette_id` → `v_palette_map` (palettes were already cloned), **`capture_id` KEPT** (the render reads the `data` snapshot; the FK is SET-NULL self-healing; captures stay deliberately un-cloned), `product_id` kept (global catalog). Function remains **SECURITY INVOKER** — RLS is the authorizer. The client's mood-board render is promoted to `@patina/design-system` (`BoardsBlock`/`BoardComposition`, pure presentational) and now renders on all three proposal surfaces — client copy, designer `/preview` (legacy `mood_board_urls` strip is fallback-only when zero real boards), Drafting mirror — "preview is truth" extends to boards. New one-round-trip `useBoardsWithItems`. Board picker upgraded to the full 3-layer `scope="library"`. Debt: the shared block carries a second scale-to-fit canvas beside `BoardStatic` (divergent item contracts) — unify later.

**Vendor wiring (0B).** `quote-request-send` edge fn + migration **00261** (`vendor_quote_requests.sent_at`): the API route now inserts an honest **draft** and invokes the fn server-side with the caller's bearer — create+send is ONE user act (deliberate contrast with po-send's separate send act). Ownership re-check with 404-collapse; recipient chain `override → orders_email → contact_info->>'email'` (`preferred_contact` intentionally unused — lockstep with po-send); `422 no_recipient` leaves the draft honest. ⚠ A direct re-invoke on a `responded` request would regress status→`sent` — add a guard when a resend UI arrives. **The Record reads two ledgers**: `procurement_notifications` (00151/00189) merged with `notification_log` into one `RecordItem` list — `damage_claim_drafted` renders as a Desk cross-reference (the R82 rule), due/delivery kinds as plain notices; bell dots sum both unreads (D8 awareness-not-count); the procurement leg is poll-only (60s stale) so the dot may lag a trigger write. **Bulk vendor reassignment** enabled on the FF&E workspace — PO-linked lines are skipped by design (an ordered line's vendor is a procurement fact; act on the PO instead), the guard enforced in the dialog AND the server-side predicate; stale selections surface as per-item skip warnings, never silent partial writes.

**Verified at merge (integration branch).** `db reset` clean through **00261**; SQL smoke: clone carries boards+items on the integrated DB; `@patina/supabase` vitest **320/320** (incl. one pre-existing red fixed: the damage-claim insert test read the W5-T2 array shape as a single object); designer jest post/reassign suites **50/50**; deno **17/17**; turbo builds designer+client green. **Owed:** browser e2e run (blocked on designer `.env.local` + the CLI 2.72.7 legacy-key gap), live send smoke (`EMAIL_DEV_MODE`), Post visual check — all ride the Wave-1 walk; `database.types.ts` regen (the committed file is stale against main's own aesthete tables — a separate chore, not folded into a feature merge).

*Entries add: I49 · migrations 00260–00261 · last id = I49*

---

## The Schedule & Boards program — Wave 1 · the Schedule + the Board Room — 2026-07-07

### I50 · Wave 1 built: doc codes · lead times · reorder · search · line unfold · twins ∥ board sections · modes · utilities

**Track S.** Migration **00262** adds `doc_code` to `proposal_items` + `project_ffe_items` and redefines `activate_proposal_as_project` off the TRUE head — **00199, not 00180 as supabase/CLAUDE.md claimed** (doc corrected; lineage now 00140→00167→00180→00185→00199→00262). Byte-diff: 4 lines, all `doc_code`. Auto-suggest keyed to the 00128 taxonomy slugs (CH/TB/LT/RG/CS/TX/AR/AC/PL/AP), consonant fallback, per-prefix per-document sequencing, never overwrites a typed code; card renders the code as a mono clay eyebrow. **Lead-time buckets** (nine, upper-bound weeks into the previously-UI-less `lead_time_weeks`; legacy ints render "N wks" and survive edits). **00263** reorder RPCs (SECURITY INVOKER, duplicate+foreign-id guards, ordinality UPDATE): same-room line drags + room drags, optimistic with rollback; **reorder disarms while filtering** (a global order is never rebuilt from a partial view). Pre-sale bulk bar (move to room · set type · set bucket · delete; R83 inline failures). Search + facet filters on both hosts. **Drafting line unfold** (expand-in-place, D4-linted): gallery · spec · pricing · provenance (Strata-Mark record completeness via piece-progress) · client-vs-internal notes (first `internal_notes` editor); the SAME ItemEditForm mounts inside — one write path, two grammars. **Twin chips** (shared `product_id` or `doc_code`, doc_code outranks; jump-to-twin; no constraint — imports never break).

**Track B.** Migration **00264**: `proposal_boards.sections JSONB` + `status` (active/archived) + `clone_proposal` re-extended (byte-diff: exactly `sections, status`). BoardCanvas's dormant sections/grid lit up: sections CRUD, snap toggle, **Arrange** act (writes x/y only — freeform survives; section bands derive live from member positions; item→section lives in `data.section_id`, no new column). `BoardsBlock` gains `mode: presentation|detail` — presentation output byte-stable (client untouched); detail overlays lead-time + provenance-host on product/capture pins (dormant until handlePick captures those fields). **Duplicate board** (fresh ids, WITH-CHECK-safe rows) · **archive** (every read-only surface — `useBoardsWithItems` AND the mirror's bespoke query — filters `active`; clones inherit status) · **cover chips** (cover → first image → monogram).

**Gate fixes (Fable review).** `shadow-sm` stripped from the shared board tiles (D4 — the Drafting mirror is a Document surface; the app-scoped lint can't see the package). supabase/CLAUDE.md's stale activation pointer corrected. The picker e2e step re-targeted by seed-product name (two seeded chairs; `.first()` was catalog-scope-sensitive).

**Verified at merge.** `db reset` clean through **00265** (incl. the renumbered `room_scans` — the duplicate-00258 fix, main `8f7b072e`); SQL smokes PASS (S1 activation carry roomed + room-less · S3 reorder guards · 00264 sections/status/section_id through clone); `@patina/supabase` vitest **331/331**; designer jest **103/103**; BoardsBlock **5/5** post-strip; turbo builds designer+client **10/10 uncached**; **playwright 9/9 on chromium — the program's first live e2e** (local `.env.local` synthesized from the canonical supabase-demo JWTs after verifying the stack accepts them; suite stays chromium-only per the single-actor law; ⚠ the primary checkout's `.env.local` now points at Strata PROD — never feed it to e2e). Pre-existing red left alone: design-system Text/Heading variant tests (untouched by the waves — separate debt).

**Owed.** Visual Leah-walk screenshots of the S surfaces (the e2e drove the board editor live; no eyes on the unfold yet — folded into Wave 2's screenshot pass) · detail-mode pick-snapshot enrichment (`lead_time_weeks`/`source_url` at handlePick) · cross-room line drag (needs a drop-zone ruling — zones currently mean capture-drop) · batch RPC if schedules outgrow per-item bulk loops.

*Entries add: I50 · migrations 00262–00264 · last id = I50*

---

## The Schedule & Boards program — Wave 2 · the Client's Hand + money & docs — 2026-07-07

### I51 · Wave 2 built: per-field visibility · share links · per-line verdicts · custom fields · spec PDFs · financial lens

**Track C.** `ShareVisibility` per-field law in `packages/utils` — the three tiers become named presets; **supplier/brand finally independent of pricing** (fixes the proposal-document bundling); the legacy block API derives from the same table (R86 anti-drift suite still green — zero drift). **document_shares (00266)**: sha256-only tokens, designer-only RLS, guest access SOLELY through `resolve_document_share` (SECURITY DEFINER, empty-on-miss, view stats); client-portal `/share/[token]` server component renders the SAME ProposalDocument read-only under the share's matrix; designer share sheet on watch + drafting (list/create/copy/revoke; regenerate = revoke+create). **item_feedback + append-only events (00267)**: Approve/Flag/Note per line (sage/clay/muted), exactly-one-of three anchors (ffe reserved this wave), `proposals.feedback_enabled` gate (default on), **a verdict never mutates the line**; designer chips on schedule rows + thread/reply/resolve in the line unfold; `lines_flagged` Desk need; Record item; `client_feedback` rows into notification_log (the Post reads them). Real rollups replace the hardcoded `approvalsPending`.

**Track S².** **Custom fields (00268/00269)**: `spec_field_defs` with immutable `field_key` slugs; values live in `custom_fields` jsonb on BOTH item tables keyed by slug — so activation AND clone carry values VERBATIM and deep-copy defs (both redefinitions byte-diff-proven; bases 00262/00264 confirmed HEAD). **spec-pdf edge fn**: per-item sheets + whole-schedule export; **money-never-trade is structural** (the model types cannot hold trade/markup — a test scans every key); client price renders only under `visibility.pricing`; record-completeness mark mirrors piece-progress. **Financial lens**: owner-gated money view (trade · markup% · client · margin, section + document totals) on both hosts + the FF&E page; bulk markup from the Wave-1 bulk bar (allowance/tbd skipped with feedback); post-sale money edits display-only pending a ruling; ⚠ markup-SETTING is not owner-gated (it defines client price; only margin visibility is sensitive) — confirm the line.

**Gate fixes (Fable).** Guest surface tightened three ways: the client's EMAIL removed from the anonymous RSC payload (name stays for the letterhead); the boards fetch removed from the guest route (guest boards are Wave 3 · B3 — the client-side wrapper RLS-fetches zero rows for guests, so the summaries only leaked names/covers); **anon EXECUTE revoked on every Wave-2 function** — a two-stage discovery: REVOKE FROM PUBLIC alone was insufficient because the stack's DEFAULT PRIVILEGES grant anon explicitly at function creation, so every revoke reads `FROM PUBLIC, anon` — proven durable across a from-scratch reset. `notify_item_feedback` granted to authenticated (the AFTER-INSERT trigger calls it as the inserting client; verdict → created event → client_feedback notification proven live under least privilege). ⚠ Pre-existing: the 00255 feedback-layer functions carry the same anon grants — inherited debt, untouched here. ⚠ Prod note: notify_item_feedback inserts into notification_log as DEFINER — confirm the prod function owner bypasses that table's RLS (the call is best-effort/non-fatal either way).

**Verified at merge.** db reset ×3 clean through 00269; SQL smokes PASS (S6 defs+values through clone · C3 verdict→event→notification under tightened grants · share grant posture anon=f/authed=t/service=t POST-reset); utils **367/367** (this wave also fixed the broken utils jest config + 10 latent timezone failures); supabase vitest **331/331**; designer jest FULL SUITE **794/794**; deno **30/30** (`--allow-env --node-modules-dir=auto` required here); builds **10/10**; e2e chromium **boards 9/9 + share-link 2/2** (the client-portal spec needs a running :3002 dev server — its playwright webServer entry is commented out). Screenshots committed under `screenshots/schedule-boards-wave2/`.

**Owed.** C6 designer EMAIL leg (in-app path complete; email follows the decision-resolved-notify precedent) · the board-presentation screenshot (needs a seeded sectioned board) · `sourceUrls` is a no-op toggle until a per-line source renders in the client doc · spec-pdf `itemDetails` gating (forward-compat stub) · post-sale custom-field editing UI (the FF&E drawer is the natural home) · re-enable the client-portal playwright webServer.

*Entries add: I51 · migrations 00266–00269 · last id = I51*

---

## The Schedule & Boards program — Wave 3 · the moat — 2026-07-07

### I52 · Wave 3 built: taught alternatives · escalate-to-Decision · provenance · capture-from-URL · boards on shares · pin feedback · send-to-schedule · boards past signing — the program's build phase is COMPLETE

**Track A (Designer-Taught Intelligence — never "AI").** `suggestion_events` (00270, designer-own RLS) is the training ledger — every shown/accepted/dismissed suggestion logged. `find_taught_alternatives` (00271, SECURITY INVOKER — products RLS scopes the corpus; personal +0.15 / studio +0.10 boost, SQL-proven: a personal 0.700 similarity outranks a catalog 0.800), keyword-filtered from the client's note (naive by design, no LLM calls; negation-blind — noted). The **Alternatives band** on unresolved rejections in the line unfold: **Swap** (atomic swap + resolve + signal via `swap_line_to_product` — INVOKER, owning-designer guard, vendor copied for line coherence, qty/doc_code preserved) · **Dismiss** · **"Put it to the client"** (C4 — Decision Composer prefilled with the rejected product + shortlist picks; `item_feedback.decision_id` stamped; requires a project — project-less escalation from a sent proposal needs a ruling). The Desk flagged-lines need deep-links into the first flagged unfold. **A2**: source host + a record-completeness mark on client/guest product lines (makes the Wave-2 `sourceUrls` toggle real). **A3 `capture-from-url`**: og/JSON-LD/meta extraction behind a full SSRF wall (scheme allow-list, literal+DNS private/link-local/loopback blocks incl. IPv6, ≤3 re-validated redirects, 5s/2MB/text-html caps — hostile-matrix deno-tested); **Add from URL** lands personal-layer drafts with provenance from birth; **Refresh from source** on the Piece shows a per-field-accept diff — a verified record is never silently overwritten. **B6**: the board rail ranks corpus-first and logs signals; silent-degrade preserved.

**Track B finale.** **B3**: guest shares render boards (service-resolved server-side, presentation mode, `itemDetails`-gated — the Wave-2 deliberate absence closed); board PDF export via `spec-pdf kind:'board'` (money-never-trade holds structurally for boards). **B4**: pin verdicts — client Approve/Flag/Note on product/capture pins, designer chips via a `renderPinOverlay`/`renderPinDetail` seam on the shared block (undefined-by-default keeps guest renders byte-stable, asserted); flagged pins join the `lines_flagged` Desk need + Record. **B5**: **"Send to the schedule"** from a pin (snapshot→proposal_item with auto doc_code + the Wave-1 twin guard) and a quiet "price moved" drift chip (one batched price query). **B8**: 00272 alt-owner `project_id` on proposal_boards (the 00252 folio pattern; exactly-one CHECK; designer + client-read legs) + 00273 `continue_board_in_project` — the signed snapshot stays frozen as the record; the continued board is live, editable, project-owned; editor + hooks are owner-agnostic. **`clone_proposal` needed NO redefinition** — the builder proved the existing `proposal_id = p_source_id` filters already exclude project-owned rows by NULL semantics (and caught that the brief's "HEAD = 00264" pointer was stale; the true head is 00269).

**Verified at merge.** Zero-conflict merges; db reset clean through **00273**; anon=false on all four new functions; B8 live smoke (snapshot → editable project-owned board, designer role); supabase vitest **337/337**; designer jest **809/809**; BoardsBlock **9/9**; deno **50/50**; builds **10/10**; e2e chromium **boards 9/9 + share-link 3/3** (now incl. the guest-board render; the client-portal playwright webServer is re-enabled — specs self-boot).

**Owed at program close.** Leah-walk screenshots for board presentation + the Alternatives band (local seeds carry no product embeddings, so the band silent-degrades — seed embeddings or walk on Strata) · the C6 designer-email leg · the 00255 feedback-layer anon grants (inherited) · post-sale custom-field editing UI · spec-pdf `itemDetails` gating · **prod deploy of the whole program** (migrations 00260–00273 + edge fns spec-pdf / capture-from-url / quote-request-send — rides the Strata cutover) · rulings queue: markup-setting-not-owner-gated · project-less C4 · post-sale money edits.

*Entries add: I52 · migrations 00270–00273 · last id = I52*

## The Field Coordination program — waves 0–5 · 2026-07-08

### I53 · Built: field parties (gc/sub/installer/receiver) · two-way SMS spine with LLM parse · login-less field links · Desk triage · phase timeline — designer-centric SMS→structured-status, first in category

**Rulings (Kody, 2026-07-08):** field-first + light PM (no kanban/labels/comments/assignee parity — quarantined as optional Wave P) · ONE Patina 10DLC number platform-wide (conversation key carries `twilio_number` so per-studio is config later) · LLM-first hybrid parse (STOP/HELP/keywords deterministic → menu replies deterministic → claude-haiku-4-5 against the party's open items; ≥0.8 applies + confirms, 0.5–0.8 asks one clarification, <0.5 → Desk triage; nothing silent below threshold). Programa walk (live trial) confirmed the seam: their contact types are Supplier/Client/Other — no field-party modeling, no SMS, no site status channel anywhere in the design-tool category.

**Schema (00281–00283).** `project_parties` widened (+sub/installer/receiver, `trade`, trigger-normalized `phone_e164`, party-level `sms_consent_status` not_asked→pending→granted/opted_out); `project_tasks.owner` + `client_decisions.court` CHECKs widened (00219-view audit: NO hardcoded court pivots existed — new courts fold in free). `sms_conversations` (state machine: idle/awaiting_project_choice/awaiting_confirmation + `state_context` menus) + `sms_messages` (`twilio_sid` UNIQUE = idempotency claim; parse/confidence/needs_review/applied_effect). **`apply_field_effect`** is the single field-mutation choke point (SMS, /field page, triage — behavior can never diverge): mark_done (task or `resolve_coordination_item` w/ cascade; selections refused from the field), report_delay, flag_blocker (RFI in designer court + blocks task), punch_report, confirm_delivery, note; party-pinned project scoping makes cross-project target forgery impossible even for trusted callers; REVOKEd from authenticated (service-role/DEFINER only). `review_sms_message` = designer triage handle (team-authorized incl. owning designer — `is_project_team_member` does NOT include the owner; every new policy ORs `projects.designer_id`). `field_link_tokens` clones the 00266 hash-at-rest pattern (create=regenerate, resolve = SECURITY DEFINER narrow DTO — no pricing, no client PII). `margin_items` + `field_sms` branch (00219 body verbatim otherwise); `field_activity_summary` SECURITY INVOKER rollup; `field-media` bucket (project/… team-read, holding/… service-only). `project_phases` needed NO date columns — 00066 already ships `start_date`/`target_end_date` (plan premise wrong; timeline reads them).

**Edge (00284 + fns).** `sms-dispatch` gains the partyId path (user-JWT callers authorized against the party's project via gateway-verified claims; service_role bypasses); `_shared/sms.ts` `sendPartySms` = one send path (consent gate — only `sms_optin_invite` may reach 'pending'; SMS_DEV_MODE dry_run/redirect mirrors EMAIL_DEV_MODE; quiet hours 8am–8pm FIELD_TZ → 'deferred', flushed by the digest). `field-daily` cron (13:00 UTC — winter-CST timing flagged in the runbook): ONE digest/day with a numbered menu persisted to conversation state (menu replies parse deterministically, zero LLM), delivery-window confirms off `delivery_events`, deferred flush; per-nudge spam deliberately not built (A2P-friendly). `sms-inbound` (4th verify_jwt=false fn): raw-body → X-Twilio-Signature (HMAC-SHA1 over `SMS_INBOUND_PUBLIC_URL`, doc-vector-tested) → sid idempotency → **compliance keywords before everything** (STOP et al = phone-global opt-out; YES grants pending; never LLM) → MMS → media bucket → menu/state parse → `_shared/field-parse.ts` (haiku forced-tool-use, injectable client) → confidence gate → TwiML reply logged as outbound row. `create_field_link` redefined for service-role callers (auth guard only; owner path byte-preserved). Templates seeded into `email_templates` (renderer's table; no operational category exists — transactional). Assignment triggers (court_party_id / owner_party_id → sms_court_assignment) + consent-pending trigger (UI writes the row; the DB sends the invite) per the 00105 pattern.

**Surfaces.** client-portal `/field/[token]` (share/[token] sibling + middleware exemption mirroring /share/): "On you" big-thumb Done/Problem(+photo)/Confirm rows through `apply_field_effect` `p_source='field_link'`; a revalidation race (freshly-mutated DTO yanking a just-completed row) fixed by freezing the initial row list; photo storage paths ride the note text (`[photo: project/…]`) because flag_blocker drops p_effect.media and there's no sms row to carry it. Designer portal: People Room add-person gains the four field kinds + trade + consent toggle; `party-profile-sheet` (consent chip, field-link mint/regenerate, SMS thread w/ MMS thumbnails, composer gated on granted); Desk gets needs-review triage cards + an "In the field" need-line section (no tiles — Desk philosophy holds); Post renders `field_sms` (needs_review floats, logged settles); court label maps widened; `phase-timeline.tsx` on the doc page (status-tinted spans, today line, unplaced chips, popover date editing). GC roster rows now open the party sheet (supersedes the old gc PersonProfile — intentional upgrade, revert if wanted).

**The environment discovery that ate the merge:** Supabase's 2026-05-30 platform-default flip means fresh local stacks no longer auto-grant table/function privileges to anon/authenticated — AND migration REVOKEs become creation-order no-ops, so the final ACL state is unreconstructable from the DB; the migration TEXT is the only truth. Fix: `supabase/seed/00-legacy-grants.sql` (GENERATED — `scripts/generate-legacy-grants.py`), first in `[db.seed] sql_paths`: legacy blanket baseline + ordered replay of all 296 top-level GRANT/REVOKEs from migrations (dollar-quoted bodies + comments stripped; per-statement guards for dropped objects). Local-only (seeds never run on prod). Convention forward (supabase/CLAUDE.md): post-flip migrations must GRANT explicitly — never rely on creation defaults. ⚠ Verify Strata's own default-privilege posture before the next table-adding prod migration. Also fixed: designer playwright webServer env now carries `the-document-pilot:true` (it pinned FLAG_OVERRIDES, beating .env.local — Document-route specs redirected to /portal on any fresh server).

**Verified at merge.** Zero-conflict merges (A→B∥C∥D); db reset clean through **00284**; SQL suite **23/23**; deno **45/45** (twilio-verify vectors, consent/quiet-hours, digest+dedupe, inbound keywords/idempotency/confidence-gating); designer jest **79 suites / 848**; builds **18/18**; e2e chromium **designer field 3/3 + client field-link 3/3 + share-link regression 3/3**; Track B live smoke (serve + signed curl → 200 TwiML + rows; tampered sig → 403).

**Owed at program close.** Twilio Brand+Campaign registration (1–4 wks — runbook `docs/field/sms-10dlc-runbook.md`, START NOW) + 5 secrets + Messaging-Service webhook pointing · **prod deploy** (migrations 00281–00284 + edge fns sms-dispatch/field-daily/sms-inbound + config.toml verify_jwt entry + pg_cron — and validate the Kong `?apikey=` question against Strata for the signed webhook URL) · client-portal server-side PostHog (field_link_opened/field_action_applied noted in code, no server client exists in that app) · receiver SMS → `receiving_inspections` auto-create (deliberate v1 lighter path) · notFound() 200-status pattern on guest links (pre-existing, affects /share too — DeadLink is the house workaround) · winter cron/FIELD_TZ check at cutover · Wave P (Programa-parity PM) unscoped by ruling.

*Entries add: I53 · migrations 00281–00284 · last id = I53*

## The Document — the discoverability review (R93–R96) — 2026-07-09

**Rulings (Kody, 2026-07-09, via the discoverability review deck v2 — `docs/design/the-document/discoverability-review-2026-07.html`):** four rulings on ⌘K, empty states, the Desk's front matter, and sheet presentation, plus the registry consolidation and the Foundation fixes that shipped alongside them without needing a ruling.

### R93 · The Populated Palette

⌘K stops opening empty. It opens **populated** — in-hand first, then recent, then surface-scoped verbs, then begin verbs, with rooms & ledgers grouped under DM-mono group eyebrows. Every row carries its registry icon, a visible shortcut hint, and generous aliases (a designer types what she calls the thing, not what we called it). A zero-result query never dead-ends — it recovers into help. This is within canon, not a new grammar: it is the sanctioned unfreezing of the ⌘K registry that stayed deliberately frozen through the Schedule & Boards and Field Coordination parallel builds (command-bar left frozen; ⌘K wired only in integration passes) — the registry was a seam boundary, not a design ban. Grounded in NN/g recognition-over-recall and the review's hidden-nav evidence.

### R94 · The Marginalia

Empty states teach — what, why, and next — in the studio's editorial voice, not a wizard: the FieldDesk quiet state, the empty Desk, and the People room's empty room all gain the fold. A first-touch **margin-note primitive** may appear once per surface and **recedes permanently on use** — R89's ambient half, finally built. **No tours.** No coachmark sequences, no step-through, no re-arming.

### R95 · The Contents Page

AMENDS R5: R5's four destinies (document section / ledger / margin / quiet exile) gain a fifth — **the index**. The Desk gains standing front matter, "The Studio": a typographic contents of rooms, ledgers, and begin-verbs — labels, doorway glyphs, and icons, constrained to **never** carry counts, tiles, or metrics (that would be the dashboard R5 already forbids). Home is not a document, so D1's strict-focus law does not reach it. The empty Desk — previously the thinnest surface in the product — gives the index its full typographic weight.

### R96 · The Laid Sheet

AMENDS D14's presentation only — the weights and physics D14 set stand untouched. Ledger sheets (Orders, Hours, Accounts, People) stop arriving as the charcoal bottom slide-up (`doc-sheet.tsx`) and converge on the centered paper-folio treatment the product already uses elsewhere (`paper-folio-sheet.tsx`): a warm veil, a `--doc-paper` panel, a registry icon + DM-mono running head, and a visible "Put back · Esc." The document stays mounted beneath exactly as D14 already required. Guardrail carried forward unchanged: **a sheet stays one page.**

### I54 · The registry becomes the single source; Foundation ships without a ruling

`src/lib/document/registry.tsx` becomes the studio-surface registry: one definition of every surface's name, icon, alias set, and shortcut, consumed everywhere a surface is named or opened — ⌘K, the drawer, the new Contents page, sheet chrome. One name, one icon, everywhere; no more per-surface copies drifting apart.

**Foundation (F1–F6) ships with no ruling required** — none of it touches a locked decision, so none of it needed Kody's round: palette/door/help instrumentation, a flight-ledger read on PostHog OAuth (**owed** — the instrumentation writes events; nothing reads them back into a ledger yet, blocked on the OAuth connection), the People search repair, the ⌘K person deep-link, the `/help` door, and the Bell label.

*Entries add: R93–R96 · I54 · last id = I54*

## R97 · The Walkthrough — help, taught at the Desk (2026-07-10)

**Amends R94, narrowly.** R94's "no tours" holds as the default physics of the document world. One exception is ratified: a **first-signin coachmark walkthrough of the Desk** (tour id `desk-walkthrough`, six steps, about a minute), plus explicit-replay entries (⌘K "Take the walkthrough", the /help pinned row, `/desk?tour=desk-walkthrough`). No other tour, coachmark sequence, or re-arming is licensed by this ruling.

Terms:
1. **The tour never leaves /desk** and never picks a document up — R4's timer must never lie. No step may route into `/doc/`.
2. **Gate:** the auto-offer (WelcomeModal) fires only for accounts created on/after `DESK_WALKTHROUGH_SHIP_DATE` (constant in `desk-walkthrough.tsx` — bump to the prod deploy date at ship), on a ≥980px viewport, after help-state hydration and the desk read resolving. **Existing designers are never auto-modaled** — they receive a one-time R94 margin note (`desk-walkthrough-offer`) whose named act starts the tour.
3. **Dismissal semantics:** declining the welcome ("Explore on my own", Esc) records `tours['desk-walkthrough'] = { abandoned, atStep: 0 }` — the durable, cross-device welcome-shown marker. Replay entries stay live regardless (restart clears persisted state through the backend).
4. **Copy is canon:** the six step texts and the welcome text ship as hard-coded fallbacks in the component AND as Sanity coachmark docs (`designer-portal/tours/desk-walkthrough/*`). The fallbacks make the tour Sanity-independent; Sanity edits may refine wording, but meaning changes return to a ruling.
5. **Suppression:** the `desk-first-touch` margin note is suppressed while the welcome or tour is active, and marked seen on completion — the tour taught ⌘K.

Adjacent rulings folded in:
- **The I54 registry** gains an optional `help: { surfaceKey, blurb }` per surface — pure data, consumed by the contextual help panel's intro line. R95's "labels + doorways only" is respected: blurbs do not render on the Contents page in this wave.
- **/portal/help is retired to redirects** → `/help`. The re-homed Help Center is the single center; the old routes survive as doorways, not pages.
- **The ? doorway:** sheet heads, ledger front-matter, and the court bar may carry a quiet DM-mono `?` that opens the contextual help panel scoped to their surface — reactive, user-invoked, no floating chrome. Term-level hover tooltips (stamps et al.) remain unlicensed.
- **Content pipeline:** desk help content lives in Sanity (`kv3qrinl`, keys under `designer-portal/document/*` + the tour prefix), authored as drafts, published only at Kody's gate; repo microcopy (registry blurbs, margin notes, empty states) travels through PRs.

*Entries add: R97 · last id = R97*

## The Designer Handoff — scan→request pipeline, Wave 1B portal (2026-07-11)

### R98 · The Desk gains an Open requests strip — pool + claim

**Ruling (Kody, this session, via the design-request pipeline plan).** The client iOS app holds a room scan locally until the homeowner explicitly requests design services; unassigned requests route through an open pool rather than a designer pick at submit time. The Desk gains its own population to surface that pool: **Open requests**, placed **below "Needs your hand" and above "In motion"** — its own strip, not a Shape C need line. `desk-derivation.ts` is untouched by design (the backend contract's `open_design_requests` view already excludes assigned leads; Shape C's `designer_id is not null` filter keeps a pool request out of the folder grid until it is someone's).

One act: **Accept** claims the request atomically (`claim_design_request` RPC, 00286 — first-wins `UPDATE … WHERE designer_id IS NULL`) and opens it directly at `/doc/{lead_id}` as a normal Brief. A losing Accept (another designer won first) shows a quiet inline "Taken by another designer" instead of a toast (R83) and the pool refetches. An empty pool renders nothing — a transient population, not standing front matter, so R94's taught-quiet-state treatment does not apply here.

The open Brief also gains a **scan strip** (`BriefScanStrip`, between the facts block and the TriageBar) — a thumbnail grid over the request's full scan set (`lead_room_scans`, 00285), each tile opening the existing `ScanViewerSheet` (R90's door, unchanged). Renders nothing for scan-less leads. The viewer's own model-URL fetch was fixed alongside it: the client app writes public-style URLs into the private `room-scans` bucket, which 400 — `ScanViewerSheet` now signs the path before handing the scan to `RoomScanViewer`, which incidentally fixes the same class of URL for every existing caller (Discovery, Folio, Letterhead).

**Gate:** behind the PostHog flag `design-request-pool`, fail-closed while loading (mirrors `procurement-workspace-pilot`'s gate). **Pending a Leah walk before flag-enable** — this is a new Leah-facing surface on the Desk, and per the program's own risk log it needs her eyeball before it goes live for real designers, same bar as any other Desk-population change.

*Entries add: R98 · last id = R98*

## The Document — the Schedule package: the Spine & the Rule (R99–R101 · O8) — 2026-07-15

### R99 · The Schedule master direction — the Spine and the Rule — 2026-07-15

**Ruled.** From the four-directions review (Jul 14–15): the Ledger Spine (B)
becomes the project page's architecture, and the Ruled Line (A) becomes its
collapsed header. The Loom (C, lead-time Gantt) and the Almanac (D, the
client-facing commitment ledger) are deferred with their roles reserved: the
spine's procurement thread is the Loom's future front door, and the spine's
milestone rows are the Almanac's future entries. Nothing built now is thrown
away later — we are building the trunk; C and D are branches.

**The core architectural call: A and B are not two components.** They are one
schedule with a folded and an unfolded state, both rendered from one resolved
chain (see R100). There is nothing to sync because there is only one schedule.

**The Rule (folded state).** Sits where the current phase bar sits; pins
beneath the project title on scroll at reduced height (labels fold into the
line; diamonds and the today rule remain). It is three things at once:

- *The glance* — a full-width drawn rule. Phase labels sit above the line at
  natural width, staggered to a second row when they would collide; **nothing
  ever truncates.** Weight encodes status: light for closed, bold for active,
  muted Aged Oak for ahead. Today is a strong vertical Charcoal rule with its
  date in DM Mono. Milestones are diamonds on the line wearing stamp colors.
  Overlapping phases (procurement is the canonical case) render as a parallel
  hairline beneath the main rule, spanning their true dates — the component
  stops lying about sequence.
- *The minimap* — click a phase label and the spine scrolls there and unfolds
  it; click a diamond and the spine opens that milestone's phase with the row
  highlighted.
- *The time surface* — phase boundaries are drag handles; milestones slide
  along the line. All time edits pass the ripple (R100). Anchored entries
  refuse the drag with a firm nudge ("Install is anchored — unpin to move
  it").

**The Spine (unfolded state).** Replaces the Coordination and The Work
sections — they dissolve into it. Each phase is a Playfair heading on a
vertical spine (solid above today, dashed below; the today rule crosses the
spine between rows). Closed phases compress to a single light line with meta
(dates, item count, key signatures). The active phase opens fully. Future
phases show heading, target, and dependency meta in muted weight.

A phase holds three row types: **milestones** (diamonds — sign-off, decision,
delivery, event — with the stamp vocabulary upcoming/due/signed/slipped),
**items** (the existing chips: sign-off, punch — ball-in-court rendered as a
chip on the row), and **threads** (parallel work like procurement, drawn as a
running stitch, never forced into sequence). Hovering a phase heading reveals
three quiet mono actions — + Item, + Milestone, Edit dates; long-press on
touch. **Any phase or milestone can be anchored** — pinned to a hard date,
wearing a charcoal chip, holding its ground when upstream moves.

**Rationale.** The old bar's five failures (truncation, false sequence,
whispered today, withheld dates, and total disconnection from the work) are
all versions of one failure: the schedule and the work were different
objects. The spine makes them the same object — every open question lives
inside the chapter where it belongs — and the rule keeps the glance that the
spine alone would lose. Division of labor: **words in the spine, time on the
rule.**

Prototype: `the-document-schedule-master-direction.html` (all states,
including the interactive ripple and baseline specimens). The rejected
options' full reasoning: `the-document-schedule-four-directions.html`.

### R100 · The chain model — durations and links; dates are derived — 2026-07-15

**Ruled.** A phase is a **duration plus a link** ("4 weeks, following
Schematic Design") or an **anchor** (a pinned hard date). Dates are never
stored as primary truth on unanchored entries — they are computed by one pure
resolver, `resolve()`: chain in; dates, slack, and conflicts out. Both
surfaces render from its output; **nothing else in the app computes time.**
This is what makes the schedule adaptable — a 3-phase refresh and a 7-phase
renovation are the same machine with different links.

**Birth.** The schedule is born in the proposal (proposals and projects are
already the same structure in two views) and is never rebuilt — the client's
signature cuts baseline v1. Three starting points, typographic, no modals:
(i) **the Patina Six** — Consultation · Schematic Design · Design Development
· Procurement & Orders · Installation & Styling · Completion, pre-chained
with studio-standard durations; (ii) **from a past project** — the phase
chain with as-built durations, your history as your estimate; (iii) **blank**
— a ghost line reading "Name a phase…". With an anchored install date the
chain computes **backward** and renders slack (or a Terracotta warning that
the chain doesn't fit); otherwise forward from signature.

**Entry grammar.** Duration fields accept how people talk: `3w`, `10d`,
`Sep 21`. Typing a hard date anchors the entry automatically (chip appears;
one click unpins). Milestones live inside phases as offsets ("3 days before
phase end") or anchored dates, four kinds (sign-off, decision, delivery,
event), and ride their phase when it moves — anchored ones hold.

**Overlap is legal.** Linking a phase to an earlier predecessor — or dragging
its start before the predecessor's end — does not snap back or error. The
phase drops to a parallel thread lane. The schedule permits what reality
insists on.

**Editing: the ripple.** Every time edit previews before it takes: ghost
consequences render in dashed Terracotta (new dates, sliding milestones,
shrinking slack) over the still-solid committed schedule, then a confirm
strip states the change in one honest sentence — what moved, what follows,
what holds, the slack delta, any conflicts — with **Commit** and **Esc ·
Revert**. Nothing moves silently, ever. The ripple flows around anchors; a
drag that would break one names the conflict instead of moving the anchor.
In the spine, any date in a meta line becomes an inline field accepting the
same grammar (`+5d`, `Jul 29`) with the ripple previewed in downstream meta
lines. One grammar, two surfaces.

**Memory.** The signature freezes baseline v1 (phase snapshots). Every
committed change cuts a numbered revision — who, what, why (the reason
defaults to the confirm strip's sentence, editable). Where current dates
differ from baseline, faint **Clay ghosts** mark where the promise stood,
with a toggle. The brand is "Where Time Adds Value" — the schedule earns a
patina: it doesn't hide its history, it numbers it, names it, and holds the
line anyway.

### R101 · Slice-gating rulings: client visibility · item sort · proposal granularity — 2026-07-15

Three calls that gate the build, interviewed and ruled 2026-07-15.

**1 · The client does not see the spine in Slice 01.** Studio-only first; the
client-facing schedule arrives later as the Almanac projection (a filtered
view of the same milestones and stamps). *Rejected:* a filtered spine from
day one — real earlier client value, but it roughly doubles Slice 01's
surface (auth scoping, row filtering, a second audience to QA) and delivers
the client a diluted studio tool instead of the view built for them; a
read-only "peek" link — a third artifact to maintain for marginal value.

**2 · Inside an open phase, items sort blocking-first, then due date.** The
thing holding the line surfaces first — the exception-first instinct that
runs Mission Control runs here too. Ball-in-court survives as a chip on
every row, but it is no longer the grouping. *Rejected:* court groups
(continuity with the old Coordination section, but they bury a blocker in
whosever court it happens to sit); straight due-date order (simplest, but it
hides blockage semantics entirely). The old Coordination grouping dies
consciously here, not by accident.

**3 · The proposal carries phases plus anchored milestones only.** The
client signs against commitments — install day, the sign-off gates — not
against working scaffolding; working milestones are composed after
signature. The baseline therefore freezes exactly what was promised.
*Rejected:* the full chain with all milestones (strongest baseline, but
every working milestone becomes a "promise" and proposals get heavy);
phases only (cleanest proposal, but the baseline can't hold the schedule
accountable for the dates that matter most).

### O8 · Open — do clients see the ghosts and the revision ledger? — 2026-07-15

Unresolved; resolve before Slice 05 cuts. The brand case says full
transparency — the 25% Pledge runs on a public ledger because transparency
is the credibility engine, and a designer who shows her schedule's history
is a designer a client trusts with the next date. The comfort case says
studio eyes only — not every slip needs a client-facing scar. **Leaning
(design authority):** the middle path — clients see revisions that touched
client-facing dates (anchored milestones, install); the full ledger stays
studio-side. Slice 05 builds studio-side only until this is ruled.

*Entries add: R99–R101 · O8 · last id = O8*

### I55 · Schedule package landed — ids substituted, landing scripts authored — 2026-07-15

The Schedule package (the Spine & the Rule) is landed. Three files in
`docs/design/the-document/`: `the-document-schedule-package.md` (Part A +
build plan), `the-document-schedule-master-direction.html` (look/feel
authority), `the-document-schedule-four-directions.html` (rejected options,
for the record). Part A placeholder ids substituted from real workstream
state: R(a)→R99, R(b)→R100, R(c)→R101, O(d)→O8, appended above with the
integrity footer recomputed from the file's real contents.

**Finding (logged, not worked around):** the handoff's landing note names
`scripts/workstream_state.py` and `scripts/append_entry.py` as if they
existed. They existed nowhere in the repo — the package was cut in a
session without repo access. Both were authored this session (stdlib-only,
`--check` dry-run, `--selftest`): the state scanner reads heading lines
only and handles `##`/`###` levels, sub-ids (R68.1), range headings
(R10–R12), and the historical duplicate O7; the appender refuses
non-consecutive ids, never rewrites historical trailers, and recomputes
each batch's footer from the post-append contents — the corruption alarm
the package specifies.

*Entries add: I55 · last id = I55*

### I56 · §0 audit — the schedule builds on what exists — 2026-07-15

The audit-before-building the package mandates, run against main @ 156f6b13.
Findings by the package's own checklist:

**A0.1 · Phases.** `project_phases` (00066) is the table behind "tap a
phase to set dates": `start_date` / `target_end_date` DATE columns,
`duration_weeks`, `sort_order`, status CHECK
(pending/in_progress/completed/delayed), designer-ALL / client-SELECT RLS.
The chain model **extends** it — `duration_days`, `follows_phase_id`,
`anchor_date`, `lane` land as additive columns (migration 00323); nothing
is superseded. Precedence: `duration_days` when set, else
`duration_weeks × 7`, else the stored legacy dates. Live rows carry dates
with no chain — the resolver renders them as-is (source `legacy-dates`)
and never infers order from `sort_order`.

**A0.2 · Items.** Open items are `client_decisions`, widened by 00213
(`coordination_kind` incl. signoff/punch, `court`, `blocks_kind`).
`phase_id` already exists (00084) and is reused; FF&E blocking is already
modeled (`project_ffe_items.blocked_by_decision_id` + `blocks_kind='ffe'`).
The only schema addition is `blocks_milestone_id`. Items with no inferable
phase render in the active phase — a read-time rule, not a backfill.

**A0.3 · Milestones.** No schedule-milestone table exists under any name.
`project_payment_milestones` / `proposal_payment_milestones` are PAYMENT
milestones — a live semantic collision — so the new table is named
`schedule_milestones`.

**A0.4 · The signature event.** A real event surface exists — not a bare
status column: `sign_proposal` (00210) and `record_offline_signature`
(00254) both settle `proposals.status='accepted'` and call
`activate_proposal_as_project` (head body **00279** — not 00274; 00279
reconciles an FF&E dual-pricing regression onto 00274's body and is the
last `CREATE OR REPLACE`, confirmed by grepping every migration for the
function name — the only place `project_phases` rows are created), and
00291's `ae_proposal_signed_dispatch` trigger fires on the accepted
transition. The Slice 05 baseline cut hooks the activation RPC. Nothing to
work around.

**A0.5 · The dissolving sections.** `CoordinationBand` (which renders
`CoordinationWork` inside itself, coordination-band.tsx:153) mounts at
doc/[id]/page.tsx:533 — one subtree, one flip-gate point. `PhaseTimeline`
(the current bar, "tap a phase to set dates") is a separate sibling at
page.tsx:448, untouched in Slice 01; the Rule replaces it in Slice 02.
The spine reuses the band's queries verbatim (useCoordinationItems,
useSectionTasks, useProjectParties, the coordination realtime channel).

**Ruling (code-only): no chain backfill migration.** A0.1 demands
unparseable chains be flagged for manual review, never guessed — a
migration UPDATE cannot flag-and-wait, and the live data is known-dirty
(phases drawn out of order). Slice 01 reads legacy dates through the
resolver's fallback; chain adoption becomes a Slice 03 compose-time human
act, assisted, confirmed, never silent.

*Entries add: I56 · last id = I56*

### O9 · Open — where do The Work's task rows live in the spine grammar? — 2026-07-15

R99 gives the spine three row types — milestones, items, threads. Project
tasks (The Work, `project_tasks` via useSectionTasks) are none of the
three, yet §2 dissolves The Work into the spine. Slice 01 mounts
`CoordinationWork` verbatim beneath the phase list — zero regression:
tasks keep their CRUD and their ⊘ blocked-ticks, which open the blocking
item's sheet through the spine's sheet state — pending a ruling: do task
rows become a fourth row type inside phases, stay a separate band beneath
the spine, or fold into items? Resolve at the Slice 01 review.

*Entries add: O9 · last id = O9*

### I57 · Slice 01 built — the Spine renders behind the gate — 2026-07-15

Branch `schedule/slice-01`. Landed this slice: the chain schema (00323,
additive — chain columns on project_phases, `schedule_milestones`,
`schedule_revisions` with RPC-only writes, `blocks_milestone_id`); the
pure resolver (`resolveSchedule` in @patina/utils — chain in; dates,
slack, conflicts out; forward/backward/anchors/threads/legacy fallback;
19-case jest matrix); the schedule hooks (`useResolvedSchedule`, the
single impure door — nothing else in the app computes time); the
specimen seed (Aspen Loft: five chained phases, thread-lane Procurement,
anchored install +40d carrying 12 days slack, an overdue blocking
sign-off); and `<ScheduleSpine/>` replacing `CoordinationBand` behind the
PostHog flag **`schedule-spine`** (fail-closed; while the flag loads the
old band renders — zero flash for the non-pilot cohort). `PhaseTimeline`
is untouched — the Rule is Slice 02. Items sort blocking-first then due
(R101.2); court survives as a chip via an additive OpenItemRow prop;
court grouping dies only behind the gate-on branch. OpenItemSheet and
ItemComposer mount byte-identical to the band's — item CRUD preserved by
construction. Telemetry: `spine_phase_unfolded` (§7 name-contract) fires
on fold→unfold only.

Code-only blesses: `schedule_milestones` named against the
payment-milestone collision; no chain backfill (I56's ruling); `+ New
open item` moves to the spine's section head (hidden until the
designer-client resolves — the court bar's entry point dissolves with the
band); items on thread-lane phases render no main-phase row (the thread
is the stitch; their room is the Loom) while null/deleted-phase items
land in the active phase (A0.2).

Escalations for the Slice 01 review (designer-visible): the unfold/fold
affordance is a persistent quiet mono mark, not the prototype's
hover-reveal (hover actions are banned in a read slice; touch has no
hover); the thread stitch omits the FF&E "N of M lines ordered" meta;
and O9 — the task rows' place in the spine grammar. The screenshot drop
follows as the FIRST REVIEW MILESTONE; the flip gate stays off until the
ruling blesses the dissolve.

*Entries add: I57 · last id = I57*

### R102 · Slice 01 review — good to go; Slice 02 (the Rule) begins — 2026-07-15

**Ruled (design authority, on the Slice 01 screenshot drop).** Proceed to
Slice 02 — the Ruled Line, §3 of the package. Conservative readings of
the ruling, stated so nothing is assumed: the flip gate stays **off** —
enabling `schedule-spine` for pilots is a separate, explicit act this
ruling does not grant; the four escalations shipped with the drop ride
as-implemented unless separately overruled (the persistent quiet
unfold/fold mark; the thread stitch without FF&E order meta; thread-lane
items rendering no main-phase row — their room is the Loom); and **O9
remains open** — CoordinationWork stays mounted verbatim beneath the
spine through Slice 02. Slice 02 builds on the branch stacked over
slice-01 (`schedule/slice-02`); the Rule replaces the old phase bar
behind the same gate, and its review milestone gates Slice 03.

*Entries add: R102 · last id = R102*

### I58 · Slice 02 built — the Rule renders behind the gate — 2026-07-15

Branch `schedule/slice-02` (stacked on slice-01). Landed: the pure rule
derivation lib (time scale, greedy N-row label stagger — truncation is
structurally impossible; `overflowBeyondTwo` flags the >2-row case),
`epochDayFromISO` shared from @patina/utils (one day-math door), two
phase-count-extreme specimen projects (Birch Hollow · 3 long-named
phases; Marrow & Vale Residence · 7 phases, 2 threads, anchored install
with 12 days slack), and `<ScheduleRule/>` — staggered natural-width
labels, status-weight track segments, milestone diamonds in stamp
colors, the charcoal today rule, thread hairlines beneath the line, and
pin-on-scroll as a self-sticky wrapper (permanent-height, zero layout
shift, folds to line + diamonds + today at ~22px with the project title
inline). The Rule replaces `PhaseTimeline` at the top of the document
behind the same `schedule-spine` flag (loading renders the old bar);
mobile (<980px) folds to line + diamonds + today. Minimap: labels and
diamonds are buttons that reveal through a page-level
`ScheduleNavProvider` — the spine unfolds the phase, scrolls to it, and
transiently highlights the milestone row. Telemetry:
`rule_minimap_jump` (§7 name-contract) with target kind and pinned
state. Time-surface drag is Slice 04; nothing on the rule edits.

Escalations for the Slice 02 review (designer-visible): pin-strip height
and the inline project title; the stagger's N-row growth when two rows
can't fit (design says two; we never truncate); the `Unplaced · N`
treatment for undated phases and the render-nothing empty state; the
full mobile rule treatment (this slice ships the minimal fold); minimap
clicks when the spine section isn't mounted (silent no-op today —
should it switch sections?); the active phase's segment ink (per-phase
status weight per R99's words vs the prototype's past/future ink split
— both readings are defensible, the authority should pick); and
`delayed` phases reading as `ahead` weight on the rule.

*Entries add: I58 · last id = I58*

### R103 · Slice 02 review — accepted; Slice 03 (Compose) begins — 2026-07-15

**Ruled (design authority, on the Slice 02 screenshot drop): accepted.**
Slice 03 — Compose, §4 of the package — begins. Conservative readings,
stated so nothing is assumed: the flip gate stays **off**; the Slice 02
escalations ride as-implemented unless separately overruled (the
pin-strip height with its inline title; the stagger's N-row growth
beyond two rows; the `Unplaced · N` and render-nothing empty
treatments; the minimal mobile fold; the minimap's silent no-op when
the spine section isn't mounted; the active segment's per-phase status
ink; `delayed` reading as `ahead` weight; the 20px thread-lane pitch).
O9 remains open. Slice 03 builds on `schedule/slice-03`, stacked on
slice-02; its review milestone gates Slice 04 (Adjust).

*Entries add: R103 · last id = R103*

### R104 · Process ruling — continuous execution through Slice 05 — 2026-07-15

**Ruled (design authority, mid-Slice 03):** "I want you to continue
through all the slices before I review again." The package's per-slice
review gates are superseded for Slices 03–05: the build proceeds
continuously; each slice still produces its screenshot drop, its
DECISIONS entries, and its escalation list; the design authority
reviews all three in one consolidated pass at the end. The flip gate
stays off throughout; nothing ships to production.

*Entries add: R104 · last id = R104*

### I59 · Slice 03 built — Compose: the schedule is born and grows inline — 2026-07-15

Branch `schedule/slice-03` (stacked on slice-02). Landed: migration 00324
(proposal chain columns, anchored-only `proposal_schedule_milestones`,
the `patina_six` template, `apply_phase_template` regrafted for
linear-chain insertion, two birth RPCs — `seed_project_schedule_from_
template` and `copy_schedule_as_built` — and `activate_proposal_as_
project` regrafted to carry chain columns and milestones through a
two-pass follows remap); `parseScheduleEntry`, the one grammar durations,
anchors, and offsets all speak; the compose UI — ghost add-line, the
grammar-driven entry field, the milestone composer, delete-with-relink,
and the three-starting-points birth surface — on both the project spine
and the proposal composer; `PhaseBuilder`'s grammar field, its anchored-
milestones mini-list, and the readonly proposal's "Key dates"; telemetry
`schedule_born`, `schedule_phase_added`, `schedule_anchor_set`. The
hardening the reviews forced: mutation error surfaces inline (never a
toast) and the negative-duration CRITICAL closed three levels deep — the
field's own inline reject plus `duration_days > 0` CHECKs on both
`project_phases` and `proposal_phases`.

**Walk results (S3-7, live, DB + driver evidence):** all nine §9 checks
run end to end. Clean: proposal Patina-Six birth (4.3s), blank birth +
<5s single add, past-project as-built copy, proposal readonly Key-dates
with zero unanchored milestones, activation (chain cols + remapped
follows + milestones landed offset-NULL/upcoming + legacy cascade + zero
`schedule_revisions` rows, all psql-asserted), spine add/edit/delete-
relink (confirm wording and the psql-verified relink both correct), the
chain-doesn't-fit terracotta, the negative-duration guard on both
surfaces, and gate-off (old band byte-identical; the proposal composer's
grammar field un-gated as designed). **One confirmed defect:** the
resolver's per-phase `slackDays` (`schedule.ts:620`) reads
`downstreamSlack(id)` — a phase's followers' slack — instead of its own
`anchorSlack` entry, so "N days slack" never renders on the anchored
phase itself (the chip and "Holds when upstream moves" are unaffected).
Two structural findings: thread-lane phases expose no compose actions at
all (confirmed, not just anticipated); and the lane packer can
auto-promote an overrunning anchor to thread before its terracotta meta
ever renders, so the overrun UI only reaches the main lane. One copy
nit: the delete confirm's "1 milestone go with it" doesn't conjugate for
singular count.

Escalations (plan §10 plus this walk's carry-forwards): bare-number unit
per surface; year inference to next on-or-after; the ghost line's compute
text is passive, not the ripple (Slice 04); delete-relink wording;
slack + overrun placement (sharpened by the findings above); no
follows/lane editors in the proposal composer; anchored milestones now
client-visible in readonly (placement); Patina Six's names/durations and
whether Procurement defaults thread; as-built = actual-elapsed with a
planned fallback; project-side birth shipped in scope; the composer rides
`schedule-spine`; `proposal_schedule_milestones` RLS omits the
studio-comember leg (deliberate); edit-dates commits once per open; a
name-only phase needs two Enters; chip-unpin failures show no inline
error; the weeks-mirror rounds 1–3d to 0w in summary totals; the
accordion hosts milestones under "Deliverables, gates & key dates."

*Entries add: I59 · last id = I59*

### I60 · Slice 04 built — Adjust: the ripple previews before it takes — 2026-07-15

Branch `schedule/slice-04` (stacked on slice-03). Landed: the ripple's pure
core (`rippleDiff`/`rippleSentence` in schedule-ripple-derivation.ts, plus
per-phase slack-sourcing and day/days honesty fixes so the confirm strip's
slack clause reads the EDITED phase's own absorbed float, never a top-level
min-across-anchors substitute) — `xToEpochDay`/`isoFromEpochDay` (the
scale's inverse, day-snapped + clamped, and the epoch-day↔ISO round trip);
migration 00325 (`commit_schedule_edit`, the one write door for all three
edit kinds, whole-statement atomic, with the Slice-05 `schedule_revisions`
hook point already commented at the return); `RippleProvider` — one
single-edit session shared by both surfaces; the Rule's boundary-tick and
milestone-diamond drag (pointer capture, 3px threshold, refusals on any
anchored downstream with a firm nudge, zero session begun); the dashed-
terracotta ghost layer (ticks, diamonds, the old→new arrow, layered over
solid committed); the confirm strip (one honest sentence, a double
anchor-violation guard — disabled AND handler re-guarded — and a
pending-guarded Esc so an in-flight commit can't be silently thrown away);
and the spine's time-edit reroute — the ruled boundary this slice draws:
duration/anchor edits now ripple through the strip, while ghost-add,
milestone-create, delete-with-relink, and the unpin chip all stay direct
writes, unchanged. Review forced three fixes before merge: the Esc handler
now guards on `commit.isPending` (an in-flight commit could otherwise be
reverted from under itself); the milestone diamond's z-index moved above
the boundary handle's so a coincident milestone stays tappable without
losing the boundary's own grab; and the slack-sourcing switch described
above (S4-1's own fix round, folded in before the confirm strip ever
shipped a wrong number).

**Walk results (S4-5, live, DB + driver evidence):** all nine §8 checks run
end to end on Aspen. Clean: drag→preview→commit in exactly 2 interactions
(drag, click) with dashed-terracotta ghosts rendering over solid committed
layers and the strip's sentence matching the pinned grammar exactly
("Schematic Design +5d · 2 phases follow · Installation & Styling holds
Aug 25"); Esc restores the exact prior state from both the Rule drag and
the spine's duration field, psql-confirmed unchanged both times; the
anchor-violation path is provably uncommittable — Commit disabled, a
force-enabled DOM click fires zero network requests (route-intercepted and
psql-confirmed), unpinning the anchor clears the conflict and re-enables
Commit, and a re-anchor to a date the chain actually reaches commits
clean; the anchored diamond refuses with the nudge text and begins no
session, no ghost; the milestone diamond drags to a new offset with
anchor_date confirmed still NULL after commit, and a plain tap on a
different diamond still reveals without touching the strip; the spine's
absolute-date anchor grammar ("Aug 26") ripples a downstream ghost onto
Completion and commits; ghost-add, milestone-create, and delete-relink all
confirmed to stay direct (no strip, ever) on a scratch phase created and
removed for the purpose; telemetry is a code-path read (no local PostHog
key) — `schedule_edit_committed` has exactly one call site, inside the
commit mutation's `onSuccess`, and the Esc handler calls only `clear()`;
and gate-off is byte-identical — the Rule/Spine/strip sections all count
zero, the old PhaseTimeline band renders in their place, unaffected by the
walk's own mutations. The coincident-milestone occlusion fix was also
spot-checked against a crafted case (a milestone SQL-repositioned onto a
phase boundary's exact x): the diamond stayed tappable and the boundary
stayed draggable via its un-occluded strip, one row above/below the
diamond's own rotated footprint — confirming S4-3's z-index ordering holds
under the exact coincidence it was written for. One tooling mistake, self-
caught and SQL-corrected mid-walk: an "Edit dates" locator scoped to the
whole spine instead of one phase-section grabbed Schematic Design's own
field instead of Installation & Styling's, briefly setting the wrong
phase's anchor — caught immediately via the committed sentence text,
corrected via a direct UPDATE, and every subsequent step used a
phase-scoped locator instead.

Also confirmed live: the slack- and lane-resolver fixes (459883f7,
pre-Slice-04) that closed I59's two open defects hold under this slice's
own drags — the per-phase slack clause reads the edited phase's own
absorbed float correctly in every ripple sentence captured, and no
anchored phase ever lane-demoted out of the main row during any of this
walk's overrun states.

Escalations (plan §9, none blocking): the confirm strip's sentence wording
— clause order and terminology are implementation-chosen, not
design-ruled; the strip's placement directly under the Rule (vs. floating,
vs. docked) is likewise unreviewed; the ghost layer clamps to the scale's
padded edge on an overflow drag, which reads correctly but was never
shown to the design authority; touch treatment for the drag surfaces is
untested (pointer-only mechanics, no touch-specific affordance); the
"boundary-refuse-in-gapped-case" — Install's own start has NO rendered
boundary handle at all in Aspen's chain, because its upstream edge
(Procurement→Install) is thread-lane and `ruleBoundaries` only draws a
handle for a main-lane upstream, so the anchored-refuse check for that
specific case has no drag target to exercise (worked around this walk by
testing the anchored diamond instead, which is the same underlying refuse
path); root-start drag (the very first phase's own start boundary) is
deferred by construction — a root has no predecessor, so no boundary edge
ever names it, and no design ruling exists on whether it should someday
gain a different edit affordance; the studio-comember gap on the schedule
RPCs (00323–00325 all guard on `designer_id = auth.uid()` directly, not a
studio co-membership check) is a tracked follow-up, consistent with the
same gap already known on `proposal_schedule_milestones`' RLS (I59); and
the Slice-05 seam — `commit_schedule_edit`'s hook comment describes
cutting a `schedule_revisions` row, but that INSERT will need either a
permissive policy or a SECURITY DEFINER wrapper (the function itself is
SECURITY INVOKER) before Slice 05 can land it.

*Entries add: I60 · last id = I60*

### I61 · Slice 05 built — Memory: the schedule earns its patina — 2026-07-15

Branch `schedule/slice-05` (stacked on slice-04). Landed: migration 00326 —
`cut_schedule_revision(p_project_id, p_reason) RETURNS int`, SECURITY
DEFINER, the ONE writer to `schedule_revisions` (00323's RPC-only posture
held). Review forced one fix before merge: the first cut took `p_actor
uuid DEFAULT auth.uid()` as a caller-suppliable parameter on a DEFINER
audit writer whose only authorization was "actor is the project's designer
or client" — a designer could mint a revision attributed to their CLIENT
(or vice versa) via a direct RPC call, pure attribution forgery. Fixed by
dropping the parameter entirely: the actor is now derived internally as
`auth.uid()` with an explicit NULL hard-fail, so forgery is impossible by
construction, not just discouraged — re-verified with positional- and
named-argument forgery probes, both `42883` (function does not exist).
`activate_proposal_as_project` (chain 00274→00279→00324→00326) is
regrafted with one delta: once every phase and anchored milestone is
written, `PERFORM cut_schedule_revision(v_project_id, 'Baseline v1 — cut
at signature')` freezes the baseline, never wrapped in an exception block
(unlike the deposit auto-draft) because the baseline is a hard guarantee
of activation, not a best-effort side effect. `commit_schedule_edit`
(00325's body) gets the matching delta: after the edit loop,
`cut_schedule_revision` runs and its `v` becomes the function's own return
— a declared breaking change (UUID → INTEGER), done as a guarded
drop-and-recreate, with `useCommitScheduleEdit` retyped to match. The
confirm strip grew a quiet DM-mono reason field, prefilled with the
sentence's own plain text and editable before Commit; a blank reason falls
back to the sentence so the ledger can never record an empty row. The
Rule grew a clay sibling ghost layer — dashed `--color-clay` ticks,
diamonds, and "v1 · <date>" labels — resolved by running the v1 snapshot
back through `snapshotToResolverInputs` and the same `resolveSchedule` +
`baselineGhostDiff` engine that renders the live schedule, projected
through the identical committed `scale`, so baseline and current share one
source of positional truth. It sits behind a quiet "Baseline" toggle
(default OFF) in the meta row beneath the Rule, hidden with no v1, during
an open ripple session, or while the Rule is pinned. `<RevisionLedger/>`
is a collapsed-by-default "Revisions · N" disclosure at the spine's foot —
newest-first rows of `v · reason · who · when`, no edit or delete
affordance anywhere, append-only by construction (there is no UPDATE or
DELETE policy on the table, locally by RLS, on Strata by ACL — same
guarantee, different SQLSTATE). `schedule_revision_cut` telemetry fires
from the strip's commit `onSuccess`, reading the RPC's now-numeric return
directly as `v` (trigger: `'edit'`); the `'signature'` trigger has no
designer-portal call site (v1 is cut server-side inside the client's
signing flow) and stays an intentionally-unwired def, per
`docs/analytics/event-conventions.md`.

**Walk results (S5-4, live, DB + driver evidence):** all five §6 checks
pass on a fresh proposal built for the purpose (3 chained phases —
Schematic Design → Design Development → Installation & Styling — plus one
anchored milestone, "Install day," Oct 15) and activated directly as the
designer session. **v1 at signature:** `schedule_revisions` holds exactly
one row, `actor` = the designer, `reason` = "Baseline v1 — cut at
signature," and the stored `phase_snapshots` array matches a
freshly-rebuilt-from-live-rows snapshot field-for-field
(`snapshot_matches = t`, psql). **v2/v3 from ripple commits:** a Rule
duration edit (`+5d` on Schematic Design) committed with the prefilled
sentence untouched cuts v2 with `reason` = `"Schematic Design +5d. 2
phases follow."` exactly; a second edit (`+3d` on Design Development) with
the reason field hand-edited to `"Pushed for fabric delay - vendor
confirmed"` cuts v3 with that exact string — both confirmed by direct
`schedule_revisions` SELECT, and the telemetry code path traced to source:
`schedule-confirm-strip.tsx`'s commit `onSuccess` reads
`useCommitScheduleEdit`'s numeric return as `newRevisionV` and passes it
straight through to `scheduleRevisionCut({ v: newRevisionV, trigger:
'edit' })`, so the strip's fired `v` is provably the RPC's own return, not
a guess. **Clay ghosts match the snapshot exactly:** toggling "Baseline"
on renders three dashed clay ticks labeled "V1 · AUG 10," "V1 · SEP 7,"
and "V1 · SEP 21" — hand-verified against the psql v1 snapshot's
`target_end_date` for each of the three phases (2026-08-10 / 2026-09-07 /
2026-09-21), an exact match; toggling off clears every ghost; the toggle
and its layer vanish entirely once a ripple session opens (a live
duration edit was left mid-session to confirm — the whole "Baseline"
control disappears, not just its state) and again once the Rule pins on
scroll (scrolled past the fold — the pinned reduced-height rule shows
only solid committed ticks, no dashed marks, no toggle anywhere in the
sticky header). **Ledger:** the expanded "Revisions · 3" disclosure shows
v3/v2/v1 newest-first with the exact reasons above, "you" for every row
(actor = the walking designer), and a date per row; no edit or delete
control anywhere in the rendered ledger; as `authenticated` in psql, a
targeted `UPDATE` and `DELETE` against the designer's own visible v1 row
both affect **0 rows**, and a forged direct `INSERT` is refused
(`new row violates row-level security policy`) — post-attempt state
unchanged, still exactly v1/v2/v3. **Regressions:** an Esc-revert
mid-session (a `+2d` test edit on Design Development, aborted) left
`duration_days` byte-identical (still 31) and cut no v4 — psql-confirmed
before and after; a scratch phase added directly via the ghost-add line
and then deleted directly via its inline confirm both opened no strip at
any point and cut no revision (`schedule_revisions` stayed at `v=3`
across both); gate-off (`schedule-spine:false`, dev server restarted to
flip the env-inlined override) is byte-identical to pre-Slice-01 — the
old "THE SCHEDULE" `PhaseTimeline` band renders in the Rule/Spine's place,
no toggle, no ledger, no Coordination-adjacent schedule chrome, unaffected
by every mutation this walk made.

**O8 status: still open — Slice 05 shipped studio-side only per the
package's own rule.** The ledger and the baseline ghosts render exclusively
inside the gated, studio-only spine; no client-facing surface exposes
either. O8's own leaning (client sees only revisions touching client-facing
dates, full ledger studio-side) remains unruled — nothing in this slice
resolves it, by design.

Escalations (plan §8, none blocking): the S5-3 build round already flagged
dashed-vs-solid clay ghosts (the prototype's `.bl-tick` is solid; this
slice went dashed via ghost-layer reuse, per the orchestrator's
direction — a design ruling on which reads as "history" vs. "preview" is
owed); the toggle's placement in the quiet meta row beneath the Rule
(paired left, "near the rule head" satisfied loosely, not literally);
the ledger's collapsed-by-default disclosure (the prototype shows rows
inline — confirm collapsed-default is wanted, not just tolerated);
who-rendering for a non-"you" actor is the uid head (8 chars), the boring
honest option with no profile join; a baseline entry whose current-side
phase was deleted since v1 ghosts both its start and end boundaries
(decided-but-unshown per the S5-2 pin, never exercised live this walk —
no phase was deleted after a baseline existed); the `'signature'`-trigger
telemetry stays unwired server-side (v1 is cut inside the client's signing
RPC, no designer-portal call site exists to fire it from); and pinned
mode hiding the baseline layer (confirmed this walk, consistent with the
ripple-session hide, but never explicitly design-ruled as the right
behavior vs. e.g. a reduced ghost mark in the pinned header). Carried from
prior slices, still open: the studio-comember gap on the schedule RPCs
(00323–00326 all guard on `designer_id = auth.uid()` / the designer-or-
client pair directly, never a studio co-membership check — same family as
`proposal_schedule_milestones`' RLS, flagged since I59); the thread-lane
compose gap (I59 — thread-lane phases still expose no compose actions of
their own); and touch treatment for the Rule's drag surfaces (flagged
since I60 — pointer-only mechanics, still untested on touch).

*Entries add: I61 · last id = I61*

### R105 · The consolidated review — slices 03–05 accepted; O8 and O9 ruled in direction — 2026-07-15

**Ruled (design authority, interviewed on the full escalation ledger).**
Slices 03 (Compose), 04 (Adjust), and 05 (Memory) are accepted. The
individual calls:

**O9 — resolved in direction: tasks fold into items.** The spine keeps
its three row types; `project_tasks` semantics migrate into
coordination items as a follow-on workstream (not a retrofit of these
slices). Until that migration lands, the shipped separate band beneath
the spine stays as the interim rendering.

**O8 — resolved: the middle path.** Clients see revisions that touched
client-facing dates — anchored milestones and install — as a follow-on
client-portal projection; the full ledger stays studio-side. The
shipped studio-only Slice 05 is the correct first cut.

**The Rule's line ink — hybrid.** The active phase splits at today:
elapsed draws bold, remaining draws light — honoring both R99's
status-weight sentence and the prototype's past/future truth. To land
in the polish pass.

**Clay baseline ghosts — solid thin clay,** per the prototype's Ledger
slide: dashes mean "not yet true"; the baseline was true. To land in
the polish pass.

**Ratified as shipped:** the confirm strip's clause sentence (also the
default revision reason); anchored milestones rendering as "Key dates"
in the client-facing readonly proposal (R101.3 — the client signs
against them); the Patina Six as minted (names, 1/3/4/8/3/1-week
durations, sequential main-lane default); the grammar's ambiguity
defaults (bare number = weeks on phases, days on offsets; month-day
dates infer the next occurrence); and the fourteen-item detail ledger
across slices 01–04 (persistent unfold marks, pin strip with inline
title, N-row stagger, Unplaced · N, minimal mobile fold, minimap no-op
without the spine, delayed-reads-ahead weight, 20px thread-lane pitch,
ghost overflow clamp, boundary refuse on anchored downstream,
root-start and touch deferred, collapsed ledger disclosure, uid-head
who-rendering).

**Ship posture:** merge `schedule/slice-05` to main now (gate off);
polish pass lands the ink and ghost rulings plus the studio-comember
widening of the schedule RPCs' ownership guards (00323–00326, still
unshipped — free to fix in place); then the full chain to Strata —
migrations, designer-portal deploy, the `schedule-spine` flag created
disabled and enabled for the design authority alone as pilot.
Backlogged with owners noted: thread-lane compose actions, the
`designer_clients` multi-row ambiguity, the draft-proposal modal bug,
the O9 migration workstream, the O8 client projection.

*Entries add: R105 · last id = R105*

### R106 · The Arrival Arc — accept, ceremony, introduction, discovery — 2026-07-16

**Resolves punch items P4 (designer intro on match), P5 (accept's destination), P7 (scheduling the discovery introduction). Session run against the live portal walkthrough of 2026-07-15/16; triage doc `designer-portal-punch-list-triage.md`.**

**The problem.** A client scans a room, asks for help, and a designer says yes — and today the yes goes nowhere. The designer stays parked on the request page; no introduction exists; the "Schedule the discovery call" chip names an act it cannot perform (an R22 violation in the current build — the chips are inert text with no href). This is the client's first minute with a human designer and the portal treats it as a status change.

**The ruling: accept is a threshold, not a button.** The arc is — request card → accept → **the Match Ceremony** → introduction sent with offered times → in-motion chip while she considers → she picks → Discovery, scheduled, inside the Document.

**1 · Accept claims immediately.** On accept the request is claimed and the client's iOS app shows a held state at once: *"Middle Studio has taken your request in hand — introduction on its way."* Truth-framed: it reports what happened, it does not speak in the designer's voice. No client sits claimed and greeted by silence, and the system never impersonates her hand.

**2 · The Match Ceremony (new surface).** Full-screen, typography-first, zero shadows. It was considered as a lighter Desk-card flip and rejected: the arrival deserves weight, and the ceremony gives the intro and the scheduling one home instead of splitting the moment in two.

- *What it presents — meet the client.* Name, their ask verbatim, the scanned room (scan preview), style tags and types, budget band, room type. The request payload honored as an arrival, not a form.
- *What it asks — the designer's hand.* A scaffolded composer: a context line assembled from the payload ("Elena scanned her living room · leans warm-minimal · 25–40k") sits above; the words below are hers. Nothing pre-written, nothing auto-sent. Optional voice-note attachment.
- *The offered times.* She picks 2–3 concrete slots, manually in v1 — no calendar dependency. Scheduling rides inside the introduction; one moment, not two.
- *The threshold act.* One send. Intro, optional voice note, and slots travel together. On send the **Document is created**, seeded from the request — client linked, request linked, scan into the Discovery fold, style tags into the Brief, budget band carried — and the designer lands in the Document at Discovery. The document begins with the introduction; nothing "converts."

**3 · Put-downable, not atomic.** Leaving mid-ceremony parks it as a Needs Your Hand card — *"Introduce yourself to Elena"* — draft preserved. This passes the action test: the act available is writing, so it earns a Desk folder. The Document is not created until the ceremony completes. (The atomic alternative — backing out un-claims — was rejected: it punishes a designer accepting on her phone between site visits. The skip-with-system-fallback alternative was rejected as against the grain; revisit only if unanswered ceremonies prove common in pilot.)

**4 · The waiting state is a chip.** After send: in-motion chip, *"Elena Vasquez — intro sent, awaiting her pick."* The only act left is waiting; per R22 that is chip tier, never a Desk folder. When she picks: the chip becomes *"Discovery · Thu 2pm"*, linking to the Document's Discovery fold, and The Post letters it (*"Elena chose Thursday 2pm"* — named, deep-linked, per the P3 fix). At 48h of silence the chip warms to a nudge — an act exists again. If the offered slots go stale before she picks, the chip asks for fresh times.

**5 · The Discovery fold, at this stage, holds:** the scheduled time, the scan (pulled from the linked request — this is P9's display side), the style tags, and a reference to the intro thread. Discovery is no longer an empty apology.

**6 · The client's side (iOS) — ruled in full.** Push: named and specific ("You're matched — Middle Studio accepted your living-room request"), never generic. Held state if the ceremony is deferred: report, don't impersonate. The match screen is one screen, three movements in order: the **designer card** (studio mark, name, one-line credential, portfolio link); the **introduction** in the designer's own words, voice note playable inline — this message becomes the head of the client–designer thread; the **time picker** — 2–3 tappable slots, one tap books with confirmation and add-to-calendar, and an escape hatch ("none of these work") that opens the thread. The companion doc owns pixel detail; this ruling owns the contract and the order of the movements.

**7 · The accept contract.** `accept(request_id)` → claim + client held-state notification. `ceremony_complete(intro, voice?, slots[2–3])` → create Document seeded from request (client_id, request_id, scan→Discovery, style→Brief, budget band), deliver intro+slots to client, navigate designer to the Document at Discovery, spawn the in-motion chip. `client_pick(slot)` → write the time to the Discovery fold, update the chip, letter The Post. **Prerequisite: the Wave 1 linkage fixes** — this arc cannot be stitched onto documents that don't know their client or request.

**Rejected alternatives, for the record:** landing directly in the Document on accept; Desk-card flip; editable template intro; calendar-link scheduling; client-proposes-first. Full reasoning in the session record.

*Entries add: R106 · last id = R106*

### I62 · Arrival Arc Phase 0 — linkage census (T0.1): Elena is a no-login household; budget_range has drifted — 2026-07-16

Prod census for the arc's spine (R106). Elena's doc f9970369… is Shape B (a draft proposal, client_id NULL) for a no-login household — there is no profiles row to backfill; the recoverable chain is designer_clients 5eed0104… (client_name 'Elena Vasquez', lead 5eed0004…). The honest repair mirrors 00236's Shape D fix: additive proposals.designer_client_id + Shape B name coalesce through designer_clients.client_name + a hand-verified one-row backfill — title-equals-client-name is not a safe general predicate. Two seeded projects (5eed0005/0006) have null client_id and no recoverable source — leave null, flag for manual input. Safe general predicates (currently no-op on prod data): projects.client_id from an activated proposal chain; designer_clients.lead_id from an accepted-lead (designer_id, client_id=homeowner_id) match. Surprise: leads.budget_range vocabulary has drifted — 4 of 6 non-null prod rows are free text ("$25k–$40k" etc.), only 1 matches the documented slug set; ceremony_complete's band→cents mapping must be defensive (5 slugs, then a $Nk–$Mk parse, else null). P6 name coverage on iOS-sourced homeowners is inconclusive at N=1 — no iOS-side escalation yet; re-run after TestFlight volume. Shape-D lead_id double-match check: clean today (but 0 Shape-C rows exist — re-verify at ship). Local seeds reproduce neither broken case; procurement_workspace_dev.sql's Chen/Olsen orphan projects are the honest fixture for verifying the backfill leaves unrecoverables alone.

### I63 · Arrival Arc Phase 0 — the uuid-null AppError named (T0.2) — 2026-07-16

The person-record error from the 2026-07-15/16 walkthrough is useClientProjects (packages/supabase/src/hooks/use-clients.ts:462–498): it resolves designer_clients.client_id — NULL for no-login households — and passes it into .eq('client_id', …) against projects; supabase-js serializes null as the literal eq.null and Postgres rejects the uuid cast (400, 22P02). Reached unconditionally from ClientProfile (person-profile.tsx:108) for every client/lead person; the enabled guard checks the designer_clients id (never null), so the null surfaces one level down. Reproduced live against a local F8-shaped row; every other person.profile_id consumer traced is correctly guarded — sole offender. Fix: early-return [] when the resolved client_id is null (a no-login household has no profile-keyed projects by definition). Local seeds contain no null-client_id household, which is why seeded walkthroughs never hit it — a seed fixture lands with the Wave 1 fix.

### I64 · Arrival Arc Phase 0 — the Desk's silent half-render is an auth-degraded 200/0-row read (T0.5) — 2026-07-16

Mechanism confirmed live: when a token refresh fails (expired access + invalid refresh token), the client goes sessionless and document_state returns HTTP 200 with zero rows — no error is ever raised. partitionDesk([]) yields a legitimate-looking empty desk ("Nothing needs your hand") with In Motion silently absent, indistinguishable from a truly quiet desk; recovers on reload/re-auth, matching the walkthrough symptom. useDeskEngagements sets no placeholderData, and a Promise.all of five reads means one stalled request holds the whole hook in loading (the "skeleton cards" variant). Consequence for 1.4: a whole-desk error state alone cannot fix this — no error exists to catch. The fix stack: placeholderData keepPreviousData; treat a 0-row read as suspect when the previous read was non-zero or the session is degraded (verify session before trusting empty); a zero-row telemetry breadcrumb; plus the whole-desk error surface for genuine failures.

### I65 · Arrival Arc Phase 0 — accept-path runtime ledger (T0.3): two real bugs and a stale premise — 2026-07-16

Pool claim behaves exactly as read: designer_id set, status stays 'new', two in_app notification_log rows (homeowner "Your design request was accepted", designer "You accepted a design request"), lands on the Brief with TriageBar. TriageBar accept sets status='accepted' and the 00289 trigger writes the homeowner "Designer matched … You're all set." — the exact row the arc's ceremony guard (provisional 00332) must suppress. Corrections and finds: (1) client_discovery is NOT created at accept — it lazy-seeds on the Discovery fold's first render; the ceremony's atomic create is a change, not parity. (2) REAL BUG: useBeginDiscovery's existing-row branch silently downgraded a seeded ACTIVE designer_clients relationship to status='lead', overwriting lead_id/source — ceremony_complete must never downgrade an existing active/proposal relationship (guard: create fresh or refuse, never downgrade). (3) REAL BUG: document_state's relationship shape excludes rows when any project exists for the (designer, client) pair — a repeat client's new Discovery-stage relationship is invisible, and /doc/{dc.id} renders "No document answers to this name." A fresh homeowner resolves cleanly; the arc's post-ceremony landing would 404 for exactly repeat clients unless Shape D's exclusion is scoped (e.g. exclude only non-'lead' rows) — needs a ruling. (4) STALE PREMISE: "Schedule the discovery call" is not an inert in-document chip — it is the desk-derivation In Motion label for relationship cards (desk-derivation.ts ~672), and the in-document Discovery fold is fully interactive since R61 (checklist overlay, scan attach, essentials). The R106 problem statement's R22-violation framing was written against a pre-R61 build; the chip-state work still replaces that label, but the premise reads as "the label is ceremony-blind", not "the fold is dead". (5) notification_log is not in the supabase_realtime publication — The Post/bell reflect new letters only after reload; 2.6's "within one refresh" stands; live lettering is a possible fast-follow. (6) Local dev: invoke_edge_function is a silent no-op without app.settings.supabase_url/service_role_key seeded — Wave 2 local verification must seed the vault or inspect the pg_net queue. (7) _pending/00106 (drop client_messages): keep parked; preconditions 3–5 unverified and the arc is actively touching accept notifications.

### I66 · Arrival Arc Phase 0 — notification-dispatch contract + APNs prerequisites (T0.4) — 2026-07-16

notification-dispatch, email channel, non-sequence: an unknown template_id silently sends the generic "You have a new notification from Patina" fallback (the subject falls back independently via a type-keyed kebab-case map to "Notification from Patina"). Templates live in email_templates (DB, live-read — an INSERT takes effect with no redeploy). LIVE PROD GAP FOUND: design-request-claimed (invoked by claim_design_request since 00286) was never seeded — every claim email to date has sent generic boilerplate. Verdict: the arc's template migration (provisional 00336) is required — two new rows (held-state, introduction-delivered) with BOTH html_content and subject_default populated, plus a repair row for design-request-claimed. invoke_edge_function is fire-and-forget pg_net (async; downstream 500s never propagate) — the double-wrapped best-effort pattern stands. branded-email.ts blast radius if the shell itself is edited: 19 functions (11 direct + 8 transitive); template-row seeding touches none. APNs: topic cloud.patina.app (identical in both configs), team VP22LXHT7L, entitlement aps-environment=development; Release signing is Apple Development (never a true distribution archive), so every token registered today is sandbox — device_push_tokens.environment must be captured per-token at registration and drive api.push vs api.sandbox.push host selection, never inferred from build config. ES256: jose v5 is already in-repo (HS256 uses); importPKCS8 + kid header is a dependency extension, not a new library. Deno fetch HTTP/2 to APNs has no in-repo precedent — first-deploy smoke risk, not a blocker. verify_jwt: platform default true suffices (invoke_edge_function sends a service-role Bearer); optional intent stanza per the catalog-normalizer style. Secrets owed: APNS_AUTH_KEY (.p8 contents), APNS_KEY_ID, APNS_TEAM_ID, APNS_TOPIC.

*Entries add: I62–I66 · last id = I66*

### I67 · Arrival Arc — built and shipped to Strata behind the arrival-arc flag — 2026-07-16

R106 delivered in four gated waves, all in one day. Wave 1 (spine): document_state v11 (00327 — Shape B no-login rescue via the new proposals.designer_client_id, Shape C/D display_name preference, Shape D lead_id emission, ALL THREE Shape-D exclusions engagement-scoped for linked rows with the pair heuristic preserved for legacy lead_id-null rows) + 00328 backfill (Elena's proposal hand-linked; two safe general predicates; unambiguous legacy proposal stamping); the uuid-null AppError killed at useClientProjects with a null-client_id guard; person records list linked documents through both legs; the Desk no longer trusts an auth-degraded 0-row read (keepPreviousData + session check + breadcrumb + whole-desk error state). Phase-1 gate passed with screenshots: zero AppErrors, linked documents, twenty clean loads. Wave 2 (the accept contract): match_ceremonies (00329, one row per lead, draft→sent→picked) + accept_design_request (00330, claim + stub + truth-framed held letter) + ceremony_complete (00331, one transaction: relationship without ever downgrading an engaged row — the designer_clients unique index re-scoped to non-lead rows, open_project_direct and activate_proposal_as_project regrafted single-delta — discovery seeded with defensive budget parsing, thread + intro head message, letters) + the 00332 trigger guard + client_pick (00333, homeowner-callable, Post letter named and deep-linked) + refresh_offered_slots (00334) + device_push_tokens (00335, environment per-token) + email templates (00336 — including the repair of design-request-claimed, which had sent generic boilerplate since 00286) + the apns-send edge function (ES256 via jose, per-token host, clean skip until secrets). Portal: the Match Ceremony at /ceremony/{leadId} (scene-03 structure, send asleep until words + two slots, 800ms row-backed autosave, put-down/resume across hard reload), flag-gated entry from both accept paths, the parked "Introduce yourself to {name}" card, four chip states (nameless pronoun-neutral texts — the wrapper carries the name; nudge and stale derived at read, no cron), the Discovery fold's schedule line + re-offer control + intro-thread reference, the flag-off hardening of useAcceptLead/useBeginDiscovery (multi-row pairs + the no-downgrade guard). The full arc is pinned by a committed e2e spec (e2e/document/arrival-arc.spec.ts) asserting every Phase-2 acceptance beat. Wave 3 (iOS): stages held/introduced/booked (reviewing re-labeled, Kody-blessed; intro-row precedence, terminal wins), the match_ceremonies to-one embed decode with fixtures, studio-name enrichment persisted to the offline receipt, MatchIntroductionView (three movements per scene 05, no voice note per ruling), one-tap client_pick with optimistic flip and the already_picked/slot_stale/not_found branches, EKEventEditViewController calendar sheet (iOS 17+ no-permission path), APNs registration (authorization asked at first submit success, token upserted with provisioning-profile-derived environment, sign-out cleanup). 288 tests / 35 suites green on the merged tree. Wave 4 (ship, 2026-07-16 ~17:00Z): 00327–00336 applied to Strata and object-probed; prod relationship count 3→2 (Elena's D+B duplicate collapsed to one named doc); apns-send ACTIVE returning the designed apns_not_configured skip; designer portal deployed (12dae0d4, ceremony route marker-verified in the built worker); PostHog flag arrival-arc (id 765596, project 326191) active for kody@kochaver.com only, fail-closed for everyone else. OBSERVED IN PASSING: the live schedule-spine flag (764880) is at 100% general rollout with no property conditions, contradicting its kody-only intent note — surfaced to Kody, untouched. OWED: Kody's APNs .p8 secrets (then re-invoke apns-send to confirm real delivery), Kody's authenticated prod walk of the full arc, the iOS TestFlight/device pass, and two pre-existing bugs flagged for a future wave (the doc header's "No client linked" on no-login Shape-B docs; useClientRoomScans called with a profile id where a designer_clients id belongs). Voice note and A/B-shape request lineage remain deliberately deferred.

*Entries add: I67 · last id = I67*

### R107 · The Room View — the room as material, in Patina's hand — 2026-07-16

**Resolves punch item P1 (Build Room View). Pairs with P9's display side (the scan in Discovery) and completes the arrival arc's promise — the ceremony's scan preview captioned "tap to walk it" now has a destination. Designer-only in v1; the client's room experience arrives later through the proposal rail. Session included a methods-and-frameworks research pass; findings folded in below.**

**The problem.** Rooms arrive from iOS as the richest material in the pipeline — LiDAR geometry, detected furniture, real dimensions — and die as attachments. The designer who accepted the job cannot read the space: no plan, no volume, no measurements, nothing to think against. Every downstream act (discovery conversation, drafting, FF&E) happens partially blind to the one thing the client actually gave us.

**The ruling in one line: the scan becomes a Patina drawing — not a scan viewer.**

**1 · Placement: The Rooms, a Studio room.** Rooms joins Library and People as a top-level Studio room — every scanned room across every client, one roster. Each card: client, room type, dimensions, area, scan quality, and its Document reference. Opening a card opens the Room View. References inside a Document (the Discovery fold's scan, a Project room section, the ceremony's preview) open the *same* Room View scoped back to that Document — one viewer, two doors, and the room always knows its Document. The truth-keeping rule: the Rooms index is a lens over the same rows the Documents own; nothing is copied.

**2 · Substance: parametric re-render, Patina's hand — mesh toggle named for later.** The research settled this fork. RoomPlan's own USDZ is not a photoreal capture — it is already parametric geometry (walls as planes, furniture as oriented bounding boxes in 16 categories, no ceilings), so "showing the real scan" buys almost nothing over re-rendering the CapturedRoom JSON ourselves — and browser-side USD demands WASM, SharedArrayBuffer, and COEP/COOP headers we refuse to carry. The iOS app already uploads the structured JSON (surfaces with dimensions, 4×4 transforms, confidence; objects with W×H×D oriented boxes; the floor polygon). The Room View renders that geometry in the brand's hand: Aged Oak line-work and quiet fills on Off-White, the drawing language the ceremony prototype already speaks. **Confidence renders honestly** — low-confidence walls and objects draw lighter and dashed, because a drawing that hides its uncertainty lies. An **"as captured" mesh toggle is named for a later stage** (verification disputes: *did the scan really miss that radiator?*): the ingest job converts USDZ→GLB server-side from day one as cheap archival insurance, but no mesh ships in v1 and no USD machinery ever enters the browser.

**3 · The mode grammar: Plan · Orbit · Walk — one geometry, three distances.** Borrowed from the Matterport trinity (floor plan / dollhouse / walkthrough) and scaled to a single working room:

- **Plan** — the measured top-down drawing. Where a designer thinks. Dimensions, openings, footprints. SVG, printable, exact.
- **Orbit** — the room as a volume, one-room dollhouse. Wall heights, window placement, sight lines, the shape of the air.
- **Walk** — eye-height, inside. Ruled into the arc now, built last: bare parametric geometry serves walking poorly until the Place stage can furnish it, and a walkthrough of white boxes is a broken promise. Walk ships when there is something to walk through.

V1 is Plan + Orbit, one toggle apart, same geometry source. No tabs — a Strata rule.

**4 · Stage one — Understand (v1).** The comprehension instrument. The facts rail: area, wall lengths, wall height (RoomPlan gives no ceiling data — wall height stands in, labeled as such), window and door count, scan date, scan quality. Hover any wall, opening, or detected object for its true dimensions. A two-point measure tool in Plan. Detected existing furniture renders ghosted with its category label — present but quiet, because it is the client's *current* room, not the proposal. Openings marked with swing/direction where the data carries it.

**5 · Stage two — Annotate.** The room becomes a communication surface. Pins anchor to geometry — a wall, a point, a zone — and each pin is a note that flows into the Document's margin with a room-reference, so the room talks to the thread and the thread can point back into the room. Named **frames**: saved viewpoints from Orbit ("from the entry," "toward the west light") captured as images into the folio and boards. Nothing in the room is a dead end into chat — annotation is Document material.

**6 · Stage three — Place.** Plan-first footprints. FF&E lines from the Document drag onto the Plan as true-scale footprints; Orbit mirrors them as volumes. **The room knows its rules**: live clearance checking against the standards designers already carry — 30–36″ primary walkways, 14–18″ sofa-to-coffee-table, pull-back allowances — flagged gently and truthfully (a violation is a fact about geometry, not a taste judgment; the designer may override without ceremony). Detected existing furniture can be kept or cleared per placement scenario. Placements feed the proposal's space plan and the Project's room sections. 3D-first placement was rejected: perspective manipulation on the web is fiddly, precision suffers, and clearance feedback reads poorly in perspective — the plan is where placement is honest.

**7 · Build notes (for the handoff, when cut).** One normalized geometry source (parsed CapturedRoom JSON → room-geometry rows at ingest), two projections: SVG for Plan, three.js/React Three Fiber for Orbit and later Walk — the stack the portal's ecosystem already names. Ingest also converts USDZ→GLB to cold storage (the future toggle's insurance). `/room/[id]` must survive refresh — the A3 deep-link fix is a stated dependency, and the Rooms index needs the request→client→document chain (arrival-arc Phase 1) for its references. Telemetry: `room_opened` (source: index|document), `mode_switched`, `measure_used`, `pin_created`, `frame_saved`, `placement_started`, `clearance_flag_shown`, `clearance_overridden`.

**8 · Rejected alternatives, for the record.** Mesh-primary rendering (someone else's drawing style, and RoomPlan's mesh is generic white geometry anyway); browser-side USD via WASM (SharedArrayBuffer/COEP tax on every page for one surface); walkthrough in v1 (walking an unfurnished box breaks the promise the word makes); 3D-first placement (imprecise, fiddly); Room-View-inside-the-Document-only (rejected in favor of the Studio room — browsing every scan is real designer behavior, and the spine holds because the index is a lens, not a copy).

**Research appendix — what settled the forks.**

- **RoomPlan's data model** — parametric surfaces (walls/doors/windows/openings: dimensions, 4×4 transform, confidence, curvature) and objects (16 categories as oriented bounding boxes); exports USDZ for AR and structured JSON for downstream tools; no ceilings, ~30×30 ft ceiling on room size, 16 object categories. Sources: [Apple RoomPlan overview](https://developer.apple.com/augmented-reality/roomplan/), [CapturedRoom documentation](https://developer.apple.com/documentation/roomplan/capturedroom), [it-jim's RoomPlan API analysis](https://www.it-jim.com/blog/apple-roomplan-api/), [Apple ML Research on RoomPlan](https://machinelearning.apple.com/research/roomplan).
- **USDZ on the web is a tax, not a feature** — browser loading requires Autodesk's USD WASM build, SharedArrayBuffer, and COEP/COOP headers ([three-usdz-loader](https://github.com/ponahoum/three-usdz-loader)); practical pipelines convert server-side to three.js-friendly formats instead ([Lagarsoft's USDZ→three.js pipeline](https://lagarsoft.com/blog/usdz-web-ar/), [needle-tools usd-viewer](https://github.com/needle-tools/usd-viewer)).
- **The mode grammar precedent** — Matterport's walkthrough / dollhouse / floor-plan trinity plus measurement mode is the established comprehension grammar for captured spaces ([Matterport viewing modes](https://support.matterport.com/s/article/Matterport-Viewing-Modes-3D-Dollhouse-360-and-Video?language=en_US), [Matterport navigation academy](https://matterport.com/matterport-academy/different-ways-to-navigate)).
- **The product bar** — Polycam auto-generates 2D/3D floor plans from LiDAR with dimensions, editable labels, and professional exports (PDF/PNG/SVG/DXF/CSV); scan-to-useful-plan in minutes is table stakes ([Polycam floor plans](https://poly.cam/floor-plans), [Polycam 3D room scanner](https://poly.cam/tools/3d-room-scanner)).
- **Clearance standards for the Place stage** — 30–36″ walkways, 14–18″ sofa-to-coffee-table, standard pull-back allowances ([RoomSketch3D clearance standards](https://roomsketch3d.com/help/dimensions/clearance-around-furniture), [VBU 36-inch rule](https://vbufurniture.com/blogs/furniture-buying-guide/36-inch-rule), [Emily Henderson's living-room rules](https://stylebyemilyhenderson.com/living-room-rules-know)).
- **Prior art in the project** — the pre-Document portal doc's "3D Room Viewer" (Three.js/R3F, measurement overlay, side-panel products) and the Phase 1 spec's storage decisions (USDZ + PLY in object storage, structured JSON in Postgres) were honored; the iOS upload contract in UserJourney.md already carries everything stage one needs.

### I68 · Scan-pipeline reality (Phase 0.1) — 2026-07-16

CapturedRoom parametric JSON IS uploaded by both iOS apps (Field: `apps/mobile/Capture/.../SupabaseSiteScanService.swift`; client: `ArtifactUploader.swift`) to `room-scans/captured_room/{uid}/{roomId|scanId}/captured_room.json`, recorded in `room_scans.captured_room_json_url` as a FULL public-URL string (not a path). USDZ → `model_url`. `model_url_gltf` (00020) has never had a writer — the existing web mesh viewer is dead-in-practice. Storage RLS: 00077 owner-by-segment[2] + 00287 designer read reconciling both apps' segment[3] variance. Strata probe (2026-07-16, read-only): 3 real scans all with CapturedRoom JSON — `fa361ed4` "Room litchen 71426" (v3 bundle, ready, accepted lead `97ec603e` → live lead→client→document exemplar), `17c638ca` "Site scan Jul 12, 2026" (v1 Field pipeline, ready, project-linked `7f6a24c3` → live project-path exemplar), `c4485bf3` stuck `uploading`. Zero GLBs. Acceptance runs on the two live exemplars.

### I69 · Room entity (Phase 0.2) — 2026-07-16

Scanned rooms (`room_scans`/`rooms`) and FF&E rooms (`project_rooms`/`proposal_scope_rooms`) are SEPARATE entities with optional soft bridges (`project_rooms.room_id`, `room_scans.project_room_id` 00265). Canonical scanned-room entity = `room_scans`. The empty `room_features` table (00019) is left alone — its point-position shape can't express wall endpoints/along-wall openings/oriented boxes without becoming jsonb-in-a-costume, and both iOS apps compile types against it; geometry gets new additive tables (00337). `room_features` recorded as superseded pending a later dissolve-step drop.

### I70 · Arrival-arc dependency (Phase 0.3) — LANDED — 2026-07-16

Wave 1 (00327/00328, `document_state` v11) shipped; v11 emits `lead_id` in Shapes C AND D, so the lead-path document resolution is genuinely one join. 1.3 and 2.4 acceptance build on the real chain, no seeded links needed.

### I71 · Prior art (Phase 0.4) — 2026-07-16

No USD tooling anywhere (media 3D module is @gltf-transform GLB-only, USDZ input throws; media-worker 3D job types ack-without-processing). Code-only call, blessed: USDZ→GLB conversion rides aesthete-inference (Python container, `infra/inference-worker`) as a cleanly-separated `/convert/usdz-to-glb` endpoint via usd-core. Existing R3F mesh viewer is ruling-rejected; salvage reference only. fiber@8 crashes at init under React 19 → code-only call, blessed: Orbit implemented in PLAIN three.js (`three@^0.159`) behind `dynamic({ssr:false})` + ErrorBoundary, lazy-mounted on first Orbit click; fiber@9 upgrade rejected (forces drei migration destabilizing the legacy viewer for zero benefit).

### I72 · Seed defect — 2026-07-16

`supabase/seed/leads_room_scans.sql` (Elena's scan) is NOT wired into `config.toml [db.seed] sql_paths` AND hardcodes orphan designer uuid `39b071a2-d61b-4364-ab3e-0d8b0b8da390` (exists in no wired seed — FK failure if wired verbatim). All six seed scans are metadata-only (no artifacts, no `captured_room_json_url`); zero CapturedRoom fixtures exist in the repo. Repair in this program: designer uuid → `a0000000-0000-0000-0000-000000000004`, wire into config.toml, add a checked-in synthetic CapturedRoom fixture + post-reset loader script (storage can't be seeded from SQL).

### I73 · Render-honesty rulings (Kody, 2026-07-16) — 2026-07-16

(a) RoomPlan emits three confidence levels; medium draws SOLID like high — only low gets the lighter+dashed+verify-note treatment; all three levels stored and reported in the facts rail. (b) Door swing: NO arc when the data lacks hinge/direction (it usually does) — arc only when derivable; never fabricate geometry. (c) Wall names: scan-relative compass derived from the plan frame ("North wall (west run)") — consistent per room, arbitrary globally. (d) Wall thickness is a drawing convention (RoomPlan walls are planes) — drawn at the prototype's 0.45 ft with a facts-rail honesty note in the manner of "stands in for ceiling".

### I74 · Scope + gap log — 2026-07-16

(a) Kody ruling 2026-07-16: ALL Document scan doors (Discovery fold, ceremony preview, letterhead "The scan" instrument, Folio) convert to the Room View — supersedes the package's two-door minimum; the old mesh ScanViewerSheet loses its remaining doors. (b) A3 deep-link fix NOT landed: DocumentGate (client-side fail-closed `the-document-pilot`) can bounce hard-refreshed `/room/[id]` to /portal while the flag resolves — known gap, in-app navigation is the v1 path, documented in the route header, not silently shipped. (c) Telemetry names ship verbatim from the ruling (`room_opened`, `mode_switched`, `measure_used` + 5 reserved) despite the family-prefix convention preference — names freeze on ship, `room_id` is the family carrier. (d) Ceremony door visible only to Kody until the `arrival-arc` flag widens (scoping fact). (e) No new feature flag — rides `the-document-pilot` (Kody ruling).

*Entries add: R107 · I68–I74 · last id = I74*

### I75 · The Room View — built and shipped to Strata — 2026-07-17

V1 (R107 stage one: Plan + Orbit) built and shipped in one program: migrations 00337 (geometry schema + service-role write RPCs), 00338 (ingest crons + glb bookkeeping), 00339 (room_scan_documents view); edge functions parse-room-scan + convert-room-scan-glb; usd-core USDZ→GLB endpoint on the inference container; The Rooms Studio room + /room/[id] (Plan SVG, facts rail, two-point measure, Orbit plain-three.js lazy-mounted, Walk disabled "arrives with Place"); all five Document scan doors converted (I74a); telemetry room_opened/mode_switched/measure_used live, 5 names reserved.

Main landed at 146e9af6; Strata migration head 00339; designer portal deployment 00025108-6fe9-48dc-b4e5-70f241de867b (2026-07-17T01:42Z).

Prod acceptance on real scans, zero parser warnings: fa361ed4 (v3 bundle) → 35 elements, resolves Shape D via graduated relationship; 17c638ca (v1 Field) → 24 elements, resolves Shape A via project. GLB lane live — cron converted both (41,432 B and 1,556 B GLBs, valid model/gltf-binary; size asymmetry = sparser v1 USDZ, noted). Stuck scan c4485bf3 correctly untouched.

Fixed en route, pre-existing: /desk production build failure (useSearchParams without Suspense, env-triggered) — proven on main via build matrix, fixed in 146e9af6. Local seed gaps closed (leads_room_scans designer uuid + wiring, room_scan_associations, lead_room_scans junctions).

Known gaps/owed: A3 deep-link (hard refresh of /room/[id] can bounce via DocumentGate — in-app nav is the v1 path); Kody's authenticated prod walk owed; local loader needs the HS256 vault key (documented in the fixture README); roster visible to all designers (rides the-document-pilot GA, per ruling I74e).

*Entries add: I75 · last id = I75*

### I76 · Scan photos — rulings (Kody) — 2026-07-17

Photos enter the Room View. (a) Plan gains plan-anchored camera markers at each photo's capture position plus a quiet photo strip beneath the facts rail — "the drawing knows where you stood." (b) Orbit frustum markers ship IN v1 (not deferred behind Walk) — camera icons at capture pose, oriented to the ARFrame's forward vector. (c) The Brief-strip cover photo is in scope — the scan preview surface adopts a resolved cover photo, not a placeholder. (d) Patina Field gains posed-photo capture — this supersedes the v1-minimal "no photos" line for Field specifically (the client app's capture flow is unaffected). Ships to Strata at the program's end, alongside the six findings below.

### I77 · Photo pipeline reality (audit) — 2026-07-17

`room_scan_images` rows are fully posed: `camera_transform` is the ARFrame pose at capture — row-major 16-double array, position at indices [3],[7],[11], −Z forward — in the SAME ARKit world frame as the CapturedRoom geometry (no separate alignment step needed). Plan position derives from the parser's stored `origin_yaw_deg`/`origin_offset_m` de-rotation applied to the camera's XZ, the same math `worldToPlanFt` in lib.ts already uses for geometry. Prod census: `fa361ed4` (the v3 bundle) carries 33 `photo_kind='auto'` posed rows; `17c638ca` (Field v1) carries zero — the Field pipeline has never written a photo row. Writer = iOS direct batched insert (not the parser); RLS already grants associated designers read via 00032/00082, so no policy work is needed to surface them.

### I78 · HEIC gotcha + derivative lane (code-only, blessed) — 2026-07-17

All photo rows are `image/heic` — undecodable in Chrome and Firefox — and `thumbnail_url` is NULL on every row in prod: iOS builds a 256px JPEG thumbnail locally but never uploads it. Ruling (code-only, blessed): a server derivative lane mirrors the GLB lane. A `/convert/heic-to-jpeg` endpoint on the inference container (pillow-heif) does one decode into a 512px thumbnail and a 1600px preview, returned as JSON-b64; a `derive-scan-photo-media` edge sweep (`*/5` cron) drives it; derivatives land at `photo_derivatives/{uid}/{seg3}/{stem}_{size}.jpg`, 00287-compatible. Additive columns `derive_attempts`, `derive_error`, `preview_url` land in migration 00340. ⚠ 00350–00369 are reserved for Back of House — this program mints nothing in that range.

### I79 · image_url signing defect — 2026-07-17

`room_scan_images.image_url` (like the model URLs before it) is a `getPublicUrl` string against the PRIVATE `room-scans` bucket — it 400s at the storage edge. The sole existing consumer, `letterhead-instruments.tsx:52`, renders it raw today and is broken in prod right now, not hypothetically. Fix: a new `useRoomScanPhotos` signing hook, built on the `useSignedScanModelUrl` pattern already in the codebase, with letterhead converted to consume it instead of the raw column.

### I80 · confirm-scan-bundle field mismatch — 2026-07-17

The `confirm-scan-bundle` edge function reads `body.scanId`; both iOS apps send `scan_id` — every call has 400'd since the 00082 era. Practical effect: server-side artifact verification for scan bundles has never actually run in prod. Fix: accept both `scanId` and `scan_id` on the request body.

### I81 · Hero is vestigial; cover-photo rule — 2026-07-17

`hero_frame_url` has no producer — the `.heroThumbnail` artifact iOS is supposed to create is never created — and `photo_kind='hero'` is never assigned by either app; `is_primary` is set only by the client review step, well downstream of capture. Ruling: cover photo is resolved, not stored — `is_primary` first, then highest `quality_score`, then first `display_order`. The Brief scan strip moves off `room_scans.thumbnail_url` (permanently NULL) onto this resolver.

### I82 · image_count discrepancy root cause — 2026-07-17

`c4485bf3` shows 200 `room_scan_images` rows against `room_scans.image_count = 40` — traced to source, not a guess. The 00032 AFTER-INSERT trigger counts truthfully (200, including retried batch inserts); the client's own explicit `image_count` patch then overwrites the trigger's count with its stale local tally (40). Rules going forward: reads dedupe defensively (by `scan_id` + `image_url`); the derivative sweep short-circuits duplicates by filename stem; Field's new upload lane relies on the trigger alone and drops the explicit patch entirely.

*Entries add: I76–I82 · last id = I82*

### I83 · Room View photos — built and shipped to Strata — 2026-07-17

Scan photos are now Room View material per I76: plan gains camera markers plus cluster peeks, a quiet photo strip, and a full-bleed paper viewer; the facts rail carries a photo-count line; Orbit gains frustum markers; the Brief's scan tiles adopt resolved cover photos (I81's resolver); `room_photo_opened` telemetry is live. The HEIC derivative lane (I78) is live end to end: pillow-heif on the inference container, the `derive-scan-photo-media` `*/5` cron driving it, migration 00340 landing the derive-tracking columns, `preview_url`, and a partial index. New `useRoomScanPhotos`/`useRoomScanCovers` signing hooks fix the I79 defect — the letterhead instrument is un-broken. `confirm-scan-bundle` now accepts `scan_id` alongside `scanId` (I80).

Patina Field now captures posed photos: JPEG with day-one thumbnails, capped at 60, auto-kind only, never blocking core artifact upload, with `image_count` left entirely to the 00032 trigger per I82's root-cause ruling.

Landed main `a9ff481e`; Strata migration head 00340; designer portal deployment `ce696a04-…` (2026-07-17T07:50Z); inference container `81acccf1-…`, `heif_available`.

Prod acceptance on the real fleet: backlog cleared 233/233 derived, 0 failed. `fa361ed4`'s 33 real HEIC rows produced signed, magic-verified JPEG derivatives. `c4485bf3`'s 200 duplicate rows resolved to exactly 40 derived + 160 copied. Re-invoking the sweep is a confirmed no-op. Parse and GLB lanes ran undisturbed alongside it.

Owed: Kody's authenticated prod walk of the photo surfaces; Field's posed-photo device pass via TestFlight. ⚠ Kody's local Capture pbxproj device-build mods were stashed (`stash@{0}`) to allow this program's fast-forward pull — reconcile in Xcode before the next device build.

*Entries add: I83 · last id = I83*

### R108 · Field Capture P1 boundary — six rulings — 2026-07-17

Decision session against the Field Capture architecture deck (SC series,
patina-field-capture-architecture.html). Interview format; all six ruled.

**R108.1 — Anchor entry: typed only.** P1 ships typed anchor entry
(read from tape or laser, keyed against taps on the live model). DISTO
BLE is not scoped for P2 — it waits for field evidence of transcription
friction. Rationale: the accuracy contract is the anchor *values*, not
the transport; typed entry captures 100% of the benefit at zero
integration risk.

**R108.2 — Device posture: Pro scans, non-Pro context.** Scanning
requires a LiDAR Pro device. Non-Pro iPhones get context capture —
photos and voice notes pinned to the project via Capture Inbox — and
the output is never labeled a scan. Rationale: the tolerance promise
is the product; a degraded scan path muddies it in v1, but the
context path keeps every designer in the funnel.

**R108.3 — On-site preview: the gate is the preview.** The QA
coverage mesh (painted surfaces, scorecard) is the on-site answer to
"did I get everything." Splats are trained server-side only; on-device
splat training is not pursued. Rationale: the on-site question is
coverage, not beauty; Metal-based training is months of work that buys
neither pillar.

**R108.4 — Reconstruction home: homelab behind a burst-ready
queue.** Pipeline runs on the homelab GPU (2080 Ti) from day one. The
worker contract is designed so a cloud burst worker is a config
change, not code. Flip trigger: the first non-Leah designer in
production. Rationale: pilot volume is single-designer scale; zero
marginal cost inside the existing Coolify stack; the SLA risk is
accepted until someone outside the house depends on it.

**R108.5 — Anchor gate: soft, with a loud stamp.** A session may
close with fewer than three anchors, but the Room File is stamped
UNVERIFIED, every dimension wears the widest badge class, and the
stamp prints in the drawing title block. Rationale: truth-framing over
blocking — the file states what it is; the friction teaches the habit
without stranding a designer whose laser is in the truck.

**R108.6 — Drawing formats: DXF ships in P1** alongside PDF and
SVG. Overrules the staged recommendation (PDF/SVG first): CAD import
is day-one workflow for the pilot, and review-only drawings would
leave P1 half-useful. Scope cost accepted knowingly — adds a
parametric-graph → DXF serializer (ezdxf-class, layered walls/
openings/dims) to the P1 server work; days, not weeks.

*Entries add: R108 · last id = R108*

### I84 · Field Capture P1 — item-1 repo audit: found/absent + pre-emptions — 2026-07-17

Item 1 of the P1 package (docs/design/field-capture/field-capture-p1-package.md),
run before any build. Four-lane read-only audit (iOS Field app, schema ledger,
server ingest/queue/workers, portal surface). Verdict: the package's premises
need reconciliation before item 2 — the additive-schema list collides with live
tables, and R108.4's infra target is retired. Pre-emptions below gate item 2+.

**Found / absent by area:**

- **T-03 capture flow (Patina Field, apps/mobile/Capture): FOUND, thin.** Stock
  RoomCaptureView session (Features/SiteScan/RoomPlanScanSession.swift) — no
  shared-ARSession core; exports scan.usdz (.parametric) + captured_room.json to
  an OS temp dir. Posed photos: FieldPosedPhotoService + CaptureKit's
  FieldPhotoGate (JPEG q0.8, 2 s auto-interval, 60-photo cap, pose+intrinsics in
  photos_metadata.json) — no depth, no sharpness gating. Upload: foreground
  supabase-swift only (SupabaseSiteScanService → room-scans bucket +
  mark_scan_upload_complete RPC), in-memory reservation dict, no manifest, no
  checksums, no background URLSession, no durable scan sync state (app kill
  mid-upload orphans a processing row). Existing seams: MeasureSheet/
  ARMeasureView tap-two-points + typed fallback (specimen-scoped, not room
  anchors); voice notes specimen-scoped only; LiDAR gate via
  RoomCaptureSession.isSupported with a demo-mode non-Pro fallback.
- **Prior art in the sibling client app (apps/mobile/Patina): FOUND** — the v3
  advanced-bundle pipeline the package re-specifies without naming it:
  ScanManifest.swift, CoverageAnalyzer.swift, PosedPhotoService.swift,
  ArtifactUploader.swift, BackgroundScanUploader.swift
  (URLSessionConfiguration.background, sha256 via base64 x-metadata header,
  408/429/5xx backoff), RoomScanSyncService+AdvancedBundle.swift (calls
  confirm-scan-bundle fire-and-forget). Item 2/8 work is substantially a port
  into Field, not an invention.
- **Capture Inbox: FOUND twice.** field_captures (00233 + RPCs 00235) is the
  Field-app inbox — client_capture_id idempotency, routing-guard trigger,
  upload-progress/sha256 columns; portal UI unbuilt. proposal_captures (00130)
  owns the portal "Capture Inbox" UI name (capture-inbox.tsx). Item 7 targets
  field_captures; naming must disambiguate the two.
- **Schema: the additive list is NOT "new tables only."** rooms EXISTS (00019,
  homeowner-owned, iOS-consumed). scans ≙ room_scans (00014; extended by
  00019/00020/00027/00032/00077/00082/00265/00338). Bundle state
  (bundle_manifest_url, artifacts_sha256, upload_progress, scan_schema_version)
  already on room_scans (00077/00082). anchors/measurements overlap the
  room_scan_geometry(_elements) spine (00337) — but that spine is parsed
  RoomPlan output; typed ground-truth anchors and per-dimension tolerance
  provenance do NOT exist anywhere (genuinely new; no tolerance column in the
  entire schema). pipeline_events would confusion-collide with
  pipeline_stage_events (00305, different domain); assets with
  svc_media.media_assets. House style is text + CHECK, not native enums.
- **Storage: FOUND.** room-scans bucket (private, 500 MB, MIME list 00077, path
  {artifactType}/{userId}/{scanId}/…, policy fix 00287, photo_derivatives/
  family 00340); capture-media (00234); field-media (00282). Cron sweeps live:
  parse-room-scan */10, convert-room-scan-glb */15, derive-scan-photo-media
  */5, all via invoke_edge_function with job_runs telemetry.
- **Ingest/validation: PARTIAL.** confirm-scan-bundle edge fn is live but thin —
  HEAD reachability + photo-count parity only, no checksum walk; called by
  Patina, never by Field. Item 2's manifest spec + CLI validator is genuinely
  new work.
- **Queue/workers: FOUND.** agent_tasks (00297, @patina/agent-queue) is the
  mandated generic queue (CLAUDE.md: never create parallel queues) — FOR UPDATE
  SKIP LOCKED claiming, backoff, groom cron; carries Agent-OS baggage (assignee
  kody|leah CHECK, review states). infra/media-worker is a LIVE Cloudflare
  Queues + Containers burst-ready worker — the literal item-9 contract shape.
  infra/inference-worker (CPU standard-3, FastAPI) already runs the scan lanes
  (usdz→glb, heic→jpeg) as stateless HTTP driven by edge-fn sweeps. BullMQ/
  Redis are dead deps; no pg-boss.
- **Portal: FOUND around the hole.** R107 Room View (/rooms, /room/[scanId];
  SVG plan + plain-three.js orbit; FactsRail is the proto accuracy
  certificate). NO project→room navigation exists — useProjectRoomScans has
  zero consumers and room_scans.project_id/project_room_id (00265) are
  unrendered; that is exactly the hole Room File v0 (item 12) fills.
  Versioning precedent: proposal revision chain (new row per version, quiet
  version strip). Download precedent: spec-pdf edge fn → blob → anchor click.
  Three room models coexist (rooms / room_scans / project_rooms +
  proposal_scope_rooms) — Room File must pick lanes explicitly.

**Pre-emptions (rulings applied to item 2+):**

1. **Schema redraft (blessed, code-only):** create NO rooms/scans/
   capture_bundles/assets tables. New additive tables FK room_scans:
   scan_anchors, room_files, room_file_measurements, scan_pipeline_events
   (renamed from the package's anchors/measurements/pipeline_events to fit the
   live namespace). Bundle state rides the existing room_scans columns +
   manifest object; no modification of existing tables in P1.
2. **Migration numbering (blessed):** mint at 00341. 00341–00349 verified free
   across main + all 504 branches; 00350–00354 already exist as files on boh/*
   branches — the BOH reservation is materialized, not soft.
3. **R108.4 conflict (ESCALATED at M1):** "homelab GPU via Coolify" targets
   retired infra (CLAUDE.md: box dead, no homelab hosts). P1 requires no GPU —
   anchor solve + SVG/PDF/DXF generation are CPU. Proposed: P1 worker on
   Cloudflare Containers per the media-worker/inference-worker pattern, which
   preserves R108.4's burst-ready-contract intent; the GPU question returns at
   P2 splat training. Needs Kody's ruling before item 9.
4. **Bundle spec direction (blessed):** superset the existing v3
   ScanManifest/room_scans contract (scan_schema_version bump), not a parallel
   format; Field adopts + extends with anchors, scorecard, depth.
5. **iOS reality check:** no shared-ARSession core exists in either app —
   item 3 is new work even with v3 ports; background-resumable upload ports
   from Patina's BackgroundScanUploader.

*Entries add: I84 · last id = I84*

### R109 · Field Capture M1 passed — R108.4 amended: native Linux GPU worker, no Coolify — 2026-07-17

M1 (bundle spec v1 + 00341 additive schema + CLI validator, branch
field-capture/m1-spec-schema through e1178370) blessed by Kody as
reviewed. Items 3–8 (iOS capture) unblocked; branch merges to main.

**R109.1 — Worker home, amending R108.4's transport, keeping its
contract.** Kody stands up GPU access on a Linux box he manages;
ingress, where any is needed, rides a Cloudflare Tunnel he operates.
Coolify is out — too much overhead — and stays out. The reconstruction
worker ships as a package that runs NATIVELY on the box (no container
orchestration required to operate it). Unchanged from R108.4: the
burst-ready contract — the worker registers against the queue by
configuration alone, so a cloud worker remains a config change, not
code; the flip trigger stays the first non-Leah designer in
production. P1's stages (anchor solve, drawing generation) are
CPU-bound and run on the same box from day one; the GPU earns its keep
at P2 splat training. Package design lands in
docs/design/field-capture/scan-pipeline-worker-design.md.

*Entries add: R109 · last id = R109*

### R110 · Field Capture M2 passed — first real-room bundle end-to-end — 2026-07-17

Kody walked a real room on the Field build (branch
field-capture/p1-ios-capture-core) and the full chain held: capture rig
(four streams, one clock) → coach/scorecard → typed anchors → checksummed
manifest bundle → resumable upload → confirm-scan-bundle verification →
parse sweep → Room View render (plan 10.0′ × 17.3′, 173 sq ft, 21 posed
photos, project doc-link resolved). M2 gate PASSED. Branch merges to main;
items 9–11 open against the R109 worker design.

Two field defects found and fixed during the walk, both regression-guarded:

1. Storage MIME allow-list rejected the new artifact kinds — the uploader
sent semantic MIMEs (x-ndjson, x-tar) the 00077 bucket list refuses. Fix
ef6fac59: octet-stream transport types + a drift-guard test pinning every
descriptor against the allow-list; spec B-17 splits semantic (manifest)
from transport (storage) MIME.

2. confirm-scan-bundle HEAD-checked raw /object/public/ URLs on the
private room-scans bucket — 409 on every bundle despite all artifacts
present. Latent since 00082; exposed by the first caller that ever
depended on its verdict. Fix 8df0d005 (fn v18 on Strata): verify via
/object/info/authenticated with the caller's JWT. Open follow-up: the
photos-manifest count cross-check still reads the raw URL (informational
only, never 409s).

Wording: the escalate-class coach/anchor/scorecard strings shipped as
placeholders, were seen during the walk, and stand as accepted-for-P1
unless Kody flags changes (catalogue in m2-device-walk.md).

Device-owed edges carried forward, not gating M2: airplane-mode resume,
500 MB unattended background completion, background-relaunch session
rehydration, sharpness-threshold calibration, voice-note audio seam.

*Entries add: R110 · last id = R110*

### R111 · Field Capture M3 passed — drawing set accepted after one revision round — 2026-07-17

M3 slice review on Kody's real room (M2 scan 95266be1, chained locally).
r1 verdict: model-space 2D "looks great"; four revisions ruled by Kody and
applied (commits 0a36870d + e51ccb0e):

1. DXF paperspace layout populated — the Layout tab is now a plottable A3
sheet (viewport onto the approved model + branded title block); model
space unchanged.
2. Sloped ceilings render — RoomPlan supplied polygonCorners on one flat
wall only, so the slope is synthesized as corner-height chords between
walls of differing heights (2.48 m → 2.85 m in the review room); genuinely
sloped polygons draw verbatim when future captures carry them. Ceiling
note reads SLOPED; true ceiling planes remain P2.
3. Patina brand on every title block — PATINA wordmark + strata-mark
motif, monochrome plottable line art derived from the icon mark, deck
type grain, in SVG/PDF and the DXF paperspace.
4. iOS anchor coach steers to SC-08's recipe (two long spans + one
ceiling height): short-span nudge (< 2.5 m or < half the larger plan
dimension), staged prompts, "recipe met" confirmation — advisory only;
R108.5's soft gate unchanged.

r2 set accepted by Kody: **M3 PASSED.** Items 12–13 open.

Carried notes: solve honesty validated live — Kody's short-span M2
anchors produced RMS 133 mm, all flagged, visibly loose tolerances; the
system refused false precision exactly as R108.5 intends. D4 (outlines
drawn from scale×model while dim text carries snapped values;
sub-drawing-scale) stands accepted for P1.

*Entries add: R111 · last id = R111*

### R112 · Field Capture P1 build complete — items 12–13 closed; M4 is operational — 2026-07-17

Items 12 and 13 land, closing the P1 build scope (items 1–13 all built,
each adversarially reviewed before the next stacked on it).

**Item 12 — Room File v0** (branch field-capture/p1-room-file →
merged): /portal/projects/[id]/room-file/[scanId], project-nested with
the Room Files zone as entry (first consumer of useProjectRoomScans —
the project→room navigation hole from I84 is closed) plus a quiet door
from the R107 facts rail. Drawings with sign-at-click downloads,
certificate rendered with the flagged-anchor table, measurements in
ft-in with the badge triad, capture context resolved via the REAL flat
dotted-key provenance contract (the design doc's nested shape matched
zero shipped captures — docs corrected), version strip in the
proposal-revision idiom. Fail-closed behind the `room-file` flag on all
three surfaces. Click-path AC proven as a designer persona: project →
Room Files → page → signed PDF 200, zero hand-typed URLs. Formatter
identity TS↔Python guaranteed: banker's rounding both sides + one
shared fixture table asserted in both test suites.

**Item 13 — telemetry + pilot readiness:** all six stages emit
(capture.metrics + upload.snapshot added worker-side from data in
hand); query surface = scan_pipeline_runs + scan_tolerance_distribution
(00372; SECURITY DEFINER views gated by the house admin idiom,
authenticated-only, certified non-leaking); M4 pilot runbook at
docs/design/field-capture/m4-pilot-checklist.md — ordered prod
prerequisites, pilot-day walk against SC-16, rollback lines, owed-items
ledger.

**M4 prerequisites are now purely operational:** (1) Strata deploy —
db push 00341/00370/00372, the confirm-scan-bundle photos-count
follow-up, portal deploy with the room-file flag; (2) the worker on
Kody's Linux box (services/scan-pipeline/install.sh + env); (3) iOS
build with the anchor coach + B-19 manifest change to the pilot device,
with the real-photo-bundle ingest probe on pilot day; (4) flag
enablement for Leah. Gate: Leah retires the tape measure for one real
project's drawings.

P2 ledger (not P1 blockers): co-designer drawing-download walk before
shared access ships; A3 deep-link gap on shared Room File links; GIN
index on field_captures.provenance at inbox scale; voice-note audio
seam; background-upload device edges; sharpness calibration; associative
DXF dimensions.

*Entries add: R112 · last id = R112*

### I85 · Field Capture — first complete production run; box-ops findings — 2026-07-18

Kody's M2 scan (room_scans 95266be1) ran the full production chain on his
Linux GPU box: ingest 5.2 s → solve 0.7 s → drawings ~3.6 s → delivery
~3.7 s (≈13 s compute). room_files v1 = generated; 11 objects under
room_file/{uid}/{scanId}/v1/ (5 sheets SVG+PDF + room.dxf, all sha256
recorded); certificate honest — all 3 short-span anchors flagged and
excluded, scale 0.9828, RMS 133.6 mm, 24 dimensions measured ±11%, zero
verified (the long-span coach exists to change this on the next scan).
Room File renders on the project page behind the room-file flag.

Operational findings, all fixed durably in-repo during the run:
1. Legacy pre-B-19 manifests (shipped app builds) list a photosManifest
   artifact that never uploads — ingest now normalizes it away
   (77416c06; ingest.legacy_manifest_normalized event).
2. install.sh does a COPY pip-install into the venv — git pull alone
   never updates a running worker; re-running install.sh is the upgrade
   path (and the box's source was an rsync snapshot, doubling the trap).
3. systemd sandbox (ProtectSystem=strict) + ezdxf's XDG dotfiles
   (config ini, then font cache) EACCES'd the drawings stage twice —
   all four XDG base dirs now confined to APP_DIR with ReadWritePaths
   (5d05a066, a4cf2c35) and doctor probes each preflight.
4. Prod 00341 had been applied early by the BOH deploy from a pre-final
   file — parity migration 00373 restored the drawings column (the
   status CHECK and rfm UNIQUE had already made it).

Parked, by design: task for scan fa361ed4 (the abandoned pre-MIME-fix
upload; no manifest ever landed) stays failed — garbage row, 7-day
retention reaps its partial objects.

M4 remaining: Leah's device build + flag, pilot day per
m4-pilot-checklist.md.

*Entries add: I85 · last id = I85*

### R113 · Field Capture M4 passed by Kody's ruling — P1 CLOSED; P2 opens — 2026-07-18

Kody rules M4 passed on his own testing: the full production chain ran
end-to-end on his real room (I85 receipt — capture through delivered
Room File, ~13 s compute on his GPU box), and he accepts that as the
P1 gate. The package's literal gate — Leah retires the tape measure —
is deferred, not discarded: Leah's device build, flag entry, and pilot
walk (m4-pilot-checklist.md) carry forward as the first P2-era
operational item, and her walk remains the first third-party
validation of the instrument.

**P1 is CLOSED.** Items 1–13 built, reviewed, deployed, and run in
production. The tolerance-honesty system validated live twice (short
anchors → flagged, loose, truthful).

**P2 — presence — opens** per deck SC-15: pose refinement (SfM warm-
started from the ARKit trajectory), dense fusion (TSDF → measurable
mesh), splat training (SPZ for the browser), the portal walkthrough
viewer with click-to-measure against the hidden dense mesh, and the
pinned photo registry. P2 gate: a maker quotes from the Room File
without a site visit. The GPU (2080 Ti, confirmed live by doctor) now
earns its keep. A P2 package — scope, numbered plan, gates, and the
open questions needing rulings — goes to Kody for a ruling session
before P2 code starts, mirroring the P1 discipline.

Carried P2 ledger: Leah pilot walk; co-designer download walk; A3
deep-links on shared Room File links; GIN index on
field_captures.provenance; voice-note audio seam; background-upload
device edges; sharpness calibration; associative DXF dimensions;
measurements 'mesh' source-class widening; arrival-arc/schedule-spine
flag rollout misconfig (flagged 2026-07-18, awaiting Kody's call).

*Entries add: R113 · last id = R113*

### R114 · Field Capture P2 boundary — six rulings on the P2 package — 2026-07-18

Ruling session against field-capture-p2-package.md (Part B). All six ruled
by Kody.

**R114.1 — On-device splat preview: IN, preferred for preview.**
Overrules the package's server-only recommendation and amends R108.3 for
P2: on-device splat training/preview joins the capture flow as an
orientation tool (the Scaniverse-proven capability the deck catalogued).
Two-tier framing preserves the trust architecture: the DEVICE preview is
what the designer sees on site — beauty and coverage orientation, never
measured against; the SERVER-trained splat remains the Room File
deliverable, and click-to-measure only ever rays the hidden dense mesh.
The P1 "preview is the gate" coverage scorecard stays authoritative for
QA; the splat preview augments, never replaces it. iOS is therefore no
longer untouched in P2 — the preview becomes its own build item on the
capture side.

**R114.2 — GPU budget ratified:** ≤10 min wall-clock per room for
refine + fuse + splat on the 2080 Ti, bounded MCMC Gaussian-count cap;
amber past ~20 min.

**R114.3 — Retroactive re-solve ratified:** IN, operator-triggered
(no auto-sweep); scan 95266be1 is the P2-M2 subject — the dense mesh
re-solve should tighten its honest ±11%.

**R114.4 — Keyframe cadence ratified:** unchanged at P2 start;
revisit only with P2-M2 reconstruction-quality evidence.

**R114.5 — Leah walk ratified:** the P1 pilot runs in parallel when
she is available; not a predecessor to P2 server-side work.

**R114.6 — Cloud burst ratified:** the R109 config-not-code contract
holds for GPU stages, same flip trigger, plus a per-room GPU-cost
ceiling; pilot volume stays on Kody's box.

*Entries add: R114 · last id = R114*

### I86 · Field Capture P2 · item-1 audit + M1 gate deliverables (spec + additive schema) — 2026-07-18

Item 1 of the P2 package (docs/design/field-capture/field-capture-p2-package.md,
ruled R114), run before any GPU stage code. A repo-grounded audit of the four P2
surfaces (worker, schema, portal, box), then the two P2-M1 gate deliverables: the
§10 stage contract and the additive 00376/00377 schema. LOCAL-ONLY — P2-M1 review
gates the prod push.

**Found / absent by area:**

- **Worker (services/scan-pipeline/): FOUND, P1-complete.** src/patina_scan_worker/
  with stages/{ingest,solve,solve_math,dimensions,captured_room,drawings,validator,
  base}.py + drawing/{svg,pdf,dxf,model,units,brand}.py; queue/db/config/telemetry/
  doctor/storage/keys/http/untar/cli. The three P2 GPU stages refine/fuse/splat are
  ABSENT — genuinely new. GPU extras ([solve]/[splat]), the GPU systemd variant, and
  install.sh --upgrade (I85 finding 2) are ABSENT (item 3). §10 was a growth stub;
  it is now a full stage contract.
- **Schema: the P1 present-schema base is FOUND.** 00341 (room_files;
  room_file_measurements.source CHECK anchor|parametric; scan_pipeline_events.stage
  CHECK capture..delivery), 00372 (scan_pipeline_runs + scan_tolerance_distribution,
  SECURITY DEFINER + admin-domain gate), 00373 (P1 parity). 00341 ALREADY COMMENTS
  "P2 widens source to add mesh" — the schema anticipated P2. The Present-Layer
  columns, source='mesh', stage refine/fuse/splat/present, and scan_present_stats
  are ABSENT — exactly the 00376/00377 work.
- **Portal: the reuse targets are FOUND.** R107 Room View orbit is plain three.js
  (apps/designer-portal/src/components/document/rooms/room-view/orbit/{orbit-canvas,
  orbit-stage,photo-marker-objects}.ts(x)) — the item-8 walkthrough + item-10 marker
  reuse target, no react-three-fiber. The item-12 Room File page
  (apps/designer-portal/src/app/(portal)/portal/projects/[id]/room-file/ +
  components/room-file/{room-file-view,capture-context-section,measurements-table,
  certificate-section,drawings-section,room-file-version-strip}.tsx) is the extend
  target. A Spark/SPZ splat viewer is ABSENT (item 8).
- **Box / bundle:** Kody's 2080 Ti is live (I85 doctor); Appendix A documents
  box-prep. Prod bundle 95266be1 = room_files v1, 11 objects under
  room_file/{uid}/{scanId}/v1/ (I85). A live keyframe/depth/mesh.ply presence +
  sha256 probe against prod storage is an OPERATOR step for M1 (no prod-storage
  creds in this build session) — flagged, not blocking the spec/schema.

**M1 gate deliverables (this entry):**

- **§10 of scan-pipeline-worker-design.md** is now the full P2 stage contract:
  topology (refine → fuse → mesh-solve; splat a parallel branch off refine; present
  rollup), per-stage I/O + VRAM/time budget (R114.2 ≤10-min, amber ~20-min) +
  artifact outputs + failure classes (permanent p_fatal vs transient), the
  mesh-aware solve upgrade (source='mesh', anchor discipline unchanged), packaging/
  extras, and the R114.6 burst contract.
- **00376** (present schema): source +'mesh'; stage +refine/fuse/splat/present;
  room_files Present columns (dense_mesh_url/measure_mesh_url/splat_url/present
  jsonb/present_status CHECK/presented_at). Additive, idempotent, catalog-guarded,
  no GRANT change.
- **00377** (present query surface): scan_pipeline_runs +refine_ms/fuse_ms/splat_ms/
  present_status; new scan_present_stats view (GPU-budget + artifact-size), both
  SECURITY DEFINER admin-gated; legacy-grants seed regenerated for the new GRANT.
- **Verified LOCAL:** pnpm supabase:reset clean; source=mesh + stage=refine accepted,
  garbage rejected (23514); Present columns + CHECK present; both views carry the new
  fields and leak 0 rows to a non-admin caller; re-apply of both files is a no-op;
  pnpm db:generate regenerated database.types.ts (135 insertions, git diff of the
  generated file is the whole change). NOT pushed to Strata — P2-M1 review is the gate.

**Pre-emptions (before item 3+):**

1. install.sh COPY-install (I85 finding 2) means the GPU extras + --upgrade path
   (item 3) are how a running worker gains refine/fuse/splat — git pull alone won't.
2. The prod-bundle evidence probe (keyframes/depth/mesh.ply on 95266be1) is the one
   operator prerequisite before item 4 refine runs for real (P2-M2 subject, R114.3).
3. splat is a parallel branch off refine (not off drawings) — the item-7 enqueue
   point is refine-complete, concurrent with fuse+solve, per §10.1.

*Entries add: I86 · last id = I86*

### R115 · Field Capture P2-M1 passed — stage contracts + schema approved — 2026-07-18

Kody passes P2-M1. Approved: the §10 stage contract (refine → {fuse,
splat} fork with the same-key conflict-ignore join into present;
per-stage budgets with single-card serial ≈15–24 min = R114.2 amber by
design; inspect-and-requeue failure posture) and the additive schema
(00376 source+'mesh' / stage widenings / Present columns; 00377 view
extensions + scan_present_stats). The review certified the load-bearing
invariant at the DB: mesh evidence can never manufacture 'verified'
without an anchor — rfm_anchor_source_shape untouched and still firing.

Authorized by this pass: 00376/00377 push to Strata; items 2–7 of the
P2 package (the GPU stages) open on the established cadence — build,
adversarial review, gate. Kody's prod bundle 95266be1 is the standing
subject through P2-M2 (first dense mesh vs the P1 certificate) and
P2-M3 (walkthrough + click-to-measure).

*Entries add: R115 · last id = R115*

### I87 · Field Capture P2 item 4 · COLMAP known-pose engine + evidence correction — 2026-07-18

Item-4 executable adapter probe and adversarial correction, before any queue
handler, DB/storage mutation, box operation, or production scan run. This entry
fixes the GLOMAP/full-pose assumption in I86/§10 and blesses the supported pilot
direction conditionally; it does not claim runtime qualification.

**Engine blessing (conditional):** exact pilot target = COLMAP CLI 4.0.2 plus
`pycolmap==4.0.2`. Primary path: per-image corrected intrinsics and full converted
ARKit poses in a registered seed model → `point_triangulator` →
`bundle_adjuster` → Sim(3) world rebase of points, camera centres, and camera
orientations. Fallback: Cartesian camera-centre priors with covariance →
`pose_prior_mapper` → BA; fallback rotations are explicitly discarded.
Standalone GLOMAP was archived 2026-03-09 and moved into COLMAP; integrated
`global_mapper` has no supported full-pose warm-start surface, so it is
diagnostic-only. COLMAP 4.1.1 is current as of 2026-07-18; 4.0.2 is deliberately
the exact CLI/binding pilot-qualification pin, not the current or validated
release. Any newer 4.x needs its own parity/API/GPU fixture and explicit pin.

**Qualification remains open:** before handler/deploy, a box fixture must prove
both version surfaces report 4.0.2, the exact PyCOLMAP database/model APIs,
database ID preservation, GPU SIFT, triangulation/BA, and deliberate
CLI/binding-mismatch rejection. A real Field/Core Image capture fixture must
also prove the `.oriented(.right)` encoded raster and Linux materializer pixel
mapping. Swift source inspection plus synthetic ray math is not that proof;
artifacts say `targetColmapVersion` and
`unvalidated-pending-field-and-box-fixture`, never “validated.”

**Evidence correction:** Sim(3)-aligned distance back to the same raw ARKit
trajectory is renamed `trajectory_shape_change_pct`. It is keyframe-weighted,
cadence-sensitive, diagnostic-only, and cannot establish quality because a
no-op scores 0%. The planned `sfm_residual_pct` key stays unwritten; the old
0.2–0.5% aspiration has no item-4 acceptance role. Actual refinement evidence
uses identical feature tracks and verified non-temporal loop geometries before/
after: registration coverage, reprojection RMSE px, loop-relative rotation error,
loop-relative translation-direction error, plus optional independent anchor/
ground-truth error. Coverage must be at least 80% and non-regressing; no
comparable metric regresses; at least one improves by 1%; unchanged/no-op output
is `REFINE_NO_MEASURABLE_IMPROVEMENT` and is not certifying. Internal geometry
improvement still does not certify absolute room accuracy without validated
external evidence.

**Runtime + concurrency contract:** one engine deadline is
`min(stage monotonic start + 4 min, actual claimed lease expiry - 60 s)`; every
command consumes its remainder and streams output to scratch with only a bounded
64 KiB tail retained. Verified overlap counts only edges from the deterministic
temporal/ARKit-spatial candidate graph. Artifacts are create-only,
checksummed/versioned, fsynced, and manifest-last. Refine may set scalar
`refining` but never mutates P1 status/Present JSON/ready. It forks Fuse and Splat
after the durable refine manifest. Fuse must pass through mesh solve-upgrade and
its durable solve manifest. Mesh-solve and Splat enqueue one identical
stable-ID-only Present task with a common refine parent; Present derives and
verifies canonical refine/fuse/mesh-solve/splat manifests, composes Present JSON
once, and alone writes ready/presented_at. Parallel branches use events/manifests,
never competing JSON/scalar progress writes.

**Implementation gate:** the pure adapter/tests and canonical documents make
this a go for handler development only. Deployment and scan `95266be1` remain
no-go until the version/API/GPU/Field-raster fixture, local-scratch real-scan
evidence (including no-op rejection), queue replay/order/race tests, and aligned
pose consumer contracts for Fuse/Splat pass.

*Entries add: I87 · last id = I87*

### I88 · Field Capture P2 item 3 · DeskDev GPU box acceptance — 2026-07-19

P2 item 3's real-box gate passed on `DeskDev` without exposing a GPU-stage claim
set to the queue worker. Full receipt:
`docs/design/field-capture/p2-item3-gpu-box-acceptance-2026-07-19.md`.

**Runtime evidence:** Ubuntu 24.04.3, RTX 2080 Ti (`sm_75`, driver 580.159.03),
isolated CUDA 11.8 with GCC/G++ 11, and a real CUDA compile/runtime smoke passed.
COLMAP 4.0.2 commit `d927f7e` built with CUDA, activated under
`/opt/colmap/4.0.2`, and exposed the six required known-pose/fallback commands.
The doctor-only systemd twin ran temporary `STAGES=refine,fuse,splat` under the
installed sandbox. Cold and warm passes were fully green for GPU visibility,
COLMAP/PyCOLMAP parity, Open3D CUDA tensor execution, nvcc 11.8, torch cu118
`sm_75`, gsplat public rasterization, and all confined caches. The cold gsplat
extension setup reported 130.11 s; the warm doctor reported 7.383 s of systemd
CPU consumption. Cleanup completed and the queue worker remained inactive with
its persistent CPU stage contract unchanged.

**Rollout evidence:** the read-only Strata query for refine/fuse/splat tasks in
queued/running/failed states returned zero rows. No DB or Storage row was
mutated. Main `14b01e89` now emits the exact temporary GCC11/CUDA11.8 acceptance
environment, isolates each doctor's journal by cursor, rejects pre-existing
runtime drop-ins, proves the doctor quiescent, and restores worker posture
fail-safe. Focused tests passed 7/7; prior full evidence was 94 installer and
310 scan-pipeline tests; independent adversarial review passed.

**Boundary:** this closes item 3 dependency/sandbox qualification only. Item 4
remains blocked on exact PyCOLMAP database/model API + GPU-SIFT reconstruction
evidence and a physical Field/Core Image HEIC/Linux-materializer fixture. GPU
stages stay unregistered and must not be enabled; scan `95266be1` remains
local-scratch-only until those gates pass.

*Entries add: I88 · last id = I88*

### I89 · Field Capture P2 item 4 · conservative lease-deadline prerequisite — 2026-07-19

The lease-budget prerequisite is integrated on remote `main` at `c92c4190`.
This is prerequisite plumbing for Refine, not a stage enablement or fixture
qualification.

**Contract:** `VISIBILITY_TIMEOUT` now has one strict positive
seconds/minutes/hours grammar and one parsed source of truth. Each claim batch
captures request-start monotonic time before the RPC and carries that timestamp
plus the exact validated visibility interval as an immutable conservative
expiry bound on every returned task. PostgreSQL cannot establish the lease
before request start, so ordinary request/response latency consumes rather than
extends the engine budget. The stage-facing accessor fails closed on missing,
boolean, non-finite, or expired metadata and supplies the existing Refine
deadline: `min(stage monotonic start + 4 min, claimed lease bound - 60 s)`.

**Verification:** 83 focused config/queue/refine/registry tests passed, followed
by all 333 scan-pipeline tests. Independent adversarial review returned **PASS**.

**Boundary and suspend caveat:** no GPU stage was registered or enabled. Item
4A's exact COLMAP/PyCOLMAP GPU-SIFT qualifier and physical Field/Core Image
raster/materializer fixture remain in development; the queue worker's persistent
GPU stages remain disabled. Item 3's real second-runtime-worker/disjoint
GPU-task claim operator AC also remains open: only the local two-session
`SKIP LOCKED` code proof exists, and no live claim may be attempted until
registered handlers and safe fixture tasks make it legal. Python's Linux
monotonic clock does not advance through system suspend, while the PostgreSQL
lease does. The conservative bound therefore assumes an awake host: disable
automatic and manual suspend on DeskDev before enabling Refine, or first move
to a suspend-aware clock/live lease revalidation contract. Scan `95266be1`
remains local-scratch-only until the remaining item-4 gates pass.

*Entries add: I89 · last id = I89*

### I90 · Field Capture P2 item 4A · COLMAP gate passed; disabled Refine foundations hardened — 2026-07-23

DeskDev passed the exact COLMAP/PyCOLMAP half of Item 4A. The immutable v3
receipt is recorded in
`docs/design/field-capture/p2-item4a-colmap-qualification-2026-07-22.md`.
Its canonical payload SHA-256 is
`7d60da6b6f67c864e4584b417ed36c209ceea4aee1b9811441d244574f40f278`.
COLMAP CLI and PyCOLMAP both reported 4.0.2 at commit `d927f7e` with CUDA;
PyCOLMAP reported `has_cuda=True`; all five images completed GPU SIFT, explicit
guided matching, ID-preserving PINHOLE rewrites, known-pose seed,
triangulation, model re-open, and authoritative binding bundle adjustment.
The operator independently proved canonical receipt bytes and recomputed the
payload digest. Failed v1 (CPU-only binding) and v2 (invalid guided-match
accounting assumption) directories remain preserved without pass receipts.

The disabled Refine foundation series is integrated through tip `97d082d3`.
Storage publication is create-only, manifest-bound, same-descriptor, and
manifest-last. Engine subprocess/native boundaries share the absolute
lease-aware deadline, fail closed on launch and cleanup uncertainty, kill and
reap process groups before return, and cap diagnostics. The runner deep-copies
accepted candidates, requires exact COLMAP versions and MIME/hash contracts,
defaults to primary-only execution, records fallback provenance when explicitly
enabled, preserves fatal cleanup classification, and hashes only nonblocking
same-descriptor regular files. The installer exact-source allowlist, service
user smoke, wheel, and sdist carry both disabled modules.

Combined verification passed 267 focused cross-module tests and all 648
scan-pipeline tests. Bash syntax, compileall, Ruff, diff integrity,
package/import checks, and stage/config probes passed. Independent component
and final integration reviews returned PASS. The stage registry still has no
`scan_pipeline.refine`; defaults remain `ingest,solve,drawings`. DeskDev's
worker remained inactive with that persistent CPU stage set, and the
qualification made no queue, Strata, or Storage mutation.

**Boundary:** Item 4A's physical Field/Core Image HEIC/Linux materializer
receipt remains open, as do deterministic real backend artifacts, the
materializer/publisher/lease-aware handler composition, real-room
same-evidence improvement on scan `95266be1`, Fuse/Splat/mesh-solve/Present,
host-suspend mitigation, registration, and GPU-stage enablement. No GPU queue
task may be claimed yet.

*Entries add: I90 · last id = I90*

### I91 · Field Capture P2 item 4 · disabled Refine boundaries — 2026-07-23

The combined disabled Refine code increment is integrated through tip
`064a14c8`. It adds three unregistered, queue-independent boundaries. The runner
binds distinct source-HEIC and engine-PPM identities, an exact closed
six-engine-artifact set, canonical derived documents, explicit fallback
provenance, bounded telemetry, and a pure strict publication validator. The
materializer uses owner-anchored descriptor-pinned workspace access, bounded
descriptor-only producer sinks, per-input/output ceilings, a 4 GiB aggregate
raster-workspace cap, and deep canonical JSON checks. The publisher/storage seam
revalidates the exact trusted result before owner-scoped create-only,
same-descriptor immutable publication, with the manifest published last under
the carried absolute deadline.

The installer allowlist, service-user import smoke, wheel, and sdist carry all
disabled modules. Final verification passed 737 scan-pipeline tests, a
449-test combined focused gate, a 249-test post-review cross-component gate,
Ruff, compileall, shell syntax, diff integrity, and explicit default/registry
probes. Independent component, lifecycle, predicate, and combined code reviews
passed after their findings were resolved. The stage registry still has no
`scan_pipeline.refine`; defaults remain `ingest,solve,drawings`; no queue,
Strata, Storage, or real-scan mutation occurred.

**Boundary:** I90 remains only the synthetic exact COLMAP/PyCOLMAP/GPU-SIFT
proof. I91 is not physical Field/Core Image raster proof and does not compose a
real Field acquirer/HEIC decoder, a descriptor-safe materializer-to-runner
lifecycle, or concrete killable deadline-enforced adapters. Local-scratch
`95266be1` same-evidence improvement, queue replay/fork and consumer/Present join
proof, Fuse/Splat/mesh-solve/Present, host-suspend mitigation, stage
registration, and GPU enablement remain hard gates. No GPU task may be claimed.

*Entries add: I91 · last id = I91*

### I92 · Field Capture P2 item 4A · physical Field raster gate passed — 2026-07-24

DeskDev passed the exact physical Field/Core Image HEIC-to-raster
qualification from the installed immutable release
`/opt/patina/scan-pipeline/.venv.release.5e55c004de1888d5984d0c2b` at code
commit `df10a157`. The physical iPhone 17 Pro Max artifact and installed-run
evidence are recorded in
`docs/design/field-capture/p2-item4a-field-raster-qualification-2026-07-24.md`.
The canonical v2 receipt SHA-256 is
`930638e3e98aa49d27f6b305d886d45b51b94714aecd49a84452e0800e0feac6`;
the materialized PPM SHA-256 is
`78c68791b59f63fb080080d24c70bf6fdbe2fdcba6b6d798694e92c9a29e6f15`.
All six color markers matched the physical Core Image BGRA oracle within a
maximum per-channel error of one, while non-identity `irot` and `imir`
mutations were rejected.

The evidence boundary is split deliberately. The iOS regression owns the exact
ImageIO `pitm`/`ipco`/`ipma` association, essential-bit, property-index, and
identity-`irot` payload writer contract. The Linux qualifier owns only
libheif-recognized primary-item semantic transforms and raw/default pixel
equality; it requires one identity `irot`, rejects recognized `imir`/`clap`,
non-identity or duplicate recognized transforms, metadata, and any decode
difference, and makes no claim about unknown BMFF properties. Focused raster,
full scan-pipeline, `FieldRasterEncodingTests`, Capture lint,
negative-mutation, installer provenance, package-integrity, and
installed-release qualification gates passed. Failed v1 console evidence
remains preserved.

The run made no queue, Strata, or Storage mutation. DeskDev's worker and doctor
remained inactive, the persistent stages remained
`ingest,solve,drawings`, and the installer transaction was clean.

**Boundary:** This closes the physical HEIC-to-raster convention only. A
packaged killable descriptor-safe `FieldRasterMaterializer`, Field Storage
acquirer, materializer-to-runner-to-publisher lifetime, killable COLMAP
backend, local-scratch `95266be1` proof, queue handler and replay/downstream
join, Fuse/Splat/mesh-solve/Present, host-suspend mitigation, registration, and
GPU enablement remain hard gates. No GPU task may be claimed.

*Entries add: I92 · last id = I92*

### I93 · Field Capture P2 item 4 · disabled physical raster adapter deployed — 2026-07-24

The exact-profile production adapter is integrated on remote `main` at
`a7aee1f4` and installed on DeskDev as immutable release
`/opt/patina/scan-pipeline/.venv.release.2fcccaf0feafa92fdca3fd2a`. It accepts
only the I92-qualified 360×640 ImageIO HEIC profile, consumes a pinned source
descriptor, copies into a private service-owned scratch directory, executes the
root-owned helper through pinned `/proc/self/fd` aliases under the carried
lease-aware deadline, kills and reaps the complete process group on failure,
validates and unlinks the exact PPM output before streaming, and fails closed
on cleanup or provenance uncertainty. It remains deliberately uncomposed:
`production_enablement` is `disabled`, `scan_pipeline.refine` is not registered,
and default/persistent stages remain `ingest,solve,drawings`.

The installer now compiles the byte-identical I92 helper source into each GPU
release and publishes a canonical root-owned manifest binding source and binary
hashes, hardening/compiler flags, actual `pkg-config` flags, and the exact
Noble libheif package/header identity. Release reuse requires those values to
match the live host, candidate activation re-probes them after the long build,
and runtime execution requires the helper-reported loaded libheif version to
match the manifest. Missing, malformed, stale, symlinked, writable, non-ELF, or
hash-divergent helper state fails closed or causes an immutable rebuild before
activation. The deployed helper-manifest SHA-256 is
`b59ba22121ca09d56a9cad9cc8aba978c93e33c613ab34972cfac115559697bc`.

The installed adapter independently replayed the retained physical iPhone 17
Pro Max HEIC. Input SHA-256
`89b98d8ff82d1421a973f1a5f7a39f9c3a69f4488b20a3ec1229b4c7abc86379`
produced the exact 691,215-byte I92 PPM with SHA-256
`78c68791b59f63fb080080d24c70bf6fdbe2fdcba6b6d798694e92c9a29e6f15`
and materializer identity
`patina-field-raster-libheif-helper-v2-4840e0e6d3c9-libheif-1.17.6-libde265`.
Deployment evidence is retained at
`/var/lib/patina/scan-work/qualification/deploy-a7aee1f4-field-raster-v1`;
its canonical receipt SHA-256 is
`e2eace6f258df17cd6af6a9655937a879e11813a8612b758bcf1497dac1afc90`.

Verification passed 648 queue-independent scan-pipeline tests with seven
platform skips, 138 privileged-installer/packaging tests, all 30 Linux adapter
tests on DeskDev, the real installer wheel/provenance/CUDA-SIFT gates, exact
helper-manifest/live-host checks, and independent adversarial review with no
remaining blocker. No queue, Strata, or Storage mutation occurred. The worker
and doctor remain inactive; the installer transaction, runtime override, and
adapter scratch are clean.

**Boundary:** this closes the packaged physical decode adapter only. Concrete
owner-scoped Field Storage acquisition, the descriptor-safe
materializer→runner→publisher lifetime, concrete killable COLMAP backend
composition, and reviewed local-scratch evidence on `95266be1` remain before
any queue handler, registration, or GPU-stage enablement. Host suspend must
also be disabled or the lease clock contract made suspend-aware before Refine
can run.

*Entries add: I93 · last id = I93*

### I94 · Field Capture P2 item 4 · disabled acquisition and native lifecycle prerequisites — 2026-07-24

The disabled Refine lifecycle-prerequisite packet is integrated through code
tip `73a27b37`. It adds a concrete owner-scoped Field Storage acquirer and
extends the materializer producer seam to carry the exact source artifact,
`user_id`, `scan_id`, bounded private-file sink, and the single lease-aware
deadline. Before any credentialed client exists, the acquirer validates the
owner/key ledger. It then performs one identity-encoded raw object GET, requires
the exact status/content-length/byte-count/SHA-256 contract, and writes only
through the bounded sink. Operational auth, rate-limit, and 5xx failures remain
retryable; missing or identity-invalid input is fatal. HTTP/runtime failures are
normalized without retaining credential-bearing cause, context, or output.

The native boundary now transfers a canonical ledger of unique read-only local
regular-file descriptors with SCM_RIGHTS only after the child proves its
dedicated POSIX session. Parent and child independently enforce token, count,
per-file, aggregate, inode, size, and hash limits; the child revalidates the
original stat snapshot and shared open-file-description offset after engine
return. Parent finalization restores and rejects any shared-offset mutation on
success, timeout, error, or interruption before closing its duplicate.
Process-group TERM/KILL and success-quiescence signals occur only while the
unreaped original leader still owns its PID/PGID; after reap, verification and
retry never address that numeric process group. Descriptor, connection, child,
and descendant cleanup fail closed on uncertainty.

Final verification passed 146 focused Storage/materializer/native tests, 720
broader queue-independent tests with seven platform skips, and 140 isolated
privileged-installer/packaging tests: 860 passed and seven skipped across the
split suite. Compileall, focused Ruff correctness and formatting, shell syntax,
diff integrity, exact package-member/import checks, and explicit posture probes
passed. Independent component and combined adversarial reviews passed after
credential classification, exception-secret, sink-deadline, PID-reuse, and
shared-offset findings were resolved. `FieldStorageArtifactAcquirer` remains
`production_enablement=disabled`; `scan_pipeline.refine` is unregistered;
defaults remain `ingest,solve,drawings`. No queue, Strata, Storage, or DeskDev
runtime mutation occurred.

**Boundary:** I94 is not the evidence builder or a concrete COLMAP backend and
does not compose the I93 raster adapter with the runner/publisher. Parent-side
hashing is synchronous and therefore limited to service-owned local files until
it moves behind a killable boundary; FUSE/network files are forbidden. The
native proof is capped at 64 unique files, 128 MiB per file, and 4 GiB
aggregate, so a larger scan needs an explicitly reviewed batch/file-backed
protocol rather than truncation. The descriptor-safe composition, unchanged
evidence rejection and comparable improvement on local-scratch scan
`95266be1`, queue replay/fork, downstream four-manifest join,
Fuse/Splat/mesh-solve/Present, host-suspend mitigation, registration, and GPU
enablement remain hard gates. No GPU task may be claimed.

*Entries add: I94 · last id = I94*

### I95 · Field Capture P2 item 4 · disabled evidence and COLMAP protocol foundations — 2026-07-24

The disabled Refine foundation packet adds one exact evidence builder and one
lower-level COLMAP protocol scaffold without composing or registering a stage.
The evidence builder consumes complete immutable source/raster identities,
database keypoint tables, raw post-triangulation/pre-BA and refined post-BA
models, and every pair in the deterministic candidate graph. It derives the
existing `RefinementEvidence` contract from model geometry rather than caller
scalars, requires identical fixed-track memberships, validates every database
point2D and inlier index, requires at least 80% verified connected coverage and
one verified non-temporal loop, and binds source, raster, database, model, and
pair identities into canonical SHA-256 commitments. Frame input is capped at
400, carries the existing absolute deadline, and normalizes arithmetic overflow
to the adapter error contract.

The lower-level scaffold defines a bounded archive-chunk packet instead of one
descriptor per frame, canonical timestamp/source ordering and engine PPM
identities, the reviewed known-pose seed → point triangulation → bundle
adjustment operation plan, and a COLMAP CLI child that inherits the already
isolated native process group. Parser hardening rejects boolean schema versions,
Unicode or noncanonical GPU indices, unsafe source basenames, huge-number
overflow, manifest drift, and undeclared frame members. The backend and evidence
builder share the raw/refined snapshot semantic constants, but the provisional
backend measurement rows are intentionally not the builder request contract.

Verification passed 338 Refine regression tests and all 144
installer/packaging tests. Focused Ruff correctness and formatting, Python
compilation, shell syntax, diff integrity, exact source/wheel member checks, and
independent adversarial review passed. The review verdict is PASS to land only
as disabled/uncomposed foundations and NO-GO for execution or publishable
evidence. No install, deployment, queue, Strata, Storage, DeskDev, or real-scan
mutation occurred.

**Boundary:** packet extraction, the native output-descriptor channel, removal
of runner display-path reopening, aligned-output construction, and an artifact
contract carrying both the raw pre-BA and refined models remain unqualified.
The evidence builder's raw/refined snapshot identities are scratch-only and do
not fit the runner's exact six candidate artifacts. Sequential COLMAP
command-group quiescence, complete command-exception normalization, the
200–400-frame physical packet, position-prior fallback, local-scratch scan
`95266be1`, registration, and every GPU queue stage remain hard gates.
`scan_pipeline.refine` stays unregistered and persistent/default stages remain
`ingest,solve,drawings`.

*Entries add: I95 · last id = I95*

### I96 · Field Capture P2 item 4 · disabled packet extraction and command supervision foundations — 2026-07-24

The disabled I96 safety packet is integrated through code tip `68495fd9`. Its
packet extractor accepts only the exact manifest-ordered, uncompressed USTAR
regular-file universe from pinned chunk descriptors. It uses positional reads
and descriptor-relative creation, rejects noncanonical metadata, links, special
files, undeclared or colliding members and trailing bytes, revalidates every
chunk, and parses the extracted declared request. The hardened boundary requires
the exact privately sealed native-child context, opens the request
nonblockingly before type verification, binds file and directory cleanup to
their recorded inode identities, rolls back objects created before ledger
completion, and normalizes oversized-integer and recursive JSON failures.

The separate Linux command supervisor carries the native process group and
single deadline across sequential commands. It requires the same exact sealed
context, temporarily enables and restores child-subreaper ownership, refuses
phase advancement while an adopted child remains, performs bounded
terminate/kill/reap cleanup, and normalizes setup, drain, wait, log, and cleanup
failures with cleanup precedence. Both modules are present in the exact
installer source guard, candidate smoke imports, trusted source-copy checks,
wheel and sdist assertions, and missing-module refusal cases.

The reviewed future output contract is seven child-to-parent descriptors in
transit: the six persistent engine artifacts (`adapter-v2.json`,
`pairs-v2.txt`, `database-v1.db`, `seed-model-v1.tar`,
`aligned-sparse-model-v1.tar`, and
`engine-command-evidence-v1.json`) plus one scratch raw pre-BA model snapshot.
The child may propose Sim3/aligned bytes, but the parent must recompute and
verify alignment and the pose digest before acceptance. This is a design
constraint only; I96 does not implement the output handoff.

Verification passed 458 Refine tests with five expected Linux-only lifecycle
skips on macOS and all 148 isolated installer/packaging tests. Focused Ruff
correctness and formatting, Python compilation, shell syntax, diff integrity,
posture probes, and independent adversarial review passed. The review verdict
is GO only for disabled/uncomposed landing and NO-GO for activation,
registration, GPU queue claims, real-scan execution, or publishable output.
Every backend qualification flag remains false, `scan_pipeline.refine` remains
unregistered, and default/persistent stages remain `ingest,solve,drawings`. No
install, deployment, queue, Strata, Storage, DeskDev, or real-scan mutation
occurred.

**Boundary:** extraction scratch is still child-owned and can survive SIGKILL;
the optional source/adapter ledger contents remain unparsed; stable-identity
cleanup still needs exclusive parent-owned workspace control across the
non-atomic stat-to-unlink/rmdir window. Escaped descendants are detected but
not contained, and executable identity, command/environment allowlists, a
pinned toolchain contract, and real Linux child-subreaper evidence remain open.
The parent-owned descriptor workspace and reverse lease, seven-descriptor
output channel, runner path-reopen removal, aligned-model construction,
parent-side alignment/pose verification, evidence composition, physical
200–400-frame packet, position-prior fallback, local-scratch scan `95266be1`,
queue replay/fork, downstream four-manifest join, registration, and every GPU
queue stage remain hard gates.

*Entries add: I96 · last id = I96*

### I97 · Inked Instruments — one legible next action across The Document — 2026-07-26

All modern surfaces in the `(document)` route group now share one productive
action grammar. Each meaningful action region may carry at most one primary
act: charcoal ink, off-white type, and a slim inset clay rule. Alternate
productive acts use paper and an aged-oak border; tertiary acts remain
underlined text. Terracotta danger is reserved for an irreversible act inside
its confirmation region. Labels are never smaller than 12px, pointer targets
are at least 44px, focus remains visible, and none of these actions cast a
shadow. This supersedes R27's typography-only implication for letterhead
instruments and any earlier “no button fill” reading of the instrument rule;
R27's placement and workflow meanings still stand.

The hierarchy is regional, not one-primary-per-page. Desk folios name their
next act in the card footer without nesting another interactive control.
Forward save, send, create, confirm, upload, apply, approval, or sign-off acts
lead their own work region; alternatives step back. Navigation tabs, section
doors, disclosures, back and close controls, checkboxes, switches, drag
handles, card containers, and the bottom navigation bar do not impersonate a
primary CTA. They keep their existing editorial and spatial physics while
receiving touch-sized targets and visible keyboard focus where applicable.

On viewports below the existing 980px Document breakpoint, the active Desk,
lifecycle phase, or Room may register its current primary act in a separate
full-width action dock immediately above the bottom navigation bar. The dock
clears the bar and safe area, updates with readiness/state changes, disappears
when no phase primary exists, and falls back to letterhead messaging only when
available. It is suppressed while a mobile shell sheet is open and remains
behind modal scrims; sheets and dialogs retain their own submit controls. The
navigation bar itself is unchanged.

Action impressions and selections use the guarded
`document_action_shown`/`document_action_selected` events with only
`surface_key`, `region_key`, `action_key`, `variant`, and `presentation`
(`inline` or `mobile_dock`). Labels, household names, record ids, and other PII
never enter the event. Impressions deduplicate per mounted presentation and
disabled actions do not emit selections. The change rides the existing
`the-document-pilot` audience with no additional flag.

*Entries add: I97 · last id = I97*

### I97 (Field Capture P2) · item 4 · parent-owned lease, pinned toolchain, packet ledgers, and the frozen output handoff — 2026-07-27

The ordered next-work packet's items 1, 2, 3, and 5 are integrated on
`field-capture/refine-i97-final` through code tip `2887dd0e`, and item 4's
qualified-host evidence exists. Every piece lands disabled and uncomposed.

Item 1 replaces child-owned extraction scratch with a parent-provisioned
descriptor-rooted 0700 workspace beneath a caller-named container. The parent
pins container and workspace by descriptor, verifies identity, mode, ownership
and emptiness, leases a duplicate descriptor to the child over SCM_RIGHTS on its
own transport with the reverse direction declared in the ready envelope and
independently re-verified by the child, and purges the tree from the same
`finally` that reaps the leader — after normal return, timeout, SIGTERM, and
SIGKILL — bounded by depth and entry budget rather than by the shared deadline,
so an exhausted deadline can never strand scratch. Cleanup's identity guard is
now an `O_PATH` pin taken before an entry is touched, because `(st_dev, st_ino)`
alone is not an identity on Linux: a just-freed inode number comes straight back
to the next creator, measured in this repository's own gate container 20/20
times against 0/20 on macOS/APFS. Which hosts recycle is deliberately not
isolated and not claimed — an earlier revision named the ext4 allocator as the
mechanism and that provenance is withdrawn, since the container's `/tmp` reports
`overlayfs`. Holding the reference keeps the number from being re-issued, which
is what makes the later comparison mean sameness. Provisioning also refuses a
symlinked or non-canonical container before any `os.open`, and refuses a lease
root that cannot host a COLMAP path option: the argv ceiling and the lease path
are one budget, so the root is capped at 960 bytes with 64 reserved for the
longest reviewed argv tail.

Item 3 pins what may execute and in what environment. Executable identity is
hashed under the carried deadline against a canonical installed manifest and
re-proven in the instant before `execve`, with `st_ctime_ns`/`st_mtime_ns`
recorded so a same-length in-place rewrite of an already-verified inode cannot
execute; `qualified` is derived from a manifest the loader proves rather than
accepted as a caller bool. The child receives exactly the 13-key
`COMMAND_ENVIRONMENT_ALLOWLIST` — never the ambient environment — with every
writable value confined to `APP_DIR` or the private workspace so
`ProtectSystem=strict` stays intact. Argv is an allowlist confined **per
option** to its own leased surface rather than to one shared root:
`--image_path` reads `packet/`, `--input_path`, `--database_path` and
`--output_path` are rooted at writable `work/`, and `tmp/` is nobody's surface.
A single shared root had made `--output_path <lease>/packet/images` a plannable
command that would write the reconstruction over the hash-validated extracted
source images the evidence builder later binds to. The toolchain identity
(COLMAP 4.0.2, source commit `d927f7e`, CUDA 11.8, nvcc 11.8.89, gcc-11,
`sm_75`, driver 580.159.03) is pinned from values this repository already
receipts and rejects drift rather than adapting to it; values knowable only from
the box remain declared manifest inputs in `OWED_BOX_VALUES` and are not guessed.

Item 2 parses the optional source and adapter ledgers. `COLMAP_PACKET_MEMBER_ROLES`
closes the member role universe, at most one ledger per role is permitted,
exactly one engine request is required and must be declared and correctly
routed, each ledger is pinned to its exact packet-root path and capped at 4 MiB,
and validation runs before the workspace lease so a bad packet never creates a
file. Ledger bytes are captured during the copy and re-read descriptor-relatively
with positional I/O against exact mode, owner, size, link count, byte equality
and the manifest digest; source rows are bound one-to-one to engine-request
frames. A role-universe drift guard AST-parses the loader's own `allowed_roles`
literal and asserts set equality with the backend constant, so adding a role on
either side reddens. The adapter ledger is trimmed to the envelope
`{schemaVersion, contract, runId, materializerId}` after every per-row assertion
proved re-derivable from the engine request and manifest alone; a `frames` key
is now refused as an unknown field, and the trim's premise is executable rather
than asserted. Declared source HEIC digests, `materializerId` authentication,
and the ledger schemas themselves are recorded as residuals, not claims.

Item 5 implements the reviewed seven-descriptor native output handoff: the six
persistent engine artifacts plus one scratch raw pre-BA model snapshot, named as
a closed token universe before the child exists. The child may fill only those
names under leased `work/` and hands the descriptors up over SCM_RIGHTS; the
parent does not trust the child's size/digest ledger — it opens the same names
relative to its own pinned lease descriptor, requires the transported descriptor
to be the same `(st_dev, st_ino)`, hashes its own descriptor, and refuses the
run unless its own computation reproduces the declaration. The bytes are frozen
**by construction** rather than by `fstat`: each output is copied at receipt into
an `O_TMPFILE | O_EXCL` anonymous file the parent creates in a private 0700 vault
on the lease's own filesystem and is hashed from that copy's own descriptor, so
the returned object never had a name, can never be given one, and no other
process ever held a descriptor to it. `_open_output_freeze_vault` drops this
process's dumpable flag with `prctl(PR_SET_DUMPABLE, 0)` before any copy exists,
which closes the descriptor-theft routes at their common gate; the price — no
core dump, permanently, and no live debugger — is written where a caller reads
it. Three exploits demonstrated against earlier revisions all now fail: a
same-length rewrite plus `futimens` that leaves every remaining `fstat` field
identical, a same-UID `/proc/<pid>/fd` reopen of a held descriptor, and a
`pidfd_open` + `pidfd_getfd` descriptor theft. The theft is measured at euid 1000
under an unconfined seccomp profile and skips under Docker's default profile,
which refuses the syscall regardless of target; the skip reports the measured
refusal rather than claiming a proof.

Item 4's qualified-host run produced the evidence and found a production blocker
that two green local gate environments and every review round to that point had
missed. `_parse_linux_process_stat` rejected `pgrp == 0`, which every Linux
kernel thread legitimately reports — no session, no process group — and on the
qualified host 283 of 547 live PIDs read that way, so the native quiescence scan
raised on the first kernel thread it walked past and every *successful* native
Refine call failed `REFINE_ENGINE_CLEANUP_FAILED`. macOS has no `/proc` and a
container has its own PID namespace with no kernel threads in it, which is why
neither gate could see it. Zero is now read as the legitimate value it is rather
than tolerated as a parse failure: a member is recorded only when its group
equals the leader PID and the scan refuses outright any leader that is not
strictly positive, so a zero can never compare equal to one, while genuinely
malformed rows still raise and still fail the scan closed. The fix was re-proven
on the host — zero parse failures across every live `/proc` row, with every
`pgrp 0` row confirmed a kernel thread by absent `VmSize` and absent `cmdline`
and no userland row among them (host measurement; not reproducible from this
repository). In-repo coverage feeds verbatim captured rows through the parser
and drives the real scandir/open/parse/membership path against a synthetic
procfs, so it runs on macOS too.

Workspace-lease provisioning refusals classify by errno rather than by exception
type, and default **retryable** with the fatal side enumerated: `ELOOP`,
`ENOTDIR`, `EACCES`, `EPERM`, `EROFS`, and `ENAMETOOLONG`, each justified at its
row as a statement about the operator's configuration rather than the host's
momentary state. The rationale is the bounded retry budget in
`complete_agent_task`: retries are capped with backoff, so a wrongly retryable
permanent error costs a bounded attempt budget while a wrongly fatal transient
error is unrecoverable. Known-transient errnos keep their rows even though they
now fall to the default, because the row is what puts the errno's name in the
journal line instead of "unclassified errno".

Final state is 1139 passed / 0 skipped on the qualified host (host measurement)
and 1136 passed / 3 skipped in the container gate. All 14 `*_QUALIFIED` flags
remain `False`, `NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT` remains
`False`, `DEFAULT_STAGES` remains `"ingest,solve,drawings"`, nothing registers or
dispatches `scan_pipeline.refine`, and `refine_colmap_backend.py` is
byte-identical to `0b7b47fa` (blob `6743e66eb06369d18e34b0054d10734e03a109ec`).
No install, deployment, queue, Strata, Storage, DeskDev, or real-scan mutation
occurred.

**Boundary:** I97 proves no composition. Item 6 — raw pre-BA and refined model
snapshots, a child-proposed alignment, and parent-recomputed Sim3 and pose
digests before the six persistent artifacts are produced — is next, then item 7's
materializer → raster → backend → runner → publisher composition on local
scratch, then Kody's gates. No real scan has run, no COLMAP or GPU execution
occurred anywhere in this line, and nothing here moves activation closer. Item 3's
toolchain pin is inert until an operator produces `OWED_BOX_VALUES`; the
installer does not yet emit
`/opt/colmap/4.0.2/share/patina/refine-colmap-toolchain-v1.manifest.json`.
`_validate_workspace_path` remains lexical, so a symlink planted inside `work/`
still escapes it; the final `unlinkat`/`rmdir` in cleanup is still name-based;
`materializerId` authenticates no adapter build; and the 200–400-frame pilot
band is exposed as constants but deliberately unenforced with
`PILOT_200_400_FRAME_RANGE_QUALIFIED` still `False`. Comparable
reprojection/registration/verified-loop evidence on local-scratch scan
`95266be1`, queue replay/fork, the downstream four-manifest join, registration,
and every GPU queue stage remain hard gates.

*Entries add: I97 · last id = I97*

### R116 · Field Capture P2 item 4 CLOSED — qualified-host acceptance; two scoped exceptions carried — 2026-07-27

Ordered next-work item 4 is **closed**. Its evidence is
`docs/design/field-capture/p2-item4-qualified-host-acceptance-2026-07-27.md`
— measured on the qualified x86_64/ext4 host at code commit `77b4ff19` —
together with I97.

**Basis.** Linux child-subreaper behaviour and adopted-child reaping are
established on the host through the shipped helpers, not a local `prctl`:
the subreaper transition is complete and reversible, an adopted grandchild
reparents to the subreaper and is consumed by the helper rather than the
probe, a live same-group descendant is correctly reported non-quiescent,
and a dead solo leader is correctly reported quiescent. Cleanup precedence
is established across three paired controls — non-zero exit, deadline
overrun, and success, each with and without residue — driven through the
real `run_inherited_colmap_command` inside a real `setsid` leader with
nothing monkeypatched: `REFINE_ENGINE_CLEANUP_FAILED` replaces both
`REFINE_ENGINE_FAILED` and `REFINE_ENGINE_TIMEOUT`, and a command that
exits 0 with residue still refuses to return a result. The five Linux-only
lifecycle tests that skipped on macOS at I96 — the skips that made this
item necessary — all execute on the host: the gate ran 1139 passed with an
**empty** skip list, four times.

**Escaped-`setsid` handling is accepted as scoped.** This program has held
throughout that detection is in scope and containment is later work, and
the receipt measures both halves rather than blurring them. The
process-group scan cannot see an escapee — a `setsid` child has its own
pgrp by construction, so that is a blind spot by design, not a defect —
while the shipped adoption/`waitpid` scan does see it and the call fails
closed. The clause is satisfied as written. Containment stays open and is
carried to item 7's composition.

**Two exceptions are carried, not closed.** (1) Escaped-descendant
containment, above. (2) Precedence over the `drain_errors` branch *in
isolation* is in-repo coverage, not a host measurement: on that host the
drain fault surfaced as a cleanup error, so no case produced `drain_errors`
non-empty with `cleanup_errors` empty to compare against. Neither exception
may be quietly dropped from the packet.

**What closing item 4 does not mean.** No composition exists. No COLMAP and
no GPU ran, no real scan ran, and no production DB or Storage was touched.
All fourteen `*_QUALIFIED` flags remain `False`,
`NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT` remains `False`,
`DEFAULT_STAGES` remains `ingest,solve,drawings`, and
`scan_pipeline.refine` remains unregistered. Nothing here moves activation
closer. This is a technical acceptance on evidence and nothing more.

**Authority.** Under the package's escalate-vs-bless rule this is a
pipeline/acceptance judgement — blessed and logged, not an owner-facing
gate. Kody's P2 milestone gates are untouched: M2 (first dense mesh from
`95266be1` judged against the P1 certificate), M3 (walkthrough and
click-to-measure), and M4 (a maker quotes without a site visit) remain his
to call, and every downstream hard gate named in I97 remains open. Item 6
is next.

*Entries add: R116 · last id = R116*

### R117 · Field Capture P2 — 100-frame pilot accepted for `95266be1`; the 200–400 band recorded UNQUALIFIED — 2026-07-27

Kody accepts a **100-frame** pilot for the standing subject scan
`95266be1-5185-4aeb-8b6a-a09dceecca21`, and the 200–400 frame band is
recorded **unqualified** — not failed.

**Basis.** The scan has 100 keyframes, not 200–400. Its bundle is staged
read-only on the qualified host at `~/refine-i96-scan-95266be1` —
46,435,109 bytes across 31 files — and both keyframe records agree:
`keyframe_summary.json` reports `fired: 100` with zero blur rejections and
zero encode drops, and `keyframe_index.ndjson` carries exactly 100 rows,
every one of them a 1440×1920 raster. 100 sits inside the packet
contract's enforced `[3, 400]` bound (`COLMAP_PACKET_MIN_ENGINE_IMAGES` /
`COLMAP_PACKET_MAX_ENGINE_IMAGES`) and below the pilot band's floor of
200, so the packet accepts it and the band does not describe it.

**Capacity is not what is holding the band back.** This is arithmetic from
the measured frame count and the shipped constants, not a measurement — no
production packet builder exists, so no packet of any size has been built.
On that arithmetic a 100-frame PPM packet is 7 archive chunks, 8 pinned
files, ≈0.77 GiB: about a fifth of the 4 GiB
`NATIVE_CHILD_MAX_PINNED_TOTAL_BYTES` aggregate ceiling and far inside the
64-file `NATIVE_CHILD_MAX_PINNED_FILES` bound. The same arithmetic clears
a full 400 frames at 25 chunks / 26 pinned files / ≈3.09 GiB. Host
headroom was 22 GiB free when this was ruled. The band is unproven because
no scan in it has been captured, not because a packet could not carry one.

**`PILOT_200_400_FRAME_RANGE_QUALIFIED` therefore stays `False`,** and this
entry is the record of *why* it stays `False`. Qualifying it requires a
longer capture — a real Field session that fires at least 200 keyframes —
and then the evidence that band would have to carry. Nothing shorter
substitutes, and the flag is not to be flipped on this ruling.

**Carried, not decided:** the shipped raster materializer hard-pins its
qualified raster to the item-4a fixture's 360×640 and rejects any other
encoded size, while this scan's keyframes are 1440×1920. A real-capture
raster size is therefore not yet qualified. That belongs to item 7's
composition; nothing here qualifies it.

**What this does not decide.** It does not qualify the 200–400 band. It
does not enable Refine, register `scan_pipeline.refine`, move
`DEFAULT_STAGES` off `ingest,solve,drawings`, or flip any `*_QUALIFIED`
flag — all of them, including
`NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT`, remain `False`. No
COLMAP, no GPU, no queue task, no production DB or Storage touch. Kody's
P2 milestone gates are untouched and remain his to call: M2 (first dense
mesh from `95266be1` judged against the P1 certificate), M3 (walkthrough
and click-to-measure) and M4 (a maker quotes without a site visit). Item 7
composes at 100 frames.

*Entries add: R117 · last id = R117*

### R118 · Field Capture P2 · Refine qualifies at capture resolution; the 360x640 raster pin is superseded — 2026-07-28

The Refine raster path is to be qualified at the **physical capture
resolution** of the Field keyframes. The program owner ruled this on
2026-07-28 after being shown the three options and their costs. Downscaling
production keyframes to the I92-qualified 360x640 profile is **rejected**, and
an intermediate profile is **rejected**.

**What forced the ruling.** The only concrete materializer this repository has
implements exactly one raster profile and refuses everything else:
`EXPECTED_WIDTH`/`EXPECTED_HEIGHT` are 360 and 640
(`field_raster_materializer.py:48-49`), and a mismatch fails
`RASTER_UNQUALIFIED` at `:1142-1146` before a pixel is read. The subject
scan's keyframes are 1440x1920, so a composed run against real capture data
refuses at its first frame. The module's own docstring states the remedy:
"Variable-size production keyframes require a new helper protocol and a new
physical-device qualification receipt."

That 360x640 is a **fixture** size, not a production one.
`FieldRasterFixtureExporter.swift:32-33` synthesizes at `nativeWidth = 640`,
`nativeHeight = 360`, while production writes a full-resolution HEIC
(`FieldKeyframeRecorder.swift:303`) through an encoder that passes
`cgImage.width`/`cgImage.height` straight out
(`FieldRasterEncoder.swift:41`). Nothing downscales anywhere on the capture
path. The qualified profile and the shipped profile were never the same
profile.

**Why capture resolution and not a downscale.** Three reasons, the first
measured and the other two read off the code.

1. The packet layer is *already built* for 1440x1920 and is inside budget at
   it. One frame is a P6 file of `17 + 1440*1920*3 = 8_294_417` bytes; 100
   frames pack into 7 chunks and 8 pinned files at 0.77 GiB, and the 400-frame
   contract maximum into 25 and 26 — inside the 64-file and 4 GiB ceilings
   either way (`refine_lifecycle.py:1038-1039`,
   `test_refine_lifecycle.py:2653-2668`). Nothing about full resolution
   strains the transport that exists.
2. A downscale would be geometrically wrong as the code stands. Intrinsics are
   passed to the engine verbatim from the capture index
   (`refine_lifecycle.py:1152-1158`) and nothing rescales them, so 360x640
   rasters would reach COLMAP carrying a focal length four times too large for
   the image they describe. The rescale is unwritten work, which means the
   "cheap" option is not cheaper — it relocates the qualification burden and
   degrades the result at the same time.
3. 360x640 is 230k pixels against 2.76M — 8.3% of the captured detail — fed to
   feature detection and matching whose whole job is finding structure. This
   is reasoning about reconstruction quality, not a measurement; no archive
   this repository has parsed came out of COLMAP.

**What the ruling obligates.** Four things, in order, none of them optional.

1. The helper protocol carries dimensions instead of assuming them.
   `_PPM_HEADER` and `_PPM_SIZE` (`field_raster_materializer.py:84-85`) and
   the eight metadata comparisons at `:890-897` are all derived from the two
   pinned constants and must become functions of the declared profile, under a
   bound so the size is constrained rather than merely variable.
2. Re-qualification is mandatory **by construction**, not by choice.
   `QUALIFIED_HELPER_SOURCE_SHA256` is the SHA-256 of
   `field_raster_libheif.c` itself — recomputed as
   `4840e0e6d3c98bbebecc4354349bae3963718583fb5c882f9807b0d222bee9c3`, and
   asserted by `test_packaged_source_is_the_i92_qualified_source`. Any edit to
   the helper source invalidates the I92 receipt automatically.
3. A new physical-device fixture at capture resolution, a new qualification run
   on the qualified host, and a new receipt superseding I92. The fixture
   exporter must emit at capture resolution for the qualification to be about
   the profile production actually ships.
4. The new profile is pinned only once its receipt exists. Until then the
   raster qualification flags stay `False`, Refine stays disabled and
   uncomposed, and no `scan_pipeline.refine` registration or stage-set change
   is made.

**Operator dependencies.** Two steps in this chain cannot be performed by an
agent under the standing constraints: emitting the physical fixture from the
iPhone, and installing the rebuilt immutable release to `/opt` — agents do not
run `install.sh` and do not write outside `~/`. The qualification therefore
gates on the program owner at both points.

**What this does not decide.** The 200-400 frame operational band remains
unqualified per R117 and is untouched here. No claim is made that a
reconstruction at capture resolution will succeed, only that it is the profile
worth qualifying.

*Entries add: R118 · last id = R118*

### I98 · Field Capture P2 · the raster profile becomes a declared, bounded parameter (R118 build) — 2026-07-28

R118's first three obligations are built and verified; the fourth (a receipt
for a real capture-resolution profile) is not, and cannot be until the program
owner performs the two steps agents may not. Integration branch
`field-capture/r118-integration` at merge `5d7ad52c`, from
`field-capture/raster-capture-resolution` (`39b91638`) and
`field-capture/raster-fixture-full-res` (`bdd66ad4`).

**The size is now declared end to end, and the helper proves it obeyed.**
`field_raster_libheif.c` moves to protocol v3: it takes
`DECLARED_WIDTH`/`DECLARED_HEIGHT` on argv, compares `ispe`/`presented`/`raw`/
`default` against the declaration instead of `#define`s, and **echoes the
declaration back on stdout** so the parent can prove the helper enforced the
profile it was told rather than one still compiled into it. Argv is parsed as
bare bounded decimal literals rather than through `strtol`, which accepts
leading whitespace and a sign and would let `"+360"` and `"360"` name one
profile under two spellings. `FieldRasterProfile` replaces `EXPECTED_WIDTH`/
`EXPECTED_HEIGHT` and owns the PPM header and size that derived from them; the
adapter takes it with **no default**, because a default is precisely how a
fixture size came to be shipped as the production one.

**The qualifier recomputes rather than trusts.** `field_raster_qualification.py`
reads the fixture's `captureProfile` (manifest `schemaVersion` 2) and derives
the entire marker set by exact integer arithmetic from the declared profile,
comparing the manifest's list against it. A trusted marker list would let a
forged fixture define its own passing criteria. Provenance — which API produced
the dimensions, which frame semantics, device model, OS — is *required* and
bounded, not tolerated. The receipt is bumped to v3 and records which profile
was qualified on what provenance.

**The ceiling is two bounds, both already in the program.** 4096 per axis is
the helper's existing `MAX_DIMENSION` on every decoded plane and the bound
`_metadata_positive_int` already applies to every reported dimension. The
canonical PPM size is bounded by `RefineMaterializationLimits().max_raster_bytes`
read *live* rather than restated — 128 MiB, verified numerically identical to
`NATIVE_CHILD_MAX_PINNED_FILE_BYTES`. At a 4096 axis the widest admissible
profile is 48 MiB, so the axis bound binds first and the byte bound is what
keeps the guarantee true if the axis bound is ever raised; the code says so
rather than leaving a check that looks active and is not. R118's illustrative
60000x60000 is refused. The qualifier can never admit a profile the
materializer would refuse.

**Capture resolution is not a code constant, and is no longer written as one.**
`SharedARCaptureRig.makeConfiguration()` never assigns `config.videoFormat`, so
ARKit selects a default that depends on device and active frame semantics;
`frame.camera.imageResolution` is stamped per keyframe. 1440x1920 is therefore
the `.right`-rotated form of a 1920x1440 native that one device produced on one
scan — not a property of the code. The fixture exporter now resolves a
`CaptureProfile` at runtime and carries its provenance. 1440x1920 survives in
the tree only as labelled test data. The keyframe index stores intrinsics in
native landscape while raster dimensions are the rotated pair; `rotate_intrinsics`
already asserts `encoded_width == native.image_height`, and `CaptureProfile`
stores native only, deriving encoded, so the pair is never both spelled as
integers.

**The I92 receipt is dead, by construction.** `QUALIFIED_HELPER_SOURCE_SHA256`
moves `4840e0e6…bee9c3` →
`3b184937b755dc4acca4347ea6dba43dbeb111f090a91cd340e65d214937c626`, and the
same literal in `install.sh` and `install-path-guard.py` moves with it or the
installer refuses to build. I92 covers the old helper bytes only. Re-qualification
is mandatory, not elective.

**Verification.** On the qualified x86_64 host at the integration merge: **2038
passed, 1 failed, 0 skipped** — an *empty* skip list, which is the point; all 83
macOS skips are Linux-gated and every one executed. The single failure,
`test_validator_drift::test_vendored_validator_is_byte_identical`, needs
`/home/kody/scripts/validate_capture_bundle.py`, which is absent from that host,
and reproduces identically on base commit `4d983c9d` under a base-commit
control run. macOS collects the same 2039 tests, so the merge introduced no
drift. The helper compiles clean there under the release `-Werror` flags and its
argv validation was smoke-tested (leading zero, oversize, whitespace all
refused).

**Invariants held.** All fifteen `*_QUALIFIED` flags remain `False`,
`DEFAULT_STAGES` is `ingest,solve,drawings`, `scan_pipeline.refine` is
unregistered, and `refine_colmap_backend.py` is byte-identical to
`6743e66eb06369d18e34b0054d10734e03a109ec` — each independently re-verified at
the integration merge rather than taken on report.

**Three exceptions carried, none of them silent.**

1. *The reference design is refused; the reference profile is not.* A 640x360
   fixture carrying genuine device provenance still qualifies end to end, so
   the previously qualified profile remains qualifiable. A fixture
   self-identifying as `deviceModel: "reference-design"` is refused
   (`FIELD_RASTER_PROFILE_NOT_PHYSICAL`) — a synthetic drawing must not be able
   to qualify itself. Both halves are intended.
2. *`refine_lifecycle.main()` is broken and stays broken.* It has constructed
   `PackagedLibheifFieldRasterMaterializer()` with no arguments since item 7
   (`64f31021`), a latent `TypeError` in a hand-typed entry point with no
   console script and no test; it now misses two required keyword arguments
   instead of one. A repair must name a profile, which is either a forbidden
   literal or a read of the keyframe index — that is composition, and belongs
   to whoever composes item 7. Deliberately unfixed rather than patched with a
   constant this ruling forbids.
3. *The installed helper filename stays `-v2` while the protocol is v3.*
   `install-path-guard.py` names it in the release's required-executable list,
   so renaming it would make a new guard refuse an already-installed release on
   a host agents may not touch. Drift is already caught closed: the manifest
   binds `sourceSha256` and the open path refuses any release whose manifest is
   not exactly the new hash. The rename belongs with the install that
   accompanies re-qualification.

**Two claims deliberately not made.** The Swift exporter's native fixture hash
`6e9dea45…` is not reproducible from the Python side and never was — the
exporter draws an asymmetry bar the Python fixture has never contained, so the
two describe different artifacts, before this change as much as after. What is
proved instead is the property that matters: the derivation at 640x360 equals
the frozen pre-R118 marker contract exactly, so the generalization is a
superset and not a redraw. And whether RoomPlan preserves the AR session's
selected video format is unverified on device; it is an operator cross-check in
the runbook, with an explicit instruction not to qualify if the configuration
and a real scan's keyframe index disagree.

*Entries add: I98 · last id = I98*

### I99 · Field Capture P2 · capture-resolution raster qualified on the physical device; I92 superseded — 2026-07-28

R118's fourth obligation is met. The Field raster convention is qualified at
the resolution production actually captures, on the physical device, against
the rebuilt immutable release. **This supersedes I92**, whose receipt covered
the old helper bytes and the 360x640 fixture profile only.

**Verdict: PASS.** Receipt `schemaVersion` 3, `status: passed`, qualification
`p2-item4a-field-core-image-raster`, retained at
`~/r118-qual/field-raster-qualification-v3-iphone17promax-00008150-20260728-51355159/`
on the qualified host.

```text
field-raster-qualification-receipt-v3.json
sha256=f48fa56d905a8e57dac152c6d79c797f9060fe9421c18f449536708234ff1775

field-core-image-raster-v1-materialized.ppm
sha256=50dccb8a57741c4249a1db11fa3d49cd012dddaafb37b0d3f5ccbda74d116d2f
8_294_417 bytes, header `P6\n1440 1920\n255\n`
```

**The profile, and how it was established rather than assumed.** Native
1920x1440, encoded 1440x1920, on iPhone 17 Pro Max (`iPhone18,2`, UDID prefix
`00008150`) running iOS 27.0, ARKit format `1920x1440@60
BuiltInWideAngleCamera`. Four independent links, each measured:

1. The device's own Diagnostics row reported 1920x1440 off
   `ARWorldTrackingConfiguration.videoFormat.imageResolution`, read from
   `SharedARCaptureRig.makeConfiguration()` before any session runs. The
   manifest records that `videoFormat` was *unassigned*, so this is ARKit's
   default for this device and configuration — the provenance states its own
   weakness rather than hiding it.
2. **The RoomPlan cross-check passed**, which is the link R118 flagged as
   documented by Apple but never verified in this repository. A real site scan
   (`site-scan-844cf194`) was pulled off the device and every one of its **67**
   keyframes reports `intrinsics.imageWidth/imageHeight` = 1920x1440 and
   `width`/`height` = 1440x1920 — uniform, zero variation. RoomPlan does
   preserve the AR session's selected video format on this device and OS.
3. The fixture declared that profile with full provenance under manifest
   `schemaVersion` 2, and both artifact hashes verified byte-intact after
   transfer to the host.
4. The rebuilt release qualified it.

**The install that made re-qualification possible.** The immutable release moved
`.venv.release.2fcccaf0feafa92fdca3fd2a` →
`.venv.release.36629d73bd8f8299d4ec6c8c`, built from a closed 61-file source
tree that satisfies `validate-source-tree` under trust anchor `/` at uid:gid
0:0. The installed helper's usage string moved from `INPUT.heic OUTPUT.ppm` to
`INPUT.heic OUTPUT.ppm WIDTH HEIGHT`, and its manifest `sourceSha256` is
`3b184937b755dc4acca4347ea6dba43dbeb111f090a91cd340e65d214937c626` — protocol
v3. `patina-scan-worker` returned to `active`. The operator performed the
install; no agent ran `install.sh`, used `sudo`, or wrote outside `~/`.

**What the receipt proves beyond "it decoded".**

- **Geometry.** All six markers resolved at their expected encoded coordinates
  with `maxChannelError` of **1**, through a lossy HEIC round-trip whose
  tolerance is 64 and search radius 3 px. The discrete mapping
  `(x,y)=(nativeHeight-1-y,x)` holds at capture resolution.
- **Orientation is physical, not metadata.** `orientationProof` records
  *absent* embedded EXIF/XMP orientation with zero metadata blocks, so the
  right-rotation is a real raster transform. This is the defect class item 4A
  existed to catch, re-proved at the new profile rather than inherited.
- **Decode fidelity.** libheif 1.17.6 with libde265 1.0.15, exactly one
  matching HEVC decoder descriptor, `rawDefaultRGBIdentical: true`, raw =
  presented = default = 1440x1920.
- **The intrinsics agree with the shipped code.** The receipt's continuous
  mapping (`fx` 1527.75, `fy` 1537.5, `cx` 821.0, `cy` 903.75) is exactly what
  `right_rotated_intrinsics` computes from the manifest's native intrinsics on
  all six fields. The manifest deliberately uses two conventions — `H-1-y` for
  discrete marker pixels, `H-cy` for the continuous principal point — and both
  are correct for their quantity; conflating them would be a one-pixel error.
- **Safety.** `databaseWrites: false`, `storageCalls: false`, `queueClaims:
  false`, `inputFilesMutated: false`, `externalSystemsTouched: []`,
  `controlledPhysicalDeviceInputOnly: true`.

**What is deliberately still not claimed.** The fixture's synthetic intrinsics
are not the device's real optics — a real keyframe measures `fx/fy` 1358.03 and
`cx/cy` 959.09 / 721.66, near image centre, while the fixture's are off-centre
by construction so a symmetric bug cannot hide. They test the rotation
contract, not the lens. Separately, this receipt qualifies the raster
convention only: no reconstruction has been run, no `*_QUALIFIED` flag is
flipped by this entry, Refine remains disabled and uncomposed, and the
200-400 frame band stays unqualified per R117.

*Entries add: I99 · last id = I99*

### R119 · Field Capture P2 · four rulings after the capture-resolution qualification — 2026-07-28

The program owner ruled on four open questions on 2026-07-28, after I99
qualified the raster convention at capture resolution. Recorded together
because they set the order of the remaining P2 work.

**1. The gauge-invariant shape floor is closed BEFORE anything else.** The
movement floor added at `4d983c9d` refuses a child that republishes the poses
the parent submitted, but it does not refuse a child that returns the seed
under a rigid motion or a similarity: the cameras do not move relative to one
another, so the reconstruction is unchanged in the only sense that matters
while every published pose differs. The right quantity is item 6's
`ParentAlignmentVerification.fit_rmse_m`, which today is bounded above and has
no floor. Closing it requires a recorded engine that models bundle adjustment
rather than a pure similarity — the currently recorded engine produces shape
change at **4.12e-16 m / 2.38e-16 rad** on a 1.93 m-radius trajectory, machine
epsilon, so any floor above roughly 1e-15 would redden every happy-path test.
That is the work, and it precedes composition, pinning, and any run on the
qualified host. **A run whose degenerate outcome cannot be distinguished from
success is not worth scheduling**, which is the whole reason this ordering was
chosen over the faster alternatives.

**2. The engine lease is one hour; the 3600 s default stands.** The
`--lease-seconds` flag now denotes the lease itself and the engine receives
`lease - LEASE_COMPLETION_RESERVE_S`, so an hour yields 3540 s. The
justification is explicitly that **nothing in this repository has ever measured
how long a 100-frame reconstruction takes** — the previous 240 s stage cap
bound first and made every configured value unreachable, so no run ever
produced the number. The first real run is therefore given enough room to
finish and thereby produce that measurement. This is a starting value chosen to
be informative, not a claim that an hour is correct; it is expected to be
revised from the first run's data.

**3. The raster pin admits exactly 1440x1920 and nothing else.** Only the
profile carrying a physical-device receipt is admissible on the composed path;
any other resolution fails closed until it earns its own receipt. A
receipt-lookup design admitting a set of profiles was considered and rejected,
because it would make the code trust a lookup where it now trusts a measured
constant. Pinning a single qualified profile is what made the original defect
catchable — R118 exists because a fixture size was shipped as the production
one — and the pin keeps "qualified" meaning "measured on this hardware". An
operator override was likewise rejected: an escape hatch that skips
re-qualification reintroduces exactly the gap this program closed.

**4. Qualification evidence is retained under the I92 convention.** The I99
output moves to `/mnt/ada-data/Patina/.patina-builds/` under the same
no-replace rule as I92, so all qualification evidence sits in one place with
one immutability discipline. The move is an operator step: writing outside
`~/` on the qualified host is outside the constraints agents work under here,
and that boundary is not relaxed for convenience.

**What these rulings do not change.** Refine stays disabled and uncomposed
until the floor is closed: `DEFAULT_STAGES` remains `ingest,solve,drawings`,
`scan_pipeline.refine` stays unregistered, and no `*_QUALIFIED` flag flips as a
consequence of this entry. The 200-400 frame band remains unqualified per R117.
`refine_lifecycle.main()`'s latent `TypeError` remains open by design — ruling
3 now supplies the profile it may name, but the repair belongs with the
composition that follows the floor, not before it.

*Entries add: R119 · last id = R119*

### I100 · Field Capture P2 · the Refine lifecycle is composed and the qualified profile pinned; build work closed — 2026-07-28

R119's remaining rulings are built. The P2 Refine **build** work is closed; what
remains is operational and belongs to the program owner. Integration line
`field-capture/r118-integration` at merge `3d51cc6e`, carrying composition
`b86f29c9`, shape floor `434988ea`, and the toolchain manifest emitter
`84bae45f`.

**The profile is pinned where the pin belongs.**
`QUALIFIED_CAPTURE_RASTER_PROFILE = FieldRasterProfile(1440, 1920)` lives in
`refine_lifecycle.py`, deliberately **not** in `field_raster_materializer.py` —
R118/I98 moved that adapter off a compiled-in size on purpose, and what R119
ruling 3 pins is narrower: *which declaration the composed path may make*.
`require_qualified_raster_profile()` runs before anything is acquired, in six
clauses with six distinct messages: a receipt must be in force; it must still
cover the packaged helper source; the pinned profile must reproduce the
receipt's own 8_294_417-byte PPM; the adapter must declare a profile; the
declaration must be a `FieldRasterProfile`; and it must be *the* one. Neither
design R119 rejected exists: there is no `--profile` flag, no environment
variable, and no receipt lookup, and a test reads the argument parser to prove
the surface is absent rather than merely unused.

**Exactly one flag moved, and it is load-bearing rather than decorative.**
`FIELD_RASTER_CAPTURE_PROFILE_QUALIFIED = True`, justified by I99 alone —
receipt `f48fa56d…`, materialized PPM `50dccb8a…` at 8_294_417 bytes under
header `P6\n1440 1920\n255\n`, helper source `3b184937…`. It is bound to those
literals so it cannot drift: the guard compares the pinned helper digest
against `field_raster_materializer.QUALIFIED_HELPER_SOURCE_SHA256`, so editing
`field_raster_libheif.c` fails the composition **closed** rather than leaving a
stale receipt in force. Set the flag `False` and the composed path admits no
profile at all — verified directly on the qualified host, not inferred.
Every other `*_QUALIFIED` flag remains `False`, **including
`REFINE_LIFECYCLE_QUALIFIED`**: composing the lifecycle did not declare it
qualified. A test AST-parses the whole package and asserts the true set is
exactly `{FIELD_RASTER_CAPTURE_PROFILE_QUALIFIED}`.

**`refine_lifecycle.main()` is repaired.** It had constructed
`PackagedLibheifFieldRasterMaterializer()` with no arguments since item 7
(`64f31021`). Two prior agents found it, fixed it, and deliberately reverted,
because a repair must name a capture profile and none was qualified; R119
ruling 3 supplied one. The construction moved into
`build_composed_invocation(arguments)` so it is reachable from a test — that
extraction *is* the fix's testability. `main()` now runs end to end under
`python -m`, exiting 2 with one diagnostic and writing nothing, because the
owner-installed toolchain manifest does not yet exist.

**The shipped adapter is on the composed path for the first time.** A Linux
test drives materializer → the real `PackagedLibheifFieldRasterMaterializer` →
packet → recorded engine → runner → publisher at 1440x1920 over 8 frames (8 =
`ALIGNMENT_MIN_CORRESPONDENCES`, the smallest bundle the parent's Sim(3)
recomputation accepts). Every previous lifecycle test rasterized through a
stand-in. The profile is proved to cross a real process boundary: the helper
logs its argv and the test asserts `'1440', '1920'` reached the child, that
every engine raster is 8_294_417 bytes, and that `materializer_id` is the
packaged adapter's and ends `-1440x1920`.

**Adversarial cases constructed, not asserted.** A real adapter at 360x640 —
*the previously qualified I92 profile* — is refused
`REFINE_RASTER_PROFILE_UNQUALIFIED`, as are 1920x1440 (the native pair, the
plausible mistake), 1080x1920, and ±1 px on each axis. Refusal happens before
acquisition: a counting acquirer records zero calls and both scratch and
publish directories are empty. The converse is covered too — a qualified
declaration with an unqualified *bundle* is refused per frame, which is what a
run from any other device would look like.

**One surviving mutation, reported rather than absorbed.** The clause "the
pinned profile reproduces the receipt's PPM size" survived the first sweep
because no input could reach it — precisely the failure mode this program keeps
finding. The guard was kept (it refuses a *run*, where the assertion only
refuses a commit), given a reaching test, and re-verified RED against a fresh
control. The sweep's own log retained a stale pre-fix survivor line, and the
author flagged that rather than letting it read as the verdict.

**Verification.** Fully merged line on the qualified x86_64 host: **2149
passed, 1 failed, 0 skipped**. The empty Linux skip list holds. The single
failure is `test_validator_drift::test_vendored_validator_is_byte_identical`,
absent `/home/kody/scripts/validate_capture_bundle.py`, reproduced on a
base-commit control. The `install.sh` smoke-import list conflicted on merge —
each side had modules the other lacked — and was resolved as the union; all
four trust lists (`install.sh`, `install-path-guard.py`,
`tests/test_install_script.py`, `tests/test_packaging.py`) were then
cross-checked and agree on every module.

**Posture is unchanged and was re-verified at the merge, not taken on report.**
`DEFAULT_STAGES = "ingest,solve,drawings"`; `scan_pipeline.refine` unregistered
(comments only); `PILOT_200_400_FRAME_RANGE_QUALIFIED` `False` per R117;
`DEFAULT_LEASE_SECONDS = 3600.0` per R119 ruling 2; `refine_colmap_backend.py`
byte-identical to `6743e66eb06369d18e34b0054d10734e03a109ec`.

**What the composed path still does not prove — recorded in the module
docstring, not only here.** No COLMAP, CUDA or GPU has ever run; the path fails
closed at the toolchain preflight because the manifest is an owner-installed
artifact. No real Field HEIC has been decoded on this path — the Linux test
drives the real adapter, real descriptor pinning and a real helper *process*,
but the helper is a stand-in writing canonical PPM; libheif on a real capture
needs the root-owned installed release. No archive this repository has parsed
came out of COLMAP; every sparse model in the suite is packed byte by byte by
its tests. Nothing has measured how long a 100-frame reconstruction takes. The
pin covers one device, one OS and one ARKit format by design. Escaped-`setsid`
containment remains open as R116 exception (a) — detected, not contained.

**Therefore the first real run is expected to establish exactly four things:**
that COLMAP executes under the pinned toolchain and the one-hour lease; that
libheif decodes real 1440x1920 Field keyframes through the installed helper;
how long 100 frames actually take; and whether the resulting evidence clears
`evaluate_refinement_evidence` rather than merely clearing the non-vacuity
floors. Nothing before that run can answer any of them.

*Entries add: I100 · last id = I100*

### R120 · Field Capture P2 · the capture app's transport archives contradicted their own index; the app is the side that changes — 2026-07-28

The first real Refine run was attempted on 2026-07-28 against the 100-frame
subject scan and **did not reach COLMAP**. It found a shipping contract break
between the capture app and the scan-pipeline worker. The ruling: **the capture
app is wrong and the app changes.** Relaxing the worker was considered and
rejected.

**The defect.** `SupabaseSiteScanService.buildTransportArchives` tarred both
heavy streams with `TarArchive.Entry(name: $0.lastPathComponent, …)` — bare
filenames. The same app's `keyframe_index.ndjson` records `heicPath` and
`depthPath` as `keyframes/<file>`, and the worker resolves every member by
exactly that string (`refine_materializer.py:2566`,
`extracted[indexed.frame.heic_path]`), with `_SAFE_ARCHIVE_MEMBER` requiring
the `keyframes/` prefix. A flat member can never match. **Every bundle this app
has ever produced contradicts its own index**, and none was consumable by
Refine. The subject scan demonstrates it: the tar holds
`keyframe_000001_001313016_128.heic` while its index calls that same file
`keyframes/keyframe_000001_001313016_128.heic`.

**Why the app and not the worker.** The index is the wire contract — it is what
names, orders and describes the frames, and the worker, the validator and the
archive all exist to serve it. The app is the only party that disagrees with
itself: it writes both the index and the archive, and gives the same file two
different names. Teaching the worker to accept flat members would bless a
bundle that cannot describe its own contents, and would leave the app free to
keep emitting archives that no reader can join to an index.

**Why no test caught it.** The existing tar tests pass arbitrary names straight
to `TarArchive.write`, so they exercise the *writer* and never the *naming
rule*; the rule lived only as a closure at one call site, where nothing could
reach it. The fix therefore extracts `TarArchive.bundleEntries(directory:files:)`
— a named function is what gives the rule somewhere to be tested. Proven
non-vacuous: reverting it to the shipped bare-filename form reddens the new
test with four assertion failures. 171 tests pass restored, against 170 before.

**Safe for P1.** Ingest extracts these archives into `work/_untar/<kind>/`
purely as a containment check and **nothing reads that output**, so no live
consumer depends on the old member names. The archives are validated as opaque
artifacts (present + sha256 + size); the validator never inspects tar
internals.

**What the run proved before it stopped, which is not nothing.** The pinned
toolchain preflight **passed** — the manifest installed at
`/opt/colmap/4.0.2/share/patina/refine-colmap-toolchain-v1.manifest.json`
(824 bytes, 19 sorted keys, executable `60db810e…`) is in force and the run
cleared it. Owner-scoped key layout, artifact digests and sizes were all
enforced correctly, each refusal naming its own cause: first an invented key
layout, then the canonical Field layout accepted, then the archive members.

**And one refusal worth recording on its own.** An attempt was made to repack
the archive with correct member names so the run could proceed to COLMAP. The
run refused it: `REFINE_INPUT_INVALID: bundle manifest does not bind the
requested keyframesArchive artifact`. The bundle manifest binds every
artifact's SHA-256, so a corrected archive cannot be substituted without
**forging the manifest** — which was not done, and will not be. The integrity
chain worked exactly as designed: it is not possible to manufacture a passing
run from a doctored input by accident, only by deliberate forgery.

**Consequence.** The first real Refine run now requires a **new capture from a
rebuilt app**: no existing bundle can be made consumable without breaking its
own manifest binding. The four questions I100 named — COLMAP under the pinned
toolchain, libheif on real 1440x1920 keyframes, 100-frame runtime, and whether
the evidence clears `evaluate_refinement_evidence` — remain open, and are now
gated on a device walk rather than on any code.

**The `depth/` lane is fixed in the same pass** though Refine does not consume
`depth.tar`: it carried the identical defect, and leaving a known-broken
sibling in place to be rediscovered later is not a saving.

*Entries add: R120 · last id = R120*

### I101 · Field Capture P2 · first real Refine run reaches the native boundary; real keyframes decoded — 2026-07-28

The composed Refine lifecycle ran against a real Field capture on the qualified
host and reached the native engine boundary in **8.43 s**, peak RSS 46 MB. It
stopped where I100 said it would: `refine_colmap_backend.py` is a deliberate
fail-closed stub, so `run_native_engine_child` raised `COLMAP native backend is
disabled and uncomposed`. **This is the designed outcome, not a defect.**

**The subject.** Scan `004aa5b0-bfaa-4577-93f8-c06d9f38f1fc`, captured on the
R120-fixed build, **49 keyframes**, every one native 1920x1440 / encoded
1440x1920 — the R119-pinned profile. The bundle is the first this program has
seen that is internally coherent: all three artifact hashes match the manifest's
own bindings, all 96 archive members carry the `keyframes/` prefix, and every
`heicPath` in the index resolves to a real member. R120's fix is therefore
confirmed on hardware, not merely in a unit test.

**The pin is live in production, and says so unprompted.** The CLI banner reads
"Raster profile: 1440x1920 (the only one with a physical-device receipt). Any
other capture resolution fails closed."

**What executed, established from the call stack rather than assumed.** The
failure surfaced at `refine_lifecycle.py:2626`, which sits inside `with
materialization:` and after `build_colmap_packet` and `pinned_packet_files`
have both returned. So, in order: the four artifacts were acquired under
owner-scoped keys with digests verified; the materialization completed; the
packet was built and chunked (49 frames x 8_294_417 B = 0.38 GiB, 4 chunks and
5 pinned files, well inside the 4 GiB / 64-file ceilings); the packet
descriptors were pinned; and only then did the native call refuse.

**I100's second open question is now closed.** It recorded that "no real Field
HEIC has been decoded on this path — the helper is a stand-in writing canonical
PPM." That is no longer true. Materialization is what decodes, and it completed:
**49 real 1440x1920 Field HEICs were decoded by libheif through the installed,
root-owned, descriptor-pinned helper** at protocol v3, on the release whose
manifest binds `sourceSha256` `3b184937…`. This is the first time the shipped
raster path has touched real capture data.

**Scratch was cleaned on failure** — the workspace lease and cleanup precedence
behaved as item 4's receipt described, with nothing left behind.

**Three questions remain open, all behind the same gate.** Whether COLMAP
executes under the pinned toolchain and lease; how long a 49-100 frame
reconstruction actually takes; and whether the resulting evidence clears
`evaluate_refinement_evidence` rather than merely the non-vacuity floors of
R119. None of them can be answered while the native backend is a stub, which is
what R121 addresses.
### R121 · Field Capture P2 · the native COLMAP backend is unfrozen and composed; DeskDev privilege granted — 2026-07-28

Two grants from the program owner on 2026-07-28, both reversing constraints
this program has held since I96.

**1. `refine_colmap_backend.py` is unfrozen.** It has been pinned byte-identical
to git blob `6743e66eb06369d18e34b0054d10734e03a109ec` throughout — every agent
brief in the program named that blob and forbade touching it, and the
composition verified it at each merge. It is a deliberate fail-closed stub, and
I101 is the receipt of it doing its job: the first real run reached
`run_native_engine_child` and was refused. **The owner now authorizes writing
the real child body**, which is the I87 plan: known-pose seed, point
triangulation, bundle adjustment against COLMAP 4.0.2, with the
position-prior mapper as fallback. The freeze existed because composing the
backend had never been reviewed, not because the backend was correct — nothing
about lifting it makes the resulting code trusted.

**2. Elevated privilege on the qualified host is granted.** The owner states
DeskDev "is just a test environment for now" and grants `sudo` and whatever
else the work requires. This lifts the standing prohibitions on `sudo`,
`install.sh`, `systemctl`, writing outside `~/`, and touching `/opt`, `/etc`
and `/var/lib/patina` **on that host only**. It does not extend to Strata, to
Supabase or Storage writes, or to any production system, and the P1 worker
`patina-scan-worker` is still not to be disturbed gratuitously — a grant of
permission is not an instruction to be careless with a service that is running.

**What does NOT change.** Refine remains unregistered as a worker stage and
`DEFAULT_STAGES` remains `ingest,solve,drawings`; composing the backend is not
enabling the pipeline. The 200-400 frame band stays unqualified per R117. The
raster pin stays exactly 1440x1920 per R119 ruling 3, with no override. The
gauge-invariant shape floor and the movement floor stay as R119 ruling 1 built
them — a backend that returns its input, or returns it under a rigid motion or
similarity, must still be refused, and the whole point of writing a real
backend is that those floors now face something that can genuinely fail them.

**What the first successful run must establish**, unchanged from I100 and
narrowed by I101 to three: that COLMAP executes under the pinned toolchain
manifest and the one-hour lease; how long a real reconstruction of this size
actually takes, which nothing in this repository has ever measured; and whether
the evidence clears `evaluate_refinement_evidence` rather than merely clearing
the non-vacuity floors. A run that fails any of these is a result and is to be
recorded as one.

*Entries add: I101 · R121 · last id = R121*

### I102 · Field Capture P2 · the real COLMAP child body; the first end-to-end engine run, and what refused it — 2026-07-28

R121's authorisation is built.  `refine_colmap_backend.py` — pinned byte-identical
to `6743e66e` since I96 and named as untouchable in every agent brief since — now
carries the I87 primary plan as executable code, and that code has run COLMAP
4.0.2 against a real Field capture on the qualified host.

**What the child does, in the order it does it.**  `run_refine_colmap_native`
loads the pinned `/opt/colmap/4.0.2` toolchain FIRST, so a drifted box is refused
while the lease is still empty; then extracts the packet; then GPU SIFT
(`CameraMode.PER_IMAGE`), the device intrinsics rewritten over COLMAP's guesses
with database ids preserved, guided GPU matching over the deterministic candidate
graph, the post-match overlap policy, the known-pose seed carrying the device's
full poses, the one allowlisted CLI phase (`point_triangulator`, inheriting the
already-isolated process group), bundle adjustment at `TWO_CAMS_FROM_WORLD` with
intrinsics fixed, and last the Sim(3) rebase back into the seed's metric frame.
It writes the seven closed output tokens and returns the report the parent parses.

**The child computes its proposal with the PARENT's own code.**  It writes its
three sparse-model archives, then re-reads them through
`refine_model_alignment.read_sparse_model_snapshot` and solves the centres-only
similarity with `refine_adapter.estimate_sim3`.  Agreement then means the two
sides read one archive the same way, not that two implementations converged.
That is the second in-package edge into `refine_model_alignment`, and it is
pinned by test rather than left incidental.

**Two ledgers were added to the packet, because evidence needs provenance the
child cannot have.**  The engine request describes ENGINE images; the evidence
builder needs the capture archive key, member, digest and size per frame plus the
raster adapter's identity, and only the parent holds those.  `build_colmap_packet`
now emits `source-ledger-v1.json` and `adapter-ledger-v1.json` — two member roles
the extractor already knew how to parse and that nothing had ever produced.

**THE RUN.**  Scan `004aa5b0-bfaa-4577-93f8-c06d9f38f1fc`, 49 keyframes, the
R120-fixed bundle, from a root-owned R121 release built beside the live one so
`patina-scan-worker` was never touched.  **28.6-29.4 s wall across four runs, peak RSS 596-660 MB**, under a
3600 s lease — the first measurement this repository has ever had of a real
reconstruction.  Inside it: GPU SIFT 3.2 s for **341_749 features** over 49
frames (min 250, max 13_425, mean 6_974); guided matching and geometric
verification **4.14 s**; bundle adjustment **0.56 s, 34 iterations, 87_950
residuals, CONVERGENCE, initial cost 1.01046 px, final 0.682295 px**.  Four
minutes was never the constraint; R119 ruling 2's whole-lease budget was not
needed either.

**R121's three questions, answered.**  COLMAP executes under the pinned manifest
and the lease: yes.  How long 49 frames take: 29 s.  Whether the evidence
clears `evaluate_refinement_evidence`: **NO.**  The run was refused
`REFINE_EVIDENCE_REGRESSION / comparable_geometric_evidence_regressed` with
coverage 1.0000 -> 1.0000, reprojection RMSE **2.015458 -> 1.351599 px (-32.9%)**,
loop translation-direction RMSE 17.165228 -> 17.080197 deg, and loop rotation RMSE
**4.915408 -> 4.930533 deg — worse by 0.015 deg, 0.31%** — over **four** verified
non-temporal loop edges, on 42_587 common observations.  One comparable metric
regressed and the rule is that none may.  Bundle adjustment reduced reprojection
error by a third and moved the long-baseline rotations very slightly the wrong
way; with a sample of four edges that difference is not distinguishable from
noise.  Nothing was tuned to make it pass.

**The R119 floors faced real output and cleared it.**  The refusal is downstream
of them: `anchor_seed_snapshot_to_request`, `verify_child_alignment_proposal`,
`require_refined_poses_moved` and `require_refined_shape_changed` all passed on
bytes a real engine wrote.  The gauge-invariant shape floor in particular was
built against a recorded fixture and has now been satisfied by a genuine
refinement rather than by a construction.

**Three defects only a real run could reach.**  (1) The packet writer emitted
USTAR members at mode 0644 with NUL device fields; the child's extractor requires
0600 and canonical zero-valued octal, and refused every parent-built packet.  It
had been wrong since the writer existed — the parent's tests read its archives
with `tarfile`, which does not care, and the extractor's tests hand-build their
own headers, so the two implementations had never been compared.  They are now,
directly.  (2) COLMAP 4.0.2 really does emit tracks that observe one image twice;
the evidence builder's membership key forbids it.  Such tracks are excluded from
BOTH models by a structural criterion that never looks at a residual, and the
counts are carried into telemetry and `adapter-v2.json` rather than absorbed.
(3) `pycolmap`'s `TwoViewGeometry.cam2_from_cam1` is optional and really returns
`None`.

**The seed anchor's rotation tolerance was unreachable by ANY child, and the fix
was the metric, not the floor.**  The device's `cam_from_world` matrices arrive
orthonormal only to `3.3e-7`; `acos(1 - x) ~ sqrt(2x)`, so
`_separation_from_submitted_frames` reported `4.899e-4` rad of "drift" against a
seed the child had not moved at all — 490x the `1e-6` tolerance, and set by the
reference's own representation error rather than by the snapshot.  The tolerances
are UNCHANGED; the submitted matrix is now projected onto SO(3) before the
angular comparison, so the number is a rotation difference.  Both directions are
constructed: an exact-copy snapshot against a defective reference now measures
below `1e-8`, and a genuinely turned snapshot is still refused at 1.5x and 10x
the tolerance.  Both refusals carry their margins, as does the evidence verdict —
the first real run reported only that something "drifted".

**Seven posture flags moved, none of them decorative.**
`PACKET_EXTRACTION_QUALIFIED`, `OUTPUT_DESCRIPTOR_HANDOFF_QUALIFIED`,
`ALIGNED_MODEL_BUILD_QUALIFIED`, `EVIDENCE_BUILDER_CONTRACT_COMPATIBLE`,
`PARENT_ALIGNMENT_VERIFICATION_COMPOSED_INTO_REFINE` and
`NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT` each rest on the host run;
`COMMAND_EXCEPTION_NORMALIZATION_QUALIFIED` rests on a constructed test, because
it names a property of the guard rather than of the box.  **`PRIMARY_EXECUTION_
QUALIFIED` stays False**: the plan executed and was then refused, and a path
qualified only up to the point where it is refused is not qualified.
`RUNNER_PATH_REOPEN_COMPOSITION_QUALIFIED` stays False because the run stops
upstream of the artifact builder; `SEQUENTIAL_COMMAND_QUIESCENCE_QUALIFIED`
because the plan has one CLI phase; `MEASUREMENT_SNAPSHOT_QUALIFIED` because that
row schema is unused; `FALLBACK_QUALIFIED` and
`PILOT_200_400_FRAME_RANGE_QUALIFIED` per I90 and R117.  The posture test that
was supposed to make a quiet flip impossible only scanned names ending
`_QUALIFIED` and was blind to three of these; it now scans every module-level
boolean in the package and compares the true set for equality.

**Posture otherwise unchanged and re-verified, not taken on report.**
`DEFAULT_STAGES = "ingest,solve,drawings"`; `scan_pipeline.refine` unregistered;
the raster pin exactly 1440x1920; `DEFAULT_LEASE_SECONDS = 3600.0`.

**Verification.**  macOS: **2081 passed, 0 failed, 85 skipped**.  Qualified
x86_64 host: **2081 passed, 84 failed, 1 skipped**, against a base-commit control
at `9ef18190` on the same host and venv (**2065 passed, 84 failed**) showing **the
identical 84** — zero new, zero fixed.  Those 84 are 82 `test_install_script.py` (root/systemd/staged
installer), `test_packaging` (real wheel build) and the known
`test_validator_drift`; they are properties of running from a checkout rather
than from `install.sh`, and the control is what proves none of them is ours.
A mutation sweep against the FULL tree ran a no-op control to 0 extra red before
any count was read, then killed every clause it tried.  Three survivors were reported rather than absorbed — the evidence
refusal's numbers, the candidate-graph agreement check and the source-ledger
row binding — and each was given a reaching test before the sweep was rerun; the
graph check had to be EXTRACTED from behind the GPU to be reachable at all, which
is the same move this codebase made for `copy_exact`.

**What is still not true.**  No run has published anything.  The 200-400 band is
untouched.  Fuse, Splat and Present are not composed.  The pin covers one device,
one OS, one capture and one COLMAP build; four verified loop edges is a thin
basis for any statement about this subject, and whether the loop-rotation
regression is a property of the capture, of the candidate graph's 0.25-1.5 m
spatial band, or of `evaluate_refinement_evidence`'s all-metrics-must-not-regress
rule is an open question this run cannot settle.

*Entries add: I102 · last id = I102*

*Entries add: I102 · last id = I102*

### I103 · Field Capture P2 · the evidence harness; seven runs over two rooms, and what the loop comparables actually do — 2026-07-28

I102 left one question open: whether the loop-rotation regression that refused
the first real run is a property of the capture, of the candidate graph, or of
`evaluate_refinement_evidence`. It could not be settled with one capture, and
the numbers survived only because the refusal renders them — a run that PASSES
prints nothing comparable. **`services/scan-pipeline/tools/refine_evidence_harness.py`**
is the instrument for that question: it runs the composed lifecycle over a
directory of bundles and tabulates one evidence row per run, INCLUDING for the
runs the rule refuses.

**It measures the rule; it does not touch it.** Three runtime hooks, each
calling the original exactly once and returning its value unchanged:
`refine_runner.evaluate_refinement_evidence` (the rule under study — the exact
`RefinementEvidence` in, the exact verdict out), `refine_lifecycle.Composed
ArtifactBuilder` (the child's `adapter-v2.json` and command evidence, read
positionally with `os.pread` out of the parent's anonymous descriptors, so the
telemetry survives the lease purge without consuming anything), and
`require_refined_shape_changed`. `evaluate_refinement_evidence` is byte-identical
to what I102 ran; the release under measurement,
`/opt/patina/scan-pipeline-r121`, was confirmed byte-identical to the branch for
all five refine modules before a number was read. Recording is separately
guarded — a harness that threw while documenting would change the outcome of the
run it is measuring — and the observer has no branch on the verdict, so there is
no path by which it could turn a refusal into a pass. Both directions are
constructed in `tests/test_refine_evidence_harness.py`, and four mutations
(swallow the refusal, stop at the first failing bundle, put the clock in the
determinism key, drop the row when the rule raises) each reddened it before the
counts were read.

**Two real captures existed, not one.** `004aa5b0` (49 frames) is I102's. The
100-frame subject scan R120 ruled on — scan `a7de00f1`, the P1-certificate
capture — is also on the host, and its transport archive is the pre-R120 flat-
member form. It was made consumable by applying R120's own fix after the fact:
every member re-prefixed `keyframes/`, the exact string its index already names,
and the manifest's `keyframesArchive` row re-bound to the repacked digest. No
image byte, pose, intrinsic or timestamp was touched, and the worker was not
relaxed. Five further bundles are FRAME SLICES of `a7de00f1` — halves, middle,
and the even and odd frames — because the pipeline is deterministic upstream of
bundle adjustment, so repeating one bundle cannot vary the verified edge set and
only a different slice of the same walk can.

**SEVEN RUNS. Reprojection improved every single time; the loop comparables did
not.**

```
bundle                frames  edges  reproj px          d%       looprot deg        d%       looptrn deg         d%       verdict
004aa5b0 (whole)      49      4      2.015458>1.351599  -32.94   4.915408>4.930533  +0.31    17.165228>17.080197  -0.50   REFUSED
a7de00f1 (whole)      100     43     1.899211>1.281987  -32.50   5.979739>6.012273  +0.54    25.058985>25.258783  +0.80   REFUSED
a7de00f1 first half   50      12     1.941583>1.192916  -38.56   7.560061>7.734245  +2.30    25.689888>26.651891  +3.74   REFUSED
a7de00f1 second half  50      25     1.872026>1.334987  -28.69   5.336552>5.267981  -1.28    27.019122>26.958782  -0.22   PASS
a7de00f1 middle       50      15     1.895696>1.234701  -34.87   1.014703>0.831273  -18.08    2.520286>2.407587   -4.47   PASS
a7de00f1 even frames  50      8      1.939805>1.125393  -41.98   2.598570>3.126295  +20.31    6.612081>14.156897 +114.11  REFUSED
a7de00f1 odd frames   50      9      1.797599>1.134248  -36.90   6.318068>5.984869  -5.27    15.451312>14.857576  -3.84   PASS
```

Registration coverage was 1.0000 before and after in all seven. **Reprojection
RMSE fell by 28.7% to 42.0% in all seven and never once regressed.** Loop
rotation moved between -18.08% and +20.31%, four times worse and three times
better; loop translation between -4.47% and +114.11%. **Every refusal was caused
by a loop comparable. Not one was caused by reprojection or by coverage.**

**The two interleaved samples are the sharpest pair.** Even-indexed and
odd-indexed frames of one walk are the same room, the same device, the same
trajectory at the same cadence, half a frame apart. Their loop-rotation BEFORE
values are 2.598570 and 6.318068 degrees — a factor of 2.4 — and the refinement
moves one +20.31% and the other -5.27%. One is refused and the other passes. The
same walk's second half passes; its first half is refused. A statistic whose
baseline varies 7.5-fold and whose direction flips between interleaved samples of
one capture is not measuring a property of that capture's refinement.

**What `loop_rotation_rmse_deg` actually is.** For each verified non-temporal
pair it compares the relative rotation COLMAP estimated from image
correspondences alone (`TwoViewGeometry.cam2_from_cam1`) against the relative
rotation implied by the trajectory — the device's ARKit poses BEFORE, the
bundle-adjusted poses AFTER — and takes the RMS over the loop set. It is a
DISAGREEMENT between two estimates, both of which carry error, not a residual
against ground truth. Its absolute value is ~4.9 degrees because the two-view
side is weak here, not because the trajectory is 4.9 degrees wrong: on
`004aa5b0` every loop baseline is between 0.25 and 0.51 m and the whole
trajectory is 0.66 m across. Nothing in bundle adjustment optimises this
quantity — BA minimises reprojection over the tracks and never sees a two-view
geometry — so its direction after refinement is unforced.

**Why four loop edges, answered.** Not the room, not COLMAP. The candidate graph
offered **270** non-temporal pairs on `004aa5b0` and matching verified **four**
of them (1.5%), while verifying 232 of 435 temporal pairs (53%). The reason is
in `build_pair_graph`: loop candidates are selected by CAMERA CENTRE DISTANCE
alone and never by where the camera points. On a capture whose entire trajectory
is 0.66 m across — the operator turned in place — the median angle between the
two optical axes of a loop candidate is **106 degrees**, **not one** of the 270
is under 30 degrees, and only nine are under 45. A pair looking 106 degrees apart
shares no image content and can never reach the 30-inlier floor. On the 100-frame
walk (3.59 m extent) the median is 73 degrees, 17 candidates are under 15
degrees, and 43 of 574 verify. The count scales with how much the capture
revisits a place FACING THE SAME WAY, which the selection policy does not measure.

**Determinism, checked rather than taken on report.** Both original bundles were
run twice. Every BEFORE metric is bit-identical (relative drift exactly 0.0):
feature extraction, matching, geometric verification and triangulation reproduce
exactly. Every AFTER metric drifts at 1e-10 relative — Ceres running
multithreaded — and because the evidence digests cover the refined points,
`common_observation_set_sha256` and `verified_loop_set_sha256` **differ on every
run**. The verdicts and every digit the refusal prints are identical. So "the run
reproduces to the digit" is true and "the run reproduces" is not, and the harness
reports those as separate claims. The drift is 4e-8 of I102's decision margin:
the regression is not run-to-run noise.

**What this does NOT establish.** Seven runs over TWO rooms, and six of the seven
are slices of one of them — this is a characterisation of one metric on one
device in two rooms, not a distribution. Nothing was published. No tolerance was
proposed, no threshold moved, and `evaluate_refinement_evidence` is unchanged to
the byte. The ruling on whether the loop comparables should carry a veto at this
edge count, and whether a strict inequality at zero tolerance is the right test
for a statistic with this spread, belongs to the program owner.

**Posture unchanged and re-verified.** `DEFAULT_STAGES = "ingest,solve,drawings"`;
`scan_pipeline.refine` unregistered; the raster pin exactly 1440x1920; R119's
floors as built; `PRIMARY_EXECUTION_QUALIFIED` still False. No flag moved. The
harness lives in `tools/`, outside the package and outside the wheel.

**Verification.** macOS: **2087 passed, 16 failed, 85 skipped**, against a
control with the two new files removed on the same interpreter showing **the
identical 16** — all `test_install_script` and `test_packaging`, all caused by
running under a venv outside the tree. Qualified x86_64 host: **2094 passed, 93
failed, 1 skipped**, against a base-commit control at `d871d373` extracted to a
sibling directory and run on the same venv (**2072 passed, 93 failed**) showing
**the identical 93** — zero new, zero fixed, +22 passes, which is exactly the new
test count. The 93 are 82 `test_install_script`, 8 `test_field_raster_materializer`,
`test_packaging`, `test_refine_lifecycle`'s raster-adapter case and
`test_validator_drift`; they are properties of running from a checkout rather
than from `install.sh`, and the control is what proves none of them is ours.

*Entries add: I103 · last id = I103*

### I104 · Field Capture P2 · Refine completes end to end on a real capture; the verdict tracks loop-edge count — 2026-07-29

**The Refine lifecycle completed and published for the first time.** A real
100-frame Field capture (`e3ea64a8-d12c-4059-8572-2af5abe41c84`, a second room)
ran acquire → decode → packet → COLMAP → align → floors → evidence → publish on
the qualified host in **52.2 s**, verdict `PASS
internal_geometric_refinement_evidenced_absolute_accuracy_unproven`, writing
eight artifacts under `.../v1/refine/` including `refined-poses-v1.json`,
`pose-deltas-v1.json`, `adapter-v2.json` and `seed-model-v1.tar`. Every prior
run in this program stopped short of publication.

**Three real captures, walked to a design.** The owner walked a second room
normally, and a deliberate single sweep with no revisits, against the existing
49-frame first room.

| capture | frames | verified edges | reprojection | loop rotation | loop translation | verdict |
|---|---|---|---|---|---|---|
| room 2, normal | 100 | **31** | −29.63% | −0.60% | −3.00% | **PASS** |
| room 1 | 49 | **4** | −32.94% | **+0.31%** | −0.50% | REFUSED |
| single sweep | 31 | — | — | — | — | FAILED (cheirality) |

**The verdict tracks the verified loop-edge count, not the quality of the
refinement.** At 31 edges all three loop comparables move the same direction and
the run passes. At 4 edges, loop rotation wobbles +0.31% against a −32.94%
reprojection improvement and the run is refused. Taken with I103's slice study
this is now consistent across ten completed runs: **reprojection improved in
every run that completed (−28.7% to −42.0%), and every refusal has been caused
by a loop comparable — never by reprojection, never by coverage.**

**The sweep failed differently, and usefully.** Not a refusal: an
`AdapterError` — "refined model observation projects outside the positive-depth
camera", a cheirality violation, a point reconstructed behind a camera. A pure
sweep with no revisit is the weakest geometry the instrument can produce, and it
degenerated rather than producing a plausible-but-wrong result. The control
behaved as a control should, and the pipeline caught it instead of publishing
nonsense.

**Two identifier defects, found the way R120 was found — by running.**

1. **A Storage-sourced Refine run is impossible as the contract stands.**
   Storage object keys are keyed by `room_scans.room_id`, while the bundle
   manifest carries a different `scanId`, and `refine_materializer` requires the
   request's `scan_id` to equal **both** the key's third segment
   (`assert_owner_prefix`) and `document["scanId"]`
   (`_validate_manifest_identity`). For scan `83f0d63d…` those are `da3af6b7…`
   and `e3ea64a8…` — one request cannot satisfy both. Three distinct
   identifiers are in play: `room_scans.id`, `room_id`, and the manifest
   `scanId`. Worked around for measurement only by laying the fetched bytes out
   locally under the manifest's own `scanId`; no content and no manifest was
   altered.
2. **`room_scans.scan_bundle_url` and `depth_archive_url` store a `/object/public/`
   URL for the `room-scans` bucket, which is `public = false`.** Those URLs
   return `400 Bucket not found`. Anything consuming those columns directly is
   broken; the objects are reachable only with credentials.

**Read-only Storage access was used** with the owner's authorisation, via the
scan worker's own service-role credentials on the qualified host. Nothing was
written to Storage or to any table.

### R122 · Field Capture P2 · fix the loop-candidate policy before judging the evidence rule — 2026-07-29

The program owner ruled on 2026-07-29, on the evidence of I103 and I104: **fix
the loop-candidate selection policy first, re-run the three real captures, and
only then decide whether `evaluate_refinement_evidence` needs changing at all.**

**Why the policy and not the rule.** `build_pair_graph` selects loop candidates
by camera-centre distance alone and never by where the camera points. On the
49-frame capture it offered 270 non-temporal candidates of which matching
verified **4** — 1.5% — with a median angle of **106°** between the two optical
axes and not one candidate under 30°. Pairs that far apart share no image
content and can never reach the inlier floor. The thin edge set is manufactured
by the policy, and the erratic verdict follows from the thin edge set: the
100-frame capture, whose walk revisits places facing the same way, produced 31
edges and a well-behaved metric on the first attempt.

**The rule is therefore not yet judged.** It may be sound once the statistic it
reads is no longer noise-dominated. Changing a gate to make a failing run pass,
before fixing the input that made the gate noisy, is the inversion this program
exists to avoid — and R119's floors were written on exactly that principle.
`evaluate_refinement_evidence` stays byte-identical until the re-run says
otherwise.

**Also authorised:** repair both identifier defects recorded in I104. The
`scan_id` contract must be satisfiable by a bundle acquired from Storage as the
app actually writes it, and the stored URL columns must name a form that
resolves for a private bucket.

**Unchanged.** Refine stays unregistered as a stage; `DEFAULT_STAGES` remains
`ingest,solve,drawings`. The raster pin stays exactly 1440x1920. R119's movement
and shape floors stay as built. `PRIMARY_EXECUTION_QUALIFIED` stays `False`
until a path is qualified beyond its refusal — one PASS on one capture is not
that.

*Entries add: I104 · R122 · last id = R122*

### I105 · Field Capture P2 · the loop-candidate policy learns where the camera points; the three captures re-run — 2026-07-29

R122's three instructions are built: the loop-candidate selection policy now
considers viewing direction, both I104 identifier defects are repaired, and the
three real captures were re-run on the qualified host. **`evaluate_refinement_
evidence` is byte-identical to what I102, I103 and I104 ran** — verified by
extracting the function from the base commit and from the branch and comparing
the 5_833 bytes, not by inspection.

**THE THRESHOLD WAS MEASURED BEFORE IT WAS CHOSEN.** I104's 100-frame run
PASSED, so it published, and among its eight artifacts is `database-v1.db` —
COLMAP's own `two_view_geometries` table, one row per candidate pair. Joining
that table against the capture's ARKit poses gives the verification rate of all
**1_508** candidate pairs as a function of the angle between the two optical
axes. Nothing in that join runs an engine; the outcome was decided by COLMAP
before the question was asked.

```
axis angle    loop pairs  verified     temporal pairs  verified
under 45 deg          56     48.2%                394     63.5%
45 to 60 deg          47      8.5%                172      6.4%
60 to 75 deg          58      0.0%                125      1.6%
over 75 deg          402      0.0%                254      0.0%
```

The two populations are independent — the 563 non-temporal candidates the policy
selects, and the 945 temporal ones it does not touch — and they collapse in the
same place. **60 degrees is the smallest bucket edge above which not one of 460
real loop candidates verified.** It keeps every one of that capture's 31 verified
loop edges (the widest sits at 51.5 deg) and discards the 460 that produced none;
a tighter 45 would have thrown away 4 of the 31 for no measured gain.

**The device's optics say why the collapse is there**, which is the check that
this is a property of cameras and not of one room. The keyframe intrinsics give
a **70.5 x 55.8 degree** field of view, so two cameras whose axes differ by more
than 55.8 deg are no longer guaranteed to share any viewing direction and past
the 82.8-degree diagonal cannot. The widest verified pair of ANY kind in the
capture sits at **74.2 deg**, inside that bracket. `LOOP_MAX_VIEW_AXIS_ANGLE_DEG
= 60.0` sits between the two, and the comment carries both derivations.

**THE BOUND IS UNCHANGED AND IS NOT THE ANGLE.** `MAX_SPATIAL_NEIGHBORS` stays
8, so the graph still cannot exceed `frames * (temporal_window + neighbors)`
pairs however the room is shaped. What changed is the ORDER: the per-frame
shortlist is filtered to co-directed candidates BEFORE the nearest 8 are taken.
That is where the edges came from — near-but-mis-directed pairs were crowding
out co-directed ones further away. The new graph is **smaller** than the one it
replaces on all three captures (walkA 1_508 -> 1_236 pairs) while offering loop
candidates the measurement says can succeed: walkA's loop-candidate median axis
angle falls from **100.4 deg to 41.1 deg** and its median baseline rises from
0.46 m to 0.65 m. Raising the cap instead was considered and rejected — it buys
more of a population in which 460 candidates produced zero edges between them.

**A held-out check, because a threshold fitted to its own outcome proves
nothing.** The 30.1% rate was measured on the 103 loop candidates the OLD policy
offered inside 60 deg. The NEW policy offers 291, of which **188 were never in
that sample**. Predicted edges: 291 x 0.301 = **87.6**. Observed: **90**. The
number was fixed before the re-run and is not a fit to it.

**ONE PREDICATE, THREE DERIVATIONS.** The candidate graph is derived three times
— `refine_adapter.build_pair_graph` over `NormalizedFrame`, `refine_colmap_
backend.build_engine_pair_graph` over the packet's `ColmapEngineFrame`, and
`refine_evidence_builder._pair_graph` over the raw model the engine wrote — and
before R122 all three restated the distance band. A fourth restatement is how
they would have drifted, so `loop_candidate_admitted` is imported by all three
and the viewing direction is read from the `cam_from_world` rotation, the one
quantity all three hold. `require_candidate_graph_agreement` now substitutes the
raw model's ROTATIONS as well as its centres: R122 added a second hard edge to
the policy, and a shadow that re-derived only the distances would have gone on
agreeing with itself about the angles while the guard quietly stopped covering
the new edge. A constructed test moves only a rotation, across the bound, with
every centre untouched.

**THE RE-RUN. Three captures, same host, same release discipline — a root-owned
build beside the live one, `patina-scan-worker` never touched (`NRestarts=0`).**

```
                         BEFORE (I104, distance-only)          AFTER (R122, near AND co-directed)
capture          frames  edges  reproj   looprot  verdict      edges  reproj   looprot  looptrn  verdict
room 2, normal   100     31     -29.63%  -0.60%   PASS         90     -28.89%  +0.22%   -1.11%   REFUSED
room 1           49       4     -32.94%  +0.31%   REFUSED       4     -32.94%  +0.31%   -0.50%   REFUSED
single sweep     31      --     --       --       FAILED       14     -32.78%  +2.10%   -1.03%   REFUSED
```

**Does the edge count rise: yes, 2.9x on the capture that had a walk to work
with.** 31 -> 90 on room 2, from a SMALLER candidate set. Common observations
rose 39_233 -> 40_851, so the reconstruction is more constrained, not merely
differently constrained.

**Does walkB still refuse: yes, and its numbers are bit-identical to I104's.**
Room 1 was walked by turning in place: the operator never revisited anywhere
facing the same way. Its 270 loop candidates had a MEDIAN axis angle of 106 deg
and a MINIMUM of 32.1; the new policy offers 40, all in 32-60 deg, and the same
four verify. **The policy did not manufacture edges out of a capture that has
none**, which is the outcome that would have discredited it. A walk with no loop
closure is a fact about the walk.

**The sweep no longer degenerates.** I104's control failed with an `AdapterError`
— "refined model observation projects outside the positive-depth camera", a
cheirality violation. With the mis-directed pairs gone it completes, publishes
nothing (it is refused), and reports 14 loop edges with a loop-translation
disagreement of **39.7 deg** — by far the worst of the three, which is what a
pure sweep with no revisit should look like. The control still refuses; it now
refuses legibly instead of degenerating.

**WHAT THE BETTER-CONDITIONED STATISTIC SAYS ABOUT THE RULE. Reported, not
acted on.** R122 held that the rule may be sound once the statistic it reads is
no longer noise-dominated. It is now far better conditioned, and the shape of
`loop_rotation_rmse_deg`'s change across every completed run in this program is:

```
edges     8      9     12     15     25     31     43     90
delta  +20.31 -5.27  +2.30 -18.08 -1.28  -0.60  +0.54  +0.22 %
```

The variance collapses with edge count exactly as a noise-dominated statistic
should — and what remains at 90 edges, the largest sample this program has ever
had, is a small **positive** value. The regression is 5.5e7 times the run-to-run
drift (relative drift 3.9e-11 over two attempts), so it is not reproducibility
noise. This is the behaviour I103 predicted from first principles: bundle
adjustment minimises reprojection over the tracks and never sees a two-view
geometry, so nothing in it pushes this disagreement down. **Three of three
captures now refuse on a loop comparable while reprojection improves 28.9-32.9%,
and the single PASS in this program's history sat at 31 edges inside the noise
band that the better-conditioned run has now collapsed.** An all-metrics-must-
not-regress rule at strict inequality and zero tolerance, applied to a quantity
the optimiser does not optimise, refuses good refinements. That is a finding for
the program owner and **not a change**: `evaluate_refinement_evidence` is
untouched to the byte, no tolerance was proposed, and no threshold moved. The
counter-hypothesis is recorded too — admitting pairs out to 60 deg raised the
loop-rotation BASELINE from 5.33 to 12.69 deg, and a tighter bound would give a
cleaner statistic. Tightening it to make the gate pass is the inversion R122
exists to prevent, and the bound was fixed from verification yield before the
re-run rather than after it.

**IDENTIFIER DEFECT 1: the conflated field was the defect.** One `scan_id` was
carrying three different identifiers, and one string cannot be all of them.
Split, each named for what it is. **`room_id`** is the Storage READ owner prefix
— B-18 pins `{folder}/{userId}/{roomId}/{filename}`, `keys.assert_owner_prefix`'s
own docstring and error text already said "row `room_id`", all five live P1
callers already pass it, and the iOS uploader builds every key from `roomID`.
**`scan_id` stays `room_scans.id` on the publication prefix** — 00287 matches
`rs.id::text` at segment [3], the worker design ruled it, and that half was never
broken. **`capture_session_id`** is the manifest's `scanId`: minted device-side
at capture-session start, held in no column anywhere, and therefore no longer
equated to a server identifier — it is required to be a well-formed stable
identifier, recorded, and equated only when a caller supplies an expected value.
Manifest identity does not rest on that equality and never did: the key is
owner-anchored on user and room, and the bytes are re-hashed against the
request's ledger sha256 before they are parsed. A bundle laid out exactly as the
app writes it is now accepted, a key under a foreign room is still refused, and
a key under the SCAN id is refused too — the tempting non-fix of accepting either
identifier at [2] is closed by a test.

**IDENTIFIER DEFECT 2: the writers now store the object key.** Both iOS apps
called `getPublicURL` on a path they already held and stored
`/object/public/room-scans/...` into `scan_bundle_url` and `depth_archive_url`,
which 400 for a bucket that is `public = false`. The repair is writer-side and
stores the bare key, because that is what this repository already does for every
other private bucket (`capture-media`'s `path`, `site-requests`'s `object_path`)
and because all four consumers already reduce the stored value to a key and
already accept a bare one unchanged. `/object/authenticated/` was rejected — no
precedent here, and it embeds the project host in a column; a persisted signed
URL was rejected because it expires. **No migration, no backfill, nothing written
to Strata**; the SQL to normalise existing rows is described for the owner and is
hygiene rather than repair, since every reader already strips both forms.

**Verification, both platforms, each against a base-commit control extracted
with `git archive be16f132` to a sibling directory and run on the same
interpreter — so a pre-existing failure can never be reported as ours.**
macOS: **2_114 passed, 16 failed, 85 skipped** against **2_087
passed, 16 failed**; the identical 16, zero new, zero fixed. Qualified x86_64
host: **2_131 passed, 83 failed, 1 skipped** against **2_104 passed, 83
failed**; the **identical 83**, zero new, zero fixed, **+27 passes — exactly the
new test count**. The 83 are 82 `test_install_script` and `test_packaging`:
properties of running from a checkout rather than from `install.sh`.

One control artifact is worth recording because it nearly became a false
positive. The first host control showed nine EXTRA failures in
`test_field_raster_materializer` and `test_refine_lifecycle` — all
"packaged helper source has unsafe type or mode". They were an extraction
artifact: `field_raster_libheif.c` landed group-writable (0664), which
`_open_packaged_source`'s `st_mode & 0o022` correctly refuses. The guard was
right and the control was wrong. Both trees are now extracted and normalised
identically, and the nine are gone from both.

**Mutation sweep against the full suite**, control asserted to **0 red** before
any count was read. Sixteen clauses: the angle filter removed in each of the
three derivations; the bound widened to 180 and tightened to 45; the inclusive
comparison made strict; the distance band dropped; the optical axis read off the
wrong matrix row; the normalisation guard removed; the bound validation removed;
the neighbour cap removed; temporal pairs wrongly angle-filtered;
`classify_overlap` not forwarding the bound; the agreement guard not
substituting rotations, and not raising at all; and the evidence builder
deriving its graph from the REFINED rotation instead of the raw one. **Five
survived the first sweep and are reported rather than absorbed** — the bound's
value, the inclusive comparison, `classify_overlap`'s pass-through, and both
clauses inside the evidence builder, whose `_pair_graph` sits behind a GPU in
production and had no reachable test at all. Each was given a reaching test
built by construction — the widest verified pair from the qualification capture
for the bound, the function's own computed angle fed back as the bound for the
comparison, two `classify_overlap` calls differing only in the bound, and
hand-built `_ValidatedFrame` rows for the builder — and the sweep was rerun. All
sixteen killed.

**Posture unchanged and re-verified, not taken on report.** `DEFAULT_STAGES =
"ingest,solve,drawings"`; `scan_pipeline.refine` unregistered; the raster pin
exactly `FieldRasterProfile(1440, 1920)`; `DEFAULT_LEASE_SECONDS = 3600.0`;
`PILOT_200_400_FRAME_RANGE_QUALIFIED` and `PRIMARY_EXECUTION_QUALIFIED` both
still `False` — a path refused on all three captures is not a qualified path.
R119's movement and shape floors are as built and cleared every run.

**What is still not true.** The threshold rests on ONE capture's published
database — one device, one OS, two rooms — and the held-out check that validates
it is a single number. Nothing was published by any of the three re-runs. Whether
`evaluate_refinement_evidence` should carry a loop-comparable veto at all is now
a sharper question than it was, and it is still the owner's. `room_scan_images.
image_url`/`thumbnail_url` and `stages/drawings.py`'s `svg_url`/`pdf_url` still
carry the non-resolving public form; only the two columns I104 names were fixed.
No iOS build or device pass has been run against either Swift change. The
200-400 band is untouched. Fuse, Splat and Present are not composed.

*Entries add: I105 · last id = I105*

### R123 · Field Capture P2 · the loop comparables become advisory; the direction test is the wrong shape — 2026-07-29

The program owner ruled on 2026-07-29, on the evidence of I103, I104 and I105:
**`evaluate_refinement_evidence` stops vetoing on the two loop comparables.**
Reprojection, registration coverage and the optional external error remain hard
gates. The loop numbers are still computed, still validated, and are to be
reported *more* prominently than before — what is removed is their power to
refuse, not their existence.

**Why the direction test is wrong in principle, not merely in practice.** The
loop comparables measure the disagreement between COLMAP's **image-only**
relative rotation, taken from two-view geometries produced by matching, and the
rotation implied by the trajectory. Bundle adjustment does not touch a two-view
geometry: it minimises reprojection over tracks. So after refinement the
trajectory has moved toward the reprojection optimum while the two-view
estimates stand exactly where matching left them. On these captures those
estimates come from 0.25-0.5 m baselines, which is where two-view geometry is
weakest. A small positive drift is therefore the *expected* behaviour of a
successful refinement, not a symptom of a failing one. The rule asked whether a
quantity had decreased when nothing in the optimiser was trying to decrease it.

**Why an edge-count floor was considered and rejected.** R122's fix tripled the
verified loop evidence on the best capture (31 → 90 edges) and the variance
across the program collapsed exactly as a noise-dominated statistic should:
+20.31, −5.27, +2.30, −18.08, −1.28, −0.60, +0.54, **+0.22** percent at 8, 9,
12, 15, 25, 31, 43 and 90 edges. But what survives the collapse is a *positive*
residual. **Room 2 at 90 verified edges — the healthiest loop evidence this
program has produced — still regresses and would still be refused.** An
edge-count floor does not rescue any capture; it relocates the same refusal onto
the runs carrying the most evidence. Three of three real captures refuse on a
loop comparable while reprojection improves 28.9-32.9%.

**What this costs, stated rather than glossed.** It gives up the only **global
consistency** check. Reprojection cannot see a self-consistent but globally
wrong reconstruction, and loop closure is the classical instrument for catching
exactly that. This ruling accepts that exposure deliberately and for a bounded
period. What still gates: reprojection, registration coverage, the external
error when present, R119's movement and gauge-invariant shape floors, the
cheirality check that caught the no-revisit sweep, and the entire
materialisation, packet and toolchain chain ahead of them.

**The replacement is a magnitude bound, and it is deferred on purpose.** The
meaningful question is not "did the disagreement grow?" but "is the refined
trajectory *grossly* inconsistent with the image evidence?" — an absolute
ceiling, not a direction. That threshold is **not** to be derived from the three
captures now in hand: fitting a bound to the runs one wants to pass is the
inversion R122 was written to prevent, and R119's floors were built on the
opposite principle. It waits for enough captures across enough rooms to derive
honestly.

**Scope of the edit.** Minimal and surgical. The loop metrics keep their
validation — finite, non-negative, before-and-after — and their place in the
evidence record; only their membership in the refusal set changes. This is the
first change to `evaluate_refinement_evidence` since the function was written;
it has been byte-identical through R119, R121 and R122 precisely so that this
ruling could be made on evidence rather than convenience.

**Unchanged.** Refine stays unregistered as a stage; `DEFAULT_STAGES` remains
`ingest,solve,drawings`. The raster pin stays exactly 1440x1920. R119's floors
stay as built. `PRIMARY_EXECUTION_QUALIFIED` and
`PILOT_200_400_FRAME_RANGE_QUALIFIED` stay `False`; a passing run under a
relaxed gate is not a qualified path.

*Entries add: R123 · last id = R123*

### I106 · Field Capture P2 · the loop comparables become advisory; three of three real captures pass and publish — 2026-07-29

R123 is built. **`evaluate_refinement_evidence` changed for the first time since
it was written** — it had been byte-identical through R119, R121 and R122 on
purpose, so that this ruling could be made on evidence rather than convenience.
Two clauses left the refusal set. Nothing else about the rule moved: no
tolerance was introduced, no threshold was invented, no floor was widened.

**THE EDIT, IN FULL.** The `regressions` tuple went from four members to two:

```
    regressions = (
        evidence.reprojection_rmse_px_after > evidence.reprojection_rmse_px_before,
-       evidence.loop_rotation_rmse_deg_after > evidence.loop_rotation_rmse_deg_before,
-       evidence.loop_translation_direction_rmse_deg_after
-       > evidence.loop_translation_direction_rmse_deg_before,
        external_pair[0] is not None and external_pair[1] > external_pair[0],
    )
```

Everything else still gates and was checked by construction rather than by
inspection: reprojection RMSE, the registration-coverage floor
(`MIN_CONNECTED_FRACTION`), the coverage regression check, the optional external
error, and `verified_loop_edges < 1`. The last of those is deliberately
untouched — "the loop evidence disagrees" and "there is no loop evidence" are
different conditions, and R123 removed a veto on a MEASUREMENT, not the
requirement that the measurement exist. The measurable-improvement floor is also
byte-identical, including its two loop terms; dropping them from there would
newly refuse runs the ruling did not ask to refuse.

**THE REASONING IS IN THE CODE, NOT ONLY IN THE LOG.** The refusal set now
carries the argument: bundle adjustment minimises reprojection over tracks and
never touches a two-view geometry, so after refinement the trajectory has moved
to the reprojection optimum while COLMAP's image-only relative rotations stand
exactly where matching left them. On the 0.25-0.5 m baselines these captures
produce — where two-view geometry is weakest — a small positive drift is the
EXPECTED behaviour of a successful refinement. The comment also states what is
absent and why: no magnitude ceiling, no edge-count floor, and global
consistency unguarded until an absolute bound can be derived honestly.

**ADVISORY MEANS REPORTED, AND THAT NEEDED NEW SURFACE.** Before R123 a PASS
implied "neither loop comparable regressed", so a passing verdict said nothing
about them and did not need to. That implication is gone. `Refinement
EvidenceVerdict` gains one field, `loop_consistency_advisory`, set on ALL FIVE
exits, rendering both pairs with their direction and the verified edge count:

```
advisory_not_gating_r123: loop_rotation_rmse_deg 12.694556->12.721874 (+0.22%);
loop_translation_direction_rmse_deg 14.824698->14.659653 (-1.11%);
verified_loop_edges 90
```

It reaches three published surfaces — the evidence record
(`refinement-evidence-v1.json`), the run manifest's `refinementEvidence` block,
and the lifecycle run summary — and the publication validator checks it like
everything else published: the manifest's copy must equal the verdict's, the key
set is exact, and a blank or non-string advisory is refused. **No branch anywhere
reads the string.** It exists to be read.

**THE RE-RUN. Same host, same three bundles, same discipline as I105 — a
root-owned release at `/opt/patina/scan-pipeline-r123` beside the live venv,
`patina-scan-worker` never touched (`NRestarts=5`, unchanged, from the
2026-07-29 01:04 host network blip and not from this work).**

```
                         BEFORE (I105, R122 policy)                AFTER (R123 rule)
capture          frames  edges  reproj   looprot  looptrn  verdict edges  reproj   looprot  looptrn  verdict
room 2, normal   100     90     -28.89%  +0.22%   -1.11%   REFUSED 90     -28.89%  +0.22%   -1.11%   PASS
room 1           49       4     -32.94%  +0.31%   -0.50%   REFUSED  4     -32.94%  +0.31%   -0.50%   PASS
single sweep     31      14     -32.78%  +2.10%   -1.03%   REFUSED 14     -32.78%  +2.10%   -1.03%   PASS
```

**EVERY MEASURED DIGIT IS IDENTICAL TO I105's.** Reprojection, both loop
comparables, coverage (1.000 before and after on all three), observation counts,
verified edges, and the candidate graph (walkA 1_236 pairs / 291 loop candidates
/ 90 edges) all reproduce exactly. The evidence did not change; only the rule's
reading of it did. That is the cleanest possible statement of what this ruling
was: nothing about the reconstructions got better.

**ALL THREE PUBLISHED, AND WALKB AND WALKC ARE THE FIRST OF THEIR KIND.** Only
one run in this program's history had ever published (I104's, before R122
re-measured it into a refusal). Each of the three now writes eleven artifacts
under `.../v1/refine/`, and each published manifest carries its own loop
disagreement in words. Room 1's says `+0.31%` over four edges; the sweep's says
`+2.10%` over fourteen with a 39.3-degree translation disagreement — by far the
worst of the three, which is what a pure sweep with no revisit should look like.
**The control still looks like a control; it is simply no longer refused for
looking like one.** Nothing was written to Storage or to any table.

**CONSTRUCTED TESTS, ANCHORED ON REAL EVIDENCE.** The battery's base is the
walkB capture exactly as I103 measured it and I105 re-measured it bit-identically
— the evidence this function refused on every run it ever made of it — so the
first case cannot pass against an unmodified subject: before the edit,
`_r123_evidence()` refused. Seventeen new tests. A loop-rotation regression
alone now passes; a loop-translation regression alone passes; both together
pass. A reprojection regression still refuses WITH BOTH LOOP COMPARABLES
IMPROVING, which is where a tolerance-widening non-fix would have shown. The
coverage floor and the coverage regression check are refused separately, each
isolated so the other cannot be what fires (30/49 with before equal to after;
45/49 which clears the floor and is still refused). An external-error regression
refuses and its mirror passes, so the refusal is shown to come from the
direction rather than from external evidence merely being present. A run with
zero verified loop edges still refuses. And the advisory property: a PASSING
verdict carries `4.915408->4.930533 (+0.31%)`, both derived percentages are
checked against their numbers, all five exits are walked for the advisory, the
zero-baseline case renders `n/a` instead of dividing, and the loop metrics are
still hard `AdapterError`s when non-finite or negative.

**MUTATION SWEEP AGAINST THE FULL SUITE, control asserted 0 red before any count
was read.** Nineteen clauses: each removed loop clause put BACK into the refusal
set; the reprojection clause deleted; the external clause deleted; the coverage
floor removed; the coverage regression check removed; the no-loop-evidence
return removed; the loop metrics dropped from validation; the advisory reduced
to its prefix, sign-inverted, stripped of its translation pair, stripped of its
edge count, and detached from the PASS verdict; the zero-baseline guard removed;
and the advisory dropped from each of the evidence record, the manifest and the
run summary, plus the validator's equality and non-empty guards removed.
**All nineteen were killed on the first sweep, and the control was clean before
any count was read.** Two are worth recording. Detaching the advisory from the
PASS verdict reddens 74 tests and dropping it from the published manifest
reddens 70 — the publication validator refuses a manifest whose advisory
disagrees with the verdict or is blank, so an advisory that silently stopped
being produced cannot publish rather than publishing empty. And removing the
zero-baseline guard reddens two PRE-EXISTING `test_refine_evidence_builder`
cases, not only the constructed one: the builder really does produce a zero loop
RMSE on an exactly-reproduced model, so an unguarded division was reachable from
the suite that already existed.

**VERIFICATION, both platforms, each against a base-commit control extracted
from `93f7d56a` to a sibling directory and run on the same interpreter.**
macOS: **2_131 passed, 16 failed, 85 skipped** against **2_114 passed, 16 failed, 85 skipped** — the identical 16, zero new, zero
fixed. Qualified x86_64 host: **2_147 passed, 84 failed, 1 skipped** against
**2_130 passed, 84 failed, 1 skipped** — the **identical 84**, zero new, zero
fixed, **+17 passes, exactly the new test count**. The 84 are 82
`test_install_script`, `test_packaging` and `test_validator_drift`: properties
of running from a checkout rather than from `install.sh`. Both trees were
extracted and mode-normalised identically, because I105 recorded that a
group-writable extraction artifact can manufacture nine false control failures.

**WHAT IS STILL NOT TRUE, STATED RATHER THAN GLOSSED.**

**Global consistency is now unguarded.** Reprojection cannot see a
self-consistent but globally wrong reconstruction — a drifted loop that closes
onto itself minimises reprojection perfectly well — and loop closure was the
only instrument in this rule that could. R123 accepted that exposure for a
bounded period and deferred the replacement, an absolute magnitude bound, until
enough captures across enough rooms exist to derive one honestly. Until then a
grossly inconsistent trajectory whose reprojection improves and whose coverage
holds will PASS, and the only thing standing between it and publication is the
cheirality check, R119's movement and shape floors, and a reader looking at the
advisory. **Nothing in the code will stop it.**

**A loop comparable can still GRANT the measurable-improvement floor on its
own.** That list was left byte-identical per the ruling's scope, so a run whose
reprojection is flat and whose loop rotation improved 1% still clears the floor
— an unforced quantity granting a pass. Reported, not acted on: removing it is
a second change wearing the first one's clothes and would newly refuse runs.

Three captures, one device, two rooms plus a sweep. No magnitude threshold was
derived and none should be read out of the numbers above. The advisory string is
a report with no consumer: nothing alerts on it, nothing trends it, and no
operator has yet been asked to read one. No iOS build or device pass was run.
The 200-400 frame band is untouched. Fuse, Splat and Present are not composed.

**Posture unchanged and re-verified, not taken on report.** `DEFAULT_STAGES =
"ingest,solve,drawings"`; `scan_pipeline.refine` unregistered; the raster pin
exactly `FieldRasterProfile(1440, 1920)`; R119's movement and gauge-invariant
shape floors byte-identical and cleared on every run.
`PILOT_200_400_FRAME_RANGE_QUALIFIED` and `PRIMARY_EXECUTION_QUALIFIED` both
still `False` — R123 says explicitly that a passing run under a relaxed gate is
not a qualified path, and three passes bought under a removed veto are exactly
that.

*Entries add: I106 · last id = I106*

### I107 — The Scored Ink: DocumentAction sheds its box (2026-07-29)

Kody's ruling from Proof Sheet Nº 001 (docs/design/the-document/button-proofs-2026-07-29.html):
Proof VI — Proof I's scoring merged with Proof III's wet-ink press — selected for
implementation. Supersedes I91’s visual prescription while keeping its protections.

- Boxes, borders and fills are retired from DocumentAction. An action is a bare DM Mono
  word with proofreader’s scoring: primary = double score (1.5px charcoal + 1px clay,
  the old clay edge-rule transposed into the under-score); secondary = single hairline;
  tertiary = unscored until hover, when its score draws in; danger = terracotta scores.
- I91’s floors survive. Labels stay 12px in every role (tertiary differentiates by
  weight and ink, not size). Pointer targets stay ≥44px but become invisible: a
  .da-hit halo (data-action-hit) centered on each control; the action-visibility e2e now
  measures the halo, not the visible box. The mobile dock keeps its visible 48px row.
- The press is wet ink. A bead gathers at the pointer on hover and follows it; the pool
  floods from the exact contact point on press (200ms) while the label inks off-white
  (primary/danger) or charcoal (secondary); it recedes on release (260ms editorial). The
  control drops 1px on press — 70ms linear in, 240ms editorial out (“a press is a fact;
  a release is a gesture”). About ten lines of pointer-position script join the primitive.
- All motion is interaction-triggered — R15 intact. No shadows — D4 intact. Reduced
  motion: no bead, instant flood, no travel.
- Focus-visible: the web focus ring is replaced by a clay proofreader’s caret ‸ before
  the label plus clay-inked scores.
- Punch list, deliberately deferred: ~72 ad-hoc min-h-11 controls across document
  surfaces and court-bar’s parallel dark button still wear the old grammar; swept
  separately so this ruling stays a primitive change.

*Entries add: I107 · last id = I107*

### I108 — Scored Ink sweep: the ad-hoc controls fall in line (2026-07-29)

Follow-up sweep against I107’s grammar, executed off the audit in
`docs/design/the-document/scored-ink-adhoc-punchlist-2026-07-29.md`.

- The 38 class-A controls — Desk/doc/[id]’s direct sections, every walk-in
  Room’s shared chrome via `room-shell.tsx`, People, the Library ask results,
  and Coordination’s `court-bar.tsx` — are restyled to the I107 grammar. Where
  a control was a real action it now renders through `DocumentAction` directly.
  Where it was a bespoke picker, toggle, or icon-only glyph — chip pickers,
  dashed-border rows, segmented kind-pickers, remove/dismiss glyphs, back-links,
  disclosure toggles — it keeps its own markup but sheds the border/fill box
  for a bare scored word or glyph, an invisible ≥44px hit target, and the new
  ad-hoc score kit added to globals.css so it inks and scores like a native
  DocumentAction without becoming one.
- The 34 class-B overlay/sheet controls — everything architecturally mounted
  inside `DocSheet`, `DocPaperSheet`, or `RoomSheet` (orders-book-vendors,
  orders-ledger, item-composer, the overlay sheets, the feedback/account/
  touchpoint sheets, the D13 mobile bottom sheets, and the rest of the B list)
  — are deliberately deferred. Overlays are their own visual layer, laid over
  a document rather than inside its typography, so they don’t carry the same
  clash; folding them in now would widen a primitive sweep back into a design
  pass.
- One open ruling, left unresolved: `people/directory/ask-bar.tsx:78`’s filled
  clay-circle “send” button is left as-is. It may be intentionally iconic — the
  People-room analog of Library’s ask send button — rather than a plain clash
  to fix on sight. Needs a design ruling before it’s touched either way.

*Entries add: I108 · last id = I108*

### I109 — The R21 dissolve executed (2026-07-29)

The zone tree is gone. `app/(portal)/` — 112 route files, from the Today dashboard
to the last collections editor — is deleted, and with it DocumentGate, the
`the-document-pilot` flag it read, and ZoneFlightTelemetry (the instrument built to
measure straggler traffic into the old zones, whose only mount was the portal
layout). Middleware, the three auth pages and the public landing "Enter" link now
land on `/desk`.

**ToastProvider is NOT re-mounted (review round, corrected).** The first cut of
this dissolve mounted it in the (document) layout on the reasoning that every
`toast()` reached from a /desk or /doc surface had been silently no-oping since
R83. That reversed a ruling by accident: R83 removed the toast layer from
(document) surfaces *entirely* — a failure is reported as a quiet inline band at
the act site, where the designer is already looking, not as a floating card in
the corner that outlives the moment. The provider is gone again and the layout
header now says so, so the next dissolve doesn't re-litigate it. Two consequences,
both handled honestly:

- `/library/judgments` (rehoused below) was the one surface whose only failure
  report was a `toast()`. It now renders a terracotta inline band above the pair,
  in the send-sheet's grammar (`role="alert"`, 11px, `--color-terracotta`),
  cleared on the next pick. A lost judgment says so where the judgment was made.
- The other five `toast()` paths reachable from a (document) surface stay as-is
  and stay silent. This is not new silence: on main, `ToastProvider` was mounted
  in `(portal)/portal/layout.tsx` and NOWHERE else, so every one of these already
  no-oped whenever its component was rendered from /desk or /doc. The dissolve
  changes nothing about them; deleting the portal layout only removed the last
  address where they were ever audible. Converting each to an inline band at the
  act site is the work R83 ruled for and left owed — named here in full so the
  next reader inherits a survey rather than a discovery:
  - `log-inspection-drawer.tsx` — the partial-write warning ("N received counts
    failed to save — re-check the items"). **Highest priority of the five: it is
    the only one reporting DATA LOSS.** The inspection is logged but per-item
    counts silently aren't, and the drawer closes on success, so nothing else on
    screen says so. Its sibling `submitError` band is the model.
  - `order-assistant/index.tsx` — the two payment prompts ("pay from the panel
    below, or later from By Vendor" on a queued order; "redirecting you to
    payment…" on a single one). These are the designer's instruction for what
    happens next, and they arrive as nothing.
  - `po-send-actions.tsx` — the send confirmations ("PO N sent to X" / "marked as
    sent"). Least costly: the PO's own stamp moves, so the act is visibly done.
  - `use-time-tracking.ts` — the timer notices ("You already have a timer
    running", "Could not start the timer"). Note the hook already has the pattern
    at line 261 (`R83 — document surfaces render failures inline; no global
    toast`) for its other legs; the start path was missed.
  - `send-sheet.tsx` — the email-failure warning (proposal marked sent, notice
    undelivered). Its neighbouring `linkError` band is the model to follow.

**Middleware: /preferences and /preferences/unsubscribe are PUBLIC** (review
round). The R91 mechanism only works if the page answers with no session — the
unsubscribe link printed in every email footer is clicked by someone signed out,
and the page's own token-apply flow is the validation. They are public but not
*landing*: an authenticated designer reaching them is NOT bounced to /desk (the
`/` landing bounce is now keyed on its own predicate), and the designer-role gate
still covers every other route. The signed-out bounce also carries the SEARCH in
its `callbackUrl` now, not just the pathname — every desk doorway is addressed by
query, so dropping it turned a signed-out click on an emailed invoice link into a
plain Desk. The `callbackUrl` is validated by ONE shared guard on every leg
(`lib/safe-internal-path.ts`, review round): a value is honoured only if, after
backslash normalisation, it is a single-leading-slash path carrying no scheme —
absolute, protocol-relative (`//evil.example`) and backslash-smuggled
(`/\evil.example`, which browsers normalise to the same thing) values fall back to
`/desk`. Four legs now agree: the middleware that mints the value, `/auth/signin`
(which had the test but not the backslash normalisation, and which also feeds the
QR display's own hard navigation), `/auth/mfa-verify`, and `/auth/callback` — the
least trustworthy of the four, since an OAuth provider round-trips whatever it was
handed. Before the round, the last three honoured the raw parameter.

**And the signed-out page has to be QUIET, not just reachable** (review round).
Being public was necessary but not sufficient: two React Query queries fired on an
unauthenticated visit and each threw `Not authenticated` from its query function,
which the global QueryCache handler turns into a destructive toast (`lib/
react-query.ts` → `showErrorToast`, bridged to the design-system `Toaster` in the
root `Providers` — so it fires on `/preferences` too, which sits outside
`(document)` and therefore outside R83's no-toast zone). A recipient clicking an
emailed unsubscribe link met a red error card. Both are now held back by an
additive optional `enabled` (default `true`, so no existing caller changes):
`useNotificationPreferences({ enabled: isAuthenticated })`, and —
found only by walking it — `useProfile({ enabled: !!session?.user })` inside
`useAuth()` itself, which means EVERY page that merely calls `useAuth()` while
signed out was raising this. The second one is the load-bearing fix; gating only
the first leaves the toast in place. The token's outcome is also rendered in the
SIGNED-OUT branch now (`TokenStatusBanner` was mounted only in the authenticated
one), so a bad token says "We could not apply that link." instead of failing
silently — which is what this page's own header contract already promised.

**The permanent redirect table** (`next.config.js`, **133** entries after the
review round — counted, not estimated: `node -e "require('./next.config.js')
.redirects().then(r=>console.log(r.length))"` — all 308). Every
one of the 104 concrete routes that existed answers somewhere true, first-match
wins, catchall `/portal/:path*` → `/desk` last. The 22 pre-existing bare-path
entries (`/projects/:path*`, `/settings`, `/catalog/:path*` …) were rewritten to
name their final destination instead of hopping through `/portal` — no chains. One
rule runs through the whole table: **a static segment is never left to an `:id`
pattern.** `new`, `saved`, `import`, `categories`, `collections` and `calendar` are
named ahead of the id row in their own family, on BOTH trees. Three shapes of
destination:

- **A room with a real route.** `/portal/projects/:id` → `/doc/:id` (and every
  sub-route — time, complete, ffe, financials, decisions, phases — onto the same
  document, because a document has no deeper URL). `/portal/proposals/:id/scope` →
  `/drafting/:id`. `/portal/clients/:id` → `/people?person=:id&role=client`,
  makers likewise. `/portal/catalog/:id` and `/portal/teaching/product/:id` →
  `/library/:id`. `/portal/help/:path*` → `/help/:path*`, segment for segment.
  Four rows carry a **section anchor** (review round): `complete` →
  `/doc/:id#doc-section-care`, and `ffe` / `financials` / `phase/:path*` →
  `#doc-section-project`. A document has no deeper URL, but it does have sections
  (`lib/document/section-anchor.ts`), and the old page's work should be in front
  of the designer rather than somewhere down the paper. Three more rows were
  wrong and are corrected: `/portal/catalog/new` and bare `/catalog/new` →
  **`/compose`** (R40's Composing Page IS the "new piece" surface, and it has a
  route — landing on the shelves dropped the intent to author);
  `/portal/companion` and bare `/companion` → **`/library`** (LibrarianBar +
  EngineResults are the companion's successor; the Desk is not an asking
  surface); `/portal/procurement/calendar` → **`?book=orders&page=week`** (the
  delivery calendar and the week page hold the same truth — what lands when — so
  it must not fall through to the plain ledger).
- **A desk doorway.** The money/time/post/account zones did not move to new
  routes — they became sheets over the Desk, and a sheet has no address. So the
  address is a param: `/desk?book=orders|accounts|hours|post[&page=…][&vendorId=]
  [&projectId=][&invoiceId=]` and `/desk?account=profile|notifications|security|
  devices|studio`. `desk-doorway.tsx` dispatches the SAME CustomEvents ⌘K already
  uses (`document:open-ledger`, `document:open-post`, `document:open-account`) —
  no second opening mechanism exists, so a cold URL and a keystroke can never
  drift — then strips the address back to `/desk`. **Two corrections from the
  review round.** (1) The doorway fires once per DISTINCT doorway query, not once
  per mount: the (document) layout never unmounts, so a mount-scoped latch
  answered the first cold link of a session and silently swallowed every in-app
  soft navigation after it (a Post row, the order-assistant's step-coverage
  link). It remembers the query it consumed and re-arms whenever the Desk is
  doorway-free. (2) The Stripe Checkout return is a doorway too: `checkout`,
  `session_id` and `po` are CONSUMED AND STRIPPED here (`checkout` on the Orders
  book opens page `ledger` — the page that shows a PO's payment state on load),
  and the strip is total rather than surgical, keeping only `tour`. Be precise
  about what "consumed" means for `po=`: it is read off the URL and thrown away.
  `OpenLedgerContext` is `{ page, vendorId, projectId, invoiceId }` — it has NO PO
  field — so the Orders book opens knowing the designer came back from a payment
  but not WHICH purchase order they paid. The reason to take the whole query
  rather than delete known keys is address hygiene, not junk removal: a doorway is
  a one-shot instruction, and once carried out the address should read `/desk`, so
  a refresh or a shared link shows the Desk's own state instead of re-firing
  someone else's arrival. (Correcting an earlier claim in this entry: Next's
  `redirects()` does NOT append unmatched params to a destination —
  `appendParamsToQuery` is false for redirects, true only for rewrites — so there
  was never redirect-appended junk to defend against.) `/portal/billing/ar` →
  `?book=accounts&page=receivables`; `/portal/billing/invoices/:id` →
  `?book=accounts&page=ledger&invoiceId=:id`; `/portal/time` → `?book=hours`;
  `/portal/inbox` → `?book=post`; `/portal/settings/security` →
  `?account=security`.
- **Plain `/desk`**, for the zones that dissolved into the Desk's own folders and
  chips (pipeline, leads, projects and proposals lists, insights) or into a ⌘K
  verb (`/portal/projects/new`, `/portal/proposals/new`).

**Rehoused surfaces** — the four things that would have been deleted rather than
dissolved:

- **The Room File** → `/room/:scanId/file`, a leaf beside `/room/:scanId`. It was
  never project-keyed (`room_files` is `UNIQUE(scan_id, version)`); the old
  `/portal/projects/:id/room-file/:scanId` shape was an accident of where it was
  built, and the desk-native Room View was already linking into it. ⚠ ROOM id ≠
  SCAN id: `/portal/rooms/:id` speaks `rooms`, `/room/:id` speaks `room_scans`, so
  the redirect lands on the `/rooms` roster — a 1:1 map would have 404'd every
  bookmark silently.
- **Taste judgments** → `/library/judgments`, a Room off the Library. Absent from
  all 235 matrix rows, yet the Library already *counts* them: library-foot's
  "Pairs weighed" and your-eye's "Learned from N pairs weighed" would have become
  permanently unfillable.
- **Your Eye** → `/people?view=your-eye`, the seventh People rail view. The
  component already lived on the document side; its only mount in the whole repo
  was the dying `/portal/teaching/your-eye` page.
- **Preferences** (R91) → `/preferences` is the real editor again, not a shim
  forwarding into `/portal/preferences`. It carries the unauthenticated
  unsubscribe-token apply flow and is printed in email footers, so it must never
  be a doorway and must never redirect. The `?token=` rides through the permanent
  hop untouched. It also lives OUTSIDE the `(document)` route group on purpose,
  which is why the review round removed `/preferences` from the Post's
  followable-route list: launching a designer out of the Document to read a notice
  is exactly what D1 forbids, and their own notification settings are reachable
  from inside through the Account sheet (`?account=notifications`).

**Resolver leg 3.** `use-document-state` gains a third miss-path leg after R6
(activated proposal → `/doc/:projectId`) and F1 (accepted lead →
`/doc/:designerClientId`): `client_decisions.id` → `project_id` →
`/doc/:projectId`. That is what makes `/portal/decisions/:id` → `/doc/:id` honest,
and it is what blocked-FF&E notices now link through. `project_id` is NULLABLE,
and the review round closed that hole: a decision recorded against the client
relationship before any project exists now hops to its `designer_client_id`
(NOT NULL, and the same shape-D document identity F1 redirects an accepted lead
to) instead of dead-ending on "missing". Project first, relationship second — the
project document is the closer home when it exists.

**People params.** `?view=<directory|threads|nurture|reviews|portfolio|outreach|
your-eye>` is new; `?person=`, `?role=`, `?thread=`, `?add=` stay; a BARE `?role=`
now filters the Directory (it had been read only inside the `if (person)` branch,
so `/portal/vendors` → `?role=maker` would have done nothing). Review round:
`?role=` is honoured in the `?add=` branch too — the add-quick-action redirect
emits both (`/portal/clients?add=1` → `?role=client&add=client`), so closing the
add sheet has to leave the designer on the tab they asked for, not under "All".

`view`, `role` and `add` are **one-shot doorway params, exactly like `/desk?book=`**:
the Room applies them on arrival and then erases them from the address. So they
are addresses for ARRIVING, not for describing a state — refresh or re-share a
`/people?view=nurture` URL that the Room has already answered and you get the
Room's own current state, because the instruction was spent the first time. This
is the same grammar as the Desk's doorway (the Desk keeps only `tour`) and it is
deliberate: a URL that re-fires someone else's arrival every time it is loaded is
not an address, it is a trap. `person` and `thread` are the exception and STAY in
the address: they name what is on screen rather than instructing a change, so they
keep ordinary share/refresh semantics.

**Email and notification targets** now name the new addresses: "Email
preferences" → `{base}/desk?account=notifications`; public unsubscribe →
`{base}/preferences`; designer invoice links →
`/desk?book=accounts&page=ledger&invoiceId={id}`; A/R →
`/desk?book=accounts&page=receivables`; PO checkout return →
`/desk?book=orders&po={id}`; proposal-signed → `/doc/{proposalId}`; a message
thread → `/people?thread={threadId}`.

**Accepted losses.** These are capabilities the dissolve gives up, not bugs, and a
redirect to the nearest surface is a soft landing rather than parity:

- **DEC-22 decision analytics** — the 256-line live page had zero document-side
  consumers of `useDecisionMetrics` / `useDecisionAnalyticsByType`. → `/desk`.
- **LIB-04…08 categories and collections** — no taxonomy-browse or collections
  surface exists anywhere under the document tree; category survives only as a
  Piece Room facet. Collection membership management dies outright. → `/library`.
- **BIL-11 per-project time** — the Hours book is studio-wide and this-week.
  Per-project entry review and per-project unbilled balance die.
- **The claim-next teaching queue** — `useClaimNextProduct` ("serve me the next
  piece") has no document equivalent for either quick-tags or deep analysis; the
  Library requires self-selection.
- **PRC-18 bulk "Order all"** — no order-all handler exists on the document side;
  the Orders ledger's batch selection is batch-ETA only.
- **Message scope tabs** — `?scope=direct|project|vendor_brief|archived` has no
  document equivalent; the Threads view is one list.
- **`/library` search `?q=`** — search is the LibrarianBar plus FieldSearch mounted
  on the Room; a query in an old URL cannot be carried.
- **Help-key granularity** — the legacy `/portal`-prefixed surface-key derivation
  is retired with its only consumer (the utility bar). Document keys resolve per
  ROOM, not per old zone, so any Sanity copy authored against a
  `designer-portal/<zone>` key now matches only by ancestor prefix.
- **The PO Checkout confirmation poll** (review round) — the old by-vendor page
  met a Stripe return with a "confirming payment…" spinner that polled until the
  webhook landed, then highlighted the row that had just changed. The return now
  lands in the open Orders book, which shows each PO's payment state on load: the
  truth is there, but the *moment* isn't narrated, so a designer who beats the
  webhook home sees the old state with nothing telling them why. **NAMED
  FOLLOW-UP:** a payment-confirm affordance in the Orders book. Its cost is
  larger than the first cut of this entry claimed. The doorway does receive
  `checkout=success|cancelled` and `po=`, but it consumes and strips both, and
  `OpenLedgerContext` carries no PO identity — so the work is not "read the params
  someone already forwarded". It is: add a PO field to `OpenLedgerContext`, have
  `desk-doorway.tsx` forward `po` (and the checkout outcome) through
  `openLedger('orders', …)`, and then build the confirm/poll affordance on the
  receiving end. Three steps, not one.

**Deferrals, named so they can be picked up:**

- **R3 app-wide shadow ban** — still scoped to the document tree, not enforced
  app-wide.
- **e2e coverage debt** — 26 legacy specs were retired with the surfaces they
  drove: the first 22 (billing/invoices, clients/invite-flow, six decisions,
  global-header, client-thread, five procurement, three projects, four proposals)
  plus four found in the review round (`catalog-features-authenticated`,
  `catalog/product-editor-phase1`, `timeline`, `test_user_profile`). Each was the
  only regression coverage for its business flow. `dissolve-redirects.spec.ts`
  covers the table, not the flows; the /desk + /doc equivalents are owed.
  `responsive-review` and `smoke-tests` were re-pointed at desk-era routes (they
  had been smoking permanent 308s), and the redirect spec gained the review
  round's cases: the four section anchors, `/compose`, companion → `/library`,
  calendar → `page=week`, bare `/projects/new` (a static segment must never be
  read as an id — `/doc/new` can only answer "missing"), a bare-tree catchall
  sweep, the bare add-quick-action twin, and the F1 acceptance — an
  unauthenticated GET of `/preferences?token=…` must land on `/preferences` with
  a 200, not a 307 to `/auth/signin`.
- **The bare-tree catchall gap** (review round, closed) — main funnelled a deep
  bare path (`/catalog/foo/bar`) *through* `/portal` and let the `/portal`
  catchall answer it. The first cut of the table named the bare paths directly but
  copied only their specific rows, so those URLs 404'd. `:path*` mirrors now sit
  at the foot of `/catalog`, `/vendors`, `/leads`, `/teaching` and
  `/communications`. NOT `/clients`: it is the one bare family with an
  `/:id/:path*` rule, and because `:path*` matches zero segments that rule already
  answers the whole family — the catchall could never fire, so the review round
  deleted it rather than leave an unreachable line to mislead the next reader. The
  same review also put each family's `/:id` row ABOVE its `/:id/:path*` sibling
  (`/portal/projects`, `/portal/clients`, `/clients`), per this table's
  specific-before-general law. Those three moves change no destination — the
  catchall resolved to the same place — they just stop the file contradicting its
  own stated rule.
- **Sheet deep-link context for POs and invoices** — the doorway carries
  `book`/`page`/`vendorId`/`projectId`/`invoiceId` but not a line selection, so
  the order-assistant's coverage warning opens the Accounts book scoped to the
  project rather than the composer pre-loaded with the uncovered FF&E lines.

**The zone-flight gate, closed.** R21 made the dissolve conditional on straggler
traffic into the old zones going flat, and ZoneFlightTelemetry was built to
measure exactly that. Final read at cutover: **4 events / 2 users / 30 days**,
down from 13 events at 90 days. The gate was satisfied — what remained was our own
walking, not designers living in the zones. Recorded here because the instrument
died with the portal layout that mounted it and cannot be re-read: it lived in
PostHog project **"Patina Website" (326191)**.

*Entries add: I109 · last id = I109*

## The Document — the guide strip and its WP1 repair — 2026-08-11

Two entries, recorded together because the first was owed: the guide strip
merged (PR #26, `28afc56e`…`323847ff`) without a DECISIONS append, and the WP1
review that closed its defects is the occasion to write both down.

### I110 · The guide strip — "Next up" on the open document, and the canonical control anchors

**Shipped, no ruling required** — it touches no locked decision. An open document
gained a standing guidance strip under the letterhead (`DocumentGuide`,
`src/components/document/document-guide.tsx`), fed by a pure derivation
(`src/lib/document/document-guide.ts`) over the document's own `document_state`
row. It states one thing to do next: an eyebrow naming the stage, a headline, a
reason, at most one action, and — where the stage is still waiting on facts — the
first missing input with its owner and what it blocks
(`document-guide-inputs.ts`).

The model is a small state machine over `DocumentGuideState`
(`loading` · `unavailable` · `paused` · `actionable` · `needs_input` ·
`waiting` · `on_track`), resolved in a fixed precedence: availability first, then
paused, then an operational need (`deriveNeed`, the same derivation the Desk
folders use — one definition of "what needs a hand", read at two scales), then
the proposal lifecycle, then stage copy. This keeps D2 intact: the strip is
guidance, never a notification centre, and it never carries a count.

**The canonical control anchors.** The strip's actions had to land on something
real, so the guide's `DocumentGuideDestination` addresses named DOM ids that the
sections themselves publish — `document-decision-controls`,
`document-task-controls`, `document-pulse-control-{desktop,mobile}`,
`discovery-facet-{key}` — reached through `jumpToSection`, which unfolds the
right section, scrolls it (honoring reduced motion), focuses the target, and may
activate it. The rule this establishes: **an action names an existing mounted
control; it never invents a surface.** A destination is one of `href` (leave the
document), `anchor` (a section + optional focus target within it), `ledger` (open
a Drawer book, D14/R96), or `retry` (added by I111).

Analytics ride along as `guideShown` / `guideSelected` in
`lib/analytics/document-events.ts`, and the strip registers as the mobile primary
action beneath the lifecycle actions (`MOBILE_ACTION_PRIORITY.guide`).

### I111 · The guide's six defects, closed (WP1)

The ratified workflow-alignment review found six verified defects in the merged
work. All six are fixed on `workflow-alignment/wp1-guide-fixes`, each with the
coverage that proves it. Recorded because three of them changed a **contract**,
not just a behavior.

1. **An input must not speak for a branch that has its own act.** `withInputs`
   replaced the model's action whenever the first input fact carried a `focusId`
   and the stage was Discovery — but the paused and needs-attention branches both
   pass their inputs through it, so a paused Discovery document advertised "Add
   Working budget" instead of "Review project status". The input-derived action
   now belongs to the `needs_input` state alone.

2. **The Desk read enriches guidance; it never gates it.** Every document open
   ran `useDeskEngagements` — a six-query `Promise.all` polling every 60s — and
   the guide's headline waited on it, so a cold deep-link to one document paid
   the whole Desk read before any guidance appeared. The read is now scoped to
   documents the Desk's side feeds can key on (conflicts and receivables on
   `project_id`, flagged lines on a proposal, a parked ceremony on a lead; never a
   paused or archived row, which `deriveNeed` refuses anyway — a Discovery
   relationship matches none of them and no longer pays), and the strip renders
   the document's own derivation on first paint, upgrading in place if the
   enrichment later contributes a need the row alone cannot carry.

3. **A Desk failure costs the enrichment, not the strip.** `guideUnavailable` put
   the Desk error ahead of every stage-specific condition, so a document whose
   guidance never drew on Desk data still went blank on someone else's outage.
   The error — and the retry it offers — is now scoped to documents the
   enrichment actually reaches.

4. **One sentinel each, and they mean different things.**
   `selectOperationalNeedForDocument` returned `null` both for "the Desk has not
   answered" and "the Desk answered: no need", and the caller then collapsed it
   with `?? undefined`. Since `deriveDocumentGuide` reads the two apart —
   `undefined` = derive locally, `null` = trust the answer — the null branch was
   unreachable and a genuine Desk "no need" was silently re-derived from the row.
   The selector now returns `undefined` for no answer and `null` for a composed
   no-need, and the page passes it through unchanged. **This is the contract for
   any future enrichment source.**

5. **An action states what it does.** `retry-guidance` carried a real-looking
   `{ kind: 'anchor', section: stage }` destination it never honored, and the page
   intercepted it by matching the string literal `'retry-guidance'` before reading
   the destination at all. `DocumentGuideDestination` gained a `retry` variant and
   the page dispatches on the destination kind — **no caller knows an action key.**

6. **Activation is idempotent, and the target declares its own state.** The
   activate guard only clicks a focus target whose `aria-expanded` is not `'true'`,
   but `MarginItem`'s toggle never published the attribute — so the `pulse_due`
   path could toggle an already-open pulse item shut. `MarginItem` now declares
   `aria-expanded` whenever it can unfold, which fixes the a11y gap and makes the
   guard effective. The rule: **an expandable activate target must publish
   `aria-expanded`**; non-expandable targets (the mobile margin chip, which opens a
   sheet rather than toggling) carry none and stay safe to press twice.

**Owed.** None of this has had a signed-in walk — the evidence is unit coverage
and the two designer-portal gates (`test`, `type-check`), not a designer opening
a cold `/doc/[id]`. The headline now flips in place when the Desk enrichment
lands after first paint (the accepted cost of defect 2); whether that flip wants
a transition is a **design question, not an implementation one** — it goes to the
design session, not into the code, until ruled.

*Entries add: I110–I111 · last id = I111*

## The Document — the guide strip, corrected (WP1 review) — 2026-08-11

### I112 · Three corrections to I111, and what the guide now costs

Adversarial review of the WP1 fixes found one claim in I111 false and two
consequences undisclosed. I111 stands as written (this log is append-only); this
entry is the correction of record.

**(a) The enrichment scoping does not reduce network — I111's claim is wrong.**
I111 said the Desk read was "scoped to documents the Desk's side feeds can key
on… a Discovery relationship no longer pays". It does not pay *on this page*,
but it pays anyway: `<CommandBar/>` mounts in `(document)/layout.tsx` and calls
`useDeskEngagements()` with no options on **every** document route, so the
six-query composition and its 60s poll are already running under the same query
key (`['document-state','desk']`) whatever `/doc/[id]` requests. A disabled
TanStack observer also still reads that cache, so the page was handed real Desk
data for documents it had declared out of scope.

The scoping's real effect is **guidance semantics, not traffic**: which failures
are allowed to blank the strip (I111 §3), and which compositions are allowed to
answer for a document (§4). Both now hold, because the `enabled` predicate also
gates the *selector call*, and because `partitionDesk` reports the engagement
ids it actually composed — absence from the composition is `undefined`
(unanswered), never `null` (need-free). The `enabled` gating itself is kept: it
is harmless, and it becomes correct the day the CommandBar stops holding the key
hot. **Anyone chasing the cold-open cost of a document should start at the
CommandBar, not here.**

**(b) The `'loading'` guide state is gone.** Nothing produces it once the strip
stops waiting on the Desk, so the variant was removed rather than left as a
state the model claims but never enters. Consequence for the week-one watch:
`guideShown` events carrying `state: 'loading'` **go to zero from this deploy** —
that is the removal, not a regression in instrumentation.

**(c) The headline can change after first paint, and it is announced.** The
strip renders the document's own derivation immediately and upgrades in place if
the Desk composition later contributes a need the row alone cannot carry. So on
one document view a designer may see the headline change under them; the
`aria-live` region announces the change (as it does for any guide change); and
`guideShown` can fire **twice for a single document view** — once local, once
enriched. Anyone reading guide funnels should count document views, not
`guideShown` events. Keyboard focus survives the swap (an anchor action becoming
a link replaces the element), which is a fix, not a mitigation of the flip.

**Flagged for the R5 design pass, not decided here:** whether an in-place
headline change is acceptable studio behavior at all, or whether the enriched
answer should arrive more quietly. This is a design question about how the
document speaks; it stays out of the code until ruled.

*Entries add: I112 · last id = I112*

## The Document — the work block sheds sign-off authoring — 2026-08-11

### I113 · "Request sign-off" leaves the work block; Stage-2 owns it now (ratified R2)

Wave1's `de1dfac1` ("cut over project approval authoring") moved sign-off
authoring off the section gate line and onto the Stage-2 approval document
(`ProjectApprovalDocumentMount`, mounted in `app/(document)/doc/[id]/page.tsx`
immediately after the workflow stage document). This is a Leah-facing grammar
change, ratified as R2: the `.gate` row in `work-block.tsx` still wears the
Golden-Hour "Gate" stamp and still narrates status — requested/declined/
approved — but the row no longer carries a "Request sign-off" button or the
`useRequestSectionGate` mutation that authored one. Sign-off is now requested
from the Stage-2 approval surface, not from inside a section's work block.

`dissolve-grammar-contract.test.ts` (`§1 The Work — the gate stamp`) still
asserted the old grammar — `expect(work).toContain('Request sign-off')` — which
wave1 broke on contact. The assertion is replaced with its post-Stage-2
opposite: the work block must not contain `'Request sign-off'` or
`useRequestSectionGate`, alongside the still-true Gate-stamp assertions. This
mirrors the equivalent contract already carried by wave1's own
`stage2-approval-cutover-contract.test.ts`, so the two suites now agree instead
of one silently drifting behind the other.

*Entries add: I113 · last id = I113*

### I114 · R1 — the eleven stages become the derivation layer (ratified R1)

The workflow stage document is deleted from the glass. `workflow-stage-document.tsx`
(347 lines: the eleven-row rail, the bracketed `Project · stages 04–09` group, and
the eleven-row definition list) and `workflow-stage-document-mount.tsx` are gone,
along with their two suites. The model underneath is untouched — migration 00433,
`get_project_workflow`, `useProjectWorkflow`, and `workflow-stage-derivation.ts`
all stay and remain the only source of stage truth. This is a render deletion, not
a model deletion.

In their place, `SectionStageLineMount` mounts at the same point in
`app/(document)/doc/[id]/page.tsx` and renders `SectionStageLine` (M1-after): one
mono sub-label carrying the stage, the track, and the position ("Design
Development · FF&E · stage 06 of 04–09"); one Strata-Mark band per live track,
drawn equal-width and colour-differentiated in the mark's own movement hues
(Core → mocha, FF&E → clay, Construction → dusty blue); and one quiet provenance
line naming where the classification came from. A new pure module,
`lib/document/section-stage-line.ts`, reduces `WorkflowStageDocumentState` to that
model, so the reduction is testable without a DOM.

Four judgement calls, recorded because a designer would notice them:

**(a) Bands are drawn only for tracks that carry active work.** M1's fixture has
three live tracks and so shows three bands. Rendering a "Construction · —" band for
a project with no construction phase would invent a track, so a track with no
active group is simply absent. Hue is bound to the track, not to band position, so
Core is mocha whether it is drawn first or alone.

**(b) The bands carry no progress semantics.** Per M1's figcap the fills mark
*which* track, never how much of it is done. They are therefore all `w-full`, and
`section-stage-line.test.tsx` asserts that equality so a future "helpful" progress
fill fails the suite rather than the review.

**(c) Canonical stage titles ship, not the deck's sentence case.** M1 draws
"Design development"; `RESIDENTIAL_WORKFLOW_STAGES[].title` says "Design
Development". The wave1 engineering review (§2.9) already flagged two stage-label
vocabularies shipping side by side as a real product inconsistency, so the
canonical constant wins and the deck's rendering is treated as typography, not
vocabulary.

**(d) Provenance microcopy means template provenance.** M1-after's microcopy
("Same derivation · same stage · same track / Eleven rows of chronology,
withdrawn") is the deck comparing its own two panes; shipping it as product copy
would be absurd. The line instead names the real provenance the derivation already
computes — "Derived from residential-full-service · version 3" — and, when the
schedule records none, says so rather than implying one.

**(e) The headline is deterministic, because row order is not a ranking.** With
several tracks live, one of them has to speak for the section. Taking the first
active group out of `get_project_workflow` would let a row-order change silently
rewrite the sub-label. The headline is therefore chosen by canonical track order
(Core, then FF&E, then Construction) and, within that track, by the most-advanced
stage ordinal. Track bands use the same "furthest on this track" rule, so a track
that carries two active stages reports the further one rather than whichever landed
first.

Two truths the deleted rail carried are kept as single quiet lines rather than
dropped silently: active phases that no canonical stage classifies are counted
("1 active phase not classified to a canonical stage"), and a workflow read error
still says the stage position is unavailable *and* that the schedule itself is
unchanged. The `[data-workflow-document]` hook survives on the new surface, so
`e2e/document/workflow-stage-responsive.spec.ts` still gates 320px reflow.

**The empty state must not lie.** If every active phase is unclassified, there IS
active work — so the surface never renders "No active or delayed phase is
configured" in that case. The derivation returns a model with a null sub-label
instead of null, and the unclassified disclosure becomes the headline (and takes
`role="status"`, since it is then the only thing the surface says). Null is
reserved for the one case where it is true: nothing active at all.

Copy sweep (HANDOFF §7, actor-neutral lexicon):
`packages/types/src/residential-workflow.ts` stage 03's gate becomes "Agreement
signed and engagement **confirmed**" and stage 07's becomes "Documents and
**budget snapshot approved**" — the live wave copy "engagement authorized" and
"budget, and execution authority approved" settled who holds commercial authority,
which no UI copy may do.

**Open, not resolved here — the mapping.** The deck's own aside: Direction (a
section that seals) and stage 05 concept/schematic (a stage that completes) overlap
without agreeing. The sub-label deliberately omits the "of 04–09" band for stages
outside 04–09 rather than picking a side; the mapping goes to a design session.

**Closed at wave1 integration — where the line hangs (M1).** R1 places the
sub-label and bands *on the Project section bar*; M1-after draws them inside the
open Project row. Track A shipped them as a free-standing band under the
letterhead, at the deleted mount's position, and left the relocation open because
it crossed two other rulings. Both crossings resolved once tracks A, B, and D were
merged, and **Kody ruled the relocation in**, so it is performed at integration:

`<SectionStageLineMount>` now renders at the head of `<div data-active-section>`
(inside ScheduleNavProvider / RippleProvider, which render no DOM), which is where
every section branch already renders — so the stage line reads as the open
section's own sub-label, exactly as M1-after draws it. No section composition was
restructured.

The two crossings, and what became of them: (1) the mount also rendered
`ContextualHandoffBand`, which R3 dissolves outright — the band's import and all
three of its renders are gone from `section-stage-line-mount.tsx`, and handoffs now
live in the margin rail through `MarginHandoffs` (I116), so nothing needed
splitting; and (2) `stage2-approval-cutover-contract.test.ts` asserted the stage
surface preceded `<ProjectApprovalDocumentMount>` in source order. The relocation
inverts that order, so the assertion is restated rather than dropped: the approval
mount must still lead at the letterhead (after `<MobileMarginChips>`), and
`<SectionStageLineMount>` must now appear inside `data-active-section` and after
it. I113's intent — the approval mount sits at the document head, keyed on
`projects.client_id` — is unchanged and still asserted.

With the placement in-section, the free-standing band chrome went with it: the
`border-y` rule and its `py-4` are removed from both `SectionStageLine` and the
mount's loading and error states. M1-after draws no box around the sub-label — the
section row it sits in already carries the boundary — and a bordered band inside a
bordered row would have doubled the edge.

### I115 · R2 — the gate is a boundary ceremony, and SCOPE ships without a migration (ratified R2)

`project-approval-document.tsx` is restaged from a form into M2's six-part anatomy
— ARTIFACT / QUESTION / SCOPE / IMPACT / AUTHORITY / CONFIRMATION, and no seventh
part. A new `approvals/gate-anatomy.tsx` owns the primitives: `GateCeremony`,
`GatePartBlock` (read-only), `GateFieldset` (authoring), `ArtifactEdges`,
`GateQuestion`, `GatePlain`, `GateImpact`. Both authoring flows — the composer and
the superseding request — now run through the same six parts in the same order, so
the shape a designer fills in is the shape the client reads.

Each approval row renders one of two states. **State A** unfolds the ceremony in
place. **State B** collapses to a seal: the artifact name, the edition that
settled (`Edition N · frozen at publish · proof …` — a settled gate must say
*which* edition settled, or the seal is unfalsifiable), one settled line, and the
stamp — "Approved · <date>" in mocha for the approved case. That settled line is
the author's scope note when one was written and the structural binding otherwise,
following M2's State B, which shows scope prose ("Main floor released · 3 rooms ·
study excluded") rather than the binding. The superseded predecessor is linked
under the seal ("Edition 2 superseded — view") as an in-place focus of the
predecessor row, never a navigation; M2's note that "nothing between State A and
State B is a navigation" is honoured literally.

**Sealed means settled, not merely answered.** `changes_requested` and
`needs_discussion` are *bounced* gates: the client has spoken, but the question is
still live and the same component still marks those rows the current leaf
(`data-project-approval-current-leaf`). Collapsing them to a seal would have hidden
the question and its impact from the designer who has to act on them, and would
have contradicted this component's own leaf marking. Sealed is therefore
`disposition !== 'active' || outcome === 'approved'` — approved, withdrawn, or
superseded. A bounced gate keeps the full anatomy open, with CONFIRMATION stating
the outcome and its date and offering the superseding act.

**The SCOPE decision: no migration. SCOPE renders from the structured binding.**
The deck argues SCOPE "has no dedicated field today, only a free-text context line
doing the job by convention", and calls that one field "the whole of what this
ceremony asks of the schema". We did not add it, and the reasoning is a risk
judgement rather than a design one:

- A `scope_note` column is additive, but *reaching* it is not.
  `create_project_approval_decision`, `supersede_project_approval_decision`,
  `get_project_decision_reviews`, `get_project_decision_review`, and
  `list_my_project_decision_reviews` would each need restating — and whole-body RPC
  restatement is precisely the failure mode the engineering review names as the
  stack's highest risk (§2.1: 00436 already restates eleven main-installed bodies,
  and `_apply_client_decision_authorized` has been restated three times).
- 00445 is the tip of a stack with **zero verification run against it** (§2.3) and
  no wired way to run one; a migration 00446 would land on an unreplayed
  foundation, and this worktree does not own the local replay.
- There is an honest smaller option, so the migration is not forced.

That option: a decision binds **exactly one project phase**, and that binding is
structured, server-validated evidence — it is the real answer to "what does this
release". SCOPE therefore renders `Bound to <phase> — the sole phase this decision
releases.` as the scope of record, with the author's free-text note shown beneath
it, verbatim, **only when one was written**.

The copy asserts singularity in **one direction only, because only one direction is
true**. The server enforces that this decision binds one phase; it does not follow
that the phase has one decision — supersession chains stack editions against the
same phase, and parallel gates may too. An earlier draft of this line read "No other
phase is bound to this decision", which reads as mutual exclusivity and would have
been false the moment a second gate opened on the same phase. `gateScope()` in
`project-approval-model.ts` returns the two separately so the structural claim is
never confused with the author's prose, and the composer's field is relabelled from
"Context (optional, not an approval response)" to **"Scope note"** with the
placeholder "What this releases, and what it does not." Nothing is fabricated: when
no note exists, none is drawn. **The dedicated field remains the right long-term
answer** and should be minted with the next migration wave that already has to
restate those RPCs — not on top of an unverified stack for a rendering win.

Three further interpretations, recorded because the mockup is ambiguous:

**(a) The part labels ship in the authoring flow, not in the read-only ceremony.**
M2's figcap says "the annotations in the left margin are pedagogical, for this deck
only. They do not ship." The left margin holds both the part name and its italic
gloss. We read the gloss as unambiguously pedagogical and cut it entirely. The
names we split: a `<fieldset>` must have a `<legend>`, so the authoring flow wears
ARTIFACT/QUESTION/SCOPE/IMPACT/AUTHORITY/CONFIRMATION visibly; the settled-facing
State A ceremony drops the label column and separates its parts by typography and
order alone, keeping the names as accessible group labels so the anatomy still
reaches assistive technology. Both readings of the figcap are defensible; this one
makes the deck's two sentences simultaneously true.

**(b) AUTHORITY names the lead; the stamp does not.** M2 writes "Decision lead —
Marta Chen · frozen at publish" in the AUTHORITY part and "Approved · M. Chen ·
May 12" on the stamp. The contract's restriction is narrower than it first looks:
"Internal reviewer identities are not exposed to **clients**" protects the studio's
reviewer set on client surfaces — it says nothing about showing the designer the
household's own name in the designer portal, which `row.client_name` already
supplies to LetterheadInstruments on the same page. AUTHORITY therefore names the
lead on all three gate surfaces (composer, live leaf, superseding request), with a
role phrase — "the designated project client" — when no name is available. The
stamp keeps outcome + date only: it is a settlement mark, not a second place to
re-state authority, and duplicating the name there buys nothing.

**(c) Due date sits under CONFIRMATION.** It is an attribute of the act of putting
the question in the client's court, not a seventh part; IMPACT stays the three
signed deltas only.

IMPACT copy now follows M2 rather than the raw cents dump it replaced:
`formatGateImpact()` renders "+$4,200 · +6 days · lead time unchanged" — signed, in
dollars, and stating "unchanged" for a zero delta rather than hiding it, because a
stored zero is evidence. CONFIRMATION's act is renamed "Publish" → **"Publish for
approval"** per M2; its review-count gate, the completed-phase notice, withdraw,
and supersede all keep their existing predicates untouched.

D4 holds: the artifact's depth is two flat offset sheets over `--doc-sheet-3` /
`--doc-sheet-2` / `--doc-paper`, and both new suites assert the rendered markup
matches no `/shadow/`. Every metadata string in both surfaces sits at or above the
12px floor (`--type-metadata-min`), so the mockups' 8.5–10.5px miniature sizes do
not ship.


## The Document — handoffs, overdue, the guide, and the Desk key to one gate (WP3 Track B) — 2026-08-11

Four ratified rulings, implemented together because they are one idea read at
four scales: a gate is a party, a set of terms, a due moment, and one act.

### I116 · The handoff band dissolves; the margin already is the band (ratified R3)

`contextual-handoff-band.tsx` and its test are deleted, and
`workflow-stage-document-mount.tsx` no longer mounts anything in their place.
Every row the 00442/00443 projection produces is, by definition, a thing
waiting on a named party — which is the definition of a margin item — so each
one now renders in the rail through `margin-handoff-item.tsx`, leading the
raised items because a thing waiting on someone else outranks the studio's own
notes.

**The projection is kept whole.** `use-project-contextual-handoffs.ts` is
untouched; the new item reads it and never re-resolves sender, recipient,
owner, or provenance for itself. What came off is register, not fact: the
artifact checksum, the "Exact phase / Source domain" attribution, and the
`nudgeSent` / `dueReminderSent` booleans no longer appear on a designer-facing
surface. Stage provenance survives as microtext
(`Stage 06 · Design Development · FF&E · edition 3`), read from
`RESIDENTIAL_WORKFLOW_STAGES` — the band's local `STAGE_LABELS` map, which
disagreed with the canonical titles on all eleven stages (the wave1 review's
§2.9), dies with the band.

**One act per item, and the four acts keep their names and their 1:1 mutations.**
`nudge` → `useNudgeSiteRequest`, `approve` → `useApproveSiteRequestItem`,
`redo` → `useRequestSiteRequestRedo`, `close` → `useCloseSiteRequest`. The
acts that need their own terms (a nudge note, a redo note, a room for an
approval) unfold the item and collect them there, so the face of the margin
still carries exactly one act. A fifth disposition, `open`, carries no mutation
of its own: it hands publishing and outcome selection to the Stage-2 approval
ceremony, which owns them (I113).

**The lane reads who must act, not who the row is addressed to.** For an
approval the lane derives from `expectedResponse`, not `responsibility.recipient`.
The two disagree on one real state: a draft whose confirmations are incomplete is
addressed to the client (`recipient = 'client'`, 00442) while the act it waits on
is the studio's own `confirm_artifact_review`. Reading `recipient` there had the
margin claim "With Marta" for work Marta cannot do. **The projection's own
`recipient` for that state is arguably wrong and is NOT changed here** — the
projection stays byte-identical; this is the reader's override. Correcting it at
source is a question for Kody.

**An act with nothing listening is not offered.** The `open` disposition
dispatches a window event the Stage-2 ceremony listens for, and that ceremony
mounts only when `engagement_kind === 'project'`. A proposal-kind engagement
carrying a `project_id` would otherwise render a button that silently does
nothing, so the item withholds the act (keeping the gate's sentence) when the
ceremony is not mounted.

**The approval lane gained a real nudge.** The projection reports a
project-approval handoff's `sourceId` as the `client_decisions` row id
(00442 line 36, `decision.id AS source_id`), so the item's nudge rides
`useSendDecisionReminder` — the reminder RPC the decision rail already owns —
rather than inventing one. Before this, an approval handoff had no studio act
at all except navigation.

**Two mockup divergences, declared.** M3's after-panel prints the elapsed time
in the need line ("With Marta · Direction approval · 6 days") *and* an "Overdue ·
6 days" stamp beside it; the item prints it once, in the stamp, because the same
count twice on one row is a restatement, not a hierarchy. And M3 labels a
sent/in-progress Site Request "Open" while its guide sentence offers "Nudge" —
the item says **Nudge** at both scales, because one gate may not wear two verbs
(see I118's shared-verb rule).

**Metadata sits at the 12px floor.** The item does not reuse `MItemContent`,
whose kind line is 8px and detail 10.5px; mockup M4's shipped-size note pins
the portal's 12px metadata floor, and the item carries its own type layers to
hold it. The rest of the margin's grammar is unchanged, so `MItemContent`'s
sizes are a **standing divergence, not a decision** — whether the whole margin
should rise to the floor is a design question and is not answered here.

### I117 · Overdue is one derivation with three renderings (ratified R4)

`overdue-condition.ts` is the only place the overdue fact is computed. It
imports nothing, exports exactly a derivation and three pure readings of it,
and stores nothing:

1. **the margin item's terracotta stamp** — `overdueStampLabel` → "Overdue · 6 days";
2. **the guide's sentence** — `overdueElapsedPhrase`, which changes the
   sentence's tense from what is pending to how long it has been pending;
3. **the Desk's order** — which already did what the ruling asks, and needed no
   code at all.

**Correction of record: the Desk re-sort was written, proved inert, and removed.**
A leading `overdueSortTier` was added to `needSortKey` and then taken out when
review asked for a test proving an order the old key would not produce. There is
none: `overdue_decision` is both the only need with `urgent: true` and
`NEED_RANK` 0, so an overdue folio already sorted above every other folio, and
ties already broke on `earliest_overdue_due`. Worse, the new tier was *harmful* —
`deriveOverdue` answers NOT_OVERDUE when `earliest_overdue_due` is null, which
demoted a genuinely-needed folio below every non-gate one. The tier is gone and
`desk-overdue-order.test.ts` pins the pre-existing ordering, including that
null-due case. `DeskFolder.overdue` remains, read by the Studio Pulse sentence.

Position is the whole of the pressure. The folio gains no count, no colour
change, and no second act; the module has no surface through which a badge, a
banner, a push, an auto-approval, or a modal could be added, and a test asserts
its export list to keep it that way.

**The server can withhold the condition but never assert it early.**
`deriveOverdue(dueAt, now, serverOverdue)` takes the projection's own answer
where one exists, so a stale client clock cannot invent an overdue item; a
`false` from the server wins, and a `true` on a date that has not arrived does
not. Bare `DATE` values parse as local midnight, or the elapsed count slips a
day in negative-offset zones.

### I118 · The guide's act derives from the nearest open gate (ratified R5)

`deriveDocumentGuide` gains one input, `gate`, and one branch. Precedence is
now: availability → paused → **gate** → operational need → proposal lifecycle →
stage copy. An open gate IS the project's current state, so nothing else gets
to decide what the strip says; a paused project still outranks it, because a
gate cannot resume lifecycle work.

The branch is keyed by `canonical_stage_key`: the eyebrow is the canonical
stage title, the headline is `gateSentence`, and the act is `gateActionLabel`
("Nudge Marta", "Publish the Direction approval"). Three WP1 contracts are
held, not bent:

- **`withInputs()` never overrides a branch's action** (I111 §1). The gate
  branch resolves to `actionable` or `waiting`, never `needs_input`, so the
  input-derived act cannot displace it; the top input still rides along.
- **The act names a mounted control** (I110). `handoffAnchorId(sourceId)` is
  published by the margin item's own act button, and the guide's destination is
  an ordinary `anchor` — no new destination variant, and no invented surface.
- **The guide never activates what it names.** The destination omits
  `activate`, so the gate act scrolls and focuses but cannot toggle an item the
  designer already opened. This is the same hazard I111 §6 closed for
  `pulse_due`, avoided here by not arming it at all.

**One gate, one verb.** `gateActVerb` is the single source of the act's word:
the margin prints the verb alone ("Nudge"), the guide prints the verb plus its
object ("Nudge Marta"). Before this they were written twice and drifted — the
margin said "Open" on a Site Request whose guide said "Nudge Hale Joinery". A
test asserts the guide's label begins with the margin's verb for every state.

**Correction to the sentinel claim.** An earlier draft of this entry said
`undefined` and `null` "keep meaning different things, per I111 §4". In the code
they do not: `if (gate)` sends both to the same fall-through. The distinction
I111 §4 draws is real for `operationalNeed`, where `null` suppresses a *local
re-derivation* the row could otherwise produce. A gate has no local derivation to
suppress — the row alone can say nothing about a gate — so "not yet answered" and
"answered, none open" have the same consequence here, and the input keeps both
spellings only to read consistently beside `operationalNeed`.

**The act is reachable at the drawer breakpoint, and not below it.** Between
1180px and 1440px the margin is a closed, `inert` sheet, so focusing an anchor
inside it was a silent no-op; `jumpToSection` now raises the margin
(`OPEN_MARGIN_EVENT`) before the focus frame. **Below 1180px it remains
unreachable**: the rail is `display:none` there and the mobile handoff chips
(I116) are summary-only, carrying no act. `document-pulse-control-desktop` has
the identical pre-existing defect at both breakpoints and is untouched. Mobile
handoff acts are unbuilt work, not a regression.

### I119 · The Desk's gate keying is NOT delivered; Studio Pulse gets one sentence (ratified R6)

**R6 is delivered in part, and the shortfall is the point of this entry.**

**Folio need lines are NOT gate-keyed.** A first implementation printed a
gate sentence on the folio — "Marta's Direction approval has waited 6 days." —
composed from `client_name`, `active_section`, and the elapsed days. Review
found it to be fiction dressed as precision: the underlying fact is
`overdue_decision_count`, a **count of overdue decisions**, and the sentence
invented a possessive party, a singular artifact named after the document's
section, and an implied single gate. A folio with three overdue decisions in the
Proposal section would have read "Marta's proposal has waited 9 days." It has
been reverted in full. **Folios print `need.text` unchanged**, which is
truthful: "1 decision overdue — oldest due May 6".

**What blocks the real thing is data, not presentation.** `document_state`
carries no `canonical_stage_key` (00434 added it to `project_phases` /
`proposal_phases` only), and `get_project_contextual_handoffs` is per-project, so
a Desk-wide read has no gate to key to. Delivering R6's need lines needs a
**Desk-scoped gate projection** — a question for Kody, not something the
presentation layer can synthesise. `deskGateSentence` and its `SECTION_TERMS`
map are deleted rather than left dormant.

**Studio Pulse gains exactly one aggregate sentence** — "1 decision is overdue,
and 2 pieces are on the way." — rendered once, carrying no act and no badge. Two
corrections from review: it says **"on the way"**, the Desk's own word for an
in-flight piece (`deriveMotion`), where a draft said "in production" and claimed
a fabrication state the read model never reports; and it **drops the folio
count**, which the "Needs your hand" eyebrow already states.

The disclosure's existing count-and-preview line is left alone, and its four
populations keep their own hooks, flags, errors, and deep links. **The deck says
the sentence "replaces the pulse panel"; this implements it as an addition**,
because dismantling four independently-owned populations is a larger change than
the ruling's text authorizes. Whether the panel beneath the sentence should go is
a design question that goes back to the session.

The 2–4 folio ceiling is untouched: `partitionDesk` still returns every folder,
and the preview limit remains the renderer's decision.

## The client's side of the gate — 2026-08-11

### I120 · Ruling VIII's ceremony lands in `project-approval-review.tsx` (ratified R8)

WP3 Track D implements Ruling VIII / mockup M8 (`the-workflow-alignment-
proposal.html`, folio 13) in the client portal only:
`apps/client-portal/src/components/approvals/project-approval-review.tsx`. The
three outcomes and their copy (`approved` / `changes_requested` /
`needs_discussion`) are unchanged, verbatim, per the ruling's own instruction
to "keep Codex's three outcomes and their copy verbatim, add the ceremony,
import none of the pressure."

The six-part gate anatomy (Ruling II, folio 08 — Artifact, Question, Scope,
Impact, Authority, Confirmation) now renders explicitly at client scale, each
part labeled and wrapped in its own `data-testid`. Five parts already existed
in `ProjectApprovalReview` field-for-field; **Scope renders `context`** — the
free-text field the designer's side also uses "by convention" per the same
ruling, since no dedicated scope field exists in the schema. Artifact carries
the new dynamic immutability sentence, "You are approving edition {N}, exactly
as shown." Authority reuses the pre-existing "designated decision lead
review" confirm step (unchanged behavior) under its anatomy label.
Confirmation is the existing outcomes fieldset and submit act, restyled onto
`ScoredAction` (`@/components/making/scored-action`, the client portal's own
port of the Scored Ink grammar — no `@patina/*` package owns it yet) so the
final act scores on the inner label span, never the 44px hit-box, per repo
convention.

Two new client-scale devices, both new local components
(`apps/client-portal/src/components/approvals/gate-stamp.tsx`, `GateStamp`),
follow the existing inspection-tag stamp grammar already shipped in
`making/tracking-row.tsx`'s `StatusStamp` — doubled border, ink-only color, no
shadow: a **seal** that settles in on `outcome === 'approved'` (a short
scale/opacity keyframe, guarded under `prefers-reduced-motion` the same way
`patina-strata-wash` already is in `globals.css`), and a **HELD FOR
DISCUSSION** stamp on `outcome === 'needs_discussion'`, drawn as loud as the
seal per M8's own note that a holding gate must never read as a soft
approval. Its wording matches the stamp exactly — "Recorded outcome: Held for
discussion," not the outcome picker's "Needs discussion" label — corrected on
review (F11): a sighted reader and a screen-reader announcement must not
disagree on the word for the same held gate, even though "Needs discussion"
stays the outcome picker's own verbatim copy.

**Corrected on review (F3):** the Impact section's Cost/Schedule/Lead-time
`dt` labels shipped on `type-meta-small` (≈10px), under this ceremony's own
≥12px metadata floor — the floor this entry already claimed for Due and the
checksum. All three now render on `type-meta` (12px), matching every other
anatomy-part label.

**Removed, per the ruling's explicit instruction, from all four client
surfaces that read `ProjectApprovalReview.isOverdue`** — not just
`project-approval-review.tsx`: the shipped client-side terracotta "Overdue"
indicator. Adversarial review (F2) caught that the first pass only fixed the
review page; the other three surfaces derive attention/status text from the
same field and all carried the same device:
`lib/client-attention.ts:67`'s `projectApprovalAttentionLabel` (the
`if (approval.isOverdue) return 'Overdue'` branch is gone; overdue and
on-time now both fall through to `'Response required'`),
`components/approvals/project-approval-summary.tsx:44-47` (the
`" · Overdue"` suffix on the status line), and `components/making/
the-making.tsx`'s `ProjectApprovalGate` (:298) and `DeferredProjectApprovals`
(:365) (` · Overdue` suffixes on the gate line and the deferred-work list
item). Overdue is the studio's condition, computed and rendered only on the
three studio surfaces of folio 10 — a client who finds a paper counting days
against them is a client who stops opening the paper. `isOverdue` stays on
the `ProjectApprovalReview` type (unchanged; this is a UI-only ruling) but no
client surface reads it toward client-facing copy anymore. The legacy
`ClientDecision` surfaces (`app/decisions/page.tsx`'s "Overdue (N)",
`decision-card-client.tsx`) are a different, older system and were left
untouched — Kody is being looped in on those separately.

**Mockup ambiguities interpreted, not ruled:**
- M8's state A omits the due date and checksum entirely for visual clarity.
  Kept both — checksum is integrity evidence and the due date is exactly what
  should remain once "Overdue" is gone (a plain date, no elapsed-time
  judgment).
- M8's static plate shows a single "Approve" act beneath the outcomes list.
  The live surface keeps the generic "Submit response" label regardless of
  which outcome is selected — renaming it to "Approve" would misdescribe the
  act when Changes requested or Needs discussion is chosen.

**Corrected on review (F5):** the first pass approximated the mockup's gold
hold-border with the existing `--color-clay` token — clay is the app's
primary CTA accent, the wrong read for a stamp that means "nothing is
released." `--color-gold: #E8C547` (the mockup's own `--gold` value, exact)
is now added to `client-portal/globals.css`, scoped to this one caller, with
the hold stamp's text set to `--color-charcoal` — matching the mockup's
`.s-hold{border-color:var(--gold);color:var(--char)}` precisely. The seal
stays `--color-mocha` border and text, matching `.s-seal` precisely.

Ruling IX (the co-approver) is unaffected — it ships in schema only
(`requiredCoapproverId`, always `null`) and this change does not render it.
**R9 verification, precise claim:** a repo-wide grep for
`co_approver`/`coApprover` (migrations, tests, docs/ADRs, generated
`database.types.ts`, `@patina/supabase` types, and every app) found exactly
one non-schema, non-test consumer —
`apps/designer-portal/src/components/document/approvals/project-approval-
document.tsx:131`, which reads `authority.requiredCoapproverId === null` as
one term of a boolean gate (`canRequestSignOff`). It renders no co-approver
identity, count, or state — the value only steers whether a sign-off act is
offered. No surface, in this repo, renders the co-approver's identity or
status to a screen. Findings reported to the dispatching session; nothing
fixed under this ticket (designer-portal is out of scope for WP3 Track D).

*Entries add: I114–I120 · last id = I120*

### I121 · R7's lifecycle is ONE contract read by TWO rails (WP4 checkpoint ruling)

The fifteen steps, the three gates, and the shape of a reading live in
`packages/types/src/procurement-lifecycle.ts`, not in the portal that happens to
render them first. Two rails answer the same contract: the studio's own
procurement (`purchase_orders` and friends) maps in
`apps/designer-portal/src/lib/document/procurement-lifecycle.ts`; the Patina
fulfilment ledger (`fulfillment_*`) maps in the types package itself, so the
admin portal can import it in Track 3 without depending on the designer portal.

Unifying was the ruling, and it is load-bearing rather than tidy. The two rails
carry genuinely different facts — Rail A has an ordered `line_state` chain and
no inputs-complete fact; Rail B has dated PO columns and no closure fact — and
the whole value of R7 is that a designer reads the same fifteen words whichever
book the line came from. A second vocabulary would have re-created the problem
"Ordered" already caused.

**The one-live-step invariant lives in the shared assembler**
(`assembleProcurementReading`), not in either mapper, so neither rail can break
it. The live step is the highest-ordinal evidenced step, and it is live unless
it is terminal (step 15), in which case nothing is live and the trail has
closed. A rail mapper's only job is to say what it found; it does not get to
decide what is current.

**The reading is total.** All fifteen steps and all three gates come back every
time, in order, including the ones with nothing behind them. The future is part
of the reading — that is what makes it visible and empty rather than absent.

### I122 · The lifecycle is rendering grammar; the five missing facts are a docket, not a build (№8)

Kody ruled at the WP4 design checkpoint: **zero new schema, and one migration is
not authorized.** The trail draws what the orders book already knows.

Five steps have no fact on the studio rail today — 04 Awaiting inputs,
07 Ready to ship, 11 Stored, 12 Install released, 14/15 Punch·Closed. They are
not inferred from a neighbour, not defaulted, and not blocking. (Review added
two more entries to the docket: step 08 renders but is UNDATED because no
departure fact exists, and Rail B has no returns concept at all — mapping
§5.7–5.8.) This forced the
one genuinely new idea in the contract: **`no-record` is a distinct state from
`future`.** A step behind the trail's position with nothing behind it reads
"no record" in quiet, unstamped microcopy; a step ahead of the position reads
dashed-outline and empty. Collapsing the two would have been the fiction the
ruling exists to prevent — "we never wrote this down" is not "this has not
happened yet", and a trail that cannot tell them apart is exactly the thing
"Ordered" was.

The same rule governs steps that DO have facts: **steps do not imply one another
on Rail B.** A delivered line whose PO was never marked sent reads step 02 as
`no-record`. Rail A's chain is ordered and is the deliberate exception, and even
there the implied steps settle *undated* rather than borrowing a date they do
not have.

What each missing fact would cost is priced in
`docs/design/workflow-alignment/wp4-lifecycle-mapping.md` §5 as a future data
wave, sequenced cheapest-and-highest-value first (07, then 04, then 11→12 as the
pair that unlocks gate G3, then 14/15). **None of it is authorized by this
track**, and the trail renders honestly without any of it.

One select was extended — `useProjectFFEItems` now also fetches
`purchase_orders.delivered_date`, the nested `po_payments`, and
`damage_claims.created_at`. Every column already existed; without them steps 01,
09 and 10 could not be evidenced at all. That is fetching, not schema.

### I123 · The three gates are derived OPERATIONAL seals, not client ceremonies (ratified)

R2's gate anatomy is a boundary ceremony a person performs. R7's three
sub-seals are not that, and conflating them would have put a client act in the
middle of a purchase order. **No `client_decisions` row is consulted, no client
act settles one, and no gate here is authored by anybody** — each is a predicate
over facts the book already holds:

- **G1 Complete to produce** — `acknowledged_at` set AND every deposit-kind
  `po_payments` row `paid`. **A PO with no deposit rows settles it vacuously**,
  which is the ratified reading: absent terms are not unmet terms — but not for
  a `draft` order, which is a document being written, so an unwritten order is
  never promoted to "Cleared to produce" and the orders book keeps saying
  "draft" out loud. A **`cancelled` order evidences nothing at all** — not step
  01, not its send date, not a delivery — exactly as on Rail A: the order was
  withdrawn, so the trail reports no position rather than leaving the work
  standing where it stopped. The gate's qualifier names the term that actually
  holds it open, so uncleared terms come first (`terms outstanding`) and the
  acknowledgment is the fallback.
- **G2 Received and dispositioned** — an inspection logged, the count not short,
  and no `drafted` / `vendor_notified` claim on the line. `receiving_inspections`
  is PO-grain with no FF&E link, so the item-grain traces are `delivered_date`
  and the claims. **"Inspection logged" is `delivered_date`, NOT the count**:
  00150 stamps the date on the first inspection row whatever its outcome, while
  00184 writes `received_quantity` only on a *clean* one — reading the count
  would have reported every damaged receipt as never inspected. The count
  governs one term only, whether everything ordered turned up.
- **G3 Warehouse + site ready** — **no fact exists on either rail.** It is drawn,
  and it is drawn empty, and it is marked `sealable: false` so it is never named
  as somewhere the work is heading. A gate that can never pass is still worth
  drawing, because its emptiness is the honest report on §5.3 — but promising a
  stop that will never come is its own small lie.

**A gate seals by position AND terms, in that order.** Terms satisfied at a
place the trail has not arrived at is not a seal; it reads `unreached`. This
forced a fifth reading, `passed-unsealed`: work that moved BEYOND a gate whose
terms were never evidenced. It renders quiet — no oak stop bar, no qualifier —
because an installed credenza whose PO was never acknowledged has a missing
signature, not a blockage, and drawing a stop under finished work would be a lie
about the present.

The counterweight is `holdsOpen`. A term that is a **live condition** — an
unresolved claim, a short receipt, uncleared order terms — keeps its gate `open`
even once the trail's position has moved past it
(a claim evidences step 10, which sits past G2, so position alone would have
silenced the loudest fact about a receipt). The distinction is the whole design:
*a live stop stops; an unrecorded seal goes quiet.*

An inspection nobody logged is deliberately NOT such a condition: it is a
missing record, and by the argument above a missing record goes quiet. A line
installed months ago whose receipt was never written down reads
`passed-unsealed`, not blocked; while the work is still standing at the gate,
position alone keeps it open.

An open gate names the term holding it — the qualifier is read off the unmet
predicate, never written by hand, and G2's ladder puts `open claim` above
`short receipt` above `awaiting inspection`.

**Steps 01 and 08 render undated.** The only date the clearing could carry is
`po_payments.paid_date`, and a payment date IS a payment fact — putting it
beside "Cleared to produce" would render money on the glass while №7 is open.
The step says the work is cleared, not when anybody paid. **The date returns if
№7 settles.** The `source` string still names `po_payments`, because it is an
internal audit trail and is never rendered.

**"Next gate" is a position, not a to-do list**: the first unsettled, sealable
gate at or ahead of the live step. A gate the work has already gone past is
never next, however it ended up, and when nothing remains ahead the ledger
renders "—" rather than reaching backwards for something to say.

**Commercial guard (№7, still open).** The step names ARE the lexicon and ship
verbatim — "Cleared to produce", never "Authorized"; "Released to maker", never
"PO issued". Internal enum values and PO entity names are untouched. Nothing
these gates read is rendered as a payment surface, a balance, or a funds-held
indicator; G1 reads deposit rows and renders the word "deposit" only as the term
holding a gate open. A test asserts no rendered trail copy matches
`authoriz|PO issued|purchase authorized`.

**Renderings.** The line unfold gets the full numbered trail
(`procurement-trail.tsx`): settled stamped, live in clay, future dashed-outline
and empty, `no-record` quiet with microcopy, gates as full-width interrupting
bars taking an oak left border only when `open` or `settled`. The trail is for
GOODS: it never mounts on a trade/service line, and on a furnishings line only
once there is something to read (a linked PO or an evidenced step) — no
eighteen-row empty scaffold under a line nobody has ordered. The orders book
gets the same grammar at ledger density through its own PO-grain entry point —
the row's Stamp becomes the lifecycle *position* rather than the status word,
plus "Next gate" and "Expected"; **the fifteen steps never enumerate at ledger
density.** "Expected" is a *shipment* expectation only (`confirmed_eta`): a
payment due date must never appear in a column about goods, and R18's
unscheduled "NO DATE" mark survives untouched. Zero shadows. All trail type
≥12px — M7's miniature stamps are a plate device and do not ship, so the shared
`Stamp` gained a `size` prop (`xs` = the historical 10px default, unchanged
everywhere; `sm` = 12px) and both new surfaces hold one floor with one
component.

**Interpretations surfaced, not ruled** (full list in the mapping doc §6): the
ledger keeps PO grain rather than re-graining to M7's line-grain plate, and G2
cannot settle there because disposition is item-level;
`purchase_orders.last_status_change_at` does not exist, so steps 05/06 date from
the item's column; and **step 08 renders undated**, because `confirmed_eta` is a
guess about arrival rather than a record of departure — the missing departure
fact (carrier, tracking, actual ship date) joins returns/RMA in the №8 docket at
mapping §5.7–5.8. One consequence worth stating: because step 04 has no fact,
G1 can never read `open` from a missing acknowledgment alone — the trail cannot
stand at position 4. M7's "Awaiting inputs · Complete to produce · COM open" row
is unreachable until §5.1 is built, and the trail renders honestly without it
rather than faking the step.

### I124 · WP4 Track 3 — Rail A's own operator surfaces adopt the R7 grammar (admin portal, additive)

The Back-of-House fulfillment surfaces (`apps/admin-portal/.../fulfillment`)
now read `deriveFulfillmentLifecycle` (`@patina/types`, unchanged — Track 1
owns the contract and it was frozen for this track) in two places, neither of
which changes a schema, a route, or a byte of fulfillment logic.

**Line detail — the Order Workbench's vendor PO cards.** Each `PoLine`
(`po-draft-card.tsx`) carries a collapsed "Lifecycle" `<details>` disclosure
that reveals the full numbered trail for that one line, derived from its own
`lineState`. It sits OUTSIDE the draggable row's ref (dnd-kit's pointer
listeners live on the row div alone), so opening the disclosure can never be
mistaken for a drag gesture. Rail A's off-trail rule is enforced at the call
site, not just in the mapper: a `cancelled` line renders its operational word
("Cancelled — no trail position") and the trail component is never invoked at
all — no reading is derived, let alone stamped.

**Queue rows — the additive glance.** `derived_status` on
`fulfillment_queue_v` (00353) is not a new fact to feed the mapper; it is
*literally* the same order-items `line_state` chain value at the order's MIN
stage that the row's existing stage dots and next-action verb already read.
Feeding it to `deriveFulfillmentLifecycle` alongside `stage_entered_at`
therefore reads no fact the row didn't already carry — it just asks the
fifteen-step contract to say what position that fact represents. The result
(a 12px current-position stamp + `nextGate`) is appended to the row's existing
meta line, after the vendor/designer/unmapped/exception chips — additive,
never replacing the operational verb or the derived_status word, per the
checkpoint's unified-contract ruling that BOH operators keep their working
vocabulary. `derived_status` is not ALWAYS a chain word, though: 00353's view
overrides it to `needs_mapping` (any unmapped line) or `exception` (any open
exception) BEFORE the chain fallback — exactly the queue's highest-priority
band, Needs Action Now. Neither override is a chain state, so the glance
renders nothing there; that is the honest answer, not a gap — an order
sitting on an unmapped line or an open exception isn't progressing through
the chain at all, there is no single position left to stamp, and the row's
own unmapped/exception chips already carry the signal a glance would only
repeat.

**Component sharing, decided against.** `ProcurementTrail` is duplicated
locally at `apps/admin-portal/.../fulfillment/shared/procurement-trail.tsx`
rather than imported from the designer portal's `procurement-trail.tsx`. The
two portals share no components package, and the piece — three small
subcomponents over the same `@patina/types` shapes — is well under the size
where a new cross-portal dependency would pay for itself. The port keeps M7's
grammar token-substituted, floor enforced (12px minimum everywhere in both new
files, −1.5° rotation stamps, dashed-empty future, quiet no-record microcopy,
oak gate bars only when reached) and substitutes admin-portal's own
`--text-muted` token everywhere the Document reaches for a `--color-quiet-ink`
admin-portal doesn't define. (Adversarial review caught a rem-vs-px drift on
first pass — the trail's own "Lifecycle" header and two of the line-detail's
new strings shipped at 8.8–9.6px; fixed to the 12px floor before merge.) Keep
the two in sync by hand if the contract's rendering grammar changes; nothing
here is a shared import to forget.

**Noted, not made — a contract change that wasn't needed but a data gap that
was found.** The Workbench's `FulfillmentWorkbenchLine` DTO carries `lineState`
but not `line_state_entered_at`, `shipments`, or `exceptions` — the order-detail
API route (`/api/admin/fulfillment/orders/[orderId]`) never selected them,
because nothing before this track needed a line's own dates or shipment/
exception evidence at that grain. The line-detail trail therefore derives a
fully honest but UNDATED reading from `lineState` alone: every settled step
still resolves to the correct state (chain-implied steps read `settled` with
no date, exactly as `deriveFulfillmentLifecycle` already handles for the
chain-derived case), but no step carries an `evidence.at`, and step 10
(Accepted or issue) can never appear because no exception rows are fetched.
Wiring those three columns into the existing route's existing queries would
close the gap — no schema change, no contract change, just wider SELECTs —
and is left for whoever next touches that route, since "no fulfillment-logic
changes" this track kept to strictly meant not touching the API layer at all.

## WP4 Track 2 — the "Ordered" retirement sweep — 2026-08-12

### I125 · Rendered FF&E stage labels drop the commercial-claim register (ratified — deck folio 12/14)

Kody's ruling: one sweep, every surface, rendered labels only — internal enum
values, DB values, and PO entity names untouched. Replacement labels are the
lifecycle step names, actor-neutral, per the deck: `ordered` → **"Released to
maker"** · `shipped` → **"In transit"** · `delivered` → **"Received"** ·
`production` → **"In production"** (unified — see below) · `installed` →
"Installed" (unchanged) · `specified`/`quoted`/`approved` labels unchanged
(no commercial claim to begin with).

**Corrected on adversarial review:** the first pass of this entry claimed
`production`'s label was "left as-is" / "not changed." That was false — the
same edit that retired `ordered`/`shipped`/`delivered` in
`stages.ts` also changed `production`'s label from "Production" to "In
production" in the same hunk, healing a pre-existing three-way split
(designer-portal said "Production," client-portal's `ffe-status.tsx` said
"In Production" with a capital P, `FFEPipelinePanel.tsx` already said "In
production"). The code change was correct and shipped in the original
commit; only this entry's account of it was wrong. `ffe-status.tsx`'s "In
Production" is now also corrected to "In production" for exact-string
consistency across all three surfaces. Ratified: keep the unification.

The review also caught three rendered misses the original grep pass didn't
catch — status-gated copy and a quoted stage name that don't match the exact
`'Ordered'`/`'Shipped'` string patterns the first sweep grepped for:
- `apps/designer-portal/src/components/document/spec-books/
  spec-book-workspace.tsx` (:473) — a configuration-lock explainer read
  "Ordered and custom promises stay intact; changes begin on a new project
  line." Reworded to "Released lines and their custom promises stay intact;
  changes begin on a new project line." — same meaning, no banned word.
- `apps/designer-portal/src/components/document/po-preview.tsx` (:363) — the
  manual-send button read "Ordered by phone / portal — mark as sent." →
  "Released by phone / portal — mark as sent."
- `apps/designer-portal/src/components/portal/procurement/order-assistant/
  step-details.tsx` (:321) — a deposit-balance note quoted the stage name:
  `item enters "Shipped" stage` → `item enters "In transit" stage`.

Both `spec-book-workspace.tsx` and `po-preview.tsx` live under
`apps/designer-portal/src/components/document/` — the original entry's
account of that directory ("left untouched per the `components/document/`
exclusion") was also wrong as a blanket claim. The real exclusion is six
specific files a sibling track owns: `orders-ledger.tsx`, `line-unfold.tsx`,
`procurement-trail.tsx`, `lib/document/procurement-lifecycle.ts`,
`stamp-derivation.ts`, `use-project-v2.ts` — not the whole directory. The
sweep now correctly covers every other file under `components/document/`,
including these two.

**Sites changed** (four known + six found on sweep, across two passes):
- `apps/designer-portal/src/components/portal/ffe/stages.ts` —
  `STAGE_CONFIG` labels for `ordered`/`production`/`shipped`/`delivered`.
  This is the single source both the per-project FF&E board and the
  Procurement → By Status view read from, so both surfaces pick up the
  change for free.
- `apps/client-portal/src/components/ffe-status.tsx` — `statusLabels`
  (including the `production` capitalization fix, above).
- `apps/client-portal/src/components/commercial/journey-stepper.tsx` —
  `GOODS_JOURNEY_STAGES` (the six-stop client goods journey; consumed
  positionally by `tracking-row.tsx` and `the-making.tsx`, so both update
  with the constant).
- `apps/client-portal/src/components/project/FFEPipelinePanel.tsx` —
  `STATUS_LABEL`.
- `apps/client-portal/src/components/making/tracking-row.tsx` — inline
  `STAGE_PHASE` array comments and a docblock line that quoted the old
  words; not rendered copy, updated for accuracy alongside the constant they
  annotate.
- `packages/supabase/src/hooks/use-procurement.ts` — a doc-comment on
  `purchase_order.created_at` naming the admin "By Status" column it backs;
  updated to match the new label since the column itself already reads from
  `STAGE_CONFIG`.
- `apps/designer-portal/src/components/document/spec-books/
  spec-book-workspace.tsx`, `apps/designer-portal/src/components/document/
  po-preview.tsx`, `apps/designer-portal/src/components/portal/procurement/
  order-assistant/step-details.tsx` — the three review-caught misses above.

Tests updated alongside: `apps/designer-portal/src/components/portal/ffe/
__tests__/stage-select.test.tsx` (option-name query), `apps/client-portal/
src/components/commercial/__tests__/journey-stepper.test.tsx` (`getByText`
assertion), `apps/client-portal/src/components/making/__tests__/
the-making.test.tsx` (`data-journey-stop` assertion). No test asserted the
three review-caught strings verbatim, so no further test edits were needed
for those.

**Left alone, with reasons — a careful grep surfaced a second, unrelated
"Authorized" vocabulary that this ruling does not reach:**
- `apps/designer-portal/src/lib/document/authorization-derivation.ts`,
  `authority-hours.ts`, `project-commerce.ts` (trade-scope section), and
  `apps/client-portal/src/components/commercial-document-shell.tsx`
  ("Authorized furnishings") — all belong to the **Authorized Schedule**
  feature (shipped 2026-08-05): "Authorized" here means the *client has
  signed the instrument*, a design-services/trade-scope authorization
  concept with its own ratified vocabulary, unrelated to an FF&E item's
  procurement stage. `authorization-derivation.ts` is explicitly the second
  stamp track alongside the (out-of-scope) `stamp-derivation.ts`. Renaming
  this would rip out a different, already-shipped feature's language, not
  retire a commercial claim on an FF&E item.
- `apps/admin-portal/src/lib/concierge-stages.ts`, `.../fulfillment/
  workbench/po-draft-column.tsx`, `.../fulfillment/queue/queue-row.tsx`,
  `.../fulfillment/pos/[poId]/page.tsx` ("Delivered and inspected"),
  `packages/fulfillment/src/shipments.ts` — internal Mission Control /
  fulfillment-ops tooling for Patina staff literally tracking PO and freight
  state ("PO Sent," "Freight Booked," "Delivered and inspected," inspection-
  window countdowns). This is a separate `PoState`/`ConciergeStage`
  vocabulary from the FF&E item's `FFEStageKey`; staff need the literal
  operational state, not client-facing lifecycle prose. Adjudicated fine on
  review — not the "commercial claim" register the ruling targets.
- `apps/designer-portal/src/lib/document/feedback.ts` (`shipped: 'Shipped'`)
  — the Feedback layer's own status vocabulary ("this bug report shipped"),
  a software-development-lifecycle sense of "shipped," not FF&E goods.
- `apps/client-portal/src/components/messages/ReadReceipt.tsx` — message
  read/delivered state, an SMS-style receipt, not commercial goods.
- `apps/admin-portal/.../communications/campaigns/[id]/page.tsx` —
  "Delivered"/"Bounced" email-campaign delivery stats.
- `apps/designer-portal/src/components/portal/procurement/order-assistant/
  index.tsx` — "Order placed via Patina …" toast copy after a designer
  completes a PO through the Order Assistant. A one-time confirmation of the
  act, not a persistent stage label, and it does not contain the forbidden
  word "Ordered." "Order Assistant" is this tool's established name.
- `packages/patina-design-system/src/components/Timeline/{Timeline.tsx,
  Timeline.stories.tsx}` — generic component doc/story example data
  ("Order placed", "Shipped", "Delivered"), not live application copy; the
  component is not consumed anywhere in-repo under that prop shape.
- `apps/designer-portal/src/components/document/ffe-section.tsx` — imports
  `STAGE_CONFIG` from `stages.ts` rather than duplicating labels, so it
  inherits the fix without a direct edit.
- `supabase/functions/**` (edge-function email templates, e.g. `_shared/
  po-emails.ts`, `_shared/fulfillment-templates.ts`) — out of the stated
  sweep scope (portals + packages); flagged here as a candidate for a
  follow-up pass if Kody wants the retirement to reach transactional email.

*Entries add: I121–I125 · last id = I125*

## The Document — Direction A: the spine as status organ, progressive fidelity (R107–R114 · O10 O11) — 2026-08-13

Ruled by Kody (interviewed per-ruling, multiple-choice; all eight ratified as
written in the design deck "The Anchor Holds", docs/design/schedule-fidelity/
deck.html; grounding in grounding.md beside it; born from the /doc UX review
"The Book Won't Close", artifacts/doc-ux-review-2026-08-13/). Standing user
rulings behind the deck: Direction A chosen over B/C; scheduling begins as
high-level start/end targets and refines into hard dates as design
progresses; hardening is driven by commitment events, never by asking anyone
to set a date.

### R107 · The fidelity ladder — 2026-08-13
Band / Frame / Committed is the schedule's official vocabulary, derived per
phase from the resolver's existing `source` field. No new column; completed
phases render as record. (R7 precedent: derive over existing data.)

### R108 · The honesty rule — 2026-08-13
No surface renders a date firmer than its source supports. The doc header
chip, the "Week N" sub-label, the section stage line, and the desk chips all
render the resolver's output verbatim — one derivation, many mouths. "Week 2"
exists only downstream of a hard anchor. (The T1 kill.)

### R109 · Ceremonies harden; facts propose; contradictions report — 2026-08-13
Three hardening classes. A ceremony (signature, executed authorization,
install-window booking) writes anchors directly — the confirmation happened
inside the ceremony. An operational fact (PO sent_at, delivered_date) only
prepares a ripple the designer commits in one act. A fact that contradicts an
already-committed anchor never proposes a slide — it raises an R4-discipline
conflict. All writes travel the existing ripple→commit→revision path (R100).

### R110 · Hardening is disclosed at consent — 2026-08-13
A ceremony may harden only if it states its schedule impact in its IMPACT
line (R2 anatomy) before confirmation. If impact cannot be computed, the
ceremony still runs but its hardening downgrades to a proposal. Gates the
ceremony class against quiet widening.

### R111 · The resolver selects; the classifier names — 2026-08-13
Only the resolver selects the active phase. The workflow-stage classifier
loses its right to select and names the stage of the resolver's selection;
the section sub-label becomes stage · position · fidelity. Disagreement
between the two becomes structurally impossible.

### R112 · The install window — 2026-08-13
Install week gets its commitment act: an R2-anatomy boundary ceremony backed
by one narrow `install_windows` table with hold/release RPCs — the package's
only schema request. The date itself remains `anchor_date`; only the evidence
of commitment is new. Copy stays actor-neutral pending №7.

### R113 · Band is a state, not an error — 2026-08-13
An unanchored engagement is a legitimate Band. The leaked machine strings
("NO ACTIVE OR DELAYED PHASE IS CONFIGURED", "2 ACTIVE PHASES NOT CLASSIFIED
TO A CANONICAL STAGE", "…NO TEMPLATE PROVENANCE RECORDED") are removed; an
unanchored spine renders as a band. Setup nudges live in desk need lines,
gate-keyed per R6 — never as error copy in the doc body.

### R114 · The collapse ships first — 2026-08-13
Sequencing: the surface collapse (all mouths read the resolver) lands before
any event wiring, gated on reconciling the I55 flag contradiction and the
R105 comember-widening pass. Legacy dates are never backfilled (I56); they
render as bands. A band honestly rendered beats a fabricated week.

**O10 (open)** — what fidelity a client sees; depends on O8, sharpened by the
install ceremony having a counterparty. **O11 (open)** — whether payment
milestones ever harden a phase; deliberately deferred (I56 A0.3 collision
stands).

Also carried by the deck as named quick fixes, ratified implicitly with
R108/R114: the dead `project?.target_completion` header field (real column is
`projects.target_end_date`) is fixed regardless of sequencing.

*Entries add: R107–R114, O10–O11 · last id = I125*

### I126 · Direction A plan gates cleared — I55 ratified live; four under-determinations blessed — 2026-08-13

**Ruled by Kody (interviewed, with probe data).** Prod probes (PostHog +
Strata, read-only): flag `schedule-spine` (764880) at 100% since 2026-07-16
with 3 distinct true-evaluations in 30 days and exactly 1 composing designer
(14 projects, 59 chained phases, 3 anchors, 13 revisions across 11 projects).

- **I55 resolved — the live state is ratified.** The 100% rollout becomes
  intentional; the flag is vestigial. Wave 1's collapse ships on a new
  `schedule-fidelity` flag, created disabled, design-authority-first (PLAN.md
  §G1.3 stands).
- **Resolver output extension blessed** (PLAN.md under-determination #2):
  `governingAnchorId` + `origin` added to `ResolvedPhase` as derived output
  computed inside the existing passes — the resolver remains the single
  computer of time; it now discloses what it computed. Pinned by tests over
  all eight chain shapes.
- **R111 selection rules blessed as proposed** (#1): active = date window
  containing today (completed excluded; ties main-lane-then-sort_order);
  fallback single in_progress/delayed; else next upcoming; else none.
- **R110 proposal storage blessed as proposed** (#3): the ceremony's
  evidence JSON carries `proposed_anchor`; the desk surfaces it as a
  gate-keyed need line; committing runs the normal ripple→commit path. No
  new table.
- **R112 release semantics ruled** (#4): releasing a confirmed install
  window unpins WITH disclosed impact — release is itself a small ceremony
  that states the impact of removing the anchor and cuts a revision.
  ("Anchors refuse silent movement" reaches releases.)
- **I59 correction**: the `proposal_schedule_milestones` studio-comember leg
  recorded as deliberately omitted was closed by 00401:837-884 (probe-
  confirmed: `is_design_studio_comember` select + `lock_proposal_authored_
  parent` writes + a legacy client select). The R105 comember gate is
  discharged save the `apply_phase_template` residual — one guard site
  (probe-confirmed single occurrence), closed by the planned 00474.

*Entries add: I126 · last id = I126*

### I127 · No fidelity flag — Wave 1 ships unconditional — 2026-08-13

**Ruled by Kody.** The `schedule-fidelity` flag (PLAN.md §G1.3 / Wave 1
gates) is dropped: the platform has no production users, so the collapse
ships 100% GA with no flag gate and no preserved legacy branches — the
WEEK_MS math and the three leaked strings are deleted, not parked behind a
flag. Loading fallbacks stand. Wave 2's `schedule-hardening` and Wave 3's
`install-window` flags are presumptively dropped on the same reasoning —
confirm at wave start rather than assuming a flag posture returns.

*Entries add: I127 · last id = I127*

### I128 · Desk schedule nudge keys on active_section — 2026-08-13

**Ruled by Kody.** Wave 1's `schedule_unconfigured` desk need keys on
`active_section ∈ {project, install}` rather than `canonical_stage_key`.
Rationale: `active_section` is itself the gate-derived document_state
projection; the nudge is setup guidance, not a gate act; and the desk feed
should not re-import the workflow classifier that R111 just stripped of
selection rights. R6's letter ("need lines key to gates") is noted as
narrowed, not eroded — a future gate-keyed need must still route through
the R6 discipline. Pinned by the seven-section test.

*Entries add: I128 · last id = I128*

### I129 · Waves 2–3 start flagless — 2026-08-13

Per I127's confirm-at-wave-start requirement: Kody ordered Waves 2 and 3
delivered with no mention of restoring flags and the platform still has no
production users, so the presumption stands — `schedule-hardening` and
`install-window` flags are dropped. Consequence for Wave 2's off-state
design (PLAN §2.2): ceremony UIs always compute and pass disclosed impact;
the NULL-impact branch remains solely as the R110 downgrade for
uncomputable impact, never as a flag posture.

*Entries add: I129 · last id = I129*

### I130 · Proposals get a table; milestone-anchor kind; actor-side disclosure — 2026-08-13

**Ruled by Kody (storage + edit kind) and design-architecture (disclosure
doctrine), after Wave 2-3 pre-flight verification voided I126's storage
premise** (no evidence JSONB exists on the operational-fact path or on
trade_scope_terms; only the signature rows carry metadata).

- **`schedule_proposals` table** (supersedes I126's evidence-JSON answer):
  narrow table — source event, project, target (phase anchor | milestone
  anchor), proposed date, disclosed context jsonb, state ratchet
  proposed → committed | dismissed. The uniform home for every proposal
  class: operational facts (PO sent, delivered), client-executed-ceremony
  downgrades, and uncomputable-impact downgrades. Desk reads one table.
  Studio-only under RLS (working scaffolding per R101). Wave 2's one
  schema request beside R112's install_windows.
- **`milestone-anchor` edit kind** added to the ripple lib +
  commit_schedule_edit: pins a milestone's anchor_date and clears its
  offset — the exact mirror of milestone-offset-clears-anchor. Needed for
  trade-scope acceptance → thread-completion milestone.
- **Actor-side disclosure doctrine** (resolves pre-flight blockers on
  gate-anatomy non-use and the client-portal execute act): R110's IMPACT
  disclosure renders as a labeled IMPACT block inside the existing bespoke
  DocSheet ceremony sheets (the R2 anatomy's vocabulary, not necessarily
  its component). Ceremony RPCs gain an optional `p_disclosed_impact`
  param: studio-side acts (countersign, record-on-paper, trade engage)
  compute the ripple diff pre-confirmation and pass it → direct hardening;
  client-executed digital acts (furnishings execute, trade accept) pass
  nothing → the NULL branch writes a schedule_proposals row, never an
  anchor — the R110 downgrade by construction, no client-portal changes,
  O10 untouched. When O10 resolves, client-side disclosure can upgrade
  those paths to direct hardening.
- **Graft-target corrections** (pre-flight, binding on 00475):
  countersign logic lives at `_countersign_design_services_agreement_impl`
  (renamed by 00462; body authored 00414:704) — the 00462 capability
  wrapper is untouched; `_execute_trade_scope_authorized` head is
  00424:930 (not 00423); furnishings needs BOTH bodies re-cut (00422:1120
  and the independent on-paper body 00425:559); `_commit_schedule_edit_
  authorized` takes no actor param (cut_schedule_revision derives
  auth.uid() internally by ratified anti-forgery design) and carries the
  sibling zero-grant posture (service_role included — po-send can only
  ever write proposals, structurally enforcing R109's fact class).

*Entries add: I130 · last id = I130*

### I131 · Waves 2–3 delivered — event wiring + install windows live — 2026-08-13

Delivered per Kody's order, ultracode orchestration: pre-flight verification
(6 lanes, 19 blockers caught incl. two stale-lineage revert hazards and the
voided evidence-JSON premise) → Wave 2 implementation → three-lens panel
(51 findings) → fix pass → Wave 3 implementation → integration (caught the
00476 self-revert hazard + a latent Wave 2 ratchet/upsert deadlock) →
two-lens panel (30 findings, several verified by live exploit probes:
table-grant ceremony bypass, blind release unpin, TOCTOU double-confirm) →
final fix pass → ship.

**Live on Strata + prod**: merge `f6b978bd`, migrations 00475 + 00476,
po-send redeployed, designer portal version `df435d58` (22:37Z).
Mechanism: `_commit_schedule_edit_authorized` (zero-grant DEFINER; R110
downgrade + contradiction scan server-side), `schedule_proposals` (ratchet
trigger, conflicts_with_committed, three dedup uniques), five ceremony
bodies grafted at verified heads (00462 capability layer intact),
`install_windows` + hold/confirm/release doors (FOR UPDATE, anchored
discriminant, client-minimal view), clear-marker unpin, desk proposal +
contradiction needs, IMPACT blocks in the three studio ceremony sheets.

**Accepted architect calls**: ratchet COERCES source_ref (net-identical to
the reviewer's upsert-side fix, avoids re-cutting the door; 00475's inert
SET documented in 00476's banner); rank 9.5 proposal-above-task stands.

**Follow-up ledger (open, non-blocking)**: delivered-event target needs a
ruling (graft dropped — thread-completion milestone was the candidate);
trade-scope EXECUTION deliberately anchors nothing (make explicit if ever
revisited); held_until unwritten pending a hold-expiry policy; proposed
unpins are dismissible but not one-click committable (needs a ripple edit
union widening); po-send cannot refresh a standing proposal (INSERT-only
grant — deliberate divergence from the DB-side upsert); react/react-dom
lockfile skew in the working tree errors two unrelated test suites —
resolve deliberately in its own session. Owed: Kody's signed-in walk.

*Entries add: I131 · last id = I131*

### I132 · The Book Closes delivered — Wave 4 composition + the bug lane — 2026-08-13

The work `docs/design/doc-polish/deck.html` identified, delivered by multi-agent
orchestration: six preflight specs → five parallel worktree lanes plus a
sequenced W5 lane → a ten-reviewer two-lens panel (77 findings) → a triaged fix
pass → independent per-lane fix verification → integration. Lane branches and
their tips: `doc-polish/wave4-composition` `09509b13`, `doc-polish/paper-signature`
`9b70dfa5`, `doc-polish/send-consent` `20e654a2`, `doc-polish/navigation`
`d86cbf49`, `doc-polish/desk` `29e6a1eb`, `doc-polish/w5-small` `c7a68b25`. All
six folded onto `doc-polish/integration` (last code commit `3eb94f12`, this
entry on top; merges `365b112c`
wave 4, `c325b9f1` paper, `19a7145a` consent, `dea4b972` navigation, `1e838344`
desk, `0c2ef7b3` W5) and merged to `main` `--no-ff` as `merge(doc-polish): the
book closes — wave 4 + the bug lane` — 84 files, +7223/−580, two migrations.

**Wave 4 shipped.** W1 — the letterhead states its setup needs as one dashed
chip, reading the desk's own need-derivation, at most one live entry. W2 — one
Money region: a single dominant figure over four tiers (authority → plan →
committed → moved), composing `ProjectAuthorityBandForProject`,
`DerivedBudgetGrid`, `AuthorizationsLedger` and `AccountBand`, which left the
tail. W3 — four empty rooms collapse to one line, `GhostAddLine` retires once
the project completes. W4 — the recap line, delivered NARROW: `PreviousWork`
only. The deck's section-04 broad reading is a recorded follow-up, not an
omission. W5 — one quiet loading register across the document, plus A3/A6/A7.

**The bug lane shipped.** J2 — invite-on-select becomes arm-then-confirm, and
the consent step is reachable without a mouse. J3 — both halves (ceiling and
retainer) AND the client-portal commercial shell, which is the surface the
client actually reads. J7 — people/nurture derivation keys on evidence, in the
order `issued_on_paper` → real-send evidence (`sent_at` OR dispatch row) →
draft, with a neutral dot for the paper case. J1 — Begin the Direction
navigates explicitly to the successor document, because the pre-Direction name
stops resolving the instant the RPC returns. J5 — re-scoped by preflight: the
execute-on-paper ceremony has existed since 2026-08-05; the real wall was that
no email-free path reached a recordable state. **00477** opens that path. J6 —
forward URL resolution for pre-Direction relationship URLs. A1 — the desk folio
card splits into a valid DOM (card routes to the doc; the ledger act is an
inner control). A2 — the held-document breadcrumb, with `docId` validated
against the room's own document, which also closes a spoofing affordance. A8 —
first open lands at the top; the active-section jump is a resume convenience,
gated on the recent-documents MRU. A9 — one Capture a lead. #10 — verdict:
the control is verified working in code (static read + regression + throw
hardening); the prod-observed inertness was not reproduced.

**Rulings minted this session.** W4 is NARROW — the recap line carries
`PreviousWork` only. Tier 4 "Moved" is the accounts' committed figure — client
value ordered-through-installed — never "released to vendors". Paper issuance
CONVERGES on the sent regime: `00477` sets `proposals.status = 'sent'` with
`sent_at` NULL, no dispatch row, and `issued_on_paper = true` as provenance, so
every status-keyed guard engages and the paper flow traverses the emailed
flow's exact states; the send wall itself gained the third quiet path. P1 — a
state race is a hard error, not a silent repair. P2 — the provenance columns
are in. J3 never advertises $0 unless the facet was affirmatively written. The
nurture queue keeps unsent clients, relabelled and downranked — that is
correct, not a bug. A5 is DEFERRED pending a design ruling (ScheduleSpine
mounting for the install section versus cross-project collision awareness in
the ceremony; the static diagnosis is on file in the navigation lane spec).

**Migrations.** `00477_design_services_paper_issue` (the issue-on-paper path
and its provenance) and `00478_people_directory_has_sent_proposal` (the
`designer_client_send_evidence` function; `people_directory.meta` gains
`has_sent_proposal` + `issued_on_paper`). Both LOCAL ONLY — replayed clean
through `supabase db reset` on this branch, never pushed to Strata.
`database.types.ts` regenerated through 00478 at `3eb94f12` (additive: the one
new function).

**Follow-up ledger (open, non-blocking).** The canonical-query-key pin is
untested (W4C-07). Money aggregates ignore per-record currency (W4C-11). Stale
duplicate test mocks remain in `page.test.tsx` (W4C-15). The deck §04 broad-W4
reading is unbuilt. A5 needs a ruling. Kody's signed-in walks are owed for
every new surface — needs-setup chip, money region, not-started collapse, the
issue-on-paper ceremony and the wall's third path, the consent step, the
forward-resolution redirect. **No prod deploy was performed: this is local
delivery only.**

*Entries add: I132 · last id = I132*

### I133 · Client-signed digital ceremonies have no materialization path — deferred — 2026-08-14

**Found during the date-instruments program's Lane C review.**
`accept_trade_scope`/`accept_trade_scope_with_trusted_ip` (digital
trade-scope acceptance) and the digital, non-paper
`execute_furnishings_authorization` move a schedule anchor server-side
through `_commit_schedule_edit_authorized`, exactly like every ceremony
00475/00476 cut — but nothing settles the legacy `project_phases.start_date`/
`target_end_date` mirror (00480) after them. They run in
`apps/client-portal`'s server-side API routes (`api/trade-scopes/[id]/accept`,
`api/proposals/[id]/sign`), which hold no `queryClient` to call
`settleScheduleWrite` from; and a server-side settle attempt would still need
`materialize_schedule_dates` itself, whose wrapper guard
(`is_studio_comember`) the signing CLIENT cannot pass — `service_role` is
deliberately revoked from it, the same posture `commit_schedule_edit`
carries. The gap is self-healing (the next designer-side schedule write
re-materializes every phase) but visible to the client immediately after
their own signing act, which is exactly the moment they'd look. Resolving it
needs its own design ruling — a client-scoped wrapper guard, or a
server-side settle path callable from client-portal's routes — and is
explicitly deferred from the date-instruments program.

*Entries add: I133 · last id = I133*

### I134 · Letterhead date vitals move to SET via the Calendar Folio — 2026-08-14

Date Instruments lane D5. `LetterheadVitals`' start/target dates drop the
R40/R70 blur-save law in favor of the Calendar Folio (`FolioPopover` +
`FolioCalendar`, day mode): a quiet mono trigger opens the Folio, and SET —
not blur — is the commit. Rationale: the Document should speak one date
grammar everywhere a day is picked, and SET is this field's blur — the same
act, moved onto the instrument the rest of the program (milestone WHEN,
D3; the drafting line, D-B) now uses. The `focused` ref guard becomes an
`open` guard, so a server echo landing while the popover is up can no
longer clobber the field mid-pick. A small clear affordance (both columns
stay nullable) saves `null` directly, no Folio round-trip. Money
(`VitalMoney`) and the Phases fold keep blur-save untouched — only the two
DATE columns speak the new grammar.

*Entries add: I134 · last id = I134*

### I135 · "The Project, Composed" ratified — region heads, red-letter needs, always-visible overflow, fold seams — 2026-08-14

The Project section of The Document adopts Direction II (Action Ledger) for
region governance and Direction III (fold seams) for length, per the deck
(artifact `8f3bf39d`) and its ratified rulings. Five lanes landed together
on `redesign/project-composed`: the page shell (region ordering + fold
wiring), approvals/boards/care-band, the schedule spine + phase rows,
FF&E, and the commercial/money region + account band.

**Region heads.** Every Project region (Approvals, Boards, Schedule, FF&E,
Commercial) now renders through the shared `RegionHead` primitive: a serif
name + one-line status on the left, a `DocumentActionGroup` ledger on the
right where entry 0 is *always* the region's inked leader and every entry
after it is a secondary or quieter word — order is hierarchy, not
labelling. `RegionHead` enforces this at the type and runtime level
(`variant` is ignored at index 0; a dev-mode console error fires if a
later entry declares `inked`), so a region can have exactly one leader and
callers cannot promote a second one by relabelling.

**Red-letter needs zone.** Project documents surface an unmet-need line in
the same red-letter register the deck specified — `deriveNeeds` (P0) feeds
a zone that reads as urgent without a badge or box, consistent with the
rest of the Document's no-badges doctrine.

**Always-visible row overflow — deviation from the deck.** The deck's
Direction II sketched row-level secondary actions behind hover reveal. The
codebase's own no-hidden-affordances doctrine (nothing actionable exists
only on hover — touch has no hover, and hover-reveal audits poorly) wins
here: the `···` row-verb overflow on schedule/FF&E rows renders always
visible, not hover-gated. This is a deliberate departure from the deck,
not an oversight.

**Double region rules + fold seams.** Regions are set off by the
double-rule motif carried from P0, and each region's body can fold behind
a per-surface, per-region `localStorage` key (`use-region-fold`, P0) with
sparse defaults — a region is expanded unless its key says otherwise, so
existing users see nothing collapse under them on first load.

**Contract-test side effect — flagged for design review.** Because
`RegionHead` refuses a hand-spelled primary at ledger index > 0, several
former in-body primary actions were demoted to secondary on migration:
the approvals region's draft/publish/supersede actions, and FF&E's
`AddRoomInline` add-room action, no longer render as the region's inked
leader — they now sit as secondary ledger entries behind whatever action
the region head elects as primary (e.g. the region's overview/open action).
This is a mechanical consequence of the primitive's one-leader contract,
not a deliberate design call on any given region's correct leader, and is
flagged here for a design ruling on whether each demoted action should
become that region's declared leader instead.

### I136 · "The Shelved Spine" ratified — the running index, the room lens, the shelves, and the folded schedule frame — 2026-08-15

The Document reorganizes around one sentence: **the paper holds the work, the
shelves hold the artifacts.** Ratified from the prototype
`artifacts/spine-shelves-prototype-2026-08-15/prototype.html` and shipped GA
with no feature flag, matching the I135 same-day-GA precedent (rollback = git
revert; no migrations are involved).

**The spine grows three blocks — ≥1440px only.** The compact rail (1180–1439px)
and D13's mobile sheet are untouched; `data-spine-regime` and the responsive
shell's asserted class list are unchanged. The blocks are:

1. **The running index — "In this document."** Five region names with the one
   thing each currently says, and a reading line that rides down the list as
   the paper scrolls (one IntersectionObserver at the prototype's reading band,
   `-20% 0px -62% 0px`). v1 indexes the FOUR Project regions that carry a real
   inline surface: Schedule, Client approvals, Project · FF&E, Design
   authority. **Communications and Action items are deliberately omitted** —
   the prototype draws them, but no inline region exists for either, and the
   index will not name a place the paper does not have. Deferred until they do.
2. **Rooms.** The project's rooms, each with the one word its FF&E lines
   justify (`lib/document/room-state.ts`, extracted from the FF&E room
   heading's own tri-state so the two cannot drift).
3. **The shelves.** Plan room, spec book, mood boards, call sheet, knowledge.

**The presence line gives up its name.** "In this document" now belongs to the
running index; the presence sentence moves to the spine's foot beneath the
timer, unlabelled. One rail cannot carry one name twice.

**The room lens.** Taking a room in hand LIFTS it — a stable partition sort
that moves what belongs to that room to the front of every list with a room
dimension, on the paper and on the open shelf at once, washed in flat clay
(`.doc-room-lifted`; no shadow, D4). It never filters: nothing hides, and a
held room keeps its state word with the "In hand" tag added, never swapped in.
The letterhead names the room in hand so the lift below it is never
unexplained. The hold releases if the window drops below 1440px, where nothing
on screen could put it down.

What lifts, and what was verified at build time:
- **FF&E** — lifts (`project_ffe_items.project_room_id`).
- **Spec book leaf** — lifts (same rows, regrouped read-only).
- **Mood boards leaf** — lifts. `proposal_boards.project_room_id` and
  `project_boards.project_room_id` are real columns (00179 / 00434), previously
  persisted but unread by this UI.
- **Plan room leaf** — LENS-INERT, verified: `plan_sheets` (00429) carries no
  room association at all; its only axes are discipline and sheet number. The
  leaf makes no claim about the lens rather than reporting an empty one.
- **Client approvals** — LENS-INERT in v1: approvals carry no room dimension in
  the schema, and no room join was invented. Deferred.
- **Schedule and Money** never lift — both hold the whole project, and the
  prototype says so in words on the paper.

**The shelves.** One leaf at a time, 320px beside the spine, `role="region"`
and not `dialog` — the paper behind it stays live (D1 forbids split views, but
reference material is not modal either). Below ~1900px the paper steps aside
rather than being covered. Esc precedence runs **sheet → leaf → put down**: a
DocSheet raised from inside a leaf owns Esc first, then the leaf closes, and
only a bare document is put down. *(The blueprint listed the chain as leaf →
dialog → put-down; dialog-first is the deviation, because a sheet opened FROM a
leaf must not close the leaf underneath itself.)*

**The call sheet shelf is a doorway, not a leaf** — a deliberate deviation from
the prototype's uniform treatment. The row dispatches the existing
`document:open-call-sheet`; the roster already has a sheet, and a second
thinner copy of it in a leaf would be two answers to one question. It therefore
declares no `aria-expanded`.

**Knowledge is an honest empty shelf.** Nothing in this codebase records
cross-project standards or lessons, so nothing is listed. Verified: `/library`
exists and its middle shelf is literally named "Studio Library", but it holds
proven PIECES, not written standards — it is offered as the one real door, as
what it is. **Open for a design ruling:** whether "Knowledge" should name a
surface that does not exist yet, or be renamed to what `/library` actually
holds.

**The schedule frame folds — a new fold key.** `ScheduleRule` (the drafting
strip) sat unconditionally at the top of every project document and pushed the
work down the page. It now opens as a region like any other, **folded by
default, always** — an editor that opens itself on every visit is a claim that
dates need adjusting. The folded seam draws the glance track (extracted as the
presentational `ScheduleGlanceStrip`, shared with the pinned fold) and speaks
the page's ONE schedule derivation, threaded down as a prop so it cannot drift
from the letterhead's sentence (R108).

The fold key is **`schedule-rule`, never `schedule`**: the ledger
(`ScheduleSpine`, inside the Project section) already owns `schedule`, both are
mounted at once on a project document, and one storage key between them would
fold each with the other's choice.

Its ledger is "Adjust dates" (inked) + Fold. **"Open the schedule" is dropped
for v1** — no separate schedule page exists, and the prototype's verb will not
be faked into a mapping.

**Armed edit across the fold.** The ledger's per-phase "Edit dates" reaches the
strip through `ScheduleNavContext`, and a folded region UNMOUNTS its body — so
the region stands in for the absent strip: it catches the arm, unfolds, and
re-fires once the strip has mounted and registered its own handler. Without the
stand-in the ledger's action was a silent no-op on a folded schedule.

**The not-started band is retired.** W3's collapsed line existed to fold four
empty supporting rooms into one; all four now live on the shelves, so it has
nothing left to collapse. `ProjectMoodBoards` transplants whole into its leaf
(same fold, same creator, same board-intent listener). Two re-points were
required and made: the `document:new-project-board` intent is now caught by the
page, which opens the mood-board shelf and re-fires once the room is listening;
and the three `#ffe-selection-…` continue-item hashes became actions that put
the leaf away FIRST — a bare hash scrolled a page the reader could not see.
`KickoffBand` stays mounted standalone after the account band, ungated by the
old emptiness collapse: its first-staffing nudge has no other home, and it
self-silences on the flag, a staffed sheet, or its own dismissal.

**Deferred, explicitly:** Communications and Action-items index entries (no
inline region); a room dimension on approvals (no schema for it); real
Knowledge data (no feature for it); the plan-room band's separate component,
now unmounted but left in place rather than deleted outside this scope.

### I136-errata · Review corrections to "The Shelved Spine" before ship — 2026-08-15

Adversarial review of I136 found two blockers and a set of minors. All are
fixed on the same branch; the entries below correct what I136 above records.

**The call-sheet shelf row obeys the `call-sheet` flag.** I136 described the row
as a doorway to the roster sheet but did not gate it. Every sibling doorway is
flag-gated (⌘K's "This surface" row, the letterhead instrument, the kickoff
band) and `call-sheet-doorways.test.tsx` asserts it. The row is now **absent
entirely** with the flag off — not a disabled stub, which would still name a
surface the studio does not have. `shelvesFor({ callSheetEnabled })` is the one
place that decides; the page threads the flag it already resolves. Covered by a
fifth section in `call-sheet-doorways.test.tsx`.

**The phase-advance control leaves the fold.** I136 folded the whole schedule
mount by default. `PhaseAdvanceControl` was inside it, so advancing a project's
phase became invisible on every visit — a workflow regression, not a fold.
Advancing the phase is a lifecycle act, not a date edit, so it now renders at
REGION level in both fold states; `ProjectScheduleHandoffMount` keeps only the
instrument (the strip and its confirm strip) and its docstring says so.

**Corrections to what I136 claimed:**

- *"One derivation" for the room word was not yet true.* The spine read the raw
  `status` column while the FF&E heading read the derived stamp: an installed
  piece with an open damage claim stamps `damaged`, so one surface said
  "Installed" and the other "Underway". The normalization now lives inside
  `room-state.ts` (`roomStateRowFromLine` / `roomStateRowFromStamp`), and both
  callers enter through it.
- *The Design authority index line derived its own figure* from
  `projects.total_amount_cents` while the region it points at states from
  `useProjectBillingAuthority` — the exact R108 drift I136 claims to have
  avoided elsewhere. The spine now reads the same door (same query key, so
  React Query genuinely dedupes this one).
- *The React-Query dedupe claimed for the spine blocks and the spec-book leaf
  does not happen.* FF&E reads with `withLifecycle: true`, a different query
  key; those are separate fetches. The comments now say so rather than
  asserting a shared cache entry.
- *The paper-push threshold was ~116px early.* The leaf's right edge is at
  520px and the paper's text edge only clears it from ≈2016px, so the release
  threshold moved from 1900px to 2020px.

**Also fixed:** the armed edit re-fired against a strip whose scroll target was
still null (a state-held callback ref read on the strip's first render) — the
strip now holds it in a ref, which is assigned during commit, before the
region's post-unfold effect can call in; the shelf releases below 1440px where
its rows and leaf are `display:none`, mirroring the room lens's safeguard, so
Esc and focus-restore cannot target hidden elements; Esc inside a leaf's input,
textarea, select or contenteditable belongs to that control, not to the shelf;
the new-board intent is caught only where the shelves actually render (the
Project section); `aria-controls` is set only while the leaf is on the page;
and the scrollspy re-queries for region roots on a short retry, because regions
mount as their own queries settle and there is no event to subscribe to — a
region arriving after that window is a known limit, now stated in the code.

*Entries add: I136-errata · last id = I136*

### I137 · "Start to Signature" Wave 1 — the collation and the shared planks — 2026-08-15

Kody's Q1–Q7 rulings on the Start to Signature deck
(`artifacts/document-flow-directions-2026-08-15/`, delivery plan in the same
folder) authorize a five-wave program. This is Wave 1: the cheap structural
corrections and the planks both directions share, shipped GA with no flag
(rollback = git revert; no migrations are involved), on `sts/wave1-collation`.

**The Record moves to the foot of the paper.** `PreviousWork` — the settled
Brief/Discovery/Direction/Proposal bars — sat between the guide line and the
live work, so every visit scrolled past history to reach the job. It now mounts
after the active section, after the account band and the kickoff band, and
immediately before the colophon. History is an appendix, not a preamble. Props,
fold state, the approvals-awaiting-publish door and the `jumpToSection` marker
are all unchanged; this is a reposition, not a rewrite.

**The running index is derived from the paper order, not declared beside it.**
`document-index.ts` declared `schedule → approvals → ffe → money` under the
comment "Reading order down the paper" while the DOM mounted approvals above
the schedule ledger — the index and the paper disagreed about what the paper
said. One ordered descriptor, `PROJECT_PAPER_ORDER`, now states each Project
region's key, its index label and its heading id in mount order —
**approvals → schedule → ffe → money** — and `DOCUMENT_INDEX_KEYS`,
`DOCUMENT_INDEX_LABELS` and `regionHeadingId` are all read out of it. The paper
positions themselves are untouched in this wave (deliberately: reordering
approvals against the schedule ledger is a composition question W2 owns), and
no `localStorage` fold key changes.

**The add-room ruling — SP4, answering I135's open flag.** I135 recorded that
`RegionHead`'s one-inked-leader contract had mechanically demoted several
former in-body primaries, FF&E's `AddRoomInline` among them, and flagged the
question of whether each demoted act should instead become its region's
declared leader. The ruling: **it should not.** A region's head carries one
leader and that contract polices the head only; the room list's constructive
verb belongs in flow at the foot of the room list, where the rooms are. "Add a
room" (renamed from "Add room", the deck's wording) prints there as a scored-ink
line — visible, never behind a `···`, never only in the head ledger — and the
FF&E ledger's leader is untouched. The same principle answers the approvals
side of I135's flag by construction: a demoted act's home is the body it acts
on, not the head.

**SP1 — Begin the Direction lands on the document.** Verified already true and
recorded here as ratified rather than rebuilt: the act navigates to
`/doc/<newProposalId>`, whose Direction section is the engagement's new
identity, and the Drafting Room is reached from that section's own instruments
(`ProposalInstruments`' work band, or "Open the Drafting Room" on a design
services agreement) which stash the document as the Room's origin, so the
Room's way out returns to `/doc/<id>`. Covered by
`discovery-section.test.tsx` and `doc/[id]/page.test.tsx`'s J1 case.

**SP2 — the relationship-id alias.** Also verified already true: the resolver's
J6 leg queries `proposals.designer_client_id` on the miss path and redirects a
pre-Direction `/doc/<designerClientId>` to the chain's activated project or its
root proposal, mirroring the R6 seal-side pattern. With R6, F1, J6 and the R21
decision leg, no historical `/doc/[id]` dead-ends. Covered by
`use-document-state.test.ts`.

**SP3 — the send wall states itself.** Between the send and the seal the paper
now always opens with one scored state line: how long the agreement has been
out ("Sent 3 days ago", or "Issued on paper" for 00477's no-email door), then
the verb that is actually available, or the state word when none is
("awaiting countersign", "nudged Aug 12", "declined by the client"). It mounts
at `ProposalInstruments` — above BOTH walls, the legacy watch and the design
services status block — so neither can be silent.

The nudge lives on that line and **nowhere else on the wall**: `ProposalWatch`'s
duplicate nudge action and its cooled-down "Nudged {date}" span are removed, so
the word prints once. No new backend behavior — the line calls the same
`nudge_proposal` RPC the watch called. The line also reads
`proposals.commercial_state`, because a client's signature on a design services
agreement moves that column while `proposals.status` stays `sent`: without it
the wall would offer to nudge a household that had already signed. On an
executed or terminal commercial edition the line stands down entirely — the
status block below states those in full.

**Not in this wave, deliberately:** the Rule UI merge, the signature block, the
AccountBand extraction, the per-document begin leaders, the <1440 index strip
and the project-spine derivation (all Direction A's M/L set, later waves); the
boards seam (Q1's reversal, W3); and any sealing-semantics change
(`active_section` remains the sealing authority — I114 is still owed Kody's
mapping session).

*Entries add: I137 · last id = I137*

### I137-errata · Review corrections to Wave 1 before merge — 2026-08-15

Adversarial review of I137 returned "merge with fixes". All are applied on the
same branch; the entries below correct what I137 above records.

**The send wall never nudges a paper-issued agreement.** I137's line offered
"Nudge {family}" on any sent proposal past the cooldown. 00477's paper door
sets `status='sent'` with `sent_at` NULL and `issued_on_paper=true` — nothing
was emailed and the household may have no address on file — but
`nudge_proposal` (00231) would have accepted it anyway: stamping
`last_nudged_at`, burning the three-day cooldown, and firing the
`proposal-nudge` edge function at nobody. The record would then have read
"Issued on paper — nudged Aug 15", a reminder permanently logged that went
nowhere. The verb is now withheld whenever `issued_on_paper` is true and the
line falls through to its state word.

**The line's decision is a derivation, not a component.** `deriveSendWallLine`
lives beside `deriveProposalWatch`; `SendWallLine` renders what it returns and
decides nothing. The matrix — watch status × `commercial_state` × nudge
cooldown × `issued_on_paper` — is covered by `send-wall-line.test.ts`, which
also pins the two invariants the wall rests on: exactly one of {verb, state
word} prints for every shape the wall speaks about, and **"awaiting
countersign" is reachable only through `commercial_state='client_signed'`**. A
wall with no owed countersign and no offerable nudge now says "awaiting the
client's signature" instead, which is the true sentence for a legacy proposal
and for a paper issuance.

**The order claim is now guarded.** I137 asserted that index order equals paper
order by construction, but nothing tested it:
`use-document-running-index.test.tsx` builds its fixture FROM the keys, so it
agrees with the array by definition, and `shelved-spine.test.tsx` carried a
hardcoded schedule-first fixture that passed only because it never looked at
order. `doc/[id]/paper-order.test.tsx` now renders the real page and walks the
real `[data-index-region]` roots against `PROJECT_PAPER_ORDER` (and checks the
Record still follows the last of them); the spine fixture is built from the
canonical order and asserts the printed order explicitly. Both were confirmed
to fail when the order is put back the way it was.

**Corrections to what I137 claimed:**

- *The dead `commercial_state='expired'` branch is gone.* I137's stand-down
  list included it; 00414 removed 'expired' from the check constraint, so no
  row can carry the value and the branch could never run.
- *The sent phrase counts calendar days, not 24-hour buckets.* Something sent
  at 11pm read "today" at 1am. Boundaries are the viewer's own local midnights,
  and past 30 days the line states the day ("Sent May 24") rather than counting
  on forever.

**Left open, deliberately:** the reminder email's own copy still speaks as if
the agreement was emailed, which is wrong for a paper issuance that was later
nudged before this fix landed. Recorded as a content check, not changed here.

*Entries add: I137-errata · last id = I137*

### I138 · "Start to Signature" Wave 2 — the Worktable core, behind a flag — 2026-08-15

Wave 2 of the program I137 opened, on `sts/wave2-worktable-core`. Unlike W1
this ships **behind the fail-closed flag `worktable`** (`useFeatureFlag` +
`NEXT_PUBLIC_FLAG_OVERRIDES`, the mechanism I1 left behind): the flag off is
main's composition exactly, and the flag is what Kody's walk will turn on.
Authorized by the Q1–Q7 rulings on the Start to Signature deck — Q3 in
particular, which ratified the ceremonies and named the Worktable the
destination.

**What this wave is.** The composition machinery only: the selector, the pin,
the ceremony, the frame, and the places the next two waves mount into. **No
tools.** The rooms rail, the inline scheme, the boards strip and the library
reach-in are W3; the Money compression, the release lift and the real Install
setting are W4. Nothing in the paper's fixed skeleton moves in either flag
state — spine, letterhead, guide and red-letter zone, margin rail, account and
kickoff bands, the Record at the foot, the colophon, the shelves are
byte-identical on and off. Only the middle of the paper composes.

**The table selector is a pure derivation over the section grammar, not a
replacement for it** — amendment **A5, proposed and in force behind the flag.**
`deriveSections` is untouched and its consumers (the spine, the settled bars,
`deriveFillState`, the Desk need lines, the D13 mobile sheet) are unaffected.
`lib/document/table-derivation.ts` READS `active_section` and answers which of
four tables the paper's middle composes as:

| section | table | refinement |
|---|---|---|
| brief · discovery | **I intake** | — |
| direction | **II speccing** | — |
| proposal | **II speccing** | while the live proposal still says `draft` |
| proposal | **III finalize** | otherwise — sent, viewed, and the terminal states |
| project · care | **IV delivery** | setting `procurement` |
| install | **IV delivery** | setting `install` |

Two things about that table are deliberate. An **unread** proposal never moves
the table: the view (00327) derives `direction` from `status='draft'` and
`proposal` from anything else, so a null status leaves the section's own answer
standing rather than composing a draft table that would then have to turn. And
the **install setting reuses the page's existing install condition and invents
no second one** — the section IS the phase read, because 00327 derives
`install` from `current_phase in ('installation','final_walkthrough')`. A
committed install window has no reader on this page (the ceremony owns it);
W4's Install setting is where that belongs, and it was not faked here.

**Region order and weight are stage-derived** — amendment **A1, proposed and in
force behind the flag.** The table decides which spread stands on the paper and
what is framed around it; the canonical order the spine's running index reads
stays the constant W1 declared (`PROJECT_PAPER_ORDER`), and the flag-on Delivery
table mounts those four regions in exactly that order, guarded by a spec.

**Stale-table pinning is the ceremony mechanism (R7).** A table never
reshuffles under the designer's hands. The composition — the table AND the
section whose spread stands on it, since Intake carries two sections and
Delivery three — is snapshotted when the document is picked up. A derivation
that would compose something else does **not** re-compose the paper: it arms one
scored line above the current table, "The table is ready to turn — turn it".
Pressing it adopts the new composition and re-arms for the next; re-opening the
document adopts naturally, because a fresh mount snapshots again. Data inside
every region stays live throughout — the pin holds composition, never content.

**The seal announces its own turn.** R6 already redirected an activated
proposal's id to the project document; the turn was silent, so the designer
arrived at a different table with no account of how. The redirecting page now
leaves a sessionStorage marker (flag-on only) and the destination reads it once,
clears it, and prints one quiet line above the Delivery table: "This proposal
was signed {date} and continued as the project document." The date is the
destination's own lineage or it is omitted — never guessed. Cleared as read, so
dismissal is simply that it does not print again.

**The tables, as composed this wave.**
- **Intake** — the existing brief/discovery spread, plus **honest future
  seams**: one non-interactive line per domain this document does not have yet,
  each stating when it opens ("Project · FF&E — opens with the Direction";
  Schedule and Design authority — "opens when the project begins"). Named out of
  the running index's own labels so a seam and the index cannot call one region
  two things. Q6 in force: no capture drop, no board tile, no affordance for a
  store that does not exist. `FutureSeam` generalizes the settled bar's visual
  idiom and deliberately is NOT a control — `SettledBar` and `FoldSeam` open
  something; a future seam has nothing to open, so it is focusable and nothing
  more.
- **Speccing** — the existing direction/proposal-draft spread unchanged, plus
  four named, typed, empty mount slots: `rooms-rail` at the table head, then
  `scheme`, `boards-strip`, `reach-in`. This is **W3's integration surface**,
  declared here so the lanes touch only their own components and this contract.
  An unfilled slot renders nothing at all — no wrapper, no spacing, no
  placeholder.
- **Finalize** — the sent/viewed proposal exactly as it stands, W1's send-wall
  line included. Untouched; W4 rebuilds it.
- **Delivery** — the project/install/care composition exactly as it stands,
  framed so the pin and the seal note apply to it. Money compression and the
  release lift are W4 and were not touched.

Each table root carries `data-table="<key>"` (and `data-table-setting` on
Delivery). There are no table nameplates and no new headings: the composition is
the change, and chrome that announced it would be a second telling.

**Flag-off parity is the wave's hard guarantee, and it is guarded.**
`paper-order.test.tsx` (W1's) renders the real page with the flag off and walks
the real `[data-index-region]` roots against `PROJECT_PAPER_ORDER`; it is
unchanged and passing. `worktable.test.tsx` renders the same page with the same
mocks and only the flag flipped, and asserts the Delivery table names itself,
mounts the same four regions in the same order, keeps the Record at the foot,
and prints no turn line, no seal note, no seams and no empty slots. The frame is
the only component the flag reaches, and with no table it renders its children
and nothing else.

**Not in this wave, deliberately:** every table tool (W3/W4); the Drafting Room
decomposition and its `/drafting` redirect (Q5 step 2, W4); the Q1 boards
reversal entry (W3 owns it, being that lane's ruling); A2/A3/A4/A6/A7, which
have nothing to record until the surfaces they govern exist; and any change to
`deriveSections`, `document_state`, or the sealing semantics — `active_section`
remains the sealing authority and I114 is still owed Kody's mapping session.

*Entries add: I138 · last id = I138*

### I139 · "Start to Signature" Wave 3 — the Speccing table's four tools — 2026-08-16

Wave 3 of the program I137 opened, on `sts/wave3-speccing`, still behind the
fail-closed `worktable` flag. W2 declared the Speccing table's four typed mount
slots and left them empty; this wave builds the four tools and fills the slots
from the open document's page: **`rooms-rail` at the table head, then `scheme`,
then `boards-strip`, then `reach-in`** — the table reads rooms → the work → the
tools. Flag off, none of it exists; a non-Speccing table mounts none of it —
both guarded by `worktable-speccing.test.tsx` alongside W2's parity specs.

**The tools are proposal-keyed, on the row's own proposal identity.** Every
slot receives `document_state.proposal_id` — 00327's Shape B emits the LIVE
chain version (`pr.id`) there, while `engagement_id` carries the chain root —
never the raw route param, which on an aliased arrival (J6) the redirect has
already replaced before the table composes. The integration spec keys its
fixture's two ids differently so a tool wired to the wrong one fails loud.

**The room lens is one held id, owned by the page.** The rail reports a press
as the held room (controlled `value`/`onChange`, exactly one or zero held); the
scheme and the boards strip receive it as `roomFilter` and LIFT that room's
things to the front — never hide (lens doctrine). One `useState` per document;
the F2 `key={id}` remount is the reset, no extra machinery. This is
deliberately NOT the project room lens (`room-lens-context`): different store,
different subject — and this one persists at every width by construction (A7:
its subject, the rail itself, is on-screen at all widths; below 1440 the row
wraps and scrolls in its own container, no `display:none`, no self-release).

**The boards strip reverses I136 — for the speccing stage only (Q1,
ratified).** I136 shelved boards as reference beside the spine; at direction,
board content is the work itself, so the strip puts it back on the paper — for
this one stage. **The shelf remains boards' home everywhere else**; the strip
is the table borrowing the tool, not a second home. It is the Drafting Boards
facet's read in strip form: proposal-keyed through the same `useBoards` the
facet reads (the project-keyed mood-board shelf leaf is deliberately not its
source); tiles open the one canonical board room with `drafting_strip`
attribution — the reuse is recorded as deliberate, not accidental; "Start a
board" is the facet's blank-board leg verbatim (same autosave barrier, same
naming, same landing). Below 1440 the strip folds to a one-line "Boards · N"
seam that expands in place to the same tiles — the capability changes form,
it is never `display:none`'d (Q7/A4).

**The rooms rail is the speccing home of add-a-room.** I137's SP4 ruling put
the project-stage verb at the foot of the FF&E room list; the rail's scored
"+ Add a room" line is the same verb's speccing-stage home. Both stand — two
stages, two surfaces, one creation flow (the Rooms facet's `useAddScopeRoom`,
ending in its own `scopeUpdated('add')` event).

**Known debts, recorded as debts and not failures:**

- *The reach-in takes optioned pieces "decide later".* It has no configure
  step — that ceremony stays with the picker — so a variant/configured/custom
  piece is added with the `configurationSkipped` envelope, exactly the
  picker's own skip, and the schedule line shows the debt downstream. Warn,
  never block. Full spec resolution inside the reach is a follow-on.
- *Reached-in lines land Unassigned* (`scopeRoomId: null`) — the reach does
  not read the room lens; assigning the room happens on the line, downstream.
- *The scheme's lift is group-granular render order only.* The lensed room's
  whole group comes to the very front — ahead even of the builder's
  unassigned-first grouping, which otherwise leads (lane 3b's draft had
  described the lift as staying behind Unassigned; the shipped builder lifts
  the lensed group first, and both the scheme's spec and the integration spec
  pin that). Document positions are untouched: a drag under the lens still
  rewrites from the canonical group order, never the lifted view.
- *The reach-in drops the piece's category.* Its creation call passes
  `ffeCategorySlug: null`, so a reached-in line lands uncategorized and its
  doc code falls back to the name prefix instead of a category code.
  Categorizing at the reach is a follow-on.
- *The Scheme omits the verdict chips and the compose-decision wiring.*
  Direction-stage client verdicts do not print on the paper — the builder
  mounts without the Drafting Room facet's verdict read. Deliberate scope;
  the named follow-on is bringing that read to the table.
- *A chain supersede remints scope-room ids under a standing hold* — the
  page's remount key is the chain-root route id, so the remap arrives without
  a fresh mount. The rail treats a held id its settled room list no longer
  contains as released: reported once, the filters go null, "All" stands. A
  lens is dropped, never left pointing at a room nobody can see.

*Entries add: I139 · last id = I139*

### I140 · "Start to Signature" Wave 4 — the Finalize table — 2026-08-16

Wave 4's first lane, on `sts/wave4-tables`, still behind the fail-closed
`worktable` flag. W2 left the Finalize table as the sent/viewed proposal spread
exactly as it stood; this lane makes it a table. Flag off, the composition is
byte-identical and `worktable-finalize.test.tsx` guards that alongside W1's
`paper-order.test.tsx`.

**The verdict roll-up is the headline.** On every other surface the client's
verdicts are a 9px mono whisper under the section heading. On a sent proposal,
where those verdicts stand *is* the state of the document, so on this table the
same sentence is the opening line in serif — and the whisper's old position
stands down **on this table only**. One fact, one weight; a sentence printed
twice at two sizes is two documents.

**One inked leader, derived — and it decides nothing twice.**
`deriveFinalizeLeader` folds proposal lifecycle × verdict roll-up × the send
wall's own answer into at most one act, using only verbs the document already
has: flagged lines outstanding → **Answer the flags**, anchored to the oldest
unresolved rejection (the Drafting Room's own choice, now addressable as
`firstFlaggedLineId` so the head and the destination cannot pick different
lines); every line approved and still unsigned → **Nudge {family}**, offered
**only when `deriveSendWallLine` offers the verb** — W1's `issued_on_paper`
guard, the countersign hold and the three-day cooldown are composed, never
re-implemented; otherwise the watch's own **Preview** (out) or **Email delivery
status** (expired); and nothing at all once the seal, a decline, a supersede or
a terminal commercial state speaks for itself. **Revise stays retired** (I91):
a changed mind travels as a design services agreement, and a spec asserts the
word never appears.

**A promoted act is a moved act, not a copied one.** The wall below reads the
same derivation off the same cached reads and stands down whichever act the
head took — the send-wall line keeps its fact and drops its nudge (and the dash
that led to it); the watch drops its Preview or its Email-delivery act. The
verb is offered once.

**One leader per table, ruled at integration.** The head's derived leader and
the watch's `primary` "Mark signed" were two leader-weight acts on one table —
`DocumentActionGroup`'s ≤1 guard polices a region, and these stand in two. The
ruling: **the head's derived leader is the table's only leader-weight act.**
Flag-on finalize, "Mark signed" keeps its place, its wording and its sheet and
renders `secondary`; it is not a verb any derivation can carry, so it gives up
its weight rather than its home. Flag off it is the primary it has always been.
The page-level claim — inked + primary counted together across the whole
composed table, exactly one — is spec'd in `worktable-finalize-once.test.tsx`,
because no per-region guard could ever have caught it.

**The Offer folds open on the paper, with the Room's editability and not one
permission more.** R4's decomposition: Scope + Vision became the Speccing table
(I139), and the Offer movement — Phases · Exclusions · Payments · Terms —
mounts here under the spread in the Room's own `FacetSection` seams, same
accent, same status words, same editors. The Room's gate is now
`drafting-editability.ts` and **both** surfaces read it. Its honest answer at
this stage is `issued`: the Room evicts anyone who opens a sent proposal, so
the seams open onto the offer **as written**, in the canonical blocks, and no
editor mounts. **Amendment A3 is in force behind the flag** — proposal
authoring lives on the paper and the Drafting Room retires by redirect — but A3
does not grant an edit the Room forbids.

**And the offer therefore stops printing twice, ruled at integration.** With
the seams standing under the spread, `ProposalBlocksReadOnly` was stating
Timeline, Payments and Exclusions above facts the seams state again. The
ruling: **fold it.** Flag-on AND finalize composed, the read-only spread drops
its Offer blocks — the seams below are their addressable home. It is a
defaulted prop (`omitOfferBlocks`, false), not a fork: the settled unfold, the
version-history sheet, the client portal's blocks and every flag-off render
take the same component byte-identically. One exception, and it is deliberate:
Slice 03's anchored **Key dates** ride inside the Timeline block but are *not*
an Offer fact — no seam carries them — so they survive the omission and keep
their existing condition. Dropping them would have deleted a fact from the page
in the name of printing it once.

**The client's copy is a shelf.** The Drafting Room's ≥1440 live rail becomes
the leaf "The client's copy", visible only with the flag on and the Finalize
table composed. The registry learned what each shelf *belongs to* (`subject`),
because the first version offered a proposal document the project's plan room,
spec book, boards and roster — four surfaces it does not have, which is the
same lie the call-sheet stub would have told. Below 1440 no shelf exists at all
and the watch's "Preview as {family}" is the copy's form (Q7/A4: the capability
changes shape, it is never `display:none`'d).

**The Drafting Room is a press (Q5 step 2), with two doors deliberately left
open.** Flag on, a legacy proposal's `/drafting/<id>` `router.replace`s to
`/doc/<id>`; flag off it opens exactly as it always has, and every entry — the
draft work band, ⌘K, the guide, the mood-board return target — is unchanged
either way. Two entries are spared, because a press over a door nobody else
opens is a strand and not a retirement: the Desk's `?flagged=1` walk-in, whose
Alternatives band exists only in the Room; and **design-services agreements and
their addenda**, whose authoring is `ServiceAgreementDraftingRoom` and was
never part of this decomposition.

**Known debts, recorded as debts:**

- *"Answer the flags" leaves the paper.* Nothing on the Finalize table can
  resolve a flagged line, so the leader walks into the Room. Bringing that
  answer onto the table is what closes the `?flagged=1` carve-out.
- *The two spared doors are the press's unfinished edge.* `?flagged=1` and the
  design-services room are carve-outs, not exemptions — each is named here so
  the retirement can be finished rather than forgotten.

*Entries add: I140 · last id = I140*

### I141 · "Start to Signature" Wave 4 — the Delivery table — 2026-08-16

Wave 4 lane B, on the Delivery table only, still behind the fail-closed
`worktable` flag. W2 framed the delivery composition and left it exactly as it
stood; this lane makes two moves on it and nothing else.

**The release ceremony's leader lifts to the table head; the ceremony does not
move.** "Release for authorization" lived inside the FF&E region's ledger,
three regions down a project document — the last hunt in the re-walked journey.
Flag on, the procurement setting prints it at the head of the table, above the
spread. Selection, the composition bar and the review sheet stay on the
schedule, because releasing is still the schedule's own act: what moved is the
*leader*, not the ceremony.

**The lift presses the door the ceremony already opens on.**
`ReleaseCeremonyProvider` is section-local by design and mounts inside
`FFESection`, so a leader standing at the table head cannot reach its context —
and minting a second `begin()` for it would be exactly the duplicated machinery
the lift exists to end. It dispatches `START_RELEASE_EVENT` with an empty
pre-tick list: the window door VoidAct has used since the Authorized Schedule
to start a superseding release, and `begin([])` is what `ceremony.begin()`
already does. One entry point, two callers.

**The FF&E head demotes rather than inking a second release.**
`releaseLeaderElsewhere` (defaulted off, so every other surface is unchanged)
makes the section's head fall to its own non-authority shape: "Add to project"
leads, per the existing `DocumentActionGroup` order, and release does not print
in the head at all — not demoted, not duplicated. The one-inked-leader guard is
a per-region runtime check and would not have caught two release leaders in two
regions; the page-level claim is spec'd instead. The head's "No lines are
currently eligible for release." line stays where it is: with the leader
lifted, it is the only place the table head's *silence* is accounted for.

**The section reports; it is never asked.** `canRelease` and per-line
eligibility are derived in one place — inside the schedule, over readiness,
authority, instruments and trade scopes — and the table head prints only the
leader it is told exists (`onReleaseOffered`). The offer is withdrawn while a
ceremony is already under way: pressing the lifted leader mid-selection would
call `begin([])` and discard the ticks in hand.

**Money is the measure, not the work — so it stands as a seam.** On the table
the money region compresses to one scored line, "$X committed of $Y authority",
and unfolds in place to *exactly* the region that stands on the paper today.
Both figures are the region's own already-computed reads; no query was added.
**Reference posture by default, work posture one press away.**

**The seam is folded by declaration, not by derivation, and remembers itself
apart.** Off the table the region folds on its sparse test and stands open
otherwise; on the table it folds because that is what money *is* here, needing
no read to settle first. Its remembered choice lives on its own key
(`money-table`): a designer who opened the region off the flag must not land on
the table with its seam already spent.

**The accounts either-or is untouched, and deliberately does not read the
fold.** W2's F1 rule stands: the money region states the accounts inside the
Project spread, the account band states them everywhere else, and the gate is
the spread's *section*. A folded seam is still the money region mounted — so
folding must not summon a second accounts surface, and it does not.

**The install setting lifts nothing.** Releasing is procurement work; the
install spread stands as it did — FF&E at install grade, the window ceremony,
the Care band — and the care spread is untouched.

**A boundary worth stating: the procurement setting is not the project
spread.** W2's derivation maps project *and* care to delivery/procurement, so
gating on the setting alone would have leaked the release lift onto a closed
project's care spread. The lift is gated on the project spread.

**Recorded as scoped out, not forgotten:** *money does not seam on the
install/care spread, because money does not mount there.* On install and care
W2's accounts either-or gives the accounts to the band instead, so a money seam
on the install spread would be a new mount and a second accounts surface.
Bringing money onto the install spread is its own ruling, and it has not been
made.

*Entries add: I141 · last id = I141*

### I142 · "Start to Signature" Wave 4 — the Intake spread header — 2026-08-16

Wave 4 lane C, on the Intake table only, still behind the fail-closed
`worktable` flag.

**Table I's spread header — the household chip promoted.** The Intake table
(brief|discovery) now prints a quiet reading-size header above the section
content — name (serif), one-line project description, and arrival source (mono
eyebrow) — sourced entirely from `useLead`, the same read `BriefSection`
already performs. The letterhead's own household chip is untouched — this is
the promotion, not a move; the two co-exist by design.

**Q6 honesty, scoped.** Deliberately built as printed identity only — no
capture drop, no start-a-board tile, no links, no buttons, no affordance for a
store (folio, boards) that does not exist at Table I. The ruling held that
pre-proposal capture is an inferred complaint, not a heard one; Table I
therefore states what is true and offers nothing it cannot keep. It renders
`null` rather than empty scaffolding when identity data is absent, and waits
for the lead read to resolve rather than growing the header after first paint.
Flag-off and off-intake are both byte-identical: the component is not mounted,
so `useLead` is never called and the wire is unchanged.

**Recorded as a debt:** *on a discovery document this is a new read.* On a lead
document the header is React-Query-deduped against the Brief's own `useLead`
and costs nothing; on a discovery document the lead (reached via Shape D's
`dc.lead_id`) is not otherwise read by this page, so the header adds one gated
query — enabled only while the Intake table is composed. It is the lane's only
new read, and it is named here rather than hidden inside a dedupe claim that
does not hold on both shapes.

*Entries add: I142 · last id = I142*

### I140-errata · Review corrections to the Finalize table before merge — 2026-08-16

Adversarial review of Wave 4 returned one critical capability loss and eight
lesser findings. All are applied on the same branch; the entries below correct
what I140 above records.

**The press is descoped — `/drafting` stays open in both flag states.** I140
recorded the Drafting Room as a press (Q5 step 2). The review found what that
closed: flag-on, a DRAFT proposal composes the *Speccing* table, which carries
Scope and Vision tools only; the Finalize table's Offer seams are read-only by
the Room's own gate (`drafting-editability` correctly answers `issued` on a
sent proposal); so with the Room pressed shut, phases, exclusions, payment
milestones and terms could never be authored on a new proposal at all. The
root cause is an orchestration error and not the lane's: **Kody's Q5 ruling was
a TWO-step retirement — the landing/return fix now, the decomposition onto the
tables in a later release once the Speccing table proves itself** — and the
brief asked for step two early. The redirect, its two carve-outs and its spec
are removed; `drafting-room-opens.test.tsx` now guards the opposite claim (the
Room opens, flag on and flag off, walk-in included). Everything else I140
records stands. **Amendment A3 is therefore NOT in force in this release**: the
Room retires when the Offer has an editable home on the paper, and not before.

**"Answer the flags" is dropped as a leader, and the flags' homelessness is
stated as a debt.** I140's leader matrix led with it, walking to
`/drafting/<id>?flagged=1`. The Room evicts a sent or viewed proposal
("already been issued"), so the verb bounced off the very destination it named
— and the press is not what broke it: **no surface anywhere today can answer a
flag on a sent proposal**, main's Desk `?flagged=1` walk-in included, which has
the same defect. A leader that cannot be followed is worse than no leader, so
`deriveFinalizeLeader` falls through to its next honest verb (Preview, or the
delivery record on an expired proposal) and `firstFlaggedLineId` — which
existed only to anchor that walk-in — is removed with it. The headline still
prints the flag as a *fact*; it is the verb that had nowhere to go. **Recorded
as a product debt: answering a client's flag on an issued proposal has no
surface. That is the gap to close, not the leader to restore.**

**The head is the LEGACY proposal's head, and now says so.** `finalizeTable`
tested the composed table and `engagement_kind` but not the document kind, so a
design-services agreement or a furnishings authorization composed a legacy
verdict headline and a legacy-derived leader — the wrong copy for editions that
run their own lifecycle. Worse, the head's arrival stands the letterhead's
verdict whisper down, so those documents lost the fact and gained a wrong verb;
and on `commercial_readonly`, where `ProposalInstruments` prints nothing at
all, that wrong leader was the document's **only** act. The gate is now the one
`OfferFacets` already held — `commercialDocumentExperience(...) === 'legacy'` —
applied at the page (so head, Offer seams, shelf and the whisper stand-down
move together) and held again by `FinalizeHead` as its own law.

**The headline counts what is still open.** It read `rollup.flagged`, which
includes flags the designer has already resolved, while the leader read
`rollup.unresolvedFlags` — two numbers for one document. The shared formatter
is unchanged (the letterhead whisper elsewhere is untouched); it is handed the
unresolved count on this table.

**The send wall keeps its state word when its verb is hoisted.** I140 recorded
the wall dropping "its nudge and the dash that led to it". `deriveSendWallLine`
prints exactly one of {verb, state word}, so with the verb hoisted the line
read "Sent 5 days ago" and stopped, over an action row with no action. The
state sentence is now an addressable function (`sendWallStateWord`) that the
derivation calls when it has no verb and the wall calls when the table's head
has taken one: the head took the verb, not the news.

**The one-leader rule governs the TABLE, not the fixed skeleton — the claim
and its spec are corrected.** `worktable-finalize-once.test.tsx` asserted
exactly one inked-or-primary act across the whole container, and passed only
because `DocLetterhead`/`LetterheadInstruments` were stubbed to null; at
runtime the letterhead's "Message {family}" is `primary`. **Ruling: letterhead
instruments are chrome — they stand on every document at every stage and answer
to no table, so they do not count against the table's one leader.** The
letterhead now renders for real in that spec and the assertion is scoped to
`[data-table="finalize"]`, with a companion case pinning the letterhead's
`primary` *outside* the table. The mutation was run both ways: un-scoping the
assertion fails (2 leaders), re-stubbing the letterhead fails the companion.

**Smaller corrections:**

- *The dead scope-builder read is gone.* `OfferFacets` called
  `useScopeBuilderSummary` only to compute an allocator denominator for its
  editable branch — a branch the Finalize table can never reach, since the
  Room's gate answers `issued` here. The query is removed and the unreachable
  branch takes the proposal's own total, the same denominator the read block
  beside it uses.
- *The table's headline is a heading.* It was a `<p>`, outside the document's
  heading tree, one line above region heads that print `<h2 id tabIndex={-1}>`.
  It now matches them. The Intake header's name line stays a `<p>` deliberately
  — it is printed identity (Q6), not a section head.
- *One apostrophe.* `aria-label="The table's leader"` is straight in both the
  Finalize head and the Delivery lift, matching every other aria-label in the
  app.

**Known, accepted, or deferred — named rather than fixed:**

- *The client's copy mounts the preview rail twice* (the shelf leaf and the
  watch's own rail can both be on the page). Accepted for now: the rail is a
  read, both mounts show the same document, and the flag-off path is unaffected.
- *A zero-leader edge exists.* Every line approved, the nudge withheld by the
  cooldown or the paper guard, and the proposal still out: the table can print
  a headline with no leader under it. Accepted — the wall below still states
  where the document stands, and inventing a verb to fill the slot is what this
  errata just finished undoing.

*Entries add: I140-errata · last id = I140*

### I141-errata · Review corrections to the Delivery table before merge — 2026-08-16

Corrections to what I141 above records, applied on the same branch.

**The money seam's declared fold waits for its reads.** I141 recorded the seam
as "folded by declaration, not by derivation, needing no read to settle first".
But the seam *states figures* — "$X committed of $Y authority" — so on first
paint it printed "$0 committed · no authority yet" and then flipped to the
truth, which is precisely the lie the region's own tiers refuse to tell (a
figure it did not know). The declaration now waits on the same `allSettled`
condition the region's own default respects, using `useRegionFold`'s existing
refusal of an unsettled default (`null`) rather than a new mechanism. Until it
settles the region stands as it does anywhere else, each tier printing its name
and no figure.

**And the declared fold yields to the accounts.** The non-table default folds
only when `accountQuiet` — nothing drawn, nothing outstanding — precisely so a
folded region cannot hide an overdue invoice on a project that never executed
an instrument. The table's declaration ignored that, and because the Delivery
table suppresses the AccountBand's own home (W2's either-or gives the accounts
to the money region on the project spread), a folded seam over an unquiet
account stated the receivable **nowhere at all**. `accountQuiet === false` now
overrides the declaration: money that is chasing the designer is never folded
away. Money is reference *until it is owed*.

**The FF&E head keeps its release entry when nothing is eligible.**
`releaseInHead = canRelease && !releaseLeaderElsewhere` deleted the entry
outright, but the lift outside only renders while `releaseOffered` — which
requires an eligible line. In the `canRelease && !anyEligible` window the lift
printed nothing and the head printed nothing, so the verb existed on no surface
and its "No lines are currently eligible for release." reason explained a
silence with no subject. The head now keeps the entry whenever the lift is not
showing it, in the visible-but-disabled form it has always worn on main. A head
that is not printing the leader has not taken it.

**Known, accepted, or deferred — named rather than fixed:**

- *The lifted leader drops focus.* Pressing it dispatches the ceremony's window
  event and the leader unmounts, so focus falls to the body rather than landing
  in the selection surface it opened. Recorded as an accessibility debt against
  the lift.
- *`onReleaseOffered` is not withdrawn on unmount.* The page's `releaseOffered`
  state keeps the last value the section reported if the section unmounts while
  offering. Accepted: the lift and the section mount and unmount together under
  the same gate today, so no reachable arrangement strands the flag.

*Entries add: I141-errata · last id = I141*

### I142-errata · Review correction to the Intake spread header before merge — 2026-08-16

**The header stands on the discovery spread only.** I142 recorded it above
"the brief/discovery spread". On a BRIEF document all three of its facts — the
contact name, the arrival source and the project description — are printed
again by `BriefSection` immediately below, off the same `useLead` row: the
captured-contact line, its source, and the description as a pull quote. The
Brief *is* the intake spread's header there, and the promotion printed the
household twice.

Of the two available fixes, suppressing the duplicated fields would have left
the component rendering nothing at all on that spread (it carries exactly those
three), so the honest form of that fix is the gate: **the header stands where
it is additive, which is discovery**, where `DiscoverySection` states none of
them. Its purpose is intact — the identity is promoted on exactly the spread
that was missing it — and the read is now enabled only there, which also
narrows I142's recorded debt: the one extra query on a discovery document is
the only query this component ever opens, and on a brief document it opens
none.

*Entries add: I142-errata · last id = I142*

### I143 · "Start to Signature" closed — the consistency pass over I135–I142, and what the program leaves open — 2026-08-16

Wave 5, on `sts/wave5-closeout`. No product code changes: this wave reads
I135 through I142 and every errata against each other and against the code as
merged at `2ed96a20`, runs the designer-portal gates on that tree, and records
where the program actually stands. The delivery record with the gate numbers,
the per-wave commits and the flag-on instructions is
`artifacts/document-flow-directions-2026-08-15/delivery-record.md`.

**What is GA, unconditionally, on every document today.** Wave 1 shipped with
no flag and it is live in the codebase for anyone who opens `/doc/[id]`: the
Record at the foot of the paper (`PreviousWork` after the active section, the
account band and the kickoff band, immediately before the colophon); one
`PROJECT_PAPER_ORDER` descriptor driving both the paper's mount order and the
spine's running index — approvals → schedule → ffe → money, guarded by
`paper-order.test.tsx` against the real page; "Add a room" printed in flow at
the foot of the FF&E room list (SP4, I137's answer to I135's open flag); and
the send-wall state line at `ProposalInstruments`, above both walls, printing
exactly one of {verb, state word}, withholding the nudge on a paper-issued
agreement and printing the nudge nowhere else on the wall. SP1 and SP2 were
verified already true and ratified rather than rebuilt.

**What is flag-gated and has never been seen.** Everything Waves 2, 3 and 4
built sits behind `worktable`, and `useFeatureFlag` is fail-closed: the value
is `false` until PostHog answers and stays `false` where PostHog can never
answer. Flag off, `table` is `null`, `TableFrame` renders its children and
nothing else, and the composition is main's. Behind it: the table selector over
`active_section` (A5) and the stale-table pin with its "turn it" line and the
seal-turn note (W2); the Intake table's honest future seams and, on the
discovery spread only, the promoted household header (W2, W4c); the Speccing
table's rooms rail, scheme, boards strip and library reach-in (W3); the
Finalize table's verdict headline, derived leader, one-leader rule, Offer seams,
folded offer blocks and the client's-copy shelf (W4a and the integration); and
the Delivery table's release lift, demoted FF&E head and money seam (W4b).
**None of it has been rendered for a human on a real screen.** Nothing was
deployed and no deploy was requested.

**The pass found no contradiction between entries that is not already recorded
as one.** Every reversal this program made is named in the entry that makes it,
against the entry it corrects: I139 amends I136's boards ruling explicitly and
for the speccing stage alone, leaving the shelf boards' home everywhere else;
I140-errata descopes the press, withdraws A3, drops "Answer the flags" as a
leader and rescopes the one-leader claim to the table; I141-errata puts two
guards on the money seam's declared fold and gives the FF&E head its release
entry back; I142-errata narrows the intake header to the discovery spread. No
entry was found to have been silently reversed by a later one.

**Every load-bearing claim spot-checked against the code held.** The flag's
fail-closed default and its `NEXT_PUBLIC_FLAG_OVERRIDES` escape hatch are as
I138 describes. `/drafting/[proposalId]/page.tsx` contains no reference to the
flag at all — the press is genuinely gone, not merely disabled, and
`drafting-room-opens.test.tsx` guards the opposite claim. `firstFlaggedLineId`
is absent from the tree. `worktable-finalize-once.test.tsx` scopes its
single-leader assertion to `[data-table="finalize"]` and pins the letterhead's
own `primary` outside it. The money seam's fold is
`allSettled ? accountQuiet : null` — both guards, in one expression. The FF&E
head's `releaseInHead = canRelease && (!releaseLeaderElsewhere ||
!releaseOffered)` keeps the entry in exactly the window the errata describes.
The reach-in does pass `ffeCategorySlug: null` and `scopeRoomId: null`, the
Scheme carries no verdict read, and the intake header holds both its gates
itself. Add-a-room stands in two homes and in neither head ledger. **No code
defect was found that is not already recorded as a debt in I139, I140-errata,
I141-errata or I142-errata.**

**Two corrections, both to this file's own bookkeeping, both recorded rather
than repaired — the file is append-only.**

- *I135 and I136 carry no `Entries add:` trailer.* They are the only entries in
  the I126–I142 run without one; the chain jumps from I134's trailer to
  I136-errata's `last id = I136`. The ledger's net position was never wrong,
  but two mintings went untrailered and a reader counting trailers would miss
  them.
- *The three Wave 4 errata were appended after all three Wave 4 entries, so
  their trailers read I140, I141, I142 after I142's own had already been
  written.* The sequence dips rather than climbing. The file's final trailer
  states `last id = I142`, which is the true position, so this is a reading
  hazard and not a numbering error.

**And one reading hazard worth stating plainly:** I140's body still asserts the
Drafting Room press and Amendment A3 in force, and still leads its matrix with
"Answer the flags". All three are reversed by I140-errata, which is 111 lines
below it. **I140 must not be read without I140-errata.** The same holds for
I141 and its errata on the money seam.

**Open, deliberately, and not closed by this program:**

- *Kody's flag-on walk is owed.* Nothing is deployed; the flag has never been
  turned on in front of a human.
- *The I114 section↔stage mapping session is still owed by Kody.* Every wave
  left `active_section` standing as the sealing authority rather than touch it.
  Any future sealing-semantics work is gated on that session.
- *The Offer has no editable home on the Speccing table.* This is the reason
  the press was descoped: step two of Q5's two-step retirement is a later
  release, and the Drafting Room stays open in both flag states until the
  Offer can be authored on the paper.
- *A flagged line on a sent proposal cannot be answered anywhere today.* A
  pre-existing product gap that this program surfaced rather than created —
  main's Desk `?flagged=1` walk-in has the same defect. Documented in
  I140-errata as the gap to close, not the leader to restore.
- *Money does not seam on the install or care spread.* Scoped out in I141
  because money does not mount there and a seam would be both a new mount and a
  second accounts surface. Its own future ruling.
- *The reach-in drops the piece's category* (`ffeCategorySlug: null`) *and
  lands its lines Unassigned* (`scopeRoomId: null`).
- *The Scheme omits the verdict chips and the compose-decision wiring* —
  direction-stage client verdicts do not print on the paper.
- *The intake header opens one new gated query on a discovery document.* The
  lane's only new read, enabled only where the header stands.
- *Four small items are known and accepted:* the client's copy can mount the
  preview rail twice; the lifted release leader drops focus on press;
  `onReleaseOffered` is not withdrawn on unmount; and the Finalize table has a
  zero-leader edge where every line is approved, the nudge is withheld and the
  proposal is still out.

*Entries add: I143 · last id = I143*

### I144 · Splat interior camera — orientation reversal, exterior→interior framing, scale-invariant wheel zoom — 2026-08-25

Not a Document-workstream change — Room View's SPLAT projection
(`apps/designer-portal/src/components/document/rooms/room-view/{splat,orbit}/`) — but
recorded here per this file's own convention for a decision that reverses a prior
entry's stated design and that a designer would notice. Branch
`fix/splat-interior-camera`, worktree `.codex/worktrees/agent-splatcam`. No merge, no
deploy — implementation only, against a completed recon.

**What was wrong.** The first Splat render was an inside-out blob, from three
independent causes:

1. **Orientation.** The `SplatMesh` was added UNROTATED. Spark's own quickstart
   applies a 180°-about-X flip because a typical COLMAP-trained splat is Y-down; our
   .spz is nerfstudio-trained from ARKit poses and the pipeline applies its own
   world-up change of basis (`ARKIT_TO_NERFSTUDIO`, a +90° rotation about X,
   `services/scan-modal/…/transforms.py:57-77`) BEFORE training, then trains with
   `--orientation-method none` so nothing further reorients it. An unrotated mesh put
   the room's height on the wrong axis.
2. **Framing.** `frameSplat → frameRoom` (`orbit/controls.ts`) was authored for the
   EXTERIOR Orbit diagram — radius 1.35× the plan diagonal, clamped to
   `[0.6×, 2.55×]` — which backs a camera OFF a room to frame the whole box from
   outside it. The entire clamp band sits outside a room's own walls.
3. **Wheel zoom.** `radius += deltaY × 0.03` is an additive, fixed-WORLD-UNIT step
   tuned for Orbit's feet-scale room (r ≈ 32) — imperceptible on a metre-scale
   interior, oversaturated on anything smaller. `deltaMode` (Firefox "lines") was
   unhandled.

**What changed, file by file.**

- `splat/splat-scene.ts` — exports `SPLAT_ORIENTATION` (the composed quaternion: Spark's
  180°-about-X ∘ the inverse of `ARKIT_TO_NERFSTUDIO`'s +90°-about-X; both share the X
  axis, so they commute and collapse to a single 90°-about-X rotation, numerically
  identical to `ARKIT_TO_NERFSTUDIO` itself — a coincidence of the two corrections
  sharing an axis, not one constant standing in for the other) and `orientBounds(box,
  orientation)`, a pure, jsdom-testable rotation of a mesh-local `Box3` via
  `Box3.applyMatrix4`. `frameSplat` is replaced by `frameSplatInterior(box)`: target =
  splat centroid at `box.min.y + 1.6 m` (eye height — `cameras.py`'s Modal-side rig
  uses 1.5 m for a different shot, the two were never required to match); radius =
  `min(0.35 × half-diagonal, 1.2 m)`, clamped to `[0.15 m, 0.9 × half-diagonal]`;
  azimuth kept at Orbit's 0.82 (now `export`ed from `controls.ts` as `DEFAULT_AZIMUTH`
  rather than duplicated); polar flattened to `π/2` (still passes through
  `createOrbitController`'s shared `[MIN_POLAR, MAX_POLAR]` = `[0.35, 1.45]` clamp, so
  the live look settles at ~1.45 rad — "flattened to ~π/2", not exactly π/2, and the
  band was left shared rather than narrowed for Splat alone); an oversize-plan guard
  (`hypot(size.x, size.z) > 40 m`) falls back to the same unit-room framing the
  degenerate/non-finite guard already used, for a floater-polluted or non-metric splat.
  `defaultSplatOrientation(url)` keys identity vs. `SPLAT_ORIENTATION` on the URL
  (`/fixtures/…` → identity) rather than inferring it from geometry — see the fixture
  note below. `buildSplatScene`'s header is amended: it still touches neither
  rotation, position, nor scale; the reversal from "never rotated" happens one layer
  up, in `splat-canvas.tsx`, before either the mesh or the bounds reach this function.
- `splat/splat-canvas.tsx` — sets `splatMesh.quaternion` to the resolved orientation
  and calls `orientBounds` on the measured box BEFORE `buildSplatScene`, because
  `getBoundingBox()` is mesh-LOCAL and does not reflect the object's own transform (the
  quaternion fixes the render, `orientBounds` is what makes the camera agree with it).
  `SplatCanvasProps` gains an optional `orientation` escape hatch; every real caller
  omits it. `near` (from `clipPlanes`) is clamped to `≥ 0.05` — the interior
  `minRadius` (0.15 m) drove the raw formula to ~0.0015, a near plane close enough to
  z-fight against the room.
- `orbit/controls.ts` — wheel zoom is now multiplicative:
  `radius = clamp(radius * exp(deltaY_px × 0.0015), minRadius, maxRadius)`, with
  `deltaMode` (Firefox lines → pixels, ×16) normalized first via the new exported
  `normalizedWheelDelta`. One mouse notch (deltaY ≈ 100) → ×1.16 (~15%); one trackpad
  tick (deltaY ≈ 3) → ×1.0045 (~0.5%). Shared by Plan, Orbit, Mesh, and Splat — a feel
  change on all four, not a Splat-only tweak. `DEFAULT_AZIMUTH`, `MIN_POLAR`, and
  `MAX_POLAR` are now exported for `splat-scene.ts` to share rather than duplicate.

**The fixture question, reconciled by the orientation-prop route, not by
regeneration.** `scripts/make-splat-fixture.mjs` builds
`/fixtures/splat/room-fixture.ply` Y-up by construction — it never passes through the
ARKit→nerfstudio pipeline, so it needs identity orientation, not `SPLAT_ORIENTATION`.
The fixture was NOT regenerated. Instead, orientation is a declared property of the
SOURCE (`defaultSplatOrientation`, keyed on URL, with `SplatCanvasProps.orientation` as
an explicit override), so the dev fixture keeps passing identity while the real .spz
path gets `SPLAT_ORIENTATION` — a green fixture render can never stand in for having
verified the real, rotated path.

**Tests.** `splat/__tests__/splat-scene.test.ts` extended: interior framing (target
centroid + 1.6 m, radius below the half-diagonal, minRadius/maxRadius inside the
shell, an absolute-cap case, degenerate + oversize fallbacks), `orientBounds` (a
worked 90°-about-X rotation, identity passthrough, empty-box passthrough),
`SPLAT_ORIENTATION`'s own components, and `defaultSplatOrientation`'s per-source
behavior. `orbit/__tests__/controls.test.ts` (already existed — this program's file
list said otherwise) gains a `wheel zoom` suite: multiplicative ratio invariant across
room scales, the exact ~15%/~0.5% ratios, both clamps under repeated zoom, deltaMode
line normalization (and pixel/line equivalence), and `preventDefault` — plus direct
`normalizedWheelDelta` unit tests. `splat-chunk-boundary.test.ts` was left untouched
and still passes: `splat-stage.tsx` was not touched.

**Out of scope, deliberately — geometry plumbing, not this program.** No component
between the resolved splat URL and `SplatCanvas` (`splat-stage.tsx`,
`dev-splat-url.ts`, `room-view.tsx`) was touched. `defaultSplatOrientation`'s
`/fixtures/…`-prefix keying is what makes the real app's actual dev-fixture walk
correctly resolve identity without any of those files changing — but if the dev
`?splatUrl=` override is ever pointed at some OTHER non-`/fixtures/` path that also
happens to be Y-up, it will incorrectly receive `SPLAT_ORIENTATION`. That is accepted:
the only committed non-pipeline source is the `/fixtures/` fixture, and the override's
own header already scopes it to same-origin relative paths.

**Also out of scope, per the brief:** Walk mode; any change to `splat-stage.tsx`,
`dev-splat-url.ts`, or `room-view.tsx`; regenerating the fixture; any new chrome or
controls UI (D1); shadows of any kind (D4).

*Entries add: I144 · last id = I144*

### I145 · Splat interior camera — I144's orientation sign was INVERTED, corrected + hardened on adversarial review — 2026-08-25

Not a Document-workstream change, recorded here per this file's convention — same
scope as I144 (branch `fix/splat-interior-camera`, PR #37, worktree
`.codex/worktrees/agent-splatcam`). This entry does not edit I144; it corrects it.

**The finding.** Adversarial review of I144 proved `SPLAT_ORIENTATION`'s sign backward,
and an empirical measurement of the REAL prod .spz settled it with certainty rather
than argument: sha256-verified artifact `88dbefcd…` (29,397,094 bytes, 1,324,278
gaussians, SPZ v3, fracBits 12); robust per-axis center statistics (300k samples) — X
p2–p98 span 7.57 m (≈ the room's 7.67 m plan length), Y 6.55 m, **Z 3.27 m ≈ the
3.30 m wall height exactly, 90% of the mass in a 2.41 m window, strongest density peak
(16.5% of bin mass) at the LOW end of that window — the floor plane.** That confirms
the data is nerfstudio Z-up exactly as `transforms.py` implies, with z increasing from
floor to ceiling. I144's derivation also composed in a Spark-internal "180°-about-X
flip" that does not exist: `@sparkjsdev/spark@2.1.0`'s own source shows
`SplatTransformer` consuming a mesh's `matrixWorld` verbatim — the quickstart's flip
is a per-asset correction for one COLMAP demo splat's own authoring frame, not a
renderer convention. Composing a nonexistent 180° flip with the real −90°-about-X
correction (the inverse of `ARKIT_TO_NERFSTUDIO`) landed on `+90°-about-X` instead —
the ceiling rendered BELOW the floor.

**The fix.** `SPLAT_ORIENTATION` is now `new THREE.Quaternion(-Math.SQRT1_2, 0, 0,
Math.SQRT1_2)` — `−90°` about X, undoing `ARKIT_TO_NERFSTUDIO`'s `+90°` alone, nothing
else composed in. `splat-scene.ts`'s header comment is rewritten to derive this
directly and cite the empirical measurement; `splat/README.md`'s Orientation section
matches. A new `orientation × framing — physics invariant` suite in
`splat-scene.test.ts` proves the correction: for a floor-at-z=0 local box,
`orientBounds(...).min.y ≈ 0` and `.max.y ≈ h` (ceiling above floor), and
`frameSplatInterior(oriented).target.y ≈ 1.6` (eye above the real floor, not
underground). Reverting `SPLAT_ORIENTATION` to I144's `+90°` value makes every
assertion in that suite fail — proved once, by running the new tests against the old
sign before applying the fix, then again after.

**Merge conditions closed alongside the sign flip.**

- **Vertical/floater guard.** `frameSplatInterior`'s eye height is now `clamp(box.min.y
  + EYE_HEIGHT_M, box.min.y, box.max.y)`, not a bare sum — a stray floater far below
  the true floor, or a low/partial scan with under 1.6 m of headroom, can no longer
  put the eye outside the box the scan itself spans (underground in the first case,
  above the ceiling in the second). Two new tests cover both shapes.
- **Polar consistency.** `INTERIOR_POLAR` is now `MAX_POLAR` (1.45 rad) directly,
  not a bare `Math.PI / 2` that `createOrbitController`'s shared clamp band would
  silently correct downstream. The `CameraFraming` `frameSplatInterior` returns is now
  internally consistent: its own `polar` field already equals its own `maxPolar`
  field, rather than a value outside the range the same object claims as its bounds.
  The existing polar test was updated to assert `MAX_POLAR` instead of `π/2`.
- **`orientation` prop dropped, `eslint-disable` removed with it.**
  `SplatCanvasProps.orientation` — an escape hatch no real caller ever used — is
  removed; `SplatCanvas` now resolves `defaultSplatOrientation(splatUrl)` internally
  only. Its removal also let the effect's blanket `eslint-disable-next-line
  react-hooks/exhaustive-deps` go: with `orientation` gone, the only prior
  justification for it was `debug`, and `debug` (the hook value) was never actually
  read inside the effect body to begin with — only in the JSX below it — so the rule
  has nothing left to flag. `eslint` on the file now reports "Unused eslint-disable
  directive" with the comment still in place; deleting it is what item 6 calls for.
  Tests that need a specific orientation call `orientBounds` /
  `defaultSplatOrientation` directly rather than through the prop.
- **Two prior corrections in I144's own account, fixed here rather than in place
  (I144 is append-only):**
  - *Shared-controls surface count.* I144 said wheel zoom is "shared by Plan, Orbit,
    Mesh, and Splat" — four surfaces. It is three: Plan is plain SVG with no wheel
    handler and never rides `orbit/controls.ts` at all. `controls.ts`'s header and its
    `WHEEL_ZOOM_RATE` comment, and `splat/README.md`'s wheel-zoom section, now say
    Orbit/Mesh/Splat.
  - *Near-plane raw value.* I144 said the interior `minRadius` "drove the raw
    `clipPlanes` formula to ~0.0015." `clipPlanes` (`model-scene.ts:55`) already floors
    `near` at `0.01` regardless of `minRadius`, so the value actually reaching
    `splat-canvas.tsx` was `0.01`, not `~0.0015`. The raise to `≥ 0.05` stands (`0.01`
    still z-fights at typical room scale) — only the stated reason changes.
    `splat-canvas.tsx`'s comment and `splat/README.md` gain a corrected account.

**Tests.** `splat/__tests__/splat-scene.test.ts`: `orientBounds`'s worked example
updated to the corrected sign (ceiling now lands at oriented `y′ = 3`, not `y′ = 0`,
for a local box with height 3); `SPLAT_ORIENTATION`'s own-component test updated to
`x ≈ −√½`; the polar test updated to assert `MAX_POLAR`; four new tests — the two
physics-invariant tests described above, and two floater/low-scan guard tests. No
other suite needed touching: `splat-canvas.test.tsx` never exercised the dropped
`orientation` prop, and `orbit/__tests__/controls.test.ts`'s wheel-zoom suite was
unaffected by the surface-count correction (it was prose, not an assertion).

**Out of scope, same boundary as I144.** No change to `splat-stage.tsx`,
`dev-splat-url.ts`, or `room-view.tsx`; no new chrome or controls UI (D1); no shadows
(D4); no fixture regeneration; no merge, no deploy.

*Entries add: I145 · last id = I145*

### R124 · The Wayfinding Review — rulings on the ten questions — 2026-08-25

**Ruled by Kody (interviewed).** Deck: `artifacts/document-wayfinding-directions-2026-08-25/presentation.html`,
published at https://claude.ai/code/artifact/b8c4ac51-b7a8-473f-9b23-3a3a21a7a03d. Program folder:
`artifacts/document-wayfinding-directions-2026-08-25/` (source docs in `source/`). Ruled against
`main@695addb5f`. Method: nine seats (five UX/UI lenses, four Interior Design practitioner personas)
reviewed `/desk` and `/doc/[id]` against both baselines (flag off, and flag `worktable` on — the
Worktable's first-ever render); 86 verified shots, 203 raw findings collated to 101, 92 surviving
three refuters. Two directions were judged: A "Everything Prints" (`source/direction-a.md` v2, zero
canon amendments) and B "The Shop Ticket" (`source/direction-b.md` v2, two amendments to I136).

1. **Sequence.** One program, not two concurrent lanes — A and B edit the same five files
   (`ffe-section.tsx`, `doc/[id]/page.tsx`, `command-bar.tsx`, `document-index.ts`, the shelves), so
   they never build concurrently. A ships first: the 20 shared planks (`source/shared-planks.md`) +
   A's first slice ("the sentence and the spine," 5–7 days, unflagged), then A's remaining waves. B
   follows, built on top of A's mount fix, behind the fail-closed flag `job-ticket`. B's own rulings
   (items 4–6 below) are taken now, ahead of its build.
2. **C14 / I138 reading — NARROW.** *"the flag off is main's composition exactly"* (I138, :8740–8742)
   binds the `worktable` guard only. It does not freeze other shipping: A's unflagged first slice and
   B's `job-ticket` flag may both land ahead of Kody's still-owed flag-on Worktable walk.
3. **T4 / T2 — accepted, logged as open-by-choice.** No fleet view; "install" stays a label on
   project mode, not a mode. A's ⌘K "Where the work stands" group answers the phase-wide question one
   stage at a time; B's stage-grouped Desk roster answers it at zero acts, but not until B's wave two.
   Neither first slice prints a studio-wide receivable. The three-person-studio principal (P2) is told
   this rather than worked around.
4. **Ticket gate — redrawn as a sticky seam.** Ahead of B1/B2 taking effect, the ticket is redrawn:
   it collapses to B's own two-line 390 form once the letterhead scrolls past, at every width. Kody
   reviews the redraw himself; no P1/P3 stand-in walk.
5. **B1 — RATIFIED, conditional on the sticky-seam redraw (item 4) passing Kody's review.** Amendment;
   see ledger below.
6. **B2 — stands with B1.** Amendment; see ledger below.
7. **I114 candidate — no ruling now.** B's section↔stage mapping (brief→Consultation ·
   discovery→Schematic Design · direction→Design Development · proposal→no phase · project→
   Procurement & Orders · install→Installation & Styling · care→Completion) is placed on the agenda
   of Kody's still-owed I114 session as its opening proposal. Nothing built depends on it.
8. **The Moved rung — vendor payouts exposed.** The Money region gains a read on the accounts data
   the band already holds; `Moved` becomes ordered − paid out to makers, so the rung differs from
   `Authorized`. Until that read lands, both lanes keep SP-03 (`Committed` → `Authorized`) and
   SP-04's gloss, *"ordered through installed (committed, not yet paid out)."*
9. **F03 — fixed with A's first slice, as shared plank SP-01.** The care spread's FF&E section stops
   mounting with `mode="install"` (its heading currently reads "Install"); no standalone hotfix ahead
   of the slice.
10. **Four unowned defects — scheduled, each its own ticket outside both directions.**
    a. `/room/<id>` prints a raw PostgREST error — *"Cannot coerce the result to a single JSON
       object"* — on screen for a valid room id. Bug; owner is Room View.
    b. F56 — contrast: clay `#C4A57B` and terracotta `#D4A090` as text ≈2.2:1 across ~374 sites; the
       red-letter eyebrow `#C4836F` ≈2.95:1 — both under WCAG 2.2 AA's 4.5:1.
    c. F55 — no skip link / bypass-blocks control in the `(document)` layout.
    d. F58 — the same FF&E line reads "Received" on the paper and "Delivered" in the spec book — a
       data-model ruling, not a rename.
11. **Ledger hygiene — the Thumb Index.** Kody removed it verbally in July 2026 ("do not
    re-propose"); a grep of this ledger for it returns zero hits before this entry. This item is that
    record. Item 3 above is T4/T2's own open-by-choice record.
12. **The deck.** Gains a "Ten questions, ten answers" section and republishes at the same URL —
    tracked as production, not itself a design ruling.

**Amendment ledger — B1 and B2, both clauses of one entry (I136). Counted as two, per the I138-A5
form.**

**B1 — the mount gate.** Amends I136. Quoted (`:8435`): *"The spine grows three blocks — ≥1440px
only."* **Gains:** rooms, drawings, spec book, boards and roster become one act at every tier on all
seven sections — closes F01, F14, F48, F72, half of F82. **Gives up:** the shelved spine as an
organ — both blocks deleted, ~180px of every document's measure returned to the ticket. **Rollback:**
`job-ticket` off restores both blocks byte-identically — the deletion must be built as a flag branch,
not an unconditional delete, so the flag genuinely restores them (feasibility judge's condition,
`source/judge-feasibility.md:63`). **Condition:** ratified only if the sticky-seam redraw (item 4)
passes Kody's review.

**B2 — the lens's width release.** Amends I136. Quoted (`:8462`): *"The hold releases if the window
drops below 1440px, where nothing on screen could put it down."* **Gains:** a held room lifts at 1280
and 390 — the clause's own stated reason stops being true once the ticket's room chip exists as the
put-down affordance at every width. **Gives up:** the guarantee that a lift is only ever seen beside a
full spine. **Rollback:** `job-ticket` off restores the auto-release. **Condition:** stands or falls
with B1; I136's never-filters clause is untouched.

Nothing built; build order = program (A waves, then B behind `job-ticket`).

*Entries add: R124 · last id = R124*

### R125 · The Wayfinding Review — build rulings — 2026-08-25

**Ruled by Kody**, after `program-plan.md`'s build sections (§§3–7, completing the plan R124 already
amended) were reviewed. Program folder: `artifacts/document-wayfinding-directions-2026-08-25/` (plan:
`build/program-plan.md`; F58's options: `build/f58-options.md`; F56's inventory: `build/f56-plan.md`; the
Moved-rung read: `build/moved-plan.md`). These are rulings on how the program builds and ships; R124
already settled what it contains, its sequence, and the ten design questions.

1. **One program, one shipment.** The entire program — Direction A's three waves and Direction B's three
   waves — is built and shipped to production as ONE program, A then B, never concurrent. R124 item 1
   already ruled this for the build; this extends it through shipping: nothing of A goes live while any of
   B is still mid-build, and nothing of B goes live before all of A is live. No lane, no exception.

2. **No feature flags anywhere.** R124's `job-ticket` flag — *"B follows, built on top of A's mount fix,
   behind the fail-closed flag `job-ticket`"* — is **waived**. The B1 amendment's own condition, *"the
   deletion must be built as a flag branch, not an unconditional delete, so the flag genuinely restores
   [the spine's rooms and shelves blocks]"* (R124's B1 amendment-ledger entry), no longer applies: there is
   no flag, so B1-L2 deletes both blocks outright. The **B1 sticky-seam review gate is waived**: R124 item
   4's *"Kody reviews the redraw himself; no P1/P3 stand-in walk"* is superseded — the sticky seam ships on
   the wave's own rendered-walk acceptance (program-plan.md §3) like every other lane, with no separate
   pre-ship checkpoint. **B ships GA directly**, end to end, no flag anywhere in it. Rollback for any part
   of the program is a **revert commit** (program-plan.md §4.4), never a toggle. The **pre-existing
   `worktable` and `call-sheet` flags are untouched** — this program neither reads nor writes either one,
   and R124 item 2's narrow C14 reading stands exactly as ruled: it binds the `worktable` guard only, so
   B2-L4's Worktable composition still lands behind `worktable` precisely as program-plan.md §2 (Wave B2)
   already describes, unaffected by this item.

3. **Two production deploys.** DEPLOY A once A3 merges to `main`; DEPLOY B once B3 merges to `main`.
   Nothing else ships to production in between, before, or immediately after, per item 1.

4. **Full scope**, stated once: (a) Direction A's three waves in full — A1, A2, A3; (b) Direction B in
   full, not a first slice — the ticket on all seven document sections (B1 and B2-L1), the stage-grouped
   Desk roster (B2-L2), `deriveTicketLeader` (B2-L3), and the Worktable composition (B2-L4); (c) F58 per
   **Option 3** of `build/f58-options.md` — one shared derivation, one word per state: **DELIVERED**
   (arrived, awaiting inspection) · **RECEIVED** (inspected, full count) · **PARTIAL** (inspected, short) ·
   **DAMAGED** (an open claim on the line); the FF&E board's own stage dropdown keeps reading `Received`
   for `status = 'delivered'`, because it names a column value a line can move to, not the document's
   richer inspection-aware stamp; (d) F56, repo-wide — new `-ink` companion tokens carry AA text contrast,
   the existing clay/terracotta tokens stay untouched for rules and fills; (e) F55, the skip link; (f) F21
   and F11, the two focus-restore defects; (g) `Moved` on the money ladder computed as ordered minus vendor
   payouts — `authorized − sum(po_payments.amount_cents where po_payments.state = 'paid')` per project,
   reading data `usePurchaseOrders` already selects, with **no migration**.

5. **The record.** The I-entries at `program-plan.md` §6 (I146–I153) are this build's ledger, written by
   each wave's own integration lane as it lands. Nothing else in R124 — the ten questions, the I136
   amendment ledger, the Thumb Index note, the I114 agenda item, the four unowned defect tickets not named
   in item 4 above (the `/room/<id>` PostgREST error stays Room View's) — changes.

Nothing built yet by this entry; build order = program (A's three waves, then B's three waves, no flags,
two deploys, per items 1–3 above).

*Entries add: R125 · last id = R125*

### I146 · Wave A1 — the sentence and the spine — 2026-08-25

Wave A1 of "The Wayfinding Review" build shipped. Seven stage sentences replace the guide's shrugs (F18),
with the two ⌥-templated dated headlines (install, proposal) built from real facts and never a fabricated
date; `Review` retires from every guide label; `po_unacknowledged`/`po_unsent` repoint to the FF&E line
instead of the ledger (C12); the new `rankOperationalNeeds` tie-break orders the red-letter zone and the
guide identically. The shelved spine's mount predicate widens to install and care (F14, the blocker A1
exists to fix); the running index derives from the spread's actual mount order via a new
`paperRegionsForSection` helper rather than a fixed four-row assumption (C11); a composed-but-empty need
list prints the guide instead of nothing (F77). The FF&E spread's `Spec book →` door ungates on install
(F48); the care head reads `Care`, not `Install` (F03/SP-01, Kody's ruling answer to R124 item 9);
`Add to project` becomes `Add a line` in both `ffe-section.tsx` and `command-bar.tsx` (SP-09). ⌘K drops
its "Engine" framing (SP-07). No canon amendment beyond what R124 already ratified.

Ships unflagged, per Kody's 2026-08-25 ruling (R125 to follow, as R125 itself already codified: no flags,
two deploys total for this program — DEPLOY A once A3 merges, DEPLOY B once B3 merges — nothing ships to
production from this merge alone). Gate on `main` after the merge: `pnpm --filter @patina/designer-portal
type-check` clean; `pnpm --filter @patina/designer-portal test -- --ci` — 428 suites / 4601 tests passed
(baseline before this wave was 426 suites / 4513 tests; this wave added 2 suites / 88 tests), all green.

Deferred to A2/A3: SP-02, 03, 04, 05, 10, 11, 13, 14, 15, 16, 17, 19, 20; the F55 skip link and F21/F11
focus-restore fixes; the six-rung money ladder and `vendor-payouts.ts`; the `Design authority` → `Money`
rename; ⌘K's `WHERE THE WORK STANDS` group and `This surface` group; the FF&E spread's single-leader
election and 390 wrap rule; the mobile bar's single primary act and `In this document` menu group; and the
direction B graft of seven rest-state sentences into A — all per program-plan.md §6's I147/I148 scope.

*Entries add: I146 · last id = I146*

### I147 · Wave A2 — the remaining planks and the small a11y fixes — 2026-08-26

Wave A2 of "The Wayfinding Review" build shipped. The ten planks SP-02, 10, 11, 13, 14, 15, 16, 17, 19, 20
land; SP-03/04/05 are deliberately deferred into A3-L1's money-ladder lane rather than landed twice. Two
accessibility defects close: F55 (a new `skip-to-paper.tsx`, the first focusable element in
`(document)/layout.tsx`, targeting `data-document-paper`) and F21/F11 (⌘K and the ledger sheet both now
capture and restore `document.activeElement` on open/close, with a `fallbackFocusRef` for F11's
disconnected-trigger case). F41/SP-20 gives setup chores and dated overdue needs visibly distinct stamp
colours by need kind, with no new count or badge (C4 held). Two A1 e2e follow-ups land alongside: the folio
pick-up act's assertion in `action-visibility.spec.ts` now checks the accessible label on the card the
primary belongs to rather than the Link's own (empty) textContent — FolderFace prints the legible label as
a full-bleed sibling in front of the Link, not inside it, so "one legible primary per region" holds but the
node carrying the words differs from what A1's test assumed; and the workflow stage-line assertion accounts
for its wrap behaviour at the 320px viewport.

Ships unflagged, per Kody's 2026-08-25 ruling (R125): no flags, two deploys total for this program — DEPLOY
A once A3 merges, DEPLOY B once B3 merges — nothing ships to production from this merge alone. Gate on
`main` after the merge: `pnpm --filter @patina/designer-portal type-check` clean; `pnpm --filter
@patina/designer-portal test -- --ci` — 432 suites / 4635 tests passed (baseline before this wave was 428
suites / 4601 tests; this wave added 4 suites / 34 tests), all green.

Deferred to A3: SP-03/04/05 (the money-ladder lane, A3-L1); the six-rung money ladder and
`vendor-payouts.ts`; the `Design authority` → `Money` rename; ⌘K's `WHERE THE WORK STANDS` group and `This
surface` group; the FF&E spread's single-leader election and 390 wrap rule; the mobile bar's single primary
act and `In this document` menu group; and the direction B graft of seven rest-state sentences into A — all
per program-plan.md §6's I148 scope.

*Entries add: I147 · last id = I147*

### I148 · Wave A3 — the lexicon, ⌘K, money, mobile, the leader — 2026-08-26

Wave A3 of "The Wayfinding Review" build shipped — the largest wave and the last before DEPLOY A. The
six-rung money ladder (`Budget · Plan · Authorized · Moved · Owed · Not drawn`) ships via two new pure
modules, `money-ladder.ts` and `vendor-payouts.ts` — the latter Kody's ruling 10 (R124 item 8): `Moved` is
`Authorized − sum(po_payments.amount_cents where state='paid')`, reading data `usePurchaseOrders` already
selects, with no migration; `Design authority` retires everywhere in favour of `Money`. The spine index and
shelves lose the `knowledge` entry (F12, closing I136's open item) and gain corrected rail labels (F02),
with `Pieces` and `The record`/`The studio today` renames landing across the Desk's header acts and content
rows (F24/F38/F39/F65/F90). ⌘K gains its `WHERE THE WORK STANDS` empty-query group (F04) and a four-row
`This surface` group (F29/F48/F50/F82); `The Scans` replaces `The Rooms` and `Ledgers` replaces `Studio
books` in both ⌘K and the studio drawer, whose own `Find anything ⌘K` door now prints as a fourth row
(`Library · People · The Scans · Ledgers ↑ · Find anything ⌘K`). The FF&E spread elects exactly one leader
per exception class (F34/F08, new `ffe-leader.ts`), and every region head gains the 390 wrap rule
(F28/F87, direction B's graft into A). The mobile bar registers a true single primary act read off the
red-letter zone and gains an `In this document` menu group (F07/F49). Seven rest-state sentences replace
the guide's quiet-case shrug on every stage (direction B's §3.3 graft into A). `NeedLine` gains `dueOn` and
`owner` (A3-L7), and `need-tie-break.ts`'s `rankOperationalNeeds` reads them into a new dated/owned rank
ahead of the kind-based fallback — a hard outside deadline inside seven days with a non-designer owner
outranks everything, an already-past `dueOn` sorts oldest-first within its rank, and an undated need owned
by the designer ranks as the studio's own pen — while a need this wave left undated and unowned still ranks
exactly as A1-L2 first shipped it. Ships unflagged, per R125 item 2: no feature flags anywhere in this
program, GA on merge.

Gate on `main` after the merge: `pnpm --filter @patina/designer-portal type-check` clean (0 errors); `pnpm
--filter @patina/designer-portal test -- --ci` — 437 suites / 4753 tests passed (baseline before this wave
was 432 suites / 4635 tests; this wave added 5 suites / 118 tests), all green; `pnpm --filter
@patina/designer-portal lint` — the same 2 pre-existing errors (`piece-room-save-gate.test.tsx:159:1`
`import/first`, `use-commercial-documents.test.ts:930:8` `react-hooks/rules-of-hooks`, both untouched by
this wave) + 200 pre-existing warnings, no new lint regressions. DEPLOY A follows once this wave's
integration lane (A3-L8) merges and the full gate is green on `main`, per R125 item 3 — deployment itself is
recorded separately once it happens, at I153. Deferred to B, in full per R125 item 4: the job ticket
(B1/B2), the Desk's stage-grouped roster and `deriveTicketLeader` (B2), the Worktable composition behind
the pre-existing `worktable` flag (B2-L4, untouched by this program), F58's Option 3 stamp-label unification
(B3), and F56's repo-wide `-ink` contrast tokens (B3).

*Entries add: I148 · last id = I148*
