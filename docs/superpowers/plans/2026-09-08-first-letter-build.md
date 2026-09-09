# The First Letter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic GoTrue "You're invited to Patina" email a homeowner gets today with a studio-written letter — the designer's own line, on the studio's letterhead, over our own seven-day token — and give the designer a composer, an arrival page that is page two of that letter, and a dated account of what happened.

**Architecture:** A hybrid delivery path (R5): GoTrue mints the account at send via `generateLink({type:'invite'})` and its link is **discarded**; a `client_invitations` snapshot row is written; the letter is rendered **from that snapshot only** and sent through `sendCompliantEmail`; the letter's one button points at our own seven-day token. The token page mints a fresh magic link on a button **POST** (never on GET) and redirects the homeowner, signed in, to her house. The designer portal's `/api/clients/invite` route takes the new path only when the request body carries `letter: true` — when it is absent the route runs today's exact code, so the flag-off state is byte-identical to today.

**Tech Stack:** Supabase Postgres (hand-numbered migrations), Deno edge functions, Next.js 15 App Router (designer-portal + client-portal), React 19, TanStack Query, `@patina/supabase` hooks, Resend via `sendCompliantEmail`, PostHog flag `client-invite-letter`, Jest + Playwright + Deno tests.

**Spec:**
- `artifacts/client-invite-first-touch-2026-09-08/panel/synthesis.md` — the design
- `artifacts/client-invite-first-touch-2026-09-08/rulings.md` — R1–R13 (binding)
- `artifacts/client-invite-first-touch-2026-09-08/panel/lens-4-voice.md` — **every string, verbatim**
- `artifacts/client-invite-first-touch-2026-09-08/panel/lens-6-systems.md` — architecture, data, lanes, risks
- `artifacts/client-invite-first-touch-2026-09-08/research/01-invite-flow.md`, `research/02-email-system.md`

---

## Global Constraints

Every task's requirements implicitly include this section.

### Voice (lens-4 §D — binding on every string this build writes)

1. **The designer's name comes first, the studio's name signs, and Patina's name appears exactly once — in the colophon, in the smallest type on the page.** No "Patina" in the subject, the headline, the button, or the body.
2. **First person is legal only inside a quoted note from a named, dated human.** Every system sentence is third person, past tense, and states only what actually happened.
3. **Patina may say one thing about itself: "Sent through Patina."** It never signs, never pitches, never explains what it is, never apologizes for arriving, and never welcomes anyone.
4. **Nothing is pre-written and nothing sends itself.** The note field opens empty; its placeholder is an instruction that cannot be mistaken for a draft; the send is a separate act named on the button that performs it.
5. **Every fact is real or the slot prints nothing.** Real dates, never countdowns; a missing studio, city, project, or client name drops its segment *and its separator* rather than taking a placeholder.

### Homeowner vocabulary blacklist (grep-enforced in Task 11)

Never in any string a homeowner reads: `gate`, `task`, `dashboard`, `AI`, `overdue`, `welcome`, `accept`, `collaborate`, `workspace`, `platform`, `magic-link`, `urgency`, `Accept invitation`, `Get started`, `Create your account`, `Join Patina`, `Activate`. **`invite` is retired too**, with exactly two exceptions: the ruled subject line (`… invited you to the …`) and the URL path `/auth/invite/<token>` plus the database object name `client_invitations`, which no human reads.

### Facts locked by ruling

