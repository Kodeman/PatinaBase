# W4 (P3) — round-3 fix log

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local only: no `db push`, no `functions deploy`, no secrets set. **No migration minted** —
`00629` is unapplied on prod and is amended in place, the door R-BS opened for W3 and the
same door `00637`'s own repoint list left ajar. `rulings.md` §3 treated as settled
throughout.

Eleven findings from `w4-review-r3-{data-edge,qa,code}.md`, in the order the brief lists
them. The two ids that collide across reports (`MAJOR-1` in QA = the mint band's date;
`MAJOR-1` in code = the inbound queue's `other_named`) are answered separately and
cross-referenced.

---

## W4R3-1 — R3-MAJOR-1 — the channel gate was skipped on every letter carrying a `userId`

`supabase/functions/_shared/send-email.ts`

**The defect.** `prepareCompliantEmail` read

```ts
const channel = options.userId ? undefined : await resolveContactChannel(…)
```

so CRM-12's dead/unsubscribed verdict — the whole of D-4 and D-6 — was consulted only on
the five account-less senders. The reachable sequence is exactly the one D-6 exists for:
studio B's account-less letter hard-bounces → `writeChannelStatus` marks **every** row on
the address `dead` (address-wide, by design) while `handleBounce` leaves
`profiles.email_suppressed` alone, because that log row's `user_id` is NULL → the next
letter to the same mailbox on a `userId`-bearing rail (invoice-send, client-invite,
notification-dispatch) reads `email_suppressed = false` and sends to a dead mailbox. Same
shape for `unsubscribed`: the Directory row said stopped while D-4's own sentence ("one
click stops the studio emailing that address at all, invoices included") was false on that
branch.

**The fix.** The GATE now asks the address, account or no account:

```ts
const channel = (await resolveContactChannel(supabase, options.to, options.organizationId)) ?? undefined;
const recordChannel = options.userId ? undefined : channel;      // ← the RECORD is unchanged
if (channel && channelRefusesSend(channel.status)) return { state: "suppressed", … };
```

The verdict widens; **the record does not**. `recordChannel` is what reaches the
`List-Unsubscribe` header branch, the `CompliancePreparationResult.channel` field, and
therefore `sendCompliantEmail`'s deliverability `ref` and its `record_touch` call — so an
account holder's letter still files no studio touch and no channel ref about a person the
rolodex may not carry at all (B-2, E13). Widening a gate is not a licence to widen a
record.

**Proof** — `deno test --allow-all --config supabase/functions/deno.json
supabase/functions/_tests/email-channel-status.test.ts` → **19 passed, 0 failed** (was 17).
Three cases changed or added:

```
a dead address does NOT send to an account holder whose profile is unsuppressed ... ok
  → for status in ["dead","unsubscribed"]: userId set, the fake's profiles read answers
    { email_suppressed: false } (the exact state handleBounce leaves), prepared.state
    === "suppressed", reason === `channel_<status>`
the widened gate still asks the address ONCE per letter, and still address-wide ... ok
  → recorded.lookups.length === 1, and no lookup is narrowed by organization_id
an account holder's letter files no channel RECORD — no ref, no channel unsubscribe door ... ok
  → prepared.channel === undefined, no List-Unsubscribe header (renamed from
    "…is untouched by the channel path", which is no longer what it asserts)
```

`supabase/functions/_shared/send-email.test.ts` → **21 passed, 0 failed**, unchanged.

---

## W4R3-2 — R3-MAJOR-2 — the unsubscribe landing had no test anywhere

`packages/notifications/src/__tests__/unsubscribe.test.ts` (new, 14 cases)

**The gap, as measured before the fix.** `packages/notifications/src/__tests__/` held six
files and none mentioned `applyUnsubscribeToken`, `applyChannelUnsubscribe` or
`parseUnsubscribeSubject`; `grep -rln applyUnsubscribeToken` over every `*.test.ts(x)` in
`packages` and `apps` returned nothing. So the cross-card address write, the `dead`-row
skip, the unknown-channel answer and the entire "a channel token cannot be read as an
account token" rule were assertable only by reading.

**The fix.** A vitest suite driving the real functions against a fake whose every filter is
recorded BY COLUMN, so a write that quietly widened or narrowed its predicate fails by
name. The cases the brief asked for, and the ones the reading suggested:

```
parseUnsubscribeSubject                    5 table cases — a plain profile id, `channel:<id>`,
                                           a uuid that HAPPENS to be a channel id (stays `user`),
                                           an empty subject, and the lookalike "channelish"
channel branch  · marks EVERY email-kind row on the address, across cards and studios
                   (email + ap_email move; a different address and an `sms` row on the same
                   value do not)
                · leaves a `dead` row alone  → the update's status filter is ['active','bounced']
                · touches notification_preferences for nobody (tables === two channel reads)
                · an unknown channel id answers 'invalid', never 'error'
                · a read that FAILS answers 'error' with the message, so a broken table is
                  not reported to a recipient as a bad link
account branch  · a plain-uuid token writes notification_preferences and touches no channel,
                  WITH that same uuid seeded as a live channel id
                · all_marketing → channels_email; a type with no column falls back to it
                · seeds a preferences row where the account has none, then applies the opt-out
                · an unsigned token applies nothing at all (tables === [])
```

**Proof** — `npx vitest run` in `packages/notifications` → **7 files / 103 tests passed**
(was 6 / 89). `pnpm --dir packages/notifications type-check` clean.

---

## W4R3-3 — R3-MAJOR-3 — a firm merge stranded the paperwork door

`supabase/migrations/00629_studio_contact_merges.sql` (amended in place),
`supabase/tests/people/w4_channels_touches_paperwork_test.sql` (blocks 10 and 10b)

**The defect.** 00629 repoints channels, affiliations, rules, compliance documents
(`holder_id` → survivor), seats, households and the analogous
`studio_trade_agreement_tokens` (`:2706`). `paperwork_link_tokens` is 00637's table, minted
two files later, and nothing was added for it — three harms at once, all measured.

**The fix.** A sixth card-pointer block, beside the trade agreement's, naming a later
file's table for the reason the `bid_quoted_by_person_id` repoint already states (plpgsql
resolves relations at first EXECUTION, and nothing calls this RPC between 00629 and 00637):

