# A3 — Production readiness (Strata) for the first TestFlight round

Lane A3 · area `prod-readiness` · 2026-09-01 · READ-ONLY (SELECT-only SQL, GET/POST probes, no writes)
Project: Strata `bkvcixdmuyejfzcijpdg` · app `cloud.patina.app` (apps/mobile/Patina)

All claims below are **server-verified** (live SQL against Strata + live HTTPS probes with the anon key
compiled into the app) or **code-read**. Nothing here is device- or simulator-verified.

---

## Headline

**A first-round tester meets an empty marketplace.** `get_recommendations` returns *zero rows* on
production for every caller the app can be — guest or signed-in — and this is provable three ways
over (below). Every product surface in the app (Daily Room feed, "New this week", room-aware picks,
browse) is fed by that one RPC. On top of that, **account deletion 404s** (App Store 5.1.1(v)),
**"Continue with Google" — the first button on the welcome screen — is a disabled provider**, and
**all 24 production `profiles` rows, with emails and Stripe customer ids, are readable by the anon
key that ships inside the binary.**

The root cause of most of the missing-server-object findings is one fact: **migrations 00533–00540
were never applied to Strata.** Those eight migrations *are* the iOS "Daily Return" server contract.

---

## The evidence chain for the empty catalogue (A3-01)

```
select count(*), count(*) filter (where layer='catalog' and status='published') from public.products;
→ 15 total, 1 catalog+published
```

The one row:

| field | value |
|---|---|
| id | `a7fa2107-8d2e-4131-8b8f-f5dd9826fdac` |
| name | **`Smoke Test Ceramic Lamp`** |
| description | **`seed:stripe-smoke-2026-07-08`** |
| images | `[]` |
| vendor_id / brand | NULL / NULL |
| published_at / quality_score | NULL / NULL |
| price_retail | 2000 (= $20) |

`get_aesthete_matches` (the engine behind `get_recommendations`) forces `v_layer := 'catalog'` for any
caller with `auth.uid() IS NULL`, and `get_recommendations` never passes `p_layer`, so it defaults to
`'catalog'` for signed-in callers too. Stage 0 filter: `p.layer='catalog' AND p.status='published'`.
So the candidate universe is that one row **for every tester, guest or signed-in**.

Then it returns **zero**, for a compounding reason:

1. The anon/signal-less caller resolves to the shared neutral profile
   `ae460000-0000-4000-8000-00000000e057`. Verified: `style_vector IS NULL`, all spectrum dims NULL,
   `confidence 0.2`. → `v_query` is NULL → the ANN candidate insert is skipped entirely.
2. Fallback "spectrum-only" candidate generation requires `b.pspec IS NOT NULL`. Verified:
   `select (select ps.spectrums from _aesthete_product_spectrum(p.id) ps) from products p where
   p.layer='catalog' and p.status='published'` → **`null`**. → `_ae_cand` is empty → zero rows out.
3. **Even if a row did come back**, the app drops it. `ProductAPIClient.withholdingUnresolvedMakers`
   filters on `hasResolvableMaker`; the RPC's `RETURNS TABLE` has no `brand` column, and
   `maker_name` is `COALESCE(v.name,'Unknown Maker')` = the literal `Unknown Maker`, which
   `Product.resolvedMakerName` explicitly rejects. `ProductModel.swift:222-231`.

Anon-visible product count over PostgREST (`Prefer: count=exact`): `content-range: 0-0/1`.

The other 14 rows are `layer='personal'` Chrome-extension captures owned by Kody — invisible to any
other account by RLS. Their names include `new talble` and `Find a piece—or ask about one.` (a UI
string captured as a product), and their images hot-link to `images.hermanmiller.group` and
`www.masayaco.com` (all three curled: HTTP 200, image/jpeg, 100–442 KB).

---

## Migration ledger gap (A3-03)

`supabase_migrations.schema_migrations` on Strata jumps **00532 → 00541**. Repo has all of
00533–00540. Everything below is a consequence:

| Missing migration | Objects the app calls that do not exist on Strata | Probe |
|---|---|---|
| 00533 piece_detail_contract | `products.photo_verified_at`, `products.shipping_flat_cents`; the widened `get_recommendations` projection (brand, dimensions, lead time, description) | `information_schema.columns` — absent |
| 00534 client_attention_notifications | `notify_client_attention()`, `sync_proposal_send_in_app_log()`, `notify_client_decision_raised()` + its trigger | `pg_proc` count 0 |
| 00536 client_side_server_gaps | **view `public.client_designer_roster`** (read by `Core/Network/RosterAPIClient.swift:40`), `purge_client_account()`, `client_account_purges`, `mark_client_account_purge_complete()` | REST → `PGRST205 Could not find the table 'public.client_designer_roster'` |
| 00538/00539 | **table `public.profile_presence`** (written by `Services/Auth/ProfileService.swift:152`) | REST → `PGRST205` |
| 00540 direct_orders_attribution | **`get_direct_order_terms()`** (called `Core/Network/DirectOrdersAPIClient.swift:56`); the attribution-aware `create_direct_order`; **`fulfillment_orders/_order_items/_shipments` client SELECT policies** | `pg_proc` count 0; `pg_policies` shows only `*_select_admin` + `*_select_agent_reader` |

Separately, **`increment_scan_upload_attempt`** (called `Services/Sync/RoomScanSyncService+AdvancedBundle.swift:649`)
does not exist in *any* form on Strata (`pg_proc` count 0) and is not in a pending migration either.

Every one of these reaches the app as PostgREST `PGRST202/PGRST205` — a 404 with a raw server body.

---

## Edge functions

Grepped the app for `functions/v1/` → 4 slugs. Probed each with the shipped anon key:

| slug | prod status | note |
|---|---|---|
| `delete-account` | **404 `{"code":"NOT_FOUND","message":"Requested function was not found"}`** | exists at `supabase/functions/delete-account/` in the repo — never deployed |
| `companion-context` | 401 `Invalid or expired token` (correct — verify_jwt) | ACTIVE |
| `companion-message` | 401 (correct) | ACTIVE |
| `companion-history` | 401 (correct) | ACTIVE |
| `apns-send` (server-side) | 403 `service_role_required` (correct) | ACTIVE, v20 |
| `test-account-login` | 403 `invalid_credentials` (correct fail-closed) | ACTIVE, v1 |

RPCs grepped from the app and their prod state:

| RPC | exists | anon EXEC | authenticated EXEC |
|---|---|---|---|
| `get_recommendations(uuid,text,int,int)` | ✓ | ✓ | ✓ |
| `process_style_quiz(jsonb,jsonb)` | ✓ | ✓ | ✓ |
| `resolve_studio_identity` | ✓ | ✓ | ✓ |
| `mark_scan_upload_complete`, `merge_scan_artifact_sha256` | ✓ | ✓ | ✓ |
| `submit_design_request`, `client_pick`, `sign_proposal`(×3 overloads), `apply_client_decision`, `mark_client_decision_viewed`, `get_client_project_selections`, `create_direct_order`, `list_client_proposals`, `get_client_proposal_bundle` | ✓ | ✗ | ✓ |
| `search_products` | ✓ | ✗ | ✓ (endpoint declared in `APIConfiguration` but never called — dead) |
| **`get_direct_order_terms`** | **✗** | — | — |
| **`increment_scan_upload_attempt`** | **✗** | — | — |

---

## Auth (b)

`GET /auth/v1/settings` (live):

```
external: { apple: true, email: true, google: false, azure: false, facebook: false, phone: false, ... }
disable_signup: false
mailer_autoconfirm: false      ← email confirmation IS required for the password path
anonymous_users: false
```

`auth.identities` by provider: **email 23, apple 1** (no google identity has ever existed).

- **`AuthScreenView.swift:82` renders "Continue with Google" as the first button.** GoTrue answers
  `400 validation_failed — "Unsupported provider: provider is not enabled"`.
  `AuthService.signInWithGoogle` catches, filters only `ASWebAuthenticationSessionError.canceledLogin`,
  and otherwise sets `errorMessage = error.localizedDescription` → a raw server string on the
  welcome screen.
- **Apple works**: `GET /auth/v1/authorize?provider=apple` → `302` to
  `appleid.apple.com/auth/authorize?client_id=cloud.patina.app` — provider configured with the right
  service id.
