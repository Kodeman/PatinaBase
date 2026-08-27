# W1b · lane D — integration notes

From lane D (backend), branch `daily-return/w1b-d`, base `main` @ `5b5c0c054`.
Format: **file · exact diff or precise instruction · why**. Nothing below was edited by lane D
except where marked "lane D edited this" — those are flagged for the steward, not requests.

---

## 1. lane B · SP-04 — the signature-confirmation email is ALREADY wired. No backend change.

**The question the plan asked lane D to settle:** *"the signature confirmation email — verify
`supabase/functions/proposal-sign-confirmation` and wire it if `sign_proposal` does not."*

**Verified answer, in two halves.**

`sign_proposal` does **not** send it, and does not need to.

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*sign_proposal" supabase/migrations/*.sql
supabase/migrations/00387_project_proposal_authority_boundaries.sql
supabase/migrations/00399_journey_authority_integrity.sql
supabase/migrations/00400_proposal_signature_authority.sql        ← head
```

`sign_proposal(uuid, text)` at `00400:408` is a thin authenticated wrapper that delegates to
`_sign_proposal_authorized_00400`. Neither body contains `invoke_edge_function` — the string does
not appear anywhere in `00400`. Nothing in `supabase/migrations/` or `supabase/functions/` invokes
`proposal-sign-confirmation`.

**The iOS client already fires it**, best-effort, immediately after the RPC:

`apps/mobile/Patina/Patina/Services/API/ProposalsAPIClient.swift:419-429`
```swift
// CARRY-FORWARD: sign_proposal does NOT send the confirmation email.
do {
    try await client.functions.invoke(
        "proposal-sign-confirmation",
        options: FunctionInvokeOptions(body: SignConfirmationBody(proposalId: proposalId))
    )
} catch { /* non-fatal — the proposal is already accepted server-side */ }
```

and the file's header comment (`:11-16`) says so explicitly: *"exactly like the portal route, we
fire the best-effort `proposal-sign-confirmation` edge function afterward."*

**So:** SP-04's email half is done. Lane B's SP-04 work is the sheet copy — "Accepted" not "Signed",
and the restatement of total, line count, terms and date — with no backend dependency and no
integration note from lane D. The function itself is unchanged by this wave: `verify_jwt` stays at
the platform default (it has no `config.toml` stanza), and it sends two emails (client receipt,
designer notification) off `proposals.total_amount`.

⚠ One thing lane B may want to know: `proposal-sign-confirmation` reads `proposals.total_amount`
(dollars, `Intl.NumberFormat`), **not** a `*_cents` column. That is pre-existing and out of this
wave's scope; flagging it because the sign sheet restates a total and the two surfaces should agree.

---

## 2. lane C · 00534 — the notification row contract

This is the seam between lane D's SQL and lane C's `NotificationsAPIClient`. Each call to
`notify_client_attention` writes **two** rows.

| | in-app row | push row |
|---|---|---|
| `channel` | `in_app` | `push` |
| `status` | `delivered` | `queued` |
| `type` | `proposal_attention` \| `invoice_attention` \| `decision_attention` | same |
| `template_id` | `client-attention` | `client-attention-push` |
| id handed to `apns-send` | **never** | **yes** |

`metadata`, identical on both:

```json
{
  "entity_type": "proposal" | "invoice" | "decision",
  "entity_id":   "<uuid as text>",
  "title":       "<bell title>",
  "body":        "<bell body>",
  "message":     "<same as body>",
  "deep_link":   "/proposals/<id>" | "/invoices/<id>" | "/decisions/<id>",
  "url":         "<same as deep_link>",
  … plus whatever the caller passed: project_id, amount_cents, due_date, reminder_stage
}
```

**Four consequences for lane C, none of which lane D can apply:**

**(a) `AppNotificationType(serverType:)` has no case for the three new type strings.**
`NotificationsAPIClient.swift:158-176` switches on `remote.type`; `proposal_attention`,
`invoice_attention` and `decision_attention` all fall through to `default: self = .newRecommendations`,
so a $4,250 invoice draws the "new pieces for you" icon and colour. Suggested addition, in
`extension AppNotificationType { init(serverType:) }`:

```swift
case "proposal_attention", "proposal_sent":
    self = .designerResponse
case "invoice_attention", "invoice_sent", "invoice_reminder":
    self = .designerResponse      // or a new money bucket, if lane C adds one
case "decision_attention":
    self = .designerResponse