```sql
IF v_survivor.entity_kind = 'company' THEN
  -- revoke first: uniq_paperwork_link_tokens_active_company is partial on status='active',
  -- so moving the absorbed live token onto a survivor that already has one would abort
  -- the whole fold. R-AF keeps the survivor's door; the absorbed one is CLOSED with a
  -- reason the Access grants list can print, never deleted (spec §7 keeps every row).
  UPDATE paperwork_link_tokens SET status='revoked', revoked_at=now(), revoked_by=auth.uid(),
         revoke_reason='The firm was merged into another card.', updated_at=now()
   WHERE company_id = p_merged AND status='active'
     AND EXISTS (SELECT 1 FROM paperwork_link_tokens s
                  WHERE s.company_id = p_survivor AND s.status='active');
  UPDATE paperwork_link_tokens
     SET company_id = p_survivor, organization_id = v_survivor.organization_id, updated_at=now()
   WHERE company_id = p_merged;                -- assert_paperwork_token_company fires here
ELSE
  -- the sole-proprietor fold: the survivor is a PERSON card, and a paperwork link is a
  -- firm's door and never a person's (paperwork_token_company_required). Repointing would
  -- abort the fold on a schema token naming nothing the studio did, so the door is closed.
  UPDATE paperwork_link_tokens SET status='revoked', … WHERE company_id = p_merged AND status='active';
END IF;
```

The file's lineage banner and the RPC's `COMMENT` both name the new repoint. No grant
changed, so `seed/00-legacy-grants.sql` is untouched; the function's signature is unchanged,
so no `db:generate`.

**Proof, the reviewer's own probe re-run at HEAD after
`pnpm supabase:reset`** (`build/probe608-w4-r3-merge-vs-paperwork-door.sql`), against the
r3 report's measured "before" column:

| what the probe asks | r3 (before) | now |
|---|---|---|
| the token's `company_id` after the merge | `c9` (absorbed) | **`c1` (survivor)**, `status active`, `live t` |
| what the firm reads on its live link | `"documents": []` | **the COI, `current`, `blocks site_access`** |
| where a new upload through that link lands | `holder_id = c9` | **`holder_id = c1`** |
| `pending_on_survivor` / `pending_on_absorbed` | `0 / 1` | **`1 / 0`** |
| live doors for one firm identity after re-minting | `2` | **`1`** |

And the suite, `psql -v ON_ERROR_STOP=1 -f
supabase/tests/people/w4_channels_touches_paperwork_test.sql`:

```
10.  W4 r3 MAJOR-3 — a firm merge carries the paperwork door: the token names the
     survivor, the firm's page still lists its paper, its next upload lands on the
     survivor's queue, and one door stays live: passed
10b. R-AF across a fold — the survivor keeps exactly one live door with the absorbed one
     closed by reason, and a sole-proprietor fold closes the firm's door rather than
     aborting: passed
W4 SQL suite: all blocks passed
```

(Block 10's fixture ids moved to a fresh `fa2b…`/`fa1b…` space: `fa2…000c`/`000d` were
already taken by blocks 7 and 9.)

`resolve_paperwork_link` and `record_inbound_compliance_document` are service-only
(00637:651, :776), so every call in the new blocks is made with the role reset, the shape
block 5 already uses.

Neighbouring suites re-run against the amended 00629, all green:
`w1a_identity_channels_consent_test` → "All W1a assertions passed.",
`w1b_compliance_authority_directory_test` → "All W1b assertions passed.",
`w3_merge_sweep_household_test` → "W3 SQL suite: all blocks passed".

---

## W4R3-4 — R3-MAJOR-4 — the room printed the UTC calendar day

`packages/supabase/src/hooks/use-touches.ts`, `use-inbound-documents.ts`

**The defect.** `touchDay` regexed `^(\d{4})-(\d{2})-(\d{2})` out of whatever string it was
handed. `studio_touches.occurred_at` and `studio_compliance_documents.created_at` are
**timestamptz** and PostgREST answers them in UTC, so a text sent 9:30pm CDT on 11 Sep
printed "12 Sep". The studio is `FIELD_TZ America/Chicago` (`_shared/sms.ts:796`,
`site-request-dispatch/index.ts:87` — the same clock that decides quiet hours), so
everything after 7pm CDT was off by one: most of the field rail's evening traffic, on both
live readers (`touch-line.tsx:49` / `roster-row.tsx:393` via `touchSentence`, and
`use-inbound-documents.ts:98`).

**The fix.** Two functions that cannot be confused, which is the shape the finding asked
for:

* `touchDay(value)` — unchanged fast path, now documented as **`YYYY-MM-DD` only**. A
  `date` column carries no zone (the seat line, the roster row, the compliance table all
  read one), so there is nothing to convert.
* `touchInstantDay(value)` — new, for timestamptz. Formats through
  `Intl.DateTimeFormat('en-US', { timeZone: STUDIO_TIME_ZONE, … }).formatToParts` and maps
  the month back through the room's own `MONTHS_SHORT`, so "Sep" stays "Sep" rather than
  the runtime ICU's "Sept". A bare `YYYY-MM-DD` is handed straight to `touchDay` —
  `new Date('2026-09-12')` is UTC midnight, which in Chicago is the 11th, so converting a
  zoneless day would invent the very error this removes. A runtime with no zone data falls
  back rather than throwing.

`touchDate` (the one `touchSentence` uses) and `inboundDocumentLine` now call
`touchInstantDay`. `STUDIO_TIME_ZONE`, `touchDay` and `touchInstantDay` are exported from
`packages/supabase/src/hooks/index.ts`.

**Proof** — `npx vitest run src/hooks/__tests__/people-crm-w4.test.ts` in
`packages/supabase` → **54 tests passed** (was 47). New cases:

```
dates an evening text on the day the studio sent it, not the next one
  → touchInstantDay("2026-09-12T02:30:00Z") === "11 Sep 2026"
  → touchSentence({…occurred_at: "2026-09-12T02:30:00Z"}) ===
    "Last touch 11 Sep 2026, by text. A money decision. Received, not authority."
leaves a morning instant where it is, and a zoneless `date` column alone
  → "2026-09-12T15:00:00Z" → 12 Sep; "2026-09-12" → 12 Sep; null/garbage → ""
reckons a winter instant on CST, not on a frozen offset
  → "2027-01-04T00:30:00Z" === "3 Jan 2027"
dates an evening upload on the studio's day
  → inboundDocumentLine({created_at:"2026-09-12T02:30:00Z"}) contains "uploaded 11 Sep 2026"
```

