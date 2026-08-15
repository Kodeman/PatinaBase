# Strata PUBLIC ACL inventory for Cloudflare Phase 1

Status: sanitized read-only production census

Project: Supabase Cloud Strata, ref bkvcixdmuyejfzcijpdg

Census date: 2026-08-15

Scope: Cloudflare Phase 1 blocker 1 only

This document records catalog metadata, repository callsites, and privilege
decisions. It contains no customer rows, object keys, URLs, tokens, credentials,
or secret values. Every live statement used for this census was a SELECT against
PostgreSQL system catalogs or sanitized operational metadata. No SET ROLE, DDL,
DML, GRANT, REVOKE, ALTER, deployment, or database push was executed.

## Decision

Close blocker 1 with schema containment, not a database-wide rewrite of every
legacy routine ACL:

1. Put the catalog projection in a dedicated edge_api schema.
2. Grant edge_catalog_reader USAGE only on edge_api and SELECT only on
   edge_api.catalog_products. Do not grant it USAGE on public or net.
3. Revoke USAGE ON SCHEMA public FROM PUBLIC, then preserve the reviewed roles
   below with explicit grants.
4. Have a Supabase platform owner revoke USAGE ON SCHEMA net FROM PUBLIC. The
   ordinary Strata postgres migration session cannot do this.
5. Revoke TEMPORARY ON DATABASE postgres FROM PUBLIC, preserving reviewed roles
   explicitly; keep PUBLIC CONNECT because database connection is part of the
   edge login contract.
6. Directly harden the small set of demonstrably service-only legacy routines,
   especially grant_role_to_user and revoke_role_from_user.
7. Re-run the full catalog-role preflight after every pg_net, vector, pg_trgm,
   pg_cron, pg_graphql, or Supabase platform upgrade.

PostgreSQL object privileges are additive and every role is a member of PUBLIC.
There is no role-local deny ACL. A role with PUBLIC EXECUTE but no USAGE on the
containing schema cannot resolve or call the routine. Tests must therefore
distinguish raw object ACLs from callable capabilities and require both the
object privilege and schema USAGE when asserting effective access.

## Live identity and owner authority

The connector confirmed the expected project name, reference, and healthy
status before SQL was run. The SQL session reported current_user = postgres,
session_user = postgres, and current_database() = postgres.

| Object class | Owner | Can current postgres session alter it? | Consequence |
| --- | --- | ---: | --- |
| Database postgres | postgres | yes | Can reconcile PUBLIC TEMP/CONNECT |
| Schema public | pg_database_owner | yes | Can revoke PUBLIC USAGE and explicitly regrant |
| Application routines in public | postgres | yes | Can harden legacy application functions |
| Schema edge_api and catalog view | migration-owned postgres | yes | Normal migration is sufficient |
| Schema net | supabase_admin | no | Requires platform-owner execution |
| pg_net relations, sequence, routines | supabase_admin | no | Requires platform-owner execution for object ACL changes |
| vector and pg_trgm routines in public | supabase_admin | no | Normal migration cannot alter their ACLs |
| cron objects and routines | supabase_admin | no | Normal migration cannot alter their ACLs |
| pgcrypto, uuid-ossp, pg_stat_statements objects | postgres | yes | Not callable without extensions schema USAGE |

The postgres session is not MEMBER of, and has no USAGE membership in,
supabase_admin. The edge_catalog_reader, edge_catalog_login, edge_rls_user, and
edge_rls_login roles do not exist in production yet.

## Database privileges

The postgres database currently grants PUBLIC CONNECT and TEMPORARY. It
explicitly grants CONNECT, CREATE, and TEMPORARY to postgres and dashboard_user;
supabase_etl_admin and supabase_storage_admin have explicit CREATE.

There are no PUBLIC column-level ACLs in non-system schemas.

