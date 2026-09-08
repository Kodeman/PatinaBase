# Branded email system and studio identity

Source: exploration pass, 8 September 2026 (read-only). Verified against the repo at commit 02eb0a95f.

All paths repo-relative to `/Users/kody/Code/patina-merged`.

---

## 1. Email infrastructure

**Provider: Resend.** There is no edge function named `send-email`; instead there is a shared Deno module.

### The chokepoint — `supabase/functions/_shared/send-email.ts` (452 lines)

Three-stage design, deliberately split so durable outboxes can persist the exact provider body before attempt one:

- `prepareCompliantEmail(supabase, options)` → runs suppression + rate-cap policy, serializes the exact Resend JSON body, returns `{state:'ready', request}` or `{state:'suppressed', reason}`.
- `sendPreparedResendRequest(request, opts)` → POSTs to `https://api.resend.com/emails`, returns `delivered | failed | ambiguous`.
- `sendCompliantEmail(supabase, options)` → "Compatibility chokepoint for non-outbox callers" — the one most senders use. Writes `notification_log` rows (`sending` → `sent`/`failed`/`suppressed`).

`ComplianceSendOptions` accepts `to, subject, html, text, cc, replyTo, from, attachments, userId, notificationType, category, templateId, metadata, skipLog, unsubscribeBaseUrl, tags, idempotencyKey, failClosedPolicyReads`.

**Categories:** `transactional | operational | engagement | marketing`. Non-transactional sends get an RFC-8058 `List-Unsubscribe` + `List-Unsubscribe-Post` header and are subject to a rolling per-user cap (`EMAIL_USER_CAP_PER_HOUR`, default 8). Transactional bypasses the cap and the unsubscribe header.

### From-address / reply-to conventions

```
const DEFAULT_FROM = "Patina <hello@patina.cloud>";
```
Resolved by category via `resolveFromAddress()`:
- transactional/operational → `RESEND_FROM_TRANSACTIONAL` → `RESEND_FROM` → default
- marketing/engagement → `RESEND_FROM_MARKETING` → `RESEND_FROM` → default

Per-send override exists (`options.from`). Two invite functions use it:
- `supabase/functions/workspace-member-invite/index.ts:66` — `INVITE_FROM ?? 'Patina <hello@patina.cloud>'`
- `supabase/functions/designer-invite/index.ts:52` — `INVITE_FROM ?? 'Kody at Patina <kody@patina.cloud>'`

**A studio cannot currently be the "from".** Every from-address is a Patina-domain address from env; nothing derives `from` from studio identity. **Reply-to *is* already used to route replies to the designer** — this is the existing precedent for making a studio the effective correspondent:
- `supabase/functions/quote-request-send/index.ts:201` — `replyTo: designerEmail ?? undefined`
- `supabase/functions/po-send/index.ts:545` — same
- `supabase/functions/trade-rfq-send/lib.ts:388` and `trade-agreement-send/lib.ts:463` — `replyTo: identity.designerEmail ?? undefined`

Note: the client-invite function (below) does **not** set reply-to.

### The shared layout/wrapper — `supabase/functions/_shared/branded-email.ts` (330 lines)

`renderBrandedShell(opts: BrandedShellOpts)` is the canonical wrapper. Header comment:

> "The Deno runtime cannot import @patina/email, so this is a standalone copy of the Patina email design system, mirroring the canonical hand-authored shell at `packages/email/branded/welcome.html` — keep it in step with that file and with `packages/email/src/components/brand.ts`."

**Palette (`C`)**: paper `#F5F0E6`, card `#FCF9F2`, cardAlt `#FFFFFF`, line `#E6DDCC`, ink `#1F1B16`, ink2 `#4B463E`, ink3 `#8C8578`, verd `#4E7A66`, brass `#B08A46`, brassBorder `#8A6A30`, rust `#A24E2E`.
**Fonts (`F`)**: Fraunces (serif), Hanken Grotesk (sans), IBM Plex Mono (mono), loaded from Google Fonts.

