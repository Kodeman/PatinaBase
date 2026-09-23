# P2a — Pledge / commission-share copy inventory

Ticket SQ-140 · The Second House Wave 1 · PROGRAM.md §3 Deploy 1, rows P2a + Pauses.
Branch `worktree-agent-ab83fc02205623f68` (isolated worktree off `main` @ `f0df16d64`).

The rule applied throughout: **remove anything that promises a share of Patina's
commission to a studio or client.** Keep figures that report money the studio
itself earned, and keep the internal accounting model except where it renders
(ticket NON-GOALS).

A note on the word *commission*, because a bare grep is badly misleading here.
In this codebase it carries three unrelated meanings:

| Meaning | Example | Bearing on P2a |
|---|---|---|
| **Patina's revenue share** — "a quarter of our commission goes back to…" | the three email templates | **This is the Pledge. Removed.** |
| **A bespoke piece commissioned from a maker** | `custom-commission-model.ts`, the piece room | Unrelated furniture vocabulary. Kept. |
| **The designer's own earned income** | `estCommissionCents`, `product_commission` | The studio's money, reported to them. Kept. |

Of 369 `commission` hits under `apps/designer-portal/src`, 348 are the bespoke-piece
sense, 6 are the catalog `commission_rate` field, 3 are the `product_commission`
earnings-source key, and the remaining 12 are the designer's own income. **None is a
revenue-share promise.**

---

## 1. Email templates — the promise sentences (REMOVED)

The send path renders from the `email_templates` row, not the `.tsx`
(`supabase/functions/_shared/render-template.ts`), so each removal lands twice:
in the authoring source and in the live row via `00655`.

| File | What was there | Disposition |
|---|---|---|
| `packages/email/src/templates/designer-invite.tsx` | "One promise up front, stated plainly: a quarter of our commission goes back to the designers who teach the system. When Patina earns, you earn." | **REMOVED** — whole `<Text>` paragraph. It carried nothing but the promise. |
| `packages/email/src/templates/onboarding-aesthete.tsx` | "And here is the part I'll always state plainly: a quarter of our commission goes back to the designers who teach the system. Teaching Aesthete your taste is real work, and it's paid work. When Patina gets smarter, the designers who taught it share in what it earns." | **REMOVED** — whole `<Text>` paragraph, including the "paid work" promise. |
| `packages/email/src/templates/milestone-first-payment.tsx` | body: "This is also the moment the Pledge stops being a line in a welcome letter: a quarter of our commission goes back to the designers who teach the system — and what Patina earned on this payment is part of that promise." | **REMOVED** — whole `<Text>` paragraph. |
| `packages/email/src/templates/milestone-first-payment.tsx` | preview: "Paid, recorded, reconciled — and the Pledge is now in motion." | **REMOVED clause.** Preview is now "Paid, recorded, reconciled — nothing left for you to file." The replacement clause is lifted verbatim from the letter's own surviving first paragraph, so no new copy was authored. |

Surrounding copy is untouched — no paragraph without a promise was rewritten. Each
letter still reads as a letter: `designer-invite` runs "…your opinion will shape what
we build next." → "The practical part:"; `onboarding-aesthete` runs "…sorted by you
instead of by everyone." → "Give Aesthete ten minutes with your least favorite
trend."; `milestone-first-payment` runs "…nothing left for you to file." → "First
money through the books is a quiet milestone…".

**No other template was touched.** Proven, not asserted: all 14 untouched templates
re-render byte-identical to their live `00404` rows (0 drift).

---

## 2. The Accounts book — both Pledge figures (REMOVED)

`apps/designer-portal/src/components/document/accounts/accounts-book.tsx` — 9 hits, all removed:

| Line (pre-edit) | Hit | Disposition |
|---|---|---|
| 29 | `import { pledgeFromCommission, pledgeYtdReturned, type PledgeEvent }` | **REMOVED** |
| 64–65 | `// R37 — the Aesthete fold: the Pledge is computed from real Via-Patina commission events (25%, confirmed)` | **REMOVED** (comment reduced to the surviving teaching-stats clause) |
| 66 | `useEarnings({ sourceType: 'product_commission' })` — fed the Pledge only | **REMOVED**, with its `useEarnings` import |
| 69–75 | `pledgeEvents` memo | **REMOVED** |
| 76–79 | `pledgeYtd` memo | **REMOVED** |
| 171 | `{fmtUsd(pledgeYtd)} returned` — **the second Pledge figure** (ticket anchor `~:169`) | **REMOVED**, with its `·` separator, leaving the teaching band as "teaching · N taught → Library ↗" |
| 190 | `pledgeEvents` / `pledgeYtd` props passed down | **REMOVED** |
| 12 | docblock "the Aesthete fold lands here in slice 5" | **REMOVED** (stale once the fold is gone) |
| 17 | `useMemo` import, dead after the two memos went | **REMOVED** |