The only live application routine whose definition creates temporary objects is
public.get_aesthete_matches(...). It is SECURITY DEFINER, owned by postgres,
pins search_path=public, has no PUBLIC EXECUTE, and explicitly permits
anon/authenticated/postgres/service_role. Its temporary tables are created as
postgres, so its callers do not require database TEMPORARY. The other textual
match, extensions.pgrst_ddl_watch(), merely mentions CREATE TEMP in a comment.

Recommended database contract:

- leave CONNECT to PUBLIC;
- revoke TEMPORARY from PUBLIC;
- grant TEMPORARY explicitly to postgres and dashboard_user, plus the reviewed
  application and managed-platform roles listed below;
- assert edge_catalog_reader and its login have CONNECT=true and TEMP=false.

## Schema ACLs

Only two non-system schemas grant PUBLIC USAGE:

| Schema | Owner | Existing explicit USAGE grantees |
| --- | --- | --- |
| public | pg_database_owner | agent_writer, anon, authenticated, postgres, service_role |
| net | supabase_admin | anon, authenticated, postgres, service_role, supabase_functions_admin, supabase_admin, plus PUBLIC |

The following relevant schemas do not grant PUBLIC USAGE: app_private, auth,
cron, extensions, graphql, graphql_public, realtime, storage, vault,
supabase_migrations, svc_media, svc_orders, and svc_projects.

### Explicit public-schema preservation list

The migration should preserve these application roles unconditionally when
they exist:

- postgres
- anon
- authenticated
- service_role
- agent_reader
- agent_writer

The migration should conditionally preserve these managed-platform roles when
present:

- authenticator
- dashboard_user
- supabase_auth_admin
- supabase_storage_admin
- supabase_realtime_admin
- supabase_functions_admin
- supabase_etl_admin
- supabase_read_only_user
- supabase_replication_admin
- supabase_privileged_role

agent_reader already inherits all-schema USAGE through pg_read_all_data with
per-membership INHERIT=true, but an explicit public grant makes the contract
auditable and stable. supabase_admin is SUPERUSER and does not need an explicit
grant. cli_login_postgres enters postgres via SET membership; pgbouncer should
not issue application SQL as itself.

The same role set, excluding roles without a query workload where local
verification proves that exclusion safe, is the compatibility-preserving upper
bound for explicit database TEMPORARY grants. No edge capability or login role
belongs in that list.

## Raw relation, sequence, and PG17 MAINTAIN exposure

There are no PUBLIC relation or sequence grants in public.

These platform objects have PUBLIC object ACLs:

| Schema/object | Owner | PUBLIC privileges | Callable/reachable by a new role today? |
| --- | --- | --- | ---: |
| cron.job | supabase_admin | SELECT | no; cron lacks PUBLIC schema USAGE |
| cron.job_run_details | supabase_admin | DELETE, SELECT | no; cron lacks PUBLIC schema USAGE |
| extensions.pg_stat_statements | postgres | SELECT | no; extensions lacks PUBLIC schema USAGE |
| extensions.pg_stat_statements_info | postgres | SELECT | no; extensions lacks PUBLIC schema USAGE |
| net._http_response | supabase_admin | DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE | yes |
| net.http_request_queue | supabase_admin | DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE | yes |
| net.http_request_queue_id_seq | supabase_admin | SELECT, UPDATE, USAGE | yes |

The catalog-role conformance query must include PostgreSQL 17 MAINTAIN when it
enumerates table privileges. Omitting it understates the raw pg_net exposure.

## Routine exposure

PUBLIC EXECUTE counts by live owner and schema:

| Schema/owner | Kind | Count | Callable by a new role today? |
| --- | --- | ---: | ---: |
| public / postgres | application SECURITY DEFINER | 80 | yes |
| public / postgres | application invoker | 56 | yes |
| public / supabase_admin | vector extension | 118 | yes |
| public / supabase_admin | pg_trgm extension | 31 | yes |
| net / supabase_admin | pg_net invoker routines | 12 | yes |
| cron / supabase_admin | pg_cron routines | 5 | no |
| extensions / mixed owners | pgcrypto, uuid-ossp, pg_stat_statements and platform helpers | 55 | no |