**Structure**: 4px verd/brass/rust tricolor bar → "Patina" wordmark (Fraunces 23px) + optional mono eyebrow → *optional studio co-brand row* → body → hairline → footer (Patina + tagline + nav links) → legal band.

**Body helpers** (compose the inner content): `kicker()`, `heading()`, `paragraph()`, `muted()`, `callout()` (brass left-rule italic — used for personal notes), `ctaButton(url, label, 'ink'|'brass')`, `spacer(px)`, `signOff(sig)`, `givenName(fullName)`, `escapeHtml()`.

**Audience switch** — `EmailAudience = 'client' | 'designer'` changes both footer links and the tagline:
- client → `[{Your project, base}, {Email preferences, base/preferences}]`, base = `CLIENT_PORTAL_URL` (default `https://client.patina.cloud`)
- designer → `[{Dashboard}, {Help center}, {Email preferences → /desk?account=notifications}]`, base = `DESIGNER_PORTAL_URL` (default `https://app.patina.cloud`)

Client mail deliberately drops the Patina tagline. The comment is load-bearing for any new client-facing email:

> "R7/F9: a homeowner's letter is signed by her studio, and Patina's own pitch line ('a workshop for interior designers…') is studio-facing copy that read as a second, competing signature directly under it… Client mail keeps the wordmark and drops the tagline; designer mail is untouched."

Designer tagline verbatim: `"A workshop for interior designers and the makers they trust."`

There is a golden-file snapshot at `supabase/functions/_shared/__snapshots__/branded-shell.baseline.html` and tests in `supabase/functions/_shared/branded-email.test.ts`.

### Every email template that exists

**A. Edge-function inline builders** (compose via `renderBrandedShell`). Files calling it:

| File | Notes |
|---|---|
| `supabase/functions/client-invite/index.ts` | **the existing client invite** — see §6 |
| `supabase/functions/_shared/invoice-emails.ts` | 11 subjects (send/reminder/still-open/second/final notice, overdue, order confirmed, payment failures, check-on-the-way) |
| `supabase/functions/_shared/po-emails.ts` | purchase orders |
| `supabase/functions/_shared/quote-request-emails.ts` | `Quote request from ${studio}` |
| `supabase/functions/_shared/trade-rfq-emails.ts` | `${studio} would like your number — ${scopeTitle}` |
| `supabase/functions/_shared/trade-agreement-emails.ts` | |
| `supabase/functions/_shared/decision-notify.ts` | `Resolved: "…"`, `Still open: …`, `Edition N of …`, `${asker} sent … for your ${askWord}` |
| `supabase/functions/_shared/fulfillment-templates.ts` | confirmed / in_production / shipped / delivered / eta_change / substitution |
| `supabase/functions/commercial-document-notify/core.ts` | ~14 subjects (signature received, working budget ready, furnishings authorization, trade scope, draw invoice…) |
| `supabase/functions/proposal-send/handler.ts`, `proposal-nudge/index.ts` (`'A reminder about your proposal'`), `proposal-sign-confirmation/index.ts` (`Signed: "${title}"`) | |
| `supabase/functions/review-requests/index.ts` | `Share your experience with ${senderDisplay}` |
| `supabase/functions/morning-brief/render.ts` | `Morning Brief — ${briefDate}` |
| `supabase/functions/digest-dispatcher/index.ts`, `notification-digest/logic.ts`, `notification-dispatch/index.ts`, `campaign-dispatch/index.ts`, `waitlist-notify/index.ts` | |

**B. DB-stored templates** (`email_templates` table, rendered by `renderTemplateFromDb`). Slug → subject_default:

```
back-in-stock            Back in stock: {{productName}}
client-confirmation      Your Patina consultation request is confirmed
commission-offer         A new commission from {{designer_name}}
founding-circle-update   New in Patina
in-app-message           New message from {{senderName}}
in-app-message-mention   {{senderName}} mentioned you in Patina
lead-expiring            Action needed: Lead from {{clientName}} expires in {{hoursRemaining}}h
maker-invite             {{designer_name}} would like to build with you
new-lead-designer        New lead: {{clientName}} is interested
order-confirmation       Order confirmed — {{orderNumber}}
password-reset           Reset your Patina password
payment-receipt          Payment receipt — {{amountFormatted}}
price-drop               Price drop: {{productName}}
security-alert           Security alert for your Patina account
weekly-inspiration       Your week on Patina
welcome-verification     Welcome to Patina
workspace-invite         {{inviter_name}} invited you to join {{studio_name}} on Patina
```
Plus arrival templates in `00336_arrival_email_templates.sql`: `design-request-claimed`, `design-request-held`, `design-request-intro-delivered`; and designer onboarding drip templates seeded by `00293_seed_designer_onboarding_templates.sql`.

**C. React/`@patina/email` templates** — `packages/email/src/templates/*.tsx` (43 files: designer-invite, designer-invite-nudge-1/2, designer-welcome, workspace-invite, welcome-verification, project-activated, review-request, milestone-*, onboarding-* ×9, campaign-* ×4, etc.). Shell mirror at `packages/email/src/components/BaseEmailLayout.tsx`; brand tokens at `packages/email/src/components/brand.ts`; block renderers under `packages/email/src/block-html/` (`header.ts`, `footer.ts`, `skeleton.ts`, `cta-button.ts`, `hero.ts`, `text-block.ts`…).

**D. Hand-authored HTML** — `packages/email/branded/*.html` (17 files incl. `invitation.html`, `workspace-invite.html`, `welcome.html` — the canonical shell reference).

**E. GoTrue auth templates** — `supabase/templates/{confirmation,email-change,invite,magic-link,reauthentication,recovery}.html`, built by `scripts/emails/build.mjs`, deployed by `scripts/emails/deploy-auth-templates.mjs`.

---

## 2. Studio branding

### Schema

