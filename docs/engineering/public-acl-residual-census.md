# Residual PUBLIC privilege census

Companion prose for `supabase/tests/edge_api/public_acl_residual_census.sql`.
Re-run that script to regenerate every number here.

Measured 2026-08-17 against staging `vuesoyhfrjabfxbrzekd`. All section totals were
independently confirmed identical on production `bkvcixdmuyejfzcijpdg`.

## Reading rule: reachability, not raw privileges

A PUBLIC privilege on an object is only meaningful if PUBLIC can also enter the
schema that holds the object. Audits that count object privileges without testing
schema `USAGE` overstate this exposure by roughly an order of magnitude, because
Supabase ships many PUBLIC object privileges inside schemas that withhold `USAGE`
from PUBLIC. Every count below applies both tests.

Measured schema `USAGE` for PUBLIC:

| Schema | PUBLIC has USAGE | Consequence |
|---|---|---|
| `public` | yes | object privileges are live |
| `net` | yes | object privileges are live |
| `auth`, `cron`, `extensions`, `graphql_public`, `realtime`, `storage`, `vault`, `app_private`, `svc_media`, `svc_orders`, `svc_projects`, `supabase_migrations`, `pgbouncer` | no | object privileges are inert (section D) |

Reachable totals:

| Reachable set | Count | SECURITY DEFINER |
|---|---|---|
| routines in `public` owned by `postgres` | 136 | 80 |
| routines in `public` owned by `supabase_admin` | 149 | 0 |
| routines in `net` owned by `supabase_admin` | 12 | 0 |

`reviewed_by` is left blank throughout for Kody's sign-off.

---

## Section A — revocable, must reach zero

136 routines in `public` owned by `postgres`, reachable by PUBLIC. 80 are
SECURITY DEFINER. `postgres` owns them, so their PUBLIC EXECUTE privilege is ours
to withdraw.

**Go/no-go gate — PASSED.** All 136 already carry their own explicit EXECUTE
privileges for `anon`, `authenticated`, and `service_role`. Zero routines would
lose access if PUBLIC EXECUTE were withdrawn. The census emits the offending set
directly; it returned **0 rows**. Any row in that result blocks the change.

All 136 share one ACL shape, written **ACL-A** below:

```
{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
```

The leading `=X/postgres` is the PUBLIC EXECUTE privilege being withdrawn; the three
named-role entries are what keeps every real caller working afterwards.

Rationale codes:

- **SD-1** — SECURITY DEFINER. Runs with the owner's rights, so PUBLIC EXECUTE is
  the entire gate in front of owner-privileged logic. `anon`, `authenticated`, and
  `service_role` already hold explicit EXECUTE, so withdrawing PUBLIC closes the
  unnamed path at no cost to any caller.
- **SI-1** — SECURITY INVOKER. Runs as the caller and stays under the caller's RLS,
  so the exposure is lower, but the PUBLIC privilege is equally redundant: the three
  named roles already hold explicit EXECUTE.

