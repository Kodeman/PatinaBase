# RC-6 R1 (Codex Astra) lenses 1+4 — NOT-READY (fix-then-ship)
1 HIGH/high 00894:86-90 (+117-118) relink lets ONE person answer TWO required household slots (dup check by signer_id not person); relink-both can strand a slot pending. Revalidate canonical-person uniqueness; refuse collisions; audited replacement; tests both orders.
2 MED/high  _shared/outbound-kinds/service_acceptance_request.ts:47-53 stale recipient after relink still sends to old account (same as R2-5). Reject stale binding before send; regenerate draft.
3 MED/high  00886:453-457 _is_service_acceptance_studio_admin ignores organization status -> suspended studio admins keep paper confirm/replace signer/complete/revoke. Require active studio (keep roster-mgmt exception); tests.
4 HIGH/high 00892:50 inherited is_studio_comember cross-studio (KNOWN tenancy program; not introduced by 00892).
5 MED/high  ROLLOUT.md:21-31 populated rollout evidence incomplete (RC-5 in progress).
6 INFO      00894:155-164 consent ruling (KNOWN, Kody).
OK: no PUBLIC/anon exec exposure; legacy-grants seed regenerated; agent roles untouched; no activation.
