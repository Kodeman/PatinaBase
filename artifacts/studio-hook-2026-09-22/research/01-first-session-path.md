# Lane 01 — The ACTUAL first-session path of a brand-new studio

**Researcher lane:** signup / accept-invite → first `/desk` → walkthrough + coachmarks → help system → first captured lead → first Document (`/doc/[id]`) → founding-designer drip.
**Date:** 2026-09-22. **Repo state:** branch `main` @ `f51b4f39b` (clean at session start).
**Method:** read the code and the migrations. No prod SQL, no PostHog live read, no browser walk (see §7 Evidence quality).

Legend: **[V]** verified — I read the file/line or ran the command. **[I]** inferred — a conclusion assembled from verified parts, not directly observed. **[U]** unavailable — could not check from this sandbox.

---

## 1. There are TWO first-session paths, and only one of them works

### 1a. The invited path (the real one — acquisition is 1:1 through Kody/Leah)

**[V]** `supabase/functions/designer-invite/index.ts:7-21, 100-103, 183-256`. Admin-gated (caller must hold an `admin`-domain `user_roles` row). It:
1. mints a GoTrue `invite` link via `admin.auth.admin.generateLink()`, falling back to `magiclink` if the email already has an account (`:202-226`);
2. sets `redirectTo = ${DESIGNER_PORTAL_URL}/auth/callback?next=/desk` (`:198`);
3. upserts `profiles.is_designer = true` + `display_name` (`:234`);
4. inserts the `user_roles` grant, default role `independent_designer` (`:183-246`).

**[V]** That role grant fires `fc_sync_is_designer_from_role()` (`supabase/migrations/00290_designer_invite_foundation.sql:31-58`), which sets `profiles.is_designer = true`, which fires `provision_studio_on_designer` (`supabase/migrations/00295_studio_workspace_provisioning.sql:290-295`) → `_provision_studio()` creates an `organizations` row + owner `organization_members` row.

**[V]** The auto-provisioned studio's NAME is `COALESCE(business_name, display_name, full_name, split_part(email,'@',1), 'My Studio')` (`00295:269-277`). `designer-invite` only ever writes `display_name` — the PERSON's name. **So the studio is named after the designer, not the studio.** Corroborating artifact in the repo: `apps/designer-portal/src/hooks/use-viewer-studio.ts:31-37` documents the default seed where `designer@patina.dev` owns both `'Leah Hartwell'` and `'Local Dev Studio'` — a person-named studio beside a real one.

So: the invited designer arrives with a designer role, a studio she never named, and an owner membership. Everything downstream works.

### 1b. The self-service path (`/auth/signup`) — a dead end that is linked from the sign-in page

**[V]** `apps/designer-portal/src/app/auth/signin/page.tsx:262` renders: `Need an account? Ask to join your studio.` → `href="/auth/signup?callbackUrl=…"`.

**[V]** `apps/designer-portal/src/app/auth/signup/page.tsx:44-96` asks for SIX fields: Full Name (req), **Company/Studio Name (req)**, Email (req), Phone (opt), Password (req), Confirm Password (req). On submit (`:147-158`) it calls `supabase.auth.signUp()` with `options.data = { name, company, phone }`.

**[V]** The trigger that consumes that metadata, `public.handle_new_user()` (`supabase/migrations/00313_handle_new_user_client_role_hint.sql:29-79`), reads only `raw_user_meta_data->>'role'`, `->>'display_name'` and `->>'full_name'`. It does **not** read `name`, and does **not** read `company`.

