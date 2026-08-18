-- ═══════════════════════════════════════════════════════════════════════════
-- Residual PUBLIC privilege exception registry — the signed allow-list.
--
-- SOURCE OF TRUTH: docs/engineering/public-acl-residual-census.md and its
-- companion measurement script supabase/tests/edge_api/public_acl_residual_
-- census.sql. Every row below is transcribed from that census; the `reason`
-- column names the census section that carries the acceptance.
--
-- WHY THIS FILE EXISTS. Migration 00483 withdraws every PUBLIC privilege the
-- ordinary migration principal owns. What it cannot withdraw is anything owned
-- by supabase_admin — including schema `net`, its two tables, its sequence and
-- its twelve routines. `postgres` is rolsuper = false on Supabase Cloud and
-- cannot become supabase_admin, so those privileges are permanent from this
-- side. A conformance gate that counts them fails forever and gets ignored; a
-- gate that ignores them silently blesses the next real hole. This registry is
-- the third option: name each one, exactly, with a reason and a signature.
--
-- TWO RULES, BOTH LOAD-BEARING.
--
--   1. EXACT SIGNATURES ONLY. No LIKE, no regex, no wildcard, no prefix. An
--      exception that matches a shape rather than an object is a hole that
--      admits objects nobody reviewed. The self-check below rejects any row
--      whose signature carries `%` or `*`, and any routine row that is not a
--      fully-qualified `schema.name(argtypes)` identity.
--
--   2. NO UNSIGNED ROWS. `reason`, `accepted_by` and `accepted_on` are all
--      required, and the registry must be non-empty. An exception list nobody
--      signed must fail its own assertion rather than ship green.
--
-- SIGNATURE FORM for routines is the type-only identity —
--   format('%s.%s(%s)', schema, name, comma-joined format_type(proargtypes))
-- — recomputed identically by every consumer. Argument NAMES are deliberately
-- excluded: they are not part of a routine's identity and change across
-- extension versions.
--
-- CONSUMERS. `\ir` this file before the gate's read-only transaction; it
-- creates three session-local objects and touches nothing persistent:
--   • public_acl_exception_registry      — the signed rows
--   • public_acl_capability_findings     — invariants A and B (see below)
--   • public_acl_role_effective_finding  — reachability-filtered effective ACL
-- Both catalog_roles_test.sql and catalog_roles_remote_conformance_test.sql
-- count from these, so the local and the remote gate cannot drift apart.
--
-- THE READING RULE, inherited from the census. A PUBLIC privilege on an object
-- only matters if PUBLIC can also enter the object's schema. Every check here
-- filters on schema USAGE as well as the object grant. Post-00483 exactly one
-- non-system schema still grants PUBLIC USAGE: `net`.
--
-- DELIBERATELY ABSENT: `proposal_mood_boards_proposal_read`. The census records
-- it as the one genuinely anon-reachable storage policy; migration 00485 fixed
-- it (TO authenticated, caller bound). A remediated finding is not an
-- exception, so it is not registered.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

CREATE TEMP TABLE public_acl_exception_registry (
  schema_name       text,
  object_signature  text,
  owner_name        text,
  kind              text,
  reason            text,
  accepted_by       text,
  accepted_on       date
);

INSERT INTO public_acl_exception_registry
  (schema_name, object_signature, owner_name, kind, reason, accepted_by, accepted_on)
VALUES
-- ── Census section C1 — PUBLIC-writable objects in `net` ────────────────────
  ('net', 'net', 'supabase_admin', 'schema',
   'Census reading rule — `net` is the only non-system schema that still grants PUBLIC USAGE after 00483. supabase_admin owns the schema, so postgres cannot revoke it. This row is what makes every other `net` row below reachable, and is the single point at which that reachability is accepted.', 'kody', DATE '2026-08-17'),
  ('net', 'net.http_request_queue', 'supabase_admin', 'relation',
   'Census section C1 item 1 — full PUBLIC DML (arwdDxtm), RLS off. Transports the service_role JWT in outbound pg_net request headers, so a sustained polling loop could harvest it and bypass RLS entirely. Mitigating: the queue drains to empty (0 rows observed), so the exposure is transient rather than at rest. Accepted by Kody on 2026-08-17 with the mechanism known; compensating action is a Supabase support request to revoke PUBLIC on net.*.', 'kody', DATE '2026-08-17'),
  ('net', 'net._http_response', 'supabase_admin', 'relation',
   'Census section C1 item 2 — full PUBLIC DML (arwdDxtm), RLS off. The ruling''s "transient" does NOT cover this table: it holds a hard ~6-hour rolling window of response bodies and headers (~1456 rows steady state; span measured pinned at 05:59:00 while the oldest row advanced ~1h). At-rest disclosure and tampering, distinct from the queue''s escalation risk. Same owner, same compensating action.', 'kody', DATE '2026-08-17'),
  ('net', 'net.http_request_queue_id_seq', 'supabase_admin', 'sequence',
   'Census section C1 item 3 — a third PUBLIC-writable object in `net` beyond the two named in the ruling. PUBLIC holds SELECT/UPDATE/USAGE on the queue''s id counter, so a caller can advance or reset it. Disruption of the pg_net worker, not disclosure. Same owner, same compensating action.', 'kody', DATE '2026-08-17'),

