# Wave 3 · lane `sub` — adversarial review, round 3

Reviewer context: separate from the implementer. Branch `agreement/w3-sub`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-sub`
(`git rev-parse --show-toplevel` → that path). 13 commits, 19 files,
+2819 / −12.

**What changed since round 2 that matters more than anything the lane did**:
`agreement/w3-backend` now carries both migrations —
`00578_design_build_kind.sql` (7544 lines) and `00579_trade_agreements.sql`
(1033). For the first time the two RPCs this whole lane is written against
exist as text, so round 3 could stop reasoning about a frozen shape and
*compare* against one. Three of round 2's open items collapse into fact:
one gets better, one gets worse, one gets decided.

## Gates, run by the reviewer

| Command | Result |
|---|---|
| `pnpm --filter @patina/client-portal type-check` | **FAIL, exit 2** — two errors, both cross-lane (R3-1) |
| `pnpm --filter @patina/client-portal test` | **PASS** — 132 suites, 2144 tests, 1 snapshot |
| `pnpm --filter @patina/client-portal test:coverage` | **PASS** — global 74.78 / 70.28 / 74.79 / 77.10 against the 70 / 60 / 70 / 70 floor; `src/app/trade/[token]` 94.66 / 92.92 / 100 / 99.21 |
| `TZ=Asia/Tokyo npx jest …/trade-agreement-signature.test.tsx` | **FAIL** — 1 failed, 10 passed (R3-5) |
| `psql … to_regprocedure('public.resolve_trade_agreement_link(text)')` | `f` — the shared local stack has neither migration, so the e2e still cannot be run here (R3-3) |

Verbatim type-check output:

```
src/components/commercial-document-shell.tsx(26,7): error TS2741: Property 'design_build' is missing in type '{ design_services: string; service_addendum: string; furnishings_authorization: string; trade_scope: string; }' but required in type 'Record<"design_services" | "furnishings_authorization" | "service_addendum" | "trade_scope" | "design_build", string>'.
src/components/threshold/door-gate.tsx(266,7): error TS2322: Type '"design_services" | … | "design_build"' is not assignable to type 'MakingGateKind'.
```

## What is now PROVEN correct (round 3's new evidence)

**I-4 holds key for key.** `resolve_trade_agreement_link`'s
`jsonb_build_object` (00579:702-721) emits exactly thirteen keys —
`studioName`, `agreementTitle`, `contactDisplayName`, `scope`, `priceCents`,
`currency`, `schedule`, `retainageBps`, `payWhenPaidDays`,
`insuranceCertificateRequired`, `lienWaiverPolicy`, `state`,
`existingSignature`. `TradeAgreementLinkDTO` (`types.ts:47-61`) types exactly
those thirteen and no others. No extra key, no missing key, no spelling drift.
`existingSignature` is a `CASE … END` with no `ELSE`, i.e. JSON null when
there is no sub signature — which is the `| null` the type declares.

**The action's four classifications map onto the RPC's four literal answers.**
00579 returns `{'outcome': …}` with one of `invalid_link`, `agreement_void`,
`already_signed`, `saved`. `readOutcome` reads `status` → `outcome` → `result`
(`actions.ts:96`), so `outcome` is found; `saved` and `already_signed` are in
`SIGNED_OUTCOMES` (`:80`), `agreement_void` in `VOID_OUTCOMES` (`:74`),
`invalid_link` in `INVALID_OUTCOMES` (`:77`). The N2 allowlist the lane
invented against an unfrozen shape turns out to be exactly right against the
shape that landed. It is, however, pinned by no test (R3-9).

**R13 is enforced by absence, type and test at three levels.** The RPC emits
no `sov_line_ids`, no project name, no prime price (00579:640-646 says so and
the body honours it); the DTO types none of them; `page.test.tsx:194-225`
bolts `clientPriceCents`, `gmp`, `scheduleOfValues`, `draws`, `projectName`,
`bids`, `otherSubCount` onto the answer and asserts none of `Halvorsen`,
`Ridgeline Millwork`, `$84,134`, `8413400`, `$44,840`, `$8,413.40`, `$41,000`
reaches the DOM; `trade-agreement-signature.test.tsx:187-207` repeats it for
the act.

**Registration is complete on the three sites that carry a live credential.**
`middleware.ts` (prefix const `:118`, the no-store/noindex set `:170-179`, the
`isPublicPage` disjunction `:191`), `app-chrome.tsx:16-19`, and
`lib/analytics/posthog.ts:100`'s `HEX_BEARER_IN_URL`. `middleware.ts` returns
`res` on its terminal path (`:331`), so the headers actually ship. The last
two sites are comment-and-cache only and are still missing the prefix
(R3-7, R3-10).

**Hygiene.** 13 commits, every one a pathspec list matching its subject; no
`add -A` footprint; Conventional Commits subjects, no `merge(...)`, no
trailers; branch not pushed (`git rev-parse origin/agreement/w3-sub` → *Needed
a single revision*); working tree clean. The only file both this lane and the
`client` lane touch is the T0 types commit, and
`git diff 1bc317855 f25fa65be -- packages/types` is empty — the cherry-picks
are byte-identical, and identical again to the backend lane's `03ab57f49`.

**Vocabulary.** `grep -niE "subcontract|clause library|contract builder|variant|dashboard|overdue|✓|✔|🎉"` over `src/app/trade` outside tests returns one hit:
"subcontractor" in `page.tsx:4`, a code comment, which R7 expressly permits.
`lienWaiverLine` (`types.ts:147-151`) never prints an unknown policy key as
copy. No badge, no count chip, no colour status, no emoji.

## Round 2's findings, re-checked

| id | Verdict |
|---|---|
| N2 (major) | **FIXED and now vindicated.** `actions.ts:152-160` inks a receipt only on a success word or a non-empty receipt key; everything else is `unknown` and `trade-agreement-signature.tsx:102-105` reloads. Nine tests cover it. Against the real 00579 the `unknown` arm is unreachable — which is what defence-in-depth looks like when it wins. |
| N3 (major) | **FIXED.** `actions.ts:168-171` returns the receipt's own name or `null` on `already_signed`; the typed fallback survives only on `saved` (`:175`). `Receipt` builds its line with `.filter(Boolean)` (`trade-agreement-signature.tsx:43`), so a nameless replay prints the date alone. Three tests. |
| N7 (nit) | **FIXED.** `trade-agreement-link.spec.ts:10-19` now names the guards the fixture knowingly steps around and why (`send_trade_agreement` is an `authenticated` studio RPC; the spec has no studio session). |
| S2 (blocker) | **Unchanged, and confirmed not this lane's.** See R3-1. |
| N5 (major) | **Partly relieved, still open.** See R3-3. |
| S4 (major) | **Decided by the backend, not by the orchestrator.** See R3-4 — the ruling is now needed to fix a *document*, not the code. |
| S8 (minor, 0.6) | **Escalated to major at confidence 1.** See R3-2 — the migration proves the mint refuses. |
| N1, S6, S7, S9, S10, N4, N6, N8 | Unchanged. Re-stated below with round-3 evidence. |

---

## Findings

### R3-1 · blocker · confidence 1.0 · the lane's named type gate is red
`apps/client-portal/src/components/commercial-document-shell.tsx:26`

`pnpm --filter @patina/client-portal type-check` exits 2 (output verbatim
above). Neither file appears in `git diff main...HEAD --name-only`; both are
`client`-lane pathspecs per build-sheet §2.4, and both errors are caused by the
shared T0 commit appending `design_build` to `COMMERCIAL_DOCUMENT_KINDS`.

Confirmed fixed on `agreement/w3-client`:
`git show agreement/w3-client:…/commercial-document-shell.tsx` carries
`design_build: 'Design-build agreement'` in `KIND_LABEL`, and
`…/lib/analytics/events.ts:106-114` widens `MakingGateKind` with
`| 'design_build'` and a comment saying why.

**Fix**: no re-work in this lane. The integration steward re-runs the gate on
the merge, after `agreement/w3-client` lands and before either branch merges.

### R3-2 · major · confidence 1.0 · the fourth e2e case fails in setup, provably
`apps/client-portal/tests/trade-agreement-link.spec.ts:284`

`mintTradeAgreement({ state: 'void' })` INSERTs the agreement at
`state='void'` (`:116-137`) and then calls `mint_trade_agreement_token`
(`:142-145`) with `if (mintErr) throw mintErr`. The migration now says what
that call does:

```sql
IF v_agreement.state NOT IN ('sent', 'signed') THEN
  RAISE EXCEPTION 'trade agreement % is not sent and cannot be linked',
    p_agreement_id USING ERRCODE = 'check_violation';
