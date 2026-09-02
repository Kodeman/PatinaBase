# L0.2b — integration notes out

Branch `first-flight/w0-l02b` · commits `ffdee7273`, `57f9e1ce8`, `fc82db841`.

Each note below is the **exact final text** for the owning lane to apply as a numbered task in its own
list. L0.2b applies none of them itself — all three land in files outside its three owned globs.

---

## Note 1 → **L0.2** · a case for `supabase/tests/rls/00555_ios_round_one_security.test.sql`

**Why it is a note, not a commit.** `PROGRAM.md` §3 W0 L0.2b lists this case under *"Tests this lane
must add"*, but the file lives at `supabase/tests/rls/**` (drafted under `build/migrations-draft/`),
which is **L0.2's** owned glob, not L0.2b's. One writer per file.

**Where it goes.** Beside the existing `(c)` assertions in the migration's own AFTER-APPLY test block —
the ones that already assert `anon` cannot read `vendors.trade_terms`.

**Exact final text:**

```sql
  -- (a4) list_vendor_profiles: the designer-portal comms picker's only door.
  -- packages/supabase/src/hooks/use-comms.ts:1061 useVendorProfiles calls this
  -- function and nothing else (L0.2b, commit fc82db841), so a wrong grant here
  -- is a broken picker, and a too-wide grant re-opens the directory this
  -- migration just closed.
  ASSERT NOT has_function_privilege(
      'anon', 'public.list_vendor_profiles()', 'EXECUTE'),
    'anon can still EXECUTE list_vendor_profiles';

  ASSERT has_function_privilege(
      'authenticated', 'public.list_vendor_profiles()', 'EXECUTE'),
    'authenticated cannot EXECUTE list_vendor_profiles';

  -- The return shape is the guarantee, not just the grant: three columns, and
  -- no email / phone / stripe_customer_id can appear by a later edit either.
  ASSERT pg_get_function_result('public.list_vendor_profiles()'::regprocedure)
         = 'TABLE(id uuid, full_name text, avatar_url text)',
    'list_vendor_profiles no longer returns exactly id, full_name, avatar_url';
```

> `pg_get_function_result` was checked against the local database on three existing TABLE-returning
> functions and renders exactly this form (`TABLE(id uuid, name text, …)`), so the equality is safe to
> assert literally. The assertion that must exist either way is **"the return shape carries no
> email"** — the grant alone does not say that.

---

## Note 2 → **L0.2** · the `list_vendor_profiles()` signature now has a shipped caller

`packages/supabase/src/hooks/use-comms.ts:1066` (commit `fc82db841`) calls:

```ts
const { data, error } = await supabase.rpc('list_vendor_profiles');
```

**No arguments, no client-side ordering** — the hook relies on the draft's own `ORDER BY p.full_name`,
and it keeps `if (error) throw`. Three consequences for L0.2:

1. **Adding a `p_query text` parameter, or any parameter without a default, is a breaking change to a
   shipped caller.** The draft's §(a4) comment already reasons that pagination would change the hook's
   contract; this note records that the contract is now real. If the vendor count later forces the
   `search_shareable_designers` shape, the hook changes in the same PR as the function.
2. **The `ORDER BY` must stay inside the function.** The client-side `.order('full_name')` was removed
   rather than duplicated.
3. `packages/supabase/src/database.types.ts` (L0.2's file) does not know this function yet, so the call
   site carries `getSupabase() as any` with an `eslint-disable-next-line
   @typescript-eslint/no-explicit-any` and this comment:
   `// as any until database.types.ts is regenerated against 00555 …`.
   **When L0.2 regenerates the types after the apply, delete the cast and the two comment lines** —
   `const supabase = getSupabase();` then type-checks on its own. That deletion is a one-line task in
   L0.2's list, not a leftover.

---

## Note 3 → **Fable / L0.2** · the D8 Step-0 evidence, and what this lane can and cannot claim

**What is proven (test-green / compile-green, in this worktree):** both routes return
`401 {"error":"Unauthorized"}` to a caller with no session and never reach `from('vendors')`; the list
route selects the 24 public-face columns and no trade column; the detail route selects all 37 named
columns and still 404s on `PGRST116`; `useVendorProfiles` calls the RPC and never `from('profiles')`.
82 vitest files / 959 tests pass, the 7 new jest cases pass, `pnpm --filter designer-portal build`
exits 0, `pnpm type-check` is 30/30.

**What is NOT proven, and cannot be by this lane:** that production is fixed. No deploy has run. Until
Kody runs `./infra/deploy-portal.sh designer`, `https://app.patina.cloud/api/catalog/vendors` **still
returns all 37 columns to an unauthenticated caller** — exposure #3 is open, and merging this branch
does not close it (`deploy-production.yml` is `workflow_dispatch`-only; merging to `main` deploys
nothing).

**D8 Step 0 therefore needs both halves, in this order:**

```bash
git log --oneline -1 -- apps/designer-portal packages/supabase/src/hooks   # must show this lane's merge
npx wrangler deployments list --name patina-designer-portal                # oldest-first: read the BOTTOM row
```

The bottom row's timestamp must be **newer** than that merge commit. If it is not, 00555 is not clear
to apply — applying it against the deployed-but-unguarded portal returns 500s on
`/api/catalog/vendors` and a 42501 error state wherever `useVendorProfiles` is mounted.

**One correction to the charter's blast-radius line, offered as evidence rather than as a change of
plan.** `PROGRAM.md` and risk R8 both say 00555 makes `use-comms.ts:1060` throw 42501 onto *"every
screen that lists vendors"*. In this checkout `useVendorProfiles` has **no UI consumer at all** — it is
exported from `packages/supabase/src/hooks/index.ts:1267` and imported by nothing under `apps/**`
(`grep -rn "useVendorProfiles" apps packages` returns only the barrel, the definition and the new
test). The vendor-brief picker that would call it is not wired up yet. So FF-01c is a **latent** break,
not a live one: the first screen to mount that hook after 00555 would have been the one to discover
it. The fix stays as shipped — it is three lines and it removes the trap — but the **live** half of
this lane is FF-01a/b, and the regression walk that matters for G3 is the vendors catalogue page and
the two HTTP routes, not a picker that does not render today.

**Second correction, same spirit — the gate line's parenthetical is wrong for this app.**
`PROGRAM.md` §3 W0 L0.2b annotates `pnpm --filter designer-portal build` with
`# admin/designer builds enforce types`. The designer portal does **not**:
`apps/designer-portal/next.config.js:325-328` sets `typescript: { ignoreBuildErrors: true }`, and the
build log prints `Skipping validation of types`. The admin portal is the strict one. The real type gate
for this lane's files is **`pnpm type-check`** (which caught exactly one real error here — the
`list_vendor_profiles` name is not in the generated `Functions` union — and turned it into Note 2's
cast). Worth fixing in the charter so a later lane does not read a green designer build as a type
claim.