---

## W4R3-5 — R3-MAJOR-5 — `flushDeferredMessages` sent real texts and wrote no touch

`supabase/functions/_shared/sms.ts`

**The defect.** `sendPartySms` writes an out touch at `:991`; the flush (`:1046`) put real
texts on the Twilio wire and wrote none, with `row.party_id` already in hand — the exact
subject `record_touch` needs. `field-daily/core.ts:193` calls it on every run, so a digest
deferred past 8pm by quiet hours (the normal shape of the field rail) went out next morning
and never appeared in `studio_touches`. The card's derived "Last touch" then showed the
PREVIOUS contact: the room telling the studio it has not reached someone it reached that
morning, against E13's own table comment ("one row per contact a rail actually made, in
either direction").

**The fix.** The same six-line call where the flush marks the row sent, with the finding's
own `p_actor_ref`:

```ts
if (row.party_id) {
  const { error: touchError } = await supabase.rpc("record_touch", {
    p_subject_type: "engagement", p_subject_id: row.party_id,
    p_channel_kind: "sms", p_direction: "out",
    p_occurred_at: now.toISOString(),
    p_actor_ref: "sms-dispatch-flush", p_message_ref: row.id,
  });
  if (touchError) console.error("flushDeferredMessages: record_touch failed", touchError.message);
}
```

Best effort, never a gate on the send — `sendPartySms`'s own posture, and the reason the
second case below exists.

**Proof** — `deno test … supabase/functions/_shared/sms.test.ts` → **46 passed, 0 failed**
(was 44). The fake records rpc calls through `createFakeSupabase`'s `rpcHandlers`:

```
flush: every flushed row writes one out touch, and a skipped or suppressed one writes none ... ok
  → four deferred rows in one run: m1 (seat, granted) flushes; m2 (seat, opted_out) is
    suppressed; m3 (a phone-only invite, no seat) flushes; m4 (>24h) expires.
    result = { flushed: 2, suppressed: 1, expired: 1 }
    touches.length === 1, and it is m1's: p_subject_type "engagement", p_subject_id "p1",
    p_channel_kind "sms", p_direction "out", p_actor_ref "sms-dispatch-flush",
    p_message_ref "m1", p_occurred_at now
flush: a touch the database refuses never fails the send ... ok
  → record_touch answers { error: "denied" }; flushed stays 1, the row still reads dry_run
```

`_tests/field-daily.test.ts`, `sms-inbound.test.ts` and `sms-status.test.ts` re-run green
beside it (194 passed across the eight suites run together).

**Not fixed, and why.** `proposal-send` is the email twin the finding names as lower
impact; it is outside this brief's list and untouched.

**`_shared` fan-out (all redeploy in W7).** `_shared/send-email.ts` and `_shared/sms.ts`
were both edited. `grep -rl "_shared/sms.ts\|_shared/send-email.ts" supabase/functions`
(excluding `_shared/` and `_tests/`) names 29 files in 27 functions:
apns-send, client-invite, commercial-document-notify, designer-invite, digest-dispatcher,
field-daily (`core.ts`), fulfillment-notify, fulfillment-po (`core.ts` + `index.ts`),
invoice-reminders, invoice-send, morning-brief, notification-digest, notification-dispatch,
po-send, proposal-nudge, proposal-send, proposal-sign-confirmation, quote-request-send,
review-requests, selection-review-send, site-request-dispatch, sms-dispatch, sms-inbound
(`pipeline.ts`), stripe-webhook, trade-agreement-send, trade-rfq-send, waitlist-notify,
workspace-member-invite.

---

## W4R3-6 — R3-MAJOR-6 — the account-less unsubscribe landed on an admin sign-in wall

`apps/admin-portal/src/middleware.ts`