| Schema | Object | Owner | prosecdef | ACL | Why safe / accepted | reviewed_by |
|---|---|---|---|---|---|---|
| public | `add_product_to_teaching_queue()` | postgres | true | ACL-A | SD-1 |  |
| public | `agent_task_audit_trigger()` | postgres | true | ACL-A | SD-1 |  |
| public | `audit_consent_change()` | postgres | true | ACL-A | SD-1 |  |
| public | `calculate_engagement_score(p_user_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `comms_dispatch_notifications()` | postgres | true | ACL-A | SD-1 |  |
| public | `comms_resolve_role(p_user_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `decision_dispatch_resolved_email()` | postgres | true | ACL-A | SD-1 |  |
| public | `deposit_paid_flips_balance()` | postgres | true | ACL-A | SD-1 |  |
| public | `draft_milestones_on_production_start()` | postgres | true | ACL-A | SD-1 |  |
| public | `enqueue_aesthete_fused_reembed()` | postgres | true | ACL-A | SD-1 |  |
| public | `enqueue_aesthete_product_jobs()` | postgres | true | ACL-A | SD-1 |  |
| public | `enqueue_scan_pipeline_ingest()` | postgres | true | ACL-A | SD-1 |  |
| public | `evaluate_collection_rules(p_collection_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `ffe_ratchet_to_po_stage()` | postgres | true | ACL-A | SD-1 |  |
| public | `find_products_for_style(style_id uuid, match_count integer)` | postgres | true | ACL-A | SD-1 |  |
| public | `find_products_similar_to(product_id uuid, match_count integer)` | postgres | true | ACL-A | SD-1 |  |
| public | `find_similar_products(query_embedding vector, match_threshold double precision, match_count integer, exclude_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `flip_pending_balance_to_due(p_purchase_order_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `get_conversation_history(p_user_id uuid, p_limit integer, p_cursor timestamp with time zone)` | postgres | true | ACL-A | SD-1 |  |
| public | `get_decision_analytics_by_client(p_designer_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `get_decision_analytics_by_type(p_designer_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `get_decision_bottleneck_phases(p_designer_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `get_embedding_stats()` | postgres | true | ACL-A | SD-1 |  |
| public | `get_or_create_conversation(p_user_id uuid, p_screen text, p_context jsonb)` | postgres | true | ACL-A | SD-1 |  |
| public | `get_recommendations(p_room_id uuid, p_category text, p_limit integer, p_offset integer)` | postgres | true | ACL-A | SD-1 |  |
| public | `get_room_scan_hero_image(p_scan_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `get_room_scan_images(p_scan_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `get_user_permissions(p_user_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `grant_role_to_user(p_user_id uuid, p_role_name character varying, p_granted_by uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `handle_new_user()` | postgres | true | ACL-A | SD-1 |  |
| public | `increment_bounce_count(p_user_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `increment_campaign_counter(p_campaign_id uuid, p_column text)` | postgres | true | ACL-A | SD-1 |  |
| public | `increment_sequence_counter(p_sequence_id uuid, p_column text)` | postgres | true | ACL-A | SD-1 |  |
| public | `invoke_edge_function(fn_name text, body jsonb)` | postgres | true | ACL-A | SD-1 |  |
| public | `is_comms_admin(p_user_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `is_comms_thread_participant(p_thread_id uuid, p_user_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `is_coordination_party(_project_id uuid, _user_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `is_org_admin_or_owner(_organization_id uuid, _user_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `is_project_team_member(_project_id uuid, _user_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `mark_feedback_seen(p_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `next_co_number(p_project_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `notify_back_in_stock()` | postgres | true | ACL-A | SD-1 |  |
| public | `notify_consumer_confirmation()` | postgres | true | ACL-A | SD-1 |  |
| public | `notify_damage_claim_drafted()` | postgres | true | ACL-A | SD-1 |  |
| public | `notify_designer_new_lead()` | postgres | true | ACL-A | SD-1 |  |
| public | `notify_new_waitlist_lead()` | postgres | true | ACL-A | SD-1 |  |
| public | `notify_payment_due()` | postgres | true | ACL-A | SD-1 |  |
| public | `notify_price_drop()` | postgres | true | ACL-A | SD-1 |  |
| public | `open_project_direct(p_title text, p_client_id uuid, p_budget_min_cents integer, p_budget_max_cents integer, p_start_date date, p_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `po_status_cascade_to_items()` | postgres | true | ACL-A | SD-1 |  |
| public | `process_style_quiz(quiz_answers jsonb, timings jsonb)` | postgres | true | ACL-A | SD-1 |  |
| public | `react_to_feedback(p_id uuid, p_emoji text)` | postgres | true | ACL-A | SD-1 |  |
| public | `realtime_project_access(topic text)` | postgres | true | ACL-A | SD-1 |  |
| public | `receiving_inspection_side_effects()` | postgres | true | ACL-A | SD-1 |  |
| public | `record_decision_status_event()` | postgres | true | ACL-A | SD-1 |  |
| public | `record_user_session()` | postgres | true | ACL-A | SD-1 |  |
| public | `reply_to_feedback(p_id uuid, p_text text)` | postgres | true | ACL-A | SD-1 |  |
| public | `revoke_role_from_user(p_user_id uuid, p_role_name character varying)` | postgres | true | ACL-A | SD-1 |  |
| public | `revoke_room_scan_access(p_association_id uuid, p_reason text)` | postgres | true | ACL-A | SD-1 |  |
| public | `rpc_mark_thread_read(p_thread_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `rpc_soft_delete_message(p_message_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `rpc_start_direct_thread(counterpart uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `rpc_start_project_thread(p_project_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `rpc_start_vendor_brief(p_vendor_id uuid, p_project_id uuid, p_body text)` | postgres | true | ACL-A | SD-1 |  |
| public | `rpc_unread_summary()` | postgres | true | ACL-A | SD-1 |  |
| public | `search_products(search_query text, category_filter text, min_price integer, max_price integer, style_filter text, sort_by text, page_size integer, page_offset integer)` | postgres | true | ACL-A | SD-1 |  |
| public | `search_products_semantic(search_query text, query_embedding vector, match_count integer)` | postgres | true | ACL-A | SD-1 |  |
| public | `set_feedback_status(p_id uuid, p_status text, p_note text)` | postgres | true | ACL-A | SD-1 |  |
| public | `settle_section_on_gate_approval()` | postgres | true | ACL-A | SD-1 |  |
| public | `share_room_scan(p_scan_id uuid, p_designer_id uuid, p_access_level text, p_expires_in_days integer, p_project_id uuid, p_lead_id uuid)` | postgres | true | ACL-A | SD-1 |  |
| public | `snapshot_email_template()` | postgres | true | ACL-A | SD-1 |  |
| public | `sync_interaction_to_engagement()` | postgres | true | ACL-A | SD-1 |  |
| public | `trg_invoice_payments_apply_effects()` | postgres | true | ACL-A | SD-1 |  |
| public | `update_conversation_on_message()` | postgres | true | ACL-A | SD-1 |  |
| public | `update_room_scan_image_counts()` | postgres | true | ACL-A | SD-1 |  |
| public | `user_has_role(p_user_id uuid, p_role_name character varying)` | postgres | true | ACL-A | SD-1 |  |
| public | `user_has_role_domain(p_user_id uuid, p_domain character varying)` | postgres | true | ACL-A | SD-1 |  |
| public | `user_is_org_member(p_user_id uuid, p_org_id uuid, p_min_role member_role)` | postgres | true | ACL-A | SD-1 |  |
| public | `vendor_nominations_denorm_status()` | postgres | true | ACL-A | SD-1 |  |
| public | `vendor_nominations_link_on_live()` | postgres | true | ACL-A | SD-1 |  |
| public | `agent_tasks_set_updated_at()` | postgres | false | ACL-A | SI-1 |  |
| public | `aggregate_user_style_signals(p_user_id uuid)` | postgres | false | ACL-A | SI-1 |  |
| public | `catalog_feed_batches_set_updated_at()` | postgres | false | ACL-A | SI-1 |  |
| public | `comms_bump_thread_activity()` | postgres | false | ACL-A | SI-1 |  |
| public | `comms_check_thread_cardinality()` | postgres | false | ACL-A | SI-1 |  |
| public | `comms_touch_updated_at()` | postgres | false | ACL-A | SI-1 |  |
| public | `cowork_tasks_frozen()` | postgres | false | ACL-A | SI-1 |  |
| public | `create_campaign_analytics()` | postgres | false | ACL-A | SI-1 |  |
| public | `decrement_room_saved_items(p_room_id uuid, p_count integer)` | postgres | false | ACL-A | SI-1 |  |
| public | `enforce_agent_task_transition()` | postgres | false | ACL-A | SI-1 |  |
| public | `enforce_fulfillment_line_transition()` | postgres | false | ACL-A | SI-1 |  |
| public | `enforce_fulfillment_po_transition()` | postgres | false | ACL-A | SI-1 |  |
| public | `expire_room_scan_associations()` | postgres | false | ACL-A | SI-1 |  |
| public | `ffe_status_rank(p_status text)` | postgres | false | ACL-A | SI-1 |  |
| public | `field_capture_jsonb_text_array(p_value jsonb)` | postgres | false | ACL-A | SI-1 |  |
| public | `field_captures_guard_routing()` | postgres | false | ACL-A | SI-1 |  |
| public | `fulfillment_events_append_only()` | postgres | false | ACL-A | SI-1 |  |
| public | `guard_install_window_ratchet()` | postgres | false | ACL-A | SI-1 |  |
| public | `guard_invoiced_time_entry()` | postgres | false | ACL-A | SI-1 |  |
| public | `immutable_array_to_string(arr text[], sep text)` | postgres | false | ACL-A | SI-1 |  |
| public | `increment_room_saved_items(p_room_id uuid, p_count integer)` | postgres | false | ACL-A | SI-1 |  |
| public | `increment_room_scan_count()` | postgres | false | ACL-A | SI-1 |  |
| public | `ledger_append_only()` | postgres | false | ACL-A | SI-1 |  |
| public | `ledger_entry_balanced()` | postgres | false | ACL-A | SI-1 |  |
| public | `mark_scan_upload_complete(p_scan_id uuid)` | postgres | false | ACL-A | SI-1 |  |
| public | `mark_waitlist_converted()` | postgres | false | ACL-A | SI-1 |  |
| public | `merge_scan_artifact_sha256(p_scan_id uuid, p_kind text, p_sha text)` | postgres | false | ACL-A | SI-1 |  |
| public | `next_court_for(item client_decisions)` | postgres | false | ACL-A | SI-1 |  |
| public | `nomination_transition_is_legal(p_from text, p_to text)` | postgres | false | ACL-A | SI-1 |  |
| public | `po_status_to_ffe_stage(p_po_status text)` | postgres | false | ACL-A | SI-1 |  |
| public | `products_normalize_layer_defaults()` | postgres | false | ACL-A | SI-1 |  |
| public | `proposal_captures_guard_proposal_owner()` | postgres | false | ACL-A | SI-1 |  |
| public | `room_scans_guard_routing()` | postgres | false | ACL-A | SI-1 |  |
| public | `seed_concierge_initial_checklist()` | postgres | false | ACL-A | SI-1 |  |
| public | `send_weekly_pulse(p_pulse_id uuid, p_body text, p_subject text)` | postgres | false | ACL-A | SI-1 |  |
| public | `set_decision_designer_id()` | postgres | false | ACL-A | SI-1 |  |
| public | `set_room_emergence(p_room_id uuid, p_has_emergence boolean, p_message text)` | postgres | false | ACL-A | SI-1 |  |
| public | `stamp_ffe_status_change()` | postgres | false | ACL-A | SI-1 |  |
| public | `stamp_project_completed_at()` | postgres | false | ACL-A | SI-1 |  |
| public | `touch_decision_comment_updated_at()` | postgres | false | ACL-A | SI-1 |  |
| public | `update_companion_updated_at()` | postgres | false | ACL-A | SI-1 |  |
| public | `update_designer_application_updated_at()` | postgres | false | ACL-A | SI-1 |  |
| public | `update_founding_designer_application_updated_at()` | postgres | false | ACL-A | SI-1 |  |
| public | `update_gdpr_updated_at()` | postgres | false | ACL-A | SI-1 |  |
| public | `update_maker_application_updated_at()` | postgres | false | ACL-A | SI-1 |  |
| public | `update_pipeline_vendors_updated_at()` | postgres | false | ACL-A | SI-1 |  |
| public | `update_profiles_updated_at()` | postgres | false | ACL-A | SI-1 |  |
| public | `update_room_saved_item_count()` | postgres | false | ACL-A | SI-1 |  |
| public | `update_specialization_rating()` | postgres | false | ACL-A | SI-1 |  |
| public | `update_updated_at()` | postgres | false | ACL-A | SI-1 |  |
| public | `update_updated_at_column()` | postgres | false | ACL-A | SI-1 |  |
| public | `update_vendor_rating_stats()` | postgres | false | ACL-A | SI-1 |  |
| public | `vec_lerp(a vector, b vector, w real)` | postgres | false | ACL-A | SI-1 |  |
| public | `vec_normalize(v vector)` | postgres | false | ACL-A | SI-1 |  |
| public | `vec_scale(v vector, k real)` | postgres | false | ACL-A | SI-1 |  |
| public | `vendor_nominations_state_machine()` | postgres | false | ACL-A | SI-1 |  |

---

## Section B — accepted, invoker-only

161 reachable routines owned by `supabase_admin` (149 in `public`, 12 in `net`).
`postgres` does not own them, so **we cannot withdraw their PUBLIC EXECUTE
privilege** — only Supabase can. Every one is SECURITY INVOKER (`prosecdef = false`),
so it executes with the caller's rights and inherits the caller's RLS. Their ACL is
`(null)`, i.e. no explicit ACL, which in Postgres means the built-in default of
PUBLIC EXECUTE.

The 149 in `public` are entirely extension-supplied operator and math routines.
They are listed by owning extension rather than by overload, because each name
carries several type overloads that differ only in signature and share one identical
safety argument.

| Schema | Object | Owner | prosecdef | ACL | Why safe / accepted | reviewed_by |
|---|---|---|---|---|---|---|
| public | `vector` extension — 118 routines | supabase_admin | false | (null) | Pure vector arithmetic, comparison, I/O and index-support routines. They touch no table and hold no state, so PUBLIC EXECUTE grants no data access. Not ours to change. |  |
| public | `pg_trgm` extension — 31 routines | supabase_admin | false | (null) | Pure trigram similarity and GIN/GiST index-support routines. Stateless, no table access. Not ours to change. |  |

Complete inventory, `vector` (118 routines across these names): `array_to_halfvec`,
`array_to_sparsevec`, `array_to_vector`, `avg`, `binary_quantize`, `cosine_distance`,
`halfvec`, `halfvec_accum`, `halfvec_add`, `halfvec_avg`, `halfvec_cmp`,
`halfvec_combine`, `halfvec_concat`, `halfvec_eq`, `halfvec_ge`, `halfvec_gt`,
`halfvec_in`, `halfvec_l2_squared_distance`, `halfvec_le`, `halfvec_lt`, `halfvec_mul`,
`halfvec_ne`, `halfvec_negative_inner_product`, `halfvec_out`, `halfvec_recv`,
`halfvec_send`, `halfvec_spherical_distance`, `halfvec_sub`, `halfvec_to_float4`,
`halfvec_to_sparsevec`, `halfvec_to_vector`, `halfvec_typmod_in`, `hamming_distance`,
`hnsw_bit_support`, `hnsw_halfvec_support`, `hnsw_sparsevec_support`, `hnswhandler`,
`inner_product`, `ivfflat_bit_support`, `ivfflat_halfvec_support`, `ivfflathandler`,
`jaccard_distance`, `l1_distance`, `l2_distance`, `l2_norm`, `l2_normalize`,
`sparsevec`, `sparsevec_cmp`, `sparsevec_eq`, `sparsevec_ge`, `sparsevec_gt`,
`sparsevec_in`, `sparsevec_l2_squared_distance`, `sparsevec_le`, `sparsevec_lt`,
`sparsevec_ne`, `sparsevec_negative_inner_product`, `sparsevec_out`, `sparsevec_recv`,
`sparsevec_send`, `sparsevec_to_halfvec`, `sparsevec_to_vector`, `sparsevec_typmod_in`,
`subvector`, `sum`, `vector`, `vector_accum`, `vector_add`, `vector_avg`, `vector_cmp`,
`vector_combine`, `vector_concat`, `vector_dims`, `vector_eq`, `vector_ge`, `vector_gt`,
`vector_in`, `vector_l2_squared_distance`, `vector_le`, `vector_lt`, `vector_mul`,
`vector_ne`, `vector_negative_inner_product`, `vector_norm`, `vector_out`, `vector_recv`,
`vector_send`, `vector_spherical_distance`, `vector_sub`, `vector_to_float4`,
`vector_to_halfvec`, `vector_to_sparsevec`, `vector_typmod_in`.

Complete inventory, `pg_trgm` (31 routines): `gin_extract_query_trgm`,
`gin_extract_value_trgm`, `gin_trgm_consistent`, `gin_trgm_triconsistent`,
`gtrgm_compress`, `gtrgm_consistent`, `gtrgm_decompress`, `gtrgm_distance`, `gtrgm_in`,
`gtrgm_options`, `gtrgm_out`, `gtrgm_penalty`, `gtrgm_picksplit`, `gtrgm_same`,
`gtrgm_union`, `set_limit`, `show_limit`, `show_trgm`, `similarity`, `similarity_dist`,
`similarity_op`, `strict_word_similarity`, `strict_word_similarity_commutator_op`,
`strict_word_similarity_dist_commutator_op`, `strict_word_similarity_dist_op`,
`strict_word_similarity_op`, `word_similarity`, `word_similarity_commutator_op`,
`word_similarity_dist_commutator_op`, `word_similarity_dist_op`, `word_similarity_op`.

The 12 in `net` are listed per entry, because their side effects matter — they are
carried forward into section C2 rather than accepted here.

---

## Section C — accepted with named risk

> **Accepted service_role-disclosure exposure.** `public.invoke_edge_function` and four notify functions build their pg_net request with the service_role JWT in the headers (`'apikey', v_key` and `'Authorization', 'Bearer ' || v_key` — see `supabase/migrations/00258_edge_settings_vault.sql:74-75`, and lines 120/182/248/316). Those headers transit `net.http_request_queue`, on which PUBLIC holds full DML, and 29 pg_cron jobs drive writes to it. A role with SELECT on that table and a sustained polling loop could harvest service_role and bypass RLS entirely. Mitigating: the queue drains to empty (observed 0 rows), so exposure is transient rather than at-rest. Accepted by Kody on 2026-08-17 with the mechanism known. Compensating action: file a Supabase support request to revoke PUBLIC on `net.*`.

The four notify functions are `public.notify_back_in_stock`,
`public.notify_consumer_confirmation`, `public.notify_designer_new_lead`, and
`public.notify_price_drop`. Census section C3 identifies them by scanning routine
bodies for `net.http_*` calls, so the set stays accurate as the schema changes.

### Scope of the ruling's "transient": the queue only, not the response table

The ruling's mitigating clause — "the queue drains to empty (observed 0 rows), so
exposure is transient rather than at-rest" — is accurate, and it is **specific to
`net.http_request_queue`**. It does not extend to `net._http_response`, which is a
different table with different retention and different contents. The two are split
here deliberately; conflating them is what the record exists to prevent.

| | `net.http_request_queue` | `net._http_response` |
|---|---|---|
| Carries | outbound request headers — **including the service_role JWT** | response **bodies and headers** |
| Retention | drains to empty; 0 rows observed | **retained at rest up to ~6 hours** on a rolling window |
| Steady state | 0 rows | ~1456 rows |
| PUBLIC privileges | full DML (`arwdDxtm`), RLS off | full DML (`arwdDxtm`), RLS off |
| Characterization | genuinely transient — this is where the **privilege-escalation** risk lives | **not transient, not permanent** — a 6-hour at-rest **disclosure and tampering** window |

Retention was measured directly rather than assumed. Two observations ~1h apart:

| | earlier | later |
|---|---|---|
| rows | 1457 | 1456 |
| oldest `created` | 10:26 | 11:25 |
| newest `created` | 16:25 | 17:24 |
| span | — | 05:59:00 |

The oldest row advanced by roughly an hour while the span stayed pinned at 05:59:00,
which is the signature of a hard ~6-hour rolling TTL rather than either unbounded
growth or prompt drainage. So response bodies and headers from every edge-function
call made by any caller are readable — and forgeable, and destroyable — by anything
that can reach `net`, for up to six hours after the call.

Other measurements at census time: 45 pg_cron jobs total, 29 of them driving
`invoke_edge_function` or `net.http_*`.

### Signed exception list

Everything accepted in this section, so the sign-off surface is one list rather than
three tables:

1. `net.http_request_queue` — full PUBLIC DML; transports the service_role JWT; transient. **Escalation risk.** (C1)
2. `net._http_response` — full PUBLIC DML; ~6h at-rest retention of response bodies and headers. **Disclosure and tampering risk, not covered by the ruling's "transient".** (C1)
3. `net.http_request_queue_id_seq` — a **third PUBLIC-writable object in `net` beyond the two named in the ruling**; PUBLIC holds `SELECT`/`UPDATE`/`USAGE` on the queue's id counter. (C1)
4. `net.http_get`, `net.http_post`, **`net.http_delete`** — outbound-request primitives executed by the privileged worker. `http_delete` is reachable but was not named in the ruling. (C2)
5. **`net.worker_restart()` — a denial-of-service primitive against all 29 net-driving cron jobs.** The sharpest item in the reachable `net` surface. (C2)
6. `net.wake`, `net.wait_until_running`, `net.check_worker_is_up` — further worker-lifecycle control. (C2)
7. `net.http_collect_response`, `net._http_collect_response`, `net._await_response` — cross-caller response disclosure without needing direct table access. (C2)
8. `public.invoke_edge_function` and the four notify functions — the service_role carriers. These are also section A members, so the PUBLIC path to them closes with the section A withdrawal. (C3)

Items 1–7 are owned by `supabase_admin` and are **not ours to change**; they close only
via the compensating action in the ruling.

### C1 — PUBLIC-accessible relations

| Schema | Object | Owner | prosecdef | ACL | Why safe / accepted | reviewed_by |
|---|---|---|---|---|---|---|
| net | `http_request_queue` (table) | supabase_admin | n/a | `{supabase_admin=arwdDxtm/supabase_admin,=arwdDxtm/supabase_admin}` | **Named risk.** Full PUBLIC DML, RLS disabled. Carries service_role bearer headers in transit — this is the exposure accepted in the ruling above. Not ours to change; owned by `supabase_admin`. |  |
| net | `_http_response` (table) | supabase_admin | n/a | `{supabase_admin=arwdDxtm/supabase_admin,=arwdDxtm/supabase_admin}` | **Named risk — the ruling's "transient" does not apply here.** Full PUBLIC DML, RLS disabled. Unlike the queue, which empties, this table expires rows on a hard ~6-hour rolling TTL, holding a moving window of response **bodies and headers** at ~1456 rows steady-state (measured: span pinned at 05:59:00 while the oldest row advanced ~1h). Any role reaching `net` can read, forge, or destroy every edge-function response fetched by any caller within that window. Distinct from the queue's service_role escalation risk: this is at-rest disclosure and tampering. Accepted; same compensating action. |  |
| net | `http_request_queue_id_seq` (sequence) | supabase_admin | n/a | `{supabase_admin=rwU/supabase_admin,=rwU/supabase_admin}` | Third PUBLIC-writable object in `net`, beyond the two named in the ruling. PUBLIC holds `SELECT`/`UPDATE`/`USAGE`, so a caller can advance or reset the queue's id counter. Lower severity than the tables — it enables disruption of the pg_net worker, not disclosure. Accepted; same compensating action. |  |

### C2 — out-of-band-effect routines

All twelve are `prosecdef = false` with a `(null)` ACL, i.e. SECURITY INVOKER with the
default PUBLIC EXECUTE. **`prosecdef` is the wrong discriminator for this set.** Each
routine hands work to the pg_net background worker; the worker then performs that work
with *its own* privilege, outside the caller's transaction and outside RLS. Judge them
by effect, not by the flag.

| Schema | Object | Owner | prosecdef | ACL | Why safe / accepted | reviewed_by |
|---|---|---|---|---|---|---|
| net | `http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer)` | supabase_admin | false | (null) | Enqueues an outbound HTTP request executed by the privileged worker. Server-side request forgery and data-exfiltration primitive for any role that reaches `net`. Not ours to change. |  |
| net | `http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer)` | supabase_admin | false | (null) | As `http_get`, with an attacker-chosen body. Not ours to change. |  |
| net | `http_delete(url text, params jsonb, headers jsonb, timeout_milliseconds integer, body jsonb)` | supabase_admin | false | (null) | As `http_get`, issuing DELETE. Present in the reachable set although not named in the original ruling. Not ours to change. |  |
| net | `worker_restart()` | supabase_admin | false | (null) | Restarts the pg_net background worker. **A denial-of-service primitive against all 29 net-driving cron jobs.** The sharpest item in the reachable `net` surface: any role that can enter `net` can stall every scheduled edge-function invocation. Not ours to change. |  |
| net | `wake()` | supabase_admin | false | (null) | Signals the background worker. Low impact on its own. Not ours to change. |  |
| net | `wait_until_running()` | supabase_admin | false | (null) | Blocks until the worker is up; can hold a session open. Low impact. Not ours to change. |  |
| net | `check_worker_is_up()` | supabase_admin | false | (null) | Reports worker liveness. Information only. Not ours to change. |  |
| net | `http_collect_response(request_id bigint, async boolean)` | supabase_admin | false | (null) | Returns the response for any request id, across all callers — a disclosure path that does not require direct table access. Not ours to change. |  |
| net | `_http_collect_response(request_id bigint, async boolean)` | supabase_admin | false | (null) | Internal form of the above, same disclosure path. Not ours to change. |  |
| net | `_await_response(request_id bigint)` | supabase_admin | false | (null) | Blocks on and returns another caller's response. Same disclosure path. Not ours to change. |  |
| net | `_encode_url_with_params_array(url text, params_array text[])` | supabase_admin | false | (null) | Pure string helper, no side effect. Safe. |  |
| net | `_urlencode_string(string character varying)` | supabase_admin | false | (null) | Pure string helper, no side effect. Safe. |  |

`cron.schedule` was checked and is **not** in this set. It does carry PUBLIC EXECUTE
(`=X/supabase_admin`), but the `cron` schema withholds `USAGE` from PUBLIC, so PUBLIC
cannot reach it. It is recorded in section D. See the divergence note at the end.

### C3 — our routines that drive pg_net

These five are the service_role carriers named in the ruling. All are `postgres`-owned,
SECURITY DEFINER, ACL-A, and therefore also members of section A — withdrawing PUBLIC
EXECUTE closes the anonymous path to each.

| Schema | Object | Owner | prosecdef | ACL | Why safe / accepted | reviewed_by |
|---|---|---|---|---|---|---|
| public | `invoke_edge_function(fn_name text, body jsonb)` | postgres | true | ACL-A | Reads the service_role key from vault and places it in a pg_net header. Section A withdrawal removes the PUBLIC path; the header's transit through `net.http_request_queue` is the accepted residual. |  |
| public | `notify_back_in_stock()` | postgres | true | ACL-A | Same header construction (migration line 120). Trigger function; same residual. |  |
| public | `notify_consumer_confirmation()` | postgres | true | ACL-A | Same header construction (migration line 182). Trigger function; same residual. |  |
| public | `notify_designer_new_lead()` | postgres | true | ACL-A | Same header construction (migration line 248). Trigger function; same residual. |  |
| public | `notify_price_drop()` | postgres | true | ACL-A | Same header construction (migration line 316). Trigger function; same residual. |  |

---

## Section D — not flagged by the gate

PUBLIC object privileges the gate correctly leaves alone, for one of two reasons. A
naive audit counts them all as exposure; neither reason makes them so. Recorded so a
future reader recognises them and does not re-open the question. **Nothing in this
section requires action.**

- **Reachable but invoker-shaped (low-capability).** The five reserved schemas
  `extensions`, `storage`, `realtime`, `auth`, and `graphql_public` grant `anon` (and
  `authenticated`) explicit schema `USAGE`. A caller holding the anon key therefore
  *can* reach these routines — the earlier "PUBLIC pseudo-role lacks `USAGE`, so
  unreachable" reasoning was wrong, because reachability keys on the untrusted login
  roles, not on the `PUBLIC` pseudo-role (the same distinction section E draws for the
  `storage.objects` policies). What keeps them off the gate is *capability*, not
  reach: every routine that actually carries PUBLIC EXECUTE here is SECURITY INVOKER
  (`prosecdef = false`), so it runs with the *caller's own* near-zero privilege rather
  than the owner's. Reachable, but not capability-bearing — correctly unflagged, and
  not a live exposure.
- **Genuinely unreachable.** `cron` and the `svc_*` schemas withhold `USAGE` from
  `anon`/PUBLIC entirely, so those rows cannot be entered by an untrusted caller at
  all.

100 PUBLIC EXECUTE privileges across 9 schemas, plus 4 relation privileges:

| Schema | Object | Owner | prosecdef | ACL | Why safe / accepted | reviewed_by |
|---|---|---|---|---|---|---|
| extensions | 55 routines (pgcrypto, uuid-ossp, pg_stat_statements, moddatetime, PostgREST watch, Supabase `grant_*_access` helpers) | supabase_admin | mixed | PUBLIC EXECUTE present | `anon`/`authenticated` hold explicit schema `USAGE` (`{postgres=UC/postgres,anon=U/postgres,authenticated=U/postgres,service_role=U/postgres,dashboard_user=UC/postgres}`), so these are reachable via the anon key — not unreachable. The PUBLIC-executable routines are SECURITY INVOKER, running at the caller's own near-zero privilege; reachable but low-capability, correctly unflagged. |  |
| storage | 17 routines | supabase_admin | mixed | PUBLIC EXECUTE present | `anon`/`authenticated` hold explicit schema `USAGE` on `storage` (section E measures this directly), so these are reachable via the anon key — not unreachable. The PUBLIC-executable routines are SECURITY INVOKER, running at the caller's own near-zero privilege; reachable but low-capability, correctly unflagged. |  |
| realtime | 15 routines | supabase_admin | mixed | PUBLIC EXECUTE present | `anon`/`authenticated` hold explicit schema `USAGE` on `realtime`, so these are reachable via the anon key — not unreachable. The PUBLIC-executable routines are SECURITY INVOKER, running at the caller's own near-zero privilege; reachable but low-capability, correctly unflagged. |  |
| cron | 5 routines — `schedule` (2 overloads), `unschedule` (2 overloads), `job_cache_invalidate` | supabase_admin | false | `{=X/supabase_admin,supabase_admin=X/supabase_admin,postgres=X*/supabase_admin}` | Carries PUBLIC EXECUTE, but `cron` withholds schema `USAGE` from PUBLIC (`{supabase_admin=UC/supabase_admin,postgres=U*/supabase_admin}`). Reachable only by `postgres` and its members. Unreachable by PUBLIC. |  |
| auth | 4 routines — `uid`, `role`, `email`, `jwt` | supabase_admin | false | PUBLIC EXECUTE present | `anon`/`authenticated` hold explicit schema `USAGE` on `auth`, so these are reachable via the anon key — not unreachable. All four are SECURITY INVOKER (`prosecdef = false`), running at the caller's own near-zero privilege; they only read the caller's own JWT claims. Reachable but low-capability, correctly unflagged. |  |
| graphql_public | 1 routine — `graphql` | supabase_admin | false | PUBLIC EXECUTE present | `anon`/`authenticated` hold explicit schema `USAGE` on `graphql_public`, so this is reachable via the anon key — not unreachable. It is SECURITY INVOKER (`prosecdef = false`), running at the caller's own near-zero privilege behind the same RLS every GraphQL request already honours. Reachable but low-capability, correctly unflagged. |  |
| svc_media | 1 routine — `set_updated_at` | postgres | false | PUBLIC EXECUTE present | `svc_media` has no ACL, so only its owner holds `USAGE`. Unreachable by PUBLIC. |  |
| svc_orders | 1 routine — `set_updated_at` | postgres | false | PUBLIC EXECUTE present | `svc_orders` has no ACL. Unreachable by PUBLIC. |  |
| svc_projects | 1 routine — `set_updated_at` | postgres | false | PUBLIC EXECUTE present | `svc_projects` has no ACL. Unreachable by PUBLIC. |  |
| cron | 2 relations | supabase_admin | n/a | PUBLIC table privileges present | Schema `USAGE` withheld from PUBLIC. Unreachable. |  |
| extensions | 2 relations | supabase_admin | n/a | PUBLIC table privileges present | `anon`/`authenticated` hold schema `USAGE` on `extensions`, so — unlike `cron` above — these are reachable via the anon key, not unreachable. They are supabase_admin-owned extension-internal relations exposing only aggregate extension state (not application rows); reachable but low-capability, accepted with no action. |  |

---

## Section E — storage.objects policies the repo deferred and never narrowed

**Why this is open: the deferral target does not exist and cannot be run.**
Migration `00484_public_rpc_authorization_contract.sql:15-17` states that the PUBLIC
policies on `storage.objects` "are intentionally narrowed in the privileged 00483
platform-admin phase." `supabase/platform-admin/00483_public_acl_allowlist.sql`
contains **no policy DDL at all** (0 `CREATE`/`DROP`/`ALTER POLICY` statements in 1056
lines), and that script is retired under Kody's ruling as unrunnable on Supabase Cloud —
`postgres` is `rolsuper = false` and cannot become `supabase_admin`. So the deferral
points at a step that will never happen, while the runbook records Blocker 1 as closed.

This is a **separate category from sections A–D**. Those are PUBLIC privileges we cannot
withdraw without superuser. This is a promise the repository made and did not keep.
Recorded so a retired script stops implying these are handled. Reported by a6.

### Reachability: checked, not assumed — and it does **not** follow section D

Section D concluded the 17 `storage` routines are unreachable because `storage`
withholds schema `USAGE` from PUBLIC. **That reasoning does not carry to RLS policies.**
Measured:

| Role | `storage` USAGE | SELECT/INSERT/UPDATE/DELETE on `storage.objects` |
|---|---|---|
| PUBLIC (pseudo-role) | no | no |
| `anon` | **yes** (explicit) | **yes, all four** |
| `authenticated` | **yes** (explicit) | **yes, all four** |
| `service_role` | yes | yes |

`anon` and `authenticated` hold their own explicit privileges, and a policy whose role
list is `{public}` applies to **every** role including `anon`. `storage.objects` has RLS
enabled (not forced), owner `supabase_storage_admin`, 61 policies total, 29 of them with
role `{public}`. So these policies *are* reachable — by any caller holding the anon key,
through the Storage API, which is a different path from schema `USAGE`.

The second gate is the bucket's `public` flag: on a public bucket, objects are already
served over the unauthenticated CDN path, so a permissive read policy adds nothing.

### Determination

Of the 29 `{public}` policies, **28 are flagged but not actually exposed**, and **one is
genuinely reachable by `anon`**:

| Schema.table | Policy | Command | Role | Predicate | Bucket public? | Determination | accepted_by | accepted_on |
|---|---|---|---|---|---|---|---|---|
| storage.objects | `proposal_mood_boards_proposal_read` | SELECT | `{public}` | `bucket_id = 'proposal-mood-boards' AND EXISTS (SELECT 1 FROM proposals proposal WHERE proposal.id::text = (storage.foldername(objects.name))[1])` | **no — private** | **EXPOSED.** The predicate only checks that the proposal row *exists*; it never binds the caller to it. On a private bucket RLS is the only gate, so any `anon` caller who can guess or enumerate a proposal UUID reads that proposal's mood-board objects. |  |  |
| storage.objects | `Anyone can view thumbnails` | SELECT | `{public}` | `bucket_id = 'room-scan-thumbnails'` | yes | Not exposed beyond the bucket flag — public bucket is already served unauthenticated over the CDN. |  |  |
| storage.objects | `Avatar images are publicly readable` | SELECT | `{public}` | `bucket_id = 'avatars'` | yes | Not exposed beyond the bucket flag. |  |  |
| storage.objects | `Product images are publicly accessible` | SELECT | `{public}` | `bucket_id = 'product-images'` | yes | Not exposed beyond the bucket flag. |  |  |
| storage.objects | `Proposal assets are publicly readable` | SELECT | `{public}` | `bucket_id = 'proposal-assets'` | yes | Not exposed beyond the bucket flag. |  |  |
| storage.objects | `Public read access for hero frames` | SELECT | `{public}` | `bucket_id = 'room-hero-frames'` | yes | Not exposed beyond the bucket flag. |  |  |
| storage.objects | `Studio logos are publicly readable` | SELECT | `{public}` | `bucket_id = 'studio-logos'` | yes | Not exposed beyond the bucket flag. |  |  |
| storage.objects | `Org admins manage studio logos (insert)` | INSERT | `{public}` | `bucket_id = 'studio-logos' AND is_org_admin_or_owner((storage.foldername(name))[1]::uuid)` | yes (writes still gated by RLS) | Already narrow — `is_org_admin_or_owner()` cannot be satisfied without an authenticated org-admin session. |  |  |
| storage.objects | `Org admins manage studio logos (update)` | UPDATE | `{public}` | same as above | yes | Already narrow. |  |  |
| storage.objects | `Org admins manage studio logos (delete)` | DELETE | `{public}` | same as above | yes | Already narrow. |  |  |
| storage.objects | remaining 19 `{public}` policies (project documents, scan artifacts, comms attachments, hero frames, avatars, product images) | SELECT/INSERT/UPDATE/DELETE | `{public}` | each binds `auth.uid()` or a membership helper (`is_project_team_member`, `is_studio_comember`, …) | mixed | Already narrow — the `{public}` role list is cosmetic because the predicate binds the caller identity. Census section E2 lists each. |  |  |

**Accepted exception.** `proposal_mood_boards_proposal_read` is the one live gap: an
unauthenticated read of private mood-board objects gated only by proposal-UUID guessing.
It is recorded here rather than fixed, per Kody's ruling — narrowing the policy is a
separate question, and whether `postgres` can narrow a `supabase_storage_admin`-owned
policy at all is unresolved.

### The "four" in 00484 is not a count this database supports

`00484` says "The four PUBLIC policies on `storage.objects`". No set of four matches
under any reading: 61 policies total, **29** carry role `{public}`, **10** of those lack
an `auth.uid()` reference, **6** are unconditional reads on public buckets, **3** are
studio-logo writes gated by `is_org_admin_or_owner`, and **1** is genuinely
anon-reachable. The comment's number is unsubstantiated and should not be relied on as
an inventory. Census section E4 emits these totals.

---

## Divergence from the brief

One item measured differently than the task brief assumed, recorded rather than
silently reconciled:

- The brief lists `cron.schedule` alongside `net.http_get` / `net.http_post` as a
  PUBLIC-reachable out-of-band-effect routine. It is **not** PUBLIC-reachable. It holds
  PUBLIC EXECUTE, but `cron` withholds schema `USAGE` from PUBLIC, so the privilege is
  inert. It is filed under section D. `postgres` and its members can still call it,
  which is expected and unchanged.

- Migration `00484` describes "the four PUBLIC policies on `storage.objects`". That count
  is not reproducible against the live database under any reading (section E). The four
  policies were recorded as the measured sets instead, with the discrepancy stated rather
  than resolved to a number.

All other reference figures reproduced exactly on both staging and production.
