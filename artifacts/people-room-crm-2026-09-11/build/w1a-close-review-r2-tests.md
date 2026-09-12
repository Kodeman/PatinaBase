# W1a close-out — adversarial review, round 2 (tests, types, behaviour)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `1fa758c3c`. Local stack only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), sole owner for
this session. Nothing deployed, nothing pushed to Strata. Input:
`w1a-report.md` (R-AS rewrite) and `w1a-close-fix-log-r1.md` (BLOCKING-1,
MAJOR-1..4, F1).

**Verdict: clean.** Zero BLOCKING, zero MAJOR. All eight round-1 findings
re-verified fixed. Two new MINOR observations below.

---

## 1. Prior findings re-checked

| Finding | r1 status | r2 re-check | Evidence |
|---|---|---|---|
| BLOCKING-1 (STOP record WRITE unchecked) | fixed | **still fixed** | `supabase/functions/sms-inbound/pipeline.ts` `writeChannelConsent()` checks the upsert's `error` and sets `failed = true`; deno test "a STOP whose consent-record WRITE fails is not acknowledged, and the retry completes it" passes (§3 below) |
| MAJOR-1 (three inlined `_primary_studio_for` copies, one wrong under cross-membership) | fixed | **still fixed** | `public.project_consent_org(uuid)` present, SECURITY DEFINER, `SET search_path`, EXECUTE granted only to `authenticated`/`service_role` (§2); SQL test block 38 (38a–38f) passes; fresh probe (§4, Construct-style Probe A) reproduces the cross-org fixture directly and confirms isolation |
| MAJOR-2 (new party's invite unreadable — no record on add) | fixed | **still fixed** | `packages/supabase/src/hooks/use-coordination.ts:452-471` calls `project_consent_org` then `record_channel_consent(…, 'pending', …)` before the `project_parties` INSERT |
| MAJOR-3 / F2 / F3 (raw Postgres string on the frozen writers) | fixed | **still fixed** | `asWrittenConsentError` / `asWrittenConsentRpcError` wrap `consent_legacy_column_frozen` at all three write sites: `useUpdateProjectParty`'s `.update(dbPatch)` (line 729), `useRecordPartySmsConsent`'s main UPDATE (line 865) and its F2 revert (line 877) |
| MAJOR-4 (owed-work list missing four rails) | fixed | **still fixed** | `w1a-report.md` §5.1b lists the opt-in invite's evidence proof, the inbound YES gate, `resolveRecipient`, `flushDeferredMessages`, plus the iOS site-request act, and states plainly that repointing only the two portal writers is not sufficient |
| F1 (unattributable-send fail-open, `if (!org) continue`) | correctly left open, ruling owed | **still open, correctly tracked** | `supabase/functions/sms-inbound/pipeline.ts:245` unchanged; `w1a-report.md` §5.2 still names it a regression against pre-00594 behaviour and asks for Fable's ruling. Not a round-2 finding — it is scoped out of this round's remit exactly as r1 left it |

No prior finding regressed.

---

## 2. SQL test suite

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
```

All 38 blocks (including 16B, 30e, 30f) passed, ending:

```
NOTICE:  37. the record is the single source: no mirror, the legacy columns frozen,
         both readers on channel_consent_status(), and org isolation through RLS (R-AS): passed
NOTICE:  38. one resolver for the seat's studio: reader and writer agree, and no view
         prints another studio's consent word (close-review r1 MAJOR-1): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

Exit 0. One transaction, ROLLBACKed — no state left in the DB. This is the only
`.sql` file under `supabase/tests/people/`.

---

## 3. Deno tests

Per the brief, ran the full `_shared` + `sms-inbound` + `_tests` directories,
not only the two consent files.

```
$ deno test --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared supabase/functions/sms-inbound supabase/functions/_tests
```

Type-checked run fails on a **pre-existing, unrelated** error:

```
TS2345 [ERROR]: Argument of type 'Uint8Array<ArrayBufferLike>' is not assignable
  to parameter of type 'string | ArrayBuffer'.
  at supabase/functions/fulfillment-po/core.ts:314:80
```

Confirmed pre-existing and unrelated: `git log -1` on that file shows commit
`7c95cb096`, dated 2026-07-17 — five weeks before this branch existed, and the
same line reads identically on `main`. Not a w1a defect.

Re-ran with `--no-check` (matches the fix log's own r1 verification method):

```
$ deno test --no-check -A --config supabase/functions/deno.json \
    supabase/functions/_shared supabase/functions/sms-inbound supabase/functions/_tests
...
FAILED | 706 passed | 1 failed (3s)
./supabase/functions/_tests/stripe-rail.test.ts (uncaught error)
error: (in promise) Error: supabaseKey is required.
```

`stripe-rail.test.ts` is a live-rail harness (its own header: "Exercises the
LOCAL, running stripe-webhook + create-checkout-session edge functions...
Prereq: `supabase functions serve --env-file ... --no-verify-jwt`") that reads
`SUPABASE_SERVICE_ROLE_KEY!` from the environment with a non-null assertion —
it throws on load with no such server running / no such env var set in this
shell. Unrelated to consent, unrelated to this wave, and environmental rather
than a code defect.

The two consent files, isolated:

```
$ deno test --no-check -A --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 83 passed | 0 failed (107ms)
```

Matches the fix log's own count (83, +1 for BLOCKING-1's cover). Every other
file in the three directories passed: 706 of 707 collected tests green, the
one failure isolated to an environmentally-gated file untouched by this
branch.

---

## 4. Role probes — designer, client, anon

Ran directly against local Postgres with `SET ROLE` + `request.jwt.claims`,
using seeded accounts (`supabase/seed/dev-accounts.sql`): `designer@patina.dev`
= `a0000000-0000-0000-0000-000000000004` (owner of orgs `88d8577d…` "Leah
Hartwell" and `b0000000…0001` "Local Dev Studio"), `client@patina.dev` =
`a0000000-0000-0000-0000-000000000005` (no `organization_members` row — a
homeowner, never a studio member).

**Designer, own org vs. a foreign org they don't belong to** (`cf120000…0001`
"Phase One Synthetic Studio", confirmed zero membership rows first):

```
own_org_verdict            | granted
foreign_org_verdict        | (NULL, COALESCEs to not_asked in the views)
direct SELECT on the table | only the own-org row is visible (RLS)
```

**Client (no studio membership at all):**

```
client_visible_rows on studio_channel_consent (direct SELECT) = 0
channel_consent_status() for a studio they're not a member of = NULL
record_channel_consent() attempt → P0001 not_a_studio_member
```

**Anon:**

```
direct SELECT on studio_channel_consent  → 42501 permission denied for table
channel_consent_status()                 → 42501 permission denied for function
record_channel_consent()                 → 42501 permission denied for function
project_consent_org()                    → 42501 permission denied for function
```

All four match the report's claimed grants (`REVOKE ALL … FROM PUBLIC, anon`
on every new function; `authenticated` holds table SELECT only, gated by
`studio_channel_consent_member_select` (`is_active_studio_member`); write
access is exclusively through the three SECURITY DEFINER RPCs). No cross-tenant
read, no cross-tenant write, no anon leak.

---

## 5. The four constructs

### 5a. Phone opted_out in org A, granted in org B — B may send, A may not

Seeded both rows directly, read back through `channel_consent_status()` as
`service_role` (the identity the send rail actually runs as):

```
org A (opted_out) verdict → opted_out
org B (granted)   verdict → granted
```

Per-tenant, not phone-global. Confirmed.

### 5b. A phone with an opted_out PARTY row and no studio_channel_consent record — refused

At the pure-DB reader (`channel_consent_status`), a pair with no record reads
NULL — it never looks at the seat, by design (R-AS). The refusal is caught
**only** by the TS-level `orgHasOptedOutParty()` fallback inside
`channelConsentVerdict()` (`_shared/sms.ts`), which is exactly what deno's
"with no studio record, an opted-out sibling party row in the SAME studio still
blocks (fail closed)" (`sms.test.ts`) already exercises and which passed in
§3's run.

I confirmed this specific shape — a **freshly inserted** opted_out seat with no
record — is not reachable through any live write path in this branch:
`useAddProjectParty`'s INSERT only ever writes `pending` or `not_asked`
(`use-coordination.ts:484`); the one path that used to write `opted_out`
directly onto a seat (`revertsToOptedOut`) is now itself refused by the freeze
trigger. Grepped every `.insert(` site touching `project_parties`
(`use-vendors.ts`, `use-studio-contacts.ts`, `use-coordination.ts`) — none
writes `sms_consent_status: 'opted_out'`. So a fresh orphaned-refusal seat can
only arise from data older than the fold, and only in the one case the report
already names in §5.2/F1: a project whose org cannot be resolved at all (no
`studio_id`, no active `design_studio` membership on the designer) — the fold
explicitly skips those (`WHERE org IS NOT NULL`), and it is already tracked as
an open item pending Fable's ruling. Not a new finding — see the MINOR note in
§6 for one thing worth adding to that existing item.

### 5c. STOP, then a new recorded grant with evidence — allowed

Two-step construct: (1) seeded an `opted_out` record with
`refusal_unanswered = true` (mirrors the inbound rail's own STOP write); (2)
confirmed the **studio-side RPC door refuses** to move it to `granted` while
unanswered:

```
STUDIO RPC refused as expected: P0001 - channel_opted_out
```

(3) applied the inbound rail's own direct upsert — the shape
`writeChannelConsent()` performs as `service_role`, bypassing the RPC gate
entirely, exactly as designed for the recipient's own START/YES:

```
status | refusal_unanswered | source      | evidence      | opt_out_source | opt_out_evidence | opt_out_recorded_at
granted| f                  | inbound_sms | Replied START | inbound_sms    | Replied STOP     | <timestamp>
```

`channel_consent_status()` then reads `granted` for that org. The refusal's own
evidence survives beside the grant's — matches R-AN / the model in §1 of the
report. The only door through which a STOP is answered by a fresh grant is the
recipient's own reply via the rail; the ordinary studio RPC stays closed while
`refusal_unanswered` is true. Confirmed correct.

### 5d. A legacy write to project_parties.sms_consent_status by an authenticated member — refused

```sql
SET LOCAL ROLE authenticated;  -- designer@patina.dev
UPDATE public.project_parties SET sms_consent_status = 'granted' WHERE phone_e164 = '+16125559111';
```

```
LEGACY WRITE refused as expected: P0001 - consent_legacy_column_frozen
```

Confirmed: `refuse_legacy_consent_write_trg` fires for an ordinary authenticated
studio member's whole-row-shaped UPDATE, not only for a superuser/service-role
probe.

---

## 6. Every reader of people_directory / v_project_roster consent columns

Grepped `apps` + `packages` for both view names, then traced every consumer
that touches the consent-shaped columns (`sms_consent_status`, `status_raw`,
`meta.sms_consent_status`) back to its data source:

| Consumer | Sources from | Consent-correct? |
|---|---|---|
| `roster-row.tsx:95` (`row.sms_consent_status`) | `v_project_roster` via `useProjectRoster` (`use-coordination.ts:964`, the only `.from('v_project_roster')` call site in the repo) | yes — the view's `sms_consent_status` output column is the `channel_consent_status()` expression, alias preserved, so the shipped column NAME is unchanged but its VALUE is now record-based |
| `roster-derivation.ts:390` (`row.sms_consent_status === 'granted'`) | same `v_project_roster` rows, type-only derivation module | yes |
| `person-bits.tsx` `ConsentChip` | pure presentational, takes `status` as a prop from callers above (roster-row.tsx) | yes, no independent data source |
| `party-profile-sheet.tsx:260` (`meta.sms_consent_status`) | `usePerson()` → `people_directory` (`use-people.ts:161`), **not** the sheet's separate `useProjectParties()` call (that raw `project_parties` fetch is used only for the promote-band's `studio_contact_id` check, never for the displayed consent word) | yes |
| `directory-view.tsx`, `desk-derivation.ts`, `desk-reconnect.tsx`, `brief-section.tsx`, `household-sheet.tsx`, `maker-profile.tsx`, `makers-marketplace.tsx` | `people_directory` via `use-people.ts` / `use-clients.ts` / `use-vendors.ts`, reading `status_raw` (project/lead lifecycle status) or other non-consent columns — none of these read the SMS consent word at all | n/a, no consent read |
| `people-derivation.ts` | type-only, operates on `people_directory` shape already fetched | yes |
| `audience-rules.ts` | no `sms_consent`/`consent` reference at all | n/a |
| `useProjectParties` raw consumers (`margin-rail.tsx`, `schedule-spine.tsx`, `compose-decision-sheet.tsx`, `coordination-band.tsx`, `party-field.tsx`, `bid-ledger.tsx`, `threshold.tsx`) | raw `project_parties.*` (frozen legacy columns, stale after fold) | **none of these display the consent word** — grepped each file for `consent`; zero matches outside `threshold.tsx`'s unrelated `consent-copy` import name |

No reader shows a wrong or stale consent verdict. The one raw
`useProjectParties` hook that surfaces the now-frozen legacy columns is never
used to display consent to a person — its only consumers use it for
`studio_contact_id`, party CRUD, and non-consent fields.

---

## 7. Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir .../agent-people-build db:generate
$ git -C .../agent-people-build diff --stat packages/supabase/src/database.types.ts
```

**Empty.** No output at all — the checked-in file already reflects exactly
what a fresh `supabase gen types` produces against the reset local DB. (Note:
`db:generate` needs `dangerouslyDisableSandbox` — the default sandbox denies
the Docker socket the Supabase CLI needs to inspect the running container;
this is a sandbox artifact of my environment, not a project issue.)

---

## 8. Type-checks

```
$ pnpm --dir .../agent-people-build --filter @patina/supabase type-check
> tsc --noEmit
(exit 0, no output)

$ pnpm --dir .../agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
(exit 0, no output)
```

Both clean. No type breaks from the regenerated types (there is nothing to
break — the regen produced an identical file).

---

## 9. New findings, round 2

**Zero BLOCKING, zero MAJOR.** Two MINOR:

**MINOR-1 — dead revert branch in `useRecordPartySmsConsent`.**
`packages/supabase/src/hooks/use-coordination.ts:872-880`. The
`if (!data.phone_e164)` revert-to-`not_asked` branch (F2's original fix) can no
longer execute: the UPDATE immediately above it (lines 838-849) always changes
`sms_consent_status` away from `'not_asked'`, so `refuse_legacy_consent_write_trg`
now fires and raises `consent_legacy_column_frozen` on every call, caught at
line 865 and re-thrown before `data` is ever assigned. Not a correctness risk —
the function throws a safe, worded error either way — but the branch is now
unreachable code that a future reader could mistake for live behaviour. Worth
a one-line comment (or removal) when W2 replaces this hook.
*Fix:* note in the function's doc comment that the F2 revert branch is
freeze-shadowed and dead until W2's repoint, or delete it now since the freeze
trigger already returns the same outcome.

**MINOR-2 — §5.2's owed item could name the reader-side symptom too, not only the send-side one.**
`artifacts/people-room-crm-2026-09-11/build/w1a-report.md` §5.2. The existing
text names only the send-rail consequence of an unresolvable-org legacy seat
("a STOP does not stop it"). Construct 5b above confirms the same root cause
also makes `v_project_roster` / `people_directory` print `not_asked` for such a
seat rather than its true legacy state, since `channel_consent_status()` never
looks at `project_parties` and no record exists for an org that could not be
resolved. This doesn't change the ruling F1 already asks for — it's the same
gap, same owed ruling — but naming both consequences (send AND display) would
give Fable the full picture in one place.
*Fix:* add one sentence to §5.2 naming the reader-side symptom alongside the
send-side one.

---

## 10. Summary

38/38 SQL assertions pass. 83/83 targeted deno tests pass; 706/707 in the full
`_shared` + `sms-inbound` + `_tests` sweep pass, the one failure isolated to an
environment-gated, pre-existing, unrelated file. Both required type-checks
clean. Generated types diff empty. Designer/client/anon role probes all behave
exactly as the model promises: per-org isolation through RLS, member-only RPC
writes, anon fully locked out. All four requested constructs (cross-org
opted-out-vs-granted, orphaned seat refusal, STOP-then-START evidenced grant,
frozen legacy write) behave correctly. Every reader of
`people_directory`/`v_project_roster` consent columns traces to the
record-based `channel_consent_status()` path; no reader shows a stale or
cross-tenant verdict. All eight round-1 findings remain fixed; F1 remains
correctly open, awaiting Fable's ruling, unchanged from round 1.

**clean = true** (zero BLOCKING, zero MAJOR).
