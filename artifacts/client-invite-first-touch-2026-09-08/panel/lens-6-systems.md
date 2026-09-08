# Lens 6 — Systems: what it takes

**Lens:** the engineer's. Map the panel's working recommendation onto the codebase and price it honestly. Every claim cites a file. Nothing here is built; nothing here is a ruling.

All paths repo-relative to `/Users/kody/Code/patina-merged`.

---

## 0 · The two facts that decide the architecture

Before the table, two findings that the three paths are really arguing about.

**Fact 1 — the durable thing and the auth thing are different objects, and only one of them can be 7 days.**
Every GoTrue-minted link — `inviteUserByEmail`, `generateLink type=invite`, `generateLink type=magiclink` — expires at `otp_expiry`, which is `3600` seconds (`supabase/config.toml:183`). Supabase's own docs are explicit that this is one shared value: *"Invitation links expire after the duration configured in Email OTP Expiration, which defaults to 1 hour. This is the same value used for email OTPs, magic links, and other email confirmation links"* (`/supabase/supabase`, `guides/auth/users.mdx`). Raising it to seven days raises it for password recovery, email change, and every magic link in three portals. That is not a knob this feature may turn.

The seven-day object already exists and is ours: `client_invitations.expires_at DEFAULT (now() + INTERVAL '7 days')` (`supabase/migrations/00118_client_invitations.sql:13`). So the letter's CTA must point at **our** token, and the GoTrue link must be minted **at click time, not at send time**. Any design that mails a GoTrue link is a 60-minute letter no matter which of the three paths dresses it.

**Fact 2 — `renderBrandedShell` puts the Patina wordmark at the top of client mail, and PP-1 forbids exactly that.**
The shell renders "Patina" (Fraunces 23px) as the header for both audiences; the client/designer switch only changes footer links and drops the tagline (research/02-email-system.md §1, quoting `supabase/functions/_shared/branded-email.ts`: *"Client mail keeps the wordmark and drops the tagline"*). PP-1 says *"No Patina wordmark above the colophon"* on client surfaces (`artifacts/portal-polish-review-2026-09-08/synthesis.md` §3.1). The folder README already flags this as unruled: *"Whether the email shell counts as a 'client surface' under PP-1 is **unruled** — surface as a ruling."* This is the single biggest cost driver in the whole feature and it is orthogonal to (a)/(b)/(c). See §8.

---

## 1 · Three delivery paths

Effort is engineer-days for one competent engineer, split into the **send/auth leg** (what differs) and the **common work** (composer, arrival note, status row, resend, snapshot, tests — what every path needs). Path (b) cannot carry parts of the common work, so its common column is smaller and its "what it cannot do" column is longer.

| | **(a) Revive `client-invite`** | **(b) Enrich the GoTrue path** | **(c) Hybrid — GoTrue mints, we write** |
|---|---|---|---|
| **Shape** | Three hooks route through `supabase/functions/client-invite/index.ts`; swap its raw `fetch` to Resend (`index.ts:171-178`) for `sendCompliantEmail`; landing page calls `resolve_studio_identity`; keep the 7-day token; auth user minted at **accept** time by the password signup in `AcceptInviteForm.tsx` | Pass studio/designer/project/note through `inviteUserByEmail({ data })` (`apps/designer-portal/src/app/api/clients/invite/route.ts:135-145`) and render `{{ .Data.* }}` in `supabase/templates/invite.html` | `/api/clients/invite` mints via `admin.auth.admin.generateLink({type:'invite'})`, writes a `client_invitations` snapshot row, and sends the letter itself through `sendCompliantEmail`. Letter CTA → our 7-day token page → mint-and-redirect at click |
| **Send leg** | 3.5 d | 1.5 d | 4 d |
| **Common work** | 6.5 d | 3.5 d (cannot carry status or snapshot) | 6.5 d |
| **Total** | **10 d** | **5 d** | **10.5 d** |
| **Risk** | **Medium-high.** Leaves two live invite mechanisms in one route unless `inviteUserByEmail` is deleted in the same change; the function has **zero tests today** (its own comment, `index.ts:263-264`: *"no test file exists for this function"*); its send leg has had **no caller since it was written** (research/01 §3), so it is unproven code being promoted to the first thing a homeowner ever sees | **Low to ship, high to live with.** Touches the one template shared by every invite in the product | **Medium.** New code on a proven pattern — `supabase/functions/designer-invite/index.ts:202-209` already does exactly `generateLink` → render → `sendCompliantEmail` and is shipped |
| **Cannot do** | Cannot escape the password step without also rewriting the accept leg — which is the same work as (c), so (a) either asks a homeowner to invent a password (a step the *live* path does not ask for today: `/auth/callback` has none, research/01 §7) or converges on (c). Bypassing `sendCompliantEmail` means no `notification_log` row, so no sent/opened — fixing that is in the ask anyway | **Cannot fix expiry** (60 minutes, shared `otp_expiry`). **Cannot log** — GoTrue sends, so there is no `notification_log` row and §3's status rail is impossible. **Cannot snapshot** — nothing is frozen at send. **Cannot separate audiences** — one `[auth.email.template.invite]` block (`config.toml:213-215`) serves designer, admin and client invites alike; audience branching would have to live as Go-template `{{if}}` inside one file that `scripts/emails/build.mjs` also generates `apps/admin-portal/src/data/system-email-previews.ts` from. **Wrong home for the note** — `.Data` is `user_metadata`, which the homeowner can read *and overwrite* via `updateUser({data})`; a studio's letter to her should not be a field on her own account | Nothing the panel asked for. It costs the most because it does the most |

