# Current state: how a client is invited today

Source: exploration pass, 8 September 2026 (read-only). Verified against the repo at commit 02eb0a95f.

All paths repo-relative to `/Users/kody/Code/patina-merged`.

---

## 1. The live path — what actually happens today

**Short version:** the homeowner's first email is a **generic GoTrue "invite" email** sent by Supabase Auth (`inviteUserByEmail`) using the local template `supabase/templates/invite.html`. It is **not** sent via Resend, it names **no designer, no studio, no project, and carries no personal message**. The purpose-built, co-branded `client-invite` edge function that *does* all of that has **no caller anywhere in the app code** for its send leg — only its `/accept` leg is wired up.

### 1.1 Designer-portal UI entry points

| Surface | File | Fields collected |
|---|---|---|
| **Add someone to your people** sheet (People Room → "a client") | `apps/designer-portal/src/components/document/people/directory/add-person-sheet.tsx` (client branch: L~365–400; submit at L211–243) | `Full name (optional)`, `Email`, checkbox **"Send a magic-link invite to Patina"** (default on). **No phone, no message field.** |
| **ClientPicker** — "invite-on-send" for a captured household (R73/J2) | `apps/designer-portal/src/components/portal/client-picker.tsx` (L200–230 `handleInviteAndLink`; armed-row UI L317–500) | Nothing new — email/name come from the existing `designer_clients` row. Two-step: select row → **"Send invite"** / "Cancel". |
| **Send sheet** (send a proposal to a household with no account) | `apps/designer-portal/src/components/document/overlays/send-sheet.tsx` L573–600, L646–655; helper `apps/designer-portal/src/components/document/overlays/captured-household-invite.tsx` | Nothing — reuses row email/name. Copy: *"**{name}** is still this proposal's household. Invite them to Patina so they can receive and sign it."* |
| Household sheet (edit household contact on a project) | `apps/designer-portal/src/components/document/overlays/household-sheet.tsx` (L106–125) | `client_name`, `client_email`, `notes` — **stores only, does not invite** ("Invite or choose a client…" at L191). |
| Retired: old Team page "Invite member" modal also used this same route (per `docs/design/the-document/portal-vs-desk-feature-gap-matrix-v2.rows.json:5955`). | — | — |

Copy in the add-person sheet: intro *"Add a client to your directory. They appear on your roster at once; an optional invite gives them a Patina login."*; success line *"{label} added — a magic-link invite is on its way."*

### 1.2 Mutation path

```
add-person-sheet.tsx / client-picker.tsx / send-sheet.tsx
  → useAddClient()  or  useInviteAndLinkClient()
      packages/supabase/src/hooks/use-clients.ts  (L531 and L593)
      re-exported: packages/supabase/src/hooks/index.ts:273-274
      portal shim:  apps/designer-portal/src/hooks/use-clients.ts:18-19
  → POST /api/clients/invite
      apps/designer-portal/src/app/api/clients/invite/route.ts
  → adminClient.auth.admin.inviteUserByEmail(clientEmail, {
        data: { display_name, full_name, role: 'client' },
        redirectTo: `${CLIENT_PORTAL_URL}/auth/callback?type=invite`
    })                                    (route.ts:134-145)
  → GoTrue sends the [auth.email.template.invite] email
```

Three branches in `route.ts`:
- **A** profile already exists for that email → link only, **no email sent** (`invited:false, alreadyExists:true`).
- **B** no profile + `invite:true` → `inviteUserByEmail`, upsert `profiles` (`role:'client'`), insert `user_roles` for role `client`.
- **C** `invite:false` → row stored with `client_email`/`client_name`, no auth user, no email.

Then it inserts a `client_activity_log` row (`activity_type:'note'`, title `"Invite sent to {email}"`, description `"Magic-link invite sent via Supabase Auth"`).

**Notable:** the metadata hint is `role: 'client'`, but `handle_new_user` only recognizes `raw_user_meta_data->>'role' = 'homeowner'` (`supabase/migrations/00313_handle_new_user_client_role_hint.sql:47-48,64`), so the trigger defaults `profiles.role='designer'`; the route immediately upserts `role:'client'` on top. Related known defect documented in `supabase/functions/client-invite/index.ts:244-286`.

### 1.3 Resend / GoTrue

- **Resend is NOT used** on the live client-invite path. The email is a GoTrue-templated send.
- `generateLink` is used only by `supabase/functions/designer-invite/index.ts` (admin → designer), not for clients.
- Resend **is** used by the dormant `supabase/functions/client-invite/index.ts` (direct `fetch('https://api.resend.com/emails')`, L171-178, `from = RESEND_FROM ?? 'hello@patina.cloud'`).