**There is no dedicated `studios`, `studio_branding`, `workspace_branding`, or `studio_settings` table.** A studio *is* a row in `organizations` (`supabase/migrations/00021_user_management_foundation.sql:102`):

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY, type organization_type NOT NULL,
  name VARCHAR(255) NOT NULL, slug VARCHAR(100) NOT NULL UNIQUE,
  logo_url TEXT, website VARCHAR(255), description TEXT,
  email VARCHAR(255), phone VARCHAR(20), address JSONB,
  settings JSONB NOT NULL DEFAULT '{}', ...
);
```

**Explicitly absent: there is no brand color / accent color column anywhere.** A repo-wide grep for `brand_color|accent_color|brandColor|studio_branding|workspace_branding|studio_settings` returns only: `products.accent_colors` (00240, product DNA), a spec-book `templateBranding.accentColor` (`supabase/functions/spec-book-render/render-model.ts:1099`), a `brandColors` design-token export (`packages/patina-design-system/src/tokens/colors.ts:5`), and an unused `brandColors?: {primary, secondary}` type in `packages/types/src/user-management.ts:155`. Studio brand today = **name + logo + website + address only**.

`address` JSONB shape written by the portal: `{line1, line2, city, state, zip}`.

**Logo storage**: `studio-logos` public bucket (created in `00320`), path `${studioId}/${Date.now()}.ext`, writes gated to org owner/admin, 2MB, png/jpeg/webp/svg.

### The canonical resolver

`resolve_studio_identity(p_project_id, p_designer_id, p_studio_id)` — `supabase/migrations/00320_studio_branding_read_and_logos.sql`, widened to three args by `00571`. Returns exactly one row of `(studio_id, name, logo_url, website, source)`. `SECURITY DEFINER`, `GRANT EXECUTE` to `anon` (brand-only columns; never email/phone/address/tax_id).

Precedence: `studio_id → org` · else `project.studio_id → org` · else designer's `_primary_studio_for` → org · else `profiles.business_name` · else `profiles.full_name`. `source` ∈ `'studio' | 'business_name' | 'full_name' | null`.

Three client wrappers, deliberately kept in step:
- **Deno**: `supabase/functions/_shared/studio-identity.ts` — `resolveStudioIdentity()`, `studioCobrand()`, `studioDisplayName()`, `resolveStudioSignature()`, `studioSignatureCity()`, `signatureCity()`
- **Portal TS**: `packages/supabase/src/hooks/use-studio-identity.ts` — `useStudioIdentity({studioId?, projectId?, designerId?})`, query key `['studio-identity', {...}]`, invalidated by `useUpdateOrganization`
- **Swift** (referenced in comments; not read)

### How branding lands in email

`studioCobrand(identity)` returns `{studioName, studioLogoUrl}` **only** when `source === 'studio' || 'business_name'`. Verbatim rationale:

> "a solo designer with just a personal name (source 'full_name') is the Patina-fronted sender, not a co-brand, so the byline is omitted (their name already carries in the greeting prose)."

`renderBrandedShell` then renders one of three header states:
1. `studioLogoUrl` set → logo `<img height="20" max-height:24px>` + studio name beside it, under the Patina wordmark
2. `studioName` only → mono line `Sent on behalf of ${studioName}`
3. neither → byte-identical to the plain Patina shell

`signOff({designerGivenName, studioName, city})` renders `— Leah, Middle West Studio<br>Chicago`. Verbatim:

> "The studio signs client mail, not Patina (R7): given name and studio name on one line, the city under it. With neither a person nor a studio to name the letter goes unsigned — a homeowner never reads '— Patina'."

City precedence: `profiles.city` → `organizations.address->>'city'` → omitted (never guessed).

### Emails that already use studio branding

`client-invite`, `invoice-emails`, `po-emails`, `quote-request-emails`, `trade-rfq-emails` (`${studio} would like your number`), `trade-agreement-emails`, `decision-notify`, `commercial-document-notify`, `proposal-send`, `proposal-nudge`, `proposal-sign-confirmation`, `review-requests`. DB template `workspace-invite` interpolates `{{studio_name}}` but has no logo.

**Non-email surfaces using studio identity**: `apps/client-portal/src/app/invoices/[invoiceId]/print/page.tsx` (logo in letterhead), `apps/client-portal/src/app/decisions/[id]/record/page.tsx`, `apps/client-portal/src/app/proposals/[id]/record/page.tsx`, `apps/client-portal/src/components/threshold/threshold.tsx`.

### Branding editor UI

`apps/designer-portal/src/components/document/account/account-studio-page.tsx` — inline rename, member roster, and a "Branding form (contact + address)" with `website / email / phone / line1 / line2 / city / state / zip`, plus `apps/designer-portal/src/components/document/account/studio-logo-upload-field.tsx`. Uses `@/components/ui/controls` (`Select`, `StatusBadge`).

---

## 3. Composer / preview UI in the designer portal

### Message composers (plain `<textarea>`, no rich text)

**There is no rich-text editor anywhere in the designer portal for email copy.** All message composition is plain textarea.

- `apps/designer-portal/src/components/document/overlays/send-sheet.tsx` — the closest analogue to a customizable invite. A `DocSheet` that slides over the open Proposal with **CC email, expiry select (7/14/21/30/none), and a personal-message textarea**:
  ```tsx
  <textarea id="send-sheet-message" rows={5}
    value={personalMessage} onChange={...}
    placeholder="Write a personal note to your client…"
    className={`${fieldCls} resize-y`} style={{ minHeight: 110 }} />
  ```
  It fires `proposalEvents.sent({ hasPersonalMessage, hasCcEmail, ... })`. It has a **"Client copy check"** validation panel but **no email preview** — the comment says "Preview does NOT stamp; only Send mutates," referring to the proposal preview, not an email render.
- `apps/designer-portal/src/components/document/commercial/service-agreement-send-sheet.tsx` — same pattern.
- `apps/designer-portal/src/components/portal/client-picker.tsx` — the "arm then Send invite" client-invite entry point.

**Controls library**: `apps/designer-portal/src/components/ui/controls/` — `button.tsx, input.tsx, select.tsx, textarea.tsx, filter-pill.tsx, icon-button.tsx, status-badge.tsx, index.ts`. Separately `packages/patina-design-system` exists (tokens + `useFormIntegration`) but the document-native surfaces use `@/components/ui/controls` and raw Tailwind with CSS vars (`--color-pearl`, `--color-charcoal`, `--color-clay`, `--color-aged-oak`).

### Email PREVIEW components

- `apps/designer-portal/src/components/email-builder/PreviewPane.tsx` — `<iframe srcDoc={previewHtml}>`, desktop 600px / mobile 375px toggle, driven by `useTemplateBuilderStore` + `renderTemplate` from `@patina/email/renderer`. **This is the reusable preview primitive.**
- `apps/designer-portal/src/components/email-builder/HtmlEditor.tsx` — raw-HTML textarea + live iframe, split 50/50.
- Admin mirrors: `apps/admin-portal/src/components/communications/email-builder/preview-pane.tsx` + `html-editor.tsx`.
- `apps/admin-portal/src/app/(dashboard)/communications/system-emails/page.tsx` — read-only viewer over `apps/admin-portal/src/data/system-email-previews.ts` (a **generated** file: `// GENERATED by scripts/emails/build.mjs — do not hand-edit.`) with pre-rendered GoTrue auth emails.
- `apps/designer-portal/src/app/api/admin/comms/templates/[id]/preview/route.ts` (and admin twin) — `POST` renders a template server-side. Note: `generatePreviewHtml` is a simplified renderer, **not** `renderBrandedShell`, and explicitly refuses raw-HTML passthrough.