- **R1 From:** `{Studio display name} via Patina <hello@patina.cloud>`; with no studio, `{Designer full name} via Patina <hello@patina.cloud>`. **Reply-to is the designer's own email address**, either way.
- **R2 PP-1:** the email and the token page are client surfaces. Studio letterhead on top, **no Patina wordmark**, Patina exactly once in the colophon. Implemented **additively** in a new module — `supabase/functions/_shared/branded-email.ts` and `_shared/send-email.ts` are **NOT edited**.
- **R3 copy:** lens-4's letter verbatim, EXCEPT the subject reads `{Designer full name} invited you to the {project name}` (no project: `{Designer full name} set up a page for your work together`). The body's standing sentence still says **added you to**.
- **R4 note:** optional, **≤ 280 characters** after trimming. Enforced in the composer, in the route, and by a DB CHECK.
- **R5 delivery:** GoTrue mints at send; its `action_link` is discarded. The letter links to our 7-day `client_invitations` token. Send through `sendCompliantEmail`, `category: 'transactional'`, with an `idempotencyKey`.
- **R6 landing:** page two of the letter. Same letterhead, same standing sentence word for word, same note, one button `Open the project`. **No password.** The button POSTs; the server validates, marks accepted, mints `generateLink({type:'magiclink'})`, redirects to its `action_link`. **Mint on POST, never on GET** — mail scanners prefetch links.
- **R7′ sign-off:** the designer's **full name** on the first letter and on the first-visit note.
- **R8 note afterlife:** seeded at send as the house's first standing note in `project_notes`, with a **FROZEN** byline (never live-resolved). With no project, nothing is seeded.
- **R9 row states, four:** `Letter sent {d}` · `Opened {d}` · `Signed in {d}` · `Link lapsed {d} · Write again`. Never phrased as an absence, never as a duration, never on a client surface. No pills, no dots, no colour, no ✓.
- **R10 resend:** new token, same frozen letter, **one in flight, one per hour**. The lapsed page says `This letter's gone stale.` and offers one tap, `Send a fresh letter`.
- **R11 authorship:** any studio member may write; **the studio owner signs** (signer = the owning organization's `organization_members.role = 'owner'` profile). The note callout still carries the writer's words.
- **R12 rename:** the designer-side rename ships **with this build** — checkbox, helper, button, success lines, activity-log line, all from lens-4 §B.
- **R13 already-has-account:** send a `kind='notice'` letter (no expiry line, button straight to `${CLIENT_PORTAL_URL}/`). Never a silent link.

### Flag

`client-invite-letter` — lowercase kebab, no prefix. Gates the composer field on all three entry points and the new send path. `useFeatureFlag` from `@/hooks/use-feature-flag` is **fail-closed** (`{ value:false, isLoading:true }`): render a skeleton or `null` while `isLoading`, branch on `value` only after. The route is **body-driven, not flag-driven**: it takes the new path only when the body carries `letter: true`, and otherwise runs today's exact code. Do **not** refactor the old branch while you are in there.

### Migration rules (patina-db-migrations)

- Hand-numbered `NNNNN_slug.sql`. **NEVER `supabase migration new`.**
- The number is provisional until merge. Re-run `ls supabase/migrations | tail -3` and `ls supabase/migrations/_pending` immediately before writing the file. (Verified 2026-09-08: head is `00580_room_concept_render.sql`; `_pending` holds only `00106_drop_client_messages.sql`; **00581 is free**.)
- Additive only: new nullable columns, one CHECK, one index, one function. No drops, no data movement.
- Banner header narrating intent and lineage.
- `SECURITY DEFINER` pins `SET search_path TO 'public'`; `REVOKE EXECUTE … FROM PUBLIC, anon` then `GRANT … TO authenticated, service_role`.
- Any migration that adds a GRANT/REVOKE ⇒ regenerate the ACL seed: `python3 scripts/generate-legacy-grants.py`. Never hand-edit `supabase/seed/00-legacy-grants.sql`.
- Public-schema change ⇒ `pnpm db:generate`, then `git diff --exit-code packages/supabase/src/database.types.ts` must be clean **after** you commit the regenerated file.
- Editing an applied migration is forbidden — fix forward with 00582.

### Edge-function rules (patina-edge-functions)

- **Do NOT edit `supabase/functions/_shared/branded-email.ts` or `_shared/send-email.ts`.** They are imported by ~21 functions and a `_shared/*` edit forces redeploying every importer. All new letter rendering lives in a **new** module `_shared/client-letter.ts` that only `client-invite` imports.
- `C` (palette), `F` (fonts), `FONT_LINK` and `HEAD_CSS` in `branded-email.ts` are **module-private, not exported** (verified). `client-letter.ts` therefore duplicates them locally with a comment naming the source. The exported primitives it *does* import are `escapeHtml`, `paragraph`, `muted`, `callout`, `ctaButton`, `spacer`.
- Never run bare `deno` from the repo root — it writes an untracked `./deno.lock`. Always `--config supabase/functions/deno.json`. If a root `deno.lock` appears, delete it; never commit it.
- `verify_jwt = true` (the platform default) for `client-invite`, declared explicitly in `config.toml` mirroring `[functions.designer-invite]`. Every leg of this function is called **server-to-server with the service-role key** from a Next.js route — the browser never calls it directly, so no CORS block is needed and no leg is public.
- All outbound email goes through `sendCompliantEmail`. Never a direct Resend `fetch` (the current function's direct `fetch` at `index.ts:171-178` is removed by this build).

### Portal rules (patina-portal-features)

- `@patina/supabase` resolves to `./src/index.ts` (verified `"main": "./src/index.ts"`) — edits are **live**, no dist rebuild is required for a portal to see them. The `admin-portal build` gate is still mandatory after any `packages/supabase` change, because it is the repo's only build that enforces types.
- Data access: `@patina/supabase` hooks. Types from `@patina/types` / `database.types.ts`, never redefined.
- Portal-local form controls live at `apps/<portal>/src/components/ui/controls/`; document-native surfaces use raw Tailwind with CSS vars (`--color-pearl`, `--color-charcoal`, `--color-clay`, `--color-aged-oak`, `--color-mocha`, `--color-linen`).
- Every hook sits above every early return.

### Test rules (patina-testing)

- **client-portal enforces a coverage floor: lines 70 / branches 60 / functions 70 / statements 70** (`apps/client-portal/jest.config.js:71-78`). Every new file under `apps/client-portal/src` ships with its test in the same commit or the whole suite goes red.
- client-portal's `jest.config.js` uses a catch-all `^@patina/(.*)$` mapper, so `jest.mock('@patina/…')` works there. In designer-portal, `@patina/supabase` is **not** in `tsconfig.json` `paths`, so mocking it works; `@patina/help-system` is the one that silently no-ops.
- Anything reaching `@portabletext/react` throws an ESM `SyntaxError` under Jest — mock the leaf or the relative importer, do not fight `transformIgnorePatterns`.
- No `page.waitForTimeout` in Playwright (a documented convention nothing enforces — grep it yourself). DB assertions after a UI act use `expect.poll`, never a bare post-`networkidle` read.
- Playwright's `webServer.env` **beats** `.env.local` and only reaches servers Playwright starts. A reused dev server without the flag serves gated UI off.

### Verification rules (patina-verification)

- designer-portal and client-portal `build` is **NOT** a type gate (`typescript.ignoreBuildErrors: true`). Their gate is `type-check`.
- **`pnpm --filter @patina/admin-portal build` is the repo's strictest gate** and is required after any `packages/supabase` change.
- Root `pnpm test` / `type-check` silently skip workspaces with no such script. Always use `pnpm --filter`, which errors loudly.
- designer-portal QA runs with `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` — `withMockData()` silently serves mock data on **any** thrown error.
- `/api/version` returns static defaults on the live Workers path and proves nothing about freshness.

### Git

- Never `git add -A`. Stage explicit pathspecs, exactly the ones listed in each task's commit step.
- Conventional Commits.
- Every worktree task begins with `git rev-parse --show-toplevel` to confirm which checkout it is in, and uses absolute paths (`pnpm --dir <abs>` where a filter is not available).

---

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `supabase/migrations/00581_client_invite_letter.sql` | Snapshot columns on `client_invitations`, `author_byline` on `project_notes`, `client_invitation_status()` |
| `supabase/functions/_shared/client-letter.ts` | The client-letter shell (letterhead + colophon, no Patina wordmark), HTML + plain text. Imported only by `client-invite` |
| `supabase/functions/_shared/client-letter.test.ts` | Deno tests + golden snapshot for the shell |
| `supabase/functions/_shared/__snapshots__/client-letter.baseline.html` | Golden shell snapshot |
| `supabase/functions/client-invite/index.test.ts` | Deno tests for the four legs |
| `apps/designer-portal/src/app/api/clients/invite/resend/route.ts` | `POST` — resend an existing letter (L4) |
| `apps/designer-portal/src/components/document/people/directory/letter-line-field.tsx` | The one composer field, three renderings |
| `apps/designer-portal/src/components/document/people/directory/client-letter-line.tsx` | The four People Room row states + `Write again` |
| `apps/designer-portal/e2e/helpers/mailpit.ts` | Mailpit query helper (none exists today) |
| `apps/designer-portal/e2e/people/add-client-letter.spec.ts` | add-client → exactly one Mailpit message |
| `apps/client-portal/src/components/letter/letter-shell.tsx` | Letterhead + colophon for page two |
| `apps/client-portal/src/components/letter/OpenLetterForm.tsx` | One-button form; POSTs, then redirects to `actionLink` |
| `apps/client-portal/src/components/letter/StaleLetterForm.tsx` | `This letter's gone stale.` + `Send a fresh letter` |
| `apps/client-portal/src/app/api/auth/invite/refresh/route.ts` | Proxy to `/refresh` |
| tests for every file above under the matching `__tests__/` | client-portal coverage floor |

**Modified**

| Path | Change |
|---|---|
| `supabase/functions/client-invite/index.ts` | Rewritten: `/`, `/accept`, `/resend`, `/refresh`, all service-role only |
| `supabase/config.toml` | Add `[functions.client-invite] verify_jwt = true` |
| `apps/designer-portal/src/app/api/clients/invite/route.ts` | Add the `letter: true` branch; today's code untouched when absent |
| `packages/supabase/src/hooks/use-clients.ts` | `useAddClient` / `useInviteAndLinkClient` gain `letter`, `note`, `projectId` |
| `packages/supabase/src/hooks/use-client-invitation-status.ts` (new) + `hooks/index.ts` | The L4 read |
| `packages/supabase/src/hooks/use-project-notes.ts` | `ProjectNote.authorByline` |
| `apps/designer-portal/src/components/document/people/directory/add-person-sheet.tsx` | R12 rename + the full field |
| `apps/designer-portal/src/components/portal/client-picker.tsx` | Folded field on the armed row |
| `apps/designer-portal/src/components/document/overlays/send-sheet.tsx` | Passes `personalMessage` as the note |
| `apps/designer-portal/src/components/document/overlays/captured-household-invite.tsx` | Threads the note through |
| `apps/designer-portal/src/components/document/people/views/directory-view.tsx` | Renders `<ClientLetterLine>` under client rows |
| `apps/designer-portal/src/lib/analytics/events.ts` | `has_note` on the client-added event |
| `apps/client-portal/src/app/auth/invite/[token]/page.tsx` | Page two of the letter, from the snapshot only |
| `apps/client-portal/src/app/api/auth/invite/accept/route.ts` | Service-role call; returns `{ actionLink }` |
| `apps/client-portal/src/lib/threshold/derive.ts` | `ThresholdNote.byline`, `NoteModel.byline` |
| `apps/client-portal/src/components/threshold/threshold.tsx` | Threads `byline` |
| `apps/client-portal/src/components/threshold/the-note.tsx` | Prefers the frozen byline |

**Deleted**

| Path | Why |
|---|---|
| `apps/client-portal/src/components/auth/AcceptInviteForm.tsx` | R6 retires the password form. Only the invite page imports it (verified) |
| `apps/client-portal/src/components/auth/__tests__/AcceptInviteForm.test.tsx` | Its subject is gone |

---

## Task index

| # | Lane | One-way? | Deliverable |
|---|---|---|---|
| 1 | L1 | **Yes** (applied migration) | Migration `00581_client_invite_letter.sql` |
| 2 | L1 | No | `_shared/client-letter.ts` + golden snapshot |
| 3 | L1 | No | `client-invite` rewritten — four legs + Deno tests + `config.toml` |
| 4 | L1 | No | `/api/clients/invite` letter branch + `/resend` route |
| 5 | L2 | No | `letter-line-field.tsx` + hook contract + analytics |
| 6 | L2 | No | `add-person-sheet.tsx` — R12 rename + the full field |
| 7 | L2 | No | `client-picker.tsx` + `captured-household-invite.tsx` |
| 8 | L3 | No | Page two of the letter + accept/refresh routes |
| 9 | L3 | No | The frozen byline through `TheNote` |
| 10 | L4 | No | `useClientInvitationStatus` + the four row states + `Write again` |
| 11 | — | No | Integration: merge, full gates, e2e, blacklist grep |
| 12 | — | **Yes** (prod) | Deploy chain |

**Ordering.** Task 1 → 2 → 3 → 4 are strictly sequential (L1, the spine). Tasks 5–7 (L2) and 8–9 (L3) may run in parallel once Task 4's request contract and Task 3's response contract are merged. Task 10 (L4) needs Tasks 1 and 4. Task 11 needs everything. Task 12 needs Task 11 green.

---

## Task 1 — Migration 00581 (Lane L1 · **ONE-WAY**)

**Files:**
- Create: `supabase/migrations/00581_client_invite_letter.sql`
- Modify (regenerated, do not hand-edit): `supabase/seed/00-legacy-grants.sql`
- Modify (regenerated, do not hand-edit): `packages/supabase/src/database.types.ts`
- Test: `supabase/tests/client_invite/letter_snapshot_test.sql`

**Interfaces:**
- Produces:
  - `public.client_invitations` gains: `designer_client_id uuid`, `kind text NOT NULL DEFAULT 'invite'`, `recipient_name text`, `sender_display_name text`, `designer_given_name text`, `designer_full_name text`, `studio_name text`, `studio_logo_url text`, `signature_city text`, `project_name text`, `rendered_subject text`, `rendered_standing_sentence text`, `email_log_id uuid UNIQUE`, `provider_idempotency_key text UNIQUE`, `last_sent_at timestamptz`, `resend_count integer NOT NULL DEFAULT 0`, `superseded_by uuid`, `revoked_at timestamptz`, `signer_id uuid`, `writer_id uuid`; CHECK `char_length(personal_message) <= 280`; index on `designer_client_id`.
  - `public.project_notes` gains `author_byline text`.
  - `public.client_invitation_status(p_designer_client_id uuid) RETURNS TABLE(state text, at timestamptz, invitation_id uuid)` — `state` ∈ `'sent' | 'opened' | 'accepted' | 'lapsed'`; zero rows when there is no non-superseded invitation.

- [ ] **Step 1: Confirm the checkout and the free number**

```bash
git rev-parse --show-toplevel
ls /Users/kody/Code/patina-merged/supabase/migrations | tail -3
ls /Users/kody/Code/patina-merged/supabase/migrations/_pending
```

Expected: head is `00580_room_concept_render.sql`, `_pending` holds only `00106_drop_client_messages.sql`. If anything else already claims `00581`, take the next free number and use it consistently everywhere below (filename, banner, and the deploy task).

- [ ] **Step 2: Confirm the 280 CHECK cannot fail on Strata**

The ALTER validates existing rows. Run this **read-only** probe against prod (read-only prod access is always allowed — patina-prod-ops):

```sql
select count(*) as over_280
from public.client_invitations
where char_length(personal_message) > 280;
```

Expected: `0`. If it is not 0, stop and report — the plan needs a `NOT VALID` CHECK plus a backfill, which is a different migration.

- [ ] **Step 3: Write the failing SQL test**

Create `supabase/tests/client_invite/letter_snapshot_test.sql`:

```sql
\set ON_ERROR_STOP on
BEGIN;

-- A designer, a client household, an invitation.
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'designer@test.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, email, full_name, role)
VALUES ('11111111-1111-1111-1111-111111111111', 'designer@test.local', 'Leah Hartwell', 'designer')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.designer_clients (id, designer_id, client_email, client_name, status)
VALUES ('22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111',
        'dave@okonkwo.test', 'Dave Okonkwo', 'active');

-- 1. The snapshot columns exist and accept a full row.
INSERT INTO public.client_invitations
  (token, email, designer_id, designer_client_id, kind, recipient_name,
   sender_display_name, designer_given_name, designer_full_name, studio_name,
   signature_city, project_name, rendered_subject, rendered_standing_sentence,
   personal_message, signer_id, writer_id, last_sent_at)
VALUES
  ('tok-letter-1', 'dave@okonkwo.test',
   '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222',
   'invite', 'Dave Okonkwo',
   'Middle West Studio', 'Leah', 'Leah Hartwell', 'Middle West Studio',
   'Madison', 'Van Hise kitchen and back hall',
   'Leah Hartwell invited you to the Van Hise kitchen and back hall',
   'Leah Hartwell of Middle West Studio added you to the Van Hise kitchen and back hall on 8 September. The page below holds the studio''s record of the job — the plans, the papers, and the numbers.',
   'Dave — this is the same file I work from.',
   '11111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111',
   now());

-- 2. The 280 cap is enforced by the database, not only by the composer.
DO $$
BEGIN
  INSERT INTO public.client_invitations (token, email, designer_id, personal_message)
  VALUES ('tok-letter-too-long', 'x@test.local',
          '11111111-1111-1111-1111-111111111111', repeat('x', 281));
  RAISE EXCEPTION 'expected the 280 CHECK to reject a 281-character note';
EXCEPTION WHEN check_violation THEN
  NULL;
END $$;

-- 3. kind is constrained.
DO $$
BEGIN
  INSERT INTO public.client_invitations (token, email, designer_id, kind)
  VALUES ('tok-letter-bad-kind', 'y@test.local',
          '11111111-1111-1111-1111-111111111111', 'shout');
  RAISE EXCEPTION 'expected the kind CHECK to reject an unknown kind';
EXCEPTION WHEN check_violation THEN
  NULL;
END $$;

-- 4. project_notes carries a frozen byline.
DO $$
DECLARE v_col text;
BEGIN
  SELECT column_name INTO v_col FROM information_schema.columns
   WHERE table_schema='public' AND table_name='project_notes' AND column_name='author_byline';
  IF v_col IS NULL THEN
    RAISE EXCEPTION 'project_notes.author_byline is missing';
  END IF;
END $$;

-- 5. The status function is callable and reads the latest non-superseded row.
DO $$
DECLARE v_state text;
BEGIN
  SELECT state INTO v_state
    FROM public.client_invitation_status('22222222-2222-2222-2222-222222222222');
  IF v_state IS DISTINCT FROM 'sent' THEN
    RAISE EXCEPTION 'expected state=sent, got %', COALESCE(v_state, '<null>');
  END IF;
END $$;

-- 6. An accepted invitation reads 'accepted'.
UPDATE public.client_invitations SET accepted_at = now() WHERE token = 'tok-letter-1';
DO $$
DECLARE v_state text;
BEGIN
  SELECT state INTO v_state
    FROM public.client_invitation_status('22222222-2222-2222-2222-222222222222');
  IF v_state IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'expected state=accepted, got %', COALESCE(v_state, '<null>');
  END IF;
END $$;

ROLLBACK;
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
  -f /Users/kody/Code/patina-merged/supabase/tests/client_invite/letter_snapshot_test.sql
```

Expected: FAIL — `column "designer_client_id" of relation "client_invitations" does not exist`.

- [ ] **Step 5: Write the migration**

Create `supabase/migrations/00581_client_invite_letter.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- 00581 — The First Letter: a render snapshot for a studio's client letter
--
-- INTENT. A homeowner's first contact stops being GoTrue's generic invite and
-- becomes a letter the studio wrote. The letter must be reproducible byte for
-- byte on the token page days later, so everything it says is FROZEN here at
-- send: who signed it, which studio, which city, which project, the subject and
-- the standing sentence as rendered. Nothing on the token page is read from a
-- mutable profile, project, membership, or organization row. Precedent and
-- rationale: 00388_proposal_send_dispatch_guard.sql's dispatch snapshot.
--
-- ADDITIVE ONLY. New nullable columns, one CHECK, one index, one column on
-- project_notes, one SECURITY DEFINER read. No drops, no data movement, no new
-- table, and no change to client_invitations' existing RLS — its policies are
-- column-agnostic and already cover every column added here. Same shape as
-- 00560_invite_handoff_note.sql, which this file copies deliberately.
--
-- Lineage: no function is redefined here. public.client_invitation_status is new.
--
-- STATUS IS NOT A COLUMN. It is notification_log.status/opened_at joined
-- through email_log_id, plus accepted_at/expires_at on our own row. Duplicating
-- provider status into a second table is how the two drift.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── The snapshot ───────────────────────────────────────────────────────────
ALTER TABLE public.client_invitations
  -- The missing join: today client_invitations and designer_clients do not
  -- know about each other, so a People Room row cannot find its own letter.
  ADD COLUMN IF NOT EXISTS designer_client_id uuid
    REFERENCES public.designer_clients(id) ON DELETE SET NULL,
  -- 'notice' is R13's already-has-account letter: same snapshot, same status
  -- rail, nothing to accept.
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'invite',
  ADD COLUMN IF NOT EXISTS recipient_name         text,
  ADD COLUMN IF NOT EXISTS sender_display_name    text,
  ADD COLUMN IF NOT EXISTS designer_given_name    text,
  ADD COLUMN IF NOT EXISTS designer_full_name     text,
  ADD COLUMN IF NOT EXISTS studio_name            text,
  ADD COLUMN IF NOT EXISTS studio_logo_url        text,
  ADD COLUMN IF NOT EXISTS signature_city         text,
  ADD COLUMN IF NOT EXISTS project_name           text,
  ADD COLUMN IF NOT EXISTS rendered_subject       text,
  -- R6: the token page prints this sentence word for word. Stored rather than
  -- recomposed so the page cannot disagree with the letter even if the
  -- composer changes underneath it.
  ADD COLUMN IF NOT EXISTS rendered_standing_sentence text,
  ADD COLUMN IF NOT EXISTS email_log_id           uuid,
  ADD COLUMN IF NOT EXISTS provider_idempotency_key text,
  ADD COLUMN IF NOT EXISTS last_sent_at           timestamptz,
  ADD COLUMN IF NOT EXISTS resend_count           integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS superseded_by          uuid
    REFERENCES public.client_invitations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revoked_at             timestamptz,
  -- R11: any studio member may write; the studio owner signs.
  ADD COLUMN IF NOT EXISTS signer_id              uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS writer_id              uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'client_invitations_kind_check'
       AND conrelid = 'public.client_invitations'::regclass
  ) THEN
    ALTER TABLE public.client_invitations
      ADD CONSTRAINT client_invitations_kind_check
      CHECK (kind IN ('invite', 'notice'));
  END IF;

  -- R4: the cap is a length, not a preference. Enforced here as well as in the
  -- composer and the route, so no caller can write a letter the reader cannot
  -- take in. Confirmed 0 rows over 280 on Strata before this shipped.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'client_invitations_personal_message_len'
       AND conrelid = 'public.client_invitations'::regclass
  ) THEN
    ALTER TABLE public.client_invitations
      ADD CONSTRAINT client_invitations_personal_message_len
      CHECK (personal_message IS NULL OR char_length(personal_message) <= 280);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_invitations_email_log
  ON public.client_invitations(email_log_id) WHERE email_log_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_invitations_idem_key
  ON public.client_invitations(provider_idempotency_key)
  WHERE provider_idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_invitations_designer_client
  ON public.client_invitations(designer_client_id);

COMMENT ON COLUMN public.client_invitations.rendered_standing_sentence IS
  '00581: the letter''s system sentence, frozen at send. The token page prints '
  'this verbatim so the email and the page cannot say different words.';

-- ── The frozen byline on a seeded note (R8) ────────────────────────────────
-- The note the designer wrote becomes the house''s first standing note. Its
-- byline is FROZEN — a studio that renames itself must not silently relabel a
-- letter it sent last month. TheNote prefers this over the live studio name
-- whenever it is present. Nullable: every existing note keeps live resolution.
ALTER TABLE public.project_notes
  ADD COLUMN IF NOT EXISTS author_byline text;

COMMENT ON COLUMN public.project_notes.author_byline IS
  '00581: a byline frozen at write time, e.g. "Leah Hartwell · Middle West '
  'Studio · 8 September". When set, the client page signs the note with this '
  'and never with a live-resolved studio name.';

-- No GRANT is needed for the new columns: project_notes already carries
-- table-level GRANT SELECT, INSERT to authenticated and GRANT ALL to
-- service_role (00565). The column-scoped UPDATE grant deliberately omits
-- author_byline, so a studio member cannot rewrite a byline after the fact.

-- ── The one read a designer needs (L4) ─────────────────────────────────────
-- notification_log's policies are ADDRESSEE-scoped (00562 grants the addressed
-- user the opened-mark), not sender-scoped, so a designer joining to it under
-- her own JWT would silently read nothing. SECURITY DEFINER, restricted to the
-- caller's own invitations, is the narrowest thing that answers the question.
CREATE OR REPLACE FUNCTION public.client_invitation_status(
  p_designer_client_id uuid
)
RETURNS TABLE (state text, at timestamptz, invitation_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH latest AS (
    SELECT ci.*
      FROM public.client_invitations ci
     WHERE ci.designer_client_id = p_designer_client_id
       AND ci.designer_id = (select auth.uid())
       AND ci.superseded_by IS NULL
       AND ci.revoked_at IS NULL
     ORDER BY ci.sent_at DESC
     LIMIT 1
  )
  SELECT
    CASE
      WHEN l.accepted_at IS NOT NULL                     THEN 'accepted'
      WHEN l.expires_at < now()                          THEN 'lapsed'
      WHEN nl.opened_at IS NOT NULL                      THEN 'opened'
      ELSE                                                    'sent'
    END AS state,
    CASE
      WHEN l.accepted_at IS NOT NULL                     THEN l.accepted_at
      WHEN l.expires_at < now()                          THEN l.expires_at
      WHEN nl.opened_at IS NOT NULL                      THEN nl.opened_at
      ELSE COALESCE(l.last_sent_at, l.sent_at)
    END AS at,
    l.id AS invitation_id
  FROM latest l
  LEFT JOIN public.notification_log nl ON nl.id = l.email_log_id;
$$;

REVOKE EXECUTE ON FUNCTION public.client_invitation_status(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_invitation_status(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.client_invitation_status(uuid) IS
  '00581: the four row states a designer reads for her own letter — sent, '
  'opened, accepted, lapsed — from the latest non-superseded invitation joined '
  'to its notification_log row. Scoped to the calling designer''s own rows. '
  'Returns zero rows when no letter has been written.';
```

- [ ] **Step 6: Regenerate the ACL seed (this migration adds GRANT/REVOKE)**

```bash
cd /Users/kody/Code/patina-merged && python3 scripts/generate-legacy-grants.py
```

- [ ] **Step 7: Apply locally and run the test to verify it passes**

```bash
cd /Users/kody/Code/patina-merged && pnpm supabase:reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
  -f /Users/kody/Code/patina-merged/supabase/tests/client_invite/letter_snapshot_test.sql
```

Expected: the reset applies clean; the test prints `ROLLBACK` with no `ERROR`.

- [ ] **Step 8: Regenerate types and prove they are in sync**

```bash
cd /Users/kody/Code/patina-merged
export SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
pnpm db:generate
git diff --stat packages/supabase/src/database.types.ts   # expect: changed
```

Then, after staging in Step 9, `git diff --exit-code packages/supabase/src/database.types.ts` must be empty.

- [ ] **Step 9: Commit**

```bash
cd /Users/kody/Code/patina-merged
git add supabase/migrations/00581_client_invite_letter.sql \
        supabase/tests/client_invite/letter_snapshot_test.sql \
        supabase/seed/00-legacy-grants.sql \
        packages/supabase/src/database.types.ts
git commit -m "feat(db): 00581 client-letter snapshot, frozen note byline, invitation status"
```

---

## Task 2 — The client-letter shell (Lane L1)

**Files:**
- Create: `supabase/functions/_shared/client-letter.ts`
- Create: `supabase/functions/_shared/client-letter.test.ts`
- Create: `supabase/functions/_shared/__snapshots__/client-letter.baseline.html`

**Interfaces:**
- Consumes: `escapeHtml`, `paragraph`, `muted`, `callout`, `ctaButton`, `spacer` from `./branded-email.ts` (that file is **not** edited).
- Produces:

```ts
export interface ClientLetterSnapshot {
  kind: 'invite' | 'notice';
  recipientEmail: string;
  recipientName: string | null;
  designerFullName: string;
  designerGivenName: string;
  studioName: string | null;
  studioLogoUrl: string | null;
  signatureCity: string | null;
  projectName: string | null;
  personalMessage: string | null;
  sentAt: string;          // ISO
  expiresAt: string;       // ISO — ignored when kind === 'notice'
  ctaUrl: string;
}

export interface RenderedClientLetter {
  subject: string;
  preheader: string;
  standingSentence: string;
  html: string;
  text: string;
}

export function longDate(iso: string): string;              // "8 September"
export function shortDate(iso: string): string;             // "8 Sept"
export function letterSubject(s: ClientLetterSnapshot): string;
export function standingSentence(s: ClientLetterSnapshot): string;
export function formatFromAddress(displayName: string, email: string): string;
export function senderDisplayName(s: ClientLetterSnapshot): string;
export function renderClientLetter(s: ClientLetterSnapshot): RenderedClientLetter;
```

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/_shared/client-letter.test.ts`:

```ts
import { assert, assertEquals, assertStringIncludes } from
  "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  formatFromAddress,
  letterSubject,
  longDate,
  renderClientLetter,
  senderDisplayName,
  shortDate,
  standingSentence,
  type ClientLetterSnapshot,
} from "./client-letter.ts";

// Fixture 1 — everything: studio, city, project, client name, a note.
const F1: ClientLetterSnapshot = {
  kind: "invite",
  recipientEmail: "dave@okonkwo.net",
  recipientName: "Dave Okonkwo",
  designerFullName: "Leah Hartwell",
  designerGivenName: "Leah",
  studioName: "Middle West Studio",
  studioLogoUrl: null,
  signatureCity: "Madison",
  projectName: "Van Hise kitchen and back hall",
  personalMessage:
    "Dave — this is the same file I work from, not a summary of it. The kitchen cabinet drawings are in there now; the back hall isn't drawn yet. Anything you want changed, say so on the page and I'll see it.",
  sentAt: "2026-09-08T14:00:00.000Z",
  expiresAt: "2026-09-15T14:00:00.000Z",
  ctaUrl: "https://client.patina.cloud/auth/invite/tok1",
};

// Fixture 2 — a designer, an email address, and nothing else.
const F2: ClientLetterSnapshot = {
  kind: "invite",
  recipientEmail: "priya@ramanhouse.com",
  recipientName: "Priya Raman",
  designerFullName: "Nora Feld",
  designerGivenName: "Nora",
  studioName: null,
  studioLogoUrl: null,
  signatureCity: null,
  projectName: null,
  personalMessage: null,
  sentAt: "2026-09-08T14:00:00.000Z",
  expiresAt: "2026-09-15T14:00:00.000Z",
  ctaUrl: "https://client.patina.cloud/auth/invite/tok2",
};

Deno.test("dates print as real dates, never countdowns", () => {
  assertEquals(longDate("2026-09-08T14:00:00.000Z"), "8 September");
  assertEquals(shortDate("2026-09-08T14:00:00.000Z"), "8 Sept");
});

Deno.test("R3 — the subject invites, and never names Patina", () => {
  assertEquals(
    letterSubject(F1),
    "Leah Hartwell invited you to the Van Hise kitchen and back hall",
  );
  assertEquals(
    letterSubject(F2),
    "Nora Feld set up a page for your work together",
  );
  for (const s of [letterSubject(F1), letterSubject(F2)]) {
    assert(!/patina/i.test(s), `subject names Patina: ${s}`);
  }
});

Deno.test("the standing sentence still says 'added you to' (R3)", () => {
  assertEquals(
    standingSentence(F1),
    "Leah Hartwell of Middle West Studio added you to the Van Hise kitchen and back hall on 8 September. The page below holds the studio's record of the job — the plans, the papers, and the numbers.",
  );
  assertEquals(
    standingSentence(F2),
    "Nora Feld set up a page for your work together on 8 September. It's where Nora keeps the record — the plans, the papers, and the numbers, as they come.",
  );
});

Deno.test("R1 — the envelope leads with the studio and discloses the relay", () => {
  assertEquals(senderDisplayName(F1), "Middle West Studio via Patina");
  assertEquals(senderDisplayName(F2), "Nora Feld via Patina");
  assertEquals(
    formatFromAddress("Middle West Studio via Patina", "hello@patina.cloud"),
    "Middle West Studio via Patina <hello@patina.cloud>",
  );
  // A studio name carrying an RFC 5322 special must be quoted, not smuggled.
  assertEquals(
    formatFromAddress("Whitfield, Blake & Co. via Patina", "hello@patina.cloud"),
    '"Whitfield, Blake & Co. via Patina" <hello@patina.cloud>',
  );
  // Control characters and quotes are stripped, never escaped into the header.
  assertEquals(
    formatFromAddress('Ev"il\r\nBcc: x@y.z via Patina', "hello@patina.cloud"),
    '"Evil Bcc: x@y.z via Patina" <hello@patina.cloud>',
  );
});

Deno.test("PP-1 — the letter never wears the Patina wordmark", () => {
  const letter = renderClientLetter(F1);
  // Patina appears exactly once, in the colophon.
  const hits = letter.html.match(/Patina/g) ?? [];
  assertEquals(hits.length, 1);
  assertStringIncludes(
    letter.html,
    "Prepared by Middle West Studio &middot; Sent through Patina",
  );
  assertStringIncludes(letter.html, "MIDDLE WEST STUDIO");
  assertStringIncludes(letter.html, "Madison &middot; 8 September 2026");
  assertStringIncludes(letter.html, "Prepared for Dave Okonkwo");
});

Deno.test("the note is a callout, and a designer typing HTML cannot break it", () => {
  const letter = renderClientLetter({
    ...F1,
    personalMessage: "<script>alert(1)</script> & a plan for <the> hall",
  });
  assert(!letter.html.includes("<script>"));
  assertStringIncludes(letter.html, "&lt;script&gt;alert(1)&lt;/script&gt;");
  assertStringIncludes(letter.html, "&amp; a plan for &lt;the&gt; hall");
});

Deno.test("the letter reads whole with no note", () => {
  const letter = renderClientLetter({ ...F1, personalMessage: null });
  assertStringIncludes(letter.html, "added you to the Van Hise kitchen");
  // No empty frame, no substitute sentence in her voice.
  assert(!/didn.t leave a note/i.test(letter.html));
  assert(!letter.html.includes("border-left:3px solid"));
});

Deno.test("R3 — the CTA names the outcome; never the transaction", () => {
  assertStringIncludes(renderClientLetter(F1).html, "Open the project");
  assertStringIncludes(renderClientLetter(F2).html, "Open the page");
  for (const s of [F1, F2]) {
    const html = renderClientLetter(s).html;
    for (const banned of ["Accept invitation", "Get started", "Create your account", "Join Patina", "Activate"]) {
      assert(!html.includes(banned), `letter says "${banned}"`);
    }
  }
});

Deno.test("A.7 — one dated expiry line with its remedy, and no clock", () => {
  const html = renderClientLetter(F1).html;
  assertStringIncludes(html, "The link works until 15 September; Leah can send another.");
  assert(!/expires in/i.test(html));
  assert(!/don.t miss/i.test(html));
});

Deno.test("R13 — the notice letter has nothing to expire", () => {
  const notice = renderClientLetter({
    ...F1,
    kind: "notice",
    ctaUrl: "https://client.patina.cloud/",
  });
  assert(!/The link works until/.test(notice.html));
  assert(!/lapses on its own/.test(notice.html));
  assertStringIncludes(notice.html, "If this isn&rsquo;t for you, nothing happens &mdash; ignore it.");
});

Deno.test("R7' — the first letter signs with the full name, dropping empty segments", () => {
  assertStringIncludes(
    renderClientLetter(F1).html,
    "&mdash; Leah Hartwell &middot; Middle West Studio &middot; Madison",
  );
  const solo = renderClientLetter(F2).html;
  assertStringIncludes(solo, "&mdash; Nora Feld");
  assert(!solo.includes("&mdash; Nora Feld &middot;"), "a missing segment left its separator behind");
});

Deno.test("the letterhead prints no slot it has no fact for", () => {
  const html = renderClientLetter({ ...F2, recipientName: null }).html;
  assert(!html.includes("Prepared for"));
  assertStringIncludes(html, "8 September 2026");
  assert(!html.includes("&middot; 8 September 2026"), "a missing city left its separator behind");
});

Deno.test("the plain-text part is mandatory and carries the whole letter", () => {
  const letter = renderClientLetter(F1);
  assert(letter.text.length > 0);
  assertStringIncludes(letter.text, "MIDDLE WEST STUDIO");
  assertStringIncludes(letter.text, "added you to the Van Hise kitchen and back hall on 8 September.");
  assertStringIncludes(letter.text, "Dave — this is the same file I work from");
  assertStringIncludes(letter.text, "Open the project: https://client.patina.cloud/auth/invite/tok1");
  assertStringIncludes(letter.text, "Prepared by Middle West Studio · Sent through Patina");
  assert(!letter.text.includes("<"), "the text part carries markup");
});

Deno.test("golden shell — the letter's shape is a diff, not a memory", async () => {
  const html = renderClientLetter(F1).html;
  const path = new URL("./__snapshots__/client-letter.baseline.html", import.meta.url);
  if (Deno.env.get("UPDATE_SNAPSHOTS") === "1") {
    await Deno.writeTextFile(path, html);
  }
  assertEquals(html, await Deno.readTextFile(path));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /Users/kody/Code/patina-merged
deno test --allow-all --config supabase/functions/deno.json \
  supabase/functions/_shared/client-letter.test.ts
```

Expected: FAIL — `Module not found "file:///.../_shared/client-letter.ts"`.

- [ ] **Step 3: Write the module**

Create `supabase/functions/_shared/client-letter.ts`:

```ts
// The client letter — a studio's own paper, carried by Patina.
//
// PP-1 (R2): studio letterhead on top, no Patina wordmark, Patina named exactly
// once in the colophon. `renderBrandedShell` in ./branded-email.ts puts the
// Patina wordmark atop every email by deliberate decision and is imported by
// ~21 senders; editing it would force redeploying all of them and change every
// client-facing email in one commit. So this is an ADDITIVE second shell,
// imported by client-invite alone, and the wholesale change stays its own
// program.
//
// The palette, fonts, font link and head CSS below are copied from
// ./branded-email.ts, where they are module-private (not exported). Keep them
// in step with that file, with packages/email/branded/welcome.html and with
// packages/email/src/components/brand.ts.

import {
  callout,
  ctaButton,
  escapeHtml,
  muted,
  paragraph,
  spacer,
} from "./branded-email.ts";

// ── copied from ./branded-email.ts (module-private there) ──────────────────
const C = {
  paper: "#F5F0E6",
  card: "#FCF9F2",
  cardAlt: "#FFFFFF",
  line: "#E6DDCC",
  ink: "#1F1B16",
  ink2: "#4B463E",
  ink3: "#8C8578",
  verd: "#4E7A66",
  brass: "#B08A46",
  rust: "#A24E2E",
};
const F = {
  serif: "'Fraunces', Georgia, 'Times New Roman', serif",
  sans:
    "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, 'Courier New', monospace",
};
const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Hanken+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
const HEAD_CSS = `
:root { color-scheme: light dark; supported-color-schemes: light dark; }
html, body { margin:0 !important; padding:0 !important; height:100% !important; width:100% !important; }
* { -ms-text-size-adjust:100%; -webkit-text-size-adjust:100%; }
table, td { mso-table-lspace:0pt !important; mso-table-rspace:0pt !important; border-collapse:collapse !important; }
img { -ms-interpolation-mode:bicubic; border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
a { text-decoration:none; }
a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; }
.btn a:hover, .btn:hover td { opacity:0.90 !important; }
@media screen and (max-width:620px) {
  .container { width:100% !important; }
  .px { padding-left:24px !important; padding-right:24px !important; }
}
@media (prefers-color-scheme: dark) {
  body, .bg, .bg td { background:#14110D !important; }
  .card { background:#221E17 !important; border-color:#3B342A !important; }
  .shell { background:#1B1712 !important; border-color:#332D24 !important; }
  .ink { color:#F2EBDD !important; }
  .ink2 { color:#D4CCBB !important; }
  .ink3 { color:#9C9484 !important; }
  .hairbg { background:#3B342A !important; }
  .chip { background:#221E17 !important; border-color:#3B342A !important; }
}`.trim();

// ── dates ──────────────────────────────────────────────────────────────────
// Written out rather than delegated to Intl so the letter reads the same in
// every runtime and the tests pin exact strings. en-GB shape ("8 September",
// "8 Sept"), UTC, because a date on a letter is a fact, not a locale.
const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "June",
  "July", "Aug", "Sept", "Oct", "Nov", "Dec",
];

export function longDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${LONG_MONTHS[d.getUTCMonth()]}`;
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`;
}

function longDateWithYear(iso: string): string {
  return `${longDate(iso)} ${new Date(iso).getUTCFullYear()}`;
}

// ── the snapshot the letter is rendered from, and nothing else ─────────────
export interface ClientLetterSnapshot {
  kind: "invite" | "notice";
  recipientEmail: string;
  recipientName: string | null;
  designerFullName: string;
  designerGivenName: string;
  studioName: string | null;
  studioLogoUrl: string | null;
  signatureCity: string | null;
  projectName: string | null;
  personalMessage: string | null;
  /** ISO. The date the letterhead and the standing sentence print. */
  sentAt: string;
  /** ISO. Ignored when kind === 'notice' — a notice expires nothing. */
  expiresAt: string;
  ctaUrl: string;
}

export interface RenderedClientLetter {
  subject: string;
  preheader: string;
  standingSentence: string;
  html: string;
  text: string;
}

/** The name on the paper: the studio, or the designer where there is no studio. */
function letterheadName(s: ClientLetterSnapshot): string {
  return (s.studioName ?? "").trim() || s.designerFullName;
}

/**
 * R1. The business name leads and "via" discloses the relay — the Gmail-Groups
 * pattern, which reads as a legitimate relay rather than display-name spoofing.
 */
export function senderDisplayName(s: ClientLetterSnapshot): string {
  return `${letterheadName(s)} via Patina`;
}

/**
 * RFC 5322: a display name carrying a special must be a quoted-string. Control
 * characters and quotes are STRIPPED, never escaped — a studio name is not a
 * place to negotiate header injection.
 */
export function formatFromAddress(displayName: string, email: string): string {
  const clean = displayName
    .replace(/[\r\n\t\0]/g, "")
    .replace(/["\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const needsQuoting = /[()<>@,;:.\[\]]/.test(clean);
  return needsQuoting ? `"${clean}" <${email}>` : `${clean} <${email}>`;
}

/** R3. The one place "invited" survives the homeowner vocabulary. */
export function letterSubject(s: ClientLetterSnapshot): string {
  const project = (s.projectName ?? "").trim();
  return project
    ? `${s.designerFullName} invited you to the ${project}`
    : `${s.designerFullName} set up a page for your work together`;
}

/** A.2. Defines the thing being handed over rather than repeating the subject. */
export function preheader(s: ClientLetterSnapshot): string {
  return s.studioName
    ? `Where ${s.studioName} keeps the record of your job.`
    : `Where ${s.designerGivenName} keeps the record of your work.`;
}

/**
 * A.4. Two sentences, deliberately: "added you to X" tells a stranger nothing
 * about what X is. Third person for the fact, second person only as address.
 * Degradation: `{full name} of {Studio}` -> `{full name}`; `to {project}` ->
 * `for your work together`. With no studio the second sentence drops the word
 * "studio" rather than naming one that does not exist.
 */
export function standingSentence(s: ClientLetterSnapshot): string {
  const date = longDate(s.sentAt);
  const who = s.studioName
    ? `${s.designerFullName} of ${s.studioName}`
    : s.designerFullName;
  const project = (s.projectName ?? "").trim();
  if (project) {
    const record = s.studioName
      ? "The page below holds the studio's record of the job"
      : "The page below holds the record of the job";
    return `${who} added you to the ${project} on ${date}. ${record} — the plans, the papers, and the numbers.`;
  }
  return `${who} set up a page for your work together on ${date}. It's where ${s.designerGivenName} keeps the record — the plans, the papers, and the numbers, as they come.`;
}

function ctaLabel(s: ClientLetterSnapshot): string {
  return s.projectName ? "Open the project" : "Open the page";
}

/** A.8. Missing studio and missing city each drop their segment AND separator. */
function signOffLine(s: ClientLetterSnapshot): string {
  return [s.designerFullName, s.studioName, s.signatureCity]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

function letterhead(s: ClientLetterSnapshot): string {
  const name = letterheadName(s);
  const place = [s.signatureCity?.trim(), longDateWithYear(s.sentAt)]
    .filter(Boolean)
    .join(" · ");
  const logo = s.studioLogoUrl
    ? `<td valign="middle" style="padding-right:10px;"><img src="${escapeHtml(s.studioLogoUrl)}" height="20" alt="${escapeHtml(name)}" style="display:block; height:20px; max-height:24px; width:auto; border:0; outline:none; text-decoration:none;"></td>`
    : "";
  const preparedFor = s.recipientName?.trim()
    ? `<td align="right" valign="top" class="ink3" style="font-family:${F.sans}; font-size:13px; color:${C.ink3};">Prepared for ${escapeHtml(s.recipientName.trim())}</td>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>
            <td align="left" valign="top">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${logo}
                <td valign="middle" class="ink" style="font-family:${F.serif}; font-size:19px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:${C.ink};">${escapeHtml(name).toUpperCase()}</td>
              </tr></table>
              <div class="ink3" style="margin-top:5px; font-family:${F.mono}; font-size:11px; letter-spacing:0.08em; color:${C.ink3};">${escapeHtml(place)}</div>
            </td>
            ${preparedFor}
          </tr></table>`;
}

function colophon(s: ClientLetterSnapshot): string {
  const by = letterheadName(s);
  const ignore = s.kind === "notice"
    ? "If this isn&rsquo;t for you, nothing happens &mdash; ignore it."
    : "If this isn&rsquo;t for you, nothing happens &mdash; ignore it and the link lapses on its own.";
  const lines = [
    `Prepared by ${escapeHtml(by)} &middot; Sent through Patina`,
    `Sent to ${escapeHtml(s.recipientEmail)} at the request of ${escapeHtml(by)}.`,
    ignore,
    `Button not working? Paste this link into your browser:<br><a href="${s.ctaUrl}" style="color:${C.verd}; text-decoration:underline; word-break:break-all;">${escapeHtml(s.ctaUrl)}</a>`,
  ];
  return lines
    .map(
      (l) =>
        `<div class="ink3" style="font-family:${F.sans}; font-size:12px; line-height:1.65; color:${C.ink3};">${l}</div>`,
    )
    .join("");
}

export function renderClientLetter(s: ClientLetterSnapshot): RenderedClientLetter {
  const subject = letterSubject(s);
  const preview = preheader(s);
  const standing = standingSentence(s);

  const note = s.personalMessage?.trim()
    ? callout(escapeHtml(s.personalMessage.trim()))
    : "";
  const expiry = s.kind === "invite"
    ? muted(
      `The link works until ${escapeHtml(longDate(s.expiresAt))}; ${escapeHtml(s.designerGivenName)} can send another.`,
    )
    : "";
  const signature = signOffLine(s);
  const signOffHtml = signature
    ? paragraph(`&mdash; ${escapeHtml(signature).replace(/ · /g, " &middot; ")}`)
    : "";

  const body = [
    paragraph(escapeHtml(standing)),
    note,
    spacer(6),
    ctaButton(s.ctaUrl, ctaLabel(s), "brass"),
    spacer(10),
    expiry,
    signOffHtml,
  ].join("");

  const preheaderBlock =
    `<div style="display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; mso-hide:all; color:transparent;">${escapeHtml(preview)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>`;

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(subject)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="${FONT_LINK}" rel="stylesheet">
  <style>${HEAD_CSS}</style>
</head>
<body class="bg" style="margin:0; padding:0; background:${C.paper};">
  ${preheaderBlock}
  <table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; background:${C.paper};">
    <tr><td align="center" style="padding:24px 12px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" class="container shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background:${C.card}; border:1px solid ${C.line}; border-radius:12px; overflow:hidden;">
        <tr><td class="px" style="padding:30px 40px 0;">
          ${letterhead(s)}
        </td></tr>
        <tr><td class="px" style="padding:18px 40px 0;">
          <div class="hairbg" style="height:1px; background:${C.line}; font-size:0; line-height:0;">&nbsp;</div>
        </td></tr>
        <tr><td class="px" style="padding:22px 40px 0;">
          ${body}
        </td></tr>
        <tr><td class="px" style="padding:26px 40px 0;">
          <div class="hairbg" style="height:1px; background:${C.line}; font-size:0; line-height:0;">&nbsp;</div>
        </td></tr>
        <tr><td class="px" style="padding:18px 40px 30px;">
          ${colophon(s)}
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;

  const textLines = [
    letterheadName(s).toUpperCase(),
    [s.signatureCity?.trim(), longDateWithYear(s.sentAt)].filter(Boolean).join(" · "),
    s.recipientName?.trim() ? `Prepared for ${s.recipientName.trim()}` : "",
    "",
    standing,
    "",
    s.personalMessage?.trim() ?? "",
    s.personalMessage?.trim() ? "" : "",
    `${ctaLabel(s)}: ${s.ctaUrl}`,
    "",
    s.kind === "invite"
      ? `The link works until ${longDate(s.expiresAt)}; ${s.designerGivenName} can send another.`
      : "",
    signature ? `— ${signature}` : "",
    "",
    `Prepared by ${letterheadName(s)} · Sent through Patina`,
    `Sent to ${s.recipientEmail} at the request of ${letterheadName(s)}.`,
    s.kind === "notice"
      ? "If this isn't for you, nothing happens — ignore it."
      : "If this isn't for you, nothing happens — ignore it and the link lapses on its own.",
  ];
  const text = textLines
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n")
    .trim();

  return { subject, preheader: preview, standingSentence: standing, html, text };
}
```

- [ ] **Step 4: Mint the golden snapshot, then run the tests to verify they pass**

```bash
cd /Users/kody/Code/patina-merged
mkdir -p supabase/functions/_shared/__snapshots__
touch supabase/functions/_shared/__snapshots__/client-letter.baseline.html
UPDATE_SNAPSHOTS=1 deno test --allow-all --config supabase/functions/deno.json \
  supabase/functions/_shared/client-letter.test.ts
deno test --allow-all --config supabase/functions/deno.json \
  supabase/functions/_shared/client-letter.test.ts
```

Expected: the second run reports `ok` for all 12 tests, `0 failed`.

Then read `supabase/functions/_shared/__snapshots__/client-letter.baseline.html` and confirm by eye: no "Patina" above the colophon, the letterhead reads `MIDDLE WEST STUDIO` / `Madison · 8 September 2026` / `Prepared for Dave Okonkwo`.

- [ ] **Step 5: Confirm no stray lockfile, then commit**

```bash
cd /Users/kody/Code/patina-merged
test -f deno.lock && rm deno.lock && echo "removed stray root deno.lock" || echo "no stray lockfile"
git add supabase/functions/_shared/client-letter.ts \
        supabase/functions/_shared/client-letter.test.ts \
        supabase/functions/_shared/__snapshots__/client-letter.baseline.html
git commit -m "feat(email): the client letter shell — studio letterhead, Patina once in the colophon"
```

---

## Task 3 — `client-invite` rewritten: four legs (Lane L1)

**Files:**
- Modify: `supabase/functions/client-invite/index.ts` (whole-file rewrite)
- Create: `supabase/functions/client-invite/lib.ts` (pure logic, so the handler's decisions are testable without a network)
- Create: `supabase/functions/client-invite/index.test.ts`
- Modify: `supabase/config.toml` (add `[functions.client-invite]` after the `[functions.designer-invite]` block at ~L391)

**Interfaces:**
- Consumes: `renderClientLetter`, `letterSubject`, `standingSentence`, `senderDisplayName`, `formatFromAddress`, `ClientLetterSnapshot` (Task 2); `sendCompliantEmail` and `ComplianceSendOptions` from `_shared/send-email.ts`; `resolveStudioIdentity`, `studioDisplayName`, `studioSignatureCity` from `_shared/studio-identity.ts`; `givenName` from `_shared/branded-email.ts`.
- Produces — four service-role-only legs:

| Route | Body | Response |
|---|---|---|
| `POST /` | `{ designerClientId?, email, clientName?, projectId?, note?, kind: 'invite' \| 'notice', writerId }` | `200 { invitationId, token, profileId, kind }` |
| `POST /accept` | `{ token }` | `200 { actionLink }` · `404 not_found` · `409 already_accepted` · `410 expired` · `403 revoked` |
| `POST /resend` | `{ invitationId, writerId }` | `200 { invitationId, token }` · `429 too_soon` |
| `POST /refresh` | `{ token }` | always `200 { ok: true }` — never leaks whether the token existed |

- [ ] **Step 1: Confirm nothing outside this repo calls the send leg**

lens-6 flags an unfound caller. Before rewriting the request shape:

```bash
cd /Users/kody/Code/patina-merged
grep -rn "client-invite" apps packages services supabase --include='*.ts' --include='*.tsx' --include='*.swift' | grep -v "_shared/client-letter" | grep -v "functions/client-invite/"
```

Expected: exactly one runtime hit — `apps/client-portal/src/app/api/auth/invite/accept/route.ts:27`. If a Swift or admin caller turns up, stop and report before changing the shape.

- [ ] **Step 2: Write the failing tests**

Create `supabase/functions/client-invite/index.test.ts`:

```ts
import { assert, assertEquals } from
  "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildSnapshot,
  isServiceRoleCaller,
  resendCooldownRemainingMs,
  validateNote,
  validateToken,
  RESEND_COOLDOWN_MS,
} from "./lib.ts";

Deno.test("R4 — the note is optional, trimmed, and capped at 280", () => {
  assertEquals(validateNote(undefined), { ok: true, value: null });
  assertEquals(validateNote("   "), { ok: true, value: null });
  assertEquals(validateNote("  a line  "), { ok: true, value: "a line" });
  assertEquals(validateNote("x".repeat(280)).ok, true);
  assertEquals(validateNote("x".repeat(281)), { ok: false, error: "note_too_long" });
  // Trimming happens BEFORE the cap, so trailing whitespace never costs a letter.
  assertEquals(validateNote(`${"x".repeat(280)}   `).ok, true);
});

Deno.test("only the service role may reach any leg", () => {
  assert(isServiceRoleCaller("Bearer sr-key", "sr-key"));
  assert(!isServiceRoleCaller("Bearer designer-jwt", "sr-key"));
  assert(!isServiceRoleCaller(null, "sr-key"));
  assert(!isServiceRoleCaller("Bearer ", "sr-key"));
  // An empty configured key can never be satisfied.
  assert(!isServiceRoleCaller("Bearer ", ""));
});

Deno.test("token validation is total and orders its failures", () => {
  const base = {
    accepted_at: null as string | null,
    revoked_at: null as string | null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  assertEquals(validateToken(null), { ok: false, error: "not_found", status: 404 });
  assertEquals(validateToken(base), { ok: true });
  assertEquals(
    validateToken({ ...base, revoked_at: new Date().toISOString() }),
    { ok: false, error: "revoked", status: 403 },
  );
  assertEquals(
    validateToken({ ...base, accepted_at: new Date().toISOString() }),
    { ok: false, error: "already_accepted", status: 409 },
  );
  assertEquals(
    validateToken({ ...base, expires_at: new Date(Date.now() - 1).toISOString() }),
    { ok: false, error: "expired", status: 410 },
  );
  // Accepted beats expired: a letter she used is not a letter that lapsed.
  assertEquals(
    validateToken({
      ...base,
      accepted_at: new Date().toISOString(),
      expires_at: new Date(Date.now() - 1).toISOString(),
    }),
    { ok: false, error: "already_accepted", status: 409 },
  );
});

Deno.test("R10 — one letter per hour", () => {
  const now = Date.now();
  assertEquals(resendCooldownRemainingMs(null, now), 0);
  assertEquals(
    resendCooldownRemainingMs(new Date(now - RESEND_COOLDOWN_MS - 1).toISOString(), now),
    0,
  );
  const remaining = resendCooldownRemainingMs(
    new Date(now - 60_000).toISOString(),
    now,
  );
  assertEquals(remaining, RESEND_COOLDOWN_MS - 60_000);
});

Deno.test("the snapshot is assembled once, and the letter reads only from it", () => {
  const snap = buildSnapshot({
    kind: "invite",
    email: "dave@okonkwo.net",
    clientName: "Dave Okonkwo",
    signerFullName: "Leah Hartwell",
    studioName: "Middle West Studio",
    studioLogoUrl: null,
    signatureCity: "Madison",
    projectName: "Van Hise kitchen and back hall",
    note: "a line",
    sentAt: "2026-09-08T14:00:00.000Z",
    expiresAt: "2026-09-15T14:00:00.000Z",
    ctaUrl: "https://client.patina.cloud/auth/invite/tok1",
  });
  assertEquals(snap.designerGivenName, "Leah");
  assertEquals(snap.designerFullName, "Leah Hartwell");
  assertEquals(snap.recipientName, "Dave Okonkwo");
  assertEquals(
    snap.ctaUrl,
    "https://client.patina.cloud/auth/invite/tok1",
  );
});

Deno.test("the letter's CTA is OUR token, never a GoTrue link", () => {
  const snap = buildSnapshot({
    kind: "invite",
    email: "dave@okonkwo.net",
    clientName: null,
    signerFullName: "Leah Hartwell",
    studioName: null,
    studioLogoUrl: null,
    signatureCity: null,
    projectName: null,
    note: null,
    sentAt: "2026-09-08T14:00:00.000Z",
    expiresAt: "2026-09-15T14:00:00.000Z",
    ctaUrl: "https://client.patina.cloud/auth/invite/tok9",
  });
  assert(snap.ctaUrl.includes("/auth/invite/"));
  assert(!snap.ctaUrl.includes("/auth/v1/verify"));
  assert(!snap.ctaUrl.includes("token_hash"));
});

Deno.test("R13 — a notice's CTA goes straight to the house", () => {
  const snap = buildSnapshot({
    kind: "notice",
    email: "dave@okonkwo.net",
    clientName: "Dave Okonkwo",
    signerFullName: "Leah Hartwell",
    studioName: "Middle West Studio",
    studioLogoUrl: null,
    signatureCity: "Madison",
    projectName: null,
    note: null,
    sentAt: "2026-09-08T14:00:00.000Z",
    expiresAt: "2026-09-15T14:00:00.000Z",
    ctaUrl: "https://client.patina.cloud/",
  });
  assertEquals(snap.kind, "notice");
  assertEquals(snap.ctaUrl, "https://client.patina.cloud/");
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd /Users/kody/Code/patina-merged
deno test --allow-all --config supabase/functions/deno.json supabase/functions/client-invite/
```

Expected: FAIL — `Module not found "file:///.../client-invite/lib.ts"`.

- [ ] **Step 4: Write `lib.ts`**

Create `supabase/functions/client-invite/lib.ts`:

```ts
// Pure decisions for the client-invite legs, split out so they can be tested
// without a Supabase client, a network, or a clock.

import { givenName } from "../_shared/branded-email.ts";
import type { ClientLetterSnapshot } from "../_shared/client-letter.ts";

/** R10: one letter per hour, per invitation. */
export const RESEND_COOLDOWN_MS = 60 * 60 * 1000;

/** R4: optional, trimmed, 280. Trimming precedes the cap. */
export function validateNote(
  raw: string | null | undefined,
): { ok: true; value: string | null } | { ok: false; error: "note_too_long" } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > 280) return { ok: false, error: "note_too_long" };
  return { ok: true, value: trimmed };
}

/**
 * Every leg of this function is called server-to-server by a Next.js route
 * holding the service-role key. The gateway's verify_jwt only proves the bearer
 * is SOME valid token; this proves it is the one principal allowed to name an
 * arbitrary writer and signer.
 */
export function isServiceRoleCaller(
  authorizationHeader: string | null,
  serviceRoleKey: string,
): boolean {
  if (!serviceRoleKey) return false;
  const token = (authorizationHeader ?? "").replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 && token === serviceRoleKey;
}

export interface TokenRow {
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
}

export type TokenVerdict =
  | { ok: true }
  | { ok: false; error: string; status: number };

/**
 * Order matters and is deliberate: revoked, then accepted, then expired. A
 * letter she already used is not a letter that lapsed, and the lapsed page
 * offers a resend she does not need.
 */
export function validateToken(row: TokenRow | null, now = Date.now()): TokenVerdict {
  if (!row) return { ok: false, error: "not_found", status: 404 };
  if (row.revoked_at) return { ok: false, error: "revoked", status: 403 };
  if (row.accepted_at) return { ok: false, error: "already_accepted", status: 409 };
  if (new Date(row.expires_at).getTime() < now) {
    return { ok: false, error: "expired", status: 410 };
  }
  return { ok: true };
}

export function resendCooldownRemainingMs(
  lastSentAt: string | null,
  now = Date.now(),
): number {
  if (!lastSentAt) return 0;
  const elapsed = now - new Date(lastSentAt).getTime();
  return elapsed >= RESEND_COOLDOWN_MS ? 0 : RESEND_COOLDOWN_MS - elapsed;
}

export interface SnapshotInput {
  kind: "invite" | "notice";
  email: string;
  clientName: string | null;
  /** R11: the STUDIO OWNER's full name. The writer's words, the owner's name. */
  signerFullName: string;
  studioName: string | null;
  studioLogoUrl: string | null;
  signatureCity: string | null;
  projectName: string | null;
  note: string | null;
  sentAt: string;
  expiresAt: string;
  ctaUrl: string;
}

/** The one place the letter's facts are assembled. Everything downstream reads
 *  this object and never a live table. */
export function buildSnapshot(input: SnapshotInput): ClientLetterSnapshot {
  return {
    kind: input.kind,
    recipientEmail: input.email,
    recipientName: input.clientName?.trim() || null,
    designerFullName: input.signerFullName,
    designerGivenName: givenName(input.signerFullName),
    studioName: input.studioName?.trim() || null,
    studioLogoUrl: input.studioLogoUrl?.trim() || null,
    signatureCity: input.signatureCity?.trim() || null,
    projectName: input.projectName?.trim() || null,
    personalMessage: input.note?.trim() || null,
    sentAt: input.sentAt,
    expiresAt: input.expiresAt,
    ctaUrl: input.ctaUrl,
  };
}

export function generateToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /Users/kody/Code/patina-merged
deno test --allow-all --config supabase/functions/deno.json supabase/functions/client-invite/
```

Expected: `ok | 7 passed | 0 failed`.

- [ ] **Step 6: Rewrite `index.ts`**

Replace the whole of `supabase/functions/client-invite/index.ts`:

```ts
// Supabase Edge Function: client-invite — The First Letter
//
// POST /         send a studio's letter to a homeowner (kind 'invite' | 'notice')
// POST /accept   redeem our 7-day token: mark accepted, mint a magic link, return it
// POST /resend   R10 — new token, same frozen letter, one per hour
// POST /refresh  the lapsed page's one tap; never says whether the token existed
//
// EVERY LEG IS SERVICE-ROLE ONLY. The browser never calls this function; the
// designer portal's /api/clients/invite and the client portal's
// /api/auth/invite/{accept,refresh} call it server-to-server with the
// service-role key. verify_jwt stays true (config.toml) and isServiceRoleCaller
// is the compensating in-code check, because these legs name an arbitrary
// writer, signer and recipient.
//
// R5 — THE HYBRID PATH. GoTrue mints the account at send and its action_link is
// DISCARDED: every GoTrue link expires at the shared otp_expiry (3600s,
// config.toml), which also governs password recovery and cannot be raised for
// one channel. The seven-day object is ours — client_invitations.expires_at —
// so the letter's CTA points at our token and a GoTrue magic link is minted at
// CLICK time, on a button POST. Mint on POST, never on GET: Outlook SafeLinks
// and similar scanners follow links in mail and would otherwise burn the token
// before she ever clicks it.
//
// notification_log.user_id is NOT NULL (00041). That is why the account is
// minted BEFORE the send, not after — a hard ordering constraint, not a taste.

// deno-lint-ignore-file no-explicit-any

import { createClient, type SupabaseClient } from
  "https://esm.sh/@supabase/supabase-js@2";
import { sendCompliantEmail } from "../_shared/send-email.ts";
import {
  formatFromAddress,
  letterSubject,
  renderClientLetter,
  senderDisplayName,
  standingSentence,
  type ClientLetterSnapshot,
} from "../_shared/client-letter.ts";
import {
  resolveStudioIdentity,
  studioDisplayName,
  studioSignatureCity,
} from "../_shared/studio-identity.ts";
import {
  buildSnapshot,
  generateToken,
  isServiceRoleCaller,
  RESEND_COOLDOWN_MS,
  resendCooldownRemainingMs,
  validateNote,
  validateToken,
} from "./lib.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_PORTAL_URL =
  Deno.env.get("CLIENT_PORTAL_URL") ?? "https://client.patina.cloud";
// R1: the envelope stays a patina.cloud address; only the display name changes.
const LETTER_FROM_EMAIL =
  Deno.env.get("CLIENT_LETTER_FROM_EMAIL") ?? "hello@patina.cloud";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** R11 — the studio owner signs. The writer's words stay the writer's. */
async function resolveSigner(
  admin: SupabaseClient,
  opts: { writerId: string; projectId: string | null },
): Promise<{
  signerId: string;
  signerFullName: string;
  signerEmail: string | null;
  studioName: string | null;
  studioLogoUrl: string | null;
  signatureCity: string | null;
  senderDisplay: string;
}> {
  const identity = await resolveStudioIdentity(admin, {
    projectId: opts.projectId,
    designerId: opts.writerId,
  });

  // The owner of the resolved studio, when there is one. Otherwise the writer
  // signs her own letter — a solo designer IS the studio.
  let signerId = opts.writerId;
  if (identity?.studioId) {
    const { data: owner } = await admin
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", identity.studioId)
      .eq("role", "owner")
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const ownerId = (owner as { user_id?: string } | null)?.user_id;
    if (ownerId) signerId = ownerId;
  }

  const { data: signerProfile } = await admin
    .from("profiles")
    .select("full_name, business_name, email, city")
    .eq("id", signerId)
    .maybeSingle();
  const p = signerProfile as
    | { full_name: string | null; business_name: string | null; email: string | null; city: string | null }
    | null;

  const signerFullName =
    p?.full_name?.trim() || p?.business_name?.trim() || "Your designer";
  // studioCobrand is deliberately NOT used: it withholds the name for a
  // source='full_name' identity because renderBrandedShell would then show a
  // co-brand under a Patina wordmark. This letter has no wordmark — the
  // letterhead IS the studio, or the designer where there is no studio — so it
  // takes the studio name only when a real studio or business name resolved.
  const studioName =
    identity?.source === "studio" || identity?.source === "business_name"
      ? identity.name
      : null;
  const studioLogoUrl = identity?.source === "studio" ? identity.logoUrl : null;
  const signatureCity =
    (await studioSignatureCity(admin, identity, p?.city)) ?? null;

  return {
    signerId,
    signerFullName,
    signerEmail: p?.email ?? null,
    studioName,
    studioLogoUrl,
    signatureCity,
    senderDisplay: studioDisplayName(identity, signerFullName),
  };
}

async function projectNameFor(
  admin: SupabaseClient,
  projectId: string | null,
): Promise<string | null> {
  if (!projectId) return null;
  const { data } = await admin
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .maybeSingle();
  return (data as { name?: string | null } | null)?.name ?? null;
}

/**
 * Render the letter, send it through the one chokepoint, and write what came
 * back onto the invitation. Shared by the send and resend legs so a resent
 * letter is byte-identical to the one it replaces.
 */
async function sendLetter(
  admin: SupabaseClient,
  opts: {
    invitationId: string;
    snapshot: ClientLetterSnapshot;
    token: string;
    replyTo: string | null;
    userId: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const letter = renderClientLetter(opts.snapshot);
  const idempotencyKey = `client-invite:${opts.token}`;

  const result = await sendCompliantEmail(admin, {
    to: opts.snapshot.recipientEmail,
    subject: letter.subject,
    html: letter.html,
    // lens 3: the plain-text part is mandatory on a cold first touch.
    text: letter.text,
    from: formatFromAddress(
      senderDisplayName(opts.snapshot),
      LETTER_FROM_EMAIL,
    ),
    // R1 — replies go to the person, not to Patina.
    replyTo: opts.replyTo ?? undefined,
    userId: opts.userId,
    notificationType: "client_invite_letter",
    category: "transactional",
    templateId: "client-invite-letter",
    idempotencyKey,
    metadata: {
      invitation_id: opts.invitationId,
      kind: opts.snapshot.kind,
      has_note: !!opts.snapshot.personalMessage,
    },
  });

  await admin
    .from("client_invitations")
    .update({
      email_log_id: result.logId ?? null,
      provider_idempotency_key: idempotencyKey,
      last_sent_at: new Date().toISOString(),
    })
    .eq("id", opts.invitationId);

  if (!result.success && !result.suppressed) {
    return { ok: false, error: result.error };
  }
  return { ok: true };
}

interface SendBody {
  designerClientId?: string | null;
  email?: string;
  clientName?: string | null;
  projectId?: string | null;
  note?: string | null;
  kind?: "invite" | "notice";
  writerId?: string;
}

async function handleSend(req: Request): Promise<Response> {
  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const email = body.email?.trim().toLowerCase();
  const writerId = body.writerId?.trim();
  if (!email) return json({ error: "email_required" }, 400);
  if (!writerId) return json({ error: "writer_required" }, 400);

  const note = validateNote(body.note);
  if (!note.ok) return json({ error: note.error }, 400);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const projectId = body.projectId ?? null;
  let kind: "invite" | "notice" = body.kind === "notice" ? "notice" : "invite";

  // ── 1. The account, minted before the send (notification_log.user_id) ────
  let profileId: string | null = null;
  if (kind === "invite") {
    const { data: gen, error: genErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        // 'homeowner' is the ONLY client-supplied role hint handle_new_user
        // honours (00313:47-48); 'client' falls through to the 'designer'
        // default and has to be corrected afterwards. Passing the recognised
        // value costs nothing and stops asking the trigger for the impossible.
        data: {
          role: "homeowner",
          full_name: body.clientName ?? undefined,
          display_name: body.clientName ?? undefined,
        },
        redirectTo: `${CLIENT_PORTAL_URL}/auth/callback?type=invite`,
      },
    });
    if (genErr) {
      // Most commonly "User already registered" — the account exists, so this
      // is R13's case and the letter becomes a notice.
      console.warn("client-invite: generateLink invite failed, switching to notice:", genErr.message);
      const { data: existing } = await admin
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      const existingId = (existing as { id?: string } | null)?.id;
      if (!existingId) {
        return json({ error: "generate_link_failed", detail: genErr.message }, 502);
      }
      kind = "notice";
      profileId = existingId;
    } else {
      profileId = (gen as any)?.user?.id ?? null;
      if (!profileId) return json({ error: "generate_link_returned_no_user" }, 502);
      // The action_link from this call is DISCARDED — see the header. It is
      // sixty minutes old the moment it is minted and it is not what we mail.

      // Identical to the shape today's route writes, so the flag-off and
      // flag-on paths leave the same profiles row behind. The accept leg's
      // existing relabel to 'homeowner' still runs when she signs in.
      await admin.from("profiles").upsert({
        id: profileId,
        email,
        display_name: body.clientName ?? null,
        full_name: body.clientName ?? null,
        role: "client",
      });
      const { data: clientRole } = await admin
        .from("roles")
        .select("id")
        .eq("name", "client")
        .maybeSingle();
      const roleId = (clientRole as { id?: string } | null)?.id;
      if (roleId) {
        await admin.from("user_roles").upsert(
          { user_id: profileId, role_id: roleId, granted_by: writerId },
          { onConflict: "user_id,role_id", ignoreDuplicates: true },
        );
      }
    }
  } else {
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    profileId = (existing as { id?: string } | null)?.id ?? null;
    if (!profileId) return json({ error: "notice_requires_existing_profile" }, 400);
  }

  // ── 2. The snapshot ─────────────────────────────────────────────────────
  const signer = await resolveSigner(admin, { writerId, projectId });
  const projectName = await projectNameFor(admin, projectId);
  const token = generateToken();
  const sentAt = new Date();
  const expiresAt = new Date(sentAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  const ctaUrl = kind === "invite"
    ? `${CLIENT_PORTAL_URL}/auth/invite/${token}`
    : `${CLIENT_PORTAL_URL}/`;

  const snapshot = buildSnapshot({
    kind,
    email,
    clientName: body.clientName ?? null,
    signerFullName: signer.signerFullName,
    studioName: signer.studioName,
    studioLogoUrl: signer.studioLogoUrl,
    signatureCity: signer.signatureCity,
    projectName,
    note: note.value,
    sentAt: sentAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ctaUrl,
  });

  const { data: inserted, error: insErr } = await admin
    .from("client_invitations")
    .insert({
      token,
      email,
      designer_id: writerId,
      designer_client_id: body.designerClientId ?? null,
      project_id: projectId,
      personal_message: note.value,
      kind,
      recipient_name: snapshot.recipientName,
      sender_display_name: senderDisplayName(snapshot),
      designer_given_name: snapshot.designerGivenName,
      designer_full_name: snapshot.designerFullName,
      studio_name: snapshot.studioName,
      studio_logo_url: snapshot.studioLogoUrl,
      signature_city: snapshot.signatureCity,
      project_name: snapshot.projectName,
      rendered_subject: letterSubject(snapshot),
      rendered_standing_sentence: standingSentence(snapshot),
      signer_id: signer.signerId,
      writer_id: writerId,
      sent_at: sentAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      // R13: a notice has nothing to accept.
      accepted_at: kind === "notice" ? sentAt.toISOString() : null,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    console.error("client-invite: snapshot insert failed", insErr);
    return json({ error: "insert_failed", detail: insErr?.message }, 500);
  }
  const invitationId = (inserted as { id: string }).id;

  // ── 3. The letter ───────────────────────────────────────────────────────
  const sent = await sendLetter(admin, {
    invitationId,
    snapshot,
    token,
    replyTo: signer.signerEmail,
    userId: profileId,
  });
  if (!sent.ok) return json({ error: "send_failed", detail: sent.error }, 502);

  // ── 4. R8 — the note becomes the house's first standing note ────────────
  // FROZEN byline: a studio that renames itself must not silently relabel a
  // letter it sent last month. With no project there is no house for it to
  // land in, and nothing is seeded.
  if (projectId && note.value) {
    const byline = [
      snapshot.designerFullName,
      snapshot.studioName,
      // R7': full name and date on the first-visit note.
      new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })
        .format(sentAt),
    ].filter(Boolean).join(" · ");
    const { error: noteErr } = await admin.from("project_notes").insert({
      project_id: projectId,
      author_id: signer.signerId,
      body: note.value,
      author_byline: byline,
      state: "standing",
      sent_at: sentAt.toISOString(),
    });
    // Non-fatal: a letter that went and a note that did not seed is a missing
    // line on a page; a 500 here after the send would tell the designer nothing
    // went out when it did.
    if (noteErr) console.error("client-invite: standing-note seed failed", noteErr);
  }

  return json({ invitationId, token, profileId, kind });
}

async function handleAccept(req: Request): Promise<Response> {
  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  const token = body.token?.trim();
  if (!token) return json({ error: "token_required" }, 400);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: invite, error } = await admin
    .from("client_invitations")
    .select("id, email, expires_at, accepted_at, revoked_at, designer_id")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    console.error("client-invite: accept lookup failed", error);
    return json({ error: "lookup_failed" }, 500);
  }

  const verdict = validateToken(invite as any);
  if (!verdict.ok) return json({ error: verdict.error }, verdict.status);

  const inv = invite as { id: string; email: string };

  // Single-use: claim the row BEFORE minting, guarded on it still being
  // unaccepted, so two clicks in flight cannot both mint a session.
  const { data: claimed, error: updErr } = await admin
    .from("client_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", inv.id)
    .is("accepted_at", null)
    .select("id")
    .maybeSingle();
  if (updErr) {
    console.error("client-invite: accept update failed", updErr);
    return json({ error: "update_failed" }, 500);
  }
  if (!claimed) return json({ error: "already_accepted" }, 409);

  // Minted HERE, on a POST, three hundred milliseconds before it is followed.
  // Sixty minutes is plenty for that.
  const { data: gen, error: genErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: inv.email,
    options: { redirectTo: `${CLIENT_PORTAL_URL}/auth/callback?type=invite` },
  });
  const actionLink = (gen as any)?.properties?.action_link as string | undefined;
  if (genErr || !actionLink) {
    // Give the token back rather than stranding her on a used letter.
    await admin.from("client_invitations").update({ accepted_at: null }).eq("id", inv.id);
    console.error("client-invite: magiclink mint failed", genErr);
    return json({ error: "magiclink_failed" }, 502);
  }

  const userId = (gen as any)?.user?.id as string | undefined;
  if (userId) {
    await admin
      .from("client_invitations")
      .update({ accepted_by: userId })
      .eq("id", inv.id);
    // Ruling B2 v3(d) / 00555: this handler is the one server-side moment that
    // KNOWS the caller is a client — she holds an unexpired token addressed to
    // her own email. Unchanged from the pre-letter accept leg; must never fail
    // the request.
    const { error: roleErr } = await admin
      .from("profiles")
      .update({ role: "homeowner" })
      .eq("id", userId)
      .neq("role", "homeowner");
    if (roleErr) console.error("client-invite: accept role relabel failed", roleErr);
  }

  return json({ actionLink });
}