```

Lane D has no opinion on which bucket; the point is that all three currently land in the wrong one.

**(b) `metadata.body` is now written — it was not before.** `AppNotification.init(from:)`
(`NotificationsAPIClient.swift:137-139`) reads `metadata["body"]`, falling back to `metadata["preview"]`,
then `""`. Every pre-00534 writer spells it **`message`**: `00289:245` (design-request rows) and
`sync_proposal_send_in_app_log` (00388, proposal-sent rows). So every existing bell row renders with
an **empty body** today. 00534 writes both keys on its own rows and redefines
`sync_proposal_send_in_app_log` to add `body` to the proposal row. **00289's design-request rows are
still `message`-only** — lane C may want the decode to fall back to `metadata["message"]` as well:

```swift
let body = remote.metadata?["body"]?.value as? String
    ?? remote.metadata?["message"]?.value as? String
    ?? remote.metadata?["preview"]?.value as? String
    ?? ""
```

**(c) `status = 'failed'` is deliberately excluded, and now that is safe.** `visibleStatusFilter`
(`:32`) omits `failed`; `apns-send/index.ts:217-238` stamps the row it is handed `failed` when every
token fails. Because only the **push** row's id is ever handed over, a failed push now removes the
push row from the feed and leaves the in-app row standing. Lane C should **not** widen the filter to
include `failed`.

**(d) ⚠ BLOCKING FOR LANE C — the feed must ask for `in_app` only, or every attention renders
TWICE.** (Review B-D1; this was missing from the first cut of these notes.) The push envelope is a
real `notification_log` row with `channel='push'`, and the feed's current filter admits it:

```
Core/Network/NotificationsAPIClient.swift:32
  static let visibleStatusFilter = "in.(queued,sending,delivered,unconfirmed,opened,clicked)"
Core/Network/NotificationsAPIClient.swift:64-65
  URLQueryItem(name: "channel", value: "in.(in_app,push)"),
  URLQueryItem(name: "status",  value: Self.visibleStatusFilter),
```

The envelope is inside that set in **every** non-failed state — `apns-send/index.ts:205-207` returns
early on `no_tokens` and never stamps it, so it stays `queued` (visible), and `:219-227` stamps
`delivered` on success (also visible). Only total failure hides it. **`no_tokens` is the default
today**, because the SP-08 primer that earns a push token is lane C's own unshipped work. So a
client on the current build would read the same proposal, invoice or decision twice — the exact
shape of F08, which SP-08 exists to close.

Lane D cannot fix this: `notification_status` (00041:14-23) has no value that is both a truthful
delivery state and outside the client's filter, and the bell row must never be the one handed to
`apns-send`. **The change is one line, in lane C's file:**

```diff
-  URLQueryItem(name: "channel", value: "in.(in_app,push)"),
+  // The push row is an envelope, not a bell row: 00534 writes one of each per
+  // attention and hands apns-send only the push id. Asking for both renders
+  // every notification twice.
+  URLQueryItem(name: "channel", value: "eq.in_app"),
```

If lane C would rather keep `push` in the query for a legacy reason, the equivalent is a client-side
de-duplication on `metadata.entity_id` preferring the `in_app` row. Either is fine; doing neither
ships the duplicate. The SQL side asserts its half —
`supabase/tests/notifications/client_attention_test.sql` §4b proves exactly one `in_app` row exists
per entity, and states that the envelope is visible under the current filter.

**Local verification lane C can run** (the walk's "the bell lists the open invoice and the two
decisions after `select notify_client_attention(...)` runs locally"):

```sql
-- as postgres, against the local stack
select public.notify_client_attention(
  '<client auth uid>'::uuid, 'invoice', '<invoice id>'::uuid,
  'An invoice is ready', 'Olive Studio sent invoice INV-2026-0142.',
  '{"project_id":"<project id>","amount_cents":425000,"due_date":"2026-09-01"}'::jsonb);
```
It returns the push row's id and writes both rows. `invoke_edge_function` will `RAISE WARNING`
locally (the Vault carries no `service_role_key` on a fresh reset) — that is expected and harmless;
the rows are already written by then.

---

## 3. lane C · `delete-account` — the endpoint contract, and the enum that points at nothing

`POST {SUPABASE_URL}/functions/v1/delete-account`, `verify_jwt = true` (stated explicitly in
`supabase/config.toml`), `Authorization: Bearer <the caller's access token>`, **no body** — the body
is never read, so this cannot become a way to delete another user.