END IF;
```
(`00579_trade_agreements.sql`, `mint_trade_agreement_token`)

So the "a withdrawn agreement resolves to nothing" test throws in its fixture
before the browser is opened. Round 2 rated this 0.6 because the RPC existed
nowhere; it is now confidence 1.

**Fix**: mint at `state='sent'`, then flip the row to `void` out of band as
`service_role` before the page load. `guard_trade_agreement_authored`
(00579:210-250) freezes only the content columns after `sent` — `state`,
`voided_at` and `void_reason` are not in its list — so the out-of-band flip is
permitted and walks the same path production does.

### R3-3 · major · confidence 1.0 · nothing in this lane has ever executed against a database
`apps/client-portal/tests/trade-agreement-link.spec.ts:1`

Relieved but not closed. The blocker moved from "the RPCs exist on no branch"
to "the RPCs exist on a branch nobody has applied":
`git diff main...agreement/w3-backend --stat -- supabase/migrations` now shows
`00578_design_build_kind.sql | 7544 +` and `00579_trade_agreements.sql | 1033 +`,
while on the shared local stack

```
select to_regprocedure('public.resolve_trade_agreement_link(text)') is not null,
       to_regprocedure('public.mint_trade_agreement_token(uuid)') is not null;
 → f|f
```

and this lane is forbidden to apply them. So `E2E-3` has still only `--list`ed
(4 tests, chromium); the DTO conformance above is a *textual* comparison of two
files, not an executed one; the sheet's SQL-A1..A9 belong to the backend lane
and prove the DB half separately.

**Fix**: not lane work. Integration must not merge this branch until
`pnpm --filter @patina/client-portal test:e2e -- tests/trade-agreement-link.spec.ts --workers=1`
has actually run green against a stack carrying 00578+00579 — with R3-2 fixed
first, or case 4 fails in setup.

### R3-4 · major · confidence 1.0 · the re-open contradiction is now settled in code and still unsettled in the walk script
`apps/client-portal/src/app/trade/[token]/page.tsx:20`

The backend has answered S4 by construction, and it answered horn 2:

- `sign_trade_agreement_by_token` revokes the token in the signing transaction
  (`UPDATE … SET status = 'revoked' … WHERE id = v_token.id`, immediately after
  the signature INSERT and the `state='signed'` UPDATE);
- `resolve_trade_agreement_link` requires `t.status = 'active'`, so the spent
  link resolves to NULL and `page.tsx:100` `notFound()`s.

Therefore build-sheet §8 step 16's "**a fresh load of the same URL still shows
the receipt**" is *false* as built: the sub who reopens their own signed link
reads "Page not found". Both of §4.5's `state:'signed'` and `existingSignature`
keys are reachable only through a re-mint of a `signed` agreement — which
`mint_trade_agreement_token` does allow (`state IN ('sent','signed')`) and
which DENO-4's "a resend of a `signed` agreement never downgrades `state`"
implies the edge function performs. So the keys are not dead; the walk sentence
is wrong.

The lane handled this correctly and is not at fault: `page.tsx:20-29` writes the
contradiction out, and `trade-agreement-link.spec.ts:235-254` asserts only what
both horns agree on (`getByText(/page not found/i).or(getByTestId('trade-agreement-receipt'))`,
plus zero signable form, zero name field).

**Fix**: orchestrator ruling, now a documentation fix rather than a code one —
strike or amend §8 step 16's "a fresh load of the same URL still shows the
receipt" (the same URL 404s; a *re-sent* link shows the receipt), then re-pin
`trade-agreement-link.spec.ts:247-252` to the single ruled horn. If instead the
walk sentence is to stand, the change is in `00579`, not here.

### R3-5 · minor · confidence 1.0 · two receipt-date assertions are timezone-fragile — reproduced
`apps/client-portal/src/app/trade/[token]/__tests__/trade-agreement-signature.test.tsx:79`

`:79` asserts `/Dana Hall · 7 September 2026/` for `signedAt`
`'2026-09-07T15:04:00Z'`; `:116`, `:132`, `:148` assert `6 September 2026` for
`'2026-09-06T11:00:00Z'`. `formatLongDate` (`types.ts:75-84`) correctly treats a
full timestamp as an instant and formats it in the runner's local zone.
`grep -n TZ` over `jest.config.js`, `jest.setup.js` and `package.json` returns
nothing. Run under a plausible zone:

```
TZ=Asia/Tokyo npx jest src/app/trade/[token]/__tests__/trade-agreement-signature.test.tsx
> 79 |     expect(screen.getByText(/Dana Hall · 7 September 2026/))
Tests: 1 failed, 10 passed, 11 total
```

Same class as the already-backlogged `threshold.spec.ts:158`.

**Fix**: pin `TZ` for the suite, or choose `signedAt` values (e.g. a midday-UTC
instant on a date that is the same calendar day from UTC−12 to UTC+14 — which
no single instant is, so pin `TZ`).

### R3-6 · minor · confidence 1.0 · the named gate does not enforce the coverage floor
`apps/client-portal/package.json:13`

`"test": "jest"` (`:13`); `"test:coverage": "jest --coverage"` (`:15`). The
floor lives in `jest.config.js:70-77` (lines 70 / branches 60 / functions 70 /
statements 70) and applies only under `--coverage`. I ran both: `test` prints
no coverage table; `test:coverage` reports 74.78 / 70.28 / 74.79 / 77.10 —
green. The lane brief and build-sheet §6 both name `test` as the command that
"enforces" the floor. It does not.

**Fix**: name `test:coverage` wherever the floor is claimed to be enforced
(build-sheet §6 "Client + sub", and the lane brief template).

### R3-7 · minor · confidence 1.0 · `/trade` is missing from the service worker's NetworkOnly list
`apps/client-portal/next.config.js:34`

```js
urlPattern: /^https?:\/\/[^/]+\/(pay|plans|share|rfq|evidence|field)\//,
handler: 'NetworkOnly',
```

`trade` is absent, so the signing page falls to the catch-all
`{ urlPattern: /^https?.*/, handler: 'NetworkFirst', maxAgeSeconds: 30*24*60*60 }`
whose cache key is the URL — i.e. the raw 64-hex signing credential, held in
the visitor's browser for thirty days. The block's own comment states the rule
and why it is kept: "Cache Storage does not honour `Cache-Control: no-store` …
Inert on the deployed Worker: `withPWA` is the identity function when
`OPEN_NEXT === 'true'` … Kept because it costs one line, protects non-OpenNext
builds and preview hosts, and fails safe if the PWA is ever re-enabled."
Production impact today is nil; the rule exists for the cases where it is not.
`/trade` is the fifth of five hand-kept prefix lists and the only one still
missing the entry alongside R3-10.

**Fix**: add `trade` to the alternation, in the same change as R3-10.

### R3-8 · minor · confidence 0.9 · the e2e asserts one of the three guest-surface headers
`apps/client-portal/tests/trade-agreement-link.spec.ts:171`

`expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow')` and
nothing else. Build-sheet §9's production probe expects *both* headers on
`client.patina.cloud`, and RC-2 asks for both plus the page's own
`robots`/`referrer` metadata. The unit matrix at `middleware.test.ts:80-99`
does assert `Cache-Control: private, no-store, max-age=0` for `/trade`, so this
is a browser-level gap only — but the browser level is the one that would catch
a Worker or CDN stripping the header.