**Verified: does GoTrue expose metadata as `.Data`?** Yes. Supabase docs (`/supabase/supabase`, `guides/local-development/customizing-email-templates.mdx` and `troubleshooting/customizing-emails-by-language-KZ_38Q.mdx`) show `{{ .Data.first_name }}` and `{{if eq .Data.language "en" }}` in auth templates; `guides/auth/auth-email-templates.mdx` lists `Data` among the template variables and confirms it carries user metadata. So (b) is technically possible. None of our six templates uses it today (`grep '\.Data' supabase/templates/` → no hits; the six use only `.ConfirmationURL`, `.SiteURL`, `.Email`, `.Token`, `.TokenHash`, `.NewEmail`, `.RedirectTo`).

**Verified: does `generateLink` send?** It is the "generate, don't send" endpoint — Supabase shipped it precisely for teams who *"require a little more flexibility… to dynamically generate email content"* and exposed it behind the service-role key (`apps/www/_blog/2021-07-28-supabase-auth-passwordless-sms-login.mdx`). The in-repo proof is stronger than the doc: `designer-invite` calls `generateLink({type:'invite'})`, takes `genData.properties.action_link` (`index.ts:231`), renders its own template and sends one email via `sendCompliantEmail` (`index.ts:262-274`). If `generateLink` also sent, every admin-invited designer would get two emails and someone would have noticed. Confirm it once locally against Mailpit in L1 anyway — one message, not two — because it is a one-line assertion and a two-letter first touch is an embarrassing way to learn it.

### Recommendation: **(c), with the CTA pointing at our token, not at GoTrue's link**

The flow, precisely:

1. Designer submits. `/api/clients/invite` mints the account with `generateLink({type:'invite', options:{ data:{ role:'homeowner', … } }})`. This creates `auth.users` + returns `genData.user.id`, the same object `inviteUserByEmail` returns — so Branch B's existing `profiles` upsert and `user_roles` insert (`route.ts:164-186`) carry over unchanged. **Pass `role:'homeowner'`, not `role:'client'`** — `handle_new_user` only recognizes `'homeowner'` (`supabase/migrations/00313_handle_new_user_client_role_hint.sql:47-48,64`), which is why today's route has to upsert `role:'client'` back over the trigger's `'designer'` default. Free fix, same edit.
2. Insert the `client_invitations` row carrying the full render snapshot (§2). The GoTrue `action_link` from step 1 is **discarded** — it is 60 minutes old the moment it is minted and it is not what we mail.
3. Render the letter and send through `sendCompliantEmail` with `category:'transactional'`, `notificationType:'client_invite'`, `userId` = the id from step 1, and an `idempotencyKey`. Store the returned `notification_log.id` on the invitation.
4. The letter's one CTA is `${CLIENT_PORTAL_URL}/auth/invite/${token}` — our row, seven days.
5. That page (`apps/client-portal/src/app/auth/invite/[token]/page.tsx`, already `KEEP` per `artifacts/client-page-completion-2026-09-04/research/RETIRE-INVENTORY.md:55`) loses `AcceptInviteForm`'s password fields and becomes a letterhead + one button. The button POSTs; the server validates the token, marks it accepted, mints a **fresh** `generateLink({type:'magiclink'})`, and redirects to it. Sixty minutes is plenty for a link minted three hundred milliseconds ago.
6. She lands at `/auth/callback?type=invite`, which already exchanges the code and hard-redirects to `/` (`apps/client-portal/src/lib/client-auth-destination.ts`). The note surfaces once on the Threshold as a first-visit margin note, from the snapshot.