Of the 80 callable legacy application SECURITY DEFINER routines, 52 pin a
search_path and 28 do not. The unpinned set is:

- audit_consent_change
- calculate_engagement_score
- evaluate_collection_rules
- get_conversation_history
- get_decision_analytics_by_client
- get_decision_analytics_by_type
- get_decision_bottleneck_phases
- get_or_create_conversation
- get_room_scan_hero_image
- get_room_scan_images
- get_user_permissions
- grant_role_to_user
- increment_bounce_count
- increment_campaign_counter
- increment_sequence_counter
- notify_back_in_stock
- notify_consumer_confirmation
- notify_designer_new_lead
- notify_price_drop
- revoke_role_from_user
- revoke_room_scan_access
- search_products
- share_room_scan
- sync_interaction_to_engagement
- update_conversation_on_message
- update_room_scan_image_counts
- user_has_role
- user_is_org_member

This is pre-existing security debt. The blocker fix must pin every routine it
redefines, but it should not silently redefine all 28 without the corresponding
domain tests.

### pg_net callable surface

The prokind-qualified census returns exactly 12 callable pg_net rows. All 12
are functions (prokind=f); there is no procedure overload, and
wait_until_running appears once:

- FUNCTION net._await_response(request_id bigint)
- FUNCTION net._encode_url_with_params_array(url text, params_array text[])
- FUNCTION net._http_collect_response(request_id bigint, async boolean)
- FUNCTION net._urlencode_string(string character varying)
- FUNCTION net.check_worker_is_up()
- FUNCTION net.http_collect_response(request_id bigint, async boolean)
- FUNCTION net.http_delete(url text, params jsonb, headers jsonb, timeout_milliseconds integer, body jsonb)
- FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer)
- FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer)
- FUNCTION net.wait_until_running()
- FUNCTION net.wake()
- FUNCTION net.worker_restart()

All are owned by supabase_admin, are SECURITY INVOKER, have PUBLIC EXECUTE, and
are callable only because net also has PUBLIC USAGE. Revoking PUBLIC USAGE on
net contains this entire surface while preserving the existing explicit schema
grants used by Supabase's grant_pg_net_access event trigger.

Do not grant only the three public API routines after stripping the underlying
object ACLs. In pg_net 0.19.5, http_get, http_post, and http_delete are
SECURITY INVOKER. Their bodies insert net.http_request_queue, consume its
sequence, and call _urlencode_string, _encode_url_with_params_array, and wake.
They fail for postgres/anon/authenticated/service_role unless those transitive
dependencies remain granted, or a platform owner deliberately converts the API
routines to pinned SECURITY DEFINER functions and proves the extension-upgrade
contract. Schema containment avoids that managed-extension rewrite.

### Application dependency classes

The 80 callable legacy SECURITY DEFINER functions split into:

- 31 trigger functions;
- 8 functions referenced by RLS policies;
- 1 function referenced directly by 29 active pg_cron jobs
  (invoke_edge_function);
- 40 direct RPCs or SQL helpers.

Trigger functions do not require EXECUTE for client roles merely to fire their
already-installed trigger. The 31 trigger-linked functions are:

- add_product_to_teaching_queue
- agent_task_audit_trigger
- audit_consent_change
- comms_dispatch_notifications
- decision_dispatch_resolved_email
- deposit_paid_flips_balance
- draft_milestones_on_production_start
- enqueue_aesthete_fused_reembed
- enqueue_aesthete_product_jobs
- enqueue_scan_pipeline_ingest
- ffe_ratchet_to_po_stage
- handle_new_user
- notify_back_in_stock
- notify_consumer_confirmation
- notify_damage_claim_drafted
- notify_designer_new_lead
- notify_new_waitlist_lead
- notify_payment_due
- notify_price_drop
- po_status_cascade_to_items
- receiving_inspection_side_effects
- record_decision_status_event
- record_user_session
- settle_section_on_gate_approval
- snapshot_email_template
- sync_interaction_to_engagement
- trg_invoice_payments_apply_effects
- update_conversation_on_message
- update_room_scan_image_counts
- vendor_nominations_denorm_status
- vendor_nominations_link_on_live

