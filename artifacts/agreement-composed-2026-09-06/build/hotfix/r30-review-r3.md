# R30 hotfix — adversarial review, round 3

Branch `agreement/r30-origin-door` @ `442099a37`, cut from `a6584dbc5`; `origin/main`
is now `8bc8bcc4d` (one docs-only commit ahead — `artifacts/.../build/{contract,rulings}.md`
and `hotfix/r30-origin-door.js`, none of which this branch touches, so the merge is clean).
Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-r30`.

Reviewer did not write this code. Everything below is either a command output, a SQL
result, or a browser observation taken this round.

---

## 1. Verdict

**FIX.** The origin agreement is reachable and signable end to end — proved in a real
browser against the local stack, not inferred. No RLS leak. Every gate is green except
one pre-existing shared-stack red, proved pre-existing by SQL.

One **major** stands: the second half of the R30 round-2 amendment — *"The studio-invoice
front door renders beside the origin agreement, never blank behind it"* — was not
implemented and is not mentioned anywhere in `r30-notes.md`. Round 3 fixed R30-9 only.

## 2. What round 3 actually changed

`442099a37` is the only code commit since the round-2 review. It touches
`letterbox-door.tsx` (one line + comment), the covering jest fixture, and one e2e
assertion. Nothing else on the branch moved.

## 3. R30-9 — fixed, with a deviation from the ruling's named source

The em dash is gone. Proved in a browser this round (fresh household
`r30-probe-a85ba630@patina.dev`, agreement `7fad086f-…`): after the real hold-to-sign
gesture, a revisit of `/` renders `previously-date` = **`7 SEPTEMBER`**.

The ruling's amendment says the date "reads from the client's own signature row
(`commercial_document_signatures.signed_at`, party client), never from
`proposals.signed_at`". The code reads a **third** source — `proposal.updated_at`
(`letterbox-door.tsx:249`). Today the two are the same instant, exactly:

| source | value |
|---|---|
| `commercial_document_signatures` (party `client`) `signed_at` | `2026-09-07T16:02:04.054052+00:00` |
| `proposals.updated_at` | `2026-09-07T16:02:04.054052+00:00` |
| `proposals.signed_at` | `null` |
| `proposals.project_id` | `null` |

So the rendered date is right today. It is not right *by construction*:
`update_proposals_updated_at` is `BEFORE UPDATE ON public.proposals FOR EACH ROW` with
**no column list**, so any future writer of that row silently re-dates her signature. I
walked every `public` function whose body updates `public.proposals` and found none
reachable between `client_signed` and countersign (`_mark_proposal_viewed_impl` requires
`status = 'sent'`; `nudge_proposal` requires `sent|viewed`; `expire_proposals` requires
`sent|viewed`), so this is a latent coupling, not a live defect. It is recorded as a
deviation because `r30-notes.md` presents `updated_at` as the fix without naming the
ruling's own source or saying why it was not used.

## 4. The major — R30-3, carried from round 1, now a ruling item

`letterbox-door.tsx:328-332` still holds the whole front door on
`proposalsQuery.isPending`, unconditionally:

```ts
if (
  invoicesQuery.isPending ||
  proposalsQuery.isPending ||
  (anythingHere && plateAsked && identityQuery.isPending)
)
```

`origin/main`'s line was `invoicesQuery.isPending || (standing.length > 0 &&
identityQuery.isPending)` — no proposals read at all. So a household whose only paper is
a **studio invoice** now waits on an unrelated read before it may see its money.

Proved this round rather than reasoned. A temporary jest case (added, run, reverted;
`git checkout` restored the file) with `clientInvoicesMock` **settled** on `STUDIO_INVOICE`
and `proposalsMock` pending:

```
REVIEWPROBE hold= true letterbox= false plate= false
✓ REVIEWPROBE studio invoice held blank behind the proposals read (35 ms)
```

The letterbox and the plate are both absent; the page is the blank
`letterbox-door-hold` div. `useClientSafeProposals` (`packages/supabase/src/hooks/use-proposals.ts:402`)
sets no `retry`, so it inherits `retry: 2` from `app/providers.tsx:26` — a slow or failing
`list_client_proposals` holds the money surface blank across three attempts and their
backoff.

Fix: gate the new hold behind `standing.length === 0`, so an already-drawable letterbox
is never held for a read that cannot change it.

## 5. What was proved working

Browser, against the local stack, worktree dev server on `:3002` (no `.env.local` in the
worktree; `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, CLI demo anon key,
service-role key from `supabase status -o env`):

| claim | evidence |
|---|---|
| the door renders the origin agreement | `#door` heading = `Probe origin agreement`; standing sentence `One agreement is waiting for you.` |
| consent + signature act present | `Type your full name` field, one checkbox, `Sign and accept` enabled |
| no nav (R135) | `getByRole('navigation')` count 0 |
| `?proposal=` deep link | `/?proposal=7fad086f-…#door` → same heading |
| retired `/proposals/<id>` | final URL `/?proposal=7fad086f-…#door`, 200, same heading |
| signing works end to end | real mouse hold (1.8 s) → `POST /api/proposals/7fad086f-…/sign` **200** `{"ok":true,"commercialState":"client_signed","newlyClientSigned":true}` |
| the signature is recorded | `commercial_document_signatures`: `party_role=client`, `signed_name='Probe Owner'`, 64-char `evidence_fingerprint` |
| the record survives the revisit | `previously-line` present, `previously-date` = `7 SEPTEMBER`, no `empty-state`, no door |
| a stranger household cannot read it | bundle RPC → `commercial document 7fad086f-… not found or access denied`; `list_client_proposals` does not contain it; `from('proposals')` → `[]` |
| the addressed homeowner can | bundle returns the document; list contains it |
| a household with no paper is unchanged | fresh homeowner, zero projects, no agreement → `No active projects yet` |
| `threshold.tsx`'s project-scoped paper filter | untouched — `git diff --stat origin/main...HEAD` lists no `threshold.tsx` |
| homeowner copy | added strings are `One/Two agreement(s) … waiting for you.` and the studio receipt; no `gate`/`task`/`dashboard`/`overdue`/`AI`, no badge, chip or colour |
| commits | 14 commits, all Conventional, no trailers, every pathspec inside `apps/client-portal` or the program docs |

