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

*Section pending Task 2.2 — will be filled in when Phase 2 lands.*

## 3. SSO end-to-end verification (Task 2.4)

*Section pending Task 2.4.*

## 4. Google OAuth re-enablement (when ready)

*Currently blocked by `external.google: false` at the Supabase project. Section will be added when Google OAuth is configured.*