The RLS helper manifest is:

| Routine | Roles on dependent policies | Intended EXECUTE floor |
| --- | --- | --- |
| is_comms_admin | authenticated | authenticated |
| is_comms_thread_participant | authenticated | authenticated |
| is_coordination_party | authenticated | authenticated |
| is_org_admin_or_owner | authenticated, PUBLIC | anon, authenticated |
| is_project_team_member | authenticated, PUBLIC | anon, authenticated |
| realtime_project_access | authenticated | authenticated |
| user_has_role | authenticated | authenticated |
| user_has_role_domain | authenticated | authenticated |

postgres retains ownership execution and service_role may retain explicit
execution for operational compatibility. PUBLIC policy targeting means the
predicate can be evaluated for anon even when it returns false; removing anon
EXECUTE without changing the policy can turn a filtered query into an error.

### Service-only legacy exceptions

These are justified for postgres/service_role, not anon/authenticated:

| Routine(s) | Evidence |
| --- | --- |
| grant_role_to_user, revoke_role_from_user | Admin-only role assignment; the two grant callsites use the server-side adminClient; no active revoke callsite |
| get_user_permissions | Sole active callsite is admin-portal with-permission using adminClient |
| invoke_edge_function | Called by pg_cron and postgres-owned trigger/helpers; it reads a service-role secret through app_setting |
| increment_campaign_counter, increment_sequence_counter, increment_bounce_count | Called by service-role webhook/automation edge functions |

Every redefined routine must pin search_path, revoke EXECUTE from PUBLIC, anon,
and authenticated, then explicitly grant only postgres/service_role. The role
assignment helpers must also enforce their caller/admin contract rather than
trust caller-supplied p_granted_by.

The remaining direct RPCs must be kept according to their wire contract:

- anon is required by public Aesthete/product contracts such as
  submit_style_quiz, get_aesthete_matches, get_recommendations,
  process_style_quiz, and public search;
- authenticated is required by portal/mobile domain RPCs, including
  analytics, feedback, communications, project lifecycle, and room-scan
  operations;
- service_role is required by server-only edge functions and admin routes.

A blocker-scoped migration may revoke PUBLIC while preserving current explicit
anon/authenticated/service_role ACLs, but it must not claim those legacy grants
are all least-privilege. A full per-RPC reclassification belongs to the API
strangler/security backlog with domain contract tests.

## grant_role_to_user finding

Live signature:

    public.grant_role_to_user(uuid, character varying, uuid)

Live properties:

- owner postgres;
- SECURITY DEFINER;
- no pinned proconfig/search_path;
- EXECUTE granted to PUBLIC, anon, authenticated, postgres, and service_role.

The body accepts a caller-selected user ID, role name, and granted-by ID. It
checks only roles.is_assignable, then inserts into user_roles. It performs no
caller identity, admin-role, or grantor-integrity check.

Active callsites:

- apps/admin-portal/src/app/api/admin/designers/[id]/decision/route.ts
- apps/admin-portal/src/app/api/admin/designer-applications/[id]/decision/route.ts

Both routes authenticate an admin and call the RPC through adminClient. This
supports a service-only database grant. Schema containment alone does not fix
this routine for anon/authenticated because those roles already have explicit
USAGE on public and explicit EXECUTE on the function.

## Repository caller census

The active-code census found:

- 172 files containing a Supabase .rpc call;
- 258 distinct literal RPC names;
- 88 non-literal/multiline callsites whose names come from typed constants,
  bounded maps, or adjacent literals;
- direct REST RPC paths for the application contracts
  apply_client_decision, claim_quiz_session, delete_user_account,
  enqueue_agent_successor_if_owned, get_aesthete_matches,
  get_recommendations, is_studio_comember, mark_client_decision_viewed,
  process_style_quiz, search_products, and submit_style_quiz.

