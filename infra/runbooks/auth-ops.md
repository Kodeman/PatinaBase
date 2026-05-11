# Auth operations runbook

Operational steps for the Patina authentication system that cannot be performed by code changes alone — Supabase Studio toggles, redirect-allowlist edits, deploy-time checks. Pair with the implementation plan at `docs/plans/patina-auth-full-rollout.md` (mirror of `~/.claude/plans/using-the-chrome-extention-lazy-stream.md`).

Self-hosted Supabase Studio: `https://supabase.patina.cloud`.
Self-hosted Supabase API (Kong): `https://api.patina.cloud`.

## Table of contents

1. [Enable MFA at the project level (Task 1.4)](#1-enable-mfa-at-the-project-level-task-14)
2. [Supabase redirect allowlist for SSO + iOS deep link (Task 2.2)](#2-supabase-redirect-allowlist-task-22)
3. [SSO end-to-end verification (Task 2.4)](#3-sso-end-to-end-verification-task-24)
4. [Google OAuth re-enablement (when ready)](#4-google-oauth-re-enablement-when-ready)

---

## 1. Enable MFA at the project level (Task 1.4)

**Why:** The admin portal middleware at `apps/admin-portal/src/middleware.ts` lines 87-106 enforces TOTP MFA when `profiles.mfa_enforced = true`, but the self-hosted Supabase project currently has `mfa_enabled: false` (verified 2026-05-11 via `GET https://api.patina.cloud/auth/v1/settings` → `{ "mfa_enabled": false, ... }`). Until this flag is on, enrollment at `/auth/mfa-enroll` cannot succeed and the middleware silently fails open (lines 108-110 in the admin middleware).

**Who:** Anyone with admin access to the Supabase Studio.

**Risk:** Low. Enabling MFA at the project level does not enforce it on any user — it only allows users to enroll TOTP factors. Enforcement is per-user via `profiles.mfa_enforced`.

### Steps

1. Sign in to `https://supabase.patina.cloud` as a Studio admin.

2. Open Authentication → Providers → Multi-Factor Authentication. Enable TOTP. Save.

3. Verify by querying the public settings endpoint:
   ```bash
   curl -s "https://api.patina.cloud/auth/v1/settings" \
     -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
     | jq '.mfa_enabled'
   ```
   Expected: `true`.

   If Studio doesn't expose this toggle directly (some self-hosted Supabase Studios don't surface MFA settings yet), use the GoTrue admin API:
   ```bash
   curl -X PATCH "https://api.patina.cloud/auth/v1/admin/settings" \
     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -d '{"MFA_ENABLED":true}'
   ```
   The flag name varies by GoTrue version. If neither `MFA_ENABLED` nor `mfa_enabled` works via API, edit the GoTrue env var directly. In `infra/coolify/docker-compose.supabase-coolify.yml` (or equivalent), find the `auth` (GoTrue) service and add/set:
   ```
   GOTRUE_MFA_ENABLED=true
   ```
   Then restart the auth service (Coolify UI: auth service → Restart, or via SSH: `docker compose -f /path/to/compose.yml up -d --force-recreate auth`).

4. Re-verify with the curl above. Must return `true`.

### Smoke test the admin enrollment flow

1. As the `super_admin` user (currently `kody@kochaver.com`, profile UUID `e01db20f-87c6-45a6-bc18-84c68e0e7452`), sign in to `https://admin.patina.cloud`.

2. Navigate to `https://admin.patina.cloud/auth/mfa-enroll`. Confirm a QR code + base32 secret render.

3. Add the factor to an authenticator app (1Password, Authy, Google Authenticator). Enter the 6-digit code. Confirm the page lands on `/dashboard` and the session is now `aal2`.

4. Set `profiles.mfa_enforced = true` for a non-critical test user:
   ```sql
   -- Studio SQL editor or psql against the prod DB
   UPDATE public.profiles
   SET mfa_enforced = true
   WHERE email = '<test-admin-email>';
   ```

5. Sign out and sign back in as that user. Confirm the middleware bounces to `/auth/mfa-enroll` (admin-portal middleware line 102).

### Rollback

If MFA enablement breaks an admin's ability to sign in, immediately:

```sql
UPDATE public.profiles SET mfa_enforced = false WHERE mfa_enforced = true;
```

This restores fail-open behavior. Then disable `GOTRUE_MFA_ENABLED` and restart the auth service if needed.

### Done when

- [ ] `https://api.patina.cloud/auth/v1/settings` returns `mfa_enabled: true`
- [ ] Test admin user successfully enrolls TOTP via `/auth/mfa-enroll`
- [ ] Test admin user with `profiles.mfa_enforced = true` is bounced to enrollment on signin
- [ ] Production admin (`kody@kochaver.com`) has enrolled their own TOTP factor (do this BEFORE flipping `mfa_enforced = true` on the super_admin account)
- [ ] `mfa_enforced = true` is set on at least the super_admin

---

## 2. Supabase redirect allowlist (Task 2.2)

**Why:** With Phase 2's cookie-domain change in `@patina/supabase`, all three portal subdomains plus iOS deep links must be on Supabase's redirect allowlist so OAuth callbacks, magic-link redirects, and recovery flows all succeed. Without this, OAuth providers will reject the redirect with `invalid_redirect_uri` and magic links will silently 404.

**Who:** Studio admin (`kody@kochaver.com`).

**Risk:** Low. Adding entries to the allowlist is purely additive; the only way to break things is to leave a typo'd URL on the list that an attacker could target as an open redirect. Use the exact URLs below.

### Steps

1. Sign in to `https://supabase.patina.cloud` as a Studio admin.

2. Open Authentication → URL Configuration.

3. **Site URL:** confirm the primary canonical app URL is set to `https://app.patina.cloud`. (Supabase uses Site URL as the default redirect destination when no explicit `redirectTo` is provided by the calling code.)

4. **Additional Redirect URLs:** ensure ALL of the following are listed (paste each on its own line, or use the multi-input UI; Supabase deduplicates):

   ```
   https://app.patina.cloud
   https://app.patina.cloud/auth/callback
   https://app.patina.cloud/auth/verify-otp
   https://admin.patina.cloud
   https://admin.patina.cloud/auth/callback
   https://admin.patina.cloud/auth/verify-otp
   https://client.patina.cloud
   https://client.patina.cloud/auth/callback
   https://client.patina.cloud/auth/verify-otp
   patina://auth/callback
   patina://auth/qr
   ```

   Notes:
   - The `/auth/callback` paths handle OAuth + recovery redirects.
   - The `/auth/verify-otp` paths handle magic-link redirects from Phase 3.
   - `patina://auth/callback` is the iOS deep-link target for password resets and magic links.
   - `patina://auth/qr` is the iOS deep-link target for cross-device QR pairing (used by `QRAuthService.handleDeepLink`).

5. Click Save. Supabase may not surface a verification UI; cross-check by triggering an OAuth signin (see Section 3) and inspecting the redirect chain in DevTools → Network. The `auth/v1/authorize` redirect should bounce to the requested URL without an `error=invalid_redirect_uri` query string.

6. If using the management API instead of the Studio UI:
   ```bash
   # Pseudo-command — exact endpoint varies by GoTrue version. Verify against
   # https://supabase.com/docs/reference/api/v1-update-a-project-config
   curl -X PATCH "$SUPABASE_URL/auth/v1/admin/config" \
     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "SITE_URL": "https://app.patina.cloud",
       "URI_ALLOW_LIST": "https://app.patina.cloud,https://app.patina.cloud/auth/callback,https://app.patina.cloud/auth/verify-otp,https://admin.patina.cloud,https://admin.patina.cloud/auth/callback,https://admin.patina.cloud/auth/verify-otp,https://client.patina.cloud,https://client.patina.cloud/auth/callback,https://client.patina.cloud/auth/verify-otp,patina://auth/callback,patina://auth/qr"
     }'
   ```
   If Studio doesn't allow saving the custom URL scheme (`patina://`) directly, set `GOTRUE_URI_ALLOW_LIST` via the GoTrue env in `infra/coolify/docker-compose.supabase-coolify.yml` and restart the auth service.

### Done when

- [ ] Site URL = `https://app.patina.cloud`
- [ ] Additional Redirect URLs list contains all 11 entries above
- [ ] Triggering a password-reset email from a portal sends an email whose link goes through `auth/v1/verify` and lands on `https://<portal>/auth/callback?type=recovery&...` (NOT the Supabase default `localhost:3000` placeholder)
- [ ] Triggering a magic link from a portal completes a full sign-in
- [ ] Tapping a magic-link in iOS Mail opens the Patina app via `patina://auth/callback`

## 3. SSO end-to-end verification (Task 2.4)

Run this AFTER deploying the Phase 2 changes (cookie-domain helper, redirect-cookie attribute preservation, portal-domain middleware on designer + client). Confirms cross-subdomain SSO works as designed.

**Prerequisites:**
- Phase 1 + Phase 2 deployed to all three portals
- Section 2 (redirect allowlist) complete
- At least one user with role(s) in EACH of these domains:
  - `admin` (kody@kochaver.com qualifies)
  - `designer`-only (no admin) — find one via `select email from profiles p join user_roles ur on ur.user_id = p.id join roles r on r.id = ur.role_id where r.domain = 'designer' and not exists (select 1 from user_roles ur2 join roles r2 on r2.id = ur2.role_id where ur2.user_id = p.id and r2.domain = 'admin');`
  - `consumer`-only — similar pattern with `domain = 'consumer'`

### Test matrix

Run each in a fresh incognito window. Use DevTools → Application → Cookies to inspect the Supabase auth cookie.

#### Test 1 — Admin staff: cross-portal session shares (positive)

1. Sign in as `kody@kochaver.com` on `https://app.patina.cloud`
2. Confirm cookie scope: `sb-<ref>-auth-token` has `Domain=.patina.cloud`, `Secure`, `SameSite=Lax`, `Path=/`
3. Open `https://admin.patina.cloud` in a new tab in the SAME incognito window
4. Expected: signed in (no signin redirect)
5. Open `https://client.patina.cloud` in a new tab
6. Expected: signed in but bounced to `/unauthorized` because kody's roles don't include the `consumer` domain
7. Confirm `/unauthorized` shows the wrong-portal panel + sign-out link

#### Test 2 — Designer-only user: blocked on admin + client (negative carryover)

1. Sign in as the designer-only user on `https://app.patina.cloud`
2. Confirm landing on `/portal` (the designer workspace)
3. Open `https://admin.patina.cloud` in a new tab
4. Expected: signed in but bounced to admin's `/unauthorized` (admin middleware's `roles.domain='admin'` check blocks)
5. Open `https://client.patina.cloud` in a new tab
6. Expected: signed in but bounced to client's `/unauthorized` (client middleware's `{consumer, admin}` check blocks)

#### Test 3 — Consumer-only user: blocked on app + admin (negative carryover)

1. Sign in as the consumer-only user on `https://client.patina.cloud`
2. Confirm landing on `/` (client home)
3. Open `https://app.patina.cloud` in a new tab
4. Expected: signed in but bounced to designer's `/unauthorized`
5. Open `https://admin.patina.cloud` in a new tab
6. Expected: signed in but bounced to admin's `/unauthorized`

#### Test 4 — Sign-out propagates across portals

1. Sign in as `kody@kochaver.com` on `https://app.patina.cloud`
2. Open `https://admin.patina.cloud` in a new tab; confirm signed in
3. On the `app.patina.cloud` tab, sign out
4. Reload the `admin.patina.cloud` tab
5. Expected: bounced to `/auth/signin` (cookie removal propagated)
6. Inspect cookies: `sb-<ref>-auth-token` should be absent or expired with `Domain=.patina.cloud`

#### Test 5 — Apple OAuth callback respects allowlist

1. From `https://app.patina.cloud/auth/signin`, click "Continue with Apple"
2. Complete Apple flow
3. Expected: redirect chain through `/auth/callback?code=...`, then land on `/portal`. No `error=invalid_redirect_uri` query string anywhere in the chain.

#### Test 6 — Password reset callback respects allowlist

1. From `https://app.patina.cloud/auth/signin`, click "Forgot password"
2. Submit your email
3. Open the inbox email
4. Click the reset link
5. Expected: land on `https://app.patina.cloud/auth/callback?type=recovery&...` and proceed to a password-set form. No `localhost` placeholder.

#### Test 7 — Middleware redirect preserves cookie attributes

This is the Task 2.1 follow-up regression test (the one that fixed `redirectWithCookies` dropping attributes).

1. Clear all cookies
2. Visit `https://app.patina.cloud/portal/clients` directly (a protected page)
3. Expect redirect to `https://app.patina.cloud/auth/signin?callbackUrl=/portal/clients`
4. Inspect Set-Cookie headers on the redirect response (DevTools → Network → the 307 response)
5. Expected: any `sb-` cookies in the Set-Cookie chain have `Domain=.patina.cloud`, `Secure`, `SameSite=Lax`

### Done when

- [ ] All 7 tests above pass
- [ ] Cookie inspection confirms `Domain=.patina.cloud` on every Supabase auth cookie
- [ ] No `invalid_redirect_uri` observed in any OAuth or magic-link redirect chain
- [ ] No regression: previously-working flows (Apple OAuth, password reset) still succeed

### Rollback

If SSO breaks production sign-ins:
1. Revert the `getCookieDomain` env-var override path: set `SUPABASE_COOKIE_DOMAIN=` (empty) in each portal's Coolify env. With no domain returned, cookies revert to host-only scope.
2. If that's insufficient, revert commits `cb32565` (Task 2.1) and `5bf0b21` (Task 2.1 follow-up) and redeploy.
3. The portal-domain checks (Task 2.3) can be disabled by removing the `SUPABASE_SERVICE_ROLE_KEY` env var from a portal — the middleware fails open without it. Use sparingly; this opens cross-portal access for all signed-in users.

## 4. Google OAuth re-enablement (when ready)

*Currently blocked by `external.google: false` at the Supabase project. Section will be added when Google OAuth is configured.*
