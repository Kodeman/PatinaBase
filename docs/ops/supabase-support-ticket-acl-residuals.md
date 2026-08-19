# Supabase support ticket — residual PUBLIC/anon grants

**Header note: for Kody to send — drafted 2026-08-18.**

Send via the Supabase Cloud dashboard support form (or support@supabase.io) for
project ref `bkvcixdmuyejfzcijpdg` ("Strata"). Everything below is one ticket;
it names two distinct objects/measurements because both require the same
grantor (`supabase_admin`) that the `postgres` role on this project cannot
act as (`postgres` is `rolsuper = false` on Supabase Cloud).

---

## Subject

Request: revoke residual PUBLIC/anon grants on `net.*` and two `graphql.*`
routines — objects owned by `supabase_admin`, not revocable by the project's
`postgres` role

## Project

- Project ref: `bkvcixdmuyejfzcijpdg`
- Project name: Strata

## Summary

During a security audit of our schema's PUBLIC/anon ACL surface, we found two
residual grants that our own migrations cannot remove because the objects are
owned by `supabase_admin` and our `postgres` role is not a superuser on
Supabase Cloud. Both are asks to revoke grants that predate our own hardening
work and are not something we can self-serve. Details and exact object
identities below.

## Item 1 — full PUBLIC DML on `net.http_request_queue` and `net._http_response`

**What was measured** (read-only, `pg_class.relacl`, 2026-08-17):

```
net.http_request_queue  relacl = {supabase_admin=arwdDxtm/supabase_admin,=arwdDxtm/supabase_admin}
net._http_response       relacl = {supabase_admin=arwdDxtm/supabase_admin,=arwdDxtm/supabase_admin}
```

The bare `=arwdDxtm/supabase_admin` entry is a grant to PUBLIC of full DML
(SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) on both tables, with
RLS off. Both tables are in schema `net` (the `pg_net` extension), which also
still grants PUBLIC `USAGE`, so any authenticated or anon-reachable role that
can execute SQL in this project can reach them.

**Why this matters here specifically**: our own `public.invoke_edge_function`
RPC and several `notify_*` triggers call `net.http_post(...)` to invoke
Supabase Edge Functions on a schedule (via `pg_cron`). Those calls place the
project's `service_role` JWT in the outbound request's `Authorization` header.
That header is written to `net.http_request_queue` while the request is
in flight, and the corresponding response — headers and body — lands in
`net._http_response`, which we've observed holds a rolling window of roughly
6 hours of history at steady state (not drained on completion). A role with
SELECT on `net._http_response` (which PUBLIC currently has) can read a
service-role JWT out of a queued/completed cron-driven request, which is a
full RLS bypass on this project — sufficient to justify asking for the grant
to be revoked rather than something we accept as permanent.

**What we're asking**: revoke the PUBLIC grants on `net.http_request_queue`
and `net._http_response` (and, if in scope for the same request,
`net.http_request_queue_id_seq`, which carries a PUBLIC
`SELECT/UPDATE/USAGE` on the same table's id sequence). We understand these
objects are owned by `supabase_admin` and that only Supabase-side tooling
can alter that ownership's grants.

We are not asking you to disable or restrict `pg_net`/cron functionality —
only to remove the PUBLIC grant on these two (or three) objects so that
access is scoped to the roles that actually need it (`supabase_admin`,
`postgres`, `service_role` as applicable).

## Item 2 — anon/authenticated EXECUTE on two `graphql.*` routines

**What was measured** (read-only, `pg_proc.proacl`, 2026-08-18):

```
graphql.get_schema_version()           owner=supabase_admin, SECURITY DEFINER
  proacl = {=X/supabase_admin, supabase_admin=X/supabase_admin, postgres=X/supabase_admin,
            anon=X/supabase_admin, authenticated=X/supabase_admin, service_role=X/supabase_admin}

graphql.increment_schema_version()     owner=supabase_admin, SECURITY DEFINER
  proacl = {=X/supabase_admin, supabase_admin=X/supabase_admin, postgres=X/supabase_admin,
            anon=X/supabase_admin, authenticated=X/supabase_admin, service_role=X/supabase_admin}
```

Both routines are SECURITY DEFINER, owned by `supabase_admin`, and carry
explicit EXECUTE grants to `anon` and `authenticated` (in addition to the
bare PUBLIC `=X/supabase_admin` entry). These appear to be part of the
`pg_graphql` platform image rather than anything in our own migrations —
we did not find them on our staging project (`vuesoyhfrjabfxbrzekd`), only
on this production project, which suggests they came in with a platform
image upgrade specific to this project.

**Impact as we understand it**: low — both routines only read or increment
a schema-version counter used for `pg_graphql`'s internal cache
invalidation; neither appears to reach application data. We're not
reporting an active exploit, just an ACL surface we'd like tightened to
match the rest of the schema (we've already revoked PUBLIC/anon EXECUTE
across our own `public` schema routines in a recent migration).

**What we're asking**: revoke `anon` and `authenticated` EXECUTE on
`graphql.get_schema_version()` and `graphql.increment_schema_version()`,
or let us know if there's a reason `pg_graphql` requires these grants to
function correctly (in which case we'll register this as an accepted
platform-image residual rather than ask again).

## What we're NOT asking

We are not asking for any change to `pg_net`/`pg_cron` functionality, to
`pg_graphql` functionality, or to any object we ourselves own — this ticket
is scoped exactly to the object identities above.

## Reference

Internal measurement/registry (not visible to Supabase, included for context
if useful): `supabase/tests/edge_api/public_acl_exception_registry.sql`,
EVENT 1 (the `net.*` rows, ruled and accepted 2026-08-17 pending this
support request) and EVENT 4 (the two `graphql.*` rows, ruled and accepted
2026-08-18 pending this support request).

Happy to provide additional detail (full `pg_proc`/`pg_class` catalog dumps,
reproduction queries) on request.