**The defect.** `DEFAULT_BASE_URL` in `_shared/send-email.ts:227` is
`https://admin.patina.cloud` and none of the five account-less senders passes
`unsubscribeBaseUrl`, so the `List-Unsubscribe` URL points at the admin portal. The RFC
8058 one-click POST works (`/api` passes through; the route uses `getServiceClient()`). The
GET path — which some mail clients rewrite links into — applies the opt-out and then
redirects to `/preferences/unsubscribe`, which is not `/api`, not `/auth` and not `/`, so
`if (!isAuthenticated && !isAuthPage && !isPublicPage)` bounced it to `/auth/signin`. A
subcontractor's office manager with no Patina account, and no way to get one, was shown an
admin sign-in form as the answer to "stop emailing me" and was never told it had worked.

**The fix.** The outcome page joins `/` as a public page:

```ts
const isPublicPage =
  req.nextUrl.pathname === '/' ||
  req.nextUrl.pathname === '/preferences/unsubscribe';
```

It renders from its own query string (`status`/`type`) or applies the token with a service
client, and holds no account data — there is nothing here for a session to protect. The
signed-in `/preferences` surface beside it is unchanged.

**Proof** — `npx jest src/__tests__/middleware-auth.test.ts` in `apps/admin-portal` →
**11 passed** (was 9):

```
lets an unauthenticated recipient read the unsubscribe outcome page ... ✓  (status 200, no Location)
still walls off the signed-in /preferences surface beside it   ... ✓  (307 → /auth/signin)
```

and `npx next build --webpack` (inline local env) → **exit 0**, `✓ Compiled successfully`,
route table carries `ƒ /preferences/unsubscribe`.

---

## W4R3-7 — QA MAJOR-1 — the mint band's before and after disagreed by a day

`apps/designer-portal/src/components/document/people/{paperwork-link-act,access-grant-list,people-format}.tsx`

**The defect.** With the seat's `on_site_to = 2027-02-08` selected, the band offered "Ends
with the job — 8 February 2027"; the post-mint sentence and the durable Access grants row
both then read "Ends 9 February 2027". `mint_paperwork_link` stores the exclusive UTC
boundary (`v_window_end::timestamptz + interval '1 day'`, 00637:470-475) and the display
layer formatted that stored value's date component directly.

**The fix, in three parts, one reckoning.**

1. `people-format.ts` gains `lastOpenDay(expiresAt)` — `Date.parse` minus one second,
   `toISOString().slice(0,10)`. It lands an exclusive midnight back on the window's last
   day and leaves a `…T23:59:59Z` or a mid-afternoon stamp on their own day: one rule, all
   branches. This is `access-grant-list.tsx`'s own QA-R8-1 helper, moved up a file so two
   surfaces cannot spell one date two ways, with the paperwork half added to its comment.
2. `paperworkMintedSentence` formats `lastOpenDay(expires_at)` instead of
   `expires_at.slice(0, 10)`.
3. `access-grant-list.tsx` gains `WHOLE_DAY_BOUNDARY_TIERS = { field_link, paperwork_link }`
   — the two tiers that store such a boundary. The **date** rule follows that set; the
   **wording** still follows the field link alone, so a paperwork door reads "Ends 8
   February 2027." and never "renews when they use it".

Root cause is closed upstream too — see W4R3-8, which makes the band send the day it showed
so `expires_at` is that day's own end. `lastOpenDay` still covers every row minted before
this change and every mint that goes through the RPC's own derivation.

**Proof** — `npx jest src/components/document/people/__tests__/paperwork-link-act.test.tsx`
→ **11 passed**; `…/reach-access.test.tsx` → **51 passed**:

```
reports the same closing day the band offered, not the day after ... ✓
  → windowEnd "2027-02-08"; the RPC answers expires_at "2027-02-09T00:00:00+00:00";
    the band shows "Ends with the job — 8 February 2027" and the post-mint sentence reads
    "…can send their paper here until 8 February 2027."; /9 February 2027/ appears nowhere
the paperwork door's end date is the day the studio chose, not the day after ... ✓
  → grantEndsSentence("2027-02-09T00:00:00+00:00", NOW, "paperwork_link") === "Ends 8 February 2027."
  → grantEndsSentence("2027-02-08T23:59:59Z",       NOW, "paperwork_link") === "Ends 8 February 2027."
  → …and never contains "Renews"
```

