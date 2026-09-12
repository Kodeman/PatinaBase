# W1a close-out — fix log, round 1

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Local stack only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`); `.env.local` for
the designer portal points at `http://127.0.0.1:54321` (the worktree carries
none; the main checkout's line 19 reads `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`).
Nothing deployed, nothing pushed to prod.

Inputs: `w1a-close-review-r1-migrations.md` (1 BLOCKING, 4 MAJOR) and
`w1a-close-review-r1-tests.md` (F1, F2, F3). Fixed exactly those eight, nothing
else. 00594 is unapplied on prod, so it was edited in place; no number was
minted (00595–00620 are reserved; W1b mints from 00621).

---

## BLOCKING-1 — the STOP's record WRITE is now checked, like its read

**File:** `supabase/functions/sms-inbound/pipeline.ts`

`writeChannelConsent()` discarded the upsert result, so `failed` could only ever
be raised by the prior read. With R-AS the record is the only copy, so an errored
upsert answered Twilio 200, kept the `twilio_sid` idempotency claim, and left the
studio's record non-refusing for a number that had texted STOP.

```ts
-    await supabase.from("studio_channel_consent").upsert({
+    const { error: writeError } = await supabase
+      .from("studio_channel_consent").upsert({
       …
     }, { onConflict: "organization_id,channel_kind,channel_value" });
+    if (writeError) {
+      console.error(
+        "writeChannelConsent: the record could not be written — this studio is not recorded",
+        { org: t.org, phone, status, error: writeError },
+      );
+      failed = true;
+      continue;
+    }
```

The STOP branch's r7 R7-M3 guard already reads `stopWrite.failed`, so a failed
write now answers 500 / `opt_out_incomplete` and releases the claim.

**Test added** (`supabase/functions/_tests/sms-inbound.test.ts`): a `denyUpsert()`
harness — reads pass, the upsert returns `{ error: 40001 }` — plus
*"a STOP whose consent-record WRITE fails is not acknowledged, and the retry
completes it"*, asserting 500, `opt_out_incomplete`, no record written, the
frozen seats untouched, `twilio_sid` cleared, and both studios refused on the
retry.

```
$ deno test --no-check -A --node-modules-dir=auto --config supabase/functions/deno.json \
    supabase/functions/_tests/sms-inbound.test.ts --filter "WRITE fails"
writeChannelConsent: the record could not be written — this studio is not recorded {
  consentWriteFailed: true
a STOP whose consent-record WRITE fails is not acknowledged, and the retry completes it ... ok (10ms)
```

---

## MAJOR-1 — one SECURITY DEFINER resolver, not three inlined copies

**File:** `supabase/migrations/00594_studio_channel_consent.sql`

Minted `public.project_consent_org(uuid)` (section 3c-2): STABLE SQL, SECURITY
DEFINER, `SET search_path TO 'public'`, `REVOKE ALL … FROM PUBLIC, anon`,
`GRANT EXECUTE … TO authenticated, service_role`, `COMMENT ON FUNCTION` — the
shape `studio_contact_org(uuid)` takes at `00592:65-76`.

```sql
CREATE OR REPLACE FUNCTION public.project_consent_org(p_project_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(p.studio_id, public._primary_studio_for(p.designer_id))
    FROM public.projects p WHERE p.id = p_project_id;
$$;
```

All three inlined copies replaced with a call to it — `v_project_roster`'s party
branch and `people_directory`'s `status_raw` and `meta.sms_consent_status`. The
`LEFT JOIN public.projects prj` the inlined copy needed is gone with it, so
`v_project_roster` is again exactly one expression away from its lineage
(`00419:94-156`).

Correction recorded while grafting: the comments blamed **00483** for revoking
EXECUTE on `_primary_studio_for`. It is **00484** (`:1221` in the ACL loop,
`:1278-1289` in the top-level REVOKE). Live ACL confirms:
`_primary_studio_for | t | {postgres=X/postgres}`.