**Consequences, all [V] from code:**
- The **studio name she typed is silently discarded.** Nothing in the repo reads `raw_user_meta_data->>'company'` (`grep` across `supabase/migrations` finds no consumer).
- Her display name is also discarded (form sends `name`; trigger reads `display_name`/`full_name`), so the Desk greets her with the bare `"Good morning."` branch — `apps/designer-portal/src/app/(document)/desk/page.tsx:196-200, 250-259`.
- `handle_new_user` inserts `user_roles` = **`app_user`** (`00313:70-76`), whose `roles.domain` is **`consumer`** (`supabase/migrations/00022_seed_roles_permissions.sql:12`).
- `is_designer` is therefore never set (the sync trigger only fires for `designer`-domain grants, `00290:31-58`), so **no studio is ever provisioned** (`00295` trigger is `WHEN (NEW.is_designer IS TRUE)`).
- **[I]** The designer-portal middleware gate `userHasDesignerPortalRole()` requires a role whose domain ∈ `{designer, admin}` (`apps/designer-portal/src/middleware.ts:12, 22-31`) and redirects to `/unauthorized` on every protected page otherwise (`:171-177`). So a self-signup lands on `/unauthorized`. The one escape is `:21` — the function **fails open when `SUPABASE_SERVICE_ROLE_KEY` is absent**. **[U]** I cannot confirm whether that secret is bound on the prod Worker: `apps/designer-portal/wrangler.jsonc:25-47` `vars` does not contain it (it would be a `wrangler secret`), and reading `.env*` is sandbox-denied. Either branch is broken: with the key she is bounced to `/unauthorized`; without it she reaches a Desk with no designer role, no studio and RLS-empty reads.

**[V]** `apps/designer-portal/src/app/api/auth/register/route.ts:24, 44-52` is a second, fully dead registration path: it proxies to a `user-management` service at `http://localhost:3010/v1/auth/register`. Per CLAUDE.md only orders/media/projects services are retained — that service does not exist. The route is not called by the signup page (which calls Supabase directly), but it is live surface area.

### 1c. The teammate path (`/auth/accept-invite`) — works, and is the best-built arrival in the product

**[V]** `apps/designer-portal/src/app/auth/accept-invite/page.tsx`. Deliberately NOT flag-gated (`:4-7`). Passwordless (`:18-22`). Polls for the session up to 5 s (`:35-36, 96-108`), calls `accept_workspace_invitation` (00295), then shows `You're in — {studio}.` (behind `onboarding-teammate-persona`) or `Welcome to {studio}.` and auto-redirects to `/desk` after 350 ms (`:74-78, 158-176`).
**Asks of her: zero.** One click from the email. This is the only arrival in the whole product with no form.

---

## 2. Step-by-step: what she sees, what each step ASKS vs GIVES

Assume the working path: invited founding designer, desktop ≥980px, prod flags as summarised in §4.

| # | Screen | ASKS | GIVES |
|---|---|---|---|
| 1 | Email **T0 `designer-invite`** — subject "An invitation to Patina" | nothing (one button) | the promise, the framing, and an explicit "Bring one client to mind. Your first ten minutes will make sense of the rest." `docs/marketing/founding-onboarding/copy-deck.md:39-77` **[V]** |
| 2 | `/auth/callback?next=/desk` | nothing | exchanges the code, redirects. `apps/designer-portal/src/app/auth/callback/page.tsx` **[V]** |
| 3 | **`/desk`, first paint** | nothing | `Good morning, {firstName}` + date; three header acts — **Capture a lead** (primary), **Open a project** (secondary), **Find anything ⌘K** (tertiary); an empty roster; the Studio Contents index; the studio drawer pinned to the viewport bottom. `apps/designer-portal/src/app/(document)/desk/page.tsx:240-317, 430-454` **[V]** |
| 4 | **WelcomeModal** auto-opens over the Desk | one decision: *Take the walkthrough* / *Skip for now* / *Show me later* | `"This is your Desk"` + "Every client's project is one document, and every document lives here. Six stops, about a minute, and you'll know your way around. You can leave at any step." `desk-walkthrough.tsx:551-570` **[V]** |
| 5 | **Desk Walkthrough**, 6 coachmarks | nothing but Next×5 | teaches, in order: (1) The Desk, (2) One client, one document, (3) Rooms and ledgers, (4) The studio drawer, (5) Find anything (⌘K, "try 'invoice'"), (6) Begin with a lead. `desk-walkthrough.tsx:131-190` **[V]** |
| 6 | Step 6's CTA **acts** — it opens the CaptureLeadSheet | see row 7 | the tour marks itself complete, retires the `desk-first-touch` note, and hands her the front door. `desk-walkthrough.tsx:531-543` **[V]** |
| 7 | **CaptureLeadSheet** — "Who just came in?" | **2 required**: Name, "The project (one line)". 3 optional: Email, Phone, Where from (4 chips: Referral / Website quiz / Instagram / Past client) | on submit creates a `leads` row with `project_type:'consultation'` and a +1-day `response_deadline`, then `router.push('/doc/{lead.id}')`. `capture-lead-sheet.tsx:37-45, 57-64, 82-135, 159-259` **[V]** |
| 8 | **`/doc/[id]` — the Brief** | nothing yet | the paper: letterhead, spine, margin rail, the `doc-first-touch` margin note, the triage bar. Also silently calls `mark_first_document_opened()` (`doc/[id]/page.tsx:931-939`; RPC at `00559:23-34`) **[V]** |
| 9 | **Triage bar** on the lead | one decision: **Accept · begin** / *Reconnect later* (1 week / 1 month / 3 months) / *Pass* | Accept runs `useBeginDiscovery` → lead `accepted` + a `designer_clients` relationship + the Discovery section. `triage-bar.tsx:13-24, 121, 215-241` **[V]** |
| 10 | **Discovery section** — 8 blocks, any order | **5 essentials**: `scope`, `budget`, `timeline`, `style`, `lifestyle`. 3 optional deepeners: `keep_avoid`, `deciders`, `site_scan` | a soft gate: 5/5 → "ready for Direction". `discovery-section.tsx:1-16, 330`; `lib/document/discovery-readiness.ts:40-52, 109-114` **[V]** |
| 11 | **Direction** → `begin_direction_from_discovery` | a direction decision | seeds the proposal field→field from the Discovery facts (`discovery-section.tsx:15`) **[V]** |
| 12 | **Contract Room / Agreement (the Galley)** | compose the parts; the R4 floor must be met | a sendable design agreement. Readiness is derived from the composition, not a wizard: `rooms/drafting/agreement/readiness.ts:1-19` **[V]** |
| 13 | **Send** | the DB gate fires | `send` refuses unless: an exact `designer_clients` relationship exists; `proposal_service_terms` exists; role rates exist whenever a rate-card part is present; a ceiling exists whenever it bills time; a fee is named. `supabase/migrations/00575_agreement_parts.sql:655-690` **[V]** |