-- ── Census section C2 — out-of-band-effect routines in `net` ────────────────
-- prosecdef is the WRONG discriminator for this set. Every one is SECURITY
-- INVOKER, yet each hands work to the pg_net background worker, which performs
-- it with its own privilege, outside the caller's transaction and outside RLS.
-- Invariant A therefore names them explicitly rather than deriving them.
  ('net', 'net.http_get(text,jsonb,jsonb,integer)', 'supabase_admin', 'routine_out_of_band',
   'Census section C2 — enqueues an outbound HTTP request executed by the privileged pg_net worker. A server-side request forgery and data-exfiltration primitive for any role that can enter `net`. supabase_admin owns it; not ours to change.', 'kody', DATE '2026-08-17'),
  ('net', 'net.http_post(text,jsonb,jsonb,jsonb,integer)', 'supabase_admin', 'routine_out_of_band',
   'Census section C2 — as http_get, with an attacker-chosen body. SECURITY INVOKER but the request is performed by the privileged background worker, which is why this gate keys on effect rather than on prosecdef. Not ours to change.', 'kody', DATE '2026-08-17'),
  ('net', 'net.http_delete(text,jsonb,jsonb,integer,jsonb)', 'supabase_admin', 'routine_out_of_band',
   'Census section C2 — as http_get, issuing DELETE. Reachable but not named in the original ruling; the census added it. Not ours to change.', 'kody', DATE '2026-08-17'),
  ('net', 'net.worker_restart()', 'supabase_admin', 'routine_out_of_band',
   'Census section C2 — restarts the pg_net background worker. A denial-of-service primitive against all 29 net-driving pg_cron jobs, and the sharpest item in the reachable `net` surface. Not ours to change.', 'kody', DATE '2026-08-17'),
  ('net', 'net.wake()', 'supabase_admin', 'routine_out_of_band',
   'Census section C2 — signals the background worker. Low impact alone; registered because it is worker-lifecycle control rather than caller-scoped computation. Not ours to change.', 'kody', DATE '2026-08-17'),
  ('net', 'net.wait_until_running()', 'supabase_admin', 'routine_out_of_band',
   'Census section C2 — blocks until the worker is up; can hold a session open. Low impact. Not ours to change.', 'kody', DATE '2026-08-17'),
  ('net', 'net.check_worker_is_up()', 'supabase_admin', 'routine_out_of_band',
   'Census section C2 — reports worker liveness. Information only. Not ours to change.', 'kody', DATE '2026-08-17'),
  ('net', 'net.http_collect_response(bigint,boolean)', 'supabase_admin', 'routine_out_of_band',
   'Census section C2 — returns the response for any request id, across all callers. A disclosure path that does not require direct table access. Not ours to change.', 'kody', DATE '2026-08-17'),
  ('net', 'net._http_collect_response(bigint,boolean)', 'supabase_admin', 'routine_out_of_band',
   'Census section C2 — internal form of http_collect_response, same cross-caller disclosure path. Not ours to change.', 'kody', DATE '2026-08-17'),
  ('net', 'net._await_response(bigint)', 'supabase_admin', 'routine_out_of_band',
   'Census section C2 — blocks on and returns another caller''s response. Same disclosure path. Not ours to change.', 'kody', DATE '2026-08-17'),

-- ── Census section C2 — the two pure helpers, no out-of-band effect ─────────
  ('net', 'net._encode_url_with_params_array(text,text[])', 'supabase_admin', 'routine_invoker',
   'Census section C2 — pure string helper, no side effect, no table access. Registered so the twelve reachable `net` routines are accounted for in full rather than by subtraction. Deliberately NOT classified out-of-band: a row of that kind would also excuse it from invariant A, and it does not need excusing.', 'kody', DATE '2026-08-17'),
  ('net', 'net._urlencode_string(character varying)', 'supabase_admin', 'routine_invoker',
   'Census section C2 — pure string helper, no side effect, no table access. Same classification note as _encode_url_with_params_array.', 'kody', DATE '2026-08-17'),

