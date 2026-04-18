# Client Portal Test Cycle 1 — Issue List

## Summary
- **Total test cases**: 42
- **Passed**: 15
- **Failed/Issues found**: 5
- **Skipped**: 22 (empty state — no test data for decisions, messages, scope changes)

## Cycle 2 Retest Results

### AUTH-BUG-001 (P0) — FIXED
- Dev accounts now seeded via `supabase/seed/dev-accounts.sql`
- All 7 @patina.dev accounts created with proper identities
- Fixed bcrypt hash (was hardcoded wrong, now uses `crypt('password123', gen_salt('bf'))`)
- `client@patina.dev` login verified working via API

### AUTH-BUG-002 (P1) — FIXED
- Seed credentials doc updated (handled by seed agent)
- Dev accounts SQL added to `supabase/config.toml` sql_paths

### AUTH-BUG-003 (P1) — PARTIALLY FIXED
- Code fix is correct: QRLoginDisplay returns null when baseUrl is empty
- Hook fix is correct: skips generateSession() when no baseUrl
- However, in local dev, NEXT_PUBLIC_QR_AUTH_URL=http://localhost:3000 (designer portal), which IS set but the QR endpoint doesn't exist on that server
- The "Failed to fetch" still shows because the QR auth service isn't running locally — this is expected behavior for local dev without the QR service
- Fix works correctly for production (where QR_AUTH_URL would be empty if QR auth is disabled)

### PROJ-BUG-001 (P3) — FIXED
- Pluralization fix applied to `apps/client-portal/src/app/projects/page.tsx`
- "1 approvals" → "1 approval", "1 messages" → "1 message"

### Remaining Issue — AUTH-BUG-003b (P2, new)
- QR login error state needs improvement: when QR auth URL is configured but the service is unavailable, should hide the QR section gracefully instead of showing "Failed to fetch"
- Suggested fix: catch fetch errors in the hook and if the error is a network error (service unavailable), set state to 'idle' instead of 'error'

---

## Issues Found (sorted by severity)

### AUTH-BUG-001 — P0 (Blocker): Dev accounts not seeded in Supabase
- **Test Case**: AUTH-01
- **Route**: `/auth/signin`
- **Steps**: 1. Navigate to signin 2. Expand Dev Accounts 3. Click "Sign In" for Client User
- **Expected**: Login succeeds, redirect to /projects
- **Actual**: "Login Failed. Login failed. Check that the user-management service is running."
- **Root Cause**: Only `designer@patina.dev` exists in `auth.users`. The client dev account (`client@patina.dev`) and all other dev accounts from `DEV_ACCOUNTS` in `packages/types/src/dev-accounts.ts` are not seeded. The seed SQL in `supabase/seed/` does not create these accounts.
- **Files**: `supabase/seed/` (missing dev account seeding), `packages/types/src/dev-accounts.ts` (defines accounts)
- **Fix**: Add SQL seed that creates all 7 dev accounts in `auth.users` and `auth.identities` tables with bcrypt-hashed `password123` password.

### AUTH-BUG-002 — P1 (Major): Seed credentials file references non-existent users
- **Test Case**: AUTH-02
- **Route**: `/auth/signin`
- **Steps**: 1. Try email login with `client.test@patina.cloud` / `Client-4Rt8!2wLm`
- **Expected**: Login succeeds
- **Actual**: "Invalid login credentials" — user doesn't exist in Supabase
- **Root Cause**: `infra/seed-credentials.md` documents users (`client.test@patina.cloud`, `designer.test@patina.cloud`) that are never actually created in Supabase seed data.
- **Files**: `infra/seed-credentials.md` (stale/incorrect documentation)
- **Fix**: Either create the documented seed users in the Supabase seed SQL, or update `seed-credentials.md` to reference the actual dev accounts (`client@patina.dev`, `designer@patina.dev`, password: `password123`).

### AUTH-BUG-003 — P1 (Major): QR code login shows "Failed to fetch"
- **Test Case**: AUTH-08
- **Route**: `/auth/signin`
- **Steps**: 1. Navigate to signin page
- **Expected**: QR code renders or gracefully shows "not available"
- **Actual**: Shows broken QR icon with red "Failed to fetch" text and a "Try again" button
- **Root Cause**: `NEXT_PUBLIC_QR_AUTH_URL` is empty string (no QR auth service running locally). The `QRLoginDisplay` component doesn't gracefully handle the case where the QR auth URL is not configured.
- **Files**: `apps/client-portal/src/components/auth/QRLoginDisplay.tsx`
- **Fix**: When `baseUrl` is empty/falsy, hide the QR section entirely instead of showing a broken state. Show it only when the QR auth service is actually configured.

