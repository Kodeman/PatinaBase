# W1b · lane D (backend) — adversarial review

Reviewer: separate context, read-only. Branch `daily-return/w1b-d` @ `400a3a2c6`, 9 commits,
27 files, +2699/−33. No build, no commit, no DB run — every claim below is read out of the diff
or out of the tree it lands on, with file:line.

**Verdict: 3 blocking, 6 major, 11 minor.** The migrations are careful work — the frozen prefix is
genuinely byte-identical, the 00246 body is verbatim, the M5 grant posture is right, and B6's
two-row shape is implemented as asked. But two of the three blocking findings are in the seam
between lane D's SQL and the client that reads it, and one is a live safety gap on a new public
endpoint.

---

## What is right (verified, not taken on trust)

- **00533 body is verbatim.** Diffed `00533:96-197` against `00246:216-300`: the DECLARE block, all
  three profile branches, `set_config('aesthete.match_source','ios')`, the fourteen existing select
  expressions, the `get_aesthete_matches` call and `ORDER BY m.rank` are identical. The delta is the
  ten appended projections and the `RETURNS TABLE` tail. Both grants (`00246:307-308`) re-applied.
- **The frozen prefix holds.** `pg_get_function_result` assertion in
  `supabase/tests/aesthete/shim_contract_test.sql:93` names the fourteen in order, then the ten.
- **The "four callers" correction is true.** `apps/client-portal/src/app/api/feed/[roomId]/route.ts`
  has zero `.rpc(` calls; `get_recommendations` appears once, at `:92`, in a comment. The other three
  are all updated on this branch, the shim test in the same commit as 00533 (M6 satisfied).
- **M5 grant posture is exactly as the critique asked.** `00534:186-190` REVOKEs from PUBLIC, anon
  **and** authenticated; GRANTs service_role only. The pgTAP file asserts all four
  (`client_attention_test.sql:86-94`). Same posture on `purge_client_account` (`00536:250-253`).
- **`sync_proposal_send_in_app_log` really is body-verbatim.** Diffed against `00388:1236-1300`; the
  only delta is four keys in the `jsonb_build_object`. The 00388 grant posture (`:1305`, `:1331`) is
  re-applied identically.
- **`invoke_edge_function` is async** (`net.http_post`, 00258) — the new trigger does not block a
  designer's write on an HTTP call, and a rollback un-queues the request.
- **The seed numbers in the report are accurate.** Counted in the diff: 9 rows carry `dimensions`,
  7 carry `lead_time_weeks`, and exactly 2 (`…011` Brass Arc Floor Lamp, `…020` Jute Rug) carry a
  size with no lead time. The report's correction of the plan's "eight" is right.
- **The two pre-existing client-portal jest failures are real and untouched.**
  `apps/client-portal/src/lib/data/` contains `profile.ts`, `projects.ts`, `service-binding.ts` —
  no `orders.ts`; `git diff --stat main...HEAD -- apps/client-portal/src/lib/` is empty.
- **Migration numbers are clean.** `git ls-tree main supabase/migrations/` ends at
  `00531_restore_extension_execute_authenticated.sql`; `_pending/` still holds only
  `00106_drop_client_messages.sql`. 00533–00536 do not collide.
- **Tests fail without the change.** Every new SQL file asserts an object 00533–00536 create; both
  deno suites import modules that do not exist on `main`; the AASA and piece-content jest cases
  assert entries/exports added here.
- **Owned-file discipline.** Every path in all 9 commits is in lane D's row except
  `apps/client-portal/src/middleware.ts`, which is owned by no lane and is declared as deviation #4.
  Conventional Commits throughout, pathspec commits, nothing pushed.

---

## BLOCKING

### B-D1 · Every attention notification renders **twice** in the client's bell
**Confidence: high.** SP-08 · 00534 · critique B6.

`00534:158-163` always inserts the push row as `channel='push', status='queued'`. The client's feed
filter is not channel-`in_app`-only:

```
Core/Network/NotificationsAPIClient.swift:32
  static let visibleStatusFilter = "in.(queued,sending,delivered,unconfirmed,opened,clicked)"
Core/Network/NotificationsAPIClient.swift:64-65
  URLQueryItem(name: "channel", value: "in.(in_app,push)"),
  URLQueryItem(name: "status",  value: Self.visibleStatusFilter),
```

So the push envelope is **inside** the visible set in every non-failed state:
`apns-send/index.ts:205-207` returns early with `skipped:'no_tokens'` and never stamps the row (it
stays `queued`, visible); `:219-227` stamps `delivered` on success (visible). Only total failure
(`:229-238` → `failed`) removes it. The result is two rows with identical `metadata.title`,
`metadata.body` and `deep_link` for every proposal, invoice and decision — and the no-token case is
the **default** today, because the SP-08 primer that earns a push token is lane C's unshipped work.

The test does not catch this because assertion 4 (`client_attention_test.sql:139-145`) force-stamps
the push row `failed` before counting visible rows; assertion 2 (`:106-109`) counts 2 rows without
asking which of them the client sees. `d-notes.md` §2(c) comes within a word of naming it — "that
would surface the envelope twice" — but never states that the envelope is surfaced *once* already,
and hands lane C no instruction.

This reproduces F08 in a new form, which is the finding SP-08 exists to close — the same shape the
critique caught in B6.

*Fix, either side:* narrow the feed to `channel=eq.in_app` (or de-duplicate on
`metadata.entity_id`) in `NotificationsAPIClient` — a lane C change lane D must write as an
integration note — **or** stop making the push row client-visible. There is no non-visible value in
`notification_status` (00041:14-23 = queued/sending/delivered/opened/clicked/bounced/failed/
suppressed), so the client side is the only lever, which is precisely why the note must exist.

### B-D2 · The new roster policy hands the client the designer's private CRM row
**Confidence: high.** 00536 §1 · contradicts SP-05.

```
00536:75-78
CREATE POLICY designer_clients_client_read ON public.designer_clients
  FOR SELECT TO authenticated
  USING (client_id = auth.uid() AND status = 'active');
```

RLS is row-level. The row it opens carries (`database.types.ts`, `designer_clients.Row`):
`notes`, `nickname`, `satisfaction_score`, `total_revenue`, `total_projects`, `referral_source`,
`tags`, `style_preferences`, `inspiration_quote`, `last_contacted_at`, `client_email`, `lead_id`.
`RosterAPIClient.listRoster()` asks for three columns, but the policy is not a column contract — any
signed-in homeowner can issue `GET /rest/v1/designer_clients?select=*&client_id=eq.<self>` and read
their designer's private notes about them, the satisfaction score she recorded, and the revenue she
has booked against them.