**Fix**: assert `cache-control` beside `x-robots-tag`, plus
`page.locator('meta[name="robots"]')` and `meta[name="referrer"]`.

### R3-9 · minor · confidence 0.9 · the outcome allowlists are now checkable against the real RPC, and no test checks them
`apps/client-portal/src/app/trade/[token]/__tests__/actions.test.ts:37`

The suite's 22 cases were written against an unfrozen shape and pin invented
ones: `{status:'signed'}`, `{status:'already_signed'}`, `{ok:true, signed_at}`,
`{outcome:'already_signed'}`. 00579's *actual* fresh-signature answer —
`{'outcome':'saved','agreementId':…,'signedName':…,'signedAt':…}` — appears in
no test. It happens to work (`saved` ∈ `SIGNED_OUTCOMES`), which I verified by
reading both files, but nothing in the repo would fail if the backend renamed
`saved` to `signature_recorded` or moved to `agreement_id`/`signed_name`. That
is precisely the drift the lane's own notes said to guard against once the
shape froze; it has now frozen.

**Fix**: four cases pinning 00579's literal answers verbatim —
`{outcome:'saved',…}` → `saved`, `{outcome:'already_signed',…}` →
`already_signed` with the original name, `{outcome:'agreement_void'}` →
`agreement_void`, `{outcome:'invalid_link'}` → `invalid`. Cite the migration in
a comment so the pair moves together.

