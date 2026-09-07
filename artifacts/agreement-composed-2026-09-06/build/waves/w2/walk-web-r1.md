# Wave 2 web walk — round 1

**Program** "The Agreement, Composed" · Wave 2 close-out
**Date** 2026-09-07
**Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-integration`
(`git rev-parse --show-toplevel` printed exactly that path)
**Branch** `agreement/w2-integration` · **HEAD walked** `f45845816a94b6190d138e427727fac70919de78`
**Stack** local Supabase `127.0.0.1:54322`, migration head `00577` — **not reset** by this walk
**Walker** designer `designer@patina.dev` (owner of two active `design_studio` orgs — the 00566 path),
homeowners `client@patina.dev` and `client-solo@patina.dev`, plus `studio_manager@patina.dev` and
`support@patina.dev` for the R3 permission cases.

**Verdict — `fix`.** No blocker. Four majors, all of which a designer meets on the ordinary path;
the 14-step walk otherwise completed end to end, including the two-studio countersign, the executed
authority, the snapshot hash and the addendum's `why`.

---

## 1 · How the portals were booted

`walk-env.md` was written at HEAD `a8906896f`; this walk ran at `f45845816`. Nothing in that file's
recipe changed, but two things had to be added to it and both are recorded here:

- **`studio-workspaces:true`** was added to the override. Without it `account-sheet.tsx:104` never
  renders the Studio page at all, so the Agreement Library card (walk item **b**, step 3) is
  unreachable. It is orthogonal to both Wave 2 gates.
- **`http://localhost:3000` / `:3002`, never `127.0.0.1`.** Next 16 blocks its own dev resources
  cross-origin from `127.0.0.1` ("Blocked cross-origin request to Next.js dev resource
  /_next/webpack-hmr from 127.0.0.1"), React never hydrates, and every click is inert. The first
  sign-in attempt failed exactly this way.

Scripts: `.../w2/web-walk/boot-designer.sh`, `boot-client.sh` (nohup, unsandboxed, keys from
`supabase status -o env`, `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`). Both were confirmed serving
`127.0.0.1:54321` before the first click. **Both servers were killed at the end of the walk** — see §8.

## 2 · Fixtures this walk had to make (the seed carries none)

The local seed has **no draft `design_services` agreement**, so step 1's "existing executed-shape
draft" does not exist. Three drafts were made through the Contract Room doorway
(Desk → *Open the Contract Room* → household), and one was given the seven-facet terms row the
e2e's `beforeAll` writes, so `materialize_standard_parts` had real values to seed from:

| id | household | studio resolved by `_agreement_studio_id` | role in the walk |
|---|---|---|---|
| `390cb933-…d7a88a` | Client User | Leah Hartwell | steps 1–2, flag-off captures |
| `5391c5c3-…e4c7fa91` | Nora Ellison | Local Dev Studio | R32 negative case, R33 |
| `b117a054-…2640bca9` | Client User | Leah Hartwell | steps 5–14 |

Fixture SQL: `.../w2/web-walk/fixture-executed-shape.sql`. Two more rows were inserted by hand:
a studio template owned by **Local Dev Studio** (`studio.other-studio-fixture`, titled
"Other studio only — must not be offered") for R32's negative case, and a membership for
`support@patina.dev` in Local Dev Studio, flipped `member` → `admin`, for R3.

## 3 · The 14 steps

| # | Result | Evidence |
|---|---|---|
| 1 | **pass, with W-01** | `step01-rail-nine-parts.png` — nine standard parts in order, kind labels, `CREATES AUTHORITY` on every schedule, `0 of 9 parts need attention`. SQL: nine rows, positions 1–9, keys `patina.services … patina.terms`. **But the first open of a new agreement shows none of them — W-01.** |
| 2 | **pass** | `step02a/b/c` — rail footer → *Save as template…* → "Full-service residential" → *Save to Library* → the footer reads **"Saved to your Library."** SQL: `agreement_templates` gains `studio.3f314e59-…`, `kind='studio'`, `studio_id=339c1ae6-… (Leah Hartwell)`, 9 parts, `created_by` the designer. **R32/R3-B1 is closed** — the two-studio designer is no longer refused. |
| 3 | **pass** | `step03-account-studio.png` — card order Branding → **Billing** → Agreement defaults → **Agreement Library** → Members. TEMPLATES lists the three Patina templates plus `STUDIO · Full-service residential` with RENAME/DELETE. PARTS reads the empty state (see **W-03**). |
| 4 | **pass (deviated)** | A new draft was opened through the *Draft a design agreement* doorway rather than a new lead + Discovery; that path is unchanged by this wave and the lead ceremony adds nothing the Library touches. `step04-new-draft-room.png`. |
| 5 | **pass** | `step05a-template-picker-leah-studio.png`, `step05d-replace-warning.png`, `step05e-materialized.png`. *Start from a template…* → select → *Use this template* arms the warning **"This replaces the parts on this agreement. Nothing else on the draft changes."** → *Replace the parts*. SQL: nine rows, every one stamped `source_template_key = studio.3f314e59-…`; the room's history strip reads "Materialized from Full-service residential" (`step06c-part-menu.png`). |
| 6 | **pass** | Role rates and the ceiling open (`step06a/b`). Remove → **Save agreement** → SQL 8 rows, `patina.role_rates` gone, a `removed` event written. *+ Add a part → Schedule ▾ → Fee by phase* → three phases → the editor shows **"3 phases · $26,000.00"**, the rail chip reads `FEE BY PHASE · CREATES AUTHORITY`, readiness stops naming a ceiling. `step06k/l`. SQL: `custom.b5503f37…` `variant=per_phase`, three phases at 800000/1200000/600000 cents. |
| 7 | **pass** | `step07b-cost-plus-added.png` — chip `COST PLUS · RECORD ONLY (R9)`, help line **"This is recorded on the agreement. It does not create billing authority yet."**, readiness unchanged at `0 of 10`. SQL: `custom.a2c76f98…` `variant=cost_plus`. |
| 8 | **pass (email not verified)** | `step08b-sent.png`; SQL `status='sent'`, `commercial_state='sent'`. Reopening `/drafting/<id>` now redirects to `/doc/<id>` — the rail, and with it add/remove/reorder, is gone (R6). The **send email could not be checked**: the local `supabase_edge_runtime` container is stopped, and the send returned one `503`. |
| 9 | **pass** | `step09-client-door.png`, `step09-read-it-in-full.png` (as `client-solo@patina.dev`, on the seeded R36 fixture `b0000000-…cb04`). Body in the designer's order — Services, Fee by phase, Retainer, Terms — then **`ATTACHMENT A · THE LEAD-PAINT NOTICE`** as its own trailing leaf carrying **"I received this"**, then the closing boundary sentence. |
| 10 | **pass** | `step10a/b`. Door consent line: *"By signing, you accept the services, per-phase fee schedule, retainer, and terms in "Cedar Lane — Phase Work"…"*. Signature-row line, ticked: **"I agree to these design-services terms, the per-phase fee schedule, and the retainer, which is not refundable, and understand my signature alone does not authorize work until the studio countersigns."** — byte-for-byte the build sheet §5.1 per-phase + non-refundable row; it names the per-phase schedule, not role rates. Attachment tick, name typed, press-and-hold → `commercial_document_signatures` party `client`, `signed_name='Nora Ellison'`, and `metadata` carries `consentSentence` plus `attachmentsAcknowledged:["patina.lead_paint_notice"]`. |
| 11 | **pass (via the paper path — see W-06)** | The countersign act is not reachable on a **project-bound** agreement (W-06), so step 11 ran on `b117a054` (project-less origin): *Record the signature* → *Countersign for the studio* → `step11f-executed.png`. SQL: `status='accepted'`, `commercial_state='executed'`, project `4d700303-…` created in studio **Leah Hartwell** — the 00566 two-studio path. |
| 12 | **pass** | `SELECT fee_basis, fee_amount_cents, fee_schedule, retainer_credit_rule FROM project_billing_authorities WHERE source_proposal_id='b117a054-…'` → `per_phase` / `2600000` / the three-phase array / `credited`, with `billing_ceiling_cents=2400000`. |
| 13 | **pass** | `step13-keepsake.png` — `/proposals/<id>/record` renders **THE AGREEMENT AS EXECUTED** with the frozen body and the mark **`MARK 338C10DFD5B7`**. SQL: `agreement_execution_snapshots.document_hash = commercial_document_signatures.evidence_fingerprint` for `party_role='studio'` → `t`. **R36** proved on the in-app signature (`step13b-keepsake-inapp.png`): THE ANSWER prints the exact composed sentence from the signature row. (On the offline paper path the row stores no `consentSentence`, so the record falls back to the summary line — correct, not a defect.) |
| 14 | **pass** | Project → **Money** → *Create services addendum* → title + **"WHY THIS ADDENDUM … One line, kept with the addendum. Your client reads it beside the change."** → *Create the addendum*. The room opens carrying all ten origin parts. `step14d-ceiling-history.png`: the ceiling's HISTORY reads **"Added · Leah · today / Added the study to the scope"**. SQL: every `agreement_part_events` row carries `actor_name='Leah'` and that `why`. |

## 4 · The added checks

**(e) R33 — a hidden flat fee.** Half passes, half fails.
A visible flat fee of $15,000 saved from the room projects correctly
(`proposal_service_terms.fee_basis='flat'`, `fee_amount_cents=1500000`). Flipping that part's
`client_visible` to false and re-saving from the room drops it: `fee_basis` falls back to `hourly`
and `fee_amount_cents` is NULL — **the hidden fee reaches neither terms nor the authority.** ✅
But **readiness never says why** — see **W-02** — and there is **no UI to hide a part at all**
(**W-03**), so this state can only be reached from SQL today.

**(f) R35 — the picker filters by kind.** Pass. On a `design_services` agreement the sheet offers
all three seeded templates — *Consultation / hourly*, *Design services (Patina standard)*,
*Furnishings only* — plus the studio's own. `design_build` is not seeded, so nothing leaks.
`step05a-template-picker-leah-studio.png`.

**(g) R32 — a template saved in the other studio.** Pass, and the resolver was exercised both ways.
On `b117a054` (studio = Leah Hartwell) the picker offers *Full-service residential* and **not**
"Other studio only — must not be offered". On `5391c5c3` (Nora Ellison, whose designer-client pair
already has a project in Local Dev Studio, so `_agreement_studio_id` resolves there) the picker
offers exactly the reverse. Confirmed with
`select public._agreement_studio_id(p.id, '<designer>')` on both rows.

**(a) The flag-off walks.**

- **`agreement-parts` on, `agreement-library` off** — the Library affordances vanish
  (*Start from a template…*, *Save as template…* absent), Wave 1's room stands
  (*+ Add a part*, *Return to the seven facets*). Markup diff between the two configurations is
  **64 lines, all Wave 2's own**: the authority chip loses its `data-authority-standing` span and
  becomes plain text, "Furnishings deposit · creates authority · deposit only" becomes
  "Furnishings deposit", the footer loses two buttons, and *+ Add a part* reverts to the Wave 1
  dropdown (`aria-expanded`). Nothing else differs.
  `flags-both-room.html` vs `flags-partsonly-room.html`.
  *Not proven:* byte-identity against **Wave 1 as shipped** — that needs a Wave 1 build to diff
  against, which this walk did not have.
- **Both flags off** — the seven-facet room, `7 of 7 facets written`, the R17(b) notice
  *"This agreement is composed from parts. It is edited in the Contract Room with parts on, where
  it can also be returned to the seven facets."*, and **Save disabled** (`<button disabled>Saved`).
  `flags-bothoff-room.png`.
- **The Account card is fail-closed too** — with `agreement-library` off the Agreement Library card
  is absent while Billing and Agreement defaults stand unchanged
  (`gate-libraryoff-account.png`).
- **The client body is byte-identical under all three flag settings** (0-line HTML diff,
  0-line text diff, `flags-both-client-door.html` vs `flags-bothoff-client-door.html`).
  That is **by design** — `commercial-documents.ts:236` says the homeowner has no flag and the
  bundle's `composed` key is the kill switch — but it means the deploy plan's rollback sentence
  is wrong. See **W-05**.

**(b) Account → Studio.** The Library card lists three Patina templates plus the studio's saved one.
`designer@patina.dev` (owner) and `support@patina.dev` promoted to **admin** both see RENAME/DELETE
(`libcard-admin2.png`); the same account as a plain **member** sees the template listed with no
controls and the sentence **"Owners and admins edit the Library. Every member composes from it."**
(`libcard-member.png`). Billing and Agreement defaults render as before, in that order, above it.

**(c) Vocabulary.** Rendered text was pulled from six surfaces — Desk, Contract Room with the
`Schedule ▾` menu open, the template picker, Account → Studio, the homeowner's door read in full,
and the keepsake — and grepped for `clause library`, `contract builder`, `variant`, `AI`, twelve DB
column names, emoji, and (on homeowner surfaces only) `gate`, `task`, `dashboard`, `overdue`.
**One hit, outside this wave**: a `✓` glyph in Account → Studio's "Still to do" checklist
(`studio-setup-checklist.tsx`) — a checkmark-as-status. Captures in `vocab-*.txt`.
One thing the grep cannot judge: the designer-facing chip prints the literal **`record only (R9)`**,
an internal ruling id. The build sheet asks for exactly that string, so it is compliant — but it is
worth a copy ruling before it reaches Leah. (**W-09**)

**(d) axe-core 4.11.1**, whole-document, violations only:

| Surface | Violations |
|---|---|
| Contract Room | 1 serious `color-contrast` ("The client's copy · live", `#8b7355` on white = **4.48:1**, needs 4.5); moderate `landmark-no-duplicate-banner`, `landmark-one-main`, `landmark-unique`, `meta-viewport` (`maximum-scale=1`), `region` |
| Account → Studio (the Library card) | 15 serious `color-contrast` — **every one** the same `--color-aged-oak` token, and **none inside the Agreement Library card** (they are the profile row, the status label, the "Still to do" checklist); moderate `meta-viewport`, `region` |
| The homeowner's door | **0 violations** |

Raw: `axe-contract-room.json`, `axe-library-card.json`, `axe-client-door.json`.

## 5 · Defects

### W-01 · major · A new agreement's Contract Room says it has no parts, and never stops saying it
Open the Contract Room on a freshly created agreement and the rail reads **"This agreement has no
parts yet."** with **"0 of 0 parts need attention"** — while `materialize_standard_parts` has already
written nine rows. Measured at t+5s, +10s, +20s and +35s: unchanged at every sample. Only a manual
reload repaints. Reproduced three times, on three different households.
`defect-first-open-no-parts.png`, `03-step1-contract-room.png`; SQL after the last run:
`select count(*) from proposal_agreement_parts where proposal_id='3018cb9a-…'` → **9**.
This is walk step 1 failing on the only path a designer uses to start an agreement, and the
materialize-on-open behaviour is Wave 1's (R24), so the fix is likely a missing invalidate rather
than anything Wave 2 added.

### W-02 · major · R33's readiness sentence is authored but never rendered
`readiness.ts:83` defines `HIDDEN_FEE_BLOCKER = "This fee is hidden from your client, so it cannot
bill."` and `:270-280` attaches it to the offending part. `agreement-composer.tsx:626` feeds the
panel from `documentBlockers(readiness)`, which is `blockers.filter(b => b.partId === null)` —
so a blocker carrying a `partId` is filtered out, and nothing else prints it. Observed with a
$15,001 flat fee marked hidden: the rail row shows a bare **"needs attention"** with no reason, the
editor shows no reason, and the readiness panel says **"This agreement names no fee. Add a rate
card, a flat fee, or a per-phase fee."** — directly contradicted by the *Flat fee* row two inches to
its left. `r33-hidden-readiness-final.png`, `r33-flat-fee-selected-editor.png`.
R33 says "readiness names it"; it does not.

### W-03 · major · The Library's Parts shelf has no act that can fill it
The Agreement Library card's PARTS shelf reads **"No parts saved yet. Compose an agreement, and what
you write there can be kept here."** Nothing in the room keeps a part there: the per-part overflow
menu offers only Rename / Move up / Move down / Remove (`step06c-part-menu.png`), and the only
caller of `useSaveAgreementPart` in the whole portal is
`agreement-library-card.tsx:172`, inside the **rename** handler for a part that already exists.
`save_agreement_part` is therefore unreachable for creation. Two consequences: build-sheet §9 step 3's
"PARTS shows counts by kind" cannot be walked, and — because `clientVisibleDefault` on a saved studio
Part is the only path that ever sets a part's `client_visible` to false — **no designer can hide a
part**, which is what makes W-02 unreachable in practice too. Every add path in
`add-part-sheet.tsx` (:160, :285, :331) hard-codes `clientVisible: true`.

### W-04 · major · A household that already has houses is never shown a pending origin agreement
`client@patina.dev` was sent a composed origin agreement (`b117a054`, `sent`, `project_id NULL`,
`client_id` hers). Her door for every house reads **"Nothing waits for your name."**, THE PAPERS
reads "Nothing has been filed here yet.", and `/?proposal=b117a054-…#door` renders the same page —
the paper is unreachable until countersign creates a project.
`client-02-door-expanded.png`, `client-03-origin-agreement.png`.
This is R30's amendment carried to Wave 2's client lane — "the door for every house carries a
'papers without a house' leaf listing pending origin agreements addressed to the household" — and
the string does not exist in `apps/client-portal/src` (the only match for "without a house" is an
unrelated comment in `ground-floor.tsx:41`). It is what forced step 11 onto the record-on-paper path.

### W-05 · minor · "Flag off … reverts every surface" is not true of the homeowner
Build-sheet §10 Rollback says flag off is the first lever and reverts every surface. With
**both** flags off the client portal renders the composed body and the composed consent sentence
byte-identically to both-flags-on (0-line HTML diff). That is deliberate —
`commercial-documents.ts:236-247` explains the homeowner has no flag and the bundle's `composed`
key is the switch — but the deploy note should say the client-side lever is
`discard_agreement_parts` / the bundle's `composed`, not the PostHog flag.

### W-06 · minor (moderate confidence) · No countersign act on a project-bound agreement
`b0000000-…cb04` is `client_signed` and awaiting the studio. `/doc/<proposalId>` and
`/drafting/<proposalId>` both resolve to the **project** document, which offers no countersign;
the whole rendered page contains no "countersign" anywhere (`step11-drafting-cb04.png`), and the
Money region offers only *Create services addendum*. The same act appears immediately on the
project-less origin agreement. I did not exhaustively expand every folded pane on the project
document, so this is reported at moderate confidence — but it is why step 11 could not run on the
wave's own seeded fixture.

### W-07 · minor · Template materialization pollutes every payload with `"items": []`
After *Replace the parts*, every part's payload gains a spurious `items` key — including
`patina.ceiling` (`{"cents": 2400000, "items": []}`), `patina.retainer`, `patina.cadence` and the
two clause parts. Parts materialized by `materialize_standard_parts` carry no such key. Nothing
renders it today; it will diverge two agreements that are otherwise the same paper, and the
fingerprint hashes payloads.

### W-08 · nit · The designer's own edit reads as "A teammate"
`agreement_part_events.actor_name` is written only when a `why` is present (00577:902), so an
ordinary save records `actor=<designer>` with `actor_name` NULL and the history strip renders
**"Edited · A teammate · today"** to Leah about her own edit
(`r33-flat-fee-selected-editor.png`). The template and addendum paths, which carry a `why`, read
"Leah" correctly.

### W-09 · nit · `record only (R9)` shows an internal ruling id to the designer
The Schedule menu and the rail chip both print the literal `record only (R9)`. It is what the build
sheet specifies, so it is not a deviation — but a ruling number is not studio vocabulary.

### W-10 · minor · The Contract Room overflows horizontally at 390
`document.documentElement.scrollWidth = 617` against a 390 viewport. The offender is the header
action row (`DIV.flex items-center gap-3`, right edge 617) — *Preview client copy* /
*Return to the seven facets* / *Save agreement* do not wrap, and Save is clipped off-screen.
`m390-contract-room.png`. The third button is Wave 1's (R24), so this predates the Library.
Account → Studio measures 437 against 390 (the Desk behind the sheet). The homeowner's door and
keepsake are clean at 390 (`m390-client-door.png`, `m390-client-record.png`).

### W-11 · nit · The one contrast failure inside this wave's room
`--color-aged-oak` `#8b7355` on white at 11px measures **4.48:1** against a 4.5 floor — one node in
the Contract Room ("The client's copy · live") and fifteen in the Account sheet. It is a token, not
a component: a hair of darkening fixes every instance at once.

### W-12 · nit · A checkmark-as-status in Account → Studio
`✓` in the "Still to do" checklist (`studio-setup-checklist.tsx`) — the only vocabulary-grep hit on
either portal. Pre-existing, outside the Library card, recorded because the grep is part of this walk.

## 6 · What passed that the rulings asked for

- **R32** — the two-studio designer saves a Template, and it lands in the studio the **agreement**
  sits in; the other studio's template is never offered. Both directions exercised.
- **R33** — the projection half: a hidden fee reaches neither `proposal_service_terms` nor the
  authority. (The readiness half fails — W-02.)
- **R34** — the addendum's `why` renders on the homeowner's paper, above the parts:
  `step14f-addendum-read-in-full.png`.
- **R35** — three seeded templates offered on a `design_services` document; `design_build` absent.
- **R36** — the record's ANSWER carries the exact sentence from the signature row; the seeded
  per-phase `sent` fixture exists and drove steps 9–10 unconditionally.
- **R37** — `retainer_credit_rule='credited'` on the executed authority; the keepsake's rendering
  matches the door's body (attachment as a trailing lettered leaf, closing boundary sentence kept).
- **R3** — owners and admins edit; a plain member composes and is told so.
- **R6** — the rail freezes at send. **R17(b)/R24** — the flag-off notice and the disabled Save.

## 7 · Not verified

- The **send email** naming the document (step 8) — the local `supabase_edge_runtime` container is
  stopped; the send returned one `503` and the homeowner's page showed
  "confirmation delivery is still pending".
- **Byte-identity against Wave 1 as shipped** — only against this branch with `agreement-library` off.
- The **new-lead + Discovery** route into a draft (step 4 used the household doorway instead).
- Any **countersign on a project-bound agreement** (W-06).
- Prod: nothing was deployed, pushed, or run against Strata.

## 8 · Housekeeping

- Both dev servers this walk started were killed; `lsof -ti :3000` and `:3002` are empty.
- The shared local stack was **not reset**; `schema_migrations` head is still `00577`. No scratch
  database was created.
- Rows this walk added to the local stack, all deliberate fixtures: four draft/sent proposals, three
  service addenda, one studio template per studio, one `support@patina.dev` membership (left at
  `admin`), one executed project (`4d700303-…`) with its billing authority.
- Scripts and captures: `.../w2/web-walk/` · screenshots (1280 and 390):
  `.../w2/web-walk-shots-r1/`.