- **Email-code path works**: `mailer_autoconfirm:false` but `sendMagicLink` uses
  `signInWithOTP(shouldCreateUser:true)` — entering the code *is* the confirmation, so no separate
  confirm round-trip. The Strata magic-link template was patched 2026-07-12 to include `{{ .Token }}`
  with `mailer_otp_length = 6` (memory `project_strata_auth_otp_template_fix`; templates live only in
  the dashboard/management API, nothing in-repo tracks them — **UNVERIFIED this session**, cannot be
  read over SQL). The `confirmation` template is still link-only, which only matters if the password
  sign-up path is ever reachable.
- **`tester@patina.cloud`**: `86cdd0aa-403c-4154-ae63-69105425e506`, created 2026-09-01 14:07:35Z,
  `email_confirmed_at` 15:25:04Z, `last_sign_in_at` 20:09:19Z, not banned, provider `email`.
  `profiles.role = **designer**`, `full_name` NULL, 0 rooms / 0 saved / 0 projects / 0 designer links,
  `help_state = {"tours":{"desk-walkthrough":{"atStep":0,"abandoned":true}}}`.
- **The `000000` code will not work in the iOS app.** `test-account-login` mints a GoTrue
  `hashed_token` that a *caller* must redeem — the designer portal does this in
  `apps/designer-portal/src/app/auth/test-account-fallback.ts`. The iOS app has **no reference to
  `test-account-login`** (grep across all Swift: only hit is the `TextField("000000", …)` placeholder
  at `AuthenticationView.swift:326`). `AuthService.verifyOtp` calls `supabase.auth.verifyOTP` straight
  at GoTrue, which has no such OTP on file. A tester handed "tester@patina.cloud / 000000" for the
  app will fail and needs mailbox access.
- **`handle_new_user` defaults `profiles.role` to `'designer'`** and only honours the literal
  `'homeowner'` from signup metadata. `sendMagicLink` and `signUp` both pass `role: "homeowner"`;
  **`signInWithApple` passes none** → an Apple tester lands as a designer. (The
  `provision_studio_on_designer` trigger keys on `is_designer IS TRUE`, not `role`, so no studio is
  auto-created — the damage is the wrong row, not a phantom studio.) Prod `profiles.role` spread:
  `client 11 · designer 8 · homeowner 4 · super_admin 1` — three words for the same person.

---

## Anon-readability sweep (the key ships in the binary)

Every table the app touches, probed as anon over PostgREST:

| table | anon | rows anon can see |
|---|---|---|
| **profiles** | **200** | **24/24 — email, stripe_customer_id, phone, city/state/zip, availability** |
| **notification_preferences** | **200** | 1/1 |
| products | 200 | 1 |
| editorial_stories | 200 | 3 |
| **vendors** | 200 | 4 — incl. internal notes `"trade is good so are the tunes"`, `"terms are fine"` |
| rooms, saved_items, interactions, leads, user_settings, user_roles, notification_log, comms_*, invoices, projects, project_*, room_scan*, room_features, direct_orders, client_decision* | 200 | 0 (RLS holds) |
| device_push_tokens, fulfillment_orders/_order_items/_shipments | 401 `42501` | — (grant-denied, correct) |
| **profile_presence**, **client_designer_roster** | 404 `PGRST205` | do not exist |

The two live exposures, quoted from `pg_policies`:

```
profiles | "Profiles are viewable by everyone" | roles {public} | SELECT | qual: true
notification_preferences | "Service role full access to notification preferences"
                         | roles {public} | cmd ALL | qual: (auth.uid() IS NULL)
```

`notification_preferences` is worse than a read: `has_table_privilege('anon', …)` is **true for
SELECT, INSERT, UPDATE *and* DELETE**, and the policy above grants ALL to exactly the anon case. I did
not exercise the write (read-only lane) — the grant + policy pair is the evidence.

---

## Push / widget / links (d)

- `apns-send` ACTIVE v20; picks `api.push.apple.com` vs `api.sandbox.push.apple.com` **per token**
  from `device_push_tokens.environment`, and `PushTokenService` derives that from the embedded
  `.mobileprovision` rather than `#if DEBUG` — so the `aps-environment: development` literal in
  `Patina/Patina.entitlements` does not by itself break TestFlight push.
- Its secrets are **edge-function env** (`APNS_AUTH_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC`),
  not Vault — I cannot see them. `vault.secrets` names on Strata are only:
  `app.settings.service_role_key`, `app.settings.supabase_url`, `app.settings.test_login_accounts`,
  `app.settings.test_login_code`. **APNs credential presence is UNVERIFIED.**
