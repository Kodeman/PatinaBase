# L0.2b — The Document's read paths · task list

Wave **W0** · branch `first-flight/w0-l02b` · worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l02b` · base `3b7916db1`.

Read in this order before touching anything: `rulings-2026-09-02.md` (**D8** governs this lane's
sequencing), `PROGRAM.md` §3 W0 L0.2b + §7 + §2, `waves/w0/steward.md`.

This lane closes **no audit finding**. Its three sites came out of 00555's own adversarial review and
are recorded here as **FF-01a / FF-01b / FF-01c**. One of them — FF-01a — is a **live unauthenticated
leak on production today**, independent of the migration.

---

## The four standing lines

**1. `IOS_GATE_UDID`.** *Not applicable to this lane.* L0.2b is a designer-portal + shared-hooks lane;
`steward.md` §3 assigns simulator clones to **L0.1 (`8ED58095-6FFA-4411-B715-73C98805C874`)** and
**L0.7 (`BD0AC7E5-EF5E-4C64-85A7-825D0CEA7BE8`)** only. This lane owns no clone, runs no
`xcodebuild`, and runs **no tier of `ios-gate.sh`** — including `build`. Nothing here touches
`apps/mobile/**`. If a step in this list ever appears to need a simulator, that step is out of scope
and becomes an integration note, not a commit.

**2. The VISION check.** *Name any finding in my table whose fix would add or entrench something
VISION §6 refuses (tab / zone / dashboard UI, shadows, red/green status, badges, engagement
optimisation, the "AI" label) and say why it survives.*

> **Answer: none of the three.** FF-01a/b are server route guards and a `select('*')` → named-column
> narrowing inside `apps/designer-portal/src/app/api/catalog/vendors/**`; FF-01c swaps one client
> hook's data source from a table read to an RPC. No lane file renders a pixel, emits a string a
> homeowner or a designer reads, or changes an information architecture. The only user-visible
> difference is that an **unauthenticated** caller now receives `401 {"error":"Unauthorized"}` instead
> of the trade file — which is VISION §1's surface #1 protecting itself, not new UI. No copy is added,
> so the "AI"/brand-voice sweep is unchanged by this lane. **Zero rows go to Fable as VISION
> exceptions.**

**3. The notes I must apply** (integration notes addressed to L0.2b). **None received.** The lane's
inbound dependency is a *shape*, not a note: `public.list_vendor_profiles()` as drafted by L0.2 in
`build/migrations-draft/00555_ios_round_one_security.sql` §(a4) —

```sql
CREATE OR REPLACE FUNCTION public.list_vendor_profiles()
RETURNS TABLE (id uuid, full_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
```
— no arguments, already `ORDER BY p.full_name` inside the function body,
`REVOKE EXECUTE … FROM PUBLIC, anon` / `GRANT EXECUTE … TO authenticated`. **00555 has not been
applied anywhere** (`steward.md` §4: local head is `00554`; neither `00555` nor `00556` exists in
`supabase/migrations/`), so Task 3's test **mocks the RPC**. That is the only honest level available
before the apply, and the task list says so rather than implying a live call was proven.

**4. The notes I will send** (changes this lane wants in another lane's file) — exact final text in
`waves/w0/l02b-notes.md`:

- **→ L0.2** — one case for `supabase/tests/rls/00555_ios_round_one_security.test.sql`
  (`anon` cannot `EXECUTE list_vendor_profiles`, `authenticated` can, the return shape carries no
  `email`). PROGRAM.md §3 lists this test under *"Tests this lane must add"*, but the file lives under
  `supabase/tests/**` — **not** one of L0.2b's three owned globs — so it ships as a note, not a commit.
- **→ L0.2** — the `list_vendor_profiles()` signature this lane is now compiled against, and the fact
  that a later `p_query`/`LIMIT` parameter would be a **breaking** change to a shipped caller.
- **→ Fable / L0.2** — the D8 Step-0 evidence line: 00555 is not clear to apply until this lane's PR is
  on `main` **and** `wrangler deployments list --name patina-designer-portal` shows a bottom row newer
  than that merge commit.

---

## Gate (verbatim, from `PROGRAM.md` §3 W0 L0.2b — run from this worktree)

```bash
pnpm --filter @patina/supabase test
pnpm --filter designer-portal test -- src/app/api/catalog/vendors
pnpm --filter designer-portal build      # admin/designer builds enforce types
pnpm type-check
```

Every claim in the report is levelled: **compile-green** (build/type-check), **test-green** (the two
suites), **not verified** (anything on production — this lane runs zero production commands).

---

## Task 1 — FF-01a · `GET /api/catalog/vendors` gains a `getUser()` guard and named public-face columns

**Why.** `route.ts:5-13` has no auth guard and the designer-portal middleware passes `/api/*` through,
so `curl https://app.patina.cloud/api/catalog/vendors` returns **all 37 vendor columns — the 13-column
trade file included — to anyone**. This is exposure #3 of the three in PROGRAM.md §1, it is live right
now, and **00555 does not fix it** — 00555 converts it into a 500 (the route runs as the *anon* key when
no session exists, and after the column revoke `select('*')` 42501s). The guard is correct with or
without the migration, which is why it is task one.

**Files:** `apps/designer-portal/src/app/api/catalog/vendors/route.ts`,
`apps/designer-portal/src/app/api/catalog/vendors/__tests__/auth-guard.test.ts` (new).

1. **Write the failing test.** New `__tests__/auth-guard.test.ts`, `/** @jest-environment node */`,
   `jest.mock('@patina/supabase/server', () => ({ createServerClient: jest.fn() }))` — the pattern
   `src/app/api/catalog/import/__tests__/route.test.ts` already uses in this app. Three cases for the
   list route: (a) `getUser()` → `{ data: { user: null } }` ⇒ **401** and `from` never called;
   (b) `getUser()` → an `authError` with a user ⇒ **401**; (c) a signed-in user ⇒ **200** with
   `{ vendors: [...] }`, and the `select()` argument contains **no `*`** and **none of** the 13 trade
   column names.
2. **Run it — expect red.** `pnpm --filter designer-portal test -- src/app/api/catalog/vendors`
3. **Implement.** Add, immediately after `createServerClient()`:
   `const { data: { user }, error: authError } = await supabase.auth.getUser();`
   `if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });`
   — the same shape `api/admin/catalog/vendors/route.ts:9-13` already ships, with the charter's
   `Unauthorized` body. Then replace `.select('*')` with the **24 named public-face columns**, which are
   exactly 00555 §(c)'s `GRANT SELECT (…) TO anon` allowlist: `id, name, website, logo_url,
   hero_image_url, market_position, production_model, founded_year, ownership, headquarters_city,
   headquarters_state, parent_company_id, primary_category, secondary_categories, designer_rating_avg,
   review_count, lead_times, social_links, brand_story, made_in, is_patina_catalog, founding_circle,
   created_at, updated_at`. Keep the `{ vendors: data ?? [] }` envelope, the `name` ordering, the 500
   branch and the try/catch untouched — this is a security fix, not a redesign.
4. **Run it — expect green.**
5. **Commit** (pathspec only):
   `git add apps/designer-portal/src/app/api/catalog/vendors/route.ts apps/designer-portal/src/app/api/catalog/vendors/__tests__/auth-guard.test.ts`
   → `fix(designer-portal): guard GET /api/catalog/vendors and name its public-face columns`

---

## Task 2 — FF-01b · `GET /api/catalog/vendors/[id]` gains the same guard; the trade file stays, behind it

**Why.** Same missing guard at `[id]/route.ts:5-18`, same `select('*')`. The difference the charter is
explicit about: the detail route **legitimately renders trade fields for a signed-in designer** — keep
them, do not remove them. So the detail select is the 24 public-face columns **plus** the 13 trade
columns = the table's full 37, named rather than starred. Naming them is what makes the split
reviewable and what stops a future column from being published by accident.

**Files:** `apps/designer-portal/src/app/api/catalog/vendors/[id]/route.ts`, the same test file.

1. **Write the failing test.** Extend `auth-guard.test.ts` with three detail-route cases:
   unauthenticated ⇒ **401** and `from` never called; signed-in ⇒ **200** with the row, the `select()`
   argument containing **no `*`** and **containing** `trade_terms` and `orders_email` (the trade file is
   deliberately still served — behind the guard); and signed-in + `PGRST116` ⇒ **404**, so the
   not-found branch survives the change.
2. **Run it — expect red.**
3. **Implement.** Same guard block, then `.select(...)` with all 37 named columns. `.eq('id', id)`,
   `.single()`, the `PGRST116` → 404 branch, the 500 branch and the bare-`data` response shape are
   unchanged.
4. **Run it — expect green.**
5. **Commit:**
   `git add "apps/designer-portal/src/app/api/catalog/vendors/[id]/route.ts" apps/designer-portal/src/app/api/catalog/vendors/__tests__/auth-guard.test.ts`
   → `fix(designer-portal): guard GET /api/catalog/vendors/[id] and name its columns`

---

## Task 3 — FF-01c · `useVendorProfiles` reads `list_vendor_profiles()` instead of `profiles`

**Why.** `packages/supabase/src/hooks/use-comms.ts:1060-1065` is
`.from('profiles').select('id, full_name, avatar_url').eq('role','vendor')` with `if (error) throw`.
After 00555 revokes anon/`role = 'vendor'` visibility on `profiles`, this hook does **not** degrade to
an empty list — it **throws `42501 permission denied for table profiles`**, and every designer-portal
screen that lists vendors renders an error state. The RPC is 00555's own recommendation (i); option
(ii), a `USING (role = 'vendor')` policy leg, re-opens every vendor's full row (email, phone,
`stripe_customer_id`) to every signed-in user and was **not taken**.

**Files:** `packages/supabase/src/hooks/use-comms.ts` (the `useVendorProfiles` body **only**),
`packages/supabase/src/hooks/__tests__/use-comms.test.ts` (new).

1. **Write the failing test.** New vitest file on the house rig
   (`__tests__/use-direct-orders.test.ts` is the template: `vi.mock('@supabase/ssr')` returning a stub
   client — mocking `@patina/supabase` itself no-ops under paths+SWC — plus `vi.mock('@tanstack/
   react-query')` so `useQuery` returns its config and the `queryFn` can be awaited directly). Four
   cases: the `['comms','vendor-profiles']` key is unchanged; `queryFn` calls
   **`supabase.rpc('list_vendor_profiles')` with no arguments** and **never** `supabase.from`; `data:
   null` ⇒ `[]`; an RPC error ⇒ the promise **rejects** (the `if (error) throw` is kept — with the RPC
   it can no longer be a 42501, and swallowing it would hide a real outage).
   **The RPC is mocked**: 00555 is unapplied locally (`steward.md` §4 — local head `00554`), so a
   live-call claim is not available to this lane and is not made.
2. **Run it — expect red.** `pnpm --filter @patina/supabase test`
3. **Implement.** Replace the four chained `.from(...)` lines with
   `const { data, error } = await supabase.rpc('list_vendor_profiles');`. Drop the client-side
   `.order('full_name')` — the function body already carries `ORDER BY p.full_name`, and re-sorting a
   sorted result is noise. Keep `if (error) throw error`, keep the `(data ?? [])` cast and the returned
   row shape (`id`, `full_name`, `avatar_url`) so no caller changes, keep `staleTime: 60_000`. Update
   the doc comment to say where the rows now come from and what happens before 00555 lands.
4. **Run it — expect green.**
5. **Commit:**
   `git add packages/supabase/src/hooks/use-comms.ts packages/supabase/src/hooks/__tests__/use-comms.test.ts`
   → `fix(supabase): read the comms vendor picker through list_vendor_profiles`

---

## Task 4 — The full gate, the notes, and the hand-off

1. Run all four gate commands from §Gate, in order, and record each one's verbatim tail.
   `pnpm --filter designer-portal build` is the one that enforces types on this app; `pnpm type-check`
   is the workspace-wide pass.
2. Write `waves/w0/l02b-notes.md` with the **exact final text** of the three outbound notes.
3. `git status --porcelain` must list nothing this lane does not own.
4. **Nothing else runs.** No deploy, no `db push`, no `supabase functions deploy`, no `wrangler`, no
   `psql` against Strata, no `mcp__claude_ai_Supabase__*` write. The deploy and both production probes
   are Kody-run lines in the report's `kodyRun` list, and this lane's exit criteria are only met once
   Kody has run them.

---

## What this lane does **not** touch

- `supabase/tests/rls/00555_ios_round_one_security.test.sql` — L0.2's file (note sent instead).
- `apps/mobile/Patina/Patina/Services/Sharing/ScanSharingService.swift` — the `searchDesigners`
  follow-up is **L0.2's**, not this lane's, even though it is the sibling of FF-01c.
- `apps/designer-portal/src/app/api/admin/catalog/vendors/**` — already guarded, and not in the
  program's globs.
- The **nine silent degradations** 00555 creates: tracked at `build/waves/w3/00555-degradations.md`,
  opened by L0.2 at apply time. Explicitly not this lane's.