**Probe** (`build/probe29-close-r1-major1.sql`, objects and behaviour, one
transaction, ROLLBACKed). Fixture: Carol a `member` of Alpha (joined 2026) and
an `admin` of Beta (joined 2025), her project carrying no `studio_id`; Beta
holds the refusal for `+16125559001`, Alpha holds a grant for the same number.

```
=== the project carries no studio_id ===
 studio_id
-----------

=== the DEFINER answer (every writer: fold, RPC seat gate, send rail) ===
             definer_org              |             resolver_org
--------------------------------------+--------------------------------------
 b1000000-0000-4000-8000-00000000000b | b1000000-0000-4000-8000-00000000000b

=== BEFORE: the expression the views used to inline, as Alpha's owner ===
             inlined_org
--------------------------------------
 b1000000-0000-4000-8000-00000000000a      ← Alpha, not Beta

=== BEFORE: the consent word that expression produced ===
 word_before
-------------
 granted                                   ← Alpha's ledger, for Beta's seat

=== AFTER: the resolver, and the word the shipped view now prints ===
        resolver_org_as_alice
--------------------------------------
 b1000000-0000-4000-8000-00000000000b
 word_after
------------
 not_asked                                 ← Beta's ledger is closed to her
```

`channel_consent_status()` is unchanged (SECURITY INVOKER), so the degrade
posture stands: a caller who is not a member of the owning studio reads NULL and
the view COALESCEs to `not_asked`. What is gone is the confident wrong answer.

**Test added**: block 38 of
`supabase/tests/people/w1a_identity_channels_consent_test.sql` — 38a the resolver
answers the writers' studio; 38b it answers the same for an Alpha-only caller;
38c the Alpha reader gets `not_asked` through `v_project_roster`; 38d the Beta
reader gets `opted_out` for the same roster row; 38e neither view still inlines
the primary-studio lookup and both call the resolver; 38f the resolver is a
definer with a pinned `search_path`, closed to anon, open to authenticated.

---

## MAJOR-2 — a newly added party's invite now goes on the record too

**File:** `packages/supabase/src/hooks/use-coordination.ts` (`useAddProjectParty`)

The INSERT still writes the seat (the freeze is BEFORE UPDATE) and
`fc_optin_invite_dispatch` still sends the invite — but nothing wrote a consent
record, and both readers read the record only, so the room printed **"Not asked"**
for a person Patina had just texted and §3.8's `Invited` word was unreachable for
every new party.

The add path now calls `record_channel_consent(org, 'sms', phone, 'pending',
source, evidence, 'field-sms-v1', projectId)` — resolving the org through the new
`project_consent_org` RPC — **before** the insert, so 00594's gates run ahead of
the invite: a number this studio holds a refusal for, or one that will not
normalize to E.164, is refused before a seat exists and before anything is sent.
No fallback was added to either reader — that would reinstate the second source
of truth R-AS removed.

Four named RPC refusals get written sentences (`asWrittenConsentRpcError`):
`channel_opted_out`, `invalid_channel_value`, `not_a_studio_member`,
`consent_evidence_required`. A project that resolves to no org refuses with
*"This project isn't attached to a studio yet, so there's nowhere to record
texting consent."*

**Tests added** (`packages/supabase/src/hooks/__tests__/use-coordination-authority.test.ts`):
the record is written before the seat with the exact eight arguments; nothing is
recorded when "text updates" is unticked; a studio-less project refuses with no
insert; `channel_opted_out` becomes a sentence with no insert.

---

## MAJOR-3 / F2 / F3 — the frozen writers fail in English, and §8 says so

**Files:** `packages/supabase/src/hooks/use-coordination.ts`,
`artifacts/people-room-crm-2026-09-11/build/w1a-report.md`

W2's RPC repoint is W2's; it was not pulled forward. What was fixed is the second
option the review names: both shipped writers now catch
`consent_legacy_column_frozen` at the hook boundary and throw