/** Copy a snapshot onto a new token and send the identical letter again. */
async function resendFrom(
  admin: SupabaseClient,
  oldId: string,
  writerId: string | null,
): Promise<Response> {
  const { data: old } = await admin
    .from("client_invitations")
    .select("*")
    .eq("id", oldId)
    .maybeSingle();
  if (!old) return json({ error: "not_found" }, 404);
  const row = old as any;

  if (row.superseded_by) return json({ error: "already_superseded" }, 409);
  const remaining = resendCooldownRemainingMs(row.last_sent_at ?? row.sent_at);
  if (remaining > 0) {
    return json(
      { error: "too_soon", retryAfterMs: remaining, cooldownMs: RESEND_COOLDOWN_MS },
      429,
    );
  }

  const token = generateToken();
  const sentAt = new Date();
  const expiresAt = new Date(sentAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  const ctaUrl = row.kind === "invite"
    ? `${CLIENT_PORTAL_URL}/auth/invite/${token}`
    : `${CLIENT_PORTAL_URL}/`;

  const { data: fresh, error: insErr } = await admin
    .from("client_invitations")
    .insert({
      token,
      email: row.email,
      designer_id: row.designer_id,
      designer_client_id: row.designer_client_id,
      project_id: row.project_id,
      personal_message: row.personal_message,
      kind: row.kind,
      recipient_name: row.recipient_name,
      sender_display_name: row.sender_display_name,
      designer_given_name: row.designer_given_name,
      designer_full_name: row.designer_full_name,
      studio_name: row.studio_name,
      studio_logo_url: row.studio_logo_url,
      signature_city: row.signature_city,
      project_name: row.project_name,
      rendered_subject: row.rendered_subject,
      rendered_standing_sentence: row.rendered_standing_sentence,
      signer_id: row.signer_id,
      writer_id: writerId ?? row.writer_id,
      resend_count: (row.resend_count ?? 0) + 1,
      sent_at: sentAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      accepted_at: row.kind === "notice" ? sentAt.toISOString() : null,
    })
    .select("id")
    .single();
  if (insErr || !fresh) {
    console.error("client-invite: resend insert failed", insErr);
    return json({ error: "insert_failed" }, 500);
  }
  const newId = (fresh as { id: string }).id;
  await admin
    .from("client_invitations")
    .update({ superseded_by: newId })
    .eq("id", oldId);

  // R10 — the SAME frozen letter, with a new date. Nothing is re-resolved.
  const snapshot: ClientLetterSnapshot = {
    kind: row.kind,
    recipientEmail: row.email,
    recipientName: row.recipient_name,
    designerFullName: row.designer_full_name,
    designerGivenName: row.designer_given_name,
    studioName: row.studio_name,
    studioLogoUrl: row.studio_logo_url,
    signatureCity: row.signature_city,
    projectName: row.project_name,
    personalMessage: row.personal_message,
    sentAt: sentAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ctaUrl,
  };

  const { data: signerProfile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", row.signer_id)
    .maybeSingle();
  const { data: recipient } = await admin
    .from("profiles")
    .select("id")
    .eq("email", row.email)
    .maybeSingle();
  const userId = (recipient as { id?: string } | null)?.id;
  if (!userId) return json({ error: "recipient_profile_missing" }, 500);

  const sent = await sendLetter(admin, {
    invitationId: newId,
    snapshot,
    token,
    replyTo: (signerProfile as { email?: string } | null)?.email ?? null,
    userId,
  });
  if (!sent.ok) return json({ error: "send_failed", detail: sent.error }, 502);

  return json({ invitationId: newId, token });
}

async function handleResend(req: Request): Promise<Response> {
  let body: { invitationId?: string; writerId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  if (!body.invitationId) return json({ error: "invitation_required" }, 400);
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  return resendFrom(admin, body.invitationId, body.writerId ?? null);
}

/**
 * The lapsed page's one tap. ALWAYS answers 200 { ok: true } — a page a
 * stranger can open must not become an oracle for which tokens exist.
 */
async function handleRefresh(req: Request): Promise<Response> {
  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: true });
  }
  const token = body.token?.trim();
  if (!token) return json({ ok: true });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: row } = await admin
    .from("client_invitations")
    .select("id, accepted_at, revoked_at, expires_at, superseded_by, last_sent_at, sent_at")
    .eq("token", token)
    .maybeSingle();
  const r = row as any;
  if (
    r &&
    !r.accepted_at && !r.revoked_at && !r.superseded_by &&
    new Date(r.expires_at).getTime() < Date.now()
  ) {
    const res = await resendFrom(admin, r.id, null);
    if (res.status >= 400) {
      console.warn("client-invite: refresh could not resend", res.status);
    }
  }
  return json({ ok: true });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!isServiceRoleCaller(req.headers.get("Authorization"), SUPABASE_SERVICE_ROLE_KEY)) {
    return json({ error: "unauthorized" }, 401);
  }
  const path = new URL(req.url).pathname;
  if (path.endsWith("/accept")) return handleAccept(req);
  if (path.endsWith("/resend")) return handleResend(req);
  if (path.endsWith("/refresh")) return handleRefresh(req);
  return handleSend(req);
});
```

- [ ] **Step 7: Declare the function in `config.toml`**

Insert immediately after the `[functions.designer-invite]` block (~L391-392):

```toml
# The First Letter. Every leg is called server-to-server by a Next.js route
# holding the service-role key — the designer portal's /api/clients/invite and
# the client portal's /api/auth/invite/{accept,refresh}. The gateway MUST verify
# the caller's JWT; the function then requires the bearer to BE the service-role
# key before it will name an arbitrary writer, signer and recipient. Explicit
# here for intent, though verify_jwt = true is the platform default.
[functions.client-invite]
verify_jwt = true
```

- [ ] **Step 8: Run the tests to verify they still pass, and prove no importer fanned out**

```bash
cd /Users/kody/Code/patina-merged
deno test --allow-all --config supabase/functions/deno.json \
  supabase/functions/client-invite/ supabase/functions/_shared/client-letter.test.ts