**The shortest honest count from cold `/desk` to a document a client can receive**, via the ceremonial path: 2 (capture) + 1 decision (accept) + 5 (Discovery essentials) + 1 direction + agreement composition (≥ parties + signature + one typed money part + ceiling-if-rate-card, per R4 as quoted in `readiness.ts:8-10`) + a client email on the roster. **Call it ~12–16 discrete inputs and 3 decisions, across 4 surfaces.**

**The fast lane exists but is unadvertised.** `Open a project` (the Desk's secondary act) skips lead → Discovery entirely: Title, Household (picker), Budget band (min/max), Start date — **and its module doc says "essentials only, then compose in /doc/{id}"** (`open-project-sheet.tsx:7, 45-49, 121-165`) **[V]**. Likewise `Draft a design agreement` (⌘K verb `draft-proposal`) creates an EMPTY draft agreement for an existing household and walks straight into `/drafting/[id]` (`draft-proposal-opener.tsx:1-22`) **[V]**. Neither is taught by the walkthrough, which ends on `capture-lead`.

**Nothing she can hand a VENDOR in the first session.** The call sheet and the Contract Room are both *document-scoped* and are deliberately excluded from the Desk's Contents index — "it has nothing to describe without a project document in hand" (`desk-contents.tsx:10-21`) **[V]**. `Add a maker` is a ⌘K verb (`registry.tsx` STUDIO_VERBS `add-maker`, "a vendor on your roster") **[V]**, reachable only if she opens ⌘K and types.

---

## 3. Every point where she must re-enter data she already has

| Data she already has | Where Patina asks for it | Bulk/import path? |
|---|---|---|
| **Her studio's name** | typed at `/auth/signup` and **thrown away** (§1b); otherwise never asked — the studio is auto-named after her person (`00295:269-277`) | n/a. Fixing it means Account sheet → Studio → inline rename, behind a flag (§4) **[V]** |
| **Her own name / title** | `profiles.display_name` (silently dropped on self-signup); job title is checklist row 2 `own-title-set`, read from `organization_members.job_title` (`lib/document/studio-setup.ts:92`) **[V]** | none |
| **Client list (households)** | one at a time. `designer_clients` rows are minted by the capture sheet, the ClientPicker's invite-and-link, or `Open a project`. `studio_contacts` rows one at a time via `AddPersonSheet`. | **NONE.** `grep -rli csv` across `apps/designer-portal/src` returns only: the catalog import route, hours/time export, and `rooms/library/import-*`. No contact import exists. **[V]** |
| **Vendors / makers** | `Add a maker` ⌘K verb, one at a time | none for vendors as *people/firms*. **[V]** |
| **Products / vendor price lists** | **THE ONE GOOD IMPORT.** `rooms/library/import-sheet.tsx` + `import-parse.ts`: CSV inline, XLSX via lazy SheetJS, header auto-guess, column mapping onto 9 fields (`name` required, brand, category, price, description, material, dimensions, sku, vendor) → POST `/api/catalog/import`, landing as `status:'draft'`, `layer:'personal'`. **[V]** `import-parse.ts:17-45` |
| **Projects in flight** | one at a time via `Open a project` (4 fields) or the full lead→discovery arc (≥8) **[V]** | none |
| **Pricing / rate card** | Account sheet → Studio → rate rows + agreement defaults (`account-studio-page.tsx:28-37, 77-88`), behind `studio-workspaces` **[V]**. Required before sending any time-billing agreement (`00575:655-690`) **[V]** |none |
| **Hours already worked** | `Log time` verb / the Hours ledger; hours-ledger and time-export support **CSV export**, not import (`lib/document/time-export.ts`) **[V]** | export only |
| **Existing contracts / templates** | `save-as-template-action.tsx` + `template-picker-sheet.tsx` exist in the agreement folder **[V]**, but templates are minted inside Patina; there is no "upload my current agreement" path **[I]** |
| **Third-party systems** | `grep -rli "quickbooks\|houzz\|studio designer\|ivy\|dubsado\|vcard\|google contacts"` across `apps/designer-portal/src` and `packages/supabase/src` → 3 incidental hits only (`registry.tsx`, `invoice-composer.ts`, `use-permissions.ts`), no integration **[V]** |

**The headline:** the only thing a studio can bring with it in bulk is a product spreadsheet. Clients, vendors, projects, rates and history must all be retyped. That is the precise shape of "having to learn a whole new system."

**And there is no sample/demo data.** `grep -rln "sample project|demo project|seedDemo|sampleData"` over `apps/designer-portal/src` → nothing **[V]**. This was a deliberate ruling on 2026-09-03 ("no sample project", recorded in the session memory for `project_designer_onboarding_learning_deck_2026_09_03`). So her first Desk is genuinely, correctly empty — she has to produce the first row herself before the product shows her anything.

---

## 4. Feature flags gating a first-session experience

Mechanics **[V]**: `apps/designer-portal/src/hooks/use-feature-flag.ts:114-120` — **fail-closed**. `{value:false, isLoading:true}` until PostHog answers; if PostHog can never init (no key, DNT, dev without `NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV`), it settles at `{value:false, isLoading:false}` permanently. `NEXT_PUBLIC_FLAG_OVERRIDES` (`flag:true,…`) short-circuits and is build-time inlined (`:49-63`).

Flags referenced in the designer portal, by call count **[V]** (`grep -rhno "useFeatureFlag(\s*'[a-z0-9-]*'"`):

| Flag | First-session surface it gates | Current default |
|---|---|---|
| `studio-workspaces` (9 uses) | **Account sheet → Studio tab, i.e. the ONLY place to name/rename the studio, create one, invite a teammate, set the rate card, set agreement defaults, and see the 6-row setup checklist.** `account-sheet.tsx:104-105, 132-143, 166, 272`; `account-studio-page.tsx:1-16`. Also gates the Desk's `StudioSetupWhisper` (`desk/page.tsx:78, 422-428`). | **100% since 2026-07-12**, id 757790 — per `project_studio_workspaces_program.md` memory. **[I]** (not a live read) |
| `onboarding-teammate-persona` (3) | the teammate coachmark copy (`STEPS_TEAMMATE`), the accept-invite heading `You're in — {studio}.`, the owner's `hire-handoff` margin note. `desk-walkthrough-gate.ts:139-160`; `accept-invite/page.tsx:70-72, 162-167`; `desk/page.tsx:81-83, 411-415` | id 865600; **@kochaver.com + @patina.cloud at 100%, everyone else 0%** — i.e. **dark for Leah's studio**. **[I]** from `project_designer_onboarding_learning_deck_2026_09_03.md` |
| `arrival-arc` (3) | `/ceremony/[leadId]` — the Match Ceremony introduction between designer and homeowner | docs say kody-only (id 765596) but a 2026-07-18 check found it at 100%; contradiction unresolved (`project_field_capture_p1.md`, `project_repo_cleanup_2026_09_01.md`). **Moot for a designer-created lead either way**: `leads.homeowner_id` is always NULL for designer-created leads (RLS 00166), so the ceremony is silently skipped (`project_prod_flow_fixes_2026_09_04.md` item 2). **[I]** |
| `agreement-parts`, `agreement-library`, `design-build` | the composed Agreement / the Galley — the room she must reach to produce a sendable proposal | **100%, enabled, all users, 2026-09-08** (ids 872155 / 872158 / 872160). **[I]** from `project_agreement_composed_proposal_2026_09_06.md:87` |
| `client-invite-letter` | the first letter to her client | 100%, id 874130, 2026-09-09. **[I]** |
| `procurement-workspace-pilot` (4), `threshold`, `room-file`, `room-view-refined-path`, `worktable`, `capture-producer-idempotency`, `field-line-trades`, `tester-notes` | not first-session critical | pilot-only or **never created in PostHog** (`worktable`, `capture-producer-idempotency`, `room-view-refined-path` per `project_repo_cleanup_2026_09_01.md:27`) → permanently `false` **[I]** |

**[U] No live PostHog read.** The PostHog MCP is present but unauthenticated in this session; prior sessions record the key as broken/expired. Every rollout above is from repo memory, not a `/flags` probe.

**Risk worth naming:** the whole studio-identity/setup layer sits behind ONE fail-closed flag. The 2026-09-11 flags-dark outage (`project_flags_dark_deploy_env_outage_2026_09_11.md`) is the proof case — a deploy that failed to export `NEXT_PUBLIC_POSTHOG_KEY` turned `studio-workspaces` and twelve siblings dark in prod. A new studio in that window would have had no path to name her studio, invite anyone, or set a rate.

**Not flag-gated (good):** the Desk itself, the walkthrough, the capture sheet, `Open a project`, the Drafting Room (`drafting/[proposalId]/page.tsx:11` — "Unflagged … unconditional since the R21 dissolve"), the help panel, `/help`, accept-invite.

---

## 5. The walkthrough's real gate conditions (and who silently gets nothing)

**[V]** `apps/designer-portal/src/components/document/help/desk-walkthrough-gate.ts:80-99`. `shouldAutoOpenDeskWalkthrough` needs ALL of:
1. `helpStateReady` — the Supabase help-state backend has hydrated (`desk-walkthrough.tsx:311`, `useHelpState()`);
2. no resolved tour record (`completed`/`abandoned`) and no `later` record;
3. `profiles.created_at >= '2026-07-10T15:10:00Z'` (`DESK_WALKTHROUGH_SHIP_DATE`, `:33`);
4. `pathname === '/desk'`;
5. the desk engagements query has resolved;
6. **`window.matchMedia('(min-width: 980px)').matches`**.

**Gaps [I]:**
- **< 980px gets no welcome modal and no tour at all** — and, per the gate, no state is written either, so an iPad-first or phone-first first session is completely untaught. The offer note (`shouldOfferDeskWalkthrough`, `:104-116`) also requires `isDesktop`.
- The ship-date split means a designer invited **before 2026-07-10** gets the quiet margin-note offer, never the modal. For beta studios onboarded before that date the "first session" they experienced was a one-line note, not a tour.
- A dismissed-by-Esc modal **defers** rather than declines (`desk-walkthrough.tsx:520-529`) and earns exactly ONE re-offer via the margin note; `clearDeskWalkthroughLater` burns it on sight (`desk/page.tsx:386-389`). Two Escs and the tour is gone forever.
- `profile?.created_at` comes from `useProfile()`, which does `select('*')` on `profiles` (`packages/supabase/src/hooks/use-settings.ts:71-79`), so clause 3 is satisfiable **[V]**.

**Persona resolution [V]** `desk-walkthrough-gate.ts:144-156`: owner → `'designer'`; any other active membership role → `'teammate'`; no membership OR flag off/loading → `'designer'`. Because `onboarding-teammate-persona` is 0% outside @kochaver/@patina, **every real first hire at a beta studio today gets the owner's copy**, not the hire's copy — including the line "Anything you begin here belongs to the studio, not to you," which is exactly the reassurance a first hire needs and never sees. **[I]**

**Persistence [V]** `margin-note.tsx:13-32`: once-only markers live in `profiles.help_state.marginNotes`, cross-device, with localStorage as a pre-hydration fallback. Notes are re-armable only by shipping a new versioned key (`doc-first-touch@2`). Active note keys in the portal: `desk-first-touch`, `desk-walkthrough-offer`, `doc-first-touch`, `hire-handoff` (`grep noteKey=` → 4 product keys + test fixtures) **[V]**.

---

## 6. State of the things the 2026-09-03 review flagged

| 2026-09-03 finding | Status today |
|---|---|
| **contextual help panel EMPTY on `/desk` and `/doc`** | **FIXED. [V]** `apps/designer-portal/src/lib/document/registry.tsx:440-478` adds `HOST_SURFACES` — `desk-host` owning `designer-portal/document/desk` ("Every live job, one line each — the quiet ones are in motion.") and `doc-host` owning `designer-portal/document/doc` ("One client, one paper — Brief through Care. The rail says where it stands."). Its own comment names the old bug verbatim: the Desk key "had only verb owners (excluded from the intro by design)". `registry.test.ts:49-50` pins host surfaces out of the doorway lists. |
| **`FirstSigninTour` slated for deletion** | **DELETED. [V]** `grep -rn FirstSigninTour apps packages` → 0 hits; `find -iname "*first-signin*"` → 0 files. |
| **`zone_flight` not emitted anywhere** | **FIXED. [V]** `lib/document/zone-flight.ts` exists and `shouldFireZoneFlight` is imported by `doc/[id]/page.tsx:84`. |
| **setup checklist marks "invited" not "accepted"** | **FIXED. [V]** `lib/document/studio-setup.ts:38-44, 93` — `activeMemberCountBeyondSelf` counts `status === 'active'` only; the rename is documented in the comment. Plus a 6th row, `first-hire-opened`, gated on `organization_members.first_document_opened_at` (`:50-56, 96`; migration `00559`). |
| **drip status unknown / migrations leave sequences `draft`** | **Sequences were flipped ACTIVE out-of-band; drip verified sending in prod on 2026-09-03. [I]** The code still says nobody knows who did it: `00294:42-46` leaves it draft, `00292:48-55` is an explicit arming gate ("enrollment is silently a no-op"), and `00561:132-137` records "who/when flipped 'Designer Onboarding' to status='active' is unknown to this migration's author … Kody to confirm." **[V]** on all three comments. |

**Still open / dead surface found in this pass:**
- **`/auth/signup` is a working form that produces a non-working account** (§1b) — and the sign-in page links to it. **[V]** code; **[I]** on which failure branch prod takes.
- **`/api/auth/register` proxies to a retired service** on `localhost:3010`. **[V]**
- **No visible help affordance on the Desk.** `openHelp()` has exactly four call sites (`grep -rn "openHelp("`): the ⌘K "Help…" row (`command-bar.tsx:611`), the `?` doorway on `DocSheet` heads and ledger front matter (`doc-sheet.tsx:114`, `ledger-front-matter.tsx:28`), and the panel host itself. **On bare `/desk` there is no clickable help.** There IS a bare-`?` key binding (`components/document/keys-shortcut.tsx:39`, documented at `lib/help-system/keys-reference.ts:85-88` as "This page · Anywhere you are not typing, and nothing is open in front") — an invisible keystroke the walkthrough never teaches. **[V]**
- `StudioSetupWhisper` requires `isOwner && openCount >= 2` (`studio-setup-whisper.tsx:26`). `deriveSetupSteps` hardcodes row 1 `named-and-branded: true` ("A studio row cannot exist without a name", `studio-setup.ts:90-91`) — **so the auto-named "Leah Hartwell" studio counts as branded and the checklist never asks her to name it.** **[V]**

---

## 7. The founding-designer drip — what she gets and when

**[V]** `docs/marketing/founding-onboarding/copy-deck.md` — 17 emails + 10 in-app Post notes, three tracks.

**Invite track** (sent directly by the `designer-invite` edge fn, then a `'Founding Invite'` sequence, `00294` part B):
- **T0 `designer-invite`** — "An invitation to Patina". `{{personal_observation}}` is **required — no send without it** (`copy-deck.md:33`). Promises: no password, land at your desk, a six-stop skippable walkthrough, *bring one client to mind*.
- **N1 `designer-invite-nudge-1`** — "Holding your seat". skip if `designer_first_signin`.
- **N2 `designer-invite-nudge-2`** — "Is the timing wrong?" plain-text, no button, reply-only. skip if `designer_first_signin`.

**Spine track** (10 emails, enrolled by the first-sign-in trigger `00292:123, 136`):

| id | template | subject | send | skip if (event) |
|---|---|---|---|---|
| W0 | `designer-welcome` | Your desk is ready | first sign-in **+2h** | — |
| E2 | `onboarding-document-model` | One client, one document | day 2 | `project_created` |
| E3 | `onboarding-capture` | Your eye, everywhere | day 4 | `first_capture` |
| E4 | `onboarding-library` | Three shelves | day 7 | (was "never"; **00561 gates it on `first_capture`**) |
| E5 | `onboarding-drafting-room` | From shelf to proposal | day 10 | `proposal_sent` |
| E6 | `onboarding-open-requests` | Work, waiting on the desk | day 14 | `design_request_claimed` |
| E7 | `onboarding-hours` | Hours that keep themselves | day 18 | `hours_logged` |
| E8 | `onboarding-books` | The books, in order | day 24 | `invoice_sent` |
| E9 | `onboarding-aesthete` | Teach it your taste | day 30 | (was "never"; **00561 gates it on `payment_received`**) |
| E10 | `onboarding-six-weeks` | Six weeks in | day 40 | never; renders `{{firsts_summary}}` |

**[V]** `00561` also raises **every inter-email `wait` to a 7-day floor** ("weekly cadence cap"), replaces the six `yes_step` jumps with a uniform `condition:{type,event,negate:true} / on_false:'skip'` shape, and remaps in-flight enrollments by step id (`00561:1-30, 274-278`). **Net effect: the day-2/day-4 rhythm the copy deck was written to is gone** — the real cadence is now ≥7 days between spine emails. The copy deck (`- send: day 2`) and the live steps_json disagree. **[V]** on both sides.

**Milestone track** (fired by the `00292` trigger on `engagement_events` inserts): M1 `milestone-proposal-sent` "It's in their hands now", M2 `milestone-proposal-signed` "Signed.", M3 `milestone-request-claimed` "It's yours", M4 `milestone-first-payment` "First money through the books". **[V]**

**In-app Post notes** ride each email step's `config.in_app` and **do fire** — `supabase/functions/automation-processor/index.ts:586-596` reads `step.config.in_app` and calls `sendInAppNudge()` after a real send (best-effort, never fails the step). **[V]** Note that `00294:57-62` originally said `in_app` was NOT read by the processor; the paired Wave-3b processor change landed it.

**Event bridge** (`00291`) writes ten events: `project_created, proposal_created, proposal_sent, proposal_signed, design_request_claimed, client_added, first_capture, invoice_sent, payment_received, hours_logged`. `00561:41-59` flags the E4/E9 gate choices as explicit **judgment calls, not 1:1 event names** — E4 reuses E3's `first_capture`, E9 borrows `payment_received` from the money rail — and says so in the migration rather than asserting them.

**Deep-link gotcha worth knowing [V]** `copy-deck.md:22-28`: E7 and E8 link with `?sheet=<book>`, an *accepted alias* of the doorway's real param `book`. It was added retroactively because an unknown param is ignored in silence and the recipient landed on a bare Desk. Changing the spelling now means reseeding templates in `packages/email/src/templates/onboarding-hours.tsx` and migrations `00293`, `00310`, `00404`.

---

## 8. Evidence quality

**VERIFIED by reading files in this repo at `f51b4f39b`:** every file:line citation above. The signup→role→no-studio chain is verified end-to-end across four migrations (`00022`, `00126`, `00290`, `00295`, `00313`) and two portal files (`signup/page.tsx`, `middleware.ts`) — this is the strongest finding in the lane. The walkthrough gate, the capture sheet's field count, the Discovery essentials, the agreement send gate, the absence of any contact/project/vendor importer, the presence of the product importer, the deletion of `FirstSigninTour`, and the fix of the empty help panel are all direct reads. The drip's structure, cadence retiming, event gates and in-app wiring are read from the copy deck, `00291`/`00292`/`00294`/`00561` and `automation-processor/index.ts`.

**INFERRED:** which branch the self-signup failure actually takes in prod (depends on whether `SUPABASE_SERVICE_ROLE_KEY` is bound on the Worker); every PostHog rollout percentage (taken from prior-session memory files under `~/.claude/projects/.../memory/`, which are first-hand records of live checks but not live checks made here); the claim that the drip is currently sending (memory records it as verified in prod on 2026-09-03, with `synthesis/drip-verification.md` as the cited evidence, in an artifacts folder I did not open); the < 980px "no tour at all" conclusion (assembled from the gate's clauses, not observed in a browser).

**UNAVAILABLE:** no live Strata SQL (no credentials reachable — `.env*` reads are sandbox-denied, and the `supabase` CLI binary in this repo did not respond to `--version`); no live PostHog flag read (MCP unauthenticated; prior sessions record the key as broken); no browser walk of prod or local (no stack running, and the lane brief asked for code); therefore no measurement of how long any of this actually takes a human, and no verification that Sanity currently serves help articles for the `desk`/`doc` host keys — only that the keys now have owners.

---

## 9. Implications (evidence-grounded, not proposals)

1. **The front door is broken for anyone who does not arrive through Kody.** `/auth/signup` is linked from sign-in, asks for six fields including her studio's name, discards the studio name and her display name, and produces a consumer-domain account with no studio. If a beta studio's second principal, or a referral from Leah's network, ever self-signs-up, they cannot enter. This is the single highest-severity item in the lane.
2. **The studio's identity is auto-guessed and then declared finished.** The auto-provisioner names the studio after the person; the setup checklist hardcodes `named-and-branded: true`; the whisper only fires at `openCount >= 2` and only for an owner. So the studio's own name — the first thing on every proposal and invoice she'll send — is never asked for, and nothing ever points at it.
3. **Everything that makes Patina feel like *her* studio sits behind one fail-closed flag** (`studio-workspaces`): the studio name, the roster, the invite, the rate card, the agreement defaults, the checklist. A PostHog hiccup (proven possible on 2026-09-11) removes her ability to set up the studio at all.
4. **She must retype her whole practice.** One importer exists, and it is for vendor product spreadsheets. Clients, vendors-as-people, projects in flight, rates and hours are all hand entry. This is the mechanical root of "pops back out into their manual ways" — the manual way is cheaper than the migration.
5. **The walkthrough teaches the ceremonial path and hides the fast one.** Step 6 hands her `Capture a lead` (2 required fields → a Brief → Accept → 5 Discovery essentials → Direction → compose → send). The two shortcuts that would get a repeat client onto paper in one screen — `Open a project` (4 fields) and `Draft a design agreement` (empty draft, straight into the room) — are never named. A studio with work already in flight has no taught path that matches her situation.
6. **The first thing she can hand anyone is a proposal, and the DB refuses it until five preconditions hold** (roster relationship, service terms, role rates if a rate card, a ceiling if it bills time, a named fee). Four of the five are studio-level setup she has not been asked to do.
7. **There is nothing for a vendor in the first session at all.** The call sheet and Contract Room are document-scoped and deliberately absent from the Desk index; `Add a maker` is a ⌘K-only verb.
8. **Help is invisible where she is standing.** On bare `/desk` the only routes into help are ⌘K → "Help…" and an untaught bare `?`. The panel now has content for the Desk and the document (fixed since the September review), but no affordance points at it.
9. **The teammate arrival is the best-designed moment in the product and it is switched off for real studios.** Accept-invite asks for nothing, names the studio, and lands her on the Desk; the hire-specific coachmark copy and the owner's handoff note exist and are written. `onboarding-teammate-persona` is at 0% outside Anthropic-adjacent domains, so the first hire at Leah's studio — the exact VISION customer moment — gets the owner's copy.
10. **The drip's promises and the drip's schedule have diverged.** T0 promises "your first ten minutes will make sense of the rest"; the spine's copy was written to days 2/4/7/10/14/18/24/30/40; `00561` imposed a 7-day floor on every wait. Whatever the emails say about rhythm, the rhythm is now weekly.
11. **< 980px is a silent hole.** No welcome modal, no tour, no offer, and no state written — so a designer who first signs in on an iPad is never taught, and is not marked as untaught either.