> Texting consent has moved to the studio's own record, and this screen hasn't
> caught up yet. Nothing was changed.

instead of the raw Postgres string the party sheet renders verbatim
(`party-profile-sheet.tsx:490` → `inviteError`). Applied at
`useUpdateProjectParty`'s `.update(dbPatch)`, `useRecordPartySmsConsent`'s main
UPDATE, and its F2 revert. The refusal itself is unchanged — the act still fails
closed.

The review's broader reading is now in the report: it is **every** phone edit of
a seat currently `granted` or `pending`, not only the `revertsToOptedOut` branch;
and `site_request_send()` is `GRANT EXECUTE … TO authenticated` and is called
from Patina Field as well as the portal
(`apps/mobile/Capture/Capture/Features/SiteRequests/SiteRequestContract.swift:15`).
§8 of `w1a-report.md` now opens with **"W1a MUST NOT SHIP ALONE"** and names both
refusing acts.

**Tests added**: `useRecordPartySmsConsent` and `useUpdateProjectParty` each
surface the sentence when the write raises `consent_legacy_column_frozen`.

---

## MAJOR-4 — the owed-work list names every rail still on the seat

**File:** `artifacts/people-room-crm-2026-09-11/build/w1a-report.md` (new §5.1b,
rewritten §8)

Four rails added to the owed list, with the line refs re-verified in this
worktree:

| Rail | Where | Reads off the frozen seat |
|---|---|---|
| the opt-in invite's evidence proof | `_shared/sms.ts:830-845` | `sms_consent_source / _evidence / _recorded_at / _disclosure_version` |
| the inbound YES gate | `sms-inbound/pipeline.ts:766` | `parties.some(p => p.sms_consent_status === 'pending')` |
| `resolveRecipient` | `_shared/sms.ts:552-568` | `recipient.consent` |
| `flushDeferredMessages` | `_shared/sms.ts:1070-1085` | the deferred row's party consent |

…plus the iOS site-request act. §5.1b states plainly that replacing the portal's
two UPDATE writers is **not sufficient** to restore the double opt-in, because
the invite dispatch fires on a party row and the YES gate reads a party row, and
scopes W2 accordingly.

---

## F1 — no code change; the ruling is still owed

**File:** `supabase/functions/sms-inbound/pipeline.ts:245` (`if (!org) continue;`)

Out of this round's scope by the review's own instruction ("No code fix in this
review's scope — the report already asks for a ruling"). The three options stand:
leave it, refuse every unattributable send outright, or make an unresolvable org
a loud alerted 500 on the STOP branch. The last restores fail-closed behaviour
without reopening the tenant-crossing bug R-AK fixed. §8 now records F1's own
added fact: this is a **regression** against pre-00594 behaviour, where the
phone-global party write covered exactly this case.

---

## Verification, after the fixes

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2638 replayed statements
# diff: the two project_consent_org statements only

$ pnpm --dir .../agent-people-build supabase:reset        # twice
exit=0 ; 548 "Applying migration" lines ; Finished supabase db reset on branch main.
# (GoTrue restarted after each reset before the SQL test — auth.users.email_confirmed_at)

$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  38. one resolver for the seat's studio: reader and writer agree, and no view
         prints another studio's consent word (close-review r1 MAJOR-1): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
exit=0        # 38 blocks, was 37

$ deno test --no-check -A --node-modules-dir=auto --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 83 passed | 0 failed (119ms)        # was 82

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
$ git diff --stat packages/supabase/src/database.types.ts
 packages/supabase/src/database.types.ts | 1 +
# the one line is project_consent_org; no other drift

$ pnpm --dir .../agent-people-build --filter @patina/supabase test
 Test Files  100 passed (100)
      Tests  1250 passed | 12 skipped (1262)      # was 1244, +6 new

$ pnpm --dir .../agent-people-build --filter @patina/supabase type-check     # clean, exit 0
$ pnpm --dir .../agent-people-build --filter designer-portal type-check      # clean, exit 0
```