---

## 4. Templating / personalization tokens

`supabase/functions/_shared/render-template.ts`:

- `interpolate(template, data)` — mustache-lite: `/\{\{\s*([\w.]+)\s*\}\}/g`, supports dotted paths, **missing keys render as empty strings "to avoid leaking placeholders"**. No conditionals, loops, or escaping.
- `brandDefaults()` — static merge-under vars every branded template gets: `app_url, dashboard_url, help_url, prefs_url, unsub_url, business_address`. Merged *under* caller data so caller keys win.
- `renderTemplateFromDb(supabase, slug, data)` — loads `email_templates` by slug, returns `null` if row missing / `is_active = false` / `html_content` empty, so **the caller falls back to its own inline builder**. Interpolates both `html_content` and `subject_default`.

`email_templates` schema (`00045`): `slug, name, description, category, subject_default, content_blocks JSONB, variables JSONB` (declared merge-tag list for the UI), `thumbnail_url, is_active, created_by`. Version history via `email_template_versions` + trigger (`00125`).

Tokens in active use: `{{studio_name}}, {{designer_name}}, {{client_name}}` (as `{{clientName}}`), `{{project_name}}, {{inviter_name}}, {{first_name}}, {{action_link}}, {{invite_message}}, {{accept_url}}, {{recipient_email}}, {{piece_name}}, {{dashboard_url}}`. Note casing is **inconsistent** — DB email templates mix `snake_case` (`{{studio_name}}`) and `camelCase` (`{{clientName}}`, `{{orderNumber}}`); SMS templates (`00284_field_dispatch_wiring.sql`) are consistently snake_case (`{{party_first_name}}, {{studio_name}}, {{project_name}}, {{item_title}}, {{link}}`).

There is **no** token-picker/merge-tag insertion UI component, despite the `variables` column being commented "for merge tag UI".

---

## 5. Tests and dev tooling