**Expiry consequence:** seven days, and it is ours — enforced by a row we can read, expire, sweep, and resend against, not by a global auth setting shared with password recovery. The homeowner who opens her mail on Thursday gets in. The cost is that a live seven-day session-minting link exists in an inbox: mitigate with single-use (`accepted_at`), the existing email-match guard (`client-invite/index.ts:231-233`, already fail-closed), and — non-negotiable — **mint on the button POST, never on page GET**, because Outlook SafeLinks and similar scanners follow links in mail and would otherwise burn the token before she ever clicks.

**Landing consequence:** she arrives **signed in, on her house**, having typed nothing. She never invents a password (matching how the live path already behaves, and how she will sign in forever after — OTP via `/auth/signin`). The intermediate page stops being an auth form and becomes the second page of the letter: same letterhead, same studio, same note, one button. That also closes the identity split research/01 §7 found — today the email can say "Middle West Studio" while the landing page says "Leah Quist", because the page reads `profiles.full_name || business_name` and never calls `resolve_studio_identity`. Under (c) both read the same frozen snapshot, so they cannot disagree even if the studio renames itself between send and click.

---

## 2 · Data

**What exists.**

| Table | Relevant columns | Verdict |
|---|---|---|
| `client_invitations` (`00118_client_invitations.sql`) | `token` UNIQUE, `email`, `designer_id`, `project_id`, **`personal_message TEXT`**, `sent_at`, `expires_at` (7 days), `accepted_at`, `accepted_by` | The only place a client-invite note can live today. RLS: designer read/insert own, delete own unaccepted, **no anon SELECT** — token reads are service-role. Missing: any link to `designer_clients`, any snapshot, any status, any resend counter |
| `designer_clients` (`00014`, loosened by `00018`) | `designer_id`, `client_id` (nullable), `client_email`, `client_name`, `notes`, `status` | **No invite-message column, and no invitation link.** The live path writes here and nowhere else |
| `organization_members` (`00560_invite_handoff_note.sql`) | `handoff_note text CHECK (char_length(handoff_note) <= 280)` | The precedent for the field: additive nullable column, 280-char DB-level cap, no new RLS, no grant regen. Copy this shape exactly |
| `proposal_send_dispatches` (`00388_proposal_send_dispatch_guard.sql:26-43`) | `recipient_email`, `recipient_name`, `designer_name`, `sender_name`, `studio_name`, `studio_logo_url`, `client_portal_path`, `personal_message`, plus `provider_idempotency_key UNIQUE`, `email_log_id UNIQUE`, `provider_request_body` | The snapshot precedent, and its rationale is verbatim the panel's requirement: *"Complete immutable render/authorization snapshot… Nothing rendered by the edge handler comes from mutable proposal, profile, project, membership, or studio rows"* |
| `notification_log` (`00041_notification_log.sql:35`) | `user_id NOT NULL REFERENCES profiles(id)`, `type`, `channel`, `status`, `provider_id`, `template_id`, `metadata`, `opened_at`, `clicked_at` | The send log. **`user_id` is NOT NULL** — which is precisely why (c) must mint the account *before* it sends |

**The one migration.** Next free after 00580 (Strata head is `00579_trade_agreements.sql`; 00580 is being minted by another lane today):

`supabase/migrations/00581_client_invite_letter.sql`