### R3-10 · nit · confidence 1.0 · the layout's guest-route comment still omits `/trade` and `/pay`
`apps/client-portal/src/app/layout.tsx:52`

`// the token and guest routes (/share, /field, /rfq, /plans, /piece, /evidence)`.
Harmless in itself; it is the fifth instance of the hand-kept-prefix-list
pattern that produced round 1's S1 and this round's R3-7.

**Fix**: update it in the same change as R3-7.

### R3-11 · nit · confidence 1.0 · the two classification channels still disagree on the withdrawn case
`apps/client-portal/src/app/trade/[token]/actions.ts:70`

`classifyMessage` tests a *raised* message with
`message.includes('agreement_void')` alone, while the *returned* channel
(`:74`) accepts `agreement_void | void | voided`. 00579 never raises
`agreement_void` (it returns it), so this is unreachable today — but the file's
own header (`:15-19`) says both channels exist so a raising backend and a
returning one produce the same sentence, and they would not.

**Fix**: classify the raised message against `VOID_OUTCOMES`.

### R3-12 · nit · confidence 0.9 · the DTO's `state` is typed and never read
`apps/client-portal/src/app/trade/[token]/types.ts:58`

No file reads it; `page.tsx:131` gates the act on `existingSignature` alone,
and `trade-agreement-signature.tsx:74` renders the form whenever that is null.
Round 2 rated this a hazard. 00579 makes it benign: `state='signed'` is written
in the same transaction as the `sub` signature INSERT, and `void_trade_agreement`
refuses a signed agreement — so `state:'signed'` and a non-null
`existingSignature` cannot come apart. Recorded, not asked to change.