---

## 2. The email the homeowner actually receives

**Template:** `supabase/templates/invite.html`, registered in `supabase/config.toml:213-215`:

```toml
[auth.email.template.invite]
subject = "You're invited to Patina"
content_path = "./supabase/templates/invite.html"
```

Prod (Strata) mirrors these via `scripts/emails/deploy-auth-templates.mjs` (per the comment at `config.toml:194-196`).

**Subject:** `You're invited to Patina`

**Preheader:** `You've been invited to join Patina.`

**Eyebrow:** `Invitation` · **Kicker:** `An invitation`

**Headline:** `You're invited to Patina.`

**Body (verbatim, the entire body):**
> You've been invited to join Patina — a workshop for interior designers, their clients, and the makers they trust. Accept below to set up your account. This invitation expires in 60 minutes.

**CTA:** `Accept invitation` → `{{ .ConfirmationURL }}` (which resolves to `${NEXT_PUBLIC_CLIENT_PORTAL_URL}/auth/callback?type=invite`, default `https://client.patina.cloud`)

**Fallback + footer:**
> Button not working? Paste this link into your browser: …
> Not expecting this? You can safely ignore this email.
> Patina — A workshop for interior designers, their clients, and the makers they trust.
> Sent to {{ .Email }} · Patina

**From address:** whatever GoTrue/Strata SMTP is configured with — `[auth.email.smtp]` is commented out in `config.toml:186-192`, so the prod from-address could **not** be found in the repo.

**No studio name. No designer name. No project name. No explanation of why they got it. No personal message.** The only "why" is the generic product sentence above. Nothing distinguishes a homeowner invite from a designer/manufacturer invite — it is the single shared GoTrue invite template.

---

## 3. The dormant, better email (`client-invite` edge function)

`supabase/functions/client-invite/index.ts` — the `POST /` send leg has **no invoker** in `apps/`, `packages/`, or any other edge function. The whole tree was grepped for `client-invite`; the only runtime reference is the **accept** leg (`apps/client-portal/src/app/api/auth/invite/accept/route.ts:27`). Docs still list it as live (`docs/prds/consolidated/08-client-portal.md:145`, `infra/runbooks/email-ops.md:25`), and `artifacts/client-page-completion-2026-09-04/research/RETIRE-INVENTORY.md:55` marks the landing route **KEEP** — so the landing page and accept path are alive while the sender is orphaned.

What it *would* send (index.ts:129-169):
- Body: `{ email, projectId?, personalMessage? }`
- **Subject:** `` `${senderName} invited you to Patina` `` (senderName = studio display name, falling back to designer name)
- Body copy: `Hi,` / `` `${designerName} would like to collaborate with you on Patina.` `` / *personal message rendered as a `callout()` block* / `**Project:** {projectName}` / CTA **`Accept invitation`** → `${CLIENT_PORTAL_URL}/auth/invite/${token}` / `This invitation expires in 7 days. If the button doesn't work, copy this link: …` / studio `signOff({designerGivenName, studioName, city})`
- Preview: `` `${senderName} would like to collaborate with you on Patina.` ``
- Co-branded via `supabase/functions/_shared/studio-identity.ts` (`resolveStudioIdentity`, `studioCobrand`, `studioDisplayName`, `studioSignatureCity`) and `supabase/functions/_shared/branded-email.ts` (`renderBrandedShell`, `paragraph`, `callout`, `ctaButton`, `muted`, `signOff`).
- Sent via Resend directly (not via the `sendCompliantEmail` chokepoint that other senders use — see `supabase/functions/_shared/send-email.ts`).

---

## 4. Data model