```
ALTER TABLE public.client_invitations
  -- who the letter is about, and what it said, frozen at send (00388 precedent)
  ADD COLUMN designer_client_id  uuid REFERENCES public.designer_clients(id) ON DELETE SET NULL,
  ADD COLUMN kind                text NOT NULL DEFAULT 'invite'
                                   CHECK (kind IN ('invite','notice')),
  ADD COLUMN sender_display_name text,
  ADD COLUMN designer_given_name text,
  ADD COLUMN studio_name         text,
  ADD COLUMN studio_logo_url     text,
  ADD COLUMN signature_city      text,
  ADD COLUMN project_name        text,
  ADD COLUMN rendered_subject    text,
  -- status, read through the send log rather than duplicated
  ADD COLUMN email_log_id        uuid UNIQUE,
  ADD COLUMN provider_idempotency_key text UNIQUE,
  ADD COLUMN last_sent_at        timestamptz,
  ADD COLUMN resend_count        integer NOT NULL DEFAULT 0,
  ADD COLUMN superseded_by       uuid REFERENCES public.client_invitations(id) ON DELETE SET NULL,
  ADD COLUMN revoked_at          timestamptz;

ALTER TABLE public.client_invitations
  ADD CONSTRAINT client_invitations_personal_message_len
    CHECK (char_length(personal_message) <= 280);

CREATE INDEX idx_client_invitations_designer_client
  ON public.client_invitations(designer_client_id);
```

Notes for whoever writes it:

- `designer_client_id` is the missing join. Without it the People Room row has no way to find its own invitation; today the two tables do not know about each other.
- `kind` carries §4's already-has-account letter, which needs a snapshot and a status but has nothing to accept.
- **Status is not a column.** It is `notification_log.status` joined through `email_log_id`, plus `accepted_at` on our own row. Duplicating provider status into a second table is how the two drift.
- `personal_message` gets the 280 cap as an added CHECK. The table is almost certainly empty in prod (the writer has never had a caller — research/01 §3), but confirm the row count on Strata before pushing; if any row exceeds 280 the ALTER fails on validation.
- **Additive only, no new table, no new grants** → no legacy-grants regen, exactly as `00560` reasons in its own header. Existing RLS policies are column-agnostic and already cover every new column.
- No RLS change is needed for the designer's read of status, but a join from `client_invitations` to `notification_log` under the designer's own JWT will need either a `SECURITY DEFINER` read function or a view — `notification_log`'s policies are addressee-scoped (`00562` grants the *addressed user* the opened-mark), not sender-scoped. Budget half a day for that; it is the one non-obvious piece of §3.

---

## 3 · Status back to the designer

The rail exists and is used by every other Resend send in the product; this feature only has to join it.

1. `sendCompliantEmail` writes a `notification_log` row (`sending` → `sent`/`failed`/`suppressed`) and stores Resend's message id in `provider_id` (`supabase/functions/_shared/send-email.ts:431`).
2. `supabase/functions/resend-webhook/index.ts:112-121` looks the row up **by `provider_id`** and upgrades its status. `status-map.ts` maps `email.delivered|opened|clicked|bounced|complained`; `DELIVERY_UPGRADE_FROM_STATUSES = [queued, sending, sent, unconfirmed, failed]`, with `opened`/`clicked` deliberately excluded from that ladder because Resend does not guarantee event ordering.
3. The People Room row reads `client_invitations → email_log_id → notification_log.status/opened_at`, and reads `accepted` from `client_invitations.accepted_at` — which is ours, written by the accept leg, never by the webhook.
4. `resend` re-runs the send leg: new token, `resend_count + 1`, `last_sent_at = now()`, old row `superseded_by` the new one. Model it on the studio-member resend that already ships (`apps/designer-portal/src/components/document/account/account-studio-page.tsx:490-520,1448-1520`, helpers in `apps/designer-portal/src/lib/document/invite-status.ts`). Client invites have no resend control anywhere today (research/01 §6).

**The known gap, stated plainly.** An ambiguous send — transport error, unreadable 2xx — writes `status='failed'` with `provider_id` NULL, and the webhook matches on `provider_id`, so *"an ambiguous row that Resend actually delivered cannot be found and auto-upgraded; correcting it needs a reconciliation pass keyed on something else (e.g. the idempotency key)"* (`send-email.ts:436-441`, and the same note is carried in `resend-webhook/status-map.ts`). Storing `provider_idempotency_key` on the invitation is what makes that reconciliation possible later; this feature should not build the sweep.

**The product consequence of that gap is a copy constraint, not an engineering one.** The row must say only what we can prove. "Written 8 September · opened 9 September" is true; "Delivered ✓" on an ambiguous row is a lie. That happens to align with the binding vocabulary anyway — no badges, no pills, no green fills, no ✓ glyphs (`artifacts/portal-polish-review-2026-09-08/synthesis.md`, DECLINE table) — so the row should read as dated prose, and where we do not know, it should say nothing rather than guess.

