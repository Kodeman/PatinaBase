# W1b — Lane C integration notes

Written by lane C (identity, reach & notify), worktree `agent-dr-w1b-c`, branch `daily-return/w1b-c`.
Each entry is `file · exact diff or precise instruction · why`. The steward or the owning lane
applies these at integration; lane C did **not** edit any file it does not own, except where §4
says otherwise and explains itself.

---

## 1. Lane D — 00534's `notification_log` row contract (the seam C decodes)

**File:** `supabase/migrations/00534_*.sql` (`notify_client_attention`)
**Needed by:** lane C, `Core/Network/NotificationsAPIClient.swift` +
`Features/Notifications/Models/AppNotification.swift`

C's decoder now maps the three client-facing kinds to their own buckets instead of falling through
to `.newRecommendations` (whose default title is "New pieces for you" — an invoice arriving under
that title is exactly the C5 failure the program exists to repair).

**The one field that matters: `metadata.entity_type`.** It decides the bucket, because it is the
field 00534 guarantees and the one `NotificationRouter` already routes on. Keep it lower-case:

| `metadata.entity_type` | Bucket | Default title when `metadata.title` is absent |
|---|---|---|
| `proposal` | `.proposal` | "A proposal needs your signature" |
| `invoice` | `.invoice` | "An invoice is waiting" |
| `decision` | `.decision` | "A decision needs you" |

`notification_log.type` is only a **fallback**, for rows that carry no entity metadata. C accepts
`proposal_sent` / `proposal_reminder` / `proposal_attention`, `invoice_sent` / `invoice_due` /
`invoice_reminder` / `invoice_attention`, `decision_raised` / `decision_reminder` /
`decision_attention`. You are not constrained to that list as long as `entity_type` is present.

`proposal_sent` is not new: `00388_proposal_send_dispatch_guard.sql:1258-1278` already writes it on
the real send path (`research/33-verify-code-truth.json` F08). Please keep that spelling rather than
minting a second one for the same event.

**Also required, because `notification_log` (00041) has no first-class columns for any of it:**

- `metadata.entity_type` — lower-case `proposal` | `invoice` | `decision`
- `metadata.entity_id` — the row id `NotificationRouter` routes on
- `metadata.title` and `metadata.body` — `p_title` / `p_body` must land **inside `metadata`**.
  `AppNotification.init(from:)` reads `metadata["title"]` / `metadata["body"]`; there is no
  `title` or `body` column on the table and the app cannot invent one.
- `metadata.project_id`, and `metadata.amount_cents` / `metadata.due_date` where they apply —
  decoded as optionals, absent honestly when null.

`notification_log.type` has no CHECK (`00041:37`, plain TEXT — critique m9), so these strings are
safe to add.

### ⚠ Observed live, not hypothetical

Your rows are **already applied on the local stack**, and walking the built app against them found
two things worth your attention:

```
$ psql … -c "select type, channel, status, metadata->>'entity_type', metadata->>'entity_id' …"
decision_attention|in_app|delivered|decision|b0000000-…-00000005c301
decision_attention|push  |queued   |decision|b0000000-…-00000005c301
decision_attention|in_app|delivered|decision|b0000000-…-0000000d2c02
decision_attention|push  |queued   |decision|b0000000-…-0000000d2c02
decision_attention|in_app|delivered|decision|b0000000-…-0000000d2c03
decision_attention|push  |queued   |decision|b0000000-…-0000000d2c03
(6 rows)
```

1. **The `type` you write is `decision_attention`**, which was in none of the tables above. The
   client no longer depends on that guess: `metadata.entity_type` decides the bucket and the `type`
   string is only a fallback (the `*_attention` spellings are now in the table too). **Nothing is
   asked of you here** — this is recorded so the seam is documented rather than rediscovered.
2. **Both rows reach the client feed.** The feed filters `channel in (in_app,push)` and
   `status in (queued,sending,delivered,unconfirmed,opened,clicked)`, so the `push`/`queued` twin
   passes as readily as the `in_app`/`delivered` one — three decisions printed as **six rows** in
   the bell. C now collapses on `entity_type|entity_id` and one event draws one row. If you would
   rather the client not see the push leg at all, the cleaner fix is server-side (a channel or
   status the feed filter excludes) and C will drop the collapse; as it stands both halves are
   defensive and the result is correct either way.

## 2. Lane D — the `delete-account` edge function C now calls

**File:** `supabase/functions/delete-account/**`, `supabase/config.toml`
**Needed by:** lane C, `Features/Account/AccountDeletionService.swift`

C repointed `APIConfiguration.Endpoint.deleteAccount` from `/rest/v1/rpc/delete_user_account` (an
RPC that exists in no migration — critique B5) to **`POST /functions/v1/delete-account`**.

What the client sends: `Authorization: Bearer <caller JWT>`, `apikey: <anon>`, `Content-Type:
application/json`, **empty body**. There is deliberately no user id in the request — the function
must derive the caller from the JWT so this can never be aimed at another account.