# `client-letter.ts` must have exactly ONE importer — client-invite. If this
# prints anything else, the _shared redeploy fan-out is back.
grep -rl "_shared/client-letter" supabase/functions --include=index.ts
```

Expected: all tests `ok`; the grep prints only `supabase/functions/client-invite/index.ts`.

- [ ] **Step 9: Commit**

```bash
cd /Users/kody/Code/patina-merged
test -f deno.lock && rm deno.lock || true
git add supabase/functions/client-invite/index.ts \
        supabase/functions/client-invite/lib.ts \
        supabase/functions/client-invite/index.test.ts \
        supabase/config.toml
git commit -m "feat(edge): client-invite sends the studio's letter over our own 7-day token"
```

---

## Task 4 — The route's letter branch and the resend route (Lane L1)

**Files:**
- Modify: `apps/designer-portal/src/app/api/clients/invite/route.ts` (add a branch; **do not touch** the existing code paths at L115-243)
- Create: `apps/designer-portal/src/app/api/clients/invite/resend/route.ts`
- Test: `apps/designer-portal/src/app/api/clients/invite/__tests__/letter-branch.test.ts`

**Interfaces:**
- Consumes: the four legs from Task 3.
- Produces — the request contract L2 builds against:

```ts
// POST /api/clients/invite  (new fields; all optional, absent = today's path)
interface InviteRequestBody {
  clientEmail?: string;
  clientName?: string;
  source?: 'direct' | 'referral';
  notes?: string;
  invite?: boolean;
  designerClientId?: string;
  /** NEW — take the letter path. Absent ⇒ today's exact code, unchanged. */
  letter?: boolean;
  /** NEW — the designer's line. ≤280 after trimming. */
  note?: string;
  /** NEW — the house the letter is about; also where the note is seeded. */
  projectId?: string;
}
// 200 → { designerClientId, profileId, invited, alreadyExists, kind?: 'invite' | 'notice' }

// POST /api/clients/invite/resend
interface ResendBody { invitationId: string }
// 200 → { invitationId, token }   429 → { error: 'too_soon', retryAfterMs }
```

- [ ] **Step 1: Write the failing tests**

Create `apps/designer-portal/src/app/api/clients/invite/__tests__/letter-branch.test.ts`:

```ts
/**
 * The letter branch is body-driven, not flag-driven: there is no server-side
 * flag helper in this portal. These tests pin the two things that matter — the
 * off state is today's path untouched, and the on state never trusts the body
 * for anything the studio's identity depends on.
 */
import { validateLetterRequest } from '../letter-branch';

