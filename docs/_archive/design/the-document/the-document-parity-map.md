# THE PARITY MAP — old portal → The Document

**Source:** live walk of localhost:3000/portal, 2026-06-12 (design session, in-browser).
**Purpose:** Leah's L3 verdict — "still needs the complete functionality" — made
concrete. Every surface the old portal carries, sorted by what The Document does
about it. Bucket C is the real product of this walk: the gaps we have not yet
DEFINED, let alone built.
**How to read:** A = parity at flip, nothing to do. B = destiny already ruled
(R5/R18), build pending in dissolve stages. C = undefined — each needs a design
ruling before anyone writes code.

---

## Walk inventory (what the portal actually is, June 2026)

Zones: **Today · Pipeline · Procurement · Billing · Products · Aesthete ·
Clients · Messages** + header (+ New, timer w/ project picker, ⌘K, alerts,
help, chat).

- **Today:** greeting · stat strip (leads / active / month $ / avg match) ·
  Overdue decisions · procurement summary (arriving / inspections / claims).
- **Pipeline:** chronological engagement list (Leads / Proposals / Active /
  Completed / **Rooms** tabs) · + Add Lead / + New Proposal / + New Project.
- **Project detail** (the workhorse — /projects/[id] + /decisions /ffe /time
  /scope-change /edit /financials): edit mode · **Client View** · **Send
  Update** · Proposal / Client / **Room Scan** / **Documents** header actions ·
  stat strip (progress, budget, committed, invoiced, FF&E, decisions, hours
  vs est.) · **Project Scope by Room** (per-room FF&E, budget allocation,
  progress) · **Phase Timeline** (approval gates, deliverables, sign-off,
  per-phase tasks, + Add Phase) · procurement block w/ batch order ·
  **Financials** (budget vs committed vs actual vs variance by category/room ·
  margin w/ trade cost · **Your Earnings** — design fee + commissions ·
  payment milestones that auto-invoice on trigger conditions · Generate
  Invoice · Export) · **Documents** (version-controlled uploads) · time block
  w/ phase estimates · **Recent Activity** (event feed) · comms thread ·
  **Project Team** (invite designer / add bookkeeper / reassign lead) · quick
  actions (+ Initiate scope change · **+ Brief vendor**) · Put on hold ·
  Archive.
- **Procurement:** By Vendor (terms badges — NET 30 / 50-50 / FULL UPFRONT /
  PATINA CATALOG · per-PO payment schedules w/ deposit-mid-balance chips ·
  send/ack lifecycle · **Order via Patina** · **Order all** · **Export to
  QBO**) · By Status · **Calendar** (cross-project delivery/install timeline
  w/ CONFLICT detection — overlap/late/drift) · **Receiving** (cross-project
  queue: arriving / pending inspection / damage claims / cleared · inspection
  pass rate).
- **Billing:** Invoices (status filters, + New Invoice) · **A/R** (aging
  buckets + Send reminder dunning) · Time · Earnings (tab present, stub).
- **Products:** the three-layer Library — **My Library / Studio Library /
  Patina Catalog** · capture → promote → nominate · Chrome-extension/photo/URL
  capture · Needs Teaching / Drafts filters · Import.
- **Aesthete:** **Teaching Queue** (daily goal, accuracy, impact · Quick Tags
  ~5min vs Deep Analysis ~15min) · **The Aesthete Engine** (/portal/companion)
  — a conversational AI surface: find products, style recs, market trends,
  "every prompt feeds back into your Aesthete profile."
- **Clients:** list + lifecycle filters · studio stats (lifetime revenue, avg
  satisfaction, referral rate) · **Reviews / Nurture Queue / Decisions** tabs.
- **Messages:** Inbox / Direct / Projects / **Vendors** / Archived.

---

## A — Covered: parity exists at the flip (no action)