**Fix**: none required. If it is tightened, `state === 'sent' && !existingSignature`
is the condition, and it should be decided with R3-4 rather than separately.

### R3-13 · nit · confidence 0.8 · a too-short name is reported to the sub as a dead link
`apps/client-portal/src/app/trade/[token]/actions.ts:120`

`if (signedName.length < MIN_SIGNED_NAME_LENGTH) return { status: 'invalid' }`,
which `trade-agreement-signature.tsx:95-98` prints as "This link is no longer
active." — a false statement about the link. Unreachable through the UI:
`HoldAction`'s `disabled={!signatureIsComplete(name)}` (`:142`) holds the same
2-character floor. Reachable by a direct POST to the server action, and
`actions.test.ts:31-35` pins the conflation as intended behaviour.

**Fix**: a distinct arm (or reuse `unknown`) so the sentence is never a claim
about the link. Low value; the UI cannot produce it.

### R3-14 · nit · confidence 0.7 · the shared 404 and error boundary speak to a homeowner
`apps/client-portal/src/app/not-found.tsx:18`

Every dead `/trade` link lands on `src/app/not-found.tsx`, whose only act is
`<Link href="/">Go to home</Link>` — for a sub with no session that is a
sign-in redirect. `src/app/error.tsx:41-45` is the same shape, and `:48` gates
the stack/message `<details>` behind `NODE_ENV === 'development'`, so RC-2's
"would an error boundary leak a DB message" is answered: no. Pre-existing and
shared with `/rfq`, `/share`, `/plans`, `/pay`, `/evidence`.