| Response | Meaning |
|---|---|
| `200 {"ok":true,"userId":"<uuid>"}` | the account is gone |
| `401 {"error":"unauthorized"}` | no/invalid token |
| `403 {"error":"designer_account"}` | the caller owns designer-side rows; **nothing was touched** |
| `405 {"error":"method_not_allowed"}` | not a POST |
| `500 {"error":"designer_check_failed"}` | that check could not be read; it fails **closed** |
| `500 {"error":"purge_failed"}` | the detach step refused; **nothing was deleted** |
| `500 {"error":"auth_delete_failed", "purgeRef":"<uuid\|null>"}` | the detach succeeded, the auth delete did not — the account is still live over detached rows, and `purgeRef` names the `client_account_purges` row holding every unlinked id |

⚠ **Two codes are new since the first cut of these notes** (review B-D3, M-D4). `403
designer_account` exists because `verify_jwt` admits any Strata token — a designer-portal session
included — and designer-owned rows CASCADE from `profiles(id)` rather than detaching, so an
unguarded endpoint would have permanently deleted a designer's projects, proposals, invoices and
roster. `purge_client_account` refuses a designer id on its own too.

`auth_delete_failed` now carries `purgeRef`, and lane C's copy for it must NOT say the account is
untouched — it isn't. Suggested shape: *"We started closing your account but couldn't finish. Nothing
of yours has been deleted yet, and we've flagged it — try again, or write to us."* The support path
is `select * from client_account_purges where auth_deleted_at is null`.

No vendor or Postgres text ever appears in the body (C5) — that is asserted in
`delete-account/handler.test.ts`, not merely intended. Lane C renders all six in Patina's voice.

**The re-point lane C must make:** `Services/API/APIConfiguration.swift:182` declares
`case deleteAccount` and `:220` maps it to `/rest/v1/rpc/delete_user_account` — **an RPC that does
not exist anywhere** (zero hits across `supabase/migrations/` and `supabase/functions/`; critique
B5). It needs to become the function path above, or the enum case should be dropped in favour of
`client.functions.invoke("delete-account")`.

**What deletion actually does**, for the confirmation copy: the auth user and everything cascading
from `profiles.id` goes — rooms, room scans, saved items, notifications, push tokens, style
profiles, quiz sessions, companion history, the roster row. The designer's proposals, projects,
invoices and decisions **survive**, with the client identity detached. SP-06's local store must be
wiped on success (lane A owns `LocalStoreReset`); an integration note between C and A, not D's.

---

## 4. lane C · SP-03 — the URL shape and the paths now served

`PatinaPortalLinks.piece(id)` should emit `https://client.patina.cloud/piece/<productId>`, where
`<productId>` is the `products.id` uuid `get_recommendations` returns as `id text`. That route now
exists (`apps/client-portal/src/app/piece/[id]/page.tsx`), is public (no session), and its Open
Graph title is `"<name> by <maker>"` — never the portal.

The AASA route now serves `VP22LXHT7L.cloud.patina.app` for **`/piece/*`, `/invoices/*`,
`/proposals/*` and `/decisions/*`** — all three money paths PLURAL. ⚠ This changed in the fix round
(review M-D2): the build plan named them singular, no such route exists on this host
(`ls apps/client-portal/src/app` → `invoices`, `proposals`, `decisions`, `piece`), and 00534 writes
the plural form into every notification's `deep_link` (`00534:105-108`). **`DeepLinkHandler` must
match on the plural paths**; a singular matcher will never fire on a real URL. So
`Patina.entitlements` wants `applinks:client.patina.cloud`, and `DeepLinkHandler` wants all four
host paths — not just `/piece/`.

The app-side fallback the page offers is `patina://piece/<id>` ("Open in Patina"), which works with
the existing custom scheme and no entitlement at all. ⚠ **Open item, not fixed here** (review minor
4): for a reader who does not have the app, tapping it produces Safari's "cannot open the page" —
a system error string in front of a homeowner. The honest fix is an App Store fallback, and **no
App Store id for `cloud.patina.app` exists anywhere in this repo** (grepped `apps/`, `packages/`,
`supabase/` for `apps.apple.com`, `itms-apps`, `APP_STORE_ID`, `appStoreId` — zero hits). Linking
the page at its own universal link does not help either: a same-host navigation from Safari does not
trigger universal-link handling. Fable's call; it needs the App Store id first.

⚠ **None of this is live until Kody deploys client-portal**, and universal links are a device claim
(iOS caches the AASA). The plan already records both as owed after W1b.