| Table | Migration | Key columns |
|---|---|---|
| `designer_clients` | `supabase/migrations/00014_portal_business_features.sql:72-100`; loosened by `00018_designer_clients_direct_contact.sql` | `designer_id`, `client_id` (**nullable since 00018**), `client_email`, `client_name`, `nickname`, `notes`, `tags[]`, `source`, `lead_id`, `status`, `total_projects`, `total_revenue`, `first_project_at`, `last_project_at`. Unique partial indexes on `(designer_id, client_id)` and `(designer_id, client_email)`. **No invite-message column.** |
| `client_invitations` | `supabase/migrations/00118_client_invitations.sql` | `token` (unique), `email`, `designer_id`, `project_id`, **`personal_message TEXT`**, `sent_at`, `expires_at` (default `now() + 7 days`), `accepted_at`, `accepted_by`. RLS: designer read/insert own; delete own **unaccepted**; no anon SELECT (service-role token lookup). |
| `client_activity_log` | (referenced by the route; seeded `activity_type` values do **not** include `invite_sent` — see `route.ts:261` comment) | `designer_client_id`, `activity_type`, `title`, `description`, `actor_name`, `metadata` (no `actor_id` column). |
| `profiles` | `00013`, hint logic `00313_handle_new_user_client_role_hint.sql` | `id`, `email`, `full_name`, `display_name`, `business_name`, `city`, `role`, `is_designer`. |
| `roles` / `user_roles` | `00021/00022`, `00126_backfill_user_roles.sql`, `00555_ios_round_one_security.sql:1168` | `roles.name='client'` sits in the `consumer` domain — that's what gates the client portal in `apps/client-portal/src/middleware.ts`. |
| `organization_members` (studio invites — an invite IS a member row, there is **no `invitations` table**) | `00560_invite_handoff_note.sql`, expiry sweep `00553_invite_expiry_sweep.sql` | `status='invited'`, `invitation_expires_at`, `job_title`, `staff_role`, **`handoff_note text CHECK (char_length ≤ 280)`**. |
| `proposals.personal_message` | `00063_proposal_system_v2.sql:43` | carried into `projects.kickoff_message` on activation. |

**So:** `client_invitations.personal_message` is the *only* column that exists for a client invite note — and it is on the table the dead sender writes. The live path (`designer_clients` + GoTrue) has **no column for a message**.

---

## 5. Existing "personal message / custom note" patterns to reuse

| Pattern | Where written (UI) | Where stored | Where it surfaces |
|---|---|---|---|
| **Proposal personal message** (strongest precedent) | `apps/designer-portal/src/components/document/overlays/send-sheet.tsx:799-812` — label `Personal message`, `<textarea rows={5}>`, placeholder **"Write a personal note to your client…"**; also `service-agreement-send-sheet.tsx:74` | `proposals.personal_message` (`00063:43`), passed as `p_personal_message` (`packages/supabase/src/hooks/use-proposals.ts:999,1164`; `apps/designer-portal/src/hooks/use-commercial-documents.ts:679-691`) | Rendered as a `callout()` block in the email: `supabase/functions/proposal-send/handler.ts:238-240`; analytics `has_personal_message` in `apps/designer-portal/src/lib/analytics/events.ts:114` |
| **Studio-member handoff note** | `apps/designer-portal/src/components/document/account/studio-invite-modal.tsx:417-440` — label **"A line for her first day (optional)"**, 3-row `Textarea`, live char counter, placeholder *"Start with the Olsen lake house — the brief's written, it just needs the schedule built."*, feature-gated on `teammatePersonaEnabled` | `organization_members.handoff_note` (`00560`), sent as `handoff_note` (`supabase/functions/workspace-member-invite/index.ts:84,182-185,332`) | **NOT in the email.** Rendered on the new hire's Desk as `MarginNote noteKey="hire-handoff"` — *"— From {owner first name}: {handoff_note}"* |
| **Designer invite personal observation** (required, appears in the email) | admin portal Users page → `supabase.functions.invoke('designer-invite')` | not persisted — request-only | `supabase/functions/designer-invite/index.ts:177-180` (400 `personal_observation_required`), interpolated at L253-256 into template slug `designer-invite`. Template seeded in `00404_rebake_onboarding_email_templates_td_padding.sql:43`; subject `An invitation to Patina`; body: *"I've been following your work — {{personal_observation}}. That's exactly the eye we built Patina for."* |
| **PO / invoice personal message** | — | — | `supabase/functions/_shared/po-emails.ts:66,92-93`; `supabase/functions/_shared/invoice-emails.ts:123,181-182` — same `callout(escapeHtml(...))` idiom |
| **Dead client-invite personal message** | none | `client_invitations.personal_message` | email `callout` (`client-invite/index.ts:129-131`) **and** the landing page renders it as a `<blockquote>` (`apps/client-portal/src/app/auth/invite/[token]/page.tsx:131-136`) |

The shared email primitive to reuse is `callout()` in `supabase/functions/_shared/branded-email.ts`.

---

## 6. Resend / re-invite and expiry