## 6. Gates, run by the reviewer

```
pnpm --dir <wt>/apps/client-portal type-check     → clean (tsc --noEmit, no output)
pnpm --dir <wt>/apps/client-portal test:coverage  → 129 suites / 2010 tests passed
    74.15 lines / 69.48 branches / 74.22 functions / 76.46 statements  (floor 70/60/70/70)
    letterbox-door.tsx 97.7 / 85 / 92.59 / 98.75
npx playwright test --workers=1 --project=chromium tests/origin-door.spec.ts → 3 passed (25.7s)
npx playwright test --workers=1 --project=chromium tests/threshold.spec.ts   → 13 passed, 1 failed (2.2m)
```

The single red is `threshold.spec.ts:236` (assertion at `:250`) — `client@patina.dev`
should keep `MULTI_OTHER_HOUSE_COUNT = 2` other houses and keeps 4. Proved pre-existing
and not this lane's, by SQL:

```
b0000000-…d1 Aspen Loft Refresh        2026-09-07 11:56:31   (seed)
b0000000-…d3 Birch Hollow              2026-09-07 11:56:31   (seed)
b0000000-…d4 Marrow & Vale Residence   2026-09-07 11:56:31   (seed)
d21717c5-…   Client User — design services agreement  12:18:25   ← another lane's countersign
4771dc1b-…   Client User — design services agreement  12:27:14   ← another lane's countersign
```

Both drift houses predate this lane's first browser run. `threshold.spec.ts:158` (the TZ
one) **passed**. `plans-link.spec.ts` and `share-link.spec.ts` were not run.

## 7. Carried findings, re-checked

| id | state | note |
|---|---|---|
| R30-3 | **OPEN — major** | §4. Binding by the round-2 amendment; unfixed and unmentioned. |
| R30-4 | open, ruled to Wave 2 | A household that already has a house and is sent a second origin agreement is still unreachable. The ruling carries it to the Wave 2 client lane ("papers without a house" leaf). No action here. |
| R30-5 | open, ruled to Wave 2 | `plateAsked` still ships without a test: no fixture in `threshold.test.tsx` carries `studio_id: null` **and** `designer_id: null`. Ruling gives it a Wave 2 test. |
| R30-6 | open, ruled to the main backlog | Worse by count: 13 `r30-origin-*@patina.dev` households on the shared stack (2 from this review's own run), each owning zero projects. |
| R30-7 | partly addressed | The committed spec still signs through the RPC in `beforeAll`. The reviewer drove the real gesture in Chromium and it works (§5) — coverage gap, not a defect. |
| R30-9 | **FIXED**, with a deviation | §3. |
| R30-10 | open — nit | Immediately after signing, the same paper stands twice: `doors=1` **and** `previously-line=1` in the same post-signature snapshot. The house's own idiom; recorded so it is not mistaken for a regression. |
| R30-11 | open — nit | Same snapshot: `Nothing is waiting for you.` printed above a door reading `… signed 7 September · Leah Hartwell has your signature.` |
| R30-12 | open — nit | `partitionProposals(proposalsQuery.data)` is still called unmemoized in the component body, so both `useMemo`s below it recompute every render. |

## 8. New this round

**The ship note does not record what shipped unfixed.** `r30-notes.md`'s round-2 section
names only R30-9. It never names the amendment's second half (R30-3), and it does not say
which carried findings the ruling deferred to Wave 2 or the main backlog. A reader of the
note cannot tell the difference between "fixed" and "ruled out of this lane".

## 9. Not verified

- Nothing was deployed; no production read or write of any kind was made.
- No migration exists on this branch, and none was needed — the bundle serves a
  project-less document to its addressed homeowner (proved §5).
- `plans-link.spec.ts`, `share-link.spec.ts`, and the rest of the client e2e suite were
  not run. Only chromium (the client config has one project).
- The R30-3 blank hold was proved at the component level (jest) and by reading
  `useClientSafeProposals`/`providers.tsx`. It was **not** reproduced against a real
  studio-invoice household, because none exists on the local stack
  (`SELECT count(*) FROM invoices WHERE project_id IS NULL` → 0).
- Designer and admin portals were not built; this branch touches neither.

## 10. What this review left on the shared local stack

Two throwaway households (`r30-probe-a85ba630@patina.dev`,
`r30-probe-eafc6b73@patina.dev`), one `designer_clients` row, and one signed
project-less agreement (`7fad086f-02dc-4773-b5e4-ab697530c327`), plus the two households
the committed `origin-door.spec.ts` mints per run. Sweeping the signed one was attempted
and refused by `guard_commercial_immutable_row` ("commercial_document_signatures rows are
immutable"); deleting the auth users is refused by `guard_proposal_authority` ("proposal
client identity may only change through set_document_client"). The delete transaction
rolled back whole — the signature row, the proposal and both users are intact and
unmodified. Reaching past those guards is not a reviewer's call; `supabase db reset` is
the broom. This is the same class of residue R30-6 records.