---

## 5. lane A · SP-10 / SP-14 — 00533's exact decode keys, and two columns that need a writer

⚠ **Two instructions for lane A, added in the fix round** (review minors 2 and 10):

1. **`saved_items.price_cents_at_save` has no writer.** 00535 adds the column and nothing populates
   it, so it lands dead. Lane A's save path must set it to the price shown at the moment of the
   save — that is the whole point of the column (SP-14: a saved piece remembers what it cost that
   day, so a later price change is visible rather than silent).
2. **The server does NOT hold the line on duplicate saves.** There is no unique index on
   `saved_items (user_id, product_id)` — 00535 adds none, deliberately, because a partial unique
   index over live rows is a behaviour change to a table lane A owns the write path for. So SP-14's
   "no duplicate rows" rests entirely on lane A's client-side idempotency. If Fable would rather the
   server enforced it, that is a one-line addition to a future migration and lane A's problem goes
   away — say so and lane D will add it.



The `RETURNS TABLE`, in order. The **first fourteen are the 00067 freeze** — byte-identical, never
reorder or rename. The last ten are 00533's.

```
id text, name text, price_cents integer, match_score integer, maker_name text,
maker_location text, maker_story text, image_url text, usdz_url text,
style_tags text[], material_tags text[], badges text[], category text, tier text,
dimensions jsonb, lead_time_weeks integer, brand text, description text,
published_at timestamptz, finish text, patina_managed boolean,
photo_verified_at timestamptz, source_url text, shipping_flat_cents integer
```

**`maker_name` still carries `COALESCE(v.name, 'Unknown Maker')`.** That is deliberate: it is part
of the frozen prefix and the shim contract test asserts it non-null. SP-10's "source the maker line
from `brand` with the vendor as fallback, and withhold a piece with no resolvable maker" is now a
**client composition**, because `brand` ships in the same row:

```
maker = brand?.trimmed.nonEmpty ?? (maker_name == "Unknown Maker" ? nil : maker_name)
```

Lane A suppresses the literal; the RPC keeps it. The same rule is already implemented and tested on
the web side — see `apps/client-portal/src/app/piece/[id]/piece-content.ts` `toPieceView`, whose
test asserts a null maker rather than a placeholder — if a second reference implementation helps.

**Seed data available for the walk** (after `supabase db reset`, which lane D owns):
9 of 19 catalog rows carry `dimensions`, 7 carry `lead_time_weeks`, and **2 carry a size but no lead
time** — so the "omit the line entirely" branch can be exercised on each line independently rather
than only all-or-nothing. `photo_verified_at`, `shipping_flat_cents` and `patina_managed` are
unpopulated by design: nothing has ever written them, and the honest render is nothing.

**`saved_items` gained `price_cents_at_save integer`** (00535) for SP-14. `room_id` already existed
(`00055:23`) — critique m8 was right, and 00535's banner says so.

---

## 6. Steward — two things lane D decided that are yours to overrule

**(a) `apps/client-portal/src/middleware.ts` — lane D edited this file.** It is owned by no lane in
`steward.md` §6 (A, B and C are all `apps/mobile/**`; D's client-portal grant is
`.well-known/**`, `piece/**`, `api/feed/**`). Without the edit the new public route redirects every
signed-out visitor to `/auth/signin`, which is the same dead end the share already was — so SP-03
would be unbuildable. The change is nine lines: one `const isPiecePage` with its comment, and one
disjunct added to `isPublicPage`.

```diff
   const isPlansPage = req.nextUrl.pathname.startsWith('/plans/');
+  // /piece/[id] is the public face of a shared piece (SP-03). A homeowner texts
+  // the link to her husband, who has no Patina account and may never have one;
+  // redirecting him to /auth/signin is the same dead end the share already was.
+  // The read behind it is anon-scoped by RLS (products_catalog_select_anon,
+  // 00152:298) — no session data is reachable from here.
+  const isPiecePage = req.nextUrl.pathname.startsWith('/piece/');
@@
     isEvidencePage ||
-    isPlansPage;
+    isPlansPage ||
+    isPiecePage;
```

Lane D deliberately did **not** run Prettier over that file: it carries repo-wide pre-existing
formatting drift (single quotes throughout), and `prettier --write` rewrote 80 of its 138 lines.
The nine added lines match the file's existing style.