**Client invites: there is no resend control anywhere.** The People room, ClientPicker, send-sheet, and the client hooks were searched — nothing. Behavior on a second invite attempt:
- If the first invite created an auth user + `profiles` row, branch A fires → the client is silently **linked with no email sent** (`invited:false, alreadyExists:true`). So re-inviting is a no-op that produces no email.
- If the auth user exists but the `profiles` row doesn't (partial earlier flow), GoTrue returns "User already registered" and the route surfaces it as a 400 (`route.ts:147-154`).
- Expiry: GoTrue invite link — `otp_expiry = 3600` (`config.toml:183`); the template says **60 minutes**. There is no DB row to expire and no sweep.

**By contrast, studio-member invites do have resend:** `apps/designer-portal/src/components/document/account/account-studio-page.tsx:198,490-520,1448-1520` ("Resend invite" per row, one-at-a-time guard), with helpers in `apps/designer-portal/src/lib/document/invite-status.ts` (`isInviteExpired`, `clampInvitableRole`, `friendlyInviteError`) and the daily expiry sweep `supabase/migrations/00553_invite_expiry_sweep.sql`.

**Field-party SMS invites: also no resend in v1** — asserted by `apps/designer-portal/src/components/document/people/__tests__/party-profile-invite-to-texts.test.tsx:12`.

The dead `client_invitations` row has `expires_at = now() + 7 days`, enforced in `client-invite/index.ts:222-224` and on the landing page.

---

## 7. Client-portal side — where the homeowner lands

### Live path (GoTrue invite)
1. Email CTA → GoTrue verify → redirect to **`/auth/callback?type=invite`** — `apps/client-portal/src/app/auth/callback/page.tsx`
2. Callback exchanges the code (`finalizeAuthCallback` / `consumeAuthCallbackFragment` from `@patina/supabase/auth`), then hard-redirects via `replaceAuthDestination` → `apps/client-portal/src/lib/auth-redirect.ts`
3. Destination is `CLIENT_AUTH_DESTINATION = '/'` — `apps/client-portal/src/lib/client-auth-destination.ts`
4. `/` = "The front door", renders the active house — `apps/client-portal/src/app/page.tsx` (Threshold / LetterboxDoor components)
5. Gate: `apps/client-portal/src/middleware.ts` checks `user_roles → roles.domain` for a consumer-domain role (fail-open-but-loud with `x-patina-role-check: skipped` header)

**There is no onboarding/welcome route** — no `apps/client-portal/src/app/onboarding`. The homeowner is dropped straight into the house. **The invited user never sets a password** on this path (no password step in `/auth/callback`); subsequent sign-ins would go via magic link / OTP (`/auth/signin`, `/auth/verify-otp`).

### Dormant path (`client-invitations` token)
- Landing: `apps/client-portal/src/app/auth/invite/[token]/page.tsx` — server-side service-role lookup, resolves designer + project, headline **"Welcome to Patina."**, description `` `${designerName} invited you to collaborate on "${projectName}"` ``, renders `personal_message` as a blockquote. Error shells: "Invitation not found" / "Already accepted" / "Invitation expired" (*"This invitation has expired. Please ask your designer to send a new one."*)
- Form: `apps/client-portal/src/components/auth/AcceptInviteForm.tsx` — **sets a password** (`signUp` with email+password, min 8 chars, confirm field), then `POST /api/auth/invite/accept`
- Proxy: `apps/client-portal/src/app/api/auth/invite/accept/route.ts` → `${FUNCTIONS_BASE}/client-invite/accept`
- Accept handler relabels `profiles.role → 'homeowner'` (`client-invite/index.ts:277-284`, ruling B2 v3(d) / migration 00555)
- Success: `PortalAuthSuccess` "Your invitation is accepted." / "We're opening your projects now." → `/`

---

## Things I could not find

- **The prod From address / sender name for the GoTrue invite email.** `[auth.email.smtp]` is commented out in `supabase/config.toml:186-192`; the deploy script is named at `config.toml:195` (`scripts/emails/deploy-auth-templates.mjs`) but the sender identity is configured outside the repo (Strata dashboard / env).
- **Any invoker of the `client-invite` send leg.** No `functions.invoke('client-invite')`, no fetch to `/functions/v1/client-invite` other than `/accept`. If it is still called in prod it is from outside this repo.
- **Any test file for `supabase/functions/client-invite/`** — confirmed absent (the function's own comment at L263-264 says "no test file exists for this function").
- **Any client-invite resend UI or `invite_sent` activity type** — neither exists.
- **A designer-facing "invite status" surface for clients** (pending/expired/accepted). `invite-status.ts` is studio-member-only.