describe('validateLetterRequest', () => {
  it('is not taken when `letter` is absent — today\'s path, byte for byte', () => {
    expect(validateLetterRequest({ clientEmail: 'a@b.c' })).toEqual({ take: false });
    expect(validateLetterRequest({ clientEmail: 'a@b.c', letter: false })).toEqual({
      take: false,
    });
  });

  it('R4 — trims the note and refuses more than 280 characters', () => {
    expect(
      validateLetterRequest({ clientEmail: 'a@b.c', letter: true, note: '  hi  ' }),
    ).toEqual({ take: true, note: 'hi', projectId: null });

    expect(
      validateLetterRequest({ clientEmail: 'a@b.c', letter: true, note: 'x'.repeat(281) }),
    ).toEqual({ take: false, error: 'That line is longer than 280 characters.' });

    expect(
      validateLetterRequest({ clientEmail: 'a@b.c', letter: true, note: 'x'.repeat(280) }),
    ).toEqual({ take: true, note: 'x'.repeat(280), projectId: null });
  });

  it('treats an empty or whitespace-only note as no note at all', () => {
    expect(
      validateLetterRequest({ clientEmail: 'a@b.c', letter: true, note: '   ' }),
    ).toEqual({ take: true, note: null, projectId: null });
  });

  it('carries the project through', () => {
    expect(
      validateLetterRequest({
        clientEmail: 'a@b.c',
        letter: true,
        projectId: '00000000-0000-0000-0000-000000000001',
      }),
    ).toEqual({
      take: true,
      note: null,
      projectId: '00000000-0000-0000-0000-000000000001',
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/kody/Code/patina-merged
pnpm --filter @patina/designer-portal test -- src/app/api/clients/invite/__tests__/letter-branch.test.ts
```

Expected: FAIL — `Cannot find module '../letter-branch'`.

- [ ] **Step 3: Write the validator**

Create `apps/designer-portal/src/app/api/clients/invite/letter-branch.ts`:

```ts
/**
 * The one decision the route makes before it forks. Split out so it can be
 * tested without a Supabase client.
 *
 * BODY-DRIVEN, NOT FLAG-DRIVEN. `use-feature-flag.ts` is 'use client' and is
 * the only flag file in this portal, so a route handler cannot ask PostHog.
 * When the flag resolves true the client sends `letter: true`; the route takes
 * the new path only then, and otherwise runs today's exact code. The honest
 * limit: a designer could hand-craft `letter: true` and bypass the flag — that
 * is a studio writing its own letter to its own client under its own studio's
 * identity, which is acceptable, but it means the flag controls ROLLOUT, not
 * authorization. So the note is validated here and the studio identity is
 * resolved server-side; nothing in the body is trusted for either.
 */
export type LetterVerdict =
  | { take: false }
  | { take: false; error: string }
  | { take: true; note: string | null; projectId: string | null };

export function validateLetterRequest(body: {
  letter?: boolean;
  note?: string;
  projectId?: string;
}): LetterVerdict {
  if (!body.letter) return { take: false };

  const trimmed = (body.note ?? '').trim();
  if (trimmed.length > 280) {
    return { take: false, error: 'That line is longer than 280 characters.' };
  }

  return {
    take: true,
    note: trimmed || null,
    projectId: body.projectId ?? null,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
cd /Users/kody/Code/patina-merged
pnpm --filter @patina/designer-portal test -- src/app/api/clients/invite/__tests__/letter-branch.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Add the branch to the route**

In `apps/designer-portal/src/app/api/clients/invite/route.ts`:

(a) extend the interface and the imports at the top:

```ts
import { validateLetterRequest } from './letter-branch';

const FUNCTIONS_BASE =
  process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL ??
  `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/functions/v1`;
```

and, inside `InviteRequestBody`:

```ts
  /**
   * The First Letter (flag `client-invite-letter`). When absent the route runs
   * today's exact code — do NOT refactor that branch, so the off state stays
   * provably byte-identical to today.
   */
  letter?: boolean;
  /** The designer's own line, ≤280 after trimming. */
  note?: string;
  /** The house the letter is about; also where the note is seeded (R8). */
  projectId?: string;
```

(b) immediately after the `if (!clientEmail) return badRequest('clientEmail is required');` guard at L111-113, insert the fork:

```ts
  // ── The First Letter (R5/R12/R13) ────────────────────────────────────────
  const letterVerdict = validateLetterRequest(body);
  if ('error' in letterVerdict && letterVerdict.error) {
    return badRequest(letterVerdict.error);
  }
  if (letterVerdict.take) {
    return sendTheLetter({
      adminClient,
      callerUser,
      clientEmail,
      clientName,
      source,
      notes,
      existingRow,
      note: letterVerdict.note,
      projectId: letterVerdict.projectId,
    });
  }
```

(c) append the handler at the bottom of the file:

```ts
/**
 * The letter path. Everything today's Branch B does for the auth account, the
 * profile and the role grant now happens INSIDE the client-invite edge
 * function — that function is the one place that knows whether GoTrue minted a
 * new user, and notification_log.user_id is NOT NULL, so the account must exist
 * before the send. This route keeps what it has always owned: the
 * designer_clients row and the activity log.
 */
async function sendTheLetter(args: {
  adminClient: any;
  callerUser: { id: string; email?: string | null };
  clientEmail: string;
  clientName?: string;
  source: 'direct' | 'referral';
  notes?: string;
  existingRow: { id: string } | null;
  note: string | null;
  projectId: string | null;
}) {
  const {
    adminClient, callerUser, clientEmail, clientName, source, notes,
    existingRow, note, projectId,
  } = args;

  const { data: existingProfile } = await adminClient
    .from('profiles')
    .select('id')
    .eq('email', clientEmail)
    .maybeSingle();

  // R13: an account that already exists gets the short notice letter, never a
  // silent link. Today this branch tells the designer an invite went and sends
  // the homeowner nothing.
  const kind: 'invite' | 'notice' = existingProfile ? 'notice' : 'invite';

  // Write (or link) the roster row FIRST, so the letter can carry the
  // designer_client_id the People Room row reads its status through.
  let designerClientId: string;
  if (existingRow) {
    designerClientId = existingRow.id;
  } else {
    const { data: inserted, error: dcError } = await adminClient
      .from('designer_clients')
      .insert({
        designer_id: callerUser.id,
        client_email: clientEmail,
        client_name: clientName ?? null,
        source,
        notes: notes ?? null,
        status: 'active',
      })
      .select('id')
      .single();
    if (dcError) {
      return serverError(`Failed to create client relationship: ${dcError.message}`);
    }
    designerClientId = inserted.id;
  }

  const upstream = `${FUNCTIONS_BASE.replace(/\/$/, '')}/client-invite`;
  const res = await fetch(upstream, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      designerClientId,
      email: clientEmail,
      clientName: clientName ?? null,
      projectId,
      note,
      kind,
      writerId: callerUser.id,
    }),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    profileId?: string | null;
    kind?: 'invite' | 'notice';
    error?: string;
  };
  if (!res.ok) {
    return badRequest(payload.error ?? 'Could not send the letter just now.');
  }

  const profileId = payload.profileId ?? null;
  if (profileId) {
    await adminClient
      .from('designer_clients')
      .update({ client_id: profileId })
      .eq('id', designerClientId);
  }

  const { data: callerProfile } = await adminClient
    .from('profiles')
    .select('display_name, full_name')
    .eq('id', callerUser.id)
    .maybeSingle();
  const writerName =
    callerProfile?.full_name ?? callerProfile?.display_name ?? callerUser.email ?? 'Someone';
  const label = clientName?.trim() || clientEmail;

  // lens-4 §B.9: the actor is the designer, not the system. The transport
  // belongs in telemetry, not in a line a studio owner reads.
  await adminClient.from('client_activity_log').insert({
    designer_client_id: designerClientId,
    activity_type: 'note',
    title: `${writerName} wrote to ${label}`,
    description: `Letter sent to ${clientEmail} · ${note ? 'with a note' : 'no note'}`,
    actor_name: writerName,
    metadata: {
      actor_id: callerUser.id,
      client_email: clientEmail,
      letter: true,
      kind: payload.kind ?? kind,
      has_note: !!note,
    },
  });

  return NextResponse.json({
    designerClientId,
    profileId,
    invited: true,
    alreadyExists: kind === 'notice',
    kind: payload.kind ?? kind,
  });
}
```

- [ ] **Step 6: Write the resend route**

Create `apps/designer-portal/src/app/api/clients/invite/resend/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedDesignerAdmin, badRequest, serverError } from '@/lib/supabase-admin';

const FUNCTIONS_BASE =
  process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL ??
  `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/functions/v1`;

/**
 * POST /api/clients/invite/resend — R10. New token, the SAME frozen letter, one
 * in flight, one per hour. The cooldown is enforced by the edge function; the
 * one-at-a-time guard is the UI's (mirroring the studio-member resend at
 * account-studio-page.tsx:490-520).
 *
 * Ownership is checked HERE: the edge function trusts the service role, so this
 * route must prove the caller owns the invitation before it forwards.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedDesignerAdmin(request);
  if ('error' in auth) return auth.error;
  const { user: callerUser, adminClient } = auth;

  let body: { invitationId?: string };
  try {
    body = (await request.json()) ?? {};
  } catch {
    return badRequest('Invalid JSON body');
  }
  const invitationId = body.invitationId?.trim();
  if (!invitationId) return badRequest('invitationId is required');

  const { data: owned, error: lookupError } = await (adminClient as any)
    .from('client_invitations')
    .select('id')
    .eq('id', invitationId)
    .eq('designer_id', callerUser.id)
    .maybeSingle();
  if (lookupError) return serverError(`Failed to load the letter: ${lookupError.message}`);
  if (!owned) return badRequest('Letter not found');

  const res = await fetch(`${FUNCTIONS_BASE.replace(/\/$/, '')}/client-invite/resend`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ invitationId, writerId: callerUser.id }),
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 7: Gate**

```bash
cd /Users/kody/Code/patina-merged
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal test -- src/app/api/clients/invite
pnpm --filter @patina/designer-portal lint
```

Expected: type-check clean; the invite tests pass; lint clean.

- [ ] **Step 8: Prove the off state is unchanged**

```bash
cd /Users/kody/Code/patina-merged
git diff apps/designer-portal/src/app/api/clients/invite/route.ts | grep '^-' | grep -v '^---'
```

Expected: **no removed lines other than the interface/JSDoc block you extended.** Any deletion inside L115-243 means today's path was edited — revert it.

- [ ] **Step 9: Commit**

```bash
cd /Users/kody/Code/patina-merged
git add apps/designer-portal/src/app/api/clients/invite/route.ts \
        apps/designer-portal/src/app/api/clients/invite/letter-branch.ts \
        apps/designer-portal/src/app/api/clients/invite/resend/route.ts \
        apps/designer-portal/src/app/api/clients/invite/__tests__/letter-branch.test.ts
git commit -m "feat(clients): route the letter path, leaving today's invite path untouched"
```

---

## Task 5 — The composer field and the hook contract (Lane L2)

**Files:**
- Create: `apps/designer-portal/src/components/document/people/directory/letter-line-field.tsx`
- Create: `apps/designer-portal/src/components/document/people/directory/__tests__/letter-line-field.test.tsx`
- Modify: `packages/supabase/src/hooks/use-clients.ts` (`useAddClient` L531/body L553; `useInviteAndLinkClient` L593/body L613)
- Modify: `apps/designer-portal/src/lib/analytics/events.ts` (`clientEvents` at L39-42)

**Interfaces:**
- Consumes: the request contract from Task 4.
- Produces:

```ts
// letter-line-field.tsx
export interface LetterLineFacts {
  clientName: string | null;
  clientEmail: string;
  projectName: string | null;
}
export function factsLine(facts: LetterLineFacts): string;
export function counterCopy(length: number): string;
export function fieldLabel(givenName: string | null): string;
export function checkboxLabel(givenName: string | null): string;
export function checkboxHelper(opts: {
  givenName: string | null;
  studioName: string | null;
  pronoun: 'he' | 'she' | null;   // always null today — the sheet knows no gender
}): string;
export function sendButtonLabel(sendLetter: boolean): string;
export function successLine(opts: {
  label: string;
  email: string;
  sent: boolean;
  alreadyExisted: boolean;
}): string;

export function LetterLineField(props: {
  facts: LetterLineFacts;
  value: string;
  onChange: (next: string) => void;
  /** Folded starts as the single-line "+ A line for {given}" disclosure. */
  folded?: boolean;
  disabled?: boolean;
}): JSX.Element;

// use-clients.ts — both mutations gain the same three optional fields
useAddClient().mutateAsync({ clientEmail, clientName?, source?, notes?, invite?,
                             letter?: boolean, note?: string, projectId?: string })
useInviteAndLinkClient().mutateAsync({ designerClientId, clientEmail?, clientName?,
                             letter?: boolean, note?: string, projectId?: string })
```

- [ ] **Step 1: Write the failing tests**

Create `apps/designer-portal/src/components/document/people/directory/__tests__/letter-line-field.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import {
  LetterLineField,
  checkboxHelper,
  checkboxLabel,
  counterCopy,
  factsLine,
  fieldLabel,
  sendButtonLabel,
  successLine,
} from '../letter-line-field';

describe('lens-4 §B.2 — the facts line states what the letter will be missing', () => {
  it('assembles every fact it has', () => {
    expect(
      factsLine({
        clientName: 'Dave Okonkwo',
        clientEmail: 'dave@okonkwo.net',
        projectName: 'Van Hise kitchen and back hall',
      }),
    ).toBe(
      'DAVE OKONKWO · dave@okonkwo.net · VAN HISE KITCHEN AND BACK HALL · ADDED TODAY',
    );
  });

  it('states a missing project rather than hiding it', () => {
    expect(
      factsLine({
        clientName: 'Priya Raman',
        clientEmail: 'priya@ramanhouse.com',
        projectName: null,
      }),
    ).toBe('PRIYA RAMAN · priya@ramanhouse.com · NO PROJECT YET · ADDED TODAY');
  });

  it('states a missing name rather than inventing one', () => {
    expect(
      factsLine({
        clientName: null,
        clientEmail: 'dave@okonkwo.net',
        projectName: 'Van Hise kitchen and back hall',
      }),
    ).toBe(
      'dave@okonkwo.net · NO NAME · VAN HISE KITCHEN AND BACK HALL · ADDED TODAY',
    );
  });
});

describe('lens-4 §B.4 — a plain count, no bar, no colour, no violation', () => {
  it('counts down and stops', () => {
    expect(counterCopy(0)).toBe('Up to 280 characters');
    expect(counterCopy(184)).toBe('96 left');
    expect(counterCopy(280)).toBe("That's the whole 280.");
  });
});

describe('lens-4 §B.1 / §B.5 / §B.6 — the words the designer reads', () => {
  it('names the recipient in the label, and falls back without one', () => {
    expect(fieldLabel('Dave')).toBe('A line for Dave');
    expect(fieldLabel(null)).toBe('A line to send with it');
  });

  it('replaces "Send a magic-link invite to Patina"', () => {
    expect(checkboxLabel('Dave')).toBe('Send Dave the letter');
    expect(checkboxLabel(null)).toBe('Send them the letter');
    for (const label of [checkboxLabel('Dave'), checkboxLabel(null)]) {
      expect(label).not.toMatch(/magic-link|invite|Patina/i);
    }
  });

  it('names the studio as sender and the off-state as a real choice', () => {
    expect(
      checkboxHelper({ givenName: 'Dave', studioName: 'Middle West Studio', pronoun: null }),
    ).toBe(
      'They get one email from Middle West Studio with your line in it and a link that signs them in. Leave it off and they’re on your roster only — you can write later.',
    );
    expect(checkboxHelper({ givenName: null, studioName: null, pronoun: null })).toBe(
      'They get one email from you with your line in it and a link that signs them in. Leave it off and they’re on your roster only — you can write later.',
    );
  });

  it('never sends under a label that did not say so (J2)', () => {
    expect(sendButtonLabel(true)).toBe('ADD AND SEND THE LETTER');
    expect(sendButtonLabel(false)).toBe('ADD TO YOUR PEOPLE');
  });
});

describe('lens-4 §B.7 — the success line names the address it went to', () => {
  it('says where the letter went', () => {
    expect(
      successLine({ label: 'Dave', email: 'dave@okonkwo.net', sent: true, alreadyExisted: false }),
    ).toBe('Dave is on your roster. Your letter is on its way to dave@okonkwo.net.');
  });

  it('says plainly when nothing was sent', () => {
    expect(
      successLine({ label: 'Dave', email: 'dave@okonkwo.net', sent: false, alreadyExisted: false }),
    ).toBe('Dave is on your roster. Nothing was sent.');
  });

  it('stops the already-on-Patina branch lying by omission (R13)', () => {
    expect(
      successLine({ label: 'Dave', email: 'dave@okonkwo.net', sent: true, alreadyExisted: true }),
    ).toBe("Dave was already on Patina. He's linked to you now; a short letter tells him so.");
  });
});

describe('LetterLineField', () => {
  const facts = {
    clientName: 'Dave Okonkwo',
    clientEmail: 'dave@okonkwo.net',
    projectName: 'Van Hise kitchen and back hall',
  };

  it('opens empty, with an instruction that cannot be mistaken for a draft', () => {
    render(<LetterLineField facts={facts} value="" onChange={() => {}} />);
    const field = screen.getByLabelText('A line for Dave') as HTMLTextAreaElement;
    expect(field.value).toBe('');
    expect(field.placeholder).toBe(
      "Say why you added them and what they'll find. Two lines is plenty.",
    );
  });

  it('stops at 280 and says so without turning red', () => {
    const onChange = jest.fn();
    render(<LetterLineField facts={facts} value={'x'.repeat(280)} onChange={onChange} />);
    expect(screen.getByTestId('letter-line-counter')).toHaveTextContent(
      "That's the whole 280.",
    );
    const field = screen.getByLabelText('A line for Dave') as HTMLTextAreaElement;
    expect(field.maxLength).toBe(280);
  });

  it('shows the glance check in the letter’s callout style as she types', () => {
    render(<LetterLineField facts={facts} value="Dave — the drawings are in." onChange={() => {}} />);
    expect(screen.getByTestId('letter-line-glance')).toHaveTextContent(
      'Dave — the drawings are in.',
    );
    expect(screen.getByTestId('letter-line-glance-facts')).toHaveTextContent(
      'DAVE OKONKWO · dave@okonkwo.net',
    );
  });

  it('prints nothing where there is nothing to glance at', () => {
    render(<LetterLineField facts={facts} value="   " onChange={() => {}} />);
    expect(screen.queryByTestId('letter-line-glance')).toBeNull();
  });

  it('folds to a single disclosure line, and opening it reveals the field', () => {
    render(<LetterLineField facts={facts} value="" onChange={() => {}} folded />);
    expect(screen.queryByLabelText('A line for Dave')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '+ A line for Dave' }));
    expect(screen.getByLabelText('A line for Dave')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/kody/Code/patina-merged
pnpm --filter @patina/designer-portal test -- src/components/document/people/directory/__tests__/letter-line-field.test.tsx
```

Expected: FAIL — `Cannot find module '../letter-line-field'`.

- [ ] **Step 3: Write the component**

Create `apps/designer-portal/src/components/document/people/directory/letter-line-field.tsx`:

```tsx
'use client';

/**
 * ONE field component, three renderings (lens 2): the add-person sheet gets the
 * full field, the ClientPicker's armed row and the folded checkbox state get
 * the same field behind a "+ A line for {given}" disclosure, and the send sheet
 * gets neither — the proposal's existing personal message IS the note, and
 * nobody writes the same sentence twice in one send.
 *
 * Arrival Arc shape: the facts assembled above in mono, her words below, blank.
 * NOTHING IS PRE-WRITTEN. The placeholder is an instruction, not a draft — a
 * placeholder that sounds sendable teaches the wrong thing, and the Arrival Arc
 * rejected the prefilled specimen by name.
 */

import { useState } from 'react';

const FIELD_LABEL =
  'mb-1 block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';
const FIELD_INPUT =
  'w-full rounded-[7px] border border-[var(--color-pearl)] bg-white px-3.5 py-2.5 text-[0.82rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none';

export const LETTER_NOTE_MAX = 280;

export const LETTER_PLACEHOLDER =
  "Say why you added them and what they'll find. Two lines is plenty.";

export interface LetterLineFacts {
  clientName: string | null;
  clientEmail: string;
  projectName: string | null;
}

/** The name a designer calls her client. First whitespace token, nothing more. */
export function givenNameOf(fullName: string | null | undefined): string | null {
  const first = (fullName ?? '').trim().split(/\s+/)[0];
  return first || null;
}

/**
 * lens-4 §B.2. Middot-separated, no verbs, no persuasion. A missing project or
 * name is STATED, not hidden — a designer about to write a letter should see
 * what the letter will be missing.
 */
export function factsLine(facts: LetterLineFacts): string {
  const parts: string[] = [];
  if (facts.clientName?.trim()) {
    parts.push(facts.clientName.trim().toUpperCase());
    parts.push(facts.clientEmail);
  } else {
    parts.push(facts.clientEmail);
    parts.push('NO NAME');
  }
  parts.push(facts.projectName?.trim() ? facts.projectName.trim().toUpperCase() : 'NO PROJECT YET');
  parts.push('ADDED TODAY');
  return parts.join(' · ');
}

/** lens-4 §B.4. A length, not a violation: no bar, no colour, no red at zero. */
export function counterCopy(length: number): string {
  if (length === 0) return `Up to ${LETTER_NOTE_MAX} characters`;
  if (length >= LETTER_NOTE_MAX) return `That's the whole ${LETTER_NOTE_MAX}.`;
  return `${LETTER_NOTE_MAX - length} left`;
}

/** lens-4 §B.1. Naming the recipient makes her write to a person, not a field. */
export function fieldLabel(givenName: string | null): string {
  return givenName ? `A line for ${givenName}` : 'A line to send with it';
}

/** lens-4 §B.5, replacing "Send a magic-link invite to Patina". */
export function checkboxLabel(givenName: string | null): string {
  return givenName ? `Send ${givenName} the letter` : 'Send them the letter';
}

/**
 * lens-4 §B.5. Deliberately gender-free: the sheet holds a name and an email
 * and has no idea of anyone's gender, and the one place this copy could insult
 * somebody is by guessing. `pronoun` exists for a caller that genuinely knows;
 * nothing passes it today.
 */
export function checkboxHelper(opts: {
  givenName: string | null;
  studioName: string | null;
  pronoun: 'he' | 'she' | null;
}): string {
  const subject = opts.pronoun === 'he' ? 'He' : opts.pronoun === 'she' ? 'She' : 'They';
  const verb = opts.pronoun ? 'gets' : 'get';
  const object = opts.pronoun === 'he' ? 'him' : opts.pronoun === 'she' ? 'her' : 'them';
  const possessive = opts.pronoun === 'he' ? 'he’s' : opts.pronoun === 'she' ? 'she’s' : 'they’re';
  const from = opts.studioName?.trim() || 'you';
  return `${subject} ${verb} one email from ${from} with your line in it and a link that signs ${object} in. Leave it off and ${possessive} on your roster only — you can write later.`;
}

/** lens-4 §B.6. J2 kept in the copy layer. */
export function sendButtonLabel(sendLetter: boolean): string {
  return sendLetter ? 'ADD AND SEND THE LETTER' : 'ADD TO YOUR PEOPLE';
}

/** lens-4 §B.7. No confetti, no "Success!", no green fill. */
export function successLine(opts: {
  label: string;
  email: string;
  sent: boolean;
  alreadyExisted: boolean;
}): string {
  if (opts.alreadyExisted) {
    return `${opts.label} was already on Patina. He's linked to you now; a short letter tells him so.`;
  }
  return opts.sent
    ? `${opts.label} is on your roster. Your letter is on its way to ${opts.email}.`
    : `${opts.label} is on your roster. Nothing was sent.`;
}

export function LetterLineField({
  facts,
  value,
  onChange,
  folded = false,
  disabled = false,
}: {
  facts: LetterLineFacts;
  value: string;
  onChange: (next: string) => void;
  folded?: boolean;
  disabled?: boolean;
}) {
  const given = givenNameOf(facts.clientName);
  const label = fieldLabel(given);
  const [open, setOpen] = useState(!folded);

  if (folded && !open) {
    return (
      <button
        type="button"
        data-testid="letter-line-disclosure"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex min-h-11 items-center text-[0.74rem] text-[var(--color-mocha)] underline underline-offset-4"
      >
        {`+ ${label}`}
      </button>
    );
  }

  const trimmed = value.trim();

  return (
    <div className="mt-4">
      <p
        data-testid="letter-line-facts"
        className="mb-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]"
      >
        {factsLine(facts)}
      </p>

      <label className={FIELD_LABEL} htmlFor="letter-line">
        {label}
      </label>
      <textarea
        id="letter-line"
        aria-label={label}
        value={value}
        maxLength={LETTER_NOTE_MAX}
        disabled={disabled}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        placeholder={LETTER_PLACEHOLDER}
        className={`${FIELD_INPUT} resize-none`}
      />
      <p
        data-testid="letter-line-counter"
        className="mt-1.5 font-mono text-[11px] text-[var(--color-aged-oak)]"
      >
        {counterCopy(value.length)}
      </p>

      {/* A glance check, not a rendered-email preview: the facts line above, her
          words below, in the letter's own callout rule. */}
      {trimmed ? (
        <div className="mt-3 border-l-[3px] border-[var(--color-clay)] bg-[var(--color-linen)]/45 py-2.5 pl-3.5 pr-3">
          <p
            data-testid="letter-line-glance-facts"
            className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]"
          >
            {`${facts.clientName?.trim()?.toUpperCase() ?? facts.clientEmail} · ${facts.clientEmail}`}
          </p>
          <p
            data-testid="letter-line-glance"
            className="mt-1.5 whitespace-pre-line font-heading text-[0.86rem] italic leading-relaxed text-[var(--color-mocha)]"
          >
            {trimmed}
          </p>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
cd /Users/kody/Code/patina-merged
pnpm --filter @patina/designer-portal test -- src/components/document/people/directory/__tests__/letter-line-field.test.tsx
```

Expected: PASS, 15 tests.

- [ ] **Step 5: Widen the two hooks**

In `packages/supabase/src/hooks/use-clients.ts`, `useAddClient` (L531, body assembled L553):

```ts
    mutationFn: async ({
      clientEmail,
      clientName,
      source = 'direct',
      notes,
      invite = true,
      letter,
      note,
      projectId,
    }: {
      clientEmail: string;
      clientName?: string;
      source?: 'direct' | 'referral';
      notes?: string;
      /** When true (default), send a Supabase Auth magic-link invite if no profile exists. */
      invite?: boolean;
      /**
       * The First Letter (flag `client-invite-letter`). When true the route
       * takes the letter path; when absent it runs today's exact code, so the
       * off state is byte-identical to today. The flag is read in the
       * component, never here — this hook only carries what it is handed.
       */
      letter?: boolean;
      /** The designer's own line. ≤280 after trimming; the route re-checks. */
      note?: string;
      /** The house the letter is about, and where the note is seeded (R8). */
      projectId?: string;
    }) => {
      const response = await fetch('/api/clients/invite', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientEmail,
          clientName,
          source,
          notes,
          invite,
          // Omitted entirely when off, so the request body is byte-identical
          // to today's — the assertion the e2e spec rests on.
          ...(letter ? { letter: true, note, projectId } : {}),
        }),
      });
```

and extend its return type with `kind?: 'invite' | 'notice';`.

Apply the same three optional fields and the same conditional spread to `useInviteAndLinkClient` (L593, body L613).

- [ ] **Step 6: Add the analytics property**

In `apps/designer-portal/src/lib/analytics/events.ts`, replace the `clientEvents.create` line (L40) with:

```ts
  /**
   * `has_note` mirrors `has_personal_message` on proposal_sent (L114): whether
   * a line was written, never the line itself.
   */
  create: (properties?: Record<string, unknown> & { has_note?: boolean }) =>
    track('client_create', properties),
```

- [ ] **Step 7: Gate**

```bash
cd /Users/kody/Code/patina-merged
pnpm --filter @patina/supabase type-check
pnpm --filter @patina/supabase test
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal test -- src/components/document/people/directory
# packages/supabase changed — the repo's strictest gate is mandatory.
pnpm --filter @patina/admin-portal build
```

Expected: all clean. `@patina/supabase` resolves to `./src/index.ts`, so no dist rebuild is required for a portal to see the change — but the admin build is what proves the widened types compile.

- [ ] **Step 8: Commit**

```bash
cd /Users/kody/Code/patina-merged
git add apps/designer-portal/src/components/document/people/directory/letter-line-field.tsx \
        apps/designer-portal/src/components/document/people/directory/__tests__/letter-line-field.test.tsx \
        packages/supabase/src/hooks/use-clients.ts \
        apps/designer-portal/src/lib/analytics/events.ts
git commit -m "feat(people): the letter line — one field, the facts above it, nothing pre-written"
```

---

## Task 6 — The add-person sheet: R12's rename and the full field (Lane L2)

**Files:**
- Modify: `apps/designer-portal/src/components/document/people/directory/add-person-sheet.tsx`
  (client state L163-166 · `submitClient` L212-245 · checkbox L401-409 · action group L631-652)
- Test: `apps/designer-portal/src/components/document/people/directory/__tests__/add-person-sheet-letter.test.tsx`

**Interfaces:**
- Consumes: `LetterLineField`, `checkboxLabel`, `checkboxHelper`, `sendButtonLabel`, `successLine`, `givenNameOf` (Task 5); `useAddClient` with `letter`/`note`/`projectId` (Task 5); `useFeatureFlag` from `@/hooks/use-feature-flag`; `useStudioIdentity` from `@patina/supabase`.
- Produces: nothing later tasks consume.

- [ ] **Step 1: Write the failing test**

Create `apps/designer-portal/src/components/document/people/directory/__tests__/add-person-sheet-letter.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddPersonSheet } from '../add-person-sheet';

const mutateAsync = jest.fn();
let flagValue = { value: false, isLoading: false };

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => flagValue,
}));

jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  useAddClient: () => ({ mutateAsync, isPending: false }),
  useStudioIdentity: () => ({ data: { name: 'Middle West Studio' }, isLoading: false }),
}));

function open() {
  render(<AddPersonSheet open initialKind="client" onClose={() => {}} onAdded={jest.fn()} />);
}

beforeEach(() => {
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue({
    designerClientId: 'dc1',
    profileId: 'p1',
    invited: true,
    alreadyExists: false,
    kind: 'invite',
  });
});

describe('flag OFF — today’s sheet, unchanged', () => {
  beforeEach(() => {
    flagValue = { value: false, isLoading: false };
  });

  it('shows neither the field nor the renamed checkbox', () => {
    open();
    expect(screen.queryByTestId('letter-line-facts')).toBeNull();
    expect(screen.queryByTestId('letter-line-disclosure')).toBeNull();
    expect(screen.getByLabelText(/Send a magic-link invite to Patina/i)).toBeInTheDocument();
  });

  it('sends today’s body shape, with no letter key', async () => {
    open();
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'dave@okonkwo.net' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to roster' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty('letter');
    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty('note');
  });
});

describe('flag LOADING — fail closed, never a flash', () => {
  it('renders neither state while PostHog is still answering', () => {
    flagValue = { value: false, isLoading: true };
    open();
    expect(screen.queryByTestId('letter-line-facts')).toBeNull();
    expect(screen.queryByLabelText(/Send Dave the letter/i)).toBeNull();
    expect(screen.queryByLabelText(/magic-link/i)).toBeNull();
  });
});

describe('flag ON — R12’s rename and the letter', () => {
  beforeEach(() => {
    flagValue = { value: true, isLoading: false };
  });

  it('retires every retired word from the designer’s own screen', () => {
    open();
    expect(screen.queryByText(/magic-link/i)).toBeNull();
    expect(screen.queryByText(/invite to Patina/i)).toBeNull();
    expect(screen.getByLabelText('Send them the letter')).toBeInTheDocument();
  });

  it('names the recipient once a name is typed', () => {
    open();
    fireEvent.change(screen.getByLabelText('Full name (optional)'), {
      target: { value: 'Dave Okonkwo' },
    });
    expect(screen.getByLabelText('Send Dave the letter')).toBeInTheDocument();
    expect(screen.getByLabelText('A line for Dave')).toBeInTheDocument();
  });

  it('names the studio as the sender in the helper', () => {
    open();
    expect(
      screen.getByText(/They get one email from Middle West Studio with your line in it/),
    ).toBeInTheDocument();
  });

  it('states both acts on the button, and only the one it will do', () => {
    open();
    expect(screen.getByRole('button', { name: 'ADD AND SEND THE LETTER' })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Send them the letter'));
    expect(screen.getByRole('button', { name: 'ADD TO YOUR PEOPLE' })).toBeInTheDocument();
  });

  it('folds the field to a disclosure when the letter is off', () => {
    open();
    fireEvent.click(screen.getByLabelText('Send them the letter'));
    expect(screen.queryByLabelText('A line to send with it')).toBeNull();
    expect(screen.getByTestId('letter-line-disclosure')).toBeInTheDocument();
  });

  it('turns the letter back on when the folded field is opened', () => {
    open();
    fireEvent.click(screen.getByLabelText('Send them the letter'));
    fireEvent.click(screen.getByTestId('letter-line-disclosure'));
    expect((screen.getByLabelText('Send them the letter') as HTMLInputElement).checked).toBe(true);
  });

  it('carries the line into the mutation body', async () => {
    open();
    fireEvent.change(screen.getByLabelText('Full name (optional)'), {
      target: { value: 'Dave Okonkwo' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'dave@okonkwo.net' },
    });
    fireEvent.change(screen.getByLabelText('A line for Dave'), {
      target: { value: 'Dave — the drawings are in.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ADD AND SEND THE LETTER' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      clientEmail: 'dave@okonkwo.net',
      clientName: 'Dave Okonkwo',
      letter: true,
      note: 'Dave — the drawings are in.',
    });
  });

  it('sends no letter key at all when the checkbox is off', async () => {
    open();
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'dave@okonkwo.net' },
    });
    fireEvent.click(screen.getByLabelText('Send them the letter'));
    fireEvent.click(screen.getByRole('button', { name: 'ADD TO YOUR PEOPLE' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty('letter');
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ invite: false });
  });

  it('reports where the letter went (lens-4 §B.7)', async () => {
    const onAdded = jest.fn();
    render(<AddPersonSheet open initialKind="client" onClose={() => {}} onAdded={onAdded} />);
    fireEvent.change(screen.getByLabelText('Full name (optional)'), {
      target: { value: 'Dave Okonkwo' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'dave@okonkwo.net' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ADD AND SEND THE LETTER' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(onAdded.mock.calls[0][0]).toBe(
      'Dave Okonkwo is on your roster. Your letter is on its way to dave@okonkwo.net.',
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/kody/Code/patina-merged
pnpm --filter @patina/designer-portal test -- src/components/document/people/directory/__tests__/add-person-sheet-letter.test.tsx
```

Expected: FAIL — the checkbox still reads "Send a magic-link invite to Patina" under the flag.

- [ ] **Step 3: Wire the sheet**

In `apps/designer-portal/src/components/document/people/directory/add-person-sheet.tsx`:

(a) imports:

```tsx
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { useStudioIdentity } from '@patina/supabase';
import {
  LetterLineField,
  checkboxHelper,
  checkboxLabel,
  givenNameOf,
  sendButtonLabel,
  successLine,
} from './letter-line-field';
```

(b) state, beside `const [invite, setInvite] = useState(true);` (L165) — **all hooks stay above every early return**:

```tsx
  const [note, setNote] = useState('');
  const { value: letterOn, isLoading: letterLoading } = useFeatureFlag('client-invite-letter');
  const { data: studioIdentity } = useStudioIdentity({ designerId: undefined });
  const studioName = studioIdentity?.name ?? null;
  const clientGiven = givenNameOf(name);
```

and add `setNote('')` to `reset()` (L185-205).

(c) replace the checkbox block at L401-409 with a three-state render — fail-closed while loading:

```tsx
          {/* Fail-closed: neither the old string nor the new one renders while
              PostHog is still answering, so a non-pilot studio never sees the
              letter flash past. */}
          {letterLoading ? (
            <div className="mt-4 h-[18px]" aria-hidden />
          ) : letterOn ? (
            <>
              <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-[0.74rem] text-[var(--color-mocha)]">
                <input
                  type="checkbox"
                  checked={invite}
                  onChange={(e) => setInvite(e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer rounded border-[var(--color-pearl)] accent-[var(--color-clay)]"
                  aria-label={checkboxLabel(clientGiven)}
                />
                <span>
                  {checkboxLabel(clientGiven)}
                  <span className="mt-0.5 block text-[0.64rem] leading-relaxed text-[var(--color-aged-oak)]">
                    {checkboxHelper({ givenName: clientGiven, studioName, pronoun: null })}
                  </span>
                </span>
              </label>

              <LetterLineField
                facts={{
                  clientName: name.trim() || null,
                  clientEmail: email.trim() || 'no email yet',
                  projectName: null,
                }}
                value={note}
                onChange={setNote}
                // Checkbox off folds the field to "+ A line for {given}";
                // opening it turns the letter back on.
                folded={!invite}
                key={invite ? 'letter-on' : 'letter-off'}
              />
              {!invite && note.trim() ? null : null}
            </>
          ) : (
            <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-[0.74rem] text-[var(--color-mocha)]">
              <input
                type="checkbox"
                checked={invite}
                onChange={(e) => setInvite(e.target.checked)}
                className="h-4 w-4 cursor-pointer rounded border-[var(--color-pearl)] accent-[var(--color-clay)]"
              />
              Send a magic-link invite to Patina
            </label>
          )}
```

For "opening the folded field turns the letter back on", pass an `onOpen` through instead of relying on the key — extend `LetterLineField`'s props with `onOpen?: () => void`, called in the disclosure's `onClick` before `setOpen(true)`, and pass `onOpen={() => setInvite(true)}` here. Add the matching prop to Task 5's component.

(d) `submitClient` (L212-245) — the letter fields, and lens-4's success lines:

```tsx
      const result = await addClient.mutateAsync({
        clientEmail: trimmedEmail,
        clientName: name.trim() || undefined,
        source: 'direct',
        invite,
        ...(letterOn && invite
          ? { letter: true as const, note: note.trim() || undefined }
          : {}),
      });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });

      const label = name.trim() || trimmedEmail;
      const message = letterOn
        ? successLine({
            label,
            email: trimmedEmail,
            sent: invite,
            alreadyExisted: result.alreadyExists,
          })
        : result.alreadyExists
          ? `${label} is already on Patina — linked to their account, now on your roster.`
          : result.invited
            ? `${label} added — a magic-link invite is on its way.`
            : `${label} added to your roster.`;
      onAdded?.(message, 'client');
```

and, immediately after, the analytics property:

```tsx
      clientEvents.create({ has_note: letterOn && invite && !!note.trim() });
```

(e) the action group at L631-644 — the button states both acts:

```tsx
        <DocumentAction
          actionKey="add-person"
          variant="primary"
          loading={pending}
          loadingLabel="Adding…"
          onClick={() => void submit()}
        >
          {kind === 'client' && letterOn && !letterLoading
            ? sendButtonLabel(invite)
            : 'Add to roster'}
        </DocumentAction>
```

- [ ] **Step 4: Run it to verify it passes**

```bash
cd /Users/kody/Code/patina-merged
pnpm --filter @patina/designer-portal test -- src/components/document/people/directory/__tests__/add-person-sheet-letter.test.tsx
pnpm --filter @patina/designer-portal test -- src/components/document/people/directory/__tests__/letter-line-field.test.tsx
```

Expected: both suites pass.

- [ ] **Step 5: Gate**

```bash
cd /Users/kody/Code/patina-merged
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal lint
```

- [ ] **Step 6: Commit**

```bash
cd /Users/kody/Code/patina-merged
git add apps/designer-portal/src/components/document/people/directory/add-person-sheet.tsx \
        apps/designer-portal/src/components/document/people/directory/letter-line-field.tsx \
        apps/designer-portal/src/components/document/people/directory/__tests__/add-person-sheet-letter.test.tsx
git commit -m "feat(people): R12 — the house word is the letter, on the add-person sheet"
```

---

## Task 7 — The other two entry points (Lane L2)

**Files:**
- Modify: `apps/designer-portal/src/components/portal/client-picker.tsx` (`handleInviteAndLink` L200-227 · armed row L440-467)
- Modify: `apps/designer-portal/src/components/document/overlays/captured-household-invite.tsx` (`invite` signature L17-21 · call L28 · copy L55-69)
- Modify: `apps/designer-portal/src/components/document/overlays/send-sheet.tsx` (`handleInviteCapturedHousehold` L575-599 · render L646-655)
- Test: `apps/designer-portal/src/components/portal/__tests__/client-picker-letter.test.tsx`
- Test: `apps/designer-portal/src/components/document/overlays/__tests__/captured-household-letter.test.tsx`

**Interfaces:**
- Consumes: `LetterLineField` (Task 5), `useInviteAndLinkClient` with `letter`/`note`/`projectId` (Task 5).
- Produces: nothing later tasks consume.

- [ ] **Step 1: Write the failing tests**

Create `apps/designer-portal/src/components/portal/__tests__/client-picker-letter.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClientPicker } from '../client-picker';

const mutateAsync = jest.fn();
let flagValue = { value: true, isLoading: false };

jest.mock('@/hooks/use-feature-flag', () => ({ useFeatureFlag: () => flagValue }));
jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  useInviteAndLinkClient: () => ({ mutateAsync, isPending: false }),
  useDesignerClients: () => ({
    data: [
      {
        id: 'dc1',
        client_id: null,
        client_email: 'dave@okonkwo.net',
        client_name: 'Dave Okonkwo',
      },
    ],
    isLoading: false,
  }),
}));

beforeEach(() => {
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue({ profileId: 'p1', invited: true, alreadyExists: false });
});

it('the armed row starts folded — a line is offered, never demanded', () => {
  render(<ClientPicker value={null} onChange={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /Dave Okonkwo/ }));
  expect(screen.getByTestId('letter-line-disclosure')).toBeInTheDocument();
  expect(screen.queryByLabelText('A line for Dave')).toBeNull();
});

it('carries the opened line into the send', async () => {
  render(<ClientPicker value={null} onChange={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /Dave Okonkwo/ }));
  fireEvent.click(screen.getByTestId('letter-line-disclosure'));
  fireEvent.change(screen.getByLabelText('A line for Dave'), {
    target: { value: 'Dave — the drawings are in.' },
  });
  fireEvent.click(screen.getByTestId('client-picker-invite-send-dc1'));
  await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
  expect(mutateAsync.mock.calls[0][0]).toMatchObject({
    designerClientId: 'dc1',
    letter: true,
    note: 'Dave — the drawings are in.',
  });
});

it('sends with no line at all when she writes none', async () => {
  render(<ClientPicker value={null} onChange={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /Dave Okonkwo/ }));
  fireEvent.click(screen.getByTestId('client-picker-invite-send-dc1'));
  await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
  expect(mutateAsync.mock.calls[0][0].note).toBeUndefined();
  expect(mutateAsync.mock.calls[0][0].letter).toBe(true);
});

it('flag off — today’s armed row, no field, no letter key', async () => {
  flagValue = { value: false, isLoading: false };
  render(<ClientPicker value={null} onChange={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /Dave Okonkwo/ }));
  expect(screen.queryByTestId('letter-line-disclosure')).toBeNull();
  fireEvent.click(screen.getByTestId('client-picker-invite-send-dc1'));
  await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
  expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty('letter');
  flagValue = { value: true, isLoading: false };
});
```

Create `apps/designer-portal/src/components/document/overlays/__tests__/captured-household-letter.test.tsx`:

```tsx
import { inviteAndAttachCapturedHousehold } from '../captured-household-invite';

it('the send sheet writes no second field — the proposal’s message IS the note', async () => {
  const invite = jest.fn().mockResolvedValue({ profileId: 'p1' });
  const attach = jest.fn().mockResolvedValue(undefined);

  await inviteAndAttachCapturedHousehold({
    proposalId: 'prop1',
    designerClientId: 'dc1',
    clientEmail: 'dave@okonkwo.net',
    clientName: 'Dave Okonkwo',
    letter: true,
    note: 'Dave — the drawings are in.',
    projectId: 'proj1',
    invite,
    attach,
  });

  expect(invite).toHaveBeenCalledWith({
    designerClientId: 'dc1',
    clientEmail: 'dave@okonkwo.net',
    clientName: 'Dave Okonkwo',
    letter: true,
    note: 'Dave — the drawings are in.',
    projectId: 'proj1',
  });
});

it('passes no letter key when the flag is off', async () => {
  const invite = jest.fn().mockResolvedValue({ profileId: 'p1' });
  const attach = jest.fn().mockResolvedValue(undefined);

  await inviteAndAttachCapturedHousehold({
    proposalId: 'prop1',
    designerClientId: 'dc1',
    clientEmail: 'dave@okonkwo.net',
    clientName: 'Dave Okonkwo',
    letter: false,
    note: 'ignored',
    projectId: 'proj1',
    invite,
    attach,
  });

  expect(invite.mock.calls[0][0]).not.toHaveProperty('letter');
  expect(invite.mock.calls[0][0]).not.toHaveProperty('note');
});

it('a whitespace-only proposal message is no note at all', async () => {
  const invite = jest.fn().mockResolvedValue({ profileId: 'p1' });
  const attach = jest.fn().mockResolvedValue(undefined);

  await inviteAndAttachCapturedHousehold({
    proposalId: 'prop1',
    designerClientId: 'dc1',
    clientEmail: 'dave@okonkwo.net',
    letter: true,
    note: '   ',
    projectId: 'proj1',
    invite,
    attach,
  });

  expect(invite.mock.calls[0][0].note).toBeUndefined();
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
cd /Users/kody/Code/patina-merged
pnpm --filter @patina/designer-portal test -- src/components/portal/__tests__/client-picker-letter.test.tsx src/components/document/overlays/__tests__/captured-household-letter.test.tsx
```

Expected: FAIL — the disclosure is absent and `invite` is called without the letter fields.

- [ ] **Step 3: Wire the ClientPicker**

In `apps/designer-portal/src/components/portal/client-picker.tsx`:

(a) add, with the other hooks (above every early return):

```tsx
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { LetterLineField } from '../document/people/directory/letter-line-field';

  const { value: letterOn } = useFeatureFlag('client-invite-letter');
  // Keyed by row: an armed row's line belongs to that row and to no other.
  const [notes, setNotes] = useState<Record<string, string>>({});
```

(b) `handleInviteAndLink` (L200-227) — the note travels with the send:

```tsx
      const note = (notes[dc.id] ?? '').trim();
      const result = await inviteAndLink.mutateAsync({
        designerClientId: dc.id,
        clientEmail: dc.client_email,
        clientName: dc.client_name ?? undefined,
        ...(letterOn ? { letter: true as const, note: note || undefined } : {}),
      });
```

(c) the armed-row confirm block (L440-467) — the folded field sits above the two buttons:

```tsx
                          {letterOn && (
                            <LetterLineField
                              facts={{
                                clientName: dc.client_name ?? null,
                                clientEmail: dc.client_email ?? '',
                                projectName: null,
                              }}
                              value={notes[dc.id] ?? ''}
                              onChange={(next) =>
                                setNotes((prev) => ({ ...prev, [dc.id]: next }))
                              }
                              folded
                            />
                          )}
```

and rename the confirm button's label to `Send the letter` when `letterOn` (J2 stays: arm, then confirm):

```tsx
                              {letterOn ? 'Send the letter' : 'Send invite'}
```

- [ ] **Step 4: Wire the captured household**

In `apps/designer-portal/src/components/document/overlays/captured-household-invite.tsx`, widen the helper (L5-38) — the send sheet has **no second field**:

```tsx
export async function inviteAndAttachCapturedHousehold({
  proposalId,
  designerClientId,
  clientEmail,
  clientName,
  letter,
  note,
  projectId,
  invite,
  attach,
}: {
  proposalId: string;
  designerClientId: string;
  clientEmail: string;
  clientName?: string;
  /** The First Letter, when the flag is on. */
  letter?: boolean;
  /**
   * The proposal's own personal message. The send sheet already asks for one
   * (send-sheet.tsx:807) and nobody writes the same sentence twice in one send,
   * so it IS the note — there is deliberately no second field here.
   */
  note?: string;
  projectId?: string;
  invite: (input: {
    designerClientId: string;
    clientEmail: string;
    clientName?: string;
    letter?: boolean;
    note?: string;
    projectId?: string;
  }) => Promise<{ profileId: string | null }>;
  attach: (input: {
    engagementKind: 'proposal';
    targetId: string;
    clientId: string;
  }) => Promise<unknown>;
}): Promise<string> {
  const trimmed = (note ?? '').trim();
  const result = await invite({
    designerClientId,
    clientEmail,
    clientName,
    ...(letter ? { letter: true, note: trimmed || undefined, projectId } : {}),
  });
  if (!result.profileId) {
    throw new Error('The invite went out but no client account came back.');
  }
  await attach({ engagementKind: 'proposal', targetId: proposalId, clientId: result.profileId });
  return result.profileId;
}
```

and, in `CapturedHouseholdInvite`'s copy (L55-69), retire the word when the flag is on. Add a `letterOn?: boolean` prop and render:

```tsx
      <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--color-mocha)]">
        <b>{householdName}</b> is still this proposal&rsquo;s household.{' '}
        {letterOn
          ? 'Write to them so they can receive and sign it — your message above goes with the letter.'
          : `Invite ${name?.trim() ? 'them' : email} to Patina so they can receive and sign it.`}
      </p>
      <DocumentAction
        actionKey="invite-captured-household"
        surfaceKey="open-document"
        regionKey="send-proposal-sheet"
        variant="secondary"
        onClick={onInvite}
        loading={pending}
        loadingLabel={letterOn ? 'Sending…' : 'Inviting…'}
      >
        {letterOn ? `Write to ${householdName}` : `Invite ${householdName}`}
      </DocumentAction>
```

- [ ] **Step 5: Wire the send sheet**

In `apps/designer-portal/src/components/document/overlays/send-sheet.tsx`:

(a) add the flag hook beside the other hooks;
(b) `handleInviteCapturedHousehold` (L584-591) passes the proposal's own message:

```tsx
      await inviteAndAttachCapturedHousehold({
        proposalId,
        designerClientId: proposal.designer_client_id,
        clientEmail: capturedHousehold.client_email,
        clientName: capturedHousehold.client_name ?? undefined,
        letter: letterOn,
        note: personalMessage,
        projectId: proposal.project_id ?? undefined,
        invite: inviteAndLinkClient.mutateAsync,
        attach: attachClient.mutateAsync,
      });
```

(c) pass `letterOn={letterOn}` to `<CapturedHouseholdInvite>` at L646.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd /Users/kody/Code/patina-merged
pnpm --filter @patina/designer-portal test -- src/components/portal/__tests__/client-picker-letter.test.tsx src/components/document/overlays/__tests__/captured-household-letter.test.tsx
```

Expected: 7 tests pass.

- [ ] **Step 7: Gate**

```bash
cd /Users/kody/Code/patina-merged
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal test -- src/components/portal src/components/document/overlays
pnpm --filter @patina/designer-portal lint
```

- [ ] **Step 8: Commit**

```bash
cd /Users/kody/Code/patina-merged
git add apps/designer-portal/src/components/portal/client-picker.tsx \
        apps/designer-portal/src/components/document/overlays/captured-household-invite.tsx \
        apps/designer-portal/src/components/document/overlays/send-sheet.tsx \
        apps/designer-portal/src/components/portal/__tests__/client-picker-letter.test.tsx \
        apps/designer-portal/src/components/document/overlays/__tests__/captured-household-letter.test.tsx
git commit -m "feat(people): the letter on the picker and the send sheet — one field, never two"
```

---

## Task 8 — Page two of the letter (Lane L3)

**Files:**
- Create: `apps/client-portal/src/components/letter/letter-shell.tsx`
- Create: `apps/client-portal/src/components/letter/OpenLetterForm.tsx`
- Create: `apps/client-portal/src/components/letter/StaleLetterForm.tsx`
- Create: `apps/client-portal/src/components/letter/__tests__/letter-shell.test.tsx`
- Create: `apps/client-portal/src/components/letter/__tests__/OpenLetterForm.test.tsx`
- Create: `apps/client-portal/src/components/letter/__tests__/StaleLetterForm.test.tsx`
- Create: `apps/client-portal/src/app/api/auth/invite/refresh/route.ts`
- Create: `apps/client-portal/src/app/api/auth/invite/__tests__/accept-route.test.ts`
- Create: `apps/client-portal/src/app/api/auth/invite/__tests__/refresh-route.test.ts`
- Create: `apps/client-portal/src/app/auth/invite/[token]/__tests__/page.test.tsx`
- Modify: `apps/client-portal/src/app/auth/invite/[token]/page.tsx` (`loadInvite` L34-71 · render L86-141)
- Modify: `apps/client-portal/src/app/api/auth/invite/accept/route.ts` (whole file)
- Delete: `apps/client-portal/src/components/auth/AcceptInviteForm.tsx`
- Delete: `apps/client-portal/src/components/auth/__tests__/AcceptInviteForm.test.tsx`

**Interfaces:**
- Consumes: `POST /client-invite/accept → { actionLink }` and `POST /client-invite/refresh → { ok: true }` (Task 3); the snapshot columns (Task 1).
- Produces:

```ts
export interface LetterSnapshotView {
  kind: 'invite' | 'notice';
  recipientName: string | null;
  studioName: string | null;
  studioLogoUrl: string | null;
  signatureCity: string | null;
  designerFullName: string;
  designerGivenName: string;
  projectName: string | null;
  standingSentence: string;
  personalMessage: string | null;
  sentAt: string;
  expiresAt: string;
}
export function LetterShell(props: {
  snapshot: LetterSnapshotView;
  children: React.ReactNode;
}): JSX.Element;
export function OpenLetterForm(props: { token: string; label: string }): JSX.Element;
export function StaleLetterForm(props: { token: string }): JSX.Element;
```

- [ ] **Step 1: Confirm nothing else imports the password form**

```bash
cd /Users/kody/Code/patina-merged
grep -rn "AcceptInviteForm" apps packages
```

Expected: only `apps/client-portal/src/app/auth/invite/[token]/page.tsx` and its own test file. Anything else, stop and report.

- [ ] **Step 2: Write the failing tests**

Create `apps/client-portal/src/components/letter/__tests__/letter-shell.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { LetterShell, type LetterSnapshotView } from '../letter-shell';

const SNAP: LetterSnapshotView = {
  kind: 'invite',
  recipientName: 'Dave Okonkwo',
  studioName: 'Middle West Studio',
  studioLogoUrl: null,
  signatureCity: 'Madison',
  designerFullName: 'Leah Hartwell',
  designerGivenName: 'Leah',
  projectName: 'Van Hise kitchen and back hall',
  standingSentence:
    "Leah Hartwell of Middle West Studio added you to the Van Hise kitchen and back hall on 8 September. The page below holds the studio's record of the job — the plans, the papers, and the numbers.",
  personalMessage: 'Dave — the drawings are in.',
  sentAt: '2026-09-08T14:00:00.000Z',
  expiresAt: '2026-09-15T14:00:00.000Z',
};

it('PP-1 — the studio is on top and Patina appears once, in the colophon', () => {
  const { container } = render(<LetterShell snapshot={SNAP}>{null}</LetterShell>);
  expect(screen.getByTestId('letter-letterhead')).toHaveTextContent('MIDDLE WEST STUDIO');
  expect(screen.getByTestId('letter-letterhead')).toHaveTextContent('Madison · 8 September 2026');
  expect(screen.getByTestId('letter-letterhead')).toHaveTextContent('Prepared for Dave Okonkwo');
  expect((container.textContent ?? '').match(/Patina/g) ?? []).toHaveLength(1);
  expect(screen.getByTestId('letter-colophon')).toHaveTextContent(
    'Prepared by Middle West Studio · Sent through Patina',
  );
});

it('R6 — the headline is the house, never "Welcome to Patina."', () => {
  render(<LetterShell snapshot={SNAP}>{null}</LetterShell>);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'Van Hise kitchen and back hall',
  );
  expect(screen.queryByText(/Welcome to Patina/)).toBeNull();
});

it('names the page when there is no project', () => {
  render(
    <LetterShell snapshot={{ ...SNAP, projectName: null }}>{null}</LetterShell>,
  );
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'A page for your work together',
  );
});

it('prints the FROZEN standing sentence, word for word', () => {
  render(<LetterShell snapshot={SNAP}>{null}</LetterShell>);
  expect(screen.getByTestId('letter-standing')).toHaveTextContent(SNAP.standingSentence);
});

it('carries the note as a quoted block, and prints nothing without one', () => {
  const { rerender } = render(<LetterShell snapshot={SNAP}>{null}</LetterShell>);
  expect(screen.getByTestId('letter-note')).toHaveTextContent('Dave — the drawings are in.');
  rerender(
    <LetterShell snapshot={{ ...SNAP, personalMessage: null }}>{null}</LetterShell>,
  );
  // ABSENCE IS SILENCE: no empty frame, no "Leah didn't leave a note".
  expect(screen.queryByTestId('letter-note')).toBeNull();
});

it('R7′ — signs with the full name, dropping empty segments and separators', () => {
  const { rerender } = render(<LetterShell snapshot={SNAP}>{null}</LetterShell>);
  expect(screen.getByTestId('letter-signoff')).toHaveTextContent(
    '— Leah Hartwell · Middle West Studio · Madison',
  );
  rerender(
    <LetterShell
      snapshot={{ ...SNAP, studioName: null, signatureCity: null, designerFullName: 'Nora Feld' }}
    >
      {null}
    </LetterShell>,
  );
  expect(screen.getByTestId('letter-signoff')).toHaveTextContent('— Nora Feld');
  expect(screen.getByTestId('letter-signoff').textContent).not.toContain('·');
});

it('states the expiry once, with its remedy, and never for a notice', () => {
  const { rerender } = render(<LetterShell snapshot={SNAP}>{null}</LetterShell>);
  expect(screen.getByTestId('letter-expiry')).toHaveTextContent(
    'The link works until 15 September; Leah can send another.',
  );
  rerender(<LetterShell snapshot={{ ...SNAP, kind: 'notice' }}>{null}</LetterShell>);
  expect(screen.queryByTestId('letter-expiry')).toBeNull();
});

it('says none of the words a homeowner must never read here', () => {
  const { container } = render(<LetterShell snapshot={SNAP}>{null}</LetterShell>);
  const text = container.textContent ?? '';
  for (const banned of ['Accept', 'accept', 'collaborate', 'workspace', 'dashboard', 'Welcome']) {
    expect(text).not.toContain(banned);
  }
});

it('prints no slot it has no fact for', () => {
  render(
    <LetterShell snapshot={{ ...SNAP, recipientName: null, signatureCity: null }}>
      {null}
    </LetterShell>,
  );
  const head = screen.getByTestId('letter-letterhead').textContent ?? '';
  expect(head).not.toContain('Prepared for');
  expect(head).toContain('8 September 2026');
  expect(head).not.toContain('· 8 September 2026');
});
```

Create `apps/client-portal/src/components/letter/__tests__/OpenLetterForm.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OpenLetterForm } from '../OpenLetterForm';

const assign = jest.fn();

beforeEach(() => {
  assign.mockReset();
  Object.defineProperty(window, 'location', {
    value: { assign, replace: assign, href: '' },
    writable: true,
  });
  global.fetch = jest.fn();
});

it('R6 — one button, no password field anywhere', () => {
  render(<OpenLetterForm token="tok1" label="Open the project" />);
  expect(screen.getByRole('button', { name: 'Open the project' })).toBeInTheDocument();
  expect(document.querySelector('input[type="password"]')).toBeNull();
});

it('mints on the POST and follows the link it is handed', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({ actionLink: 'https://x.supabase.co/auth/v1/verify?token=abc' }),
  });
  render(<OpenLetterForm token="tok1" label="Open the project" />);
  fireEvent.click(screen.getByRole('button', { name: 'Open the project' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe('/api/auth/invite/accept');
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body)).toEqual({ token: 'tok1' });
  await waitFor(() =>
    expect(assign).toHaveBeenCalledWith('https://x.supabase.co/auth/v1/verify?token=abc'),
  );
});

it('never fires twice, however many times the button is pressed', async () => {
  (global.fetch as jest.Mock).mockImplementation(
    () => new Promise(() => {}),
  );
  render(<OpenLetterForm token="tok1" label="Open the project" />);
  const button = screen.getByRole('button', { name: 'Open the project' });
  fireEvent.click(button);
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
});

it('says what happened, plainly, when the link has already been used', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: false,
    status: 409,
    json: async () => ({ error: 'already_accepted' }),
  });
  render(<OpenLetterForm token="tok1" label="Open the project" />);
  fireEvent.click(screen.getByRole('button', { name: 'Open the project' }));
  expect(
    await screen.findByText('This letter has already been opened.'),
  ).toBeInTheDocument();
});
```

Create `apps/client-portal/src/components/letter/__tests__/StaleLetterForm.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StaleLetterForm } from '../StaleLetterForm';

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
});

it('R10 — the page says it plainly and offers one tap', () => {
  render(<StaleLetterForm token="tok1" />);
  expect(screen.getByText("This letter's gone stale.")).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Send a fresh letter' })).toBeInTheDocument();
});

it('nothing lands in the designer’s queue for a thing she did not do wrong', async () => {
  render(<StaleLetterForm token="tok1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Send a fresh letter' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe('/api/auth/invite/refresh');
  expect(JSON.parse(init.body)).toEqual({ token: 'tok1' });
  expect(await screen.findByText('A fresh letter is on its way.')).toBeInTheDocument();
});

it('one tap only', async () => {
  (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));
  render(<StaleLetterForm token="tok1" />);
  const button = screen.getByRole('button', { name: 'Send a fresh letter' });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
});
```

Create `apps/client-portal/src/app/api/auth/invite/__tests__/refresh-route.test.ts`:

```ts
import { NextRequest } from 'next/server';
import { POST } from '../refresh/route';

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: async () => JSON.stringify({ ok: true }),
  });
});

function req(body: unknown) {
  return new NextRequest('http://localhost/api/auth/invite/refresh', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

it('forwards the token with the service role — the caller is not signed in yet', async () => {
  const res = await POST(req({ token: 'tok1' }));
  expect(res.status).toBe(200);
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toMatch(/\/client-invite\/refresh$/);
  expect(init.headers.Authorization).toMatch(/^Bearer /);
  expect(JSON.parse(init.body)).toEqual({ token: 'tok1' });
});

it('answers ok for a missing token — the page is never an oracle', async () => {
  const res = await POST(req({}));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(global.fetch).not.toHaveBeenCalled();
});

it('answers ok for an unreadable body', async () => {
  const bad = new NextRequest('http://localhost/api/auth/invite/refresh', {
    method: 'POST',
    body: 'not json',
  });
  const res = await POST(bad);
  expect(res.status).toBe(200);
});
```

Create `apps/client-portal/src/app/api/auth/invite/__tests__/accept-route.test.ts`:

```ts
import { NextRequest } from 'next/server';
import { POST } from '../accept/route';

beforeEach(() => {
  global.fetch = jest.fn();
});

function req(body: unknown) {
  return new NextRequest('http://localhost/api/auth/invite/accept', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

it('R6 — no session is required; the token IS the credential', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: async () => JSON.stringify({ actionLink: 'https://x/verify' }),
  });
  const res = await POST(req({ token: 'tok1' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ actionLink: 'https://x/verify' });
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toMatch(/\/client-invite\/accept$/);
  expect(init.headers.Authorization).toMatch(/^Bearer /);
});

it('refuses a request with no token', async () => {
  const res = await POST(req({}));
  expect(res.status).toBe(400);
  expect(global.fetch).not.toHaveBeenCalled();
});

it('passes the function’s verdict through unchanged', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: false,
    status: 410,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: async () => JSON.stringify({ error: 'expired' }),
  });
  const res = await POST(req({ token: 'tok1' }));
  expect(res.status).toBe(410);
});
```

Create `apps/client-portal/src/app/auth/invite/[token]/__tests__/page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import InvitePage from '../page';

const maybeSingle = jest.fn();
jest.mock('@patina/supabase/client', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));

const ROW = {
  id: 'i1',
  token: 'tok1',
  email: 'dave@okonkwo.net',
  kind: 'invite',
  recipient_name: 'Dave Okonkwo',
  studio_name: 'Middle West Studio',
  studio_logo_url: null,
  signature_city: 'Madison',
  designer_full_name: 'Leah Hartwell',
  designer_given_name: 'Leah',
  project_name: 'Van Hise kitchen and back hall',
  rendered_standing_sentence: 'Leah Hartwell of Middle West Studio added you to the Van Hise kitchen and back hall on 8 September.',
  personal_message: 'Dave — the drawings are in.',
  sent_at: '2026-09-08T14:00:00.000Z',
  expires_at: '2099-01-01T00:00:00.000Z',
  accepted_at: null,
  revoked_at: null,
  superseded_by: null,
};

async function renderPage(row: unknown) {
  maybeSingle.mockResolvedValue({ data: row });
  const ui = await InvitePage({ params: Promise.resolve({ token: 'tok1' }) });
  render(ui as React.ReactElement);
}

it('renders page two of the letter from the snapshot alone', async () => {
  await renderPage(ROW);
  expect(screen.getByTestId('letter-letterhead')).toHaveTextContent('MIDDLE WEST STUDIO');
  expect(screen.getByTestId('letter-standing')).toHaveTextContent(
    ROW.rendered_standing_sentence,
  );
  expect(screen.getByRole('button', { name: 'Open the project' })).toBeInTheDocument();
});

it('never reads a live profile, project or organization row', async () => {
  await renderPage(ROW);
  // One query — client_invitations — and nothing else. If the page ever grows a
  // second read, the email and the page can disagree again.
  expect(maybeSingle).toHaveBeenCalledTimes(1);
});

it('R10 — a lapsed letter offers one tap, not an apology', async () => {
  await renderPage({ ...ROW, expires_at: '2020-01-01T00:00:00.000Z' });
  expect(screen.getByText("This letter's gone stale.")).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Send a fresh letter' })).toBeInTheDocument();
});

it('an already-opened letter says so and points at the front door', async () => {
  await renderPage({ ...ROW, accepted_at: '2026-09-09T00:00:00.000Z' });
  expect(screen.getByText('This letter has already been opened.')).toBeInTheDocument();
});

it('an unknown token says nothing about whether it ever existed', async () => {
  await renderPage(null);
  expect(screen.getByText("This letter's gone stale.")).toBeInTheDocument();
});

it('R13 — a notice opens the house directly, with nothing to accept', async () => {
  await renderPage({ ...ROW, kind: 'notice', accepted_at: '2026-09-08T14:00:00.000Z' });
  expect(screen.getByRole('link', { name: 'Open the project' })).toBeInTheDocument();
  expect(screen.queryByTestId('letter-expiry')).toBeNull();
});
```

- [ ] **Step 3: Run them to verify they fail**

```bash
cd /Users/kody/Code/patina-merged
pnpm --filter @patina/client-portal test -- src/components/letter src/app/api/auth/invite src/app/auth/invite
```

Expected: FAIL — `Cannot find module '../letter-shell'`.

- [ ] **Step 4: Write the shell**

Create `apps/client-portal/src/components/letter/letter-shell.tsx`:

```tsx
/**
 * PAGE TWO OF THE LETTER (R6). Same letterhead, same standing sentence word for
 * word, same note, one button. It renders from the FROZEN snapshot and reads no
 * live profile, project, membership, or organization row — so the email and the
 * page cannot disagree even if the studio renames itself between send and click.
 * That closes the split research/01 §7 found, where the email said "Middle West
 * Studio" and the landing page said "Leah Quist".
 *
 * PP-1 (R2): the studio is on top, Patina is named exactly once, in the
 * colophon, in the smallest type on the page. This is why it does NOT use
 * ClientAuthShell — that shell is Patina's own front door and belongs on
 * /auth/signin, not on a studio's letter.
 */

import type { ReactNode } from 'react';

const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "8 September" — a real date, never a countdown. UTC, so a letter reads the
 *  same wherever it is opened. */
export function longDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${LONG_MONTHS[d.getUTCMonth()]}`;
}

function longDateWithYear(iso: string): string {
  return `${longDate(iso)} ${new Date(iso).getUTCFullYear()}`;
}

export interface LetterSnapshotView {
  kind: 'invite' | 'notice';
  recipientName: string | null;
  studioName: string | null;
  studioLogoUrl: string | null;
  signatureCity: string | null;
  designerFullName: string;
  designerGivenName: string;
  projectName: string | null;
  standingSentence: string;
  personalMessage: string | null;
  sentAt: string;
  expiresAt: string;
}

function letterheadName(s: LetterSnapshotView): string {
  return (s.studioName ?? '').trim() || s.designerFullName;
}

export function LetterShell({
  snapshot,
  children,
}: {
  snapshot: LetterSnapshotView;
  children: ReactNode;
}) {
  const name = letterheadName(snapshot);
  const place = [snapshot.signatureCity?.trim(), longDateWithYear(snapshot.sentAt)]
    .filter(Boolean)
    .join(' · ');
  const signature = [snapshot.designerFullName, snapshot.studioName, snapshot.signatureCity]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' · ');
  const note = snapshot.personalMessage?.trim();

  return (
    <main className="mx-auto min-h-screen max-w-[46rem] bg-[#F5F0E6] px-6 py-12 text-[#1F1B16]">
      <header data-testid="letter-letterhead" className="flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-2.5">
            {snapshot.studioLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={snapshot.studioLogoUrl}
                alt={name}
                className="h-5 max-h-6 w-auto"
              />
            ) : null}
            <span className="font-heading text-[1.15rem] font-semibold uppercase tracking-[0.06em]">
              {name.toUpperCase()}
            </span>
          </div>
          <p className="mt-1.5 font-mono text-[11px] tracking-[0.08em] text-[#8C8578]">{place}</p>
        </div>
        {snapshot.recipientName?.trim() ? (
          <p className="text-right text-[13px] text-[#8C8578]">
            Prepared for {snapshot.recipientName.trim()}
          </p>
        ) : null}
      </header>

      <hr className="mt-5 border-t border-[#E6DDCC]" />

      <h1 className="mt-8 font-heading text-[2rem] font-semibold leading-tight">
        {snapshot.projectName?.trim() || 'A page for your work together'}
      </h1>

      <p
        data-testid="letter-standing"
        className="mt-4 max-w-[52ch] text-[1rem] leading-relaxed text-[#4B463E]"
      >
        {snapshot.standingSentence}
      </p>

      {/* ABSENCE IS SILENCE. A studio that says nothing is allowed to say
          nothing — no empty frame, no substitute sentence in her voice. */}
      {note ? (
        <blockquote
          data-testid="letter-note"
          className="mt-6 max-w-[52ch] whitespace-pre-line border-l-[3px] border-[#B08A46] bg-white py-3.5 pl-4 pr-4 font-heading text-[1rem] italic leading-relaxed text-[#4B463E]"
        >
          {note}
        </blockquote>
      ) : null}

      <div className="mt-8">{children}</div>

      {snapshot.kind === 'invite' ? (
        <p data-testid="letter-expiry" className="mt-5 text-[13px] text-[#8C8578]">
          {`The link works until ${longDate(snapshot.expiresAt)}; ${snapshot.designerGivenName} can send another.`}
        </p>
      ) : null}

      {signature ? (
        <p data-testid="letter-signoff" className="mt-8 text-[1rem] text-[#4B463E]">
          {`— ${signature}`}
        </p>
      ) : null}

      <hr className="mt-10 border-t border-[#E6DDCC]" />

      <footer data-testid="letter-colophon" className="mt-4 space-y-1 text-[12px] leading-relaxed text-[#8C8578]">
        <p>{`Prepared by ${name} · Sent through Patina`}</p>
      </footer>
    </main>
  );
}
```

Create `apps/client-portal/src/components/letter/OpenLetterForm.tsx`:

```tsx
'use client';

/**
 * R6 — one button, no password. The button POSTs; the server validates the
 * token, marks it accepted, mints a FRESH magic link and hands it back, and the
 * browser follows it. She lands signed in, on her house, having typed nothing.
 *
 * MINT ON POST, NEVER ON GET. Outlook SafeLinks and similar corporate scanners
 * follow links in mail; a page that minted on GET would burn her token before
 * she ever clicked, and her first click would land on "already opened".
 */

import { useCallback, useRef, useState } from 'react';

const MESSAGES: Record<string, string> = {
  already_accepted: 'This letter has already been opened.',
  expired: "This letter's gone stale.",
  revoked: "This letter's gone stale.",
  not_found: "This letter's gone stale.",
};

export function OpenLetterForm({ token, label }: { token: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One in flight, whatever the button is asked to do.
  const inFlight = useRef(false);

  const open = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        actionLink?: string;
        error?: string;
      };
      if (!res.ok || !payload.actionLink) {
        setError(MESSAGES[payload.error ?? ''] ?? 'That link did not work just now.');
        inFlight.current = false;
        setBusy(false);
        return;
      }
      // A hard navigation, not a router push: the link is GoTrue's, on another
      // origin, and the session lands on the way through.
      window.location.assign(payload.actionLink);
    } catch {
      setError('That link did not work just now.');
      inFlight.current = false;
      setBusy(false);
    }
  }, [token]);

  return (
    <div>
      <button
        type="button"
        onClick={() => void open()}
        disabled={busy}
        className="inline-flex min-h-11 items-center rounded-[7px] border border-[#8A6A30] bg-[#B08A46] px-8 py-3.5 text-[15px] font-semibold text-[#F5F0E6] disabled:opacity-70"
      >
        {label}
      </button>
      {error ? <p className="mt-3 text-[13px] text-[#A24E2E]">{error}</p> : null}
    </div>
  );
}
```

Create `apps/client-portal/src/components/letter/StaleLetterForm.tsx`:

```tsx
'use client';