---

## W4R3-8 — code MAJOR-1 — the inbound queue asked the studio to confirm "Other"

`packages/supabase/src/hooks/use-inbound-documents.ts`

**The defect.** `COMPLIANCE_DOC_TYPE_LABELS.other_named === 'Other'` is truthy, so the
`?? doc.doc_label` fallback in `inboundDocumentLine` was unreachable and an `other_named`
document lost the firm's own name for its paper — on the one face where **Confirm** (which
retires the paper on file and opens its gate) and **Reject** (which files a refusal the
firm reads) are taken. The company card's Paper table (`compliance-table.tsx:40-47`) and
the firm's own `/paperwork` page (`paperwork-model.ts:110-115`) both special-case it, so
the same card named the paper twice.

**The fix.** `documentTypeLabel`'s branch, ahead of the map lookup:

```ts
const label = doc.doc_type === 'other_named'
  ? doc.doc_label?.trim() || 'Other'
  : (COMPLIANCE_DOC_TYPE_LABELS[…] ?? doc.doc_label ?? doc.doc_type);
```

**Proof** — both suites, as the finding asked.
`npx vitest run src/hooks/__tests__/people-crm-w4.test.ts` in `packages/supabase`:

```
prints an other_named document's own name, not 'Other' ... ✓
  → "Master service agreement, uploaded 12 Sep 2026 by Twin Cities Drywall."
falls back to 'Other' only when the firm named nothing ... ✓  (null and "   ")
```

`npx jest src/components/document/people/__tests__/inbound-queue-band.test.tsx` →
**13 passed** (was 12). The band suite's `inboundDocumentLine` mock is replaced with
`jest.requireActual("@patina/supabase").inboundDocumentLine` — the same move the suite
already made for `asInboundDocumentError`, and the reason the stub could not see this:

```
names an other_named document by the firm's own name, never 'Other' ... ✓
  → the row reads "Master service agreement, uploaded 12 Sep 2026 by Northgate Electric."
  → nothing matches /^Other, uploaded/
  → and the act row's accessible name ("Check <line>") carries the same words, so a screen
    reader is not asked to confirm "Other" either
```

---

## W4R3-9 — code MAJOR-2 — the seat window band destroyed focus and named nothing

`apps/designer-portal/src/components/document/roster/seat-window-band.tsx`

**The defect.** The collapsed branch RETURNED the trigger alone, carrying
`aria-controls={bandId}` at an id nothing in the document held (a dangling IDREF); on press
the whole branch was replaced by the band, so the button under the caret was unmounted and
focus fell to `document.body` — a keyboard user on a thirty-row Call Sheet was returned to
the top of the page. Saving did it again (`setOpen(false)` at `:128`/`:133` with focus on
"Write the window"). Both siblings in the folder do it the other way and
`roster-row.tsx:14` states it as the room's rule (SPEC §7 #5).

**The fix.** The sibling pattern, verbatim: one outer container, the trigger always
rendered with `aria-expanded={open}` and a toggling `onClick`, and the band inside an
always-present `<div id={bandId} hidden={!open}>` — `notice-log.tsx:82-93`'s shape.

**Proof** — `npx jest src/components/document/roster` → **12 suites / 225 tests passed**.
Two new cases in `seat-window-band.test.tsx`:

```
keeps the trigger, and its aria-controls names a panel that exists ... ✓
  → container.querySelector('#'+panelId) is non-null BEFORE the press
  → after focusing and clicking: the same node is still mounted, document.activeElement is
    still that node (never document.body), aria-expanded flips false → true
survives a save with focus intact, and the panel closes rather than vanishes ... ✓
  → after Write the window resolves, the trigger is present with aria-expanded="false" and
    the panel still exists with the `hidden` attribute
```

---

## W4R3-10 — code MAJOR-3 — the homeowner's terminal money act removed itself on press

`apps/client-portal/src/components/threshold/letterbox.tsx`

