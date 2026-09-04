# Adversarial review — `proposal.html`

**Target:** `/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/proposal.html` (1,869 lines, 155 KB)
**Reviewer:** independent; did not write the artifact. No edits made to the proposal.
**Date:** 2026-09-03

**Counts:** 0 blocker · 8 major · 15 minor · 11 nit (34 findings)

---

## Screenshots

| View | Path |
|---|---|
| 1440 light | `/private/tmp/claude-501/-Users-kody-Code-patina-merged/672b3ca2-639d-4e31-bac2-40d1fa81b2b0/scratchpad/review/shot-1440-light.png` |
| 1440 dark | `/private/tmp/claude-501/-Users-kody-Code-patina-merged/672b3ca2-639d-4e31-bac2-40d1fa81b2b0/scratchpad/review/shot-1440-dark.png` |
| 390 light | `/private/tmp/claude-501/-Users-kody-Code-patina-merged/672b3ca2-639d-4e31-bac2-40d1fa81b2b0/scratchpad/review/shot-390-light.png` |
| 390 dark | `/private/tmp/claude-501/-Users-kody-Code-patina-merged/672b3ca2-639d-4e31-bac2-40d1fa81b2b0/scratchpad/review/shot-390-dark.png` |

Supplementary full-page and section captures in the same directory: `full-1440-light.png`, `full-1440-dark.png`, `tall.png` (1440×22000), `tall2.png` (1440×32000), `talld.png` (dark), `mobile-390-light-full.png`, `mobile-390-dark-full.png`, and crops `crop-L1..L3`, `t-11000`, `t-13500`, `t-16000`, `u-20500..u-30000`, `d-11000`, `d-13500`, `m-4000..m-23000`, `m2-15500..m2-20000`. Wrappers: `wrap-light.html`, `wrap-dark.html`, `mob-light.html`, `mob-dark.html`; overflow diagnostics `diag390.html`, `diag390b.html`.

---

## A. RENDER

**Method.** Wrapped the file in the publish-time skeleton (charset, viewport, reset with `img{max-width:100%}` and `[hidden]{display:none!important}`), one copy plain and one with `data-theme="dark"` on `<html>`. Rendered with `Google Chrome --headless=new`. Two harness notes:

1. Chrome refuses to start without a writable `--user-data-dir` in this sandbox, and needs `--no-sandbox` plus `--virtual-time-budget` to terminate; profile written under the scratchpad.
2. **Headless Chrome enforces a 500px minimum window width** — a probe page reported `innerWidth=500` for `--window-size=390,300`. A direct 390 screenshot is therefore the left 390px of a 500px layout and shows false clipping. The real 390 views were produced by loading the page inside a 390px-wide `<iframe>` on a 500px page (`mob-light.html` / `mob-dark.html`), which is what `shot-390-*.png` contain.

**Parse.** `--dump-dom` returns 154,889 bytes of well-formed DOM. The single inline `<script>` executes: the DOM dump shows `role="radio"` on 3 elements with `aria-checked` set (1 true, 2 false), which only happens inside the IIFE. No console errors observed.

**What renders correctly**

- Playfair Display, Newsreader and DM Mono all load and are visibly applied (display headings, serif body, mono eyebrows/refs). No fallback flash to system fonts.
- Masthead is proportionate — not too tall; `clamp(2.6rem,6vw,4.4rem)` behaves at both widths.
- The running index is a sticky left rail only at ≥1100px (`.shell` becomes a 210px grid column). At 390 it is a plain block at the top of the document. It never overlays content on mobile.
- All 15 mock panels render: arrival fold, artifact plate, weighing pair, act panel with ruled sign-line and scored press, proposal-rail panel, lock-screen phones, before/after email pairs, composer panels, iOS Record rows.
- The **stamp gallery renders fully** — 11 cells, doubled vs single borders visibly distinct, `struck` (Withdrawn) strike-through present, `upright` vs −2° rotation distinguishable, tie-lines and signer name present. Legible in both themes.
- The **spine demo renders** its static state (top rule, clay caps, gate box, ruled press) in both themes — but see F-02 for its interactive payoff.
- No horizontal page scroll at 1440. All wide tables are inside `.tablewrap{overflow-x:auto}` and clip themselves.
- Dark theme: backgrounds, rules, stamps and pull-quotes all invert coherently. Nothing is parked invisible; every `hidden` element (`#act-sealed`, `#sealedBox`) is a deliberate demo state.

