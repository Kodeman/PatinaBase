# Product Catalog Test Cycle 1 — Issue List

## Summary
- **Pages tested**: 12 (across Designer Portal + Admin Portal)
- **Passed**: 9
- **Issues found**: 4
- **Blocked**: 3 (admin product detail empty, cross-portal validation)

---

## Issues Found (sorted by severity)

### SEED-BUG-001 — P0 (Blocker): Dev account password hashes incorrect in seed SQL
- **Route**: All portals `/auth/signin`
- **Steps**: Seed SQL uses hardcoded bcrypt hash that doesn't match `password123`
- **Expected**: Dev accounts can login with password `password123`
- **Actual**: Login fails with "Invalid login credentials" for all seeded dev accounts
- **Root Cause**: The bcrypt hash `$2a$10$PznUGzshiETs1TALEGEv3OVfZSCqJn8asFTzVSVq.F2BFAAC9ntg.` doesn't verify against `password123`. Possibly generated with a different algorithm version or salt rounds.
- **Fix**: Already applied — changed seed SQL to use `crypt('password123', gen_salt('bf'))` instead of hardcoded hash. File: `supabase/seed/dev-accounts.sql`
- **Status**: FIXED (in working tree)

### SEED-BUG-002 — P0 (Blocker): Dev accounts missing user_roles entries
- **Route**: Admin Portal `/catalog`
- **Steps**: Login as admin@patina.dev → redirected to `/unauthorized`
- **Expected**: Admin user can access admin portal
- **Actual**: "Access Denied" because `user_roles` table has no entries for dev accounts
- **Root Cause**: The `dev-accounts.sql` seed creates auth users but doesn't populate the `user_roles` table. The admin portal middleware checks `user_roles` for admin domain roles.
- **Fix needed**: Add INSERT statements to `dev-accounts.sql` that create `user_roles` entries mapping dev accounts to their appropriate roles (super_admin → admin domain, designer → designer domain, etc.)
- **Files**: `supabase/seed/dev-accounts.sql`

### D5-BUG-001 — P1 (Major): Categories API returns server error on designer portal
- **Route**: Designer Portal `/portal/catalog/categories`
- **Steps**: Navigate to categories page
- **Expected**: List of 8 categories (sofa, chair, table, etc.) from seed data
- **Actual**: "No categories defined yet." with console error: `AppError: A server error occurred`
- **Root Cause**: `/api/catalog/categories` endpoint fails. Likely RLS policy blocks the query, or the API route handler has an error.
- **Console Error**: `handleApiError` → React Query `onError` fires
- **Files**: `apps/designer-portal/src/app/api/catalog/categories/route.ts`, Supabase RLS policies on `categories` table

### A2-BUG-001 — P1 (Major): Admin product detail page renders empty
- **Route**: Admin Portal `/catalog/[productId]`
- **Steps**: Navigate to `/catalog/a0000000-0000-0000-0000-000000000001`
- **Expected**: Tabbed edit form (Details/Pricing/Media/Inventory/SEO) with product data
- **Actual**: Page loads with sidebar but main content area is completely empty
- **Root Cause**: The product detail component (`product-edit-client.tsx`) may fail to fetch product data via the API, or the component doesn't render. Needs investigation of the API route and client component.
- **Files**: `apps/admin-portal/src/app/(dashboard)/catalog/[productId]/page.tsx`, `apps/admin-portal/src/app/(dashboard)/catalog/[productId]/product-edit-client.tsx`, `apps/admin-portal/src/app/api/catalog/products/[id]/route.ts`

### ADMIN-AUTH-BUG-001 — P2 (Minor): Unauthorized page redirect loop
- **Route**: Admin Portal `/unauthorized`
- **Steps**: Non-admin user lands on `/unauthorized` → clicks "Sign in with a different account" → middleware redirects back because user is still authenticated
- **Expected**: Link signs out the user and shows the signin form
- **Actual**: Redirect loop between `/auth/signin` and `/unauthorized`
- **Root Cause**: Middleware redirects authenticated users away from auth pages to `/dashboard`, which checks admin role and redirects to `/unauthorized`. The "Sign in with a different account" link should sign out first.
- **Files**: `apps/admin-portal/src/middleware.ts`, `apps/admin-portal/src/app/unauthorized/page.tsx`

---

## Test Results Summary

### Designer Portal (localhost:3000)
| Test | Result | Notes |
|------|--------|-------|
| D1.1 Catalog list | PASS | 11 products, filters, search, view modes |
| D2.1 Product detail | PASS | All 8 detail zones render, breadcrumb, edit mode button |
| D3.1 Create product | PASS | Form with identity, specs, image upload, draft/publish |
| D4.1 Collections | PASS | Tab nav, "New Collection" button, empty state |
| D5.1 Categories | FAIL | API error, empty state despite 8 categories in DB |
| D6.1 Import | N/T | Not tested |
| Console | PARTIAL | Error on categories page only |

### Admin Portal (localhost:3001)
| Test | Result | Notes |
|------|--------|-------|
| A1.1 Catalog list | PASS | Full sidebar, search, view modes, create button |
| A2.1 Product detail | FAIL | Empty main content area |
| A4.1 Collections | PASS | Heading, search bar render |
| A5.1 Categories | PASS | "Add Category" button, tab nav |
| Console | CLEAN | No errors on tested pages |

---

## Fix Batches for Parallel Agents

### Batch E: Seed Data (SEED-BUG-001, SEED-BUG-002)
- File: `supabase/seed/dev-accounts.sql`
- Fix bcrypt hash (already done) + add user_roles entries for all dev accounts

### Batch A: Categories API (D5-BUG-001)
- Files: `apps/designer-portal/src/app/api/catalog/categories/route.ts`, Supabase RLS
- Debug why categories API returns 500

### Batch C: Admin Product Detail (A2-BUG-001)
- Files: `apps/admin-portal/src/app/(dashboard)/catalog/[productId]/page.tsx`, `product-edit-client.tsx`
- Debug why product detail renders empty

### Batch D: Admin Auth Flow (ADMIN-AUTH-BUG-001)
- Files: `apps/admin-portal/src/app/unauthorized/page.tsx`
- Add signout before redirecting to signin