The do_work path found by the raw scan exists only in the edge proxy test.
Dynamic URLs using a bounded function variable were reviewed separately.

No active repository caller uses a custom database role for ordinary Supabase
RPC traffic. Calls resolve through anon, authenticated, or a server-side
service_role client. agent_writer has one deliberately separate RPC contract,
enqueue_agent_task; agent_reader reads through its documented role contract.
This is why explicit schema preservation can be role-based without inventing a
new grantee per routine.

## Default privileges and extension drift

Live pg_default_acl contains no explicit grant to PUBLIC. For postgres-owned
and supabase_admin-owned objects in public, the stored default ACLs explicitly
name the normal Supabase roles and omit PUBLIC. Existing PUBLIC function ACLs
are legacy object state, not evidence that future application functions should
receive PUBLIC execution.

Installed owner-sensitive extensions:

| Extension | Version | Declared schema | Owner |
| --- | --- | --- | --- |
| pg_net | 0.19.5 | extensions; creates net objects | supabase_admin |
| vector | 0.8.0 | public | supabase_admin |
| pg_trgm | 1.6 | public | supabase_admin |
| pg_cron | 1.6.4 | pg_catalog; creates cron objects | supabase_admin |
| pg_graphql | 1.5.11 | graphql | supabase_admin |
| moddatetime | 1.0 | extensions | supabase_admin |
| supabase_vault | 0.3.1 | vault | supabase_admin |
| pgcrypto | 1.3 | extensions | postgres |
| uuid-ossp | 1.1 | extensions | postgres |
| pg_stat_statements | 1.11 | extensions | postgres |

extensions.grant_pg_net_access explicitly grants net schema USAGE to
supabase_functions_admin, postgres, anon, authenticated, and service_role when
pg_net is installed or changed. It does not justify PUBLIC USAGE. Extension
scripts can recreate object ACLs, so the production preflight must be a
post-upgrade gate rather than a one-time assertion.

## Platform-owner action

The minimum owner-only action required to unblock catalog-role provisioning is:

    REVOKE USAGE ON SCHEMA net FROM PUBLIC;

It must be executed by supabase_admin or another true platform owner. The
ordinary postgres connection exposed to this project cannot execute it and
must fail closed rather than catch and ignore insufficient_privilege.

Do not revoke net object privileges in the same blocker fix unless Supabase's
managed pg_net contract and application use have been separately reviewed.
Schema USAGE removal is sufficient to make those object ACLs uncallable by the
new edge role while preserving the existing explicit managed-role access.

Required evidence after the platform action:

- net has no PUBLIC USAGE;
- the explicit Supabase grantees are unchanged;
- anon/authenticated/service_role compatibility probes still pass;
- edge_catalog_reader cannot call any net routine or access any net relation;
- the exact statement and actor are recorded without credentials.

## Reproducible read-only queries

Identity and relevant role authority:

    SELECT current_user, session_user, current_database(),
           r.rolname, r.rolsuper, r.rolcanlogin, r.rolbypassrls,
           pg_has_role(current_user, r.oid, 'MEMBER') AS owner_member,
           pg_has_role(current_user, r.oid, 'USAGE') AS owner_usage
    FROM pg_roles r
    WHERE r.rolname IN (
      'postgres','supabase_admin','anon','authenticated','service_role',
      'authenticator','edge_catalog_reader','edge_rls_user'
    )
    ORDER BY r.rolname;

Database ACL:

    SELECT d.datname, pg_get_userbyid(d.datdba) AS owner,
           COALESCE(r.rolname, 'PUBLIC') AS grantee,
           a.privilege_type, a.is_grantable
    FROM pg_database d
    CROSS JOIN LATERAL
      aclexplode(COALESCE(d.datacl, acldefault('d', d.datdba))) a
    LEFT JOIN pg_roles r ON r.oid = a.grantee
    WHERE d.datname = current_database()
    ORDER BY grantee, privilege_type;