/**
 * R10 — the lapsed letter. One tap, sent by the system, and nothing lands in
 * the designer's queue for a thing she did not do wrong. The response is always
 * ok, whether or not the token ever existed, so this page cannot be used to
 * learn which tokens are real.
 */

import { useCallback, useRef, useState } from 'react';

export function StaleLetterForm({ token }: { token: string }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await fetch('/api/auth/invite/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
    } finally {
      setSent(true);
      setBusy(false);
    }
  }, [token]);

  return (
    <div>
      <p className="font-heading text-[1.15rem] text-[#1F1B16]">This letter&rsquo;s gone stale.</p>
      {sent ? (
        <p className="mt-3 text-[15px] text-[#4B463E]">A fresh letter is on its way.</p>
      ) : (
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy}
          className="mt-4 inline-flex min-h-11 items-center rounded-[7px] border border-[#8A6A30] bg-[#B08A46] px-8 py-3.5 text-[15px] font-semibold text-[#F5F0E6] disabled:opacity-70"
        >
          Send a fresh letter
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Write the two routes**

Replace `apps/client-portal/src/app/api/auth/invite/accept/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';

const FUNCTIONS_BASE =
  process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL ??
  `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/functions/v1`;

/**
 * R6 — NO SESSION IS REQUIRED HERE, and that is the change. Under the old flow
 * the homeowner signed up with a password first and this route forwarded her
 * own access token; under the letter she has typed nothing and holds only the
 * token that was mailed to her. The token IS the credential: the edge function
 * validates it (exists, unaccepted, unexpired, unrevoked), claims the row, and
 * only then mints a magic link. This route forwards with the service-role key
 * because the function accepts no other principal.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const token = (body as { token?: unknown })?.token;
  if (typeof token !== 'string' || !token) {
    return NextResponse.json({ error: 'token_required' }, { status: 400 });
  }

  const upstream = `${FUNCTIONS_BASE.replace(/\/$/, '')}/client-invite/accept`;
  const res = await fetch(upstream, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
  });
}
```

Create `apps/client-portal/src/app/api/auth/invite/refresh/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';

const FUNCTIONS_BASE =
  process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL ??
  `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/functions/v1`;

/**
 * R10 — the lapsed page's one tap. Always answers 200 { ok: true }: a page any
 * stranger can open must not become an oracle for which tokens exist. The edge
 * function makes the same promise; this route makes it again so a transport
 * failure cannot leak the difference either.
 */
export async function POST(request: NextRequest) {
  let token: string | null = null;
  try {
    const body = (await request.json()) as { token?: unknown };
    if (typeof body?.token === 'string' && body.token) token = body.token;
  } catch {
    token = null;
  }
  if (!token) return NextResponse.json({ ok: true });

  try {
    await fetch(`${FUNCTIONS_BASE.replace(/\/$/, '')}/client-invite/refresh`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    console.error('[auth/invite/refresh] upstream failed', err);
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Rewrite the token page**

Replace `apps/client-portal/src/app/auth/invite/[token]/page.tsx`:

```tsx
import { createAdminClient } from '@patina/supabase/client';

import {
  LetterShell,
  type LetterSnapshotView,
} from '@/components/letter/letter-shell';
import { OpenLetterForm } from '@/components/letter/OpenLetterForm';
import { StaleLetterForm } from '@/components/letter/StaleLetterForm';

const CLIENT_PORTAL_URL =
  process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL ?? 'https://client.patina.cloud';

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

const SNAPSHOT_COLUMNS = [
  'id', 'token', 'email', 'kind', 'recipient_name', 'studio_name',
  'studio_logo_url', 'signature_city', 'designer_full_name',
  'designer_given_name', 'project_name', 'rendered_standing_sentence',
  'personal_message', 'sent_at', 'expires_at', 'accepted_at', 'revoked_at',
  'superseded_by',
].join(', ');

/**
 * ONE READ. Everything the page prints comes from the snapshot frozen at send —
 * no profiles lookup, no projects lookup, no resolve_studio_identity. That is
 * what makes the email and the page say the same words on the same day and a
 * month later, whatever the studio has renamed itself to since.
 */
async function loadSnapshot(token: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from('client_invitations')
    .select(SNAPSHOT_COLUMNS)
    .eq('token', token)
    .maybeSingle();
  return data ?? null;
}

function toView(row: Record<string, unknown>): LetterSnapshotView {
  return {
    kind: row.kind === 'notice' ? 'notice' : 'invite',
    recipientName: (row.recipient_name as string | null) ?? null,
    studioName: (row.studio_name as string | null) ?? null,
    studioLogoUrl: (row.studio_logo_url as string | null) ?? null,
    signatureCity: (row.signature_city as string | null) ?? null,
    designerFullName: (row.designer_full_name as string | null) ?? 'Your designer',
    designerGivenName: (row.designer_given_name as string | null) ?? 'she',
    projectName: (row.project_name as string | null) ?? null,
    standingSentence: (row.rendered_standing_sentence as string | null) ?? '',
    personalMessage: (row.personal_message as string | null) ?? null,
    sentAt: (row.sent_at as string) ?? new Date().toISOString(),
    expiresAt: (row.expires_at as string) ?? new Date().toISOString(),
  };
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  const row = await loadSnapshot(token);

  // An unknown, revoked, or superseded token says exactly what a lapsed one
  // says. The page never confirms whether a token was ever real.
  if (!row || row.revoked_at || row.superseded_by) {
    return <StalePage token={token} />;
  }

  const view = toView(row as Record<string, unknown>);
  const label = view.projectName?.trim() ? 'Open the project' : 'Open the page';

  // R13 — a notice has nothing to accept: the button is a plain link home.
  if (view.kind === 'notice') {
    return (
      <LetterShell snapshot={view}>
        <a
          href={`${CLIENT_PORTAL_URL}/`}
          className="inline-flex min-h-11 items-center rounded-[7px] border border-[#8A6A30] bg-[#B08A46] px-8 py-3.5 text-[15px] font-semibold text-[#F5F0E6]"
        >
          {label}
        </a>
      </LetterShell>
    );
  }

  if (row.accepted_at) {
    return (
      <LetterShell snapshot={view}>
        <div>
          <p className="font-heading text-[1.15rem]">This letter has already been opened.</p>
          <a
            href="/auth/signin"
            className="mt-4 inline-flex min-h-11 items-center text-[15px] font-semibold underline underline-offset-4"
          >
            Sign in
          </a>
        </div>
      </LetterShell>
    );
  }

  if (new Date(row.expires_at as string).getTime() < Date.now()) {
    return (
      <LetterShell snapshot={view}>
        <StaleLetterForm token={token} />
      </LetterShell>
    );
  }

  return (
    <LetterShell snapshot={view}>
      <OpenLetterForm token={token} label={label} />
    </LetterShell>
  );
}

/**
 * A token with no snapshot to print. The letterhead cannot be honest here, so
 * the page is bare — it still never says "Welcome to Patina", and it still
 * offers the one tap.
 */
function StalePage({ token }: { token: string }) {
  return (
    <main className="mx-auto min-h-screen max-w-[46rem] bg-[#F5F0E6] px-6 py-16 text-[#1F1B16]">
      <StaleLetterForm token={token} />
    </main>
  );
}
```

- [ ] **Step 7: Delete the password form**

```bash
cd /Users/kody/Code/patina-merged
git rm apps/client-portal/src/components/auth/AcceptInviteForm.tsx \
       apps/client-portal/src/components/auth/__tests__/AcceptInviteForm.test.tsx
```

- [ ] **Step 8: Run the tests to verify they pass, and hold the coverage floor**

```bash
cd /Users/kody/Code/patina-merged
pnpm --filter @patina/client-portal test -- src/components/letter src/app/api/auth/invite src/app/auth/invite
# Then the whole suite WITH coverage — the floor (70/60/70/70) is enforced and a
# single untested new file tips it.
pnpm --filter @patina/client-portal test
pnpm --filter @patina/client-portal type-check
```

Expected: all suites pass; the coverage summary stays at or above 70/60/70/70. If a threshold fails, add the missing test — do not lower the threshold.

- [ ] **Step 9: Commit**

```bash
cd /Users/kody/Code/patina-merged
git add apps/client-portal/src/components/letter \
        apps/client-portal/src/app/api/auth/invite \
        "apps/client-portal/src/app/auth/invite/[token]"
git commit -m "feat(client): the token page becomes page two of the letter — no password, mint on POST"
```

---

## Task 9 — The frozen byline on the first standing note (Lane L3)

**Files:**
- Modify: `packages/supabase/src/hooks/use-project-notes.ts` (`ProjectNote` L18-27 · `toProjectNote` L29-40)
- Modify: `apps/client-portal/src/lib/threshold/derive.ts` (`ThresholdNote` L96-104 · `NoteModel` L239-244 · standing-note map L592-598)
- Modify: `apps/client-portal/src/components/threshold/threshold.tsx` (`toThresholdNote` L233-243)
- Modify: `apps/client-portal/src/components/threshold/the-note.tsx` (`signatureOf` L45-56 · `TheNoteProps` L64-82 · render L98)
- Test: `apps/client-portal/src/components/threshold/__tests__/the-note-byline.test.tsx`
- Test: `apps/client-portal/src/lib/threshold/__tests__/derive-note-byline.test.ts`

**Interfaces:**
- Consumes: `project_notes.author_byline` (Task 1); the byline written at send (Task 3).
- Produces: `ProjectNote.authorByline: string | null`; `ThresholdNote.byline?: string | null`; `NoteModel.byline?: string | null`.

- [ ] **Step 1: Write the failing tests**

Create `apps/client-portal/src/components/threshold/__tests__/the-note-byline.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { TheNote } from '../the-note';

const NOTE = {
  id: 'n1',
  body: 'Dave — the drawings are in.',
  sentAt: '2026-09-08T14:00:00.000Z',
  enclosures: [],
};

it('R8 — a frozen byline signs the note, not the live studio name', () => {
  render(
    <TheNote
      note={{ ...NOTE, byline: 'Leah Hartwell · Middle West Studio · 8 September' }}
      earlier={[]}
      enclosures={[]}
      // The studio renamed itself after the letter went. The note must not
      // silently relabel itself.
      authorName="Hartwell & Co."
      studioName="Hartwell & Co."
      today={new Date('2026-09-09T00:00:00.000Z')}
    />,
  );
  expect(screen.getByTestId('note-signature')).toHaveTextContent(
    'Leah Hartwell · Middle West Studio · 8 September',
  );
  expect(screen.getByTestId('note-signature').textContent).not.toContain('Hartwell & Co.');
});

it('falls back to live resolution for every note written before the letter', () => {
  render(
    <TheNote
      note={NOTE}
      earlier={[]}
      enclosures={[]}
      authorName="Local Dev Studio"
      studioName="Local Dev Studio"
      today={new Date('2026-09-09T00:00:00.000Z')}
    />,
  );
  expect(screen.getByTestId('note-signature')).toHaveTextContent(
    'Local Dev Studio · Local Dev Studio · 8 September',
  );
});

it('a blank byline is no byline — it never prints an empty signature', () => {
  render(
    <TheNote
      note={{ ...NOTE, byline: '   ' }}
      earlier={[]}
      enclosures={[]}
      authorName={null}
      studioName={null}
      today={new Date('2026-09-09T00:00:00.000Z')}
    />,
  );
  expect(screen.queryByTestId('note-signature')).toBeNull();
});
```

Create `apps/client-portal/src/lib/threshold/__tests__/derive-note-byline.test.ts`:

```ts
import { deriveThreshold } from '../derive';

const BASE = {
  rooms: [],
  selections: null,
  proposals: { signatureGates: [], instrumentReceipts: [] },
  invoices: [],
  approvals: [],
  previousReadAt: null,
  today: new Date('2026-09-09T00:00:00.000Z'),
};

it('carries the frozen byline onto the standing note', () => {
  const model = deriveThreshold({
    ...BASE,
    notes: [
      {
        id: 'n1',
        body: 'Dave — the drawings are in.',
        state: 'standing' as const,
        sentAt: '2026-09-08T14:00:00.000Z',
        retiredAt: null,
        enclosures: [],
        byline: 'Leah Hartwell · Middle West Studio · 8 September',
      },
    ],
  });
  expect(model.note?.byline).toBe('Leah Hartwell · Middle West Studio · 8 September');
});

it('leaves the byline undefined for a note that never carried one', () => {
  const model = deriveThreshold({
    ...BASE,
    notes: [
      {
        id: 'n1',
        body: 'A later note.',
        state: 'standing' as const,
        sentAt: '2026-09-08T14:00:00.000Z',
        retiredAt: null,
        enclosures: [],
      },
    ],
  });
  expect(model.note?.byline ?? null).toBeNull();
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
cd /Users/kody/Code/patina-merged
pnpm --filter @patina/client-portal test -- src/components/threshold/__tests__/the-note-byline.test.tsx src/lib/threshold/__tests__/derive-note-byline.test.ts
```

Expected: FAIL — the signature reads `Hartwell & Co. · …` and `model.note.byline` is undefined.

- [ ] **Step 3: Thread the byline through the hook**

In `packages/supabase/src/hooks/use-project-notes.ts`, add to `ProjectNote` (L18-27):

```ts
  /**
   * 00581. The signature frozen when the note was written — "Leah Hartwell ·
   * Middle West Studio · 8 September". Null on every note written before The
   * First Letter, and on every note a studio member writes by hand; those still
   * sign with the live studio name. When it is set it WINS, because a studio
   * that renames itself must not silently relabel a letter it sent last month.
   */
  authorByline: string | null;
```

and to `toProjectNote` (L29-40):

```ts
    authorByline: row.author_byline ?? null,
```

- [ ] **Step 4: Thread it through derive and the threshold**

In `apps/client-portal/src/lib/threshold/derive.ts`:

```ts
// ThresholdNote (L96-104)
  /** 00581 — the signature frozen at write time. Wins over live resolution. */
  byline?: string | null;

// NoteModel (L239-244)
  byline?: string | null;

// the standing-note map (L592-598)
  const note: NoteModel | null = standing
    ? {
        id: standing.id,
        body: standing.body,
        sentAt: standing.sentAt,
        byline: standing.byline ?? null,
        enclosures: standing.enclosures ?? [],
      }
    : null;
```

In `apps/client-portal/src/components/threshold/threshold.tsx`, `toThresholdNote` (L233-243):

```ts
    byline: note.authorByline,
```

- [ ] **Step 5: Prefer the frozen byline in `TheNote`**

In `apps/client-portal/src/components/threshold/the-note.tsx`, replace the signature computation at L98:

```tsx
  // R8 — a frozen byline is the whole signature, already dated and already
  // naming the studio as it stood the day the note was written. Live
  // resolution is the fallback for every note that carries none.
  const frozen = note.byline?.trim();
  const signature = frozen || signatureOf(authorName, studioName, note.sentAt);
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd /Users/kody/Code/patina-merged
pnpm --filter @patina/client-portal test -- src/components/threshold src/lib/threshold
pnpm --filter @patina/supabase test
```

Expected: all pass, including the existing threshold and derive suites (the byline is additive and optional).

- [ ] **Step 7: Gate — a `packages/supabase` change means the admin build**

```bash
cd /Users/kody/Code/patina-merged
pnpm --filter @patina/supabase type-check
pnpm --filter @patina/client-portal type-check
pnpm --filter @patina/client-portal test
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/admin-portal build
```

- [ ] **Step 8: Commit**

```bash
cd /Users/kody/Code/patina-merged
git add packages/supabase/src/hooks/use-project-notes.ts \
        apps/client-portal/src/lib/threshold/derive.ts \
        apps/client-portal/src/components/threshold/threshold.tsx \
        apps/client-portal/src/components/threshold/the-note.tsx \
        apps/client-portal/src/components/threshold/__tests__/the-note-byline.test.tsx \
        apps/client-portal/src/lib/threshold/__tests__/derive-note-byline.test.ts
git commit -m "feat(client): the first note signs with the byline it was written under"
```

---

## Task 10 — The designer's account of it (Lane L4)

**Files:**
- Create: `packages/supabase/src/hooks/use-client-invitation-status.ts`
- Modify: `packages/supabase/src/hooks/index.ts` (export the hook and its types)
- Create: `apps/designer-portal/src/components/document/people/directory/client-letter-line.tsx`
- Create: `apps/designer-portal/src/components/document/people/directory/__tests__/client-letter-line.test.tsx`
- Modify: `apps/designer-portal/src/components/document/people/views/directory-view.tsx` (the `<PersonRow>` `<li>` at L546-565)

**Interfaces:**
- Consumes: `public.client_invitation_status(uuid)` (Task 1); `POST /api/clients/invite/resend` (Task 4); `PeopleDirectoryRow.person_id`, which **is** `designer_clients.id` for a client row (verified: `00420_people_directory_studio_scope_and_client_read.sql:86` — `dc.id AS person_id`).
- Produces:

```ts
export type ClientInvitationState = 'sent' | 'opened' | 'accepted' | 'lapsed';
export interface ClientInvitationStatus {
  state: ClientInvitationState;
  at: string | null;
  invitationId: string;
}
export function useClientInvitationStatus(
  designerClientId: string | undefined,
): UseQueryResult<ClientInvitationStatus | null>;
export const clientInvitationStatusKeys: {
  all: readonly ['client-invitation-status'];
  one: (id: string) => readonly ['client-invitation-status', string];
};

// client-letter-line.tsx
export function rowCopy(status: ClientInvitationStatus | null): {
  text: string;
  action: 'write-again' | 'write-to' | null;
};
export function ClientLetterLine(props: {
  designerClientId: string;
  clientName: string | null;
}): JSX.Element | null;
```

- [ ] **Step 1: Write the failing tests**

Create `apps/designer-portal/src/components/document/people/directory/__tests__/client-letter-line.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClientLetterLine, rowCopy } from '../client-letter-line';

let status: unknown = null;
let flagValue = { value: true, isLoading: false };

jest.mock('@/hooks/use-feature-flag', () => ({ useFeatureFlag: () => flagValue }));
jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  useClientInvitationStatus: () => ({ data: status, isLoading: false }),
}));