**The defect.** `payHere` carried `&& !open`, so pressing "Pay $X" set `open`, which made
`payHere` false, which unmounted the button under the caret. `ScoredAction` with no `href`
renders a `<button>` (`instruments/scored-action.tsx:210`); `revealReturnAnchor` only calls
`scrollIntoView`; the surface had no live region. Focus fell to `document.body` and nothing
was announced — on the terminal MONEY act, new this round (before W4 r2 it was an `href`
navigation). It also carried `aria-controls` with no `aria-expanded`, unlike its sibling
two lines down.

**The fix.** Both halves of what the finding offered, because the act is the money one:

* the act stays rendered (`payHere = invoice !== null && balanceCents > 0`) and declares
  itself a disclosure with `aria-expanded={open}` beside its `aria-controls`;
* pressing it moves focus into the till it opened — the `Settlement` wrapper is now
  `role="group" aria-label="Settle this invoice" tabIndex={-1}` with a ref, and an effect
  moves focus once `open` has actually mounted it — and a new `role="status"` polite region
  on the surface says "Payment for <invoice> is open. Nothing is charged until you choose
  how to pay." (`paperwork-sheet.tsx:52-56,76`'s shape);
* the consequence sentence still goes once the till is open: it has become the thing it
  described.

**Proof** — `npx jest src/components/threshold/__tests__/letterbox.test.tsx` →
**35 passed** (was 34). The r2 case that asserted the act disappears is replaced, since
that behaviour was the defect:

```
keeps the act once the letter is open, and drops only its consequence ... ✓
never destroys the focus of the person who pressed the money act, and says what it did ... ✓
  → before: aria-expanded="false", aria-controls="letterbox-letter"
  → after:  the same button node is still in the document
            document.activeElement !== document.body
            document.activeElement === getByRole('group', { name: 'Settle this invoice' })
            getByRole('status') matches /Payment for .* is open\. Nothing is charged…/
```

`npx jest src/components/threshold` → **47 suites / 1 153 tests passed**.

---

## W4R3-11 — code MAJOR-4 — the mint band's window was not tenant-scoped the way the RPC's is

`apps/designer-portal/src/components/document/people/paperwork-link-act.tsx`