**(a2) `apps/client-portal/src/components/layout/app-chrome.tsx` — lane D edited this in the fix
round, same category and same reasoning** (review M-D3). Without it the shared piece page renders
inside the signed-in Client Portal chrome: global header, project switcher, mobile drawer, links to
Projects and Invoices a stranger cannot open — a softer version of the very finding SP-03 closes
(the share hands over a portal, not a piece). The change is one string plus its comment:

```diff
 const PUBLIC_PREFIXES = [
   '/auth',
+  '/piece',
   '/share',
```

plus one case in `__tests__/app-chrome.test.tsx`'s existing `it.each` of login-less guest paths. The
file carries the same pre-existing formatting drift and was likewise not run through Prettier
(verified: `prettier --check` warns on the copy from `main` too).

**(b) 00536 carries three unrelated things under one number.** The steward's §5 flagged 00536 as
provisional and asked for Fable's confirmation. Lane D minted it and added a third item:

1. the client SELECT policy on `designer_clients` (W1a §M7);
2. the counterpart predicate in `rpc_start_direct_thread` (W1a §m8);
3. **`purge_client_account(uuid)`** — unplanned, and the reason is below.

They are the same kind of debt — a server-side gap that leaves a shipped client surface unreachable
— and each is small, so one migration reads better than three. If Fable would rather split it, the
purge is cleanly separable into its own file.

**Why (3) exists at all.** The plan asked for "the delete-account edge function (verify_jwt; cascade
app rows then auth admin delete)". The cascade cannot be done from a service-role client: the FK
actions a client's `auth.users` delete fires are refused by the designer-authority guards.

```
$ psql … -c "BEGIN; DELETE FROM auth.users WHERE id = '<client@patina.dev>'; ROLLBACK;"
ERROR:  update or delete on table "users" violates foreign key constraint
        "client_decisions_selected_by_fkey" on table "client_decisions"
… then, in turn:
ERROR:  proposal client identity may only change through set_document_client   (guard_proposal_authority)
ERROR:  non-draft proposal authored payload is immutable; create a revision draft
                                                          (guard_proposal_copy_immutability — NO escape hatch)
ERROR:  project client identity may only change through set_document_client    (guard_project_completion_authority)
ERROR:  studio_id_not_designer_studio                                          (set_invoice_studio_id)
ERROR:  decision … not found for option write                (guard_client_decision_option_authority)
ERROR:  null value in column "created_by" of relation "comms_threads" violates not-null constraint
```

`purge_client_account` therefore disables the user triggers on exactly five tables (`proposals`,
`projects`, `invoices`, `client_decisions`, `client_decision_options`) for the length of one
transaction, detaches the person, and re-enables in an exception-safe block. RI/system triggers stay
enabled — every cascade still fires. The list was derived empirically, not guessed: rolled-back
`DELETE FROM auth.users` runs converged on those five tables for `client@patina.dev` and all six
seeded homeowners.

This is the one design decision in lane D that deserves a second opinion, because it deliberately
steps around an immutability guard. The judgment made: an erasure request outranks edition
immutability, and the designer's document survives — only the person is detached from it.

**Three things the fix round changed here, all of which Fable should still weigh:**

1. **It is a maintenance-window-shaped operation, and the banner now says so** (review M-D5).
   `ALTER TABLE … DISABLE TRIGGER` takes ACCESS EXCLUSIVE, which conflicts with ACCESS SHARE: for
   the length of one homeowner's closure, every read and write of those five tables blocks
   portal-wide for every designer. Mitigated, not removed: `SET LOCAL lock_timeout = '5s'` so the
   purge gives up instead of building a convoy behind its own lock request, and the triggers are
   disabled/restored one at a time with each one's prior `tgenabled` remembered (blanket
   `ENABLE TRIGGER USER` would downgrade an `ENABLE ALWAYS` trigger to origin-only). If Fable wants
   this run only in a window, that is a deploy-time decision, not a code one.
2. **It refuses a designer id outright** (review B-D3), and the edge function refuses a designer
   caller before anything is written. See §3.
3. **It journals what it detached** (review M-D4). `client_account_purges` — new table, service_role
   only, no RLS policies — records every unlinked id inside the purge's own transaction, and the
   edge function stamps `auth_deleted_at` only after the auth user is really gone. This is the only
   record of an interrupted closure: the purge and the auth delete are two round trips and cannot be
   one, because the delete goes through GoTrue's admin API.