-- ── Census section B — 149 supabase_admin-owned invoker routines in `public` ─
-- Reachable by PUBLIC only while `public` grants PUBLIC USAGE, which 00483
-- withdraws. They stay registered because edge_catalog_reader holds an explicit
-- USAGE grant on `public` and therefore still reaches them, and because their
-- default PUBLIC EXECUTE is not ours to revoke.
  ('public', 'public.gin_extract_query_trgm(text,internal,smallint,internal,internal,internal,internal)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.gin_extract_value_trgm(text,internal)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.gin_trgm_consistent(internal,smallint,text,integer,internal,internal,internal,internal)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.gin_trgm_triconsistent(internal,smallint,text,integer,internal,internal,internal)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.gtrgm_compress(internal)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.gtrgm_consistent(internal,text,smallint,oid,internal)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.gtrgm_decompress(internal)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.gtrgm_distance(internal,text,smallint,oid,internal)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.gtrgm_in(cstring)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.gtrgm_options(internal)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.gtrgm_out(gtrgm)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.gtrgm_penalty(internal,internal,internal)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.gtrgm_picksplit(internal,internal)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.gtrgm_same(gtrgm,gtrgm,internal)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.gtrgm_union(internal,internal)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.set_limit(real)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.show_limit()', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.show_trgm(text)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.similarity(text,text)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.similarity_dist(text,text)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.similarity_op(text,text)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.strict_word_similarity(text,text)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.strict_word_similarity_commutator_op(text,text)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.strict_word_similarity_dist_commutator_op(text,text)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.strict_word_similarity_dist_op(text,text)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.strict_word_similarity_op(text,text)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.word_similarity(text,text)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.word_similarity_commutator_op(text,text)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.word_similarity_dist_commutator_op(text,text)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.word_similarity_dist_op(text,text)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.word_similarity_op(text,text)', 'supabase_admin', 'routine_invoker',
   'Census section B — pg_trgm 1.6 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.array_to_halfvec(double precision[],integer,boolean)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.array_to_halfvec(integer[],integer,boolean)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.array_to_halfvec(numeric[],integer,boolean)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.array_to_halfvec(real[],integer,boolean)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.array_to_sparsevec(double precision[],integer,boolean)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.array_to_sparsevec(integer[],integer,boolean)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.array_to_sparsevec(numeric[],integer,boolean)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.array_to_sparsevec(real[],integer,boolean)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.array_to_vector(double precision[],integer,boolean)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.array_to_vector(integer[],integer,boolean)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.array_to_vector(numeric[],integer,boolean)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.array_to_vector(real[],integer,boolean)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.avg(halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.avg(vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.binary_quantize(halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.binary_quantize(vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.cosine_distance(halfvec,halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.cosine_distance(sparsevec,sparsevec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.cosine_distance(vector,vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec(halfvec,integer,boolean)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_accum(double precision[],halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_add(halfvec,halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_avg(double precision[])', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_cmp(halfvec,halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_combine(double precision[],double precision[])', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_concat(halfvec,halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_eq(halfvec,halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_ge(halfvec,halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_gt(halfvec,halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_in(cstring,oid,integer)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_l2_squared_distance(halfvec,halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_le(halfvec,halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_lt(halfvec,halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_mul(halfvec,halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_ne(halfvec,halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_negative_inner_product(halfvec,halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_out(halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_recv(internal,oid,integer)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_send(halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_spherical_distance(halfvec,halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_sub(halfvec,halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_to_float4(halfvec,integer,boolean)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_to_sparsevec(halfvec,integer,boolean)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_to_vector(halfvec,integer,boolean)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.halfvec_typmod_in(cstring[])', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.hamming_distance(bit,bit)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.hnsw_bit_support(internal)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.hnsw_halfvec_support(internal)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.hnsw_sparsevec_support(internal)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.hnswhandler(internal)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.inner_product(halfvec,halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.inner_product(sparsevec,sparsevec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.inner_product(vector,vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.ivfflat_bit_support(internal)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.ivfflat_halfvec_support(internal)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.ivfflathandler(internal)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.jaccard_distance(bit,bit)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.l1_distance(halfvec,halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.l1_distance(sparsevec,sparsevec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.l1_distance(vector,vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.l2_distance(halfvec,halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.l2_distance(sparsevec,sparsevec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.l2_distance(vector,vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.l2_norm(halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.l2_norm(sparsevec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.l2_normalize(halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.l2_normalize(sparsevec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.l2_normalize(vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.sparsevec(sparsevec,integer,boolean)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.sparsevec_cmp(sparsevec,sparsevec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.sparsevec_eq(sparsevec,sparsevec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.sparsevec_ge(sparsevec,sparsevec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.sparsevec_gt(sparsevec,sparsevec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.sparsevec_in(cstring,oid,integer)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.sparsevec_l2_squared_distance(sparsevec,sparsevec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.sparsevec_le(sparsevec,sparsevec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.sparsevec_lt(sparsevec,sparsevec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.sparsevec_ne(sparsevec,sparsevec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.sparsevec_negative_inner_product(sparsevec,sparsevec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.sparsevec_out(sparsevec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.sparsevec_recv(internal,oid,integer)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.sparsevec_send(sparsevec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.sparsevec_to_halfvec(sparsevec,integer,boolean)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.sparsevec_to_vector(sparsevec,integer,boolean)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.sparsevec_typmod_in(cstring[])', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.subvector(halfvec,integer,integer)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.subvector(vector,integer,integer)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.sum(halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.sum(vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector(vector,integer,boolean)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_accum(double precision[],vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_add(vector,vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_avg(double precision[])', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_cmp(vector,vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_combine(double precision[],double precision[])', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_concat(vector,vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_dims(halfvec)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_dims(vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_eq(vector,vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_ge(vector,vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_gt(vector,vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_in(cstring,oid,integer)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_l2_squared_distance(vector,vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_le(vector,vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_lt(vector,vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_mul(vector,vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_ne(vector,vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_negative_inner_product(vector,vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_norm(vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_out(vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_recv(internal,oid,integer)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_send(vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_spherical_distance(vector,vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_sub(vector,vector)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_to_float4(vector,integer,boolean)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_to_halfvec(vector,integer,boolean)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_to_sparsevec(vector,integer,boolean)', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),
  ('public', 'public.vector_typmod_in(cstring[])', 'supabase_admin', 'routine_invoker',
   'Census section B — vector 0.8.0 extension routine. SECURITY INVOKER, stateless, no table access; supabase_admin owns it so its default PUBLIC EXECUTE cannot be withdrawn by postgres.', 'kody', DATE '2026-08-17'),

-- ── Census section E — storage.objects policies with role list {public} ────
-- Recorded, not gate-consumed: RLS policies are not schema-gated the way
-- routines are, so they do not appear in invariants A or B. They are here
-- because the census's Section E is part of the same signed decision.
  ('storage', 'storage.objects."Active participants can upload attachments"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — INSERT policy with role list {public} on a private bucket. Already narrow: the predicate binds the caller identity, so the {public} role list is cosmetic.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Anyone can view thumbnails"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — SELECT policy with role list {public} on a public bucket. Unconditional read on a bucket already served unauthenticated over the CDN, so the policy adds no exposure beyond the bucket flag.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Authenticated users can delete thumbnails"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — DELETE policy with role list {public} on a public bucket. Already narrow: the predicate binds the caller identity, so the {public} role list is cosmetic.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Authenticated users can upload thumbnails"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — INSERT policy with role list {public} on a public bucket. Already narrow: the predicate binds the caller identity, so the {public} role list is cosmetic.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Avatar images are publicly readable"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — SELECT policy with role list {public} on a public bucket. Unconditional read on a bucket already served unauthenticated over the CDN, so the policy adds no exposure beyond the bucket flag.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Designers can read shared scan artifacts"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — SELECT policy with role list {public} on a private bucket. Already narrow: the predicate binds the caller identity, so the {public} role list is cosmetic.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Designers delete project documents"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — DELETE policy with role list {public} on a private bucket. Already narrow: the predicate binds the caller identity, so the {public} role list is cosmetic.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Designers update project documents"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — UPDATE policy with role list {public} on a private bucket. Already narrow: the predicate binds the caller identity, so the {public} role list is cosmetic.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Designers upload project documents"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — INSERT policy with role list {public} on a private bucket. Already narrow: the predicate binds the caller identity, so the {public} role list is cosmetic.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Org admins manage studio logos (delete)"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — DELETE policy with role list {public} on a public bucket. Already narrow: the predicate binds the caller identity, so the {public} role list is cosmetic.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Org admins manage studio logos (insert)"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — INSERT policy with role list {public} on a public bucket. Already narrow: the predicate binds the caller identity, so the {public} role list is cosmetic.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Org admins manage studio logos (update)"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — UPDATE policy with role list {public} on a public bucket. Already narrow: the predicate binds the caller identity, so the {public} role list is cosmetic.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Product images are publicly accessible"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — SELECT policy with role list {public} on a public bucket. Unconditional read on a bucket already served unauthenticated over the CDN, so the policy adds no exposure beyond the bucket flag.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Project members can read documents"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — SELECT policy with role list {public} on a private bucket. Already narrow: the predicate binds the caller identity, so the {public} role list is cosmetic.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Proposal assets are publicly readable"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — SELECT policy with role list {public} on a public bucket. Unconditional read on a bucket already served unauthenticated over the CDN, so the policy adds no exposure beyond the bucket flag.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Public read access for hero frames"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — SELECT policy with role list {public} on a public bucket. Unconditional read on a bucket already served unauthenticated over the CDN, so the policy adds no exposure beyond the bucket flag.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Studio logos are publicly readable"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — SELECT policy with role list {public} on a public bucket. Unconditional read on a bucket already served unauthenticated over the CDN, so the policy adds no exposure beyond the bucket flag.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Thread participants can read attachments"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — SELECT policy with role list {public} on a private bucket. Already narrow: the predicate binds the caller identity, so the {public} role list is cosmetic.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Users can delete their hero frames"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — DELETE policy with role list {public} on a public bucket. Already narrow: the predicate binds the caller identity, so the {public} role list is cosmetic.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Users can delete their own avatar"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — DELETE policy with role list {public} on a public bucket. Already narrow: the predicate binds the caller identity, so the {public} role list is cosmetic.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Users can delete their own scan artifacts"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — DELETE policy with role list {public} on a private bucket. Already narrow: the predicate binds the caller identity, so the {public} role list is cosmetic.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Users can read their own scan artifacts"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — SELECT policy with role list {public} on a private bucket. Already narrow: the predicate binds the caller identity, so the {public} role list is cosmetic.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Users can update their hero frames"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — UPDATE policy with role list {public} on a public bucket. Already narrow: the predicate binds the caller identity, so the {public} role list is cosmetic.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Users can update their own avatar"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — UPDATE policy with role list {public} on a public bucket. Already narrow: the predicate binds the caller identity, so the {public} role list is cosmetic.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Users can update their own scan artifacts"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — UPDATE policy with role list {public} on a private bucket. Already narrow: the predicate binds the caller identity, so the {public} role list is cosmetic.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Users can upload hero frames"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — INSERT policy with role list {public} on a public bucket. Already narrow: the predicate binds the caller identity, so the {public} role list is cosmetic.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Users can upload their own avatar"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — INSERT policy with role list {public} on a public bucket. Already narrow: the predicate binds the caller identity, so the {public} role list is cosmetic.', 'kody', DATE '2026-08-17'),
  ('storage', 'storage.objects."Users can upload their own scan artifacts"', 'supabase_storage_admin', 'storage_policy',
   'Census section E — INSERT policy with role list {public} on a private bucket. Already narrow: the predicate binds the caller identity, so the {public} role list is cosmetic.', 'kody', DATE '2026-08-17');


-- ═══════════════════════════════════════════════════════════════════════════
-- The registry asserts itself. An unsigned, empty, or pattern-shaped list must
-- fail here rather than reach a gate and pass it.
-- ═══════════════════════════════════════════════════════════════════════════

DO $public_acl_registry_selfcheck$
DECLARE
  row_count            integer;
  unsigned_rows        integer;
  unknown_kinds        text;
  patterned            text;
  malformed_routine    text;
  malformed_relation   text;
  duplicated           text;
BEGIN
  SELECT count(*) INTO row_count FROM public_acl_exception_registry;
  IF row_count = 0 THEN
    RAISE EXCEPTION
      'PUBLIC ACL EXCEPTION REGISTRY is empty; an empty allow-list must not be mistaken for a clean database';
  END IF;

  SELECT count(*)
    INTO unsigned_rows
    FROM public_acl_exception_registry
   WHERE reason IS NULL OR btrim(reason) = ''
      OR accepted_by IS NULL OR btrim(accepted_by) = ''
      OR accepted_on IS NULL
      OR schema_name IS NULL OR btrim(schema_name) = ''
      OR object_signature IS NULL OR btrim(object_signature) = ''
      OR owner_name IS NULL OR btrim(owner_name) = ''
      OR kind IS NULL OR btrim(kind) = '';
  IF unsigned_rows <> 0 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'PUBLIC ACL EXCEPTION REGISTRY has %s unsigned or incomplete row(s); every exception needs a reason and a named acceptor',
      unsigned_rows
    );
  END IF;

  SELECT string_agg(DISTINCT kind, ', ' ORDER BY kind)
    INTO unknown_kinds
    FROM public_acl_exception_registry
   WHERE kind NOT IN (
     'schema', 'relation', 'sequence',
     'routine_out_of_band', 'routine_security_definer', 'routine_invoker',
     'storage_policy'
   );
  IF unknown_kinds IS NOT NULL THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'PUBLIC ACL EXCEPTION REGISTRY uses unrecognised kind(s): %s. A kind no consumer knows about exempts nothing and hides the row',
      unknown_kinds
    );
  END IF;

  -- Rule 1. Exact signatures only. A wildcard exception is a hole.
  SELECT string_agg(object_signature, ', ' ORDER BY object_signature)
    INTO patterned
    FROM public_acl_exception_registry
   WHERE object_signature LIKE '%\%%'
      OR object_signature LIKE '%*%';
  IF patterned IS NOT NULL THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'PUBLIC ACL EXCEPTION REGISTRY contains pattern-shaped signature(s): %s. Exceptions match by exact signature, never by pattern',
      patterned
    );
  END IF;

  SELECT string_agg(object_signature, ', ' ORDER BY object_signature)
    INTO malformed_routine
    FROM public_acl_exception_registry
   WHERE kind IN (
     'routine_out_of_band', 'routine_security_definer', 'routine_invoker'
   )
     AND object_signature !~ '^[^.()]+\.[^.()]+\(.*\)$';
  IF malformed_routine IS NOT NULL THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'PUBLIC ACL EXCEPTION REGISTRY routine signature(s) are not a fully-qualified schema.name(argtypes) identity: %s',
      malformed_routine
    );
  END IF;

  SELECT string_agg(object_signature, ', ' ORDER BY object_signature)
    INTO malformed_relation
    FROM public_acl_exception_registry
   WHERE kind IN ('relation', 'sequence')
     AND object_signature <> schema_name || '.' || split_part(
       object_signature, '.', 2
     );
  IF malformed_relation IS NOT NULL THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'PUBLIC ACL EXCEPTION REGISTRY relation signature(s) are not schema-qualified against their own schema_name column: %s',
      malformed_relation
    );
  END IF;

  SELECT string_agg(object_signature, ', ' ORDER BY object_signature)
    INTO duplicated
    FROM (
      SELECT object_signature
        FROM public_acl_exception_registry
       GROUP BY schema_name, object_signature
      HAVING count(*) > 1
    ) AS dupes;
  IF duplicated IS NOT NULL THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'PUBLIC ACL EXCEPTION REGISTRY has duplicate signature(s): %s. Two rows for one object means two reasons, and a reader cannot tell which was signed',
      duplicated
    );
  END IF;
END
$public_acl_registry_selfcheck$;


-- ═══════════════════════════════════════════════════════════════════════════
-- Shared reachability primitive.
--
-- A PUBLIC privilege is only exposure if PUBLIC can enter the schema. Every
-- consumer below filters on this, so no gate can measure a raw object grant and
-- call it a hole, and no gate can ignore a schema PUBLIC really can enter.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TEMP VIEW public_acl_reachable_schema AS
SELECT n.oid, n.nspname
  FROM pg_catalog.pg_namespace AS n
 WHERE n.nspname !~ '^pg_'
   AND n.nspname <> 'information_schema'
   AND EXISTS (
     SELECT 1
       FROM pg_catalog.aclexplode(
              COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner))
            ) AS acl
      WHERE acl.grantee = 0
        AND acl.privilege_type = 'USAGE'
   );


-- ═══════════════════════════════════════════════════════════════════════════
-- INVARIANT A and INVARIANT B — the capability gate.
--
-- A. Zero PUBLIC-reachable routines that can act outside the caller's own
--    privilege. That is every SECURITY DEFINER routine, PLUS the named
--    out-of-band-effect set. `net.http_post` is prosecdef = false yet the
--    request is performed by the privileged pg_net background worker; keying
--    this gate on prosecdef would bless the actual hole. Effect, not flag.
--
-- B. Zero PUBLIC-writable relations. SELECT alone is not writability, so it is
--    excluded here; sequence USAGE is included, because USAGE permits nextval.
--
-- Both minus the registry, matched on exact schema + signature AND on a kind
-- appropriate to the invariant — a storage_policy row cannot excuse a routine,
-- and a routine_invoker row cannot excuse a SECURITY DEFINER.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TEMP VIEW public_acl_capability_findings AS
WITH out_of_band_effect(schema_name, object_signature) AS (
  VALUES
    ('net', 'net.http_get(text,jsonb,jsonb,integer)'),
    ('net', 'net.http_post(text,jsonb,jsonb,jsonb,integer)'),
    ('net', 'net.http_delete(text,jsonb,jsonb,integer,jsonb)'),
    ('net', 'net.worker_restart()'),
    ('net', 'net.wake()'),
    ('net', 'net.wait_until_running()'),
    ('net', 'net.check_worker_is_up()'),
    ('net', 'net.http_collect_response(bigint,boolean)'),
    ('net', 'net._http_collect_response(bigint,boolean)'),
    ('net', 'net._await_response(bigint)')
),
public_routine AS (
  SELECT
    s.nspname AS schema_name,
    pg_catalog.format(
      '%s.%s(%s)', s.nspname, p.proname,
      (
        SELECT COALESCE(
                 pg_catalog.string_agg(
                   pg_catalog.format_type(arg.typ, NULL), ',' ORDER BY arg.ord
                 ),
                 ''
               )
          FROM pg_catalog.unnest(p.proargtypes)
               WITH ORDINALITY AS arg(typ, ord)
      )
    ) AS object_signature,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner_name,
    p.prosecdef
  FROM pg_catalog.pg_proc AS p
  JOIN public_acl_reachable_schema AS s ON s.oid = p.pronamespace
  WHERE EXISTS (
    SELECT 1
      FROM pg_catalog.aclexplode(
             COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
           ) AS acl
     WHERE acl.grantee = 0
       AND acl.privilege_type = 'EXECUTE'
  )
),
public_writable_relation AS (
  SELECT
    s.nspname AS schema_name,
    pg_catalog.format('%s.%s', s.nspname, c.relname) AS object_signature,
    pg_catalog.pg_get_userbyid(c.relowner) AS owner_name,
    c.relkind,
    pg_catalog.string_agg(
      DISTINCT acl.privilege_type, ',' ORDER BY acl.privilege_type
    ) AS privileges
  FROM pg_catalog.pg_class AS c
  JOIN public_acl_reachable_schema AS s ON s.oid = c.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(
      c.relacl,
      pg_catalog.acldefault(
        CASE WHEN c.relkind = 'S' THEN 'S' ELSE 'r' END::"char", c.relowner
      )
    )
  ) AS acl
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
    AND acl.grantee = 0
    AND acl.privilege_type <> 'SELECT'
  GROUP BY 1, 2, 3, 4
)
SELECT
  'A'::text AS invariant,
  r.schema_name,
  r.object_signature,
  r.owner_name,
  CASE
    WHEN r.prosecdef THEN 'PUBLIC-reachable SECURITY DEFINER routine'
    ELSE 'PUBLIC-reachable out-of-band-effect routine (privileged background worker)'
  END AS detail
FROM public_routine AS r
WHERE (
        r.prosecdef
        OR (r.schema_name, r.object_signature) IN (
          SELECT schema_name, object_signature FROM out_of_band_effect
        )
      )
  AND NOT EXISTS (
    SELECT 1
      FROM public_acl_exception_registry AS x
     WHERE x.kind IN ('routine_out_of_band', 'routine_security_definer')
       AND x.schema_name = r.schema_name
       AND x.object_signature = r.object_signature
  )
UNION ALL
SELECT
  'B'::text,
  w.schema_name,
  w.object_signature,
  w.owner_name,
  'PUBLIC-writable relation; privileges ' || w.privileges
FROM public_writable_relation AS w
WHERE NOT EXISTS (
  SELECT 1
    FROM public_acl_exception_registry AS x
   WHERE x.kind IN ('relation', 'sequence')
     AND x.schema_name = w.schema_name
     AND x.object_signature = w.object_signature
);


-- ═══════════════════════════════════════════════════════════════════════════
-- Effective-ACL findings for the two Phase 1 capability roles.
--
-- This is the proof that edge_catalog_reader reaches exactly one view and that
-- edge_rls_user is never broader than `authenticated`. It is defined once,
-- here, so the local gate and the remote gate cannot answer it differently.
--
-- has_*_privilege() returns true for anything PUBLIC holds, so an unfiltered
-- version of this check reports every PUBLIC residual as a capability-role
-- failure and can never reach zero. Two filters make it answerable without
-- weakening it: the role must actually hold schema USAGE, and the object must
-- be a signed registry row.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TEMP VIEW public_acl_role_effective_finding AS
WITH probe AS (
  SELECT
    r.role_name,
    r.oid AS role_oid,
    (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
      AS baseline_oid,
    r.compare_to_authenticated
  FROM (
    SELECT
      role_name,
      compare_to_authenticated,
      (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = role_name) AS oid
    FROM (
      VALUES ('edge_catalog_reader', false), ('edge_rls_user', true)
    ) AS v(role_name, compare_to_authenticated)
  ) AS r
  WHERE r.oid IS NOT NULL
),
reachable AS (
  SELECT p.role_name, p.role_oid, p.baseline_oid, p.compare_to_authenticated,
         s.oid AS nspoid, s.nspname
    FROM probe AS p
    CROSS JOIN (
      SELECT n.oid, n.nspname
        FROM pg_catalog.pg_namespace AS n
       WHERE n.nspname !~ '^pg_'
         AND n.nspname <> 'information_schema'
    ) AS s
   WHERE COALESCE(
           pg_catalog.has_schema_privilege(p.role_oid, s.oid, 'USAGE'), false
         )
)
-- Schema-level: any privilege beyond the one USAGE grant 00483 makes on
-- `public` for edge_catalog_reader, or anything edge_rls_user holds that
-- `authenticated` does not.
SELECT
  p.role_name,
  'schema'::text AS object_class,
  n.nspname AS schema_name,
  n.nspname AS object_signature,
  privilege.name AS privilege_type
FROM probe AS p
CROSS JOIN pg_catalog.pg_namespace AS n
CROSS JOIN LATERAL (VALUES ('USAGE'), ('CREATE')) AS privilege(name)
WHERE n.nspname !~ '^pg_'
  AND n.nspname <> 'information_schema'
  AND COALESCE(
        pg_catalog.has_schema_privilege(p.role_oid, n.oid, privilege.name),
        false
      )
  AND CASE
        WHEN p.compare_to_authenticated THEN NOT COALESCE(
          pg_catalog.has_schema_privilege(
            p.baseline_oid, n.oid, privilege.name
          ), false)
        ELSE NOT (n.nspname = 'public' AND privilege.name = 'USAGE')
      END
  AND NOT EXISTS (
    SELECT 1 FROM public_acl_exception_registry AS x
     WHERE x.kind = 'schema'
       AND x.schema_name = n.nspname
       AND x.object_signature = n.nspname
  )

UNION ALL

-- Relation-level, restricted to schemas the role can actually enter.
SELECT
  r.role_name,
  CASE WHEN c.relkind = 'S' THEN 'sequence' ELSE 'relation' END,
  r.nspname,
  pg_catalog.format('%s.%s', r.nspname, c.relname),
  privilege.name
FROM reachable AS r
JOIN pg_catalog.pg_class AS c ON c.relnamespace = r.nspoid
CROSS JOIN LATERAL pg_catalog.unnest(
  CASE
    WHEN c.relkind = 'S'
      THEN ARRAY['USAGE', 'SELECT', 'UPDATE']::text[]
    WHEN pg_catalog.current_setting('server_version_num')::integer >= 170000
      THEN ARRAY[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
        'REFERENCES', 'TRIGGER', 'MAINTAIN'
      ]::text[]
    ELSE ARRAY[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
      'REFERENCES', 'TRIGGER'
    ]::text[]
  END
) AS privilege(name)
WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  AND CASE
        WHEN c.relkind = 'S' THEN COALESCE(
          pg_catalog.has_sequence_privilege(r.role_oid, c.oid, privilege.name),
          false)
        ELSE COALESCE(
          pg_catalog.has_table_privilege(r.role_oid, c.oid, privilege.name),
          false)
      END
  AND CASE
        WHEN r.compare_to_authenticated THEN NOT CASE
          WHEN c.relkind = 'S' THEN COALESCE(
            pg_catalog.has_sequence_privilege(
              r.baseline_oid, c.oid, privilege.name), false)
          ELSE COALESCE(
            pg_catalog.has_table_privilege(
              r.baseline_oid, c.oid, privilege.name), false)
        END
        ELSE NOT (
          r.nspname = 'public'
          AND c.relname = 'edge_catalog_products'
          AND privilege.name = 'SELECT'
        )
      END
  AND NOT EXISTS (
    SELECT 1 FROM public_acl_exception_registry AS x
     WHERE x.kind IN ('relation', 'sequence')
       AND x.schema_name = r.nspname
       AND x.object_signature = pg_catalog.format('%s.%s', r.nspname, c.relname)
  )

UNION ALL

-- Column-level, restricted to schemas the role can actually enter. A column
-- grant is registered through its parent relation: the census accepts the
-- table, and a table exception that did not cover its own columns would leave
-- the gate permanently red on the object it just excused.
SELECT
  r.role_name,
  'column'::text,
  r.nspname,
  pg_catalog.format('%s.%s.%s', r.nspname, c.relname, a.attname),
  privilege.name
FROM reachable AS r
JOIN pg_catalog.pg_class AS c ON c.relnamespace = r.nspoid
JOIN pg_catalog.pg_attribute AS a ON a.attrelid = c.oid
CROSS JOIN LATERAL (
  VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')
) AS privilege(name)
WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND a.attnum > 0
  AND NOT a.attisdropped
  AND COALESCE(
        pg_catalog.has_column_privilege(
          r.role_oid, c.oid, a.attnum, privilege.name
        ), false)
  AND CASE
        WHEN r.compare_to_authenticated THEN NOT COALESCE(
          pg_catalog.has_column_privilege(
            r.baseline_oid, c.oid, a.attnum, privilege.name
          ), false)
        ELSE NOT (
          r.nspname = 'public'
          AND c.relname = 'edge_catalog_products'
          AND privilege.name = 'SELECT'
        )
      END
  AND NOT EXISTS (
    SELECT 1 FROM public_acl_exception_registry AS x
     WHERE x.kind IN ('relation', 'sequence')
       AND x.schema_name = r.nspname
       AND x.object_signature = pg_catalog.format('%s.%s', r.nspname, c.relname)
  )

UNION ALL

-- Routine-level, restricted to schemas the role can actually enter.
SELECT
  r.role_name,
  'routine'::text,
  r.nspname,
  pg_catalog.format(
    '%s.%s(%s)', r.nspname, p.proname,
    (
      SELECT COALESCE(
               pg_catalog.string_agg(
                 pg_catalog.format_type(arg.typ, NULL), ',' ORDER BY arg.ord
               ),
               ''
             )
        FROM pg_catalog.unnest(p.proargtypes)
             WITH ORDINALITY AS arg(typ, ord)
    )
  ),
  'EXECUTE'::text
FROM reachable AS r
JOIN pg_catalog.pg_proc AS p ON p.pronamespace = r.nspoid
WHERE COALESCE(
        pg_catalog.has_function_privilege(r.role_oid, p.oid, 'EXECUTE'), false
      )
  AND CASE
        WHEN r.compare_to_authenticated THEN NOT COALESCE(
          pg_catalog.has_function_privilege(r.baseline_oid, p.oid, 'EXECUTE'),
          false)
        ELSE true
      END
  AND NOT EXISTS (
    SELECT 1 FROM public_acl_exception_registry AS x
     WHERE x.kind IN (
       'routine_out_of_band', 'routine_security_definer', 'routine_invoker'
     )
       AND x.schema_name = r.nspname
       AND x.object_signature = pg_catalog.format(
         '%s.%s(%s)', r.nspname, p.proname,
         (
           SELECT COALESCE(
                    pg_catalog.string_agg(
                      pg_catalog.format_type(arg.typ, NULL), ',' ORDER BY arg.ord
                    ),
                    ''
                  )
             FROM pg_catalog.unnest(p.proargtypes)
                  WITH ORDINALITY AS arg(typ, ord)
         )
       )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- Raw PUBLIC grants on reachable objects, minus the registry.
--
-- Strictly a subset of public_acl_role_effective_finding — anything PUBLIC
-- holds, every role holds — but kept as its own view because it answers a
-- different question. The effective view asks "is this capability role too
-- broad?"; this one asks "what is PUBLIC still carrying?", which is the number
-- the census tracks and the number a future Supabase support ticket would cite.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TEMP VIEW public_acl_public_grant_finding AS
SELECT
  'schema'::text AS object_class,
  s.nspname AS schema_name,
  s.nspname AS object_signature,
  acl.privilege_type
FROM public_acl_reachable_schema AS s
JOIN pg_catalog.pg_namespace AS n ON n.oid = s.oid
CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner))
) AS acl
WHERE acl.grantee = 0
  AND NOT EXISTS (
    SELECT 1 FROM public_acl_exception_registry AS x
     WHERE x.kind = 'schema'
       AND x.schema_name = s.nspname
       AND x.object_signature = s.nspname
  )

UNION ALL

SELECT
  CASE WHEN c.relkind = 'S' THEN 'sequence' ELSE 'relation' END,
  s.nspname,
  pg_catalog.format('%s.%s', s.nspname, c.relname),
  acl.privilege_type
FROM public_acl_reachable_schema AS s
JOIN pg_catalog.pg_class AS c ON c.relnamespace = s.oid
CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(
    c.relacl,
    pg_catalog.acldefault(
      CASE WHEN c.relkind = 'S' THEN 'S' ELSE 'r' END::"char", c.relowner
    )
  )
) AS acl
WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  AND acl.grantee = 0
  AND NOT EXISTS (
    SELECT 1 FROM public_acl_exception_registry AS x
     WHERE x.kind IN ('relation', 'sequence')
       AND x.schema_name = s.nspname
       AND x.object_signature = pg_catalog.format('%s.%s', s.nspname, c.relname)
  )

UNION ALL

SELECT
  'column'::text,
  s.nspname,
  pg_catalog.format('%s.%s.%s', s.nspname, c.relname, a.attname),
  acl.privilege_type
FROM public_acl_reachable_schema AS s
JOIN pg_catalog.pg_class AS c ON c.relnamespace = s.oid
JOIN pg_catalog.pg_attribute AS a ON a.attrelid = c.oid
CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) AS acl
WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND a.attnum > 0
  AND NOT a.attisdropped
  AND a.attacl IS NOT NULL
  AND acl.grantee = 0
  AND NOT EXISTS (
    SELECT 1 FROM public_acl_exception_registry AS x
     WHERE x.kind IN ('relation', 'sequence')
       AND x.schema_name = s.nspname
       AND x.object_signature = pg_catalog.format('%s.%s', s.nspname, c.relname)
  );