describe('R9 / lens-4 §B.8 — dated prose, never a badge and never an absence', () => {
  it('names the four states', () => {
    expect(rowCopy({ state: 'sent', at: '2026-09-08T14:00:00.000Z', invitationId: 'i1' })).toEqual({
      text: 'Letter sent 8 Sept',
      action: null,
    });
    expect(rowCopy({ state: 'opened', at: '2026-09-09T14:00:00.000Z', invitationId: 'i1' })).toEqual({
      text: 'Opened 9 Sept',
      action: null,
    });
    expect(rowCopy({ state: 'accepted', at: '2026-09-09T14:00:00.000Z', invitationId: 'i1' })).toEqual({
      text: 'Signed in 9 Sept',
      action: null,
    });
    expect(rowCopy({ state: 'lapsed', at: '2026-09-15T14:00:00.000Z', invitationId: 'i1' })).toEqual({
      text: 'Link lapsed 15 Sept',
      action: 'write-again',
    });
  });

  it('names the state where no letter was ever written', () => {
    expect(rowCopy(null)).toEqual({
      text: 'On your roster · no letter sent',
      action: 'write-to',
    });
  });

  it('never phrases a state as an absence or a duration', () => {
    for (const state of ['sent', 'opened', 'accepted', 'lapsed'] as const) {
      const { text } = rowCopy({ state, at: '2026-09-08T14:00:00.000Z', invitationId: 'i1' });
      expect(text).not.toMatch(/hasn't|has not|not yet|still|days ago|ago/i);
    }
  });
});

describe('ClientLetterLine', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    flagValue = { value: true, isLoading: false };
  });

  it('renders nothing while the flag is still answering', () => {
    flagValue = { value: false, isLoading: true };
    status = { state: 'sent', at: '2026-09-08T14:00:00.000Z', invitationId: 'i1' };
    const { container } = render(<ClientLetterLine designerClientId="dc1" clientName="Dave Okonkwo" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing at all when the flag is off', () => {
    flagValue = { value: false, isLoading: false };
    status = { state: 'sent', at: '2026-09-08T14:00:00.000Z', invitationId: 'i1' };
    const { container } = render(<ClientLetterLine designerClientId="dc1" clientName="Dave Okonkwo" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('prints the dated line with no pill, dot or colour', () => {
    status = { state: 'sent', at: '2026-09-08T14:00:00.000Z', invitationId: 'i1' };
    render(<ClientLetterLine designerClientId="dc1" clientName="Dave Okonkwo" />);
    const line = screen.getByTestId('client-letter-line');
    expect(line).toHaveTextContent('Letter sent 8 Sept');
    expect(line.querySelector('svg')).toBeNull();
    expect(line.className).not.toMatch(/rounded-full|bg-(red|green|amber)/);
  });

  it('offers Write again beside a lapsed link, and resends once', async () => {
    status = { state: 'lapsed', at: '2026-09-15T14:00:00.000Z', invitationId: 'i1' };
    render(<ClientLetterLine designerClientId="dc1" clientName="Dave Okonkwo" />);
    const button = screen.getByRole('button', { name: 'Write again' });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/clients/invite/resend');
    expect(JSON.parse(init.body)).toEqual({ invitationId: 'i1' });
  });

  it('R10 — says how long to wait rather than pretending it worked', async () => {
    status = { state: 'lapsed', at: '2026-09-15T14:00:00.000Z', invitationId: 'i1' };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'too_soon' }),
    });
    render(<ClientLetterLine designerClientId="dc1" clientName="Dave Okonkwo" />);
    fireEvent.click(screen.getByRole('button', { name: 'Write again' }));
    expect(
      await screen.findByText('A letter went out within the hour. You can write again after that.'),
    ).toBeInTheDocument();
  });

  it('says the letter went, without a badge', async () => {
    status = { state: 'lapsed', at: '2026-09-15T14:00:00.000Z', invitationId: 'i1' };
    render(<ClientLetterLine designerClientId="dc1" clientName="Dave Okonkwo" />);
    fireEvent.click(screen.getByRole('button', { name: 'Write again' }));
    expect(await screen.findByText('A fresh letter is on its way.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/kody/Code/patina-merged
pnpm --filter @patina/designer-portal test -- src/components/document/people/directory/__tests__/client-letter-line.test.tsx
```

Expected: FAIL — `Cannot find module '../client-letter-line'`.

- [ ] **Step 3: Write the hook**

Create `packages/supabase/src/hooks/use-client-invitation-status.ts`:

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

export type ClientInvitationState = 'sent' | 'opened' | 'accepted' | 'lapsed';

export interface ClientInvitationStatus {
  state: ClientInvitationState;
  /** When the state happened. Never a duration — the row prints a date. */
  at: string | null;
  invitationId: string;
}

export const clientInvitationStatusKeys = {
  all: ['client-invitation-status'] as const,
  one: (id: string) => ['client-invitation-status', id] as const,
};

/**
 * The one read a designer needs to see her own letter's state (00581).
 *
 * It goes through a SECURITY DEFINER RPC rather than a client-side join
 * because notification_log's policies are ADDRESSEE-scoped — 00562 grants the
 * opened-mark to the person the mail was addressed TO, not to the studio that
 * sent it — so a join under the designer's own JWT would silently answer
 * nothing. The function is scoped to the caller's own invitations.
 *
 * Returns null when no letter has ever been written for this household. That is
 * a real state with its own copy, not an error.
 */
export function useClientInvitationStatus(designerClientId: string | undefined) {
  return useQuery({
    queryKey: clientInvitationStatusKeys.one(designerClientId ?? ''),
    queryFn: async (): Promise<ClientInvitationStatus | null> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('client_invitation_status', {
        p_designer_client_id: designerClientId as string,
      });
      if (error) throw error;
      const row = (data as ClientInvitationStatus[] | null)?.[0];
      return row ?? null;
    },
    enabled: !!designerClientId,
  });
}
```

Export it from `packages/supabase/src/hooks/index.ts` alongside the other client hooks (near the `use-clients` re-exports at L273-274):

```ts
export {
  useClientInvitationStatus,
  clientInvitationStatusKeys,
  type ClientInvitationState,
  type ClientInvitationStatus,
} from './use-client-invitation-status';
```

- [ ] **Step 4: Write the row line**

Create `apps/designer-portal/src/components/document/people/directory/client-letter-line.tsx`:

```tsx
'use client';

/**
 * R9 — the four row states, as dated prose.
 *
 * This is a SIBLING of PersonRow inside the directory's <li>, never a child of
 * it: PersonRow is a <button>, and "Write again" is a second button, which no
 * browser will nest. It also keeps person-row.tsx presentational, as its own
 * docblock requires.
 *
 * The constraints, from R9 and the portal-polish DECLINE table: never phrased
 * as an absence ("hasn't opened it yet"), never as a duration ("3 days ago"),
 * never on a client surface, and no pills, dots, colour fills or ✓ glyphs.
 * Where we do not know, the row says nothing rather than guessing — the
 * ambiguous-send gap (an unreadable 2xx writes status='failed' with a NULL
 * provider_id, which the Resend webhook can never match) means some sends are
 * genuinely unknowable, and "Delivered ✓" on one of those would be a lie.
 */

import { useCallback, useRef, useState } from 'react';
import {
  useClientInvitationStatus,
  type ClientInvitationStatus,
} from '@patina/supabase';
import { useFeatureFlag } from '@/hooks/use-feature-flag';

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'June',
  'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec',
];

/** "8 Sept" — the date it happened, in the studio's own shorthand. */
export function shortDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`;
}

export function rowCopy(status: ClientInvitationStatus | null): {
  text: string;
  action: 'write-again' | 'write-to' | null;
} {
  if (!status) {
    return { text: 'On your roster · no letter sent', action: 'write-to' };
  }
  const when = shortDate(status.at);
  switch (status.state) {
    case 'opened':
      return { text: `Opened ${when}`, action: null };
    // "Signed in", not "Accepted": accepting is a system's word for a thing a
    // person experienced as opening her own house.
    case 'accepted':
      return { text: `Signed in ${when}`, action: null };
    // "Lapsed", not "Expired" or "Failed" — nothing failed, and the remedy sits
    // next to it.
    case 'lapsed':
      return { text: `Link lapsed ${when}`, action: 'write-again' };
    case 'sent':
    default:
      return { text: `Letter sent ${when}`, action: null };
  }
}

export function ClientLetterLine({
  designerClientId,
  clientName,
}: {
  designerClientId: string;
  clientName: string | null;
}) {
  const { value: letterOn, isLoading: flagLoading } = useFeatureFlag('client-invite-letter');
  const { data: status, isLoading } = useClientInvitationStatus(
    letterOn ? designerClientId : undefined,
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  // One in flight, mirroring the studio-member resend guard
  // (account-studio-page.tsx:490-520).
  const inFlight = useRef(false);

  const writeAgain = useCallback(
    async (invitationId: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setFeedback(null);
      try {
        const res = await fetch('/api/clients/invite/resend', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invitationId }),
        });
        if (res.status === 429) {
          setFeedback('A letter went out within the hour. You can write again after that.');
        } else if (!res.ok) {
          setFeedback('Could not send it just now.');
        } else {
          setFeedback('A fresh letter is on its way.');
        }
      } catch {
        setFeedback('Could not send it just now.');
      } finally {
        inFlight.current = false;
      }
    },
    [],
  );

  // Fail-closed: nothing renders until the flag resolves, so a non-pilot studio
  // never sees a letter line flash past.
  if (flagLoading || !letterOn || isLoading) return null;

  const { text, action } = rowCopy(status ?? null);
  const given = (clientName ?? '').trim().split(/\s+/)[0] || null;

  return (
    <p
      data-testid="client-letter-line"
      className="mt-1 pl-[3.25rem] text-[0.7rem] leading-snug text-[var(--color-aged-oak)]"
    >
      {text}
      {action === 'write-again' && status ? (
        <>
          {' · '}
          <button
            type="button"
            onClick={() => void writeAgain(status.invitationId)}
            className="min-h-11 underline underline-offset-4"
          >
            Write again
          </button>
        </>
      ) : null}
      {action === 'write-to' && given ? (
        <>
          {' · '}
          <span className="text-[var(--color-mocha)]">{`Write to ${given}`}</span>
        </>
      ) : null}
      {feedback ? <span className="ml-2 text-[var(--color-mocha)]">{feedback}</span> : null}
    </p>
  );
}
```

- [ ] **Step 5: Hang it under the client rows**

In `apps/designer-portal/src/components/document/people/views/directory-view.tsx`, add the import beside the others (L60) and render the line as a sibling inside the `<li>` (L548-564):

```tsx
import { ClientLetterLine } from '../directory/client-letter-line';
```

```tsx
              <li
                key={`${p.role}:${p.person_id}`}
                ref={p.person_id === highlightPersonId ? highlightRef : undefined}
              >
                <PersonRow
                  person={p}
                  now={now}
                  onOpen={() => openPerson(p.person_id, p.role)}
                  highlighted={p.person_id === highlightPersonId}
                  rolodexMarker={
                    callSheetOn &&
                    scope === 'mine' &&
                    isFieldRosterRole(p.role) &&
                    hasRolodexMatch(p, rolodexContactIds, rolodexKeys)
                  }
                />
                {/* R9 — the letter's own line, outside the row's <button> so
                    "Write again" is not a button inside a button. person_id IS
                    designer_clients.id on a client row (00420:86). */}
                {p.role === 'client' ? (
                  <ClientLetterLine
                    designerClientId={p.person_id}
                    clientName={p.display_name ?? null}
                  />
                ) : null}
              </li>
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd /Users/kody/Code/patina-merged
pnpm --filter @patina/designer-portal test -- src/components/document/people/directory/__tests__/client-letter-line.test.tsx
pnpm --filter @patina/designer-portal test -- src/components/document/people
```

Expected: the new suite passes and the existing People suites stay green.

- [ ] **Step 7: Gate**

```bash
cd /Users/kody/Code/patina-merged
pnpm --filter @patina/supabase type-check
pnpm --filter @patina/supabase test
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal lint
pnpm --filter @patina/admin-portal build
```

- [ ] **Step 8: Commit**

```bash
cd /Users/kody/Code/patina-merged
git add packages/supabase/src/hooks/use-client-invitation-status.ts \
        packages/supabase/src/hooks/index.ts \
        apps/designer-portal/src/components/document/people/directory/client-letter-line.tsx \
        apps/designer-portal/src/components/document/people/directory/__tests__/client-letter-line.test.tsx \
        apps/designer-portal/src/components/document/people/views/directory-view.tsx
git commit -m "feat(people): four dated row states for the letter, and one tap to write again"
```

---

## Task 11 — Integration: the full gates, the e2e, and the blacklist

**Files:**
- Create: `apps/designer-portal/e2e/helpers/mailpit.ts`
- Create: `apps/designer-portal/e2e/people/add-client-letter.spec.ts`
- Modify: `apps/designer-portal/playwright.config.ts` (`webServer.env.NEXT_PUBLIC_FLAG_OVERRIDES`, L104-105)

**Interfaces:**
- Consumes: everything from Tasks 1–10.
- Produces: the evidence Task 12's deploy rests on.

- [ ] **Step 1: Merge every lane onto one branch and confirm the checkout**

```bash
cd /Users/kody/Code/patina-merged
git rev-parse --show-toplevel
git status --short
pnpm install
```

- [ ] **Step 2: Re-check the migration number against the branch tip**

```bash
cd /Users/kody/Code/patina-merged
ls supabase/migrations | tail -5
```

If a concurrent program has taken `00581`, renumber **your** file (filename **and** the internal banner number) — never something already applied to prod — and update Task 12's `db push` note.

- [ ] **Step 3: Pin the flag into Playwright's own server**

In `apps/designer-portal/playwright.config.ts` (L104-105):

```ts
      NEXT_PUBLIC_FLAG_OVERRIDES:
        'procurement-workspace-pilot:true,the-document-pilot:true,client-invite-letter:true',
```

This value **beats** `.env.local` and reaches only the server Playwright starts. A reused dev server started without it serves the letter off and the spec will fail mysteriously — kill any running `next dev` and let Playwright boot its own.

- [ ] **Step 4: Write the Mailpit helper**

Create `apps/designer-portal/e2e/helpers/mailpit.ts`:

```ts
/**
 * The local mail catcher is Mailpit on :54324 despite config.toml's deprecated
 * [inbucket] block — its API is /api/v1/*, not Inbucket's.
 */
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

export interface MailpitSummary {
  ID: string;
  From: { Name: string; Address: string };
  To: Array<{ Name: string; Address: string }>;
  Subject: string;
}

export async function deleteAllMessages(): Promise<void> {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' });
}

export async function listMessagesTo(address: string): Promise<MailpitSummary[]> {
  const res = await fetch(`${MAILPIT}/api/v1/messages?limit=200`);
  const body = (await res.json()) as { messages?: MailpitSummary[] };
  return (body.messages ?? []).filter((m) =>
    (m.To ?? []).some((t) => t.Address.toLowerCase() === address.toLowerCase()),
  );
}

export async function messageBody(id: string): Promise<{ HTML: string; Text: string }> {
  const res = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  return (await res.json()) as { HTML: string; Text: string };
}
```

- [ ] **Step 5: Write the e2e spec**

Create `apps/designer-portal/e2e/people/add-client-letter.spec.ts`:

```ts
import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';
import { deleteAllMessages, listMessagesTo, messageBody } from '../helpers/mailpit';

/**
 * The assertion this spec exists for is EXACTLY ONE message. generateLink is
 * the "generate, don't send" endpoint — the in-repo proof is designer-invite,
 * which would otherwise double-mail every designer it onboards — but a two-
 * letter first touch is an embarrassing way to learn that, so it is a one-line
 * assertion here rather than a comment somewhere.
 *
 * Chromium-pinned: this seeds and mutates rows for one shared seeded designer,
 * and Playwright's three browser projects run in parallel as the same user.
 */
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'single-actor: the three browser projects would race the same seeded designer',
);