**Render defects** — F-15 (3px horizontal overflow at 390), F-16 (sub-AA contrast on `--faint` text in both themes), F-17 (three columns of the proposal table off-screen at 1440), F-18 (nowrap `.ref` blows out "The map" column widths), F-19 (mobile table columns collapse to ~95px), F-33 (large dead space under the shorter panel in two-column rows).

---

## B. STRUCTURE & CSS

Machine-checked; results below.

| Check | Result |
|---|---|
| Every `var(--x)` defined on bare `:root` | **PASS** — 0 undefined. 2 defined-and-unused (`--sage`, `--sage-ink`, F-26). |
| Dark media block guarded `:root:not([data-theme="light"])` | **PASS** |
| `:root[data-theme="dark"]` block present | **PASS** |
| Both dark blocks redefine the identical token set | **PASS** — 20 tokens each, sets equal |
| No colour defined *only* inside a dark/media block | **PASS** |
| `body` has an explicit token background | **PASS** — `background:var(--ground)` |
| `<title>` near top | **PASS** — line 1 |
| No `<html>` / `<head>` / `<body>` / `<!DOCTYPE>` | **PASS** — the one `<head` hit is `<header class="masthead">` at line 543 |
| Every table inside `overflow-x:auto` | **PASS** — 15 tables, 15 `.tablewrap` |
| Tag balance (html.parser, void-aware) | **PASS** — 0 errors, 0 left open |
| External resources | **PASS** — only `fonts.googleapis.com` + `fonts.gstatic.com` (lines 2–4). One inline `<script>`, no external JS |
| `prefers-reduced-motion` honoured | **PASS in both layers** — CSS kills all animation/transition (line 517); JS reads the media query and completes the hold instantly (line 1762, 1795), matching the page's own stated rule at line 891 |
| `box-shadow` anywhere | **PASS** — 0 |

---

## C. VISION COMPLIANCE OF THE PAGE ITSELF

| Check | Result |
|---|---|
| Emoji (incl. dingbats, VS16) | **0** |
| `box-shadow` | **0** |
| Red/green hexes as status | **0.** No `--sage`/green is applied anywhere; `--terracotta-ink` appears only on the `Declined` stamp, with no green counterpart, exactly as the page argues |
| Numeric badges in the page | **0** rendered; all 17 "badge" mentions are about retiring them |
| "AI" as a label | **0** |
| Em-dashes in body prose | **0.** All 12 `&mdash;` are signature dashes in email mocks (998, 1009, 1020, 1027, 1050), a pull-quote attribution (808), an em-dash inside quoted current copy (630, 831, 985, 1266), or a table "no value" placeholder (733, 734). Clean. |
| "gate" in homeowner-facing proposed copy | **1 violation** — line 934, see F-01. All other 12 uses are internal/designer-side, which the ruling permits |
| "task" in homeowner-facing proposed copy | **0** — every use is meta or quotes copy being retired |
| "decision" where "approval" is ruled | **3 self-violations** — see F-13 |

---

## D. FACT FIDELITY

37 claims checked against `discovery/01..04`, `ux/01..04`, `docs/vision/VISION.md`, `docs/design/workflow-completion/APPROVAL-AUTHORITY-CONTRACT.md`, and the repo (read-only).

### OK (28)