| Old surface | Document home |
|---|---|
| Today (greeting, overdue decisions, procurement to-dos) | The Desk — needs-your-hand + in-motion (R10/R22 calibrated) |
| Pipeline list | Desk + ⌘K + fill-state marks; lifecycle = the document growing |
| Project FF&E board + stamps | Project section lines, R2 stamps, unfolds |
| Decisions (per-project + overdue) | decision margin kind + Desk |
| PO send / ack / expediting / partial receiving | the send weave (R18), Orders ledger v2 |
| Per-line receiving inspection + per-item claims | unfold inspection drawer (I17) |
| Client project messages | message margin kind, anchored |
| Invoice draft/send on milestone | Money margin kind + auto-draft trigger |
| Time capture, header timer, manual log | spine/bar timer, chain-out, Hours ledger |
| Weekly client reassurance | the Pulse (+ email leg) |
| Scope change initiation | the Note → SCA escalation (R14; scope_change_requests live) |
| New lead intake | Brief section born on the Desk |
| Search (⌘K) | ⌘K extension (Slice 6, with fill-state rows) |

## B — Defined, build pending (destiny ruled; dissolve-stage work)

1. **Library ledger** — the three-layer catalog (My/Studio/Patina) + teaching
   mode (R5). The walk confirms scope: capture-promote-nominate, teaching
   queue w/ Quick Tags vs Deep Analysis, Needs-Teaching status. Stage 2.
2. **Accounts book** — A/R aging + Send-reminder dunning, invoice management
   (partially-paid/void states), QBO export, **Your Earnings** (design fee +
   commissions), teaching royalties + the 25% Pledge (R5; the named
   design-session deliverable before build). The walk adds concrete contents.