**(c) ⚠ RULING OWED — an erasure destroys the designer's decision record, not just the link to it.**
The banner argues "the designer's document survives, with the person detached from it". That holds
for proposals, projects and invoices. It does **not** hold for decisions:
`client_decisions.designer_client_id` cascades from `designer_clients`, and the roster row is
client-owned and goes with the account — so the decision and its `client_decision_options` are
deleted outright. `account_purge_test.sql` now asserts that as the shipped behaviour rather than
leaving it in a comment. Two options if Fable wants the decision preserved: null out
`designer_clients.client_id` instead of letting the roster row cascade, or add a `designer_client_id`
detach ahead of the cascade. Both are a change to what "everything the client owns cascades" means,
which is why lane D did not choose one.

---

## 7. Facts worth carrying forward (no action)

- **The client-portal feed route is NOT a `get_recommendations` caller.** Critique M6 counts it among
  four; `apps/client-portal/src/app/api/feed/[roomId]/route.ts` reads `products` directly and names
  the RPC only in a comment explaining that its own tier derivation mirrors it. That comment is still
  true after 00533. The three real callers (the pgTAP contract test, `database.types.ts`, the
  generated ACL seed) are all updated in this branch.
- **`leads.status` has no CHECK constraint.** Live values on a seeded stack are
  `new`, `viewed`, `contacted`, `accepted`. There is no `claimed` status — `claim_design_request`
  sets `designer_id` and leaves the status alone. 00536's lead predicate is therefore
  `designer_id IS NOT NULL AND status NOT IN ('declined','expired')`, which matches what
  `DesignRequestStage.from(designerId:status:introduction:)` treats as live client-side.
- **`designer_clients.status` vocabulary is `lead | proposal | active | completed | nurture`** — no
  `archived`. The new `client_designer_roster` view scopes to `active`, which is also the filter
  `RosterAPIClient.listRoster()` already sends.
- **Pre-existing client-portal test failures, inherited from `main`, untouched by this lane:**
  `src/lib/__tests__/portal-access.test.ts` (1 assertion — `foreignPortalFromDomain('manufacturer')`
  is expected null and is not) and `src/lib/data/__tests__/orders.test.ts` (suite cannot run:
  `Cannot find module '../orders'` — the subject file does not exist). Both files are byte-identical
  to `main` on this branch (`git diff --stat main..HEAD -- <paths>` is empty). Whole suite:
  **985 passed, 1 failed, 107 suites** after the fix round (was 983 — two cases added); lane D's own
  three suites, including `app-chrome.test.tsx`, are 26/26 green.

---

## 8. lane C · the roster read moves off the base table (fix round, review B-D2)

⚠ **One-identifier change in `Core/Network/RosterAPIClient.swift`.** The first cut of 00536 gave the
client a `FOR SELECT` policy on `designer_clients` keyed on `client_id = auth.uid()`. RLS is
row-level, and that row carries the designer's private CRM fields — `notes`, `nickname`,
`satisfaction_score`, `total_revenue`, `total_projects`, `referral_source`, `tags`,
`style_preferences`, `inspiration_quote`, `last_contacted_at`, `client_email`, `lead_id`. Any
homeowner could have issued `GET /rest/v1/designer_clients?select=*&client_id=eq.<self>` and read
what their designer wrote about them. Column GRANTs cannot fix that: designer and client are both
`authenticated`.

The policy is gone. In its place, `public.client_designer_roster` — a `security_invoker = false`
view over `designer_clients`, four columns wide (`designer_id`, `client_id`, `status`,
`created_at`), filtered on `client_id = auth.uid() AND status = 'active'` inside the view body, with
`SELECT` granted to `authenticated` and nothing granted to `anon`.

**The diff lane C applies** (everything else — select list, filters, order, decode — is unchanged,
because the view exposes exactly the columns the request already asks for):

```diff
-        let url = baseURL.appendingPathComponent("/rest/v1/designer_clients")
+        // 00536: the base table is designer-side only. The client's leg is a
+        // definer view exposing four columns and nothing of the designer's
+        // CRM row.
+        let url = baseURL.appendingPathComponent("/rest/v1/client_designer_roster")
```

The file-head comment at `RosterAPIClient.swift:8-15` ("`designer_clients` has no client-side SELECT
policy today … `.roster` is unreachable in production until a policy migration lands") is now stale
in both halves and wants rewriting: the read is reachable, and what landed is a view, not a policy.

Proof on this side: `supabase/tests/rls/designer_clients_client_read_test.sql` asserts the client
reads exactly one row through the view, reads **zero** from the base table, that the view is exactly
those four columns, that `anon` has no privilege on it and `authenticated` has no `UPDATE`.
