# W4 (P3) — the paperwork page: `/paperwork/[token]` in the client portal

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local only: no `db push`, no `functions deploy`, no secrets, no migration minted
(W4's data + edge wave already landed 00637 and `paperwork-upload`).

Contract: `build/upload-door-spec.md` §1, §3, §9. Rulings PR-a, R-AC..R-AF, R-AY,
R-BD. This wave is spec §3 and nothing else — §6's company-card inbound band is
the designer portal's and is still owed (see §7).

---

## 1. What shipped

The eighth bearer-token guest prefix in `apps/client-portal`, beside `/share`,
`/field`, `/rfq`, `/trade`, `/evidence`, `/plans`, `/pay`. It is a **trade**
surface, not a homeowner one: it carries no nav, no chrome and no session.

| File | What |
|---|---|
| `apps/client-portal/src/app/paperwork/[token]/page.tsx` | NEW. `force-dynamic`, service client, one `resolve_paperwork_link` read, `notFound()` on every miss |
| `apps/client-portal/src/components/paperwork/paperwork-model.ts` | NEW. Pure. Turns the RPC's answer into one row per document type, with the §3 copy table's sentence on each |
| `apps/client-portal/src/components/paperwork/paperwork-sheet.tsx` | NEW. Draws the rows, opens a form per type, swaps a sent form for the receipt sentence |
| `apps/client-portal/src/components/paperwork/paperwork-upload-form.tsx` | NEW. One document, posted multipart to `paperwork-upload` with the anon key |
| `apps/client-portal/src/middleware.ts` | `/paperwork/` joins the public set and the `no-store` + `noindex` bearer block |
| `apps/client-portal/src/components/layout/app-chrome.tsx` | `/paperwork` joins `PUBLIC_PREFIXES` — otherwise the guest page would render inside the authenticated shell |
| `apps/client-portal/README.md` | Route map: the eight bearer prefixes named, `/paperwork/[token]` described |
| four `__tests__` files + `tests/paperwork-link.spec.ts` | See §5 |

**The page's read is the RPC, not the edge function.** `resolve_paperwork_link`
is `service_role`-only and the page holds a service client, which is the
`/field`, `/evidence`, `/plans`, `/pay` shape and spec §3's "one RPC read". The
edge function's `{action:'context'}` branch is therefore unused by this page; it
stays available for any client-side re-read. Named here so it is a decision, not
a leftover.

**The rate bucket is still shared.** Because the read no longer goes through the
edge function, the page calls `paperwork_link_rate_limit_hit(p_ip)` itself
before resolving, with the caller's address from the portal's existing
`resolveClientIp` (`cf-connecting-ip`, else the first `x-forwarded-for` hop).
That keeps spec §2's requirement — one rolling-minute bucket per address covering
BOTH the resolve and the upload, so volume cannot be split across the two. An
unreadable limiter lets the request through, matching the edge function's own
posture; only an explicit `false` draws "Too many tries just now."

---

## 2. What the firm reads

Every sentence is spec §3's copy table, built in `paperwork-model.ts`:

| State | Sentence |
|---|---|
| current | `COI, general liability, current.` |
| lapses soon | `COI, general liability, lapses 1 October 2026.` |
| lapsed | `Licence, lapsed 31 March 2026.` + `Blocks site access, payment and the draw.` |
| not on file | `W-9 is not on file.` — form open by default |
| received | `Received. Local Dev Studio will confirm it.` |

Header: `Paperwork for {studio name}`, the firm's own name above it. The gates
are printed in the studio's own words from `COMPLIANCE_BLOCK_LABELS`
(`@patina/supabase`), the same map the company card's Paper region reads, so the
two faces cannot drift. **No sentence tells the firm what happens if it does not
send the paper**; the block printed in the row is the whole notice, and an e2e
assertion holds that (`/will be removed|suspended|terminated/` → 0 matches).

Rows are ordered worst paper first — lapsed, then owed, then lapsing, then
current — because "what is owed" is what the page is for.

---

## 3. Decisions taken here (each overrulable in one line)

| # | Decision | Why |
|---|---|---|
| P-1 | The **expected** set is `coi_gl`, `w9`, `license` — spec §3's own "COI, W-9, licence" | `studio_compliance_documents` records what a studio HOLDS; there is no table of what it EXPECTS, and inventing one was out of scope. A type the studio has never asked for is not drawn as owed |
| P-2 | A verified paper and its unchecked renewal are **one row**, speaking with the worse paper's word, with "Received…" beside it | `resolve_paperwork_link` returns both (spec §5.4: an upload never overwrites a verified document). Two rows of one type would read as two obligations. **Round 1 (review QA-B1 / MAJOR-1) narrowed both halves:** the word comes only from the paper the studio HOLDS (a type whose only paper is pending reads "not on file" beside the receipt, because the studio holds nothing yet), and "Received…" is said only about paper the FIRM sent — `awaiting_check` gained the `inbound` leg, so the firm is no longer told its own studio's typed W-9 "was received" |
| P-3 | Two differently-named `other_named` papers stay apart; grouping keys on the label | Otherwise a roof warranty would retire an asbestos permit on the face |
| P-4 | A waiver's form asks for the **file alone** | Spec §3: upload only. It already carries its signatures; this door records them and never makes one |
| P-5 | The expiry field is `aria-required`, never HTML `required`, plus an in-form check that prints the door's own sentence, "Give the date it expires." | `required` raises the browser's own validation bubble over the studio's words — and, in jsdom and in a real browser, stops the form submitting at all. The door (00623's `dated_expiry` CHECK, mirrored in `core.ts`) is still the enforcement; this is the same sentence, sooner, so the firm is not made to send a whole file to be told |
| P-6 | A refusal from the door is printed **verbatim** ("send a PDF, a JPEG or a PNG", "that file is over 15 MB") | Those sentences are already in the studio's voice in `core.ts`; re-wording them here would be a second vocabulary to keep in step |
| P-7 | The submit is `aria-disabled` while in flight and the handler returns early; never `disabled` | Program rule. A test holds both halves (the attribute, and that a second press posts nothing) |
| P-8 | No analytics | The brief names `people-events.ts`, which is designer-portal-only; this portal's guest bearer pages (`/field`, `/evidence`, `/plans`, `/pay`) emit nothing, and the one that does (`site-request-events.ts`) belongs to its own program. Adding a module here would be an unasked feature. **Named as a gap, not a refusal** |