| # | Claim (line) | Verdict |
|---|---|---|
| 1 | Appendix word counts: 6,545 / 7,646 / 3,884 / 6,576 / 6,315 / 8,222 / 7,192 / 6,484, total **52,864** (1684–1697) | **OK** — `wc -w` matches every figure exactly |
| 2 | `client_decisions_stage2_shape_check` at `00463:34-49` (620) | **OK** — constraint is lines 34–49 |
| 3 | Guarded `project_artifact_v1` branch at `00464:1547-1558` (672, 1322, 1707) | **OK** — exactly those lines |
| 4 | `DecisionsAPIClient.swift:360` posts to that RPC with null note and null quantity (672, 1322) | **OK** — RPC URL at :360, `p_client_note`/`p_quantity` = `NSNull()` |
| 5 | Zero `ctaButton`/href in `decision-notify.ts` (563, 644, 1709) | **OK** — grep count 0; "Open your Patina dashboard" at :355, :381, :425 |
| 6 | `portalBase()` resolves `DESIGNER_PORTAL_URL`, default `app.patina.cloud`, for every recipient; `branded-email.ts:69-79,161-164` (646, 1268) | **OK** — both ranges correct |
| 7 | First send and reminder share one `decision_required` render (564, 645, 1710) | **OK** — disc 02 §1A/§9.2 |
| 8 | Today's email body quoted verbatim, incl. `It's due in approximately {N} hour(s).` and `— Patina` (991–998) | **OK** — matches disc 02:21 line for line (but see F-28 on "verbatim") |
| 9 | Bell query `channel IN (in_app, push)` against one in-app + one push row (565, 647) | **OK** — `NotificationsAPIClient.swift` `in.(in_app,push)`; 00534 writes both |
| 10 | `SettingsService.setNotificationsEnabled` writes prefs only, never calls `requestAuthorizationAndRegister()` (566, 648) | **OK** — ux 04 §5.3 verbatim; `SettingsView.swift:110-118` and `SettingsService.swift:123-130` both correct |
| 11 | `DeepLinkHandler.handle` queues only at `phase == .launching`; signed-out resolves `.auth` (567, 649) | **OK** — ux 04 §5.4 |
| 12 | `NotificationRouter` cases annotated "Forward-compatible: no edge function emits entity_type"; `NotificationRouter.swift:60-109` (650, 1295) | **OK** — comments at :66 and :72, function spans 60–109 |
| 13 | Green check + "Signed by {name} on {date}." on `/proposals/[id]`, `proposals/[id]/page.tsx:182-252` (657, 1394) | **OK** — `CheckCircle2 text-patina-sage` at :187 |
| 14 | `isMine ? 'You' : 'Designer'` at `decisions/[id]/page.tsx` ~108-110 (653, 1340) | **OK** — line 109 |
| 15 | "Your review is complete. The studio is preparing the approval for issue." ; `decisions/page.tsx:120-232` (654, 1329) | **OK** — line 141 |
| 16 | `CountBadge` + `aria-label="Approval tasks, {N} need attention"`; `client-header.tsx:124-129` (656, 748, 1457) | **OK** — :124 and :129 |
| 17 | Six parenthesised buckets on `/decisions` (732, 1089) | **OK** |
| 18 | `HouseRecord.state(for:now:)` ~440-452 and `HouseRecordCard.swift:406-411` (1277) | **OK** — `state(for:now:)` at 440; `PatinaColors.error` at 410 |
| 19 | `HouseRecordBuilder.title(for:)` at `HouseRecord.swift:407-419` (1358) | **OK** — exact |
| 20 | `BadgeCountService.swift:73` = `attentionCount` (1457) | **OK** — exact |
| 21 | `DecisionPushHandler.swift:44` = warning-triangle icon for overdue (1277) | **OK** — `exclamationmark.triangle.fill` at :44 |
| 22 | `buildApnsPayload` at `apns-send/core.ts:63-73` (1439) | **OK** — function 61–73 |
| 23 | `the-making.tsx:274-319` = `ProjectApprovalGate` (1466) | **OK** — declared at :274 |
| 24 | `DecisionDetailView.swift:189-281` = option cards (1511) | **OK** — `optionCard` at :189 |
| 25 | 00466 `(decision_id, kind)` conflict/re-arm semantics (1259) | **OK** — `ON CONFLICT (decision_id, kind)` at :98 |
| 26 | Contract: Patina "must not create or dual-write another approval aggregate" (593) | **OK** — contract line 9, verbatim |
| 27 | "Five are carried from APPROVAL-AUTHORITY-CONTRACT.md" (1548) | **OK** — contract lines 157–165 list exactly 5 opens, and exactly R1/R3/R10/R11/R14 are tagged "carried from the contract" |
| 28 | Prior audit: fourteen findings; F01 Critical zero-dollar payment schedule; F05 High date shift; F07 High 83% stale send; stamp "Production unchanged. No deployment was performed" (1725–1751) | **OK** — all four verified in `artifacts/patina-client-journey-audit-2026-07-31/bundle.html` and the remediation bundle |
| 29 | Proposed email copy for events 1, 4, 5, 6 (1002–1050) | **OK** — matches ux 03 §6.1 verbatim, with em-dashes correctly re-punctuated |
| 30 | Lane credits, all 30 rows, and the dedup note at 1517 | **OK** — every P-number resolves; ux 01 P1–P14, ux 02 P1–P12 and ux 04 P1–P12 are each fully accounted for, with ux 04 P7 (PencilKit) correctly carried as a refusal |
| 31 | "Sixteen rulings, consolidated from thirty-nine" (1548) | **OK** — 9 (ux 01 §8) + 9 (ux 02 R-C1..C9) + 13 (ux 03 §9) + 8 (ux 04 R1..R8) = 39; page has R1–R16 |
| 32 | Vision quote: iOS is "a marketing and qualification instrument the studio owns, not a consumer product in its own right" (1665) | **OK** — VISION.md:22 via ux 04 R1 |
| 33 | Three canonical outcomes are approved / changes_requested / needs_discussion (673, 1321) | **OK** — `ProjectApprovalOutcome` in `use-project-approvals.ts` |
| 34 | Zero-delta rule quoted from `project-approval-model.ts` (816) | **OK** — comment verbatim at :85-86 |
| 35 | Mock dates: Thursday Oct 8 2026, Tuesday Oct 6 2026 (1008, 1049) | **OK** — both weekdays correct |
| 36 | 64-character checksum in the mock (995) | **OK** — exactly 64 hex chars |
| 37 | `single-pane` flag exists and fails closed (1112, 1466) | **OK** — `useFeatureFlag('single-pane')` in two client-portal components |

### WRONG (7)

| # | Claim | Correct value |
|---|---|---|
| W1 | "eleven states" / "Eleven states, one stamp" (577, 632, 901, 916, 1390, 1531) | Source `ux/02` §5 is titled **"One grammar, ten states"**, P6 is **"Ten states, one stamp"**, and the component spec says `state` (the **ten** of §5). The 11th is `Reviewed`, taken from ux 02 R-C9 — a defensible addition, never declared. See F-04. |
| W2 | "two of the three answers leave no mark" (559) | One of three. The page's own line 632 and D8 say Approved and Held stamp; only changes-requested has no mark. |
| W3 | Seam "documented at `00534:120-133`" (1286, 1711) | The `⚠ SEAM, NOT A DEFECT IN THIS FILE` comment is **00534:93-103**. Lines 120–133 are the function's DECLARE block. |
| W4 | Bell query at `NotificationsAPIClient.swift:135-145` (1286) | `channel=in.(in_app,push)` is at **:65** and **:105**. The migration's own comment names **:64-65**. Line 135–145 is date parsing. |
| W5 | FF&E unblock at `00464:770-777` (1421) | **00464:745-753** (`UPDATE public.project_ffe_items … WHERE blocked_by_decision_id = p_decision_id`). 770–777 is the `project_approval_action_receipts` insert. |
| W6 | `decision-notify.ts` "artifact citation block `:260-278`" (1268) | The `Approval artifact:` / `SHA-256 checksum:` block is at **:296-310**. 260–278 is `existingEmailLogStatus`. |
| W7 | `notify_client_attention` at `00534:150-222` (1295) | Function is declared at **:110** and ends before the REVOKE at **:219** (≈110-217). |

W3–W7 are inherited from `discovery/04` and `ux/04`, which carry the same numbers; the synthesis repeated them without re-checking. W3 and W4 matter most because they are the *only* pointers proposal #5 gives an implementer.

### IMPRECISE / UNSUPPORTED (2)

| # | Claim | Note |
|---|---|---|
| U1 | "The designer's own side already speaks it in prose" / "the designer side already speaks it at `project-approval-model.ts:87-115`" (630, 834, 1376) | `formatGateImpact` returns `"+$4,200 · +3 days · lead time unchanged"` — a middot-joined fragment, not prose. The line range is right; the characterisation is overstated, and it is the load-bearing argument for proposal #15 in three places. |
| U2 | `PushTokenService.swift:92-115` (1304); `DeepLinkHandler.swift:60-71` (1313); `AppCoordinator.swift:239-256` (1313); `use-project-approvals.ts:13-26` as "`disposition` derivation" (1484) | None matches the source's own ranges (`:103-109`/`:112-115`; `:64-71`; derivePhase `:259-271` + drain `:243-246`). `use-project-approvals.ts:13-26` is a type union, not a derivation. |

---

## E. SYNTHESIS QUALITY

**1. Leads with the answer — yes.** §1 is a genuine executive answer: what already works, five named floor defects, seven moments, three waves, in under 400 words. A reader can stop after §1 and act.

**2. Lane conflicts resolved per the stated rulings — yes, all seven.**

- Typed name + scored press on every surface: settled in §4 step five (840), R1 (1554), proposal #18. Correctly notes `review_method: 'portal_clickthrough'` survives so no migration is needed.
- Drawn signature declined: three consistent places (840, 1142, R2 at 1561), with the reasoning recorded so it can be answered with a link. Correctly overrides ux 04 P7 and the `DrawnSignatureCanvas` component row in ux 04 §6.
- First-notice split without enum widening: proposal #2 states **"No enum widening"** in bold and gives the derivation (`reminder_sent_at IS NULL`), with the enum-widening path as a labelled fallback carrying the `(decision_id, kind)` constraint and 00466 re-arm caveat. Exemplary.
- Unfold in Wave 2, flag-gated: §4 step one (760), proposal #23, R12, and the Wave 2 sequencing note (1532) all agree, and all four say it is not a floor fix and nothing depends on it.
- Badges retired, springboard badge a ruling: proposal #24 retires both in-product badges; R5 isolates the springboard badge as a different object and correctly separates "correct" from "permitted".
- Overdue never red: proposal #4, D12, the blacklist, and the iOS table all agree; the quiet-hours bypass is explicitly preserved.
- Vocabulary ruling: §3 (739-751) matches ux 03 §9 #12 and extends it to "task". **Undermined by the page's own naming — see F-13 — and by an unretired live violation, F-01.**

**3. Actionable with real dependencies — yes, strongly.** Every one of the 30 rows names files, RPCs, migrations and the constraint that must survive ("the legacy route must keep working for email arrivals", "the intent pinned by `ProposalDetailStatusIconTests` must survive the swap", "Any stated timing must be true, never a promise"). Blocking edges are explicit and correct: #6 blocked on #5, #22 blocked on #5 and #6, #29 blocked on R3. The Wave 1 ordering argument (double-count before push, both before lock screen) is the right one. Weaknesses: the citation errors in W3–W7 land inside these dependency cells, and #1/#3 are the same URL-base edit split across two rows (F-23).

**4. Rulings ≤16 and deduplicated — yes.** 39 → 16 with no duplicates; ux 01 §8 #2 and #3 correctly fuse into R3; ux 04 R3 and R5 fold into R1/R2; ux 03 #7 and ux 01 #7 fold into R9. Each carries a recommendation and a named ruler, which is the point.

**5. Marketing fluff — largely absent.** The register is restrained and every superlative is attached to a mechanism. Two lines drift ("genuinely good design", "the single most vision-aligned change in this section"), which is acceptable in a proposal.

**6. Stands alone — mostly.** A reader who has not seen the sources can follow everything except the "Lanes" column and refs like `ux 01 M3` (F-32) and `ux 02 R-C9`, which are opaque. The `disc NN §X` refs are at least self-describing.

**Padding and repetition.** §2's "The seven moments, today and polished" table (622-636) restates §4's step narrative and is itself restated by §5's per-surface tables; the `/decisions` row in §5 (1087-1091) is proposal #24 (1455) reworded; the weighing example appears three times (630, 822-834, 1212); the overdue sentence three times (1030, 1275, 1610); the drawn-signature decline three times (840, 1142, 1561). Some of that is deliberate layering, but §2's table and §5's first two rows are the clearest candidate for deletion. See F-22.

---

## Findings

| id | sev | conf | location | what is wrong | fix |
|---|---|---|---|---|---|
| **F-01** | major | high | 934 (mock); ruling at 747 | The arrival-of-the-consequence mock ships `A gate · the line stops until you sign` as proposed homeowner-facing copy on The Making. That string is **live client copy today** (`apps/client-portal/src/components/making/spine-gate.tsx:36`, with an `acceptance` twin at :37) and it directly breaks the page's own ruling "**Gate** — Never in front of a homeowner." No defect row covers it and none of the 30 proposals retires it. | Add it to the defect ledger, put its retirement inside proposal #21 or #25, and relabel the mock (e.g. `The line stops until you sign`). |
| **F-02** | major | high | CSS 445; markup 929; JS 1855, 1862 | The spine demo's payoff never draws. `.line-mid` is styled **only** by `.spine.closed .line-mid`, and nothing ever adds `closed` to `#spineDemo`. The JS toggles `spineMid.style.display` on an otherwise unstyled `<span>`, so completing the hold produces a zero-height transparent box — "the line resumes", the whole argument of step seven, is invisible. | `spineDemo.classList.add('closed')` on complete and `.remove('closed')` on replay, or drop `.closed` from the selector and drive it with the inline `display` alone. |
| **F-03** | major | high | 847-849 (data-word), 863-871 (sealed), JS 1765-1782, 1834-1837 | `data-word="Approved|Returned|Held"` is written on the three choice rows and **never read**. The sealed state is hardcoded to the `s-approved` stamp, "Approved · 3 September 2026", and the approval-specific afterglow sentence. Pick "Hold it for a conversation", hold, and the demo stamps APPROVED — the mock disproves the page's own "three doors of equal weight, three stamps" argument. | Read the selected row's `data-word` in the completion handler and swap the stamp class, stamp word, said-line and afterglow sentence. |
| **F-04** | major | high | 577, 632, 898-916, 1390, 1531 | Two unannounced divergences from the cited source. (a) "eleven states" vs `ux/02` §5 "**ten** states"; the 11th, `Reviewed`, comes from ux 02 R-C9 and proposal #10 but is never identified as the addition. (b) The source's state names **Changes requested** and **Needs discussion** are silently renamed **Returned** and **Held** in the gallery and in the rewritten aging sentence (916), while the same page keeps calling the outcomes "Approved, Changes requested, Needs discussion" at 673 and 1321. No outcome→stamp-word mapping is ever given. | Say "ten from the ceremony lane plus `Reviewed`, from R-C9"; add one line mapping `changes_requested → RETURNED` and `needs_discussion → HELD`; state whether `Reviewed` ages. |
| **F-05** | major | high | 731, 732 | Both "Closed by" cross-references in the *Vision refusals honored* table point at the wrong proposal. "Dashboards and tab or zone UI → Proposal 23" — #23 is the arrival fold; the `/decisions` de-bucketing is **#24**. "Red and green status → Proposals 4 and 16" — #16 is the three doors; the green check and the sage `SIGNED` retire in **#17**. | 23 → 24; 16 → 17. |
| **F-06** | major | high | 559 vs 632, 651 | The lede says "two of the three answers leave no mark". The page's own moment-6 row and D8 say Approved and Held both stamp today; only changes-requested has no mark. | "one of the three answers leaves no mark". |
| **F-07** | major | high | 1286, 1711 | The two pointers proposal #5 gives are both wrong. The seam comment is at **00534:93-103**, not `:120-133`; the bell filter is at `NotificationsAPIClient.swift:65` and `:105`, not `:135-145` — and 00534's own comment says `:64-65`. An engineer following the dependency cell lands in a DECLARE block and a date parser. | Correct to `00534:93-103` and `NotificationsAPIClient.swift:60-70, :100-110`. |
| **F-08** | major | medium | 1421 | The receipt's "released work" clause is sourced to `00464:770-777`; the `project_ffe_items` unblock is at **00464:745-753**. 770–777 is the action-receipt insert. This is the data source for the only sentence in the receipt that makes a factual claim to the homeowner. | Correct to `00464:745-753`. |
| **F-09** | minor | high | 1268 | `decision-notify.ts` "artifact citation block `:260-278`" — that range is `existingEmailLogStatus`. The `Approval artifact:` / `SHA-256 checksum:` block is at `:296-310`. | Correct the range. |
| **F-10** | minor | high | 1295 | `notify_client_attention (00534:150-222)` — the function is declared at `:110` and ends before the REVOKE at `:219`. | `00534:110-217`. |
| **F-11** | minor | medium | 1304, 1313, 1484 | Four ranges that match neither the source lane nor the code: `PushTokenService.swift:92-115` (source: `:103-109`, `:112-115`); `DeepLinkHandler.swift:60-71` (source and code: `:64-71`); `AppCoordinator.swift:239-256` (source: `:259-271` and `:243-246`); `use-project-approvals.ts:13-26` described as "`disposition` derivation" when it is a type union. | Re-derive from the lanes; the lanes are right in each case. |
| **F-12** | minor | medium | 630, 834, 1376 | "The designer's own side already speaks it in prose" is asserted three times as the justification for proposal #15. `formatGateImpact` (`project-approval-model.ts:87-115`) actually returns `"+$4,200 · +3 days · lead time unchanged"` — a middot-joined fragment in the same register as the client's table. | Reword to "already states it in words rather than columns"; the argument survives, the overstatement does not. |
| **F-13** | major | high | 1 (title), 756 (§4 heading), 1471/1594/1601/1751 | The page rules that "decision" is used **only** for an option choice between named alternatives, then titles itself *The Decision, Delivered*, names §4 "The Decision", and — the one that actually bites — names the **homeowner-facing keepsake** "The Record of Decision", printed on the artifact she puts in a drawer. A proposal that asks Kody to ratify a vocabulary ruling should not break it on its own cover and on the one physical object the ruling governs. | Rename the keepsake (e.g. "The Record of Your Approval" / "The Record"); either rename the page or add one line saying the title is internal shorthand, deliberately not client copy. |
| **F-14** | minor | high | 725 vs 729-735 | "**Four** refusals from VISION.md §6 govern this work" introduces a table with **five** rows (Badges, Red/green, Dashboards, Shadows, Engagement metrics). | "Five refusals", or drop the engagement-metrics row. |
| **F-15** | minor | high | 563-567; CSS 483-486 | At 390px the page scrolls horizontally: measured `document.body.scrollWidth = 393` against a 390 viewport. Cause: `.deck li` is `grid-template-columns:2.2rem 1fr` and the 1fr track cannot shrink below the min-content of `SettingsService.setNotificationsEnabled` (337px) in F4. Text in F1–F5 runs to the exact viewport edge with no right gutter. | `.deck li > span:last-child{min-width:0;overflow-wrap:anywhere}` or `.mono{overflow-wrap:anywhere}`. |
| **F-16** | minor | high | CSS 21 (`--faint`), used at 209, 248, 384, 386, 434, 456, 471 etc. | `--faint` is `#9A938A` on `#FCFAF6` (**2.9:1**) and `#7C7469` on `#2A2622` (**3.26:1**) — both well under WCAG AA 4.5:1, and it is applied at 9–11px to `.ref`, `.recorded`, `.hint`, `.panel-cap`, `.stampcell .note`, `.masthead-meta b`, `.index h2`. That is *every source citation*, every panel caption, and the "Consequence:" line in the verified-fact panel. `--muted` is 4.47:1 — borderline. Visibly dim in both themes (see `shot-1440-dark.png`, `crop-L2.png`). | Darken `--faint` to ≈`#7E766C` light / lighten to ≈`#948B80` dark, or promote the content-bearing classes (`.recorded`, `.ref`) to `--muted` and darken `--muted` slightly. |
| **F-17** | minor | high | CSS 251-254; table 1237-1515 | The 9-column proposal table has min-widths summing to ~73rem (1168px) plus five unconstrained columns, against a ~1060px main column at 1440. **Effort, Wave and Lanes are entirely off-screen** and the Dependencies header is cut mid-word, with no visual scroll cue. Those three columns are what a reader most needs from a proposal list. | Reduce `w-dep` to 14rem and `w-what`/`w-why` to 16rem, or lift Effort and Wave into the row's first cell (`M · Wave 2`). |
| **F-18** | minor | medium | CSS 209; table 597-618 | `.ref{white-space:nowrap}` applied to `client_decisions, approval_contract = project_artifact_v1` forces "The map"'s first column to ~380px, squeezing Origin and Notice to ~90px so their sentences wrap to 12 lines each (`crop-L1.png`). | Allow wrapping for `.ref` inside table cells, or shorten that ref to `client_decisions · project_artifact_v1`. |
| **F-19** | minor | medium | CSS 251; blacklist 704-721, vocabulary 742-750 | At 390px `w-name{min-width:15rem}` (255px) leaves ~95px for the second column, so the blacklist wraps to 2–3 words per line over 10+ lines per row (`shot-390-light.png`). The tables are technically readable but painful on the surface the page keeps insisting matters. | Drop the `w-*` min-widths under `@media (max-width:600px)`, or restyle two-column tables as stacked definition rows on small screens. |
| **F-20** | minor | medium | 765 vs 544, 1009, 1027, 1050, 1168 | The arrival-fold letterhead reads **"Kochaver Design"**; the masthead, every email signature and the household naming table read **"Middle West Studio"** (designer "Leah Kochaver"). One studio, two brand names, in the mock whose whole point is that the studio's name is on the letterhead. | Make the letterhead "Middle West Studio". |
| **F-21** | minor | medium | 1234, 1517, 1525, 1531, 1537 | "**Twenty-nine** proposals" heads a table of **30** numbered rows; 1517 reconciles it ("thirty rows, twenty-nine proposals plus the verified-fact item at #9") but §9 then calls all thirty "Proposals 1 through 12 / 13 through 23 / 24 through 30". | Either call it thirty proposals throughout, or repeat the #9 caveat in §9. |
| **F-22** | minor | medium | 622-636; 1087-1091 vs 1455; 630/822-834/1212; 1030/1275/1610; 840/1142/1561 | Substantial repetition. §2's "seven moments, today and polished" table restates §4's step narrative and is restated again by §5; the `/decisions` row of §5 is proposal #24 reworded; the weighing example, the overdue sentence and the drawn-signature decline each appear three times. | Cut §2's table down to the "Today" column (it is the only new information there) and delete the first two rows of §5's Web-legacy table, which #24 and the §4 steps already carry. |
| **F-23** | minor | medium | 1244-1252, 1262-1270 | Proposals #1 and #3 are the same edit split in two: #1 adds a CTA pointing at `client.patina.cloud` plus a `CLIENT_PORTAL_URL` env; #3 resolves `portalBase()` per recipient audience so the footer stops pointing at `app.patina.cloud`. Neither cross-references the other, and #3 will collide with #1's env work. | Mark #3 "lands with #1" or merge the URL-resolution half into #1. |
| **F-24** | nit | high | 846; JS 1766-1782 | The three choice rows get `role="radio"` but `#choices` has no `role="radiogroup"` and there is no arrow-key navigation, so assistive tech announces three orphan radios with no group name and no position. | Add `role="radiogroup" aria-label="Your answer"` on `#choices` and wire ArrowUp/ArrowDown. |
| **F-25** | nit | high | 525 vs 546 | The contents nav's `<h2>Contents</h2>` precedes the document's only `<h1>`, so the outline opens at level 2. | Make it a `<p class="eyebrow">` with `aria-label` already on the `<nav>`, or move the nav after the masthead. |
| **F-26** | nit | high | 16-17, 40-41, 62-63 | `--sage` and `--sage-ink` are defined in all three token blocks and used nowhere. Dead tokens — and the page's own argument is that sage is being removed from the ceremony. | Delete them. |
| **F-27** | nit | medium | 952 | The demo's reset control reads "Reopen the gate", using the word the page rules out. It is the proposal's own chrome, not product copy, but it is the string most likely to be lifted. | "Replay the gate demo" or "Reopen". |
| **F-28** | nit | medium | 990-998 | The panel is headed "Today, verbatim" but fills the live template with invented values — "46 hour(s)", a specific 64-char checksum, "Kitchen and back hall plan set". The adjacent panels correctly say "Example values." | Head it "Today, verbatim template · example values", matching line 812. |
| **F-29** | nit | medium | 655 | D12's evidence says `HouseRecord.state(for:now:)` "reserves `PatinaColors.error` for overdue". That function returns the `.overdue` case; the colour is applied in `HouseRecordCard.swift:410`. Proposal #4's dependency cell gets this right; the ledger row does not. | Cite both, as #4 does. |
| **F-30** | nit | medium | 916 | The aging paragraph names which states age and which stay at full ink, but never places the new eleventh state (`Reviewed`) in either group. The source's terminal list has seven members. | State it: `Reviewed` is terminal and ages, or it is muted and exempt. |
| **F-31** | nit | low | 1251-1512, esp. 1404, 1413 | The Effort column mixes three formats: single letters, "M web, L iOS", and "M to L". | One convention; put per-surface splits in the dependency cell. |
| **F-32** | nit | medium | 1368 | "ux 01 M3" is the only lane credit that uses a Moment number instead of a P-number, and is unresolvable without the source. | "ux 01 Moment 3". |
| **F-33** | nit | low | CSS 269-270, 439-440; render at 1440 | In `.panelrow-2` and `.spinewrap` the shorter panel leaves large dead space — ~700px under the spine demo, ~400px under the proposal-rail panel (`t-11000.png`, `t-13500.png`). Cosmetic on a page that is otherwise tightly set. | `align-items:start` is already implied by the grid; consider `align-content` or a shorter `min-height` on `.spine`. |
| **F-34** | nit | medium | 1700 | "Every line of client-facing copy quoted as a proposal in this document was written against those two [VISION.md and patina-brand-voice]." The proposed copy is lifted verbatim from `ux/03` §6.1; the claim describes the copy lane's process, not this page's. | "Every line of client-facing copy quoted here was written by the copy lane against those two." |

---

## What is genuinely strong

Recorded so the findings above are not read as a verdict on the whole:

- **Token discipline is perfect.** Zero undefined variables, both dark blocks identical, no colour defined only inside a media query, body background tokenised. That is rarer than it should be.
- **Reduced motion is honoured in both layers** — CSS kills transitions and the JS completes the hold instantly rather than forcing a longer gesture, which is exactly the rule the page states at line 891.
- **The dedup work is real and checkable.** All 38 lane proposals across ux 01/02/04 map onto the 30 rows with none dropped and none double-counted, and the merge note at 1517 is accurate.
- **The word counts, the 39→16 ruling consolidation, the five contract-carried rulings, and the F01/F05/F07 audit claims all verify exactly.**
- **Proposal #2's "no enum widening" reasoning, with a labelled fallback carrying the unique-constraint and 00466 re-arm caveat, is the model the rest of the dependency cells follow.**
- The "verified in code" panel correcting the journey lane's "unclear" is right on all three sub-claims, and the appendix's honest "Unclear" table (1715-1719) is the most trustworthy thing in the document.