Schema ACL:

    SELECT n.nspname, pg_get_userbyid(n.nspowner) AS owner,
           COALESCE(r.rolname, 'PUBLIC') AS grantee,
           a.privilege_type, a.is_grantable,
           pg_has_role(current_user, n.nspowner, 'USAGE') AS can_assume_owner
    FROM pg_namespace n
    CROSS JOIN LATERAL
      aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
    LEFT JOIN pg_roles r ON r.oid = a.grantee
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
    ORDER BY n.nspname, grantee, privilege_type;

PUBLIC relation/sequence ACL, including MAINTAIN:

    SELECT n.nspname, c.relname, c.relkind,
           pg_get_userbyid(c.relowner) AS owner,
           a.privilege_type
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(
        c.relacl,
        acldefault(
          CASE WHEN c.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END,
          c.relowner
        )
      )
    ) a
    WHERE n.nspname !~ '^pg_'
      AND n.nspname <> 'information_schema'
      AND a.grantee = 0
    ORDER BY n.nspname, c.relname, a.privilege_type;

PUBLIC routine ACL and callability:

    SELECT n.nspname,
           p.oid::regprocedure AS signature,
           pg_get_userbyid(p.proowner) AS owner,
           p.prosecdef,
           p.proconfig,
           EXISTS (
             SELECT 1
             FROM aclexplode(
               COALESCE(n.nspacl, acldefault('n', n.nspowner))
             ) schema_acl
             WHERE schema_acl.grantee = 0
               AND schema_acl.privilege_type = 'USAGE'
           ) AS public_schema_usage
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL
      aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
    WHERE n.nspname !~ '^pg_'
      AND n.nspname <> 'information_schema'
      AND a.grantee = 0
      AND a.privilege_type = 'EXECUTE'
    ORDER BY n.nspname, signature;

PUBLIC column ACL:

    SELECT n.nspname, c.relname, att.attname, acl.privilege_type
    FROM pg_attribute att
    JOIN pg_class c ON c.oid = att.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(att.attacl) acl
    WHERE att.attnum > 0
      AND NOT att.attisdropped
      AND acl.grantee = 0
    ORDER BY n.nspname, c.relname, att.attnum;

Default ACL:

    SELECT pg_get_userbyid(d.defaclrole) AS owner,
           COALESCE(n.nspname, '<all-schemas>') AS schema_name,
           d.defaclobjtype,
           COALESCE(r.rolname, 'PUBLIC') AS grantee,
           a.privilege_type
    FROM pg_default_acl d
    LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    LEFT JOIN pg_roles r ON r.oid = a.grantee
    ORDER BY owner, schema_name, d.defaclobjtype, grantee, a.privilege_type;

These queries return catalog metadata only. Any production execution must keep
the same read-only constraint until the reviewed migration and platform-owner
artifact have separate authorization.

## Closure checklist

- [ ] edge_api schema owns the catalog projection contract.
- [ ] edge_catalog_reader has USAGE only on edge_api and SELECT only on its view.
- [ ] Worker catalog SQL references edge_api.catalog_products.
- [ ] PUBLIC has no USAGE on public or net.
- [ ] Reviewed application/platform roles retain explicit public USAGE.
- [ ] PUBLIC has no database TEMPORARY; reviewed roles retain it explicitly.
- [ ] PUBLIC CONNECT remains and edge logins can connect.
- [ ] grant_role_to_user and revoke_role_from_user are service-only, pinned, and caller-checked.
- [ ] get_user_permissions, invoke_edge_function, and counter helpers are service-only.
- [ ] Effective privilege tests include schema USAGE, column ACLs, TEMP, CONNECT, and MAINTAIN.
- [ ] Successive pooled authenticated requests prove role/claim reset.
- [ ] Auth, refresh, REST, RPC, Functions, Storage, and Realtime compatibility pass.
- [ ] pg_net platform-owner action is recorded and independently reviewed.
- [ ] Extension upgrade drift preflight is documented as recurring, not one-time.
