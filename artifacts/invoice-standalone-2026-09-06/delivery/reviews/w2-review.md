# W2 · The page, additive — adversarial review

Reviewer: separate context, read-only. Did not write W2 and had not seen it before this pass.
Branch `invoice-standalone/w2` @ `5eb037966`, 3 commits over `main`, 27 files under `apps/client-portal/`.
Every finding is reported; no severity filter applied.

---

## 1 · Verdict

The page itself is the best-executed surface in this program so far: the copy is a near-verbatim
reproduction of `mockup/invoice.html`, every figure runs through `@patina/shared` with zero local
arithmetic, the `server-only` boundary holds, the return hop's 303 is a strict four-key allowlist
over a regex-validated token (materially safer than §4.6 asked for), and the Jest suites are
substantive rather than decorative — 129 suites / 1916 tests green, `type-check` clean. But the
Playwright spec was **written and never run**, and it cannot pass: three of its six tests build
fixtures that violate constraints in the migrations they run against — `void_invoice` refuses an
invoice with collected payments, `set_invoice_studio_id()` refuses a houseless invoice with no
`studio_id`, and the `invoice_checkout_attempts` insert omits four NOT NULL columns. The third of
those is the only test that exercises `/pay/return/[nonce]`, which is also the one route that
abandons its designed RPC for a hand-rolled PostgREST embed behind a 20-line structural cast — so
the single path every Stripe return travels has no working proof anywhere in this wave.

**Recommendation: do not merge W2 until T-1, T-2, T-3 and S-1/I-2/I-3 are fixed and the e2e is
actually run green against a local stack carrying 00574.** Everything else is correctable in
review; nothing found is a security defect on the public page.

---

## 2 · Gate outputs I ran

```
$ pnpm --dir .codex/worktrees/agent-inv-w2 --filter @patina/client-portal type-check
> @patina/client-portal@0.1.0 type-check
> tsc --noEmit
EXIT=0
```

```
$ pnpm --dir .codex/worktrees/agent-inv-w2 --filter @patina/client-portal test
Test Suites: 129 passed, 129 total
Tests:       1916 passed, 1916 total
Snapshots:   0 total
Time:        11.989 s
Ran all test suites.
EXIT=0
```

Not run: `test:e2e … tests/pay-link.spec.ts` — it needs a local stack carrying W1's 00574
(`ensure_invoice_link`, the mint trigger, `return_nonce`), which does not exist yet. Findings
T-1…T-4 are static analysis of the spec against the migrations it will execute.

Also run: the wrangler `ratelimits` schema check (`node_modules/wrangler/config-schema.json`), and
a direct execution probe of `carriesForbiddenKey` against nested payloads at depth 3.

---

## 3 · Findings