- AASA at `https://client.patina.cloud/.well-known/apple-app-site-association` is live and publishes
  `VP22LXHT7L.cloud.patina.app` for `/piece/*`, `/invoices/*`, `/proposals/*`, `/decisions/*`.
  `DeepLinkHandler.route(forUniversalLink:)` handles exactly `piece|pieces`, `invoices|invoice`,
  `proposals|proposal`, `decisions|decision` on `PatinaDeepLinks.clientHost`. **Match — no gap.**
  `https://app.patina.cloud/.well-known/apple-app-site-association` → 307 (designer portal, not
  claimed by this app — correct).
- But `tester@patina.cloud`'s four `notification_log` rows are all designer-portal content and one
  carries `deep_link: "https://app.patina.cloud/help"` — a host the app does **not** claim, so it
  opens Safari.

---

## Help / tour content (e) — Sanity `kv3qrinl` / `production`

246 `helpContent` documents, all published (no drafts). **16 of the app's 36 `ios-app/*` surface keys
have a document.** Present: `first-launch-tour/step-1..3`, `home` + 6 children, `product-detail` + 5
children. **Missing (20)**: `ios-app/first-launch-tour` (root), all 4 `ios-app/companion/*`, all 5
`ios-app/profile*`, all 5 `ios-app/qr-auth*`, all 5 `ios-app/rooms*`.

**The W3 tour copy was never published.** All three tour documents last `_updatedAt`
`2026-07-28T19:44:27Z`, and step 1 still reads:

> **Welcome to Patina** — "This is your Daily Room — picks and stories chosen for your space."

`artifacts/ios-daily-return-2026-08-26/waves/w3/n3-sanity-copy.md` specifies the replacement
("This is Today — what moved in your house, and what is waiting on you.") and states the rule:
`FirstLaunchTour.swift` renders `loaded?.body ?? step.fallback?.body` — **Sanity wins over the
binary fallback**. Step 2 still reads "Add pieces to a room with + Add" and its anchor (the `+ Add`
capsule on `DailyProductCard`) was retired in W2, so that step has not rendered at all since W2.
Step 3 still says "Your profile / Rooms, saved pieces, and settings live here" instead of "Your Studio".

Also: every iOS document is `persona: "all"`; the app's `Persona` enum is
`designer|maker|consumer|admin` and the primary GROQ is `persona == $p` — resolution depends entirely
on the fallback chain reaching the persona-less step. Not verified live in-app (lane C4/help).

---

## Advisors (f)

**Security — 1,207 lints.** App-relevant:
- 21 × `ERROR security_definer_view` (incl. `rooms_with_hero_frames`, `room_scans_v2`,
  `client_order_status_v`, `v_aesthete_*`, `open_design_requests`).
- 1 × `ERROR rls_disabled_in_public` — `public._comms_backfill_legacy_map`.
- 21 × `INFO rls_enabled_no_policy` (`qr_auth_sessions`, `qr_auth_rate_limits`,
  `media_upload_intents`, `device_pair_sessions`, `stripe_webhook_events`, `test_login_attempts`, …)
  — RLS on with no policy denies all, which is the intended fail-closed shape for most of these.
- 78 × `anon_security_definer_function_executable` — includes `get_recommendations`,
  `get_aesthete_matches`, `process_style_quiz`, `handle_new_user`, `invoke_edge_function`,
  `share_room_scan`, `revoke_room_scan_access`, `rpc_start_direct_thread`, `notify_*`.
- 1 × `auth_leaked_password_protection` disabled.
- 630 × `pg_graphql_*_table_exposed` (270 to anon) — the GraphQL surface mirrors the same tables.

The two real client-facing holes (`profiles`, `notification_preferences`) are the RLS-policy findings
above, not advisor rows — the advisor does not flag a `qual: true` SELECT policy.

**Performance — 2,342 lints.** Nothing tester-visible at 15 products / 24 profiles:
441 `auth_rls_initplan` (unwrapped `auth.uid()` re-evaluated per row — hits *every* table the app
reads: products ×10, saved_items ×5, projects ×5, invoices ×5, notification_preferences ×5,
profiles ×4, comms_* ×8), 1,147 `multiple_permissive_policies` (projects 46, notification_preferences
45, profiles 30), 334 unindexed FKs, 418 unused indexes.