test('a letter goes to a new client, and only one', async ({ authenticatedPage: page }) => {
  const stamp = Date.now();
  const email = `dave.${stamp}@okonkwo.test`;
  await deleteAllMessages();

  await page.goto('/people');
  await page.getByRole('button', { name: /Add someone/i }).click();
  await page.getByRole('button', { name: 'a client' }).click();
  await page.getByLabel('Full name (optional)').fill('Dave Okonkwo');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('A line for Dave').fill('Dave — the drawings are in.');
  await page.getByRole('button', { name: 'ADD AND SEND THE LETTER' }).click();

  await expect(
    page.getByText(`Dave Okonkwo is on your roster. Your letter is on its way to ${email}.`),
  ).toBeVisible();

  // The send is asynchronous; poll rather than trusting networkidle, which can
  // fire before the write and the send have landed.
  await expect
    .poll(async () => (await listMessagesTo(email)).length, { timeout: 20_000 })
    .toBe(1);

  const [msg] = await listMessagesTo(email);
  // R1 — the studio leads and "via" discloses the relay.
  expect(msg.From.Name).toContain('via Patina');
  // R3 — the subject names the person, and never Patina.
  expect(msg.Subject).toContain('Dave');
  expect(msg.Subject).not.toMatch(/patina/i);
  expect(msg.Subject).not.toMatch(/you're invited/i);

  const body = await messageBody(msg.ID);
  expect(body.HTML).toContain('Dave — the drawings are in.');
  // PP-1 — Patina appears exactly once, in the colophon.
  expect((body.HTML.match(/Patina/g) ?? []).length).toBe(1);
  expect(body.HTML).toContain('Sent through Patina');
  // The CTA is OUR token, not a 60-minute GoTrue link.
  expect(body.HTML).toContain('/auth/invite/');
  expect(body.HTML).not.toContain('/auth/v1/verify');
  // The plain-text part is mandatory on a cold first touch.
  expect(body.Text.length).toBeGreaterThan(0);
});

test('the roster still works with no letter, and nothing is sent', async ({
  authenticatedPage: page,
}) => {
  const stamp = Date.now();
  const email = `quiet.${stamp}@okonkwo.test`;
  await deleteAllMessages();

  await page.goto('/people');
  await page.getByRole('button', { name: /Add someone/i }).click();
  await page.getByRole('button', { name: 'a client' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Send them the letter').uncheck();
  await page.getByRole('button', { name: 'ADD TO YOUR PEOPLE' }).click();

  await expect(page.getByText(`${email} is on your roster. Nothing was sent.`)).toBeVisible();
  await expect.poll(async () => (await listMessagesTo(email)).length, { timeout: 8_000 }).toBe(0);
});
```

- [ ] **Step 6: Run the vocabulary grep**

The blacklist is a build step, not a memory. Run it and read every hit:

```bash
cd /Users/kody/Code/patina-merged
# Homeowner-facing surfaces only: the letter, page two, and the client portal.
grep -rniE "gate|[^a-z]task|dashboard|\bAI\b|overdue|welcome|accept|collaborate|workspace|magic-link|invit" \
  supabase/functions/_shared/client-letter.ts \
  apps/client-portal/src/components/letter \
  "apps/client-portal/src/app/auth/invite/[token]/page.tsx" \
  | grep -vE "^\S+: *(//|\*|/\*)"
```

Expected hits, and **only** these:
- `letterSubject` — `invited you to the …` (R3's one ruled exception)
- `/auth/invite/${token}` and `/api/auth/invite/*` (URL paths, which no human reads)
- `client_invitations` column names in the page's `SNAPSHOT_COLUMNS`

Any other hit is a violation — fix the copy, not the grep. Then confirm the designer's side is clean of the retired words:

```bash
grep -rniE "magic-link|invite to Patina" \
  apps/designer-portal/src/components/document/people/directory/letter-line-field.tsx \
  apps/designer-portal/src/components/document/people/directory/client-letter-line.tsx
```

Expected: no output.

- [ ] **Step 7: Confirm the flag-off path is byte-identical to today**

```bash
cd /Users/kody/Code/patina-merged
git diff main --stat -- apps/designer-portal/src/app/api/clients/invite/route.ts
git diff main -- apps/designer-portal/src/app/api/clients/invite/route.ts | grep '^-' | grep -v '^---'
```

Expected: no removed line inside today's L115-243. The letter path is additive.

- [ ] **Step 8: Confirm no `_shared` fan-out**

```bash
cd /Users/kody/Code/patina-merged
git diff main --stat -- supabase/functions/_shared/
```

Expected: `client-letter.ts`, `client-letter.test.ts` and the snapshot only. **If `branded-email.ts` or `send-email.ts` appears, stop** — that change forces redeploying ~21 functions and is out of scope for this build.

```bash
grep -rl "_shared/client-letter" supabase/functions --include=index.ts
```

Expected: only `supabase/functions/client-invite/index.ts`.

- [ ] **Step 9: Run every gate**

```bash
cd /Users/kody/Code/patina-merged

# DB
pnpm supabase:reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
  -f supabase/tests/client_invite/letter_snapshot_test.sql
export SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
pnpm db:generate && git diff --exit-code packages/supabase/src/database.types.ts

# Edge functions
deno test --allow-all --config supabase/functions/deno.json \
  supabase/functions/client-invite/ supabase/functions/_shared/client-letter.test.ts
# The shell golden snapshot for the OTHER shell must be untouched.
deno test --allow-all --config supabase/functions/deno.json \
  supabase/functions/_shared/branded-email.test.ts
test -f deno.lock && echo "STRAY ROOT deno.lock — delete it" || echo "no stray lockfile"

# Shared package
pnpm --filter @patina/supabase type-check
pnpm --filter @patina/supabase test

# Portals
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal test
pnpm --filter @patina/designer-portal lint
pnpm --filter @patina/client-portal type-check
pnpm --filter @patina/client-portal test
# THE strictest gate in the repo — mandatory after a packages/supabase change.
pnpm --filter @patina/admin-portal build
```

Expected: every command exits 0; `db:generate` leaves no diff; the client-portal coverage summary is at or above 70/60/70/70; `branded-email.test.ts` passes unchanged (proof the shared shell was not touched).

Note what these do **not** prove: root `pnpm test` / `pnpm type-check` silently skip workspaces with no such script, so only the `--filter` runs above count. designer-portal `lint` is the only ESLint config in the repo that resolves; do not report any other package's lint as clean.

- [ ] **Step 10: Run the e2e**

Kill any running dev server first — a reused one lacks the pinned flag.

```bash
cd /Users/kody/Code/patina-merged
pkill -f "next dev" || true
pnpm --filter @patina/designer-portal test:e2e -- e2e/people/add-client-letter.spec.ts
```

Expected: 2 passed (chromium), 4 skipped (firefox/webkit).

**Post-ship correction (2026-09-09):** the spec as originally written asserted the letter's contents by reading it out of Mailpit — a plan defect. The letter is sent through `sendCompliantEmail` → Resend HTTPS (`supabase/functions/_shared/send-email.ts`), never SMTP, so Mailpit can never hold it, and the subject assertion named the client's first name where `letterSubject()` (R3) names the designer and the project instead. The corrected spec adds the client through the UI with the flag on, then asserts against the frozen `client_invitations` snapshot row via the local Supabase service-role client (`adminDb`, `apps/designer-portal/e2e/helpers/supabase-admin.ts`): exactly one row for the email with `kind='invite'`, `rendered_subject` containing the designer's full name and never containing "Patina", and `personal_message` equal to the typed note — with Mailpit narrowed to a single negative check, that zero GoTrue messages land for that address, proving `admin.auth.admin.generateLink` (the 'invite' branch's account-minting call) discards its `action_link` rather than also mailing it.

- [ ] **Step 11: Drive the letter by hand, with the mock fallback off**

`withMockData()` silently serves mock data on any thrown error, so a rendered screen proves nothing in `auto` mode.

```bash
cd /Users/kody/Code/patina-merged
NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live \
NEXT_PUBLIC_FLAG_OVERRIDES=client-invite-letter:true \
pnpm dev:minimal
```

Then, by hand: add a client with a line → read the letter in Mailpit at `http://127.0.0.1:54324` → click its button → confirm the token page shows the same letterhead and the same standing sentence, word for word → click `Open the project` → confirm you land signed in at `/` with the note standing on the Threshold under its frozen byline → return to `/people` and confirm the row reads `Letter sent {d}`.

Then confirm the mint-on-POST guard by hand, which is the one thing no test above can prove end to end:

```bash
# A GET on the token page must NOT consume the token — this is what mail
# scanners do. Fetch it twice and check accepted_at is still NULL.
curl -s -o /dev/null "http://localhost:3002/auth/invite/<token>"
curl -s -o /dev/null "http://localhost:3002/auth/invite/<token>"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "select token, accepted_at from public.client_invitations where token = '<token>';"
```

Expected: `accepted_at` is still NULL after two GETs.

- [ ] **Step 12: Commit and push**

```bash
cd /Users/kody/Code/patina-merged
git add apps/designer-portal/e2e/helpers/mailpit.ts \
        apps/designer-portal/e2e/people/add-client-letter.spec.ts \
        apps/designer-portal/playwright.config.ts
git commit -m "test(e2e): the letter goes out, and only one letter goes out"
git push -u origin HEAD
```

---

## Task 12 — Deploy (**ONE-WAY** — requires an explicit ship request in-session)

**Files:** none. This task runs commands.

**Interfaces:** consumes a green Task 11.

**GATE.** Every command below is a prod mutation and requires an explicit user request in the current session. If the user said "ship the First Letter", the whole chain is authorized — do not re-ask per step. Absent that ask, stop after Task 11 and ask.

The order is fixed House law and is not negotiable: **① migrations → ② edge functions → ③ portals → ④ flag → ⑤ verify.** A portal or function that reaches for a column not yet migrated fails closed.

- [ ] **Step 1: Pre-flight**

```bash
cd /Users/kody/Code/patina-merged
# The CLI is linked to Strata; confirm it, do not assume it.
cat supabase/.temp/project-ref     # expect: bkvcixdmuyejfzcijpdg
# No numbering collision with anything already applied to prod.
supabase migration list
# The type gate the portal builds do NOT enforce.
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/client-portal type-check
```

- [ ] **Step 2: ① Migration → Strata**

```bash
cd /Users/kody/Code/patina-merged
supabase db push
```

Then **probe the objects, not the ledger** — a ledger row can be inserted by a raw psql apply:

```sql
select column_name from information_schema.columns
 where table_schema='public' and table_name='client_invitations'
   and column_name in ('designer_client_id','kind','rendered_standing_sentence',
                       'email_log_id','resend_count','signer_id');
select column_name from information_schema.columns
 where table_schema='public' and table_name='project_notes' and column_name='author_byline';
select proname from pg_proc where proname = 'client_invitation_status';
```

Expected: six columns, one column, one function.

- [ ] **Step 3: ② Edge function → Strata**

Only `client-invite` changed. `_shared/client-letter.ts` is new and has exactly one importer, so **no fan-out redeploy is needed** — confirm that before deploying:

```bash
cd /Users/kody/Code/patina-merged
grep -rl "_shared/client-letter" supabase/functions --include=index.ts   # expect: client-invite only
git diff main --stat -- supabase/functions/_shared/branded-email.ts supabase/functions/_shared/send-email.ts
# expect: NO OUTPUT. If either file changed, every importer must be redeployed:
#   grep -rl "_shared/send-email" supabase/functions --include=index.ts
supabase functions deploy client-invite
```

`verify_jwt` stays true, so no `--no-verify-jwt` flag.

- [ ] **Step 4: ③ Portals → Cloudflare Workers**

`./infra/deploy-portal.sh` is the ONLY correct path — a raw `opennextjs-cloudflare build` bypasses Turborepo's `^build` graph and can bundle a stale workspace dist (that mechanism shipped `TypeError: proposalTierVisibility is not a function` to prod).

```bash
cd /Users/kody/Code/patina-merged
./infra/deploy-portal.sh designer     # ends: "==> Done: designer portal deployed."
./infra/deploy-portal.sh client       # ends: "==> Done: client portal deployed."
```

- [ ] **Step 5: ④ The flag — verify it exists before enabling it**

Create `client-invite-letter` in PostHog (lowercase kebab, no prefix). Then **confirm it reads before turning it on** — enabling a flag that does not resolve is how a fail-closed feature stays invisible while everyone believes it shipped:

```bash
# Read the flag back. Confirm the key exists and its current value.
# (PostHog MCP `exec` → feature-flag commands.)
```

Only once it reads: roll to 100%.

- [ ] **Step 6: ⑤ Verify by behavior, never by version**

```bash
cd /Users/kody/Code/patina-merged
# The list is OLDEST-FIRST. Read the BOTTOM row.
npx wrangler deployments list --name patina-designer-portal
npx wrangler deployments list --name patina-client-portal
```

`/api/version` returns static defaults on the live Workers path and proves nothing about freshness — do not accept it as evidence.

Then the real probe. On Strata, from the live designer portal, add a client at **a Kody-controlled address** with a one-line note:

1. The letter arrives. Confirm the From reads `{Studio} via Patina <hello@patina.cloud>`, the reply-to is the designer's own address, the subject names the person and not Patina, and the letterhead carries the studio with no Patina wordmark above the colophon.
2. The log row exists and the provider took it:

```sql
select nl.id, nl.type, nl.status, nl.provider_id, nl.opened_at
  from public.notification_log nl
  join public.client_invitations ci on ci.email_log_id = nl.id
 where ci.email = '<the address>'
 order by nl.created_at desc limit 1;
```

Expected: `type = 'client_invite_letter'`, `status` in `sent`/`delivered`, a non-null `provider_id`. Cross-check the message in Resend's dashboard.

3. The token page renders the letterhead and the same standing sentence, word for word.
4. Click `Open the project` → land signed in at `/` → the note stands on the Threshold under its frozen byline.
5. Back on `/people`, the row reads `Letter sent {d}`.

```bash
npx wrangler tail patina-client-portal    # no new error spikes
```

- [ ] **Step 7: Report**

State, per unit: what was deployed, the exact command, the authorizing ask, and the evidence — the deployments-list bottom-row timestamp, the object probes, the `notification_log` row, and the Resend delivery. State explicitly what was **not** verified: custom-domain routing (no `routes` exist in any `wrangler.jsonc`; the `patina.cloud` hostnames are dashboard-managed out of band), iOS (the AASA publishes only `/piece/*`, `/invoices/*`, `/proposals/*`, `/decisions/*`, so `/auth/invite/<token>` stays on the web — **leave that alone**; adding `/auth/*` would dead-end the letter inside the app), and the ambiguous-send reconciliation sweep, which is deliberately out of scope.

---

## Self-review

Run against the spec with fresh eyes after the plan was complete.

### 1 · Ruling coverage

| Ruling | Where it lands |
|---|---|
| R1 From + reply-to | Task 2 `senderDisplayName`/`formatFromAddress` + tests; Task 3 `sendLetter`'s `from`/`replyTo`; Task 11 e2e; Task 12 §6 probe |
| R2 PP-1 client surface, additive | Task 2 (new module, `branded-email.ts` untouched); Task 8 `LetterShell`; Task 11 Step 8 fan-out guard |
| R3 lens-4 verbatim + ruled subject | Task 2 `letterSubject`/`standingSentence` + tests |
| R4 note optional, ≤280 | Task 1 CHECK; Task 3 `validateNote`; Task 4 `validateLetterRequest`; Task 5 `counterCopy`/`maxLength` |
| R5 hybrid path | Task 3 `handleSend` (mint, discard, snapshot, `sendCompliantEmail`, `idempotencyKey`) |
| R6 page two, no password, mint on POST | Task 3 `handleAccept`; Task 8 (page, `OpenLetterForm`, deleted password form); Task 11 Step 11 GET probe |
| R7′ full name | Task 2 `signOffLine`; Task 3's byline; Task 8 `LetterShell` |
| R8 seeded note, frozen byline | Task 3 §4; Task 1 `author_byline`; Task 9 |
| R9 four row states | Task 1 `client_invitation_status`; Task 10 `rowCopy` |
| R10 resend, one/hour, lapsed page | Task 3 `/resend` + `/refresh`; Task 4 resend route; Task 8 `StaleLetterForm`; Task 10 `Write again` |
| R11 any writer, owner signs | Task 3 `resolveSigner`; Task 1 `signer_id`/`writer_id` |
| R12 designer-side rename | Task 5 copy fns; Task 6 (sheet); Task 7 (picker, send sheet); Task 4 activity-log line |
| R13 notice letter | Task 3 `kind` handling; Task 2 notice rendering; Task 4 `kind` determination; Task 8 notice branch |

**Every ruling has a task.** No ruling is unimplemented.

### 2 · Three spec gaps found, and how the plan closed them

1. **The standing sentence with a project but no studio.** lens-4 §A.4 gives degradation rules for the who-clause and the to-clause but not for "the studio's record of the job" when no studio exists. The plan drops the word (`The page below holds the record of the job`) rather than naming a studio that is not there — Global Constraint 5. **Flag for Kody: this is an inference, not a ruled string.**
2. **The notice letter's ignore line.** R13 removes the expiry line; nothing rules the colophon line, whose ruled wording ends "and the link lapses on its own" — untrue for a notice. The plan shortens it to `If this isn't for you, nothing happens — ignore it.` **Also an inference.**
3. **Two columns the brief's list does not name.** `rendered_standing_sentence` (R6 demands the page and the email say the same sentence word for word; recomposing it in TypeScript would be a second implementation of a Deno function and would drift) and `recipient_name` (the letterhead's `Prepared for {client}` slot has no column today). Both follow 00388's snapshot precedent. **Deliberate additions, flagged.**

Two further items the spec itself lists as open and this plan does **not** resolve: **Q5** (whose words the callout carries when a junior writes under the owner's signature) — the plan implements R11 literally, the writer's words under the owner's signature with no separate byline, which is one of the two answers Leah has yet to pick; and **the PP-6 V9 amendment**, which R2 says to record and which is not written. Neither blocks L1.

### 3 · Placeholder scan

No "TBD", no "similar to Task N", no "add appropriate error handling". Every code step carries real code; every test step carries real assertions; every gate step names an exact command and its expected output.

### 4 · Type consistency

Checked across tasks: `ClientLetterSnapshot` (Task 2) is what `buildSnapshot` (Task 3) returns and what `resendFrom` reconstructs field-for-field. `LetterSnapshotView` (Task 8) is the portal's own shape, deliberately separate — the Deno module cannot be imported by Next.js — and its fields map one-to-one onto the snapshot columns. `ClientInvitationStatus.state` (Task 10) matches the four `state` values `client_invitation_status` (Task 1) returns. `ProjectNote.authorByline` → `ThresholdNote.byline` → `NoteModel.byline` (Task 9) is one chain with one name at each layer. `letter` / `note` / `projectId` is the same triple in the hook (Task 5), the route body (Task 4), and the function body (Task 3).

One naming hazard worth stating: Task 2 exports `longDate`/`shortDate` in Deno and Task 8 exports its own `longDate` in the client portal, and Task 10 its own `shortDate`. They are three separate implementations of the same two functions because the runtimes cannot share a module. Each has its own test pinning the exact strings (`8 September`, `8 Sept`), which is what stops them drifting.