| id | sev | conf | where | finding | fix |
|---|---|---|---|---|---|
| **T-1** | blocker | high | `apps/client-portal/tests/pay-link.spec.ts:283-297` · `supabase/migrations/00397_*.sql:1291-1293` | The void→withdrawn e2e cannot pass. `_void_invoice_authorized_legacy_00397` raises `void_invoice: invoice % has collected payments and cannot be voided` when `amount_paid_cents <> 0`, and `mintInvoice()` deliberately lands a `$7,605.00` succeeded payment (`:139-146`) before every test. `expect(voidErr).toBeNull()` fails. The contradiction is not repairable by deleting the payment either: without it, test 1's `expect(state.balance_cents).toBe(912_500)` and the whole `$9,130.00 / $9,398.75 / $9,125.00` fixture collapse to the full `$16,730.00`. | Give the void test its **own** mint with no payment (`mintInvoice({ paid: false })`), or drive it through the settling path instead. Do not share `mintInvoice()` between a fixture that needs money on the invoice and one that needs none. |
| **T-2** | blocker | high | `pay-link.spec.ts:85-104` (`houseless: true`) · `00571_*.sql:118-124` | The houseless insert sets `project_id: null` and no `studio_id`. `set_invoice_studio_id()`'s `IF NEW.project_id IS NULL` arm raises `studio_id_not_designer_studio` when `studio_id IS NULL OR designer_id IS NULL OR client_id IS NULL`. The studio-invoice test dies on the INSERT, before any page is opened. (`chk_invoices_anchor` at `00571:54-58` would reject it too.) | Resolve the designer's studio first and pass `studio_id` explicitly on the insert, exactly as the studio-invoice program's own SQL fixtures do. |
| **T-3** | blocker | high | `pay-link.spec.ts:305-325` · `00397_*.sql:31-56` | The return-hop test inserts an `invoice_checkout_attempts` row carrying only `invoice_id, state, payment_method, return_nonce, invoice_link_id`. Four NOT NULL columns are missing — `stripe_customer_id`, `amount_cents` (`CHECK > 0`), `currency`, `stripe_idempotency_key` (NOT NULL UNIQUE) — **and** `chk_invoice_checkout_session_state` requires `stripe_checkout_session_id IS NOT NULL` for `state = 'session_created'`. Five violations; the insert throws. This is the only test in the repo that exercises `/pay/return/[nonce]` end to end, i.e. the one that would have caught S-1. | Mint the attempt through `claim_invoice_link_checkout_attempt` (W1's own RPC) rather than a raw insert, or supply all five columns. |
| **S-1** | major | high | `src/app/pay/return/[nonce]/route.ts:54-90` | The route abandons §2.6's `resolve_invoice_return_nonce` RPC for a hand-rolled `.from('invoice_checkout_attempts').select('invoice_links!inner(token,status)')` behind a 20-line structural `as unknown as {…}` cast. The cast asserts `invoice_links` is an **object**; PostgREST returns an object for this many-to-one embed, but nothing in the code, the types or a passing test proves it. If it ever comes back as an array (a relationship-inference change, an added second FK, a supabase-js typing shift), `data.invoice_links?.token` is `undefined` and **every return from Stripe — both rails — silently 303s to `/pay/dead`.** The unit test mocks the chain and therefore asserts the mocked shape, not the real one; the e2e that would catch it is T-3. | Call `resolve_invoice_return_nonce(p_nonce)` as §2.6/§4.6 specify. It is one `rpc()` with a `text` return, it removes the cast entirely, and it puts the "active link only" rule in one place instead of two. |
| **S-4** | major | medium | `src/app/pay/[token]/checkout/route.ts:66-78` | The route **sends** `Origin: process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin`. §4.1 designed the Worker's server-side hop as the *Origin-absent* branch precisely so it could not be broken by a value mismatch; S3's strict form then makes any non-matching Origin a hard 403. Guest checkout now depends on `NEXT_PUBLIC_APP_URL` byte-matching the edge function's `CLIENT_PORTAL_URL` secret in all three environments. Prod is `https://client.patina.cloud` (`wrangler.jsonc:26`); staging is `https://patina-client-portal-staging.kody-be3.workers.dev` (`:59`); local dev is `http://localhost:3002`. Any drift — a trailing slash, an unset staging secret — turns every guest checkout into a 403 with a generic "Unable to open the payment page just now." | Omit the `Origin` header. If it is kept, add it to the §12 step-4 checklist as a value that must be proven equal in each environment before the smoke. |
| **I-2** | major | high | `return/[nonce]/route.ts:54-77` | The second `// W1-TYPES` cast is **not** trivially removable, contrary to how it is framed. `invoice-link.ts:412`'s `"resolve_invoice_link" as never` deletes to a normal `rpc()` call in one edit; this one is a fabricated interface for a five-link builder chain, and it will keep compiling unchanged after `database.types.ts` carries the tables — silently suppressing exactly the shape error it is hiding today. | Same fix as S-1. If the direct read is kept for some reason, replace the structural cast with a `Database['public']['Tables']` type once W1 lands, and make removing it a W3 exit criterion. |
| **I-3** | major | medium | §2.6 vs `return/[nonce]/route.ts` | Consequence of S-1: `resolve_invoice_return_nonce` has **no caller anywhere in W2**, and §4.6 routes both rails through this one route — so W1 ships a dead RPC with a grant, an ACL-test registration and a signature to maintain. The two must be reconciled at merge; they cannot both be right. | Adopt the RPC (preferred), or drop it from 00574 and from the two ACL suites. Decide before W1 merges, not after. |
| **S-2** | minor | high | `src/lib/analytics/posthog.ts:83` | `HEX_BEARER_IN_URL = /\/(share\|rfq\|evidence\|plans\|pay)\/[0-9a-f]{64}/gi` matches `/pay/<token>` but **not** `/pay/return/<64-hex nonce>`. Exploitability today is low and I checked each vector: the return route is a 303 handler with no HTML and no PostHog; an HTTP redirect preserves the upstream `Referer`, so the sheet's `$referrer`/`$initial_referrer` carry `checkout.stripe.com`, not the nonce; and no anchor anywhere hrefs the return path, so autocapture cannot pick it up. But the asymmetry is a trap for the next person who adds a link or turns the hop into a page, and the nonce is a real (single-purpose, attempt-lived) credential. | `/\/(share\|rfq\|evidence\|plans\|pay)\/(?:return\/)?[0-9a-f]{64}(?![0-9a-f])/gi`, plus a case in `posthog-privacy.test.ts` — the suite currently covers `/pay/<token>` and `/pay/<token>/state` but not the return hop. |
| **S-3** | minor | medium | `posthog.ts:79-84` · `invoice-sheet.tsx:185` · `checkout-return.ts:76-84` | The Stripe Checkout **session id** rides into PostHog. On the return, `$current_url` is `/pay/[redacted]?checkout=success&session_id=cs_live_…`; `redactBearerPaths` only rewrites path bearers, and `consumeCheckoutReturn('')` strips the query in a `useEffect`, which is not ordered against PostHog's pageview capture. §9's property law is "no id of any kind". Pre-existing on the letterbox, so W2 inherits rather than introduces it — but this is the first surface where the id is a *guest's* payment session. | Delete the six `TILL_PARAMS` inside `redactBearerPaths` as well as the path bearers; it is the same one-function change and it fixes the letterbox at the same time. |
| **S-5** | minor | high | `invoice-link.ts:441-455` · `lib/analytics/events.ts:379-392` | S4 (ruled: "log an error **and** emit a PostHog event") is half-implemented. `reportMissingLimiter()` writes a structured `console.error` and stops; `payLinkEvents.rateLimitBindingMissing` is declared and **never called**. Grep confirms three of the nine §9 events are dead exports: `rateLimitBindingMissing`, `deadLink`, `settling` — the latter two because `DeadLink`/`SettlingSheet` are server components with no browser analytics path. | Either wire them (a tiny client `<PayLinkBeacon event="dead"/>` on the terminal sheets, and a `payLinkEvents.rateLimitBindingMissing()` from the sheet when the page reports the binding absent), or delete the three exports and record in the deck that S4's production signal is the Worker log line only. Shipping declared-but-unreachable analytics is the worse of the two. |
| **S-6** | minor | medium | `invoice-link.ts:445-455` | `reportMissingLimiter()` is called on **every** request when the binding is absent — once from `payLinkRequestAllowed`, and again in its `catch`. A typo'd binding name in production means one `console.error` per page view, per `state` poll (every 3 s during a return), and per `checkout`. The loud signal S4 wanted becomes log flooding. | Latch it: report once per isolate (`let reported = false`). |
| **M-3** | minor | medium | `invoice-sheet.tsx:318-332` | `payLinkEvents.checkIntent` and `.paymentStarted` fire **before** the POST, inside the `try`. A 409 (`invoice_checkout_in_progress`), a 403 (S-4), or a network failure still records a started payment. `paymentStarted` legitimately uses `sendBeacon` because it precedes a navigation, but `checkIntent` does not navigate and has no such excuse. | Move `checkIntent` after `response.ok`. Leave `paymentStarted` where it is and say in the deck that it counts *attempts*, not redirects. |
| **M-4** | minor | medium | `lib/threshold/checkout-return.ts:190-205` · `invoice-sheet.tsx:209, 365-373` | The `unconfirmed` state is a one-way door within a page load. Polling stops permanently at `CONFIRM_POLL_TIMEOUT_MS` (30 s) and `showChooser` stays false, so the sheet offers no act and no further reads. The module comment claims a later-settling row "still hardens into `confirmed` on the next read" — true only across a *page load*, and there is no next read. The copy ("Don't send another one until this settles") is the right instruction but never tells the reader that reloading will show the answer. It **is** recoverable by reload, because `consumeCheckoutReturn` has already cleaned `?checkout=` out of the address — so a refresh returns the chooser. | Add one sentence: "Refresh this page in a minute to check again." Or keep a slow (30 s) background poll alive after the timeout. Hiding the chooser is correct and should stay. |
| **C-1** | minor | medium | `invoice-sheet.tsx:395-399` · `mockup/invoice.html` letterhead | The mockup's letterhead second line reads **"Des Moines, Iowa · prepared by Nora Quist"**; the implementation can only render "prepared by Nora Quist", because the §3.1 `studio` object carries `{name, logo_url, website, source}` and no location. This is a payload gap, not a W2 bug — but the sheet is visibly thinner than the design it was cut from. | Either add a location field to the resolver payload in W1/W3, or amend the mockup and the deck so the shipped letterhead is the one on record. |
| **A-1** | minor | medium | `payment-method-chooser.tsx:170-176` · `invoice-sheet.tsx:441-448, 600-610, 714-721` | The focus ring is drawn only on the 15 px radio dot (`peer-focus-visible:outline-2 outline-offset-[3px]`), not on the 56 px row the dot belongs to. Keyboard users get a very small indicator on a payment control. Separately, **no local `:focus-visible` rule exists for the Pay button, the notice-dismiss button or the Print button** — all three depend on a global stylesheet outside these files. Tap targets are all fine (`min-h-[56px]` rows, `h-11 w-11` dismiss, `min-h-[50px]` act, `min-h-[44px]` print). | Move the `focus-visible` outline to the `<label>` (`has-[:focus-visible]`, or a `peer-focus-visible:` rule on the row), keeping the dot fill as the checked affordance; and confirm the three buttons inherit a visible ring from `globals.css` rather than assuming it. |
| **P-1** | minor | high | `invoice-sheet.tsx:484-492` vs `mockup/invoice.html:390` | **The ACH-processing notice prints.** The mockup lists `.notice` among the print-hidden selectors (`.devstrip, .chooser, .act, .act-quiet, .act-done, .notice, .totals-row.fee, .totals-row.pay, .check-panel { display: none !important }`), and the implementation hides the *return* notice (`data-pay-print="hide"` at `:435`) but gives the processing notice no print flag. A sheet printed mid-ACH carries "Your bank transfer is on its way — it usually settles in 3–5 business days." into an accounting inbox, where a screen-only status sentence reads as a claim about the document. | Add `data-pay-print="hide"` to the processing notice at `:485`. |
| **P-2** | minor | high | `settling-sheet.tsx:111-113` vs `mockup/invoice.html:552-555` | The print-only colophon line is absent from `TerminalSheet`, so a printed **settling or withdrawn** sheet carries no "This sheet carries a payment link. Treat it like a check." The mockup's `.colophon` footer carries the `.print-only` span unconditionally. The omission reads as deliberate ("no live act on these sheets") but it is backwards: the browser still stamps the bearer URL into the print header on those sheets exactly as it does on the payable one, so the warning is needed there for the same reason. | Move the print-only span into `TerminalSheet`'s footer. `DeadLink` correctly stays bare — it has no letterhead and no colophon. |
| **D-1** | minor | high | `invoice-sheet.tsx:605` vs `mockup/invoice.html:26, 50, 69, 296` | The Pay button's hover is a hardcoded `hover:bg-[#1F1D1A]` where the mockup uses `var(--btn-bg-hover)`, which is `#1F1D1A` in light and **`#FFFAF0` in dark**. The literal happens to equal the light value, so this is invisible today and becomes a dark-on-dark hover on the page's only payment act the moment dark mode is exercised. This is the sole non-token colour in the three files. | Use the token. If client-portal has no `--btn-bg-hover`, define it beside `--color-charcoal` rather than inlining the light value. |
| **C-3** | minor | medium | `invoice-sheet.tsx:642-659` vs `mockup/invoice.html:318, 610-614, 827` | Line items lose their maker attribution. The mockup gives each line an optional `.line-meta` row ("Harmon Bench Works", "Harmon Bench Works, Dayton", "Prairie Coat Painting") under "What's included" — on a page whose subject is *what the homeowner is paying for*, the maker is not decoration. The §3.1 `line_items` shape has no field for it (`{description, quantity, unit_amount_cents, amount_cents, kind}`), so, like C-1, this is a payload gap rather than a W2 slip — but the record renders visibly thinner than the design it was cut from. | Add the field to the resolver in W1/W3 and render it, or amend the mockup and deck. Note `kind` is likewise parsed and never rendered (cf. I-5). |
| **A-2** | minor | medium | `payment-method-chooser.tsx:175-197` | Selecting "Mail a check" reveals the mailing-details panel with no announcement. The single `aria-live` node (correctly) says only "Total to pay $9,125.00", so a screen-reader user learns the total changed but not that an address, a payee and a memo-line instruction appeared. | Give the panel `role="region"` + `aria-live="polite"`, or extend the live sentence on the check branch only ("Total to pay $9,125.00. Mailing details below."). Do **not** add a second permanent live region — G10's single-region ruling is right. |
| **T-4** | minor | high | `pay-link.spec.ts:29-36, 40-47` | The `beforeAll` guard cannot fire. `createClient(LOCAL_URL, SERVICE_JWT)` runs at **module scope** with `SERVICE_JWT = process.env… ?? ""`, and supabase-js throws `supabaseKey is required.` during import — so an operator who forgets the export gets an opaque module-load crash instead of the carefully written "must be exported from the LOCAL stack" message. | Construct the client lazily inside `mintInvoice`, or pass `SERVICE_JWT || 'missing'` so the guard runs first. |
| **T-5** | minor | high | `src/app/pay/[token]/__tests__/invoice-sheet.test.tsx` | `grep -c unconfirmed` → **0**. Neither the `unconfirmed` sheet (the 30 s timeout copy, and the chooser staying hidden) nor the `confirmed` transition has a test. The commit message claims "every state renders: … returned-cancelled, returned-confirming, settling, withdrawn, dead" — the two return states it does not name are the two that are missing, and `unconfirmed` is the one the brief singles out as behaviourally load-bearing. | Two cases: a settled return that never confirms → after `CONFIRM_POLL_TIMEOUT_MS`, the notice text and `queryByTestId('pay-act')` null; and a settled return whose `state` poll returns `balance_cents: 0` → `paymentCompleted` fired, `Paid in full` rendered. |
| **T-6** | minor | high | `src/__tests__/middleware.test.ts:113-140` | The S11 case is titled "…with no redirect and no callbackUrl" and asserts only `expect(NextResponse.redirect).not.toHaveBeenCalled()`. It never inspects a `callbackUrl` anywhere. It passes today for the right reason, but it would keep passing if a future middleware built a `callbackUrl` without redirecting, which is exactly S11's stated failure mode ("a future reorder of the middleware would put the token into a sign-in URL"). Semi-vacuous against its own name. | Add `expect(JSON.stringify(NextResponse.redirect.mock.calls)).not.toContain('callbackUrl')` and assert the 64-hex token appears in no header of the returned response. |
| **T-7** | minor | high | `apps/client-portal/package.json:13` · `jest.config.js:71-78` | `"test": "jest"` — no `--coverage`. The 70/60/70/70 `coverageThreshold` is therefore **not enforced** by `pnpm --filter @patina/client-portal test`, the gate §11 names, and §11's claim "Coverage floors are enforced" is false for that command. Pre-existing, but W2 is the wave that cites it. | Either add a `test:coverage` script to the §11 gate list, or strike the coverage-floor sentence from the architecture. |
| **T-8** | minor | high | commit `5eb037966` body | "Playwright `tests/pay-link.spec.ts` is WRITTEN, NOT RUN." W2's §13 exit criterion includes the e2e, and its gate line is `test:e2e … pay-link.spec.ts`. With T-1…T-3, the spec will not pass when it is first run — so the wave is being handed on with an unmet exit criterion **and** a broken artifact, not merely a deferred one. | Fix T-1…T-3, then run it against a local stack carrying 00574 before W2 is called done. This is the merge gate. |
| **T-9** | nit | medium | `architecture/02-system-design.md:505` | §11's gate line omits the `export SUPABASE_SERVICE_ROLE_KEY="$(supabase status -o json \| jq -r .SERVICE_ROLE_KEY)"` the spec's own header requires. The gate as documented fails. | Fold the export into the §11 command block. |
| **I-4** | minor | high | `invoice-link.ts:271-278` | `readDiscriminator` accepts **either** `sheet` (§3.1's spelling) or `kind` (K5's spelling), "so the page does not depend on which word the migration lands". That is tolerance where a contract belongs: if W1 lands `sheet` for two sheets and `kind` for the third, the page renders and nobody notices the inconsistency until someone writes the fourth. | Pick one word, assert it in `resolve_invoice_link`'s SQL test, and make the parser reject the other. |
| **I-5** | minor | high | `invoice-link.ts:349-355` · `payment-method-chooser.tsx:72-89` | `pay.rails` is parsed, validated and **never read**. The chooser hardcodes all three rows. §3.1 says "always all three today", so this is latent — but the day a studio disables card, the page will still offer it, the guest will pick it, and `invoice-link-checkout` will answer 404 through a sentence that says "Unable to open the payment page just now." Same shape for `studio.logo_url` and `client_display_name`: parsed, never rendered. | Drive `options` from `payload.pay.rails` (a two-line filter) even while it is always three, or delete the field from the payload and the parser so nothing claims a capability the page does not have. |
| **I-6** | minor | high | `src/components/threshold/payment-method-chooser.tsx:84` | The chooser was **copied**, not moved — §6 and §14 both say "Moved, not deleted". The copy is the right call under D1 (W2 must not touch the letterbox), and I would accept it. The consequence is that `'Preferred · lowest fee'` — the string G3 ruled false, because check is $0 — stays live on the letterbox, and the only thing that removes it is W3b, whose deploy is **held** by K9 until Kody's walk. Two chooser files will also drift. | One-line string fix on the letterbox chooser in W2 or W3 (delete the `aside`), independent of W3b. A falsehood on a payment surface should not wait on a held deploy. |
| **I-7** | minor | high | `state/route.ts:48-58` vs §6 | §6 specifies `{ status, amount_paid_cents, balance_cents, payments, processing }`. The route returns `kind` in `processing`'s place and the sheet re-derives processing from `payments[].status === 'pending'` (`invoice-sheet.tsx:160-162`). G8 explicitly permitted the derivation, so the behaviour is fine — but `processing` is now server-authoritative on the SSR payload and client-derived on the poll, two definitions of one word. If the resolver ever counts `requires_refund` as processing, the sheet and the poll disagree. | Return `processing` as well as `kind` (both are free), and say in the deck which one the page trusts. |
| **S-7** | nit | high | `invoice-link.ts:104-133` | Probed directly. The parser correctly **rejects** nested `client_id`, `email`, `token`, `stripe_customer_id`, `stripe_payment_intent_id`, `payer_email` and `payerId`/`clientId`/`id` at depth 3 and inside arrays — the brief's probe passes. It **accepts** `client_email`, `emailAddress`, `payer_name`, and `stripe_*` keys that are neither listed nor `_id`-suffixed (`stripe_account`, `stripe_status`); it also walks past any container whose prototype is not `Object.prototype` (a `Map` carrying `email`), and it never inspects *values*, so a raw uuid in `studio.source` passes. Low risk — the resolver builds the jsonb server-side and the SQL assertion is the first line — but this is the defence-in-depth layer and its edges are softer than §3.1's list reads. | Add a `/^stripe_/` prefix rule and `client_email`/`payer_name`; optionally reject a bare uuid *value* anywhere. |
| **S-8** | nit | medium | `invoice-link.ts:299` | `const candidate = Array.isArray(value) ? value[0] : value;` — only the first row is checked and parsed. A multi-row response (impossible today; the RPC returns one jsonb) would drop rows *without* the forbidden-key walk ever seeing them. | `if (Array.isArray(value) && value.length !== 1) return null;` |
| **S-9** | nit | high | `wrangler.jsonc:53-58, 95-101` | Shape is **correct** — I verified it against the installed schema: `ratelimits` is a top-level `RawConfig`/`RawEnvironment` property, `namespace_id` is a `string`, `simple.period` is an enum of `[10, 60]`, and the schema's own note ("not automatically inherited … must be specified in every named environment") vindicates duplicating the block into `env.staging`. The nit: prod and staging both use `namespace_id "1001"`, so the two environments share one per-IP counter namespace. Kody's ruling reserved 1001 against *other Workers*, which this does not violate. | Give staging its own id (e.g. `1002`) so a staging probe cannot consume a prod visitor's budget. |
| **S-10** | nit | high | `middleware.ts:132` vs `app-chrome.tsx:17` | `isPayPage` requires the trailing slash (`/pay/`); `PUBLIC_PREFIXES` uses `/pay`. Bare `/pay` is therefore chrome-less but not public, and would produce `callbackUrl=/pay`. Harmless — no token, and Next 404s the route — but the two allowlists disagree about the same prefix. | Match them. |
| **M-2** | nit | medium | `invoice-sheet.tsx:289-297` | The live region sets a string, so when two methods yield an identical total the text node does not change and nothing is announced. Reachable when a studio sets `card_surcharge_bps = 0` (card and check both quote the bare balance) or on a balance small enough that the ACH formula rounds to `0`. | Append an invisible counter, or key the message on `method` as well as the figure. |
| **M-5** | nit | low | `invoice-sheet.tsx:165` | `paid = balanceCents <= 0`. A `$0.00` invoice that was never paid renders "Paid in full" with a null `paid_at` and no payments row. | `paid = balanceCents <= 0 && invoice.total_cents > 0`, or trust `status === 'paid'`. |
| **M-6** | nit | low | `invoice-sheet.tsx:242-247` | The eyebrow ranks `processing > past due > partly paid > awaiting`, so a part-paid overdue invoice reads "Past due · 22 days" and loses both the "Partly paid" word and the due-date suffix. Defensible (lateness is the louder fact) but it is a precedence decision I could not find ruled in `design/01-directions.md` §B, and the mockup's extracted copy has no combined state to compare against. | Confirm against §B, then record the ladder in a comment so it is not silently reordered. |
| **C-2** | nit | high | `page.tsx:14-18` vs mockup `<title>` | The mockup's document title is "Invoice No. 4 · Quist Interiors"; the implementation ships the static `"Invoice · Patina"`. This is a **deliberate improvement** — the title lands in browser history, window switchers and screenshots, and naming the studio and invoice number there leaks more than the URL already does. Recording it so nobody "fixes" it back. | None. Note it in the deck. |
| **A-3** | nit | low | `payment-method-chooser.tsx:126-131` | The checked row applies `-my-px border` where the unchecked applies `border-b`, so selecting a row nudges the group by 1 px. | Give both states a full 1 px border, transparent when unchecked. |
| **A-4** | nit | medium | `payment-method-chooser.tsx:193` · `invoice-sheet.tsx:651, 679, 698` | The fee notes and payment sub-lines render at 12.5 px / 11.5 px in `--color-quiet-ink`. Small text needs 4.5:1. I did not resolve the token to a hex value, so this is unverified rather than failing. | Check `--color-quiet-ink` against `--doc-paper`/`--color-off-white` at those sizes. |
| **I-1** | nit | high | `invoice-link.ts:405-420` | The first `// W1-TYPES` cast (`"resolve_invoice_link" as never`, args `as never`) **is** trivially removable — it deletes to a plain typed `rpc()` call the moment `database.types.ts` carries the function. Correctly scoped and correctly commented. | Make its removal a W3 exit criterion. (I-2 is the one that will not go quietly.) |

**Counts — 41 findings: 3 blocker · 4 major · 22 minor · 12 nit.**

---

## 4 · The ten reported deviations, ruled

| # | Deviation | Ruling | Reason |
|---|---|---|---|
| 1 | Check act lives in the sheet, not the chooser | **Accept** | Direction B's whole device is *one* act whose label moves with the choice. A second act inside the chooser would make the page argue with itself. The chooser is a chooser. |
| 2 | Tax / second Total rows rendered conditionally (`tax_cents > 0`) | **Accept** | A zero tax row on an invoice with no tax is noise, and the mockup's own extracted ladder is Subtotal → (Tax/Total) → Received → Balance. I also checked the apparent duplication — Total, Received and Balance each appearing twice in the money column — against the mockup and it is the mockup's design, not an implementation slip. |
| 3 | No studio logo | **Accept, firmly** | The mockup's letterhead is text ("Quist Interiors" over a location + designer line); there is no logo in it. Rendering an arbitrary studio-supplied image URL on a bearer page would also add a third-party request the page does not need. `studio.logo_url` should then be dropped from the payload or rendered — see I-5. What the letterhead *does* drop against the mockup is the location line (C-1), and the record drops maker attribution (C-3) — both payload gaps, not logo-related. |
| 4 | The return nonce is not redacted from PostHog | **Contest (partially)** | Correct that it is unreachable today — I traced pageview, `$referrer`, `$initial_referrer` and autocapture and none can carry it. But the fix is one non-capturing group and the asymmetry is a trap. See S-2. |
| 5 | `state` returns five keys, `kind` in place of `processing` | **Accept, with a note** | G8 explicitly permitted deriving processing from `payments[]`, and the route's tests pin the five keys. But it leaves two definitions of "processing" in the system. See I-7. |
| 6 | `unconfirmed` hides the chooser | **Accept the hiding; contest the dead end** | Hiding the act is exactly right — "don't send another one until this settles" and a live Pay button on the same screen would contradict each other. What is not right is that the page stops reading, offers no path forward, and never tells the reader that a refresh will answer the question. See M-4. |
| 7 | One file (`settling-sheet.tsx`) for dead + settling + withdrawn | **Accept** | They are one family with one `TerminalSheet` and one `Letterhead`; three files would have duplicated both. The dead sheet correctly keeps *no* letterhead, which is the only distinction that matters. |
| 8 | The middleware "ordinary public page" test moved from `/share` to `/piece` | **Accept, necessary** | S8 widened the header block to all six bearer prefixes, so `/share` is now a stamped surface and could not remain the negative control. `/piece` is the right replacement. |
| 9 | `rateLimitBindingMissing` declared but unwired | **Contest** | T4 ruled S4 as "log an error **and** emit a PostHog event". Half of that shipped, and two more §9 events (`deadLink`, `settling`) are dead alongside it. Wire them or delete them and amend the architecture — a declared, unreachable analytics event is worse than an honest omission. See S-5. |
| 10 | The e2e reads `SUPABASE_SERVICE_ROLE_KEY` from the environment | **Accept, and it is the right instinct** | The repo's pre-commit secret scan rejects any file carrying a service_role JWT, the CLI's public demo key included; `playwright.config.ts` already states this rule. The execution of it is broken (T-4) and the documented gate omits the export (T-9), but the decision is correct. |

**Two further deviations not on the list, both worth ruling:**

| — | Deviation | Ruling |
|---|---|---|
| 11 | The chooser was **copied** from `components/threshold/`, not moved (§6, §14 say moved) | **Accept the copy** — D1 forbids W2 touching the letterbox, and a move would have. But it leaves the G3-banned "Preferred · lowest fee" live behind a held deploy. See I-6. |
| 12 | `/pay/return/[nonce]` reads the tables directly instead of calling `resolve_invoice_return_nonce`; unknown nonces land on `/pay/dead` rather than §4.6's `/pay/return/unavailable` | **Contest the first, accept the second.** The direct read is S-1/I-2/I-3. The `/pay/dead` landing is better than the spec's — one dead sheet for every dead outcome is exactly S2's argument. |

---

## 5 · Verified correct

Things I opened, attacked, and could not break:

**Money.** Every figure on the page runs through `@patina/shared`. The chooser calls
`achSurchargeCents` / `cardSurchargeCents`; the sheet calls `onlineSurchargeCents`, which
*dispatches to those same two functions* (`packages/shared/src/invoice/index.ts:214-223`) — so the
row total and "Total to pay" cannot drift. `surchargeFormula` is the exact integer half-up twin of
`invoice_payment_surcharge_cents`. The only local arithmetic is `balance + surcharge` and
`payment.amount_cents + payment.surcharge_cents`, and the latter is 00428's own gross assertion.
No `moneyInWords`, no spelled-out money anywhere including accessible names (G1). Both design
fixtures are pinned in Jest: `$9,125.00 @ 300 bps → $9,130.00 / $9,398.75 / $9,125.00` (the ACH cap
holding) and `$675.00 → $680.00 / $695.25 / $675.00` (the formula), plus a non-default studio rate.
`card_surcharge_bps` is required as an integer and a missing one **kills the payload** rather than
producing a "—" state (G5). Paid rows read `+ $273.75 processing fee ($9,398.75 charged)`, exactly
the specified shape.

**`?checkout=success` is never trusted.** `confirmState` comes from
`useCheckoutConfirmation(returnedSettled, paid || processing, refetchState)` — the return URL only
*activates* the wait; the authority is `paid || processing`, both read from the `state` poll.
Typing `?checkout=success` by hand yields "Confirming your payment…" and then the honest
"Patina hasn't confirmed a payment yet."

**The return hop is safer than §4.6 asked.** `CARRIED_PARAMS` is a four-key **allowlist**
(`checkout`, `session_id`, `checkout_attempt_id`, `payment_id`) rather than the spec's "carrying
the same query"; the resolved token is re-validated against `^[0-9a-f]{64}$` before it is
interpolated into a path; the target is built with `new URL(path, request.url)` so the origin is
the request's own; and values go through `searchParams.set`, which encodes. **No open redirect, no
query injection, no path traversal** — and the tests pin all three (`route.test.ts:103-140`).

**The `server-only` boundary holds.** `invoice-link.ts` opens with `import "server-only"`, and the
only two `"use client"` files (`invoice-sheet.tsx`, `payment-method-chooser.tsx`) import from it
with `import type` — erased at compile. `settling-sheet.tsx` is a server component. The service
client is unreachable from the browser bundle, and `server-only` would have failed the build if it
were not.

**No token in any log or error.** `grep -rn "console\.\|throw new Error"` over `app/pay/` returns
the limiter's `console.error` (which carries only the binding name) and two `new Error(body?.error)`
throws carrying an error *code*. `refusalSentence` appends the cause only when
`NODE_ENV === 'development'`. S13 clean on this side.

**Nothing else hides behind `/pay/`.** The prefix covers exactly `[token]`, `[token]/state`,
`[token]/checkout`, `return/[nonce]` and `dead` — all five intentionally public.

**The four allowlists are all open, and the fifth surprise is handled.** `middleware` public +
header block (widened to all six bearer prefixes, per S8, with `isPayPage` declared at `:132`
*before* its first use at `:156` — no TDZ), `app-chrome` `PUBLIC_PREFIXES`, `posthog`
`HEX_BEARER_IN_URL`, and the `NetworkOnly` `runtimeCaching` entry placed **before** the
`NetworkFirst` catch-all in `next.config.js` (workbox takes the first match).

**The AASA test is the strongest test in the wave.** It asserts `/pay/*`, `/pay` and `/pay/return/*`
absent from the client app, the four money paths byte-unchanged, absent from the Field app, and
finally `JSON.stringify(aasa)).not.toContain("/pay")` — which no future edit can slip past.

**The limiter.** Read through the **sync** `getCloudflareContext()`, as §6 required and for the
reason `service-binding.ts` gives. Outside a Worker the dynamic import/accessor throws, is caught,
and the request is allowed — so it does not break Jest (a test pins this) and cannot break the
build, since `page.tsx` is `force-dynamic` and never prerendered. Over-limit renders the dead sheet
on the page and returns the same `404 invoice_not_found` on both routes as a dead link does — no
"too many attempts" oracle. Applied on all four entry points, including `state`, which S2 named as
the cheaper uncounted oracle.

**`wrangler.jsonc` `ratelimits`.** Verified field-by-field against
`node_modules/wrangler/config-schema.json`: correct top-level key, `namespace_id` typed `string`
(and given as `"1001"`), `simple.period: 60` inside the `[10, 60]` enum, and — the part that is
easy to get wrong — duplicated into `env.staging`, which the schema's own description requires
("not automatically inherited … must be specified in every named environment").

**Copy.** I extracted every visible string from `mockup/invoice.html` and compared it line by line.
The implementation reproduces it essentially verbatim, including the sentences that read like
slips and are not: "Nora Quist · quistinteriors.com · There is nothing to pay here in the
meantime.", "Each row shows what you would pay in full.", "Your bank transfer is on its way — it
usually settles in 3–5 business days." G3/G4 are satisfied exactly: "+ $5.00 · Bank transfer costs
the least to process." / "+ $273.75 · This covers what card processing costs." / "No fee." No
"lowest fee", no "rail", no "doesn't add to it", no "AI". The check panel is addressed to the
**studio** (`payeeName={studioName}`) with "Write Invoice No. 4 on the memo line.", and the notify
act names the **designer** ("Let Nora know a check is coming" / "Nora has been notified.") — Q5
ruled precisely. `check_remit_to` NULL falls back to the tested `CHECK_REMIT_FALLBACK`.
`WithdrawnSheet` renders K5's literal: "Invoice No. 4 was withdrawn by Quist Interiors."
The one gap is C-1, and it is a payload gap, not a copy gap.

**Accessibility, the parts that hold.** Native `<input type="radio">` with a shared `name` inside a
`role="radiogroup"` — real arrow-key roving, real `aria-checked`, `aria-labelledby` on the group.
The row is the label, `min-h-[56px]`, full width. The decorative dot is `aria-hidden`. Exactly one
`aria-live="polite"` region, naming **only** "Total to pay" and never the row totals (G10), firing
on mount as well as on change — both pinned in Jest. DOM order is the phone's (money before record),
asserted in the e2e via `compareDocumentPosition`.

**Print — the four required behaviours hold; two mockup rules were dropped.** `[data-pay-print="only"]`
is hidden by a base rule and shown only inside `@media print`; `[data-pay-print="hide"]` is
`display:none !important` in print. Applied to the return notice, the chooser (rows *and* check
panel, as one wrapper), the fee row, the "Total to pay" row, the act wrapper and the Print button —
so an unpaid sheet prints no fee and no Total to pay (Q3), and a paid sheet never renders those at
all while the payment row keeps `+ $273.75 processing fee ($9,398.75 charged)`. The grid collapses
to one column and `[data-pay-line]`/`[data-pay-payment]` get `break-inside: avoid`. The colophon is
present and print-only on the payable sheet (S18). There are no dev-only elements in the tree —
`grep` for `NODE_ENV`/`DEBUG`/`process.env` across `app/pay/**/*.tsx` returns nothing — so that
requirement is satisfied vacuously rather than by a rule. **Two of the mockup's print rules did not
make the port: the processing notice is not hidden (P-1) and the terminal sheets carry no colophon
warning (P-2).**

**Tests that are not vacuous.** The route suites assert real behaviour: over-limit never reaches the
database (`resolveInvoiceLink` call count), the exact five `state` keys and that the body contains
neither the memo nor the studio name, the function's 409 passed through with its own code, the
return hop dropping `next`/`foo` while carrying its four, and `never 303s to something that is not
a token`. `checkout-return.test.ts` proves both the `''` hash and the untouched house default. The
`posthog-privacy` case covers `$current_url`, `$referrer`, an autocapture `href`, a nested JSON
value and a pre-redacted string, and asserts `≥ 4` redactions rather than merely "not contains".