`apps/designer-portal/src/components/document/accounts/accounts-earnings-page.tsx` — 17 hits.
This file held **the Pledge band** itself ("Band two — What teaching returns"):

| Line (pre-edit) | Hit | Disposition |
|---|---|---|
| 4–15 | docblock describing the two-sided 25% Pledge, the commons match, R41, §14.15 | **REMOVED**; docblock now describes the one surviving band |
| 22–28 | `COMMONS_MATCH_PROVISIONAL`, `COMMONS_MATCH_RATE`, `commonsRateKnown`, `PLEDGE_RATE`, `PledgeEvent` imports | **REMOVED** |
| 63–69 | `pledgeEvents` / `pledgeYtd` props | **REMOVED** from the signature |
| 109–190 | **the whole Pledge band** — "What teaching returns", "taught-taste income · the 25% Pledge", "The Pledge, returned to you / year to date" + figure, the per-event twinned "returned to you" / "given to the commons" rows, the provisional-rate flags | **REMOVED** — every one of these rendered to a studio |
| 21 | `fmtDay` import, used only inside the band | **REMOVED** |

**KEPT** in this file, deliberately — band one, "What you earn": `Design fees`,
**`Via-Patina commissions`**, `Other`, `client work, all time`, paid/pending. These
report money **the studio earned**, read from `earnings.bySource`. They are a ledger,
not a promise: nothing here says Patina shares its commission with anyone.

> **One interpretive call for the reviewer.** PROGRAM.md:84 words the copy gate as
> "no 'Pledge', 'commission', 'share' surviving in the three templates or the Accounts
> book". Read to the letter, that would also delete the `Via-Patina commissions`
> earnings line. I did not, on the grounds that deleting it destroys a real figure in
> the studio's own ledger while removing no promise — and the ticket's own NON-GOALS
> bar removing the accounting model beyond what renders a promise. The literal gate
> **is** met for `accounts-book.tsx` (0 hits for Pledge, commission and share). It is
> met for the three templates. It is not met for `accounts-earnings-page.tsx`, by this
> one word, in the "income the studio earned" sense. One line to change if overruled.

---

## 3. `lib/document/pledge.ts` — DELETED

`apps/designer-portal/src/lib/document/pledge.ts` (83 lines, 15 hits: `PLEDGE_RATE`,
`COMMONS_MATCH_RATE`, `COMMONS_MATCH_PROVISIONAL`, `commonsRateKnown`, `PledgeEvent`,
`pledgeFromCommission`, `pledgeYtdReturned`, `roundCents`).

Its only two importers were the two files above. With the band and the book's
computation gone it is unreachable, so per the ticket it is **deleted, not stubbed**
(`git rm`). Confirmed by `pnpm --filter designer-portal type-check` passing with no
unresolved import, and by `grep -rni pledge apps/designer-portal/src` → **0**.

The arithmetic is recoverable from git history if the Pledge returns behind a legal
gate; nothing in the DB or in `packages/*` depended on it.

---

## 4. Residual state

| Check | Result |
|---|---|
| `grep -rni pledge apps/designer-portal/src` | **0** |
| `grep -rniE 'pledge\|quarter of our commission\|share in what it earns' packages/email/src` | **0** |
| Revenue-share promise copy anywhere in `apps/designer-portal/src` | **0** |
| `grep -wc AI` on all five touched files | **0** each (PROGRAM.md:84 gate) |
| Live rows: `html_content ILIKE '%pledge%'` / `'%quarter of our commission%'` for the three slugs | **false / false** (enforced by `00655`'s guard block, which raises if not) |

## 5. Not done, by design

- No other `email_templates` row written — `00655` names exactly three slugs.
- Historical seeds `00293` / `00310` / `00404` untouched (evidence only).
- `subject_default`, `name`, `description`, `category`, `variables` untouched — verified
  byte-identical for all three, so `00655` writes `html_content` only.
- The client portal, admin portal and Sanity help content were **not** swept; P2a scopes
  `packages/email` + `apps/designer-portal`. If the Pledge appears in Sanity copy or the
  client portal, that is a separate ticket.