---

## 4. What the page does NOT carry

`resolve_paperwork_link` hands back the studio's name, the firm's name, the
window, and the paper — no ids, no file paths, no uploader names — and the page
adds nothing. An e2e assertion greps the rendered body for a uuid shape and for
the raw token; both are absent. A dead door (revoked, expired, unknown, or the
wrong shape) renders the portal's ordinary not-found page, with the firm name,
the studio name and the word COI all absent.

---

## 5. Tests

**Jest — every new file ships with its test (client-portal floor 70/60/70/70).**

| Suite | Cases |
|---|---|
| `src/components/paperwork/__tests__/paperwork-model.test.ts` | 21 — the date format, the gate join, the titles, the four sentences, the blocks clause only where a lapse bites, the ordering, the fold of a paper and its renewal, two `other_named` papers apart, the waiver, a malformed row ignored |
| `src/components/paperwork/__tests__/paperwork-sheet.test.tsx` | 8 — the three owed forms open, the lapse and its gate, a current paper behind an Add act, the receipt sentence from the record and after a send, the waiver's upload-only flag, no ids on the face |
| `src/components/paperwork/__tests__/paperwork-upload-form.test.tsx` | 12 — the five fields, the waiver's one field, the aria-required expiry that is not HTML-required, both pre-checks, the exact multipart body and headers, the `other_named` label, the door's own refusal, two failure sentences, the in-flight aria-disabled and no double post |
| `src/app/paperwork/[token]/__tests__/page.test.tsx` | 9 — the malformed token never reaches the DB, the drawn page, the two RPC calls with their arguments, three flavours of dead link all 404, the rate refusal that never resolves, the fail-open limiter, the single-row unwrap |

Coverage on the four new files:

```
 app/paperwork/[token]      |   95.23 |      100 |     100 |     100
 components/paperwork       |   99.37 |     92.5 |   96.55 |     100
```

Two existing suites gained a case each rather than growing a parallel file:
`src/__tests__/middleware.test.ts` (the bearer header block, and a signed-out
guest reaching `/paperwork/<token>` with no redirect and no `callbackUrl`
carrying the token) and
`src/components/layout/__tests__/app-chrome.test.tsx` (the prefix reads public).

**Playwright — `apps/client-portal/tests/paperwork-link.spec.ts`**, chromium-pinned,
no `waitForTimeout`, `expect.poll` for the DB:

1. **A valid token** — the header, the firm's name, `COI, general liability,
   lapsed 31 March 2025.`, `Blocks site access and the draw.`, `W-9 is not on
   file.` with its form already open, no consequence sentence, `data-portal-shell="public"`,
   no navigation.
2. **An expired token** — the window moved into the past (the one state a mint
   refuses to create), then the not-found page, with the firm, the studio and
   the paper all absent; an unminted 64-hex token and a malformed token land on
   exactly the same page.
3. **An upload lands unverified** — a real PDF through the real form to the real
   `paperwork-upload` function, then `expect.poll` on the firm's card until
   exactly one row exists, asserting `doc_type = w9`, `inbound = true`,
   `source = 'field_link'`, `verified_at`/`verified_by`/`rejected_at`/`superseded_by`
   all NULL, and a storage key of `{org}/{company}/{uuid}/w9.pdf` — every segment
   before the filename a real uuid (spec §4). A fresh load then says the same
   thing from the record.

Fixtures are minted honestly: a fresh `studio_contacts` company row per test
(because `uniq_paperwork_link_tokens_active_company` holds a firm to one live
door, R-AF, and two tests sharing a firm would revoke each other under
`fullyParallel`), and `mint_paperwork_link` called as the **signed-in seeded
designer** — the RPC's first act is `is_active_studio_member(org)` and a
service-role caller with no `auth.uid()` is refused, so driving it as
service_role would pass through a hole no real flow takes. The mint names its
end date explicitly, which is R-AD's own path.

---

## 6. Gates

| Gate | Command | Result |
|---|---|---|
| Client type-check | `pnpm --dir apps/client-portal type-check` | **clean** |
| Client jest + coverage | `npx jest --coverage` (apps/client-portal) | **154 suites, 2523 tests, all pass**; global 76.84 / 72.71 / 76.56 / 79.18 vs the 70/60/70/70 floor |
| New-file coverage | `npx jest --coverage --collectCoverageFrom …paperwork…` | 98.89 / 93.40 / 96.66 / 100 |
| Playwright | `npx playwright test --project=chromium tests/paperwork-link.spec.ts` | **3 passed (9.1s)** |

Prerequisites the type-check needed: `pnpm --filter @patina/aesthete-quiz build`
— that package's `dist/` was absent in this worktree and four unrelated
client-portal files import it, so `tsc` was red on `@patina/aesthete-quiz`
before any of this wave's code was read. `dist/` is gitignored; nothing was
committed by rebuilding it.

Prerequisite the e2e needed: the local **edge runtime was down**
(`supabase status` → `Stopped services: [supabase_edge_runtime_supabase …]`,
and `POST /functions/v1/paperwork-upload` → 503). Brought up with
`supabase functions serve --no-verify-jwt`, which the spec's header now records.
Both it and the dev server on 3002 were stopped at the end of the run; no
`deno.lock` was left at the repo root.

Not run here and not owed by this scope: designer type-check, supabase
type-check, admin-portal build — no shared package or migration was touched.
Nothing outside `apps/client-portal/**` was modified.

---

## 7. Owed, and not done

- **Round 1 (review QA-M1): `client-portal`'s production CSP now derives its Supabase origin
  from `NEXT_PUBLIC_SUPABASE_URL`** the way designer-portal's already did. The upload form posts
  straight from the browser to `functions/v1/paperwork-upload`, and the production branch named
  two hostnames as literals — so a build pointed at any other Supabase project had every guest
  upload (this door AND the pre-existing `/evidence/[token]` one) refused by the page's own
  policy, with no CORS error, no CSP console message and no network request: the firm read only
  "That did not go through. Try again." Dormant on the real Cloudflare deploy, one accidental
  repoint away from live, and it is what failed the wave's own Playwright upload spec against a
  production build.


- **The company card's inbound-queue band** (spec §6) — the studio side of the
  door: the "{N} document{s} waiting for your check" band, Confirm and Reject.
  Designer-portal work, outside this scope. `confirm_inbound_document` and
  `reject_inbound_document` already exist in 00637 with nothing calling them.
- **The mint and revoke acts on the company card** (spec §2's revoke path,
  §8's `v_access_grants` twelfth tier). `mint_paperwork_link` /
  `revoke_paperwork_link` exist and are unreachable from any face, so today a
  paperwork link can only be minted from SQL. Designer-portal work.
- **Analytics** (P-8). No event is emitted from this page.
- **The expected set is the page's, not the studio's** (P-1). If a studio wants
  a bond or a workers-comp certificate on every firm, it cannot say so, and the
  firm will not be shown that row unless a paper of that type is already on
  file. A studio-level "expected paper" record is the fix and is a ruling, not
  a build.
- **The firm cannot volunteer a type that is neither expected nor on file.**
  Spec §3 asks for "one row per document type the firm owes … on file or
  expected", which this honours literally; there is deliberately no "send
  something else" affordance.
- **No prod anything**: no `db push`, no `functions deploy`, no secrets.