**Fix**: main backlog, not this lane.

### R3-15 · nit · confidence 0.6 · `as any` leaves the RPC name and argument names unchecked
`apps/client-portal/src/app/trade/[token]/page.tsx:94`

`const admin = createServiceClient() as any` in both `page.tsx:94` and
`actions.ts:128`. `agreement/w3-backend` has regenerated
`packages/supabase/src/database.types.ts` with
`resolve_trade_agreement_link: { Args: { p_token: string }; Returns: Json }`
and `sign_trade_agreement_by_token`, so after the merge a typed client would
catch a misspelled RPC name or argument. It is, however, exactly what
`rfq/[token]/page.tsx:61` and `rfq/[token]/actions.ts:43` do — the pattern the
build sheet told this lane to copy file for file.

**Fix**: optional, and if taken should be taken for `/rfq` in the same change
so the two do not diverge. `Returns: Json` still needs a cast to the DTO.

---

## Build-sheet §2.5 delivery check

| Item | Delivered |
|---|---|
| `app/trade/[token]/page.tsx` | ✔ force-dynamic, `robots {index:false, follow:false}`, `referrer: 'no-referrer'`, format gate before the round trip, one RPC through `createServiceClient()`, `notFound()` on any null |
| `.../actions.ts` | ✔ `'use server'`, calls the RPC directly with no pre-resolve, four outcomes, no raw DB message, no `console.*` |
| `.../types.ts` | ✔ own `/^[0-9a-f]{64}$/` literal, frozen DTO, the eight essentials as sentences |
| `.../trade-agreement-signature.tsx` | ✔ typed name (`SignatureLine`) + press-and-hold (`HoldAction`), settled receipt on a replay |
| `.../__tests__/{page,actions,trade-agreement-signature}` | ✔ 3 suites, 56 cases |
| `middleware.ts`, `app-chrome.tsx` | ✔ both registrations, both with tests |
| `tests/trade-agreement-link.spec.ts` | ✔ written (4 cases, fresh `BrowserContext`, no `sb-` cookies) — **never executed** (R3-3), and case 4 fails in setup (R3-2) |
| Studio-only bid ledger never rendered (R13) | ✔ by type, by RPC, by two defensive-props tests |
| jest + coverage floor | ✔ green; the *named* command does not enforce it (R3-6) |
| Lane log `sub-notes.md` | ✔ force-added and committed |

Out-of-pathspec edit: `src/lib/analytics/posthog.ts` +
`__tests__/posthog-privacy.test.ts`. Not listed in §2.5 and not listed in any
other lane's pathspecs either (§2.4 owns `lib/analytics/events.ts`, not
`posthog.ts`), and `comm -12` over the two branches' file lists shows no
collision. Justified: it is where round 1's S1 lived — the raw signing
credential was reaching PostHog. Accepted.

## Verdict

**fix.** One blocker (R3-1) that is not this lane's to close but does gate the
merge, and four majors of which two (R3-2, R3-9) are one-file edits in this
lane, one (R3-3) is an integration obligation, and one (R3-4) is an
orchestrator ruling that now amends the walk script rather than the code.