---

## What a *new* tester's world contains, server-side (g)

Measured against `tester@patina.cloud` (a genuinely empty account):

| module | server content for a new account on prod |
|---|---|
| Today / Daily Room — story card | **3 editorial rows**, all published, all `hero_image_url NULL` (gradient placeholder only), `read_minutes` 3–5 on bodies of **386 / 387 / 489 characters** |
| Today — picks / New this week / browse / room feed | **empty** (A3-01) |
| Rooms / Spaces | 0 rooms, 0 scans |
| Saved / Record | 0 saved_items |
| Studio / designer | 0 `designer_clients` rows; `client_designer_roster` view **does not exist** → 404, not empty |
| Projects / proposals / invoices / decisions | 0 each (RLS-correct empties) |
| Notifications | **4 rows — all designer-portal content**: "Welcome. Replay the walkthrough anytime from the Help shelf." (`deep_link https://app.patina.cloud/help`), "Your desk is ready" (Designer Onboarding sequence), ×2 `workspace_invite` |
| Messaging | 0 threads |
| Purchase | `get_direct_order_terms` **missing** → terms `.unknown` → path off; and only **1** product is `patina_managed`, **0** vendors are `is_patina_catalog`, so `create_direct_order`'s buyability gate can pass for at most one row |
| Companion | correctly gated on `isAuthenticated` (`CompanionService.swift:183,221`); functions ACTIVE |
| Order tracking | `fulfillment_*` readable only by admins → a real order would show nothing |

---

## Payload weight

`GET /rest/v1/products?select=*,vendors!products_vendor_id_fkey(...)` — the app's
`ProductAPIClient.productSelect`, used by the single-piece fetch and by `fetchProducts(ids:)` for the
whole saved Record — returns **20,706 bytes for one row**, of which `embedding` is 9,459 chars (45%)
and `aesthete_vector` 9,462 chars (45%). Neither is in `RawProductWithVendor`. 30 saved pieces ≈ 620 KB
of pure waste on cellular.

---

## What is GOOD

- AASA ↔ `DeepLinkHandler` routes match exactly, including the singular aliases.
- `apns-send` picking the APNs host per-token from a recorded environment, and `PushTokenService`
  deriving that from the embedded profile rather than `#if DEBUG` — a trap consciously avoided.
- `handle_new_user` refuses arbitrary role metadata (only `'homeowner'` honoured) — no self-elevation.
- Product decoding is genuinely defensive: `FailableDecodable` drops one bad row instead of the array;
  `ProductCategory(normalizing:)` handles the `chair`/`sofa` vocabulary drift (prod really does carry
  `chair`); optional spec columns are omitted rather than placeholdered.
- The `withholdingUnresolvedMakers` rule — refusing to print `Unknown Maker` on a provenance
  marketplace — is the right call; it just has nothing left to show today.
- `test-account-login` is a careful piece of work: fail-closed on missing config, identical 403 on
  every failure path, rate limits checked before any write, constant-time compare.
- The Companion is properly gated; `device_push_tokens` and `fulfillment_*` are grant-denied to anon.
- Deletion is designed correctly client-side (own JWT only, no id in body, local store wiped, one
  human sentence on failure) — the function just isn't deployed.

## Not verified

- **APNs credentials** (`APNS_AUTH_KEY`/`KEY_ID`/`TEAM_ID`/`TOPIC`) — edge-function env, not readable
  from SQL or the Vault list.
- **GoTrue mail templates / Site URL / `uri_allow_list`** — dashboard/management-API only; the
  `{{ .Token }}` patch is asserted from memory (2026-07-12), not re-checked this session.
- **Live `get_recommendations` response** — calling it writes a `match_events` row (and can insert a
  `client_style_profiles` row), so I derived the result from the function bodies + the underlying data
  instead. The three-step chain above is deterministic.
- **Whether anon can actually write `notification_preferences`** — grant + policy prove the hole;
  exercising it would be a production write.
- **App Store Connect state** (App ID capabilities, encryption declaration, privacy manifest) — out of
  this lane's read scope.
- **How each of these failures looks on screen** — no simulator work in this lane; lane C4 owns the
  empty/error-state rendering.