- **Local mail catcher: Mailpit/Inbucket at `http://127.0.0.1:54324`** (`supabase/config.toml:115` `[inbucket] enabled = true, port = 54324`). Note: `[inbucket]` warns as deprecated on every CLI invocation; the container is actually Mailpit (API `/api/v1/messages`).
- Mailhog also exists in `docker-compose.yml:67` (`patina-mailhog`) for the non-Supabase services, referenced in `CLAUDE.md:41` and `AGENTS.md:30`.
- **`EMAIL_DEV_MODE` env** in `send-email.ts`: `dry_run` (logs `[send-email:dry_run]`, no I/O) or `redirect` (rewrites recipient to `EMAIL_DEV_REDIRECT_TO` and prefixes subject `[DEV→addr] `).
- **No `/api/dev/email-preview` route exists.** Nothing under `apps/*/api/dev/`. Preview is only the template-builder iframe and the admin system-emails page.
- **Resend webhook**: `supabase/functions/resend-webhook/{index.ts, status-map.ts, status-map.test.ts}`. `RESEND_EVENT_STATUS` maps `email.delivered|opened|clicked|bounced|complained` → notification_log statuses. `DELIVERY_UPGRADE_FROM_STATUSES = [queued, sending, sent, unconfirmed, failed]`; `opened`/`clicked` deliberately excluded (Resend does not guarantee ordering). `isHardBounce()` suppresses on first hard/permanent bounce.
- **Send-log table: `notification_log`** (`supabase/migrations/00041_notification_log.sql:35`). **There is no `email_events` table.** Suppression flag lives on `profiles.email_suppressed`.
- **Known gap, documented in-repo** (`send-email.ts` and `status-map.ts` both carry it): ambiguous sends write `status='failed'` with `provider_id` NULL, so the webhook — which matches on `provider_id` — can never auto-upgrade them. "they need a reconciliation pass keyed on something else (e.g. the idempotency key)."
- Tests: `supabase/functions/_shared/*.test.ts` (Deno) incl. `branded-email.test.ts`, `studio-identity.test.ts`, `render-template.test.ts`, `send-email.test.ts`, plus the golden `__snapshots__/branded-shell.baseline.html`. Vitest: `packages/email/src/__tests__/{shell-structure,templates,designer-templates,consumer-templates,campaign-templates,send}.test.ts`.

---

## 6. Client-portal welcome / first-visit

**Two separate, unreconciled invite paths exist. This is the most important finding for a customizable invite feature.**

| | Path A — branded | Path B — auth magic link |
|---|---|---|
| Sender | `supabase/functions/client-invite/index.ts` | `apps/designer-portal/src/app/api/clients/invite/route.ts` |
| Transport | direct `fetch` to Resend (**bypasses `sendCompliantEmail`** — no suppression check, no `notification_log` row, no idempotency key) | `adminClient.auth.admin.inviteUserByEmail()` → GoTrue → `supabase/templates/invite.html` |
| Branding | full `renderBrandedShell` with studio co-brand + signOff | generic GoTrue invite template, no studio identity |
| Personal message | **yes** — `body.personalMessage` → `callout()` | none |
| Landing | `${CLIENT_PORTAL_URL}/auth/invite/${token}` | `${CLIENT_PORTAL_URL}/auth/callback?type=invite` |
| Table | `client_invitations` | `designer_clients` |
| Called from portal? | **no caller found** except the accept leg | yes — `useInviteAndLinkClient` (`packages/supabase/src/hooks/use-clients.ts:593`) from `client-picker.tsx` and `send-sheet.tsx` |

Path A's send leg appears to be **orphaned from the portal UI**: a repo-wide grep for `client-invite` in `apps/`/`packages/` returns exactly one hit — `apps/client-portal/src/app/api/auth/invite/accept/route.ts:27`, the *accept* proxy. Nothing calls `POST /client-invite` to send. Worth confirming with the team (could be called from iOS or an admin surface not reached).

Subject line, Path A (`client-invite/index.ts:135`):
```
`${senderName} invited you to Patina`
preview: `${senderName} would like to collaborate with you on Patina.`
eyebrow: 'Invitation'
body:  paragraph('Hi,')
       `${designerName} would like to collaborate with you on Patina.`
       [personal message callout]
       [Project: name]
       ctaButton(link, 'Accept invitation', 'brass')
       muted('This invitation expires in 7 days. …')
       signOff(...)
```

### Landing page — `apps/client-portal/src/app/auth/invite/[token]/page.tsx`