This is the same class SP-05 exists to close ("the client's project screen stops talking to the
designer"), and it is a privacy exposure, not a copy nit. Column-level GRANTs cannot fix it: designer
and client are both `authenticated`.

*Fix:* drop the policy and serve the roster through a SECURITY DEFINER RPC returning only
`(designer_id, status, created_at)` granted to `authenticated` and filtered on `client_id =
auth.uid()`, or a `security_invoker` view over a definer function. Either keeps
`DesignerRelationship.roster` reachable without opening the base row.

### B-D3 · `delete-account` will irreversibly delete a **designer's** entire book of business
**Confidence: high on the mechanism, medium on likelihood.** SP-20 · `delete-account/handler.ts`.

`handler.ts:52-70` authenticates the caller and then purges + deletes that auth user. There is no
check that the caller is a homeowner. The endpoint is `verify_jwt = true` and nothing more
(`config.toml:557-564`), so **any** authenticated JWT on the Strata project reaches it — including a
designer-portal session. Designer-owned rows do not detach, they cascade:

```
00014:74   designer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
00014:124  designer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
00014:301  …  00014:349  …   00020:18  designer_id … ON DELETE CASCADE
```

So one POST from a designer's browser console deletes her projects, proposals, invoices and roster
permanently, with no confirmation beyond her own token. `purge_client_account` would not even
complain — its only guard is `p_user_id IS NULL` (`00536:186-189`).

*Fix:* refuse in the handler (and in `purge_client_account`) when the caller owns designer-side rows
— e.g. `profiles.is_designer` true, or any `projects.designer_id = p_user_id` — with its own error
code. Cheap, and it is the difference between a deletion feature and a footgun.

---

## MAJOR

### M-D1 · The decision trigger fires on the wrong event; SP-08's decision half does not reach the bell
**Confidence: high.** 00534 §3.

`00534:283-287` is `AFTER INSERT ON public.client_decisions`. The shipped path by which a designer
actually *sends* a decision to a client is an **UPDATE**:

```
00399:3505-3509  publish_client_decision(p_decision_id)
                 UPDATE public.client_decisions SET status='pending', sent_at=… WHERE id = …
                 (GRANT EXECUTE … TO authenticated, 00399:3521)
00464:997-1000   the project-approval send — same draft→pending UPDATE
00463:1332-1344  …over a row inserted as status 'draft', court 'client'
```

Decisions that begin life `pending` on INSERT are the SECURITY DEFINER proposal-approval writes
(`00387:1534`, `00390:981`, `00400:126`), which insert at `'responded'` and are filtered out anyway.
So the plank's own scenario — "a decision overdue since Aug 22" that the bell never mentions — still
produces no notification row after this wave.

The plan did specify "an `AFTER INSERT` trigger on `client_decisions` in the 00289 shape", so the
lane is plan-conformant; but the plank is **half-delivered** and nobody has said so. `d-notes.md`
does not raise it, and the pgTAP file only ever exercises direct INSERTs
(`client_attention_test.sql:165-176`).

*Fix:* add `AFTER UPDATE OF status` with `OLD.status IS DISTINCT FROM NEW.status AND
NEW.status='pending'`, or call `notify_client_attention` from `publish_client_decision` /
`_enqueue_decision_notification` (00465:15) directly. Either is a small addition to 00534.

### M-D2 · The AASA money paths do not exist on the host, and disagree with 00534's own deep links
**Confidence: high.** SP-03 · AASA route + 00534.

`apple-app-site-association/route.ts:21-33` declares
`paths: ["/piece/*", "/invoice/*", "/proposal/*", "/decision/*"]` — singular. The client portal's
actual routes are plural (`ls apps/client-portal/src/app` → `invoices`, `proposals`, `decisions`,
`piece`), and lane D's own 00534 writes the plural form into every notification:

```
00534:105-108   WHEN 'proposal' THEN '/proposals/'  WHEN 'invoice' THEN '/invoices/'
                WHEN 'decision' THEN '/decisions/'
```

Result: the three money associations point at URLs that will never be visited, and the URLs the
product does emit are unassociated — a client tapping a portal/email link to an invoice never opens
the app. `/piece/*` is the only entry that matches a real route.

The build plan named the singular paths, so the error is inherited; but both halves are lane D's, and
they shipped inconsistent with each other in the same wave. Whichever spelling wins, one of the two
files must change, and lane C's `DeepLinkHandler` must be told which.

### M-D3 · The shared piece page renders inside the signed-in portal chrome
**Confidence: high.** SP-03 · `piece/[id]/page.tsx`.

Every other public route in this portal is exempted from the app chrome by name:

```
apps/client-portal/src/components/layout/app-chrome.tsx:13-23
const PUBLIC_PREFIXES = ['/auth','/share','/field','/rfq','/plans','/quiz','/demo',
                         '/wrong-portal','/unauthorized'];
```

`/piece` is not in that list, and the root layout wraps every route
(`app/layout.tsx:56-58`). So the husband who gets the text opens a piece page dressed in the Patina
**Client Portal** — global header, project switcher, mobile drawer, links to Projects and Invoices
he cannot open. That is a softer version of exactly the finding SP-03 exists to close (the share
hands over a portal, not a piece).

`app-chrome.tsx` is owned by no iOS lane, same category as `middleware.ts` — which lane D correctly
recognised and edited. This one was missed, and is not in `d-notes.md`.

*Fix:* one string, `'/piece'`, in `PUBLIC_PREFIXES`, plus a case in the chrome's test.

### M-D4 · The purge and the auth delete are two transactions with no compensation
**Confidence: high on the mechanism, medium on likelihood.** SP-20.

`index.ts:47-58` runs `purge_client_account` through one service-role client and
`auth.admin.deleteUser` through another — two round trips, two transactions. If the second fails
(network, GoTrue 500, rate limit) the handler returns `auth_delete_failed` (`handler.ts:66-69`) and
stops. The account still exists; its `proposals.client_id`, `projects.client_id`,
`invoices.client_id` and `client_decisions.selected_by` are permanently NULL. Those columns are what
every client-side RLS policy keys on, so the person signs back in to an app with no proposals, no
invoices and no project — and there is no path back: the ids were the only record of the link.

`handler.ts:15-17` asserts the opposite — *"half-detached rows under a live account are
recoverable"*. They are not; nothing stores what was detached.

*Fix:* either make the purge idempotent **and** retriable with the detached ids journalled, or
reverse the order behind a single transaction boundary (delete the auth user inside the same SQL
call, via `auth.users` DELETE from the definer function, which is what the purge already clears the
road for). At minimum, correct the comment and say what the operator must do.

### M-D5 · `purge_client_account` takes ACCESS EXCLUSIVE on the four busiest designer tables
**Confidence: high.** 00536 §3.

`00536:195-199` disables user triggers on `proposals`, `projects`, `invoices`, `client_decisions`,
`client_decision_options`. `ALTER TABLE … DISABLE TRIGGER` takes ACCESS EXCLUSIVE, which conflicts
with ACCESS SHARE — so for the length of one homeowner's account closure, **every read and write of
those five tables blocks portal-wide, for every designer on Patina**. The banner presents the lock as
a safety property (`00536:53-57`), which it is; it does not mention that it is also a global stall
and a deadlock surface against long-running designer transactions.

Two smaller edges in the same block: `ENABLE TRIGGER USER` (`:229-233`) resets any trigger configured
`ENABLE ALWAYS` / `ENABLE REPLICA` on those tables to origin-only — a silent downgrade if one is ever
added for logical replication; and disabling *all* user triggers also silences the `updated_at` and
audit triggers for the purge's own UPDATEs, so the detachment leaves no trail.

*Fix (or at minimum, record):* narrow to `ALTER TABLE … DISABLE TRIGGER <name>` for the five named
guards rather than `USER`, and say in the banner that this is a maintenance-window-shaped operation.

### M-D6 · `account_purge_test.sql` claims coverage it does not have, and the plan's assertion 3 quietly changed
**Confidence: high.**

The file header (`:19-21`) and the task list both say the fixture carries "an issued invoice"; there
is **no** `invoices` INSERT anywhere in the file (fixtures end at `saved_items`, `:104-106`). So
`set_invoice_studio_id` — one of the five guards the whole design rests on, named in the banner at
`00536:47` — is never exercised, and `UPDATE invoices SET client_id = NULL` (`00536:214`) is never
asserted. That is the one detach a client would most notice losing.

Second: d-tasks Task 5 assertion 3 said *"the proposal, project, invoice and decision rows still
exist, with client_id / selected_by / designer_client_id NULL"*. The shipped test says instead
(`:159-161`) *"the decision cascaded away with its designer_clients parent"*. That is a real product
consequence — an erasure destroys the designer's decision record and its options, not just the
person's link to it — and it contradicts the principle the banner argues for at `00536:56-58`
("the designer's document survives, with the person detached from it"). It is recorded in a test
comment and nowhere else; it belongs in `d-notes.md` §6(b) where Fable is being asked to rule.

---

## MINOR

1. **`notify_client_decision_raised` announces RFIs, submittals, sign-offs and punch items as "A
   decision needs you".** *(medium confidence)* `00534:262-264` guards only on `court='client'`;
   `coordination_kind` (00213:36-37) admits `selection|rfi|submittal|signoff|punch`. A punch item in
   the client's court gets decision copy. Either narrow the guard or widen the copy.
2. **`saved_items.price_cents_at_save` ships with no writer.** *(high)* 00535 adds it and
   `d-notes.md:225` announces it, but no lane is instructed to populate it — SP-14's client-half
   brief never mentions it. Absent an instruction to lane A, the column lands dead.
3. **Generated types mis-state nullability for the ten new RPC columns.** *(high)*
   `database.types.ts:31150-31170` emits `brand: string`, `dimensions: Json`,
   `photo_verified_at: string` — non-nullable — while neighbours in the same block are
   `image_url: string | null`, `maker_location: string | null`. Every one of the ten can be NULL.
   A generator quirk, but it is now committed and a web consumer would trust it.
4. **`/piece`'s "Open in Patina" dead-ends for the reader without the app.** *(high)*
   `piece-content.ts:103` emits `patina://piece/<id>`; a recipient with no app gets Safari's
   "cannot open the page" — a system error string in front of a homeowner, which is the class C5
   forbids. An App Store fallback, or the universal link itself, would be honest.
5. **Unreachable branch in `pieceMetadata`.** *(high)* `piece-content.ts:120-124`: the `?? ""` after
   `.join(" · ")` can never fire; the `description || …` fallback below already covers it.
6. **`invoice-send`'s due-date line is timezone-dependent.** *(medium)* `invoice-send/index.ts:317-319`
   parses `invoice.due_date` with `new Date(...)` and renders with `toLocaleDateString('en-US')`.
   A date-only value is parsed as UTC midnight; any runtime behind UTC prints the previous day.
7. **`shim_contract_test.sql` numbers its new block "5b" and places it *before* section 5**
   (`:179-201` sits above `-- ── 5. match_events attribution ──` at `:203`).
8. **Double labelling on the piece page.** `page.tsx:130-132` renders `Lead time` / `Ships in about
   10 weeks`. SP-10's shape is the sentence alone.
9. **Final commit subject under-describes its contents.** `400a3a2c6 chore(db): regenerate the ACL
   seed and types for 00533-00536` also carries `supabase/seed/products.sql` (four rows' seed data).
10. **No server-side uniqueness on `saved_items(user_id, product_id)`.** *(high)* SP-14's "no
    duplicate rows" rests entirely on lane A's client-side idempotency; 00535 adds no partial unique
    index. Not in scope as written — worth naming so nobody assumes the server holds the line.
11. **`purge_client_account` is named for a client but guards nothing about one** (`00536:186-189`) —
    see B-D3; even with the handler fixed, the SQL should refuse a designer id on its own.

---

## Integration notes — completeness

`d-notes.md` is unusually good: the 00534 row contract, the `AppNotificationType` gap, the
`metadata.body`/`message` history, the `delete-account` endpoint contract, the
`APIConfiguration.swift:182,220` re-point, the piece URL shape, the exact `RETURNS TABLE` order, the
`maker_name` composition rule with a reference implementation, and the settled SP-04 fact for lane B
are all there and all check out against the tree.

Three gaps, all consequences of findings above:
- **B-D1** — lane C is never told the push row is visible, or that the feed needs narrowing.
- **M-D2** — lane C is told the AASA serves `/invoice/*` but not that 00534 writes `/invoices/<id>`;
  it will build `DeepLinkHandler` against one of the two spellings and be wrong half the time.
- **M-D3** — `app-chrome.tsx` is a no-lane file in the same category as `middleware.ts`, and needs
  the same steward note.

Minor: minute #2 (`price_cents_at_save` has no writer) belongs in the lane A section as an
instruction, not in the "facts" paragraph.

---

## Gate evidence — assessed, not re-run

The lane owns the local stack and the reviewer is read-only, so the gate output is taken as reported
and checked for internal consistency:
- `run-sql-tests.sh` 131 total / 22 expected-fail matches `supabase/tests/KNOWN_FAILURES.md`'s
  stated **22** residual — consistent.
- "Client-portal jest, lane D's paths: 18 passed" matches the files: 14 `it()` in
  `piece-content.test.ts`, 4 in the AASA suite — consistent.
- "983 passed, 1 failed" alongside "the two failing suites" is loose phrasing, not a contradiction:
  one failing assertion in `portal-access.test.ts` plus one suite that cannot load
  (`orders.test.ts`, whose subject module is absent from the tree). Both verified untouched.
- Nothing in the report claims a device or deploy result. Correct — none was produced.