3. **People book** — clients + studio stats as front-matter (lifetime revenue,
   satisfaction, referral rate = R5's Insights distribution), Reviews
   aggregate, Nurture as a filter + Desk need lines.
4. **Orders vendor pane** — vendor directory w/ terms badges (NET 30 etc.),
   per-vendor order grouping. Ruled in R5; walk confirms required depth.
5. **Inbox retirement** — Messages zone dissolves after §14.10 verification.
   NOTE: verification must now include the **Vendors** thread tab (see C-7).
6. **Ledger front-matter** — Insights distribution (Slice 6 leftover).

## C — UNDEFINED: needs design rulings (the dissolve design queue)

**C-1 · The Aesthete Engine conversational surface** (/portal/companion).
A chat AI inside the portal — product finding, style recs, market trends,
prompts feeding the Aesthete profile. Post-dates the audit; NO destiny exists.
This is "The Companion" arriving on web. Candidates: a drawer-level companion
(the desk's seventh object), a ⌘K mode, or a Library mode. Decision: where
does a conversational surface live in a model whose whole thesis is "no
chrome, just paper"? Highest-stakes undefined item.

**C-2 · Engagement financials in the document.** Budget vs committed vs
actual vs variance by category/room · margin w/ trade cost · designer
earnings · milestone trigger config ("invoices automatically when proposal
signed / phase complete") · Generate Invoice · Export. Engagement-scoped ⇒
the ledger rule says IN the document. Candidates: Project-section
front-matter unfold ("the project's own account page"), or letterhead unfold.
Decision: the document currently shows prices and a payment schedule; it has
no roll-up, no variance, no margin, no earnings. This is the single biggest
in-document parity gap.

**C-3 · Rooms / scope-by-room.** Per-room FF&E grouping, budget allocation,
progress; + Add Room to Scope; Pipeline's Rooms tab. R5 dissolved the rooms
DIRECTORY into documents but the in-document room structure was never
designed — the FF&E section renders flat. Decision: rooms as sub-headings of
the Project section (paper-true: a schedule grouped by room) vs rooms as
unfolds. Also feeds the iOS Room Scan tie-in (C-6).

**C-4 · Phase tasks, deliverables, approval gates.** The six-phase framework
with client sign-off gates and per-phase tasks lives in the old project page;
the document's sections carry state but no tasks, no gate UI, no deliverable
checklists, no phase hour ESTIMATES (Hours has actuals only). Decision: does
the document absorb task management (sub-lines? a tasks unfold per section?)
or does task management deliberately NOT survive the dissolve (the margin +
need lines AS the task system)? This is a philosophy ruling, not a feature
port — flag for a dedicated session.

**C-5 · Project documents / files.** Version-controlled uploads, click to
view/download. The document model has NO file surface anywhere. Candidates:
attachments as margin items (a seventh kind?) vs a Documents unfold on the
letterhead vs section-anchored attachments. Decision needed; also feeds
Discovery (site photos) and Install (punch lists).

**C-6 · Client View · Send Update · Room Scan.** Three header actions on the
old project page: preview-as-client (trust tool), ad-hoc client update (the
Pulse is weekly; "Send Update" is now), and the iOS room-scan data attached
to the engagement. Candidates: Client View = a letterhead action rendering
the client mirror; Send Update = compose-from-letterhead into the comms
thread; Room Scan = Discovery-section artifact (ties §14.8). Three small
rulings, one cluster.

**C-7 · Vendor messaging.** Messages has a Vendors thread tab; the margin's
message kind is client-anchored. Vendor comms are cross-engagement ⇒ ledger
rule says Orders vendor pane. Decision: vendor threads as a pane of Orders
(with PO-anchored deep links into documents) — needs ruling + Inbox
verification dependency (B-5).

**C-8 · Procurement Calendar.** Cross-project delivery/install timeline with
conflict detection (overlap / late / drift). Nothing in the document model
thinks in time-grid. Candidates: an Orders ledger view ("the studio's
delivery week"), or Desk-adjacent. The conflict detection is real
intelligence worth preserving. Decision: does the Orders book get a calendar
page, and do conflicts become Desk need lines ("two installs collide week of
Jul 13")? The latter is very Document-native.

**C-9 · Receiving queue.** Cross-project arriving / pending-inspection /
claims / cleared + inspection pass rate. Per-line receiving is covered;
the QUEUE (a warehouse-day view) is not. Candidate: Orders ledger pane
("Receiving") reusing the same inspection drawer. Light ruling.

**C-10 · Order via Patina + marketplace mechanics.** Catalog vendors carry
PATINA CATALOG badges, "Order via Patina" buttons, PATINA-HANDLED markers —
the three-sided marketplace inside procurement. The Order Assistant covers
per-line ordering; vendor-level batch ("Order all") and the Patina-handled
distinction are unruled. Decision: how the marketplace rail renders in
unfolds + Orders (this is brand-critical — Designer Selections vs Style
Matches commission mechanics eventually surface here).

**C-11 · Per-engagement actions + team.** Put on hold / Archive (the document
renders these states but nowhere SETS them), reassign lead, invite designer,
add bookkeeper, + Brief vendor. Candidates: a quiet letterhead action row
("the document's colophon"). Team membership is also the R14 RLS-widening
dependency (§14.6). One ruling.

**(Resolved by philosophy, noting for completeness):** the Recent Activity
feed. The Document's position is that margins + stamps + the Settled fold ARE
the activity record. Holds unless flight telemetry shows Leah visiting the
old feed — in which case a "history" unfold earns a ruling.

---

## Sequencing recommendation

1. **None of bucket C blocks the flip.** The flip's gates are satisfied;
   ship-alongside means every C surface stays one URL away.
2. **Flight telemetry ranks bucket C.** From day one post-flip, every old-zone
   visit names the gap Leah actually feels. The map above is the menu;
   her feet pick the order. (Predicted top three from L2/L3 behavior:
   C-2 financials, C-1 the Engine, C-5 documents.)
3. **Bucket B proceeds on the existing dissolve staging** (R21), with the
   Accounts/Aesthete-fold design pass first — and C-1 should join that same
   session, since the Engine, teaching, and the Pledge are one brand system.
4. **C-4 (tasks/gates) gets its own dedicated session** — it's a philosophy
   ruling about what the document refuses to become.
5. Everything else is interview-sized: 2–3 rulings per design session in
   telemetry order, same cadence that carried slices 0–6.

**Bottom line:** parity = 13 surfaces already covered, 6 ruled-and-staged,
11 needing definition. The Document is feature-complete to its SPEC; this map
is the spec's next chapter.