Server component, service-role read. Renders `ClientAuthShell` with:
```
title:       "Welcome to Patina."
description: `${designerName} invited you to collaborate${projectName ? ` on "${projectName}"` : ''}.`
```
and re-renders the personal message as a blockquote (`border-l-2 border-[#8FA18B] bg-[#f3f0e8]`) — **this is the one place the invite email's story already continues into the portal.** Error shells: "Invitation not found" / "Already accepted" / "Invitation expired".

Critically, the landing page uses `profiles.full_name || business_name || 'Your designer'` — it does **not** call `resolve_studio_identity`, so **the landing page can name a different sender than the email did** (email says "Middle West Studio", page says "Leah Quist"), and it renders **no studio logo**.

### First-visit experience

There is **no welcome modal and no "invited by <studio>" banner**. The client-portal first-visit surface is **the Threshold** — `apps/client-portal/src/components/threshold/threshold.tsx` and `doorstep.tsx`. It consumes `useStudioIdentity` and has explicit first-visit handling:

> "The since toggle is offered only when there IS a yesterday. A client reading the page for the first time is not asked what changed since a moment that never happened"

`readingMark?: string | null` — "null on a first visit". There is also `review-ask.tsx`. Nothing there references the invitation or its personal message. Gated by the `threshold` PostHog flag.

---

## 7. PostHog flag conventions

**Hook**: `apps/designer-portal/src/hooks/use-feature-flag.ts` → `useFeatureFlag(name): FeatureFlagState { value: boolean; isLoading: boolean }`.

**Naming**: lowercase kebab-case, no prefix/namespace. Currently in the designer portal:
```
agreement-library, agreement-parts, arrival-arc, call-sheet,
capture-producer-idempotency, design-build, onboarding-teammate-persona,
procurement-workspace-pilot, room-file, room-view-refined-path,
studio-invoice, studio-workspaces, tester-notes, threshold, worktable
```

**Fail-closed semantics** (verbatim from the file):
> "Defaults to `{ value: false, isLoading: true }` so gated features do not 'flash visible' before PostHog has loaded."
> "When PostHog can never initialize in this environment (no key, or dev [mode without the dev-override env]) … we stop loading immediately and stay fail-closed."

**Canonical consumption pattern** named in the docblock: render a skeleton/null while `isLoading`, branch on `value` only after it resolves — "See `/portal/procurement/layout.tsx` for the canonical pattern."

**E2E/CI escape hatch**: `parseFlagOverride(flagName)` reads `NEXT_PUBLIC_FLAG_OVERRIDES` in the format `flag-a:true,flag-b:false`. When present it resolves immediately with `isLoading: false` and never consults PostHog. Must stay a static `process.env.NEXT_PUBLIC_*` member expression for Next.js inlining; identical server and client (no hydration mismatch) but requires a dev-server restart to change. `playwright.config.ts` sets `procurement-workspace-pilot:true` via its `webServer` env.

Tests: `apps/designer-portal/src/hooks/__tests__/use-feature-flag.test.tsx`. Underlying analytics module: `apps/designer-portal/src/lib/analytics/posthog` (`isAnalyticsEnabled`, `isAnalyticsPossible`, `onAnalyticsInit`).

**No server-side flag helper exists in the designer portal** — `use-feature-flag.ts` is `'use client'` and is the only flag file. Gating an API route or edge function would need something new.

---

## Explicitly not found

- Any **brand color / accent color** column or studio-configurable palette. Studio brand = name + logo + website + address only.
- Any **`studios` / `studio_branding` / `workspace_branding` / `studio_settings`** table — studios are `organizations` rows.
- An **`email_events`** table — the send log is `notification_log`.
- A **`/api/dev/email-preview`** route or any dev-only email preview endpoint.
- Any **rich-text editor** for email/message copy (all plain `<textarea>`).
- Any **merge-tag/token-picker UI** component, despite `email_templates.variables` existing for that purpose.
- A **welcome modal or "invited by <studio>" banner** in the client portal.
- Any mechanism to make a **studio the `from` address** (only `reply_to`, and only in 4 designer-facing functions — not in `client-invite`).
- A **server-side feature-flag helper** for the designer portal.
- No caller of the **`client-invite` send endpoint** from any portal or package.