---

## 4 · The already-has-account branch

Today Branch A is silent: profile found by email → `clientId = existingProfile.id`, `invited = false`, `alreadyExists = true`, and **no email of any kind is sent** (`route.ts:127-131`). The homeowner is added to a studio's roster and never told. The success toast even says so out loud to the designer — *"is already on Patina — linked to their account, now on your roster"* (`add-person-sheet.tsx:233`) — which is the designer being informed of a fact the client is not.

What changes: Branch A takes the same send leg, minus the auth work.

- No `generateLink`, no `profiles` upsert, no `user_roles` insert — the account exists.
- Still insert a `client_invitations` row, `kind='notice'`, `accepted_at = now()` (nothing to accept), carrying the same snapshot so the letter is frozen and the status rail works identically. A token is still minted because `token` is `NOT NULL UNIQUE`; it is simply never redeemed.
- The letter is shorter: the system standing sentence (who added whom to what), the note as a callout, one CTA straight to `${CLIENT_PORTAL_URL}/` — or to the relevant anchor from the client-page map (`#doorstep`, `#letterbox`, …, per `docs/design/the-client-page/README.md`) when the invite is project-scoped. No expiry line, because nothing expires. No "accept" or "set up your account" language, because there is nothing to set up.
- `userId` for `sendCompliantEmail` is `existingProfile.id`, so the log row and its `NOT NULL user_id` are satisfied without ceremony.

This is roughly half a day on top of the L1 send leg and it removes the feature's worst silent failure: a homeowner who already uses Patina being added to a second studio without a word.

---

## 5 · Flag

**Name:** `client-invite-letter` — lowercase kebab, no prefix, matching the fourteen flags already live in the designer portal (`agreement-library`, `studio-invoice`, `threshold`, …).

**What it gates:** the note field on all three composer entry points (`add-person-sheet.tsx`, `client-picker.tsx`, `send-sheet.tsx` via `captured-household-invite.tsx`) **and** the new send path in `/api/clients/invite`.

**The mechanism, and its honest limit.** `useFeatureFlag` is fail-closed by construction — *"Defaults to `{ value: false, isLoading: true }` so gated features do not 'flash visible'"* (`apps/designer-portal/src/hooks/use-feature-flag.ts`) — and consumers render null while `isLoading`. But **there is no server-side flag helper in this portal**: `use-feature-flag.ts` is `'use client'` and is the only flag file (research/02 §7). So the API route cannot ask PostHog.

The route must therefore be **body-driven, not flag-driven**: when the flag resolves true, the client sends the new shape (`{ letter: true, note?: string, projectId?: string }`); the route takes the new path only when that field is present, and **falls through to today's exact code when it is absent**. Fallback while off is therefore today's path byte-for-byte — `inviteUserByEmail`, generic GoTrue template, no note field, no `client_invitations` row. Do not refactor the old branch "while we're in there"; leave it alone so the off state is provably unchanged.

The limit worth stating: a designer could hand-craft a request with `letter: true` and bypass the flag. That is a studio writing its own letter to its own client with its own studio's identity — acceptable, but it means the flag controls rollout, not authorization, and the route still has to validate the note (≤280, trimmed) and resolve studio identity server-side rather than trusting anything in the body.

**E2E:** `NEXT_PUBLIC_FLAG_OVERRIDES=client-invite-letter:true` in `playwright.config.ts`'s `webServer` env — the same escape hatch `procurement-workspace-pilot` already uses. It requires a dev-server restart to change, and it must stay a static `process.env.NEXT_PUBLIC_*` member expression to survive Next's inlining.

---

## 6 · Tests that must exist, and the gates

**Deno — the function.** `supabase/functions/client-invite/index.test.ts` does not exist today; the function's own comment says so and treats itself as contract-by-comment (`index.ts:263-264`). Cover: subject and letterhead composition from a snapshot row (not from live tables); `escapeHtml` on the note (a designer typing `<` must not break the letter); the 280 cap; the note-absent letter; `kind='notice'` vs `kind='invite'` producing different bodies; token single-use; expired token; the existing fail-closed email-mismatch guard (`index.ts:231-233`) still failing closed. Plus a **golden shell snapshot** beside `supabase/functions/_shared/__snapshots__/branded-shell.baseline.html`, so the letter's shape is a diff and not a memory.