### PROJ-BUG-001 — P3 (Cosmetic): Incorrect pluralization of "approvals" and "messages"
- **Test Case**: PROJ-01
- **Route**: `/projects`
- **Steps**: 1. View project cards
- **Expected**: "1 approval", "1 message" (singular when count is 1)
- **Actual**: "1 approvals", "1 messages"
- **Files**: `apps/client-portal/src/app/projects/page.tsx` (or component rendering project cards)
- **Fix**: Add simple pluralization: `${count} ${count === 1 ? 'approval' : 'approvals'}`

### DETAIL-BUG-001 — P3 (Cosmetic): Stale relative timestamps
- **Test Case**: DETAIL-01
- **Route**: `/projects/project-lakefront-condo`
- **Steps**: 1. View activity feed and messages
- **Expected**: Reasonable relative timestamps
- **Actual**: Shows "about 1 year ago" for all activities because seed data uses Jan-Feb 2025 dates
- **Root Cause**: Seed data has hardcoded 2025 dates. Not a code bug — seed data should be refreshed.
- **Files**: Seed data configuration (wherever project mock data is defined)
- **Fix**: Use dynamic dates relative to current date in seed data, or accept as known limitation of static seed data.

---

## Test Results Summary

| Test ID | Result | Notes |
|---------|--------|-------|
| AUTH-01 | FAIL | Dev account not seeded (AUTH-BUG-001) |
| AUTH-02 | FAIL | Seed creds user doesn't exist (AUTH-BUG-002) |
| AUTH-02b | PASS | Email login works with designer@patina.dev |
| AUTH-03 | PASS | Wrong creds shows "Invalid email or password" |
| AUTH-04 | PASS | Route guard redirects to signin with callbackUrl |
| AUTH-05 | PASS | Callback URL redirect works (tested via AUTH-04 flow) |
| AUTH-06 | PASS | Authenticated user redirected from /auth/signin to /projects |
| AUTH-07 | SKIP | Can't test auth error page while authenticated (redirects) |
| AUTH-08 | FAIL | QR code shows "Failed to fetch" (AUTH-BUG-003) |
| PROJ-01 | PASS | Projects page renders with 2 cards, progress, milestones |
| PROJ-02 | PASS | Project cards are links to /projects/[id] |
| PROJ-03 | PASS | Header has logo, project switcher, approval/message counts |
| DETAIL-01 | PASS | Project overview renders with all fields |
| DETAIL-02 | PASS | Timeline shows 6 phases with correct status indicators |
| DETAIL-03 | PASS | Milestone expands with checklist, approval, messages |
| DETAIL-07 | N/A | Invalid project not tested (would need specific ID) |
| DEC-01 | PASS | Decisions page loads with title and empty state |
| DEC-06 | PASS | Empty state: "No decisions yet..." |
| MSG-01 | PASS | Messages page loads with two-column layout, search, empty state |
| ERR-01 | PASS | 404 page: "404", "Page not found", home/projects links |
| DEMO-01 | PASS | Approval flow demo renders all components |
| DEMO-02 | PASS | Timeline demo renders 6 milestones with keyboard nav |
| ERR-02 | PASS | Console clean on all tested pages |
| ERR-03 | N/A | Network tracking started after page loads |

---

## Fix Batches for Parallel Agents

### Batch A: Seed Data (AUTH-BUG-001, AUTH-BUG-002)
- Files: `supabase/seed/`, `infra/seed-credentials.md`
- Create dev accounts seed SQL + fix documentation

### Batch B: QR Login Display (AUTH-BUG-003)
- Files: `apps/client-portal/src/components/auth/QRLoginDisplay.tsx`
- Hide QR section when URL not configured

### Batch C: Pluralization Fix (PROJ-BUG-001)
- Files: `apps/client-portal/src/app/projects/page.tsx` or related component
- Fix "1 approvals" → "1 approval"