**The defect, carried forward from r2 MAJOR-2.** `firmEngagementWindowEnd` reads
`usePeopleSeats({ all: true })` and filters on `company_id` and `!off_job_at`;
`mint_paperwork_link` adds a third predicate the face does not carry
(`project_tenant_org(pp.project_id) = v_org`, 00637:459-463), and
`people_directory_seats` admits seats on projects with `studio_id IS NULL` through its
designer-of-record legs (R-BD / R-BI's legacy population). So the band could print "The
door can end with this firm's work here, <date>", pre-select that radio, and meet
`paperwork_link_window_required` — whose own sentence ("This firm has no open engagement
here") contradicts the line directly above it.

**The fix — the finding's second option**, because the first would need a tenant column
`people_directory_seats` does not have (`\d public.people_directory_seats` lists 30 columns
and none of them is an organization id, so scoping the face means a view change and a
migration):

```ts
const chosenDay =
  choice === "window" ? windowEnd
  : choice === "thirty" ? thirty
  : namedDay.trim();
```

Every branch now names its day, so `mint_paperwork_link` takes the caller's date on every
press and never re-derives. The two reckonings cannot diverge; and as a second effect, the
stored `expires_at` becomes `<chosen day>T23:59:59Z` rather than an exclusive midnight, so
W4R3-7's sentence has nothing to reason its way back from on a fresh mint. R-AD is
unchanged: the face still says which clock it is using, in words, before the press, and the
analytics `expiry_source` still distinguishes `engagement_window` from `chosen`.

**Proof** — `npx jest src/components/document/people/__tests__/paperwork-link-act.test.tsx`
→ **11 passed**:

```
sends the very day it offered when the firm's own window is chosen ... ✓
  → the radio reads "Ends with the job — 21 November 2026" and is checked
  → mintMutate called with { companyId, expiresAt: "2026-11-21T23:59:59Z" }   (was null)
  → grantMinted still { tier: "paperwork_link", expiry_source: "engagement_window" }
```

The three r2 cases that pin the face's own derivation against the real
`firmEngagementWindowEnd` (a lapsed window offers nothing; a live one is offered; a firm
with none reads NO_ENGAGEMENT_SENTENCE) are unchanged and still green.

---

## Gates, re-run at HEAD

| Gate | Command | Result |
|---|---|---|
| Local DB | `pnpm supabase:reset` | clean replay through 00638 |
| W4 SQL suite | `psql -v ON_ERROR_STOP=1 -f supabase/tests/people/w4_channels_touches_paperwork_test.sql` | **all blocks passed** (10 blocks + sub-blocks; 10/10b new) |
| W1a SQL | same, `w1a_identity_channels_consent_test.sql` | **All W1a assertions passed.** |
| W1b SQL | same, `w1b_compliance_authority_directory_test.sql` | **All W1b assertions passed.** |
| W3 SQL | same, `w3_merge_sweep_household_test.sql` | **W3 SQL suite: all blocks passed** |
| Deno — the r2 blocking gate | `deno test --allow-all --config supabase/functions/deno.json supabase/functions/_tests/email-channel-status.test.ts` | **19 passed, 0 failed** |
| Deno — the edited `_shared` + their callers | same, over `_shared/{sms,send-email}.test.ts` and `_tests/{email-channel-status,field-daily,sms-inbound,sms-status,paperwork-upload,morning-brief}.test.ts` | **194 passed, 0 failed** |
| Supabase type-check | `pnpm --filter @patina/supabase type-check` | **clean** (exit 0) |
| Supabase vitest | `npx vitest run` in `packages/supabase` | **107 files / 1 431 pass, 12 skipped** |
| notifications type-check | `pnpm --dir packages/notifications type-check` | **clean** (exit 0) |
| notifications vitest | `npx vitest run` in `packages/notifications` | **7 files / 103 tests pass** |
| Designer type-check | `pnpm --dir apps/designer-portal type-check` | **clean** (exit 0) |
| Designer jest (touched areas) | `npx jest src/components/document/people src/components/document/roster src/lib/analytics src/lib/document` | **160 suites / 3 083 tests pass** |
| Client type-check | `pnpm --dir apps/client-portal type-check` | **RED — pre-existing**, see below |
| Client jest + coverage | `npx jest --coverage` in `apps/client-portal` | **154 suites / 2 538 tests pass**; all-files **76.9 / 72.7 / 76.63 / 79.25** vs the 70/60/70/70 floor |
| Client build | `npx next build --webpack` (inline local env) | **exit 0**, `ƒ /paperwork/[token]` present |
| admin-portal build | `npx next build --webpack` (inline local env) | **exit 0**, `✓ Compiled successfully in 19.2s`, `ƒ /preferences/unsubscribe` |
| admin middleware jest | `npx jest src/__tests__/middleware-auth.test.ts` | **11 passed** |

`deno.lock` is absent from the repo root and from the worktree root after every Deno run.

### The two reds, both pre-existing and both outside this brief

* **Client type-check** — the identical single error the r3 code review recorded:
  `.next/types/app/page.ts(37,29): error TS2344` from `apps/client-portal/src/app/page.tsx:21`
  declaring `props?:` optional. The review confirmed with `git merge-base --is-ancestor`
  that the file predates this wave; nothing in this round touches it.
* **admin-portal jest as a whole** — 21 suites red (catalog, ui/button, sanitize, api-client,
  a Playwright spec jest picks up). None of them imports `src/middleware.ts`; the suite this
  round touched is green, and the admin gate the reviewer ran (the production build) is
  green. Not measured against a stash, so recorded as observed rather than as proven
  pre-existing.

## Not done, deliberately

* **No migration minted.** 00629 is unapplied on prod and R-BS's rule for W3 (edit
  00628–00634 in place) is the same rule this amendment follows. `00595–00620` remain
  reserved by the hour-tracking program and are untouched.
* **No grant or revoke changed**, so `supabase/seed/00-legacy-grants.sql` is not
  regenerated; no schema or signature changed, so no `db:generate`.
* **`proposal-send`'s missing touch** (the email twin named inside R3-MAJOR-5) is not in the
  brief's list and is untouched.
* **No prod anything**: no `db push`, no `functions deploy`, no secrets. Every `_shared`
  importer listed under W4R3-5 redeploys in W7.