What the client needs back: any 2xx on success. The body is never rendered; on any non-2xx the app
prints its own sentence ("We couldn't close your account just now. Try again, or write to
hello@patina.cloud."). **Verified on the walk:** `curl -X POST http://127.0.0.1:54321/functions/v1/delete-account`
returns **404** (the function is authored in your worktree but not served locally), and the app
renders exactly that sentence in place — no vendor text, no crash, and the account is untouched.
Shot `shots/w1b-c-10-delete-failure-patina-voice.png`.

## 3. Lane D — AASA + the piece route the share now points at

**Files:** `apps/client-portal/src/app/.well-known/apple-app-site-association/route.ts`,
`apps/client-portal/src/app/piece/[id]/page.tsx`

C now shares `https://client.patina.cloud/piece/<id>` and the app claims
`applinks:client.patina.cloud` in `Patina.entitlements`. For the link to open the app rather than
Safari, the AASA `details` entry must be **`VP22LXHT7L.cloud.patina.app`** (verified:
`PRODUCT_BUNDLE_IDENTIFIER = cloud.patina.app`, `DEVELOPMENT_TEAM = VP22LXHT7L`,
`Patina.xcodeproj/project.pbxproj:530,413`) with paths covering `/piece/*`, `/invoice/*`,
`/proposal/*`, `/decision/*` — the four paths `DeepLinkHandler.route(forUniversalLink:)` parses.
The existing entry (`VP22LXHT7L.cloud.patina.field`, `/field/sr_*`) stays.

This is device-gated work: iOS caches AASA and the entitlement does nothing until client-portal is
deployed. C claims compile-green + sim-verified for the URL and the parser only.

## 4. Files C touched that the steward's map does not assign

**`apps/mobile/Patina/Patina/Services/DesignServices/DesignRequestCoordinator.swift`** — one line.

`steward.md` §6 assigns `Features/DesignServices/**` to C but names no owner for
`Services/DesignServices/**`; no other lane's row lists it either (A owns `Services/Auth/`, B owns
`Services/API/{Proposals,Invoices}` + `Services/Badges/`). The change is squarely inside SP-08,
which is C's plank, and leaving it out would either break the build or leave the permission ask in
the room Q7 moved it out of. Recorded here so the steward sees it rather than discovers it:

```diff
@@ DesignRequestCoordinator.swift — inside submit(), after recordSubmittedRequest
-            // Push (W3-push): the authorization "moment" — first successful
-            // design-request submission ever. Internally guarded to fire
-            // the system prompt at most once per install; a no-op on every
-            // later submission.
-            PushTokenService.shared.promptForAuthorizationAfterFirstSubmission()
-
```

Why: Q7 — "SP-08's sentence, verbatim, before the first money event… The current post-design-request
ask is removed." The ask is **moved**, not deleted: `PushPrimerView` now carries it, gated on the
same once-per-install UserDefaults key (`patina.push.hasPromptedAfterFirstSubmission`), so an
install that was already asked is never asked again. Critique M19 warned about a wave-long gap
between removal and replacement; there is none — both land in this commit.

## 5. Cross-lane items the steward's §6.6 listed that turned out to need **no** change

- **SP-03 share subject/message, `ProductDetailView.swift:117-121` (lane A).** No edit needed. The
  share message is already `"{name} by {maker} on Patina"` and the subject is the piece name; the
  sheet read "Patina Designer Portal" because iOS renders the *link target's* Open Graph title, and
  the link is built by `PatinaDeepLinks.productURL`, which lives in **C's**
  `Features/Shared/PatinaPortalLinks.swift`. Repointing it there fixes all three share surfaces
  (`ProductDetailView:283`, `RecommendationsView:319`, `CollectionsView:285`) with no A edit.
  `productURL(forProductId:)` is kept as a delegate to the new `piece(_:)` for exactly that reason.
- **SP-08 bell empty state falling back to the Studio queue (lane B).** No edit needed. C reads
  `BadgeCountService.shared`'s retained rows and calls `StudioQueueBuilder.build(_:)` — both already
  public to the target after W1a — so the bell prints the Studio's own computation without B's files
  changing.

## 6. For the walker / W2

- `Features/Rooms/Components/SpatialMetadataRow.swift` was carved out to C for "SP-19's 44 pt hit
  area" (steward §6.5). On reading it, **the file has no interactive control at all** — the cited
  `:46-50` is the metres→feet conversion, which F40/F97 verify as *correct*. There is no target to
  raise, so the file is untouched. Reporting it rather than inventing a change.
- The status-bar overprint (F114) is a systemic missing top inset on every screen whose header
  starts at a hand-tuned `.padding(.top, 56)`. C fixed nothing there beyond its own screens because
  the money screens are B's; if B's half lands only inside Proposal/Invoice/Decision, the same
  defect still stands on `NotificationFeedView`, `SettingsView` and `ProfileView`. Worth a W2 line.