**Jest — the sheet.** `apps/designer-portal/src/components/document/people/directory/__tests__/` — field renders only when the flag is on; character counter and the 280 stop; the note reaches the mutation body; flag off produces the old body shape with no `letter` key. Same three assertions for the ClientPicker and send-sheet entry points; `useAddClient`/`useInviteAndLinkClient` are `fetch`-based (`packages/supabase/src/hooks/use-clients.ts:531,593`), so assert on the request body, not on a mocked hook.

**Jest — the arrival.** The first-visit margin note renders once and not on the second visit. Note the constraint: **client-portal enforces a coverage floor** (lines 70 / branches 60 / functions 70 / statements 70, per `.claude/skills/patina-verification/SKILL.md`), so new untested files there drag the suite red rather than merely uncovered.

**Playwright — add-client → Mailpit.** Add a client with a note; assert Mailpit (`http://127.0.0.1:54324/api/v1/messages` — the container is Mailpit despite `config.toml`'s deprecated `[inbucket]` block) holds **exactly one** message, whose subject names the studio and whose body carries the note. The "exactly one" is the assertion that proves `generateLink` did not also send GoTrue's letter.

**Gate commands** (from `.claude/skills/patina-verification/SKILL.md`):

```
pnpm --filter @patina/designer-portal type-check          # ~15-40s; build is NOT a gate here
pnpm --filter @patina/designer-portal test
pnpm --filter @patina/designer-portal lint                # the one working ESLint config in the repo
pnpm --filter @patina/client-portal type-check
pnpm --filter @patina/client-portal test                  # coverage floor enforced
deno test --allow-all --config supabase/functions/deno.json supabase/functions/client-invite/
pnpm --filter @patina/designer-portal test:e2e
```

Plus, because the hooks live in `packages/supabase` — the shared-package rule: build the package, re-type-check every consuming portal, then `pnpm --filter @patina/admin-portal build`, the repo's strictest gate (`next build`, no `ignoreBuildErrors`, `typedRoutes:true`). Skipping that is the exact incident class that shipped `TypeError: proposalTierVisibility is not a function` to prod. For the migration: `pnpm supabase:reset` locally before `supabase db push`.

---

## 7 · Lanes

Four lanes. L1 is the spine; L2 can start as soon as L1's request contract is written down, which is hour one.

| Lane | Size | Depends on | One-way? | What it is |
|---|---|---|---|---|
| **L1 · The send leg** | **M** | — | **One-way** (migration `00581`) | Migration 00581. `/api/clients/invite` gains the body-driven branch: `generateLink({type:'invite'})` with `role:'homeowner'`, snapshot insert, letter render, `sendCompliantEmail`. Branch A's `kind='notice'` letter (§4). The Deno tests the function has never had. Everything else waits on this |
| **L2 · The composer** | **S** | L1's request contract only — can run in parallel | Reversible | The ≤280 note field on `add-person-sheet.tsx`, `client-picker.tsx`, `captured-household-invite.tsx`, gated on `client-invite-letter`; counter, placeholder, `has_note` analytics property (the `hasPersonalMessage` precedent from `apps/designer-portal/src/lib/analytics/events.ts:114`). Modelled on the studio-invite handoff-note field, which already ships this exact control |
| **L3 · The arrival** | **M** | L1 | Reversible | `/auth/invite/[token]` loses the password form, gains letterhead from the snapshot + `resolve_studio_identity` logo, and becomes mint-and-redirect on a button POST. The note surfaces once as a first-visit margin note on the Threshold. Closes the email-says-studio / page-says-person split |
| **L4 · The designer's account of it** | **S** | L1, L3 | Reversible | People Room row reads invitation + `notification_log` in dated prose; resend act (new token, `resend_count`, `superseded_by`); the `SECURITY DEFINER` read that lets a designer see her own send's status |

Total ≈ 10.5 engineer-days, and the four lanes are two engineers for a week if L2 starts on a written contract rather than on merged code.

**One-way vs reversible.** Only L1's migration is one-way — not because it is destructive (it is purely additive: new nullable columns, one CHECK, one index, no drops, no data movement) but because repo convention forbids editing an applied migration; a mistake is fixed forward with 00582, never in place. Everything in L2–L4 is a flag flip away from gone. Note also that the migration must be minted **after** whatever 00580 turns out to be — `00580` is being taken by another lane today, and migration-number collisions across parallel worktrees are a known failure here (`.codex/worktrees/` currently holds a dozen live checkouts).

**Blocked-on, not ours:** PP-6 requires the PP-1…PP-5 amendments be recorded as V-entries in `docs/vision/VISION-DECISIONS.md` *before any build*, and no V9 entry exists yet (research/03 §3.1). L1 does not strictly depend on it; L3's letterhead does, and §8's shell question is unanswerable without it.

---

## 8 · Risks, and the one most likely to go wrong

**The top risk: the shell.** PP-1 says no Patina wordmark above the colophon on client surfaces. `renderBrandedShell` puts the Patina wordmark at the top of *every* email including client mail — that is not an oversight, it is a decision the file argues for in a comment (research/02 §1). If the panel rules the email shell **is** a client surface, then honoring PP-1 means editing `supabase/functions/_shared/branded-email.ts`, and that file is imported by roughly fifteen senders — invoices, POs, quote requests, trade RFQs, trade agreements, decisions, commercial documents, proposal send/nudge/sign-confirmation, fulfillment, review requests, morning brief, four dispatchers. Consequences, all at once: the golden snapshot `__shared__/__snapshots__/branded-shell.baseline.html` breaks; every client-facing email in the product changes appearance in a single edit; and **every importing function must be redeployed** (`CLAUDE.md`: *"A `_shared/*` edit requires redeploying EVERY importing function"*), which is a fifteen-function deploy riding on an invite feature.

The containment is to add an `audience: 'client-letter'` branch rather than change `'client'` — additive, snapshot-safe, redeploys only `client-invite` — and to let the wholesale change be its own program under the portal-polish build. **This is the ruling the panel most needs to make, and it should be made before L1 starts, not during it.** If it is deferred, L1 will make it by accident.

The rest, in descending order:

- **Sixty minutes, reached for by reflex.** Any implementer who mails a GoTrue link — because it is one line and it works locally where nobody waits two days — ships a letter that dies before dinner. The Deno test that asserts the CTA host and path is the guard.
- **Scanner prefetch burns the token.** Corporate mail security follows links. If the token page mints a session on GET, the homeowner's first click lands on "Already accepted". Mint on POST behind a button; assert it in the Deno test.
- **`notification_log.user_id` is NOT NULL** (`00041:36`). Send-before-mint fails with a foreign-key error rather than degrading. This is a hard ordering constraint in L1, not a preference.
- **Status that lies by omission.** The ambiguous-send gap (§3) means some invites will read "we sent it" forever. Say less rather than guess; do not build the reconciliation sweep here.
- **iOS.** The client app carries `applinks:client.patina.cloud` (`apps/mobile/Patina/Patina/Patina.entitlements`) and its `DeepLinkHandler` routes any path starting `/auth` into an auth handler that only knows `/callback` (`App/DeepLinking/DeepLinkHandler.swift:191,364-366`). Today the AASA publishes only `/piece/*`, `/invoices/*`, `/proposals/*`, `/decisions/*` (`apps/client-portal/src/app/.well-known/apple-app-site-association/route.ts`) — so `/auth/invite/<token>` stays on the web and this feature is safe. But it is one line away from not being: if anyone adds `/auth/*` to that list, the invite dead-ends inside the app. Leave a comment on the AASA route saying so. Separately and less urgently: a homeowner with the app installed will sign in on the web and again in the app, because nothing hands the session across.
- **The role hint.** `role: 'client'` in the invite metadata is not recognized by `handle_new_user`, which only knows `'homeowner'` (`00313:47-48,64`); today's route papers over it with an immediate upsert. Carrying that bug forward into `generateLink` would be free to avoid and easy to copy by accident.
- **Two mechanisms, one route.** For as long as the flag is partial, `/api/clients/invite` has two ways to mint an account. Keep the old branch untouched and delete it in one commit when the flag goes to 100% — do not let them interleave.
- **The unfound caller.** Nothing in `apps/` or `packages/` calls the `client-invite` send leg, but research/01 could not rule out an iOS or admin caller outside this repo. Before rewriting its request shape, grep the Swift trees and check Strata's function logs for invocations.
