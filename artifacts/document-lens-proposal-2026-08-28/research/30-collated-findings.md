# 30 — Collated findings · The Document, The Smart Lens (2026-08-28)

Collator seat (Opus). Source: the ten panel reports `20-panel-u1.md` … `29-panel-e1.md`,
**231 raw findings**, all ten read from disk. **164 canonical findings** after merge;
**67 findings absorbed** into 33 merge groups. **Zero findings dropped** — every one of the 231
carried both a `scroll_state` and at least one task id, so §4's out-of-scope rule never fired.

Merge rule applied literally: two findings merge only on the same defect, same surface, **same
scroll state**, and only across widths or states where a contributing seat itself scoped the finding
`all`. Several visibly-identical defects therefore stay as separate rows because no contributor
scoped them `all` — each such non-merge is logged in §3 so the reader can see the seam.

Severity ladder: `blocker` 4 · `high` 3 · `medium` 2 · `low` 1.
Counts: **7 blocker · 50 high · 68 medium · 39 low**.

---

## 1. The findings

| id | title | seats | sev | conf | width | state | blocks | frame cost | tasks | ruled |
|---|---|---|---|---|---|---|---|---|---|---|
| F01 | First region head lands a full frame below the fold | U1 U4 P1 P2 P3 P4 U5 | blocker | 0.95 | 1440 | top | clutter | 1005 | T1 T3 T4 T5 T6 T9 T10 | — |
| F02 | Studio puck covers the mobile bar's orientation zone | U1 U5 P1 P2 P3 P4 E1 | high | 0.85 | 390 | all | orientation | 77 | T1 T3 T9 T11 T15 T16 | D8 |
| F03 | Studio drawer labels overprint at 1280 | U1 U5 P1 P2 P4 E1 | medium | 0.80 | 1280 | all | crowding | 60 | T1 T3 T9 T11 T12 T13 | D8 |
| F04 | Ticket pin/fold is a single-frame cut with no hysteresis band | U1 U2 U4 P1 E1 | blocker | 0.95 | all | seam | motion | 283 | T3 T4 T5 T6 T8 T9 T10 T15 | R99 |
| F05 | Seed has 3 FF&E lines / 0 rooms — every FF&E finding understates real scroll co… | U4 P2 P3 P4 U5 | medium | 0.90 | all | all | information-loss | 400 | T3 T4 T8 T9 | — |
| F06 | No door anywhere answers 'everything in install' | P1 P2 P3 P4 | blocker | 0.80 | all | all | information-loss | 900 | T1 T2 | D1 |
| F07 | Stage word breaks mid-syllable in the glyph rail | U1 U5 E1 P1 | high | 0.95 | 1280 | all | crowding | 500 | T3 T4 T5 T6 T10 T11 | I136 |
| F08 | Folding a region drops keyboard focus to <body> | U2 U4 P1 E1 | high | 0.90 | all | mid | orientation | 470 | T3 T4 T7 T8 T9 T10 | — |
| F09 | Boards, drawings, spec and people vanish below the top | P1 P2 P3 | high | 0.90 | all | seam | information-loss | 300 | T5 T6 T15 | — |
| F10 | Five money statements, four numbers, one screen | U1 U2 P1 | high | 0.90 | all | all | clutter | 260 | T7 T9 T13 | I148 |
| F11 | One screen scrolled and nothing has condensed yet | U1 U3 P1 | high | 0.90 | 1440 | seam | clutter | 547 | T3 T4 T10 | — |
| F12 | On a proposal the rail is almost entirely empty | U3 P1 U1 | high | 0.90 | 1440 | all | information-loss | 657 | T1 T3 T7 T12 | I136 |
| F13 | Below the fold the paper stops naming the job | U1 P1 | blocker | 0.95 | all | all | orientation | 900 | T1 T3 T4 T9 T11 T16 | I149 |
| F14 | At 390 there is no way to jump to a region | P1 U2 | blocker | 0.90 | 390 | all | information-loss | 844 | T3 T4 T8 T9 T10 | I136 |
| F15 | At 1280 the spine is six unlabeled bars, no words at all | P3 P4 | blocker | 0.90 | 1280 | all | orientation | 300 | T2 T11 T15 | — |
| F16 | Pre-work spreads have no region DOM to index at all | U3 E1 | high | 0.95 | 1440 | top | orientation | 700 | T4 T7 T12 | — |
| F17 | The margin never changes as I move down the paper | P1 P2 | high | 0.90 | 1440 | all | orientation | 600 | T4 T9 T16 | — |
| F18 | At 1280 the margin covers the work and names itself twice | P1 P3 | high | 0.90 | 1280 | all | clutter | 900 | T9 T16 | D3 |
| F19 | Closed margin tab hides seven items behind no number | U1 U2 | high | 0.90 | 1280 | all | information-loss | 46 | T3 T7 T9 T16 | D3 |
| F20 | A proposal prints eight rows of nothing above its answer | U1 P1 | high | 0.90 | 1440 | top | clutter | 300 | T5 T6 T7 | I150 |
| F21 | Every region's spine scent disappears between 1280 and 1440 | U3 U2 | high | 0.90 | 1280 | all | information-loss | 550 | T1 T3 T7 T9 | R126 (I136 gate, ≥1440px-only mount) |
| F22 | The index lists regions but not their size or trouble | P1 U3 | high | 0.85 | 1440 | all | orientation | 160 | T1 T4 T8 T10 | I136 |
| F23 | The line shows production state but not vendor or damage state | P1 P4 | high | 0.85 | all | mid | information-loss | 120 | T4 T13 T14 | D8 |
| F24 | The dominant CLS shift is a silent late data-arrival, not motion | U4 E1 | high | 0.85 | 1440 | mid | motion | 240 | T4 T9 T10 | — |
| F25 | Drawings and Spec ticket rows are unreachable below 1440 | U5 P3 | high | 0.75 | 390 | top | information-loss | 60 | T5 T6 | — |
| F26 | The rail's biggest number is the session timer | P1 U3 | medium | 0.85 | 1440 | all | clutter | 210 | T3 T4 T11 | — |
| F27 | Five of eight ticket rows print only absence | U1 P1 | medium | 0.85 | all | top | clutter | 180 | T3 T5 T6 | I149 |
| F28 | Nine lines of prose sit above every margin item | U1 P1 | medium | 0.85 | 1440 | all | clutter | 230 | T9 T16 | — |
| F29 | Approvals emptiness printed twice on one screen | U1 P2 | medium | 0.85 | 1440 | top | clutter | 150 | T3 T4 T10 | I137 |
| F30 | The reduced-motion hook starts false and has no document consumer | U4 E1 | medium | 0.85 | all | all | motion | 283 | T3 T4 | R15 |
| F31 | Fourteen percent of every frame is read at no state | U1 U3 | medium | 0.80 | 1440 | all | clutter | 190 | T1 T3 T4 T11 | D12 |
| F32 | The 390px mobile sheet is more legible than the 1280px "compact" rail | U3 P3 | medium | 0.75 | 390 | all | orientation | 0 | T1 T2 T15 | — |
| F33 | Margin swaps from an overlay sheet to a sticky column at 1440 | U2 U4 | medium | 0.70 | 1280 | all | orientation | 0 | T3 T4 T7 T16 | D3/I21 (mobile milestone), context not constraint |
| F34 | Continuous seam height breaks every region landing | E1 | blocker | 0.85 | all | seam | orientation | 283 | T4 T9 | R99 |
| F35 | No browserslist; only Playwright declares a browser matrix | E1 | high | 0.95 | all | all | information-loss | 283 | T3 T4 | — |
| F36 | The 1500-char regex currently passes on a comment | E1 | high | 0.95 | all | all | information-loss | 810 | T3 T4 | — |
| F37 | Registering the seam var kills four var() fallbacks | E1 | high | 0.90 | all | seam | information-loss | 64 | T4 T9 | — |
| F38 | Every seam assertion is jsdom; landings are untested | E1 | high | 0.90 | all | seam | orientation | 283 | T4 T9 | — |
| F39 | The three fold voices have no non-persisting slot | E1 | high | 0.90 | all | mid | information-loss | 470 | T4 T10 | — |
| F40 | At 390 the header is a screen and a quarter | P1 | high | 0.90 | 390 | top | clutter | 844 | T3 T4 | — |
| F41 | Folding a region drops keyboard focus to <body> | U5 | high | 0.90 | all | seam | orientation | 0 | T9 | — |
| F42 | Ticket collapse is a silent 283px jump for SR users | U5 | high | 0.90 | 1440 | seam | information-loss | 283 | T3 T4 T9 | — |
| F43 | Sections/margin/drawer mobile sheets have role=dialog but no name | U5 | high | 0.90 | 390 | all | orientation | 0 | T16 | — |
| F44 | Seam height is content-dependent, not a constant | E1 | high | 0.85 | 390 | seam | information-loss | 64 | T3 | — |
| F45 | The 700ms jump lock does not own the seam's height | E1 | high | 0.85 | all | mid | orientation | 283 | T4 T9 | — |
| F46 | Two schedule doors, two names, 200px apart | P1 | high | 0.85 | 1440 | seam | orientation | 200 | T10 | I136 |
| F47 | Top band asks her to hold twenty things at once | U1 | high | 0.85 | 1440 | top | clutter | 736 | T1 T3 | — |
| F48 | Five money chips take a third of the phone frame | U1 | high | 0.85 | 390 | seam | clutter | 250 | T9 T16 | D3 |
| F49 | First FF&E line sits at eighty-two percent of the phone frame | U1 | high | 0.85 | 390 | mid | crowding | 626 | T4 T8 | I148 |
| F50 | Seam drops a third standing exception with no trace | U1 | high | 0.85 | all | all | information-loss | 22 | T10 T13 T14 | I149 |
| F51 | IntersectionObserver uses threshold:0, no rootMargin band, no debounce | U4 | high | 0.85 | 1440 | seam | motion | 283 | T3 T4 T10 | — |
| F52 | Ticket pin, triggered only by scroll, silently relocates focus | U5 | high | 0.85 | 1440 | seam | orientation | 0 | T3 T9 | — |
| F53 | The fold is the only render-cost control; FF&E is unvirtualized | E1 | high | 0.80 | 1440 | mid | clutter | 700 | T4 T8 | — |
| F54 | A folded region never shows whether she or the system closed it | U2 | high | 0.80 | all | mid | orientation | 0 | T7 T9 | — |
| F55 | Seven marks give every phase the same visual weight | U3 | high | 0.80 | 1440 | top | information-loss | 0 | T1 T3 | — |
| F56 | A return visit lands me below the job's own name | P1 | high | 0.75 | 1440 | top | orientation | 211 | T1 T3 | — |
| F57 | Plan room / Spec book leaves have no route below 1440px | P2 | high | 0.75 | 1280 | top | information-loss | 40 | T6 | — |
| F58 | The compact tier carries a third fewer working pixels | U1 | high | 0.75 | 1280 | all | information-loss | 232 | T3 T9 T16 | D12 |
| F59 | Scroll-pinned seam and a chosen fold look and read identically | U2 | high | 0.75 | 1440 | mid | orientation | 0 | T7 T9 | — |
| F60 | R99's zero-shift mechanism exists once, not where the header needs it | U4 | high | 0.75 | 1440 | seam | motion | 283 | T3 T10 | R99 |
| F61 | content-visibility containment may kill the R126 hover wash | E1 | high | 0.70 | 1440 | mid | motion | 88 | T4 | R126 |
| F62 | PO acknowledgment and damage-claim filing both require leaving the document | P2 | high | 0.70 | all | all | information-loss | 0 | T13 T14 | — |
| F63 | "PO" / "purchase order" is never printed anywhere on the document | P3 | high | 0.60 | all | all | information-loss | 0 | T13 T14 | — |
| F64 | A late-arriving fold default can close a region she is reading | U2 | high | 0.60 | all | mid | motion | 300 | T7 T9 | — |
| F65 | Damage is visible on the FF&E line; filing a claim is not reachable from there | P3 | high | 0.50 | all | mid | information-loss | 0 | T14 | — |
| F66 | Margin rail carries only Money and Time cards, never Orders/PO | P4 | high | 0.50 | 1440 | all | information-loss | 900 | T9 T13 T16 | — |
| F67 | Ledger-sheet round trip's scroll-offset preservation is unverified | P4 | high | 0.40 | all | all | orientation | 0 | T13 T14 | — |
| F68 | A condensing seam gets zero shadow budget | E1 | medium | 0.95 | all | seam | crowding | 64 | T3 T4 | D4 |
| F69 | Two e2e files pin the rail width to the pixel | E1 | medium | 0.90 | 1280 | all | orientation | 296 | T4 T11 | — |
| F70 | Contrast gate hard-codes five spine filenames | E1 | medium | 0.90 | 1440 | all | information-loss | 200 | T4 T11 | — |
| F71 | The reader's Unfold is destroyed on every pin change | E1 | medium | 0.90 | all | seam | motion | 283 | T3 T5 | — |
| F72 | E2E pins the ticket to exactly eight rows at three widths | E1 | medium | 0.90 | all | seam | information-loss | 287 | T3 T5 T6 | — |
| F73 | Region seams sit at three different gaps | P1 | medium | 0.90 | all | mid | crowding | 56 | T4 T8 | — |
| F74 | Muted ramp's lightest step has narrow headroom before 4.5:1 fails | U5 | medium | 0.90 | all | all | information-loss | 0 | T4 T9 | — |
| F75 | The index attaches by 2s query-retry, not subscription | E1 | medium | 0.85 | all | mid | orientation | 200 | T4 T9 | — |
| F76 | No contrast gate covers reduced ink on paper | E1 | medium | 0.85 | 1440 | mid | information-loss | 700 | T4 T9 | R126 |
| F77 | The foot names no job and offers no way up | P1 | medium | 0.85 | 1440 | foot | orientation | 400 | T1 T9 T11 | I137 |
| F78 | The sent state prints twice, in two tenses, with two nudges | P1 | medium | 0.85 | 1440 | seam | clutter | 230 | T7 | — |
| F79 | The needs block moves under me seconds after landing | P1 | medium | 0.85 | 1440 | top | motion | 120 | T3 T10 | — |
| F80 | The roster question is asked 2,000px from its door | P1 | medium | 0.85 | 1440 | foot | information-loss | 120 | T15 | — |
| F81 | The furniture schedule is called "Pieces," never "FF&E" or "schedule" | P3 | medium | 0.85 | 1440 | top | orientation | 0 | T4 T5 T6 | — |
| F82 | Two In-hand clocks on screen showing different times | U1 | medium | 0.85 | 1440 | all | orientation | 127 | T1 T11 | — |
| F83 | Foot spends 310px teaching a concept with no content | U1 | medium | 0.85 | 1440 | foot | clutter | 310 | T9 T13 | — |
| F84 | Rail's ink density never changes across scroll states | U3 | medium | 0.85 | 1440 | all | orientation | 0 | T1 T3 | — |
| F85 | Closed margin sheet is a nameless landmark at 1280 | U5 | medium | 0.85 | 1280 | all | orientation | 0 | T16 | — |
| F86 | Reduced motion has zero in-app toggle; OS setting only | U5 | medium | 0.85 | all | all | motion | 0 | T3 | — |
| F87 | Schedule glance drifts continuously under a moving seam | E1 | medium | 0.80 | 1440 | seam | motion | 64 | T10 | R99 |
| F88 | Density must not be a React transition | E1 | medium | 0.80 | all | mid | motion | 283 | T4 T8 | — |
| F89 | I cannot tell a shipped fold from one I chose | P1 | medium | 0.80 | all | top | orientation | 100 | T1 T3 | I136 |
| F90 | Starting a new client exists only behind a keystroke | P1 | medium | 0.80 | all | all | information-loss | 40 | T12 | D1 |
| F91 | Measurement file scores empty-state prose as active region | U1 | medium | 0.80 | 1440 | mid | clutter | 433 | T4 T8 | — |
| F92 | Foot is the least working frame on the paper | U1 | medium | 0.80 | 1440 | foot | clutter | 630 | T9 T15 | I137 |
| F93 | Four fold verbs on one screen, none says why | U1 | medium | 0.80 | 1440 | seam | orientation | 110 | T4 T10 | I136 |
| F94 | A proposal-stage document exposes zero region landmarks at all | U5 | medium | 0.80 | 390 | top | orientation | 0 | T3 T9 | — |
| F95 | Pressing Fold under forceOpen visibly does nothing | U2 | medium | 0.75 | all | all | orientation | 0 | T7 | — |
| F96 | Top ~145px of rail mixes leaving, the arc, the moment, and right-now | U3 | medium | 0.75 | 1440 | top | crowding | 145 | T3 | — |
| F97 | Boards/Money/People ticket doors need one extra tap at 390 | U5 | medium | 0.75 | 390 | top | information-loss | 60 | T5 T9 T15 | — |
| F98 | "Closing the book" is unexplained accounting idiom at the foot | P3 | medium | 0.70 | 1440 | foot | orientation | 40 | T9 | — |
| F99 | Seven marker bars are clipped by the rail edge | U1 | medium | 0.70 | 1280 | all | crowding | 373 | T3 T11 | — |
| F100 | Screen says no client and offers two client acts | U1 | medium | 0.70 | 1440 | top | orientation | 44 | T7 T16 | — |
| F101 | Margin count at 390 exists only inside the Sections sheet | U2 | medium | 0.70 | 390 | all | information-loss | 0 | T3 | — |
| F102 | Active label pair duplicates the on-page region heading | U3 | medium | 0.70 | 1440 | all | crowding | 40 | T3 | — |
| F103 | No presence indicator exists anywhere at 1180-1439 once hidden | U3 | medium | 0.70 | 1280 | all | information-loss | 40 | T1 T3 | — |
| F104 | Any new ticket transition needs its own reduced-motion sibling | U4 | medium | 0.70 | all | seam | motion | 0 | T3 T4 | — |
| F105 | Running-index aria-current changes on scroll with no announcement | U4 | medium | 0.70 | all | mid | information-loss | 0 | T3 T4 T7 T9 | — |
| F106 | Put down (Esc) needs the More menu open first at 390 | U5 | medium | 0.70 | 390 | all | orientation | 0 | T11 | — |
| F107 | "Folded" means one thing for Money, another for Schedule | U2 | medium | 0.65 | 1440 | seam | orientation | 40 | T7 T9 | — |
| F108 | An empty region's index line looks identical to a live one | U3 | medium | 0.65 | 1440 | top | orientation | 0 | T4 | — |
| F109 | A line reading only `BAND` with no object | P1 | medium | 0.60 | 1440 | seam | orientation | 40 | T4 T10 | — |
| F110 | The "never-yield" rule for red-letter/money is nowhere codified | U2 | medium | 0.60 | all | top | orientation | 0 | T7 T9 | — |
| F111 | No 'where I've been' signal inside the active phase's four regions | U3 | medium | 0.60 | 1440 | all | orientation | 0 | T1 | — |
| F112 | No asymmetric down/up rule exists for a fast scroll crossing the pin point | U4 | medium | 0.60 | all | seam | motion | 283 | T3 T4 T7 T10 | — |
| F113 | The ticket's 283px jump doesn't register as a Layout Shift | U5 | medium | 0.60 | all | seam | motion | 283 | T9 | — |
| F114 | Schedule frame is folded by default, hiding ripple preview | P2 | medium | 0.55 | 1440 | seam | information-loss | 60 | T10 | — |
| F115 | Command palette doesn't distinguish 'begin a Brief' from 'Open a project' | P2 | medium | 0.55 | all | all | orientation | 0 | T12 | — |
| F116 | Rail says 'Money' active while the frame shows roster/authorizations | U3 | medium | 0.55 | 1440 | foot | orientation | 0 | T1 | — |
| F117 | Row-wash hover affordance cannot fire on a touch surface | U4 | medium | 0.55 | 390 | all | information-loss | 0 | T4 | — |
| F118 | Late-arriving Schedule/needs-attention content has no SR announcement | U4 | medium | 0.55 | all | mid | information-loss | 0 | T9 T10 | — |
| F119 | Guide/Red-letter substitution leaves no trace of which she got | U2 | medium | 0.50 | all | top | orientation | 60 | T9 | — |
| F120 | Only region roots clear the pinned seam, not their child controls | U5 | medium | 0.50 | all | mid | information-loss | 64 | T4 T9 T10 | — |
| F121 | Mobile margin chips likely sit under the 24px target floor | U5 | medium | 0.50 | 390 | all | crowding | 0 | T16 | — |
| F122 | Ticket seam's 'piece-stuck' exception never observed surfacing a PO problem | P4 | medium | 0.40 | all | top | information-loss | 40 | T13 | — |
| F123 | The six-rung money ladder has no PO/receiving counterpart | P4 | medium | 0.40 | all | top | information-loss | 0 | T9 T13 | I148 |
| F124 | Schedule ripple UI (downstream damage on date move) not confirmed visible befor… | P4 | medium | 0.35 | all | seam | information-loss | 0 | T10 | — |
| F125 | Proposal send-wall state legibility for a junior is unverified in this shot set | P3 | medium | 0.30 | all | mid | orientation | 0 | T7 | — |
| F126 | '← PUT DOWN' is the one control that costs the same at every state | P2 | low | 0.90 | all | all | orientation | 0 | T11 | — |
| F127 | The tan "needs attention" box is nearly the only color-coded signal on first sc… | P3 | low | 0.85 | 1440 | top | clutter | 0 | T3 T9 | R126 |
| F128 | No hover-only affordance found in spine, margin, or ticket | U5 | low | 0.85 | all | all | orientation | 0 | T3 T4 T9 | — |
| F129 | Vitals line prints two dashes and an empty fold | U1 | low | 0.80 | 1440 | top | clutter | 21 | T3 T10 | — |
| F130 | 270px of rail stock carries nothing at the foot of the rail | U3 | low | 0.80 | 1440 | foot | orientation | 270 | T1 | — |
| F131 | At 390 the ticket starts already collapsed — the pin motion never happens | U4 | low | 0.80 | 390 | top | orientation | 0 | T3 T4 | — |
| F132 | Margin is last in linear Tab order at every width | U5 | low | 0.75 | all | all | orientation | 0 | T16 | — |
| F133 | Margin chips print the same string twice | P1 | low | 0.70 | 1440 | all | clutter | 140 | T16 | — |
| F134 | `PHASES ▸` opens and reveals nothing | P1 | low | 0.70 | all | top | information-loss | 40 | T1 T3 | R8 |
| F135 | Margin content requires an extra tap at 1280 before it's visible | P2 | low | 0.70 | 1280 | top | information-loss | 0 | T5 T15 | — |
| F136 | Instruments row spends 44px on doors nobody was sent to | U1 | low | 0.70 | 1440 | top | clutter | 44 | T3 T15 T16 | R27 |
| F137 | Presence line is session metadata, not a navigation fact | U3 | low | 0.70 | 1440 | all | clutter | 40 | T3 | — |
| F138 | Letterhead <header> nested in <main> exposes no landmark | U5 | low | 0.70 | all | top | orientation | 0 | T3 T9 | — |
| F139 | Mobile sheets have no visible, Tab-reachable close button | U5 | low | 0.70 | 390 | all | orientation | 0 | T16 | — |
| F140 | Compact rail still mixes leaving, arc, and moment at the top | U3 | low | 0.65 | 1280 | top | crowding | 100 | T3 | — |
| F141 | Reading the balance and acting on it are two different scroll depths | P2 | low | 0.60 | 1440 | mid | crowding | 400 | T9 | — |
| F142 | "Project" names a stage, a section label, and the ticket subject at once | P3 | low | 0.60 | all | top | orientation | 0 | T3 T4 | — |
| F143 | "Hands on the work: you" reads as a sentence fragment, not a role label | P3 | low | 0.60 | 1440 | foot | orientation | 20 | T9 | — |
| F144 | Ticket says "Boards"; task vocabulary and shelf history say "Mood boards" | P3 | low | 0.60 | all | top | orientation | 0 | T5 | — |
| F145 | "No client linked — attach one" sits directly under the title, reads as an error | P3 | low | 0.60 | 1440 | top | clutter | 30 | T3 | — |
| F146 | Approvals fold summary is 41 characters, over budget and truncatable | U2 | low | 0.60 | 390 | mid | information-loss | 44 | T7 | — |
| F147 | Rail has no 'what needs you next' signal of its own | U3 | low | 0.60 | 1440 | all | information-loss | 0 | T1 | — |
| F148 | The system's only loading motion lives outside the header/spine/margin the brie… | U4 | low | 0.60 | all | seam | motion | 0 | T3 | — |
| F149 | Row-wash's exclusion from ticket/spine/region-heads should stay a rule, not a g… | U4 | low | 0.60 | 1440 | mid | clutter | 0 | T4 T9 | — |
| F150 | "STUDIO EYES ONLY" beside a margin % reads as a permission wall | P3 | low | 0.55 | 1440 | foot | orientation | 90 | T9 | — |
| F151 | Phases fold forgets an explicit open on every remount | U2 | low | 0.55 | all | top | orientation | 0 | T7 | — |
| F152 | Vertical mark stack reads less like a single arc than the horizontal row | U3 | low | 0.55 | 1280 | top | orientation | 373 | T1 | — |
| F153 | Status chip crowds the price on a mobile FF&E line | P2 | low | 0.50 | 390 | mid | crowding | 30 | T14 | — |
| F154 | The guide and the red-letter zone have different heights, shifting everything b… | P3 | low | 0.50 | 1440 | top | orientation | 100 | T1 T3 | — |
| F155 | FF&E region head reads 'Pieces', not 'FF&E' | P4 | low | 0.50 | all | mid | orientation | 0 | T4 | — |
| F156 | Each of the 7 fold regions invents its own empty vocabulary | U2 | low | 0.50 | all | top | clutter | 0 | T7 | — |
| F157 | Pre-work rail shows no timer card at all, unlike the rich doc | U3 | low | 0.50 | 1440 | top | orientation | 0 | T1 | — |
| F158 | Nothing marks arrival at the paper's foot with any motion or cue | U4 | low | 0.50 | 1440 | foot | orientation | 780 | T3 T4 T7 | — |
| F159 | Empty-state ticket rows ('Nothing filed', 'Nobody on it yet') read as inert, no… | P4 | low | 0.45 | all | top | orientation | 30 | T4 T6 T15 | — |
| F160 | Margin cards print raw seed/debug copy ("Walk seed — ...") | P3 | low | 0.40 | 1440 | top | orientation | 0 | T1 T9 | — |
| F161 | No margin card pattern demonstrates how a client message lands 'on the record' | P4 | low | 0.40 | 1440 | all | orientation | 50 | T16 | — |
| F162 | doc-raise's entrance signal may never be seen on repeat visits | U4 | low | 0.40 | 1440 | top | motion | 0 | T3 T10 | — |
| F163 | PO-acknowledgement chord (g o) has no confirmed touch path | U5 | low | 0.40 | 390 | all | information-loss | 0 | T13 | — |
| F164 | FF&E hover wash signals interactivity, not PO urgency | P4 | low | 0.35 | all | mid | information-loss | 0 | T4 | — |

---

## 2. Frame budget — mean fraction of the frame carrying the task

Source: the mandatory **Frame budget** line of every walk in `25-panel-p1.md`, `26-panel-p2.md`,
`27-panel-p3.md`, `28-panel-p4.md`. Each seat states the fraction in prose ("about a sixth",
"one 36px row of 900px", "86.1% active region"); each is converted to a percentage below and
averaged per scroll state. Only walk lines that name **one** of the four states and give a
quantity are counted — a line scoped `all` (T2, T11, T12, T13, T16 on most walks) belongs to no
single state and is excluded, as are three lines that give no quantity at all
(P2 T7 "a modest fraction", P4 T8 "can't measure directly from this seed", P4 T14 "a sliver").

| scroll state | mean % of frame carrying the task | n walk lines | seats behind it | spread |
|---|---|---|---|---|
| `top` | **8.8%** | 27 | P1 P2 P3 P4 | 0.0–25.0. Twenty-two of the twenty-seven lines are under 17%; the top frame is where every seat agreed least of the frame works. |
| `seam` | **17.0%** | 3 | P1 P2 P3 | 7.8–33.3. Only three walks (all T10) name the seam with a number — the thinnest cell in the table, and P1's 33.3 is the outlier that pulls the mean above `top`. P1 itself discounts it to ~10% "useful". Read this mean as provisional. |
| `mid` | **26.4%** | 12 | P1 P2 P3 P4 | 3.0–87.5. Bimodal, not spread: the four T4 walks (FF&E edit) score 10/50/80/87.5, every other mid walk scores 3–20. `mid` is the only state where the document ever gives most of the frame to the act, and only for one task. |
| `foot` | **18.2%** | 4 | P1 P3 P4 | 4.4–33.3. Four lines, three of them T9 (money). Every foot number is a money region; nothing else at the foot was measured as carrying anything. |

**Reading it.** The document gives the least of its frame to the work at `top` (**8.8%**) — the
state where the header stack, per F01, is 111.7% of a 1440x900 viewport. It gives the most at `mid`
(**26.4%**), and essentially all of that comes from one task: the four FF&E-edit walks. Strip T4
out and `mid` falls to **11.2%** across the remaining eight lines — the same floor as `top`.
`seam` (17.0%, n=3) rests on three lines and one outlier; treat it as indicative only.
`foot` (18.2%, n=4) is entirely money walks — nothing else measured at the foot carried anything,
which is the quantitative form of U1-17's "the foot is the least working frame on the paper".

Per-line conversions, for audit:

| state | seat · walk | % | seat's own words |
|---|---|---|---|
| `top` | P1 · T1 | 16.7 | "about a sixth" |
| `top` | P1 · T3 | 20.0 | "about a fifth" (~180/900) |
| `top` | P1 · T5 | 3.0 | "about 3%" — one 36px row |
| `top` | P1 · T6 | 7.0 | "about 7%" — two 36px rows |
| `top` | P1 · T7 | 25.0 | "about a quarter of the top frame" (prework) |
| `top` | P1 · T9 | 10.0 | "about a tenth" |
| `top` | P1 · T15 | 5.0 | "about 5% at top" |
| `top` | P1 · T1r | 0.0 | return walk — "roughly 0% of the first frame" |
| `top` | P2 · T1 | 0.0 | "0% of this frame answers across everything" |
| `top` | P2 · T3 | 15.0 | "maybe 15% of the 900px frame" |
| `top` | P2 · T5 | 2.5 | "maybe 2–3%" |
| `top` | P2 · T6 | 2.0 | "maybe 2% at 1440" |
| `top` | P2 · T9 | 3.0 | "maybe 3% of frame, the MONEY row" |
| `top` | P2 · T15 | 2.5 | "~2–3% of frame" |
| `top` | P3 · T1 | 20.0 | "roughly a fifth of the 900px frame" |
| `top` | P3 · T3 | 16.7 | "maybe a sixth of the frame" |
| `top` | P3 · T5 | 4.8 | "one-eighth of the eight-row ticket" (ticket ≈38.6% of frame) |
| `top` | P3 · T6 | 12.5 | "two rows, roughly a sixteenth each" |
| `top` | P3 · T15 | 6.2 | "a sixteenth of frame" |
| `top` | P4 · T1 | 10.0 | "maybe a tenth of the frame" |
| `top` | P4 · T3 | 12.5 | "maybe an eighth of the 900px frame" |
| `top` | P4 · T5 | 4.0 | "a single 36px ticket row out of 900px" |
| `top` | P4 · T6 | 8.0 | "two 36px rows" |
| `top` | P4 · T7 | 6.7 | "maybe a fifteenth of the frame" (prework) |
| `top` | P4 · T9 | 8.3 | "roughly a twelfth of the top-of-page frame" |
| `top` | P4 · T10 | 8.3 | "the DATES row is a twelfth of the top-of-page frame" |
| `top` | P4 · T15 | 8.3 | "one ticket row, a twelfth of the top frame" |
| `seam` | P1 · T10 | 33.3 | "about a third of the frame carried schedule-shaped things" — the seat adds that the *useful* fraction was "maybe a tenth" |
| `seam` | P2 · T10 | 7.8 | "maybe 60–80px of the frame collapsed" (70/900) |
| `seam` | P3 · T10 | 10.0 | "at 900px that's maybe a tenth of frame" |
| `mid` | P1 · T4 | 87.5 | "about seven eighths … (86.1% active region, measured)" |
| `mid` | P1 · T8 | 20.0 | "about a fifth at this offset" |
| `mid` | P1 · T14 | 10.0 | "about a tenth — the one line showing the piece" |
| `mid` | P2 · T4 | 50.0 | "the FF&E region is maybe half the frame" |
| `mid` | P2 · T8 | 5.0 | "well under 5% of frame" |
| `mid` | P2 · T14 | 3.0 | "a few percent of frame" |
| `mid` | P3 · T4 | 10.0 | "maybe a tenth of the frame" |
| `mid` | P3 · T7 | 20.0 | "estimated a fifth of frame for the state line" |
| `mid` | P3 · T8 | 5.0 | "maybe a twentieth of frame" |
| `mid` | P3 · T14 | 6.7 | "maybe a fifteenth of frame" |
| `mid` | P4 · T4 | 80.0 | "most of the frame — call it four-fifths" |
| `mid` | P4 · T13 | 20.0 | "maybe a fifth of the frame to *see* the piece" |
| `foot` | P1 · T9 | 4.4 | "one 40px line in a 900px frame" |
| `foot` | P1 · T15 | 15.0 | "about 15% at foot (the rolodex nudge)" |
| `foot` | P3 · T9 | 20.0 | "maybe a fifth of the visible frame at foot" |
| `foot` | P4 · T9 | 33.3 | "the full Money region body at the foot is maybe a third of that frame" |

---

## 3. Merge log

**33 merges, 67 findings absorbed, 231 → 164.** On every merge: max severity, max confidence,
union of task ids, every contributing seat kept in `seats`, every original id kept in `merged_from`,
the clearest verbatim observation kept, the **highest** `frame_cost_estimate` kept (stated per line
below), the best single-line `suggested_fix` kept, and `already_ruled` preserved wherever any
contributor set one.

| canonical | absorbed | seats | sev | frame cost kept | why they merge |
|---|---|---|---|---|---|
| **F01** | U1-05 + U4-16 + P1-01 + P2-02 + P3-03 + P4-08 + U5-22 | U1 U4 P1 P2 P3 P4 U5 | blocker | 1005 (max of 900/1005/810/650/700/900/900, from U4-16) | same defect: the header stack (letterhead+ticket) fills or exceeds the whole 1440 frame at s0 before any region head |
| **F02** | U1-19 + U5-14 + P1-17 + P2-16 + P3-06 + P4-10 + E1-20 | U1 U5 P1 P2 P3 P4 E1 | high | 77 (max of 77/50/77/15/60/30/77, from U1-19) | same defect: the floating avatar/puck covers the mobile bar's left label at 390 |
| **F03** | U1-12 + U5-17 + P1-18 + P2-13 + P4-09 + E1-19 | U1 U5 P1 P2 P4 E1 | medium | 60 (max of 60/30/60/20/40/60, from U1-12) | same defect: studio drawer labels overprint each other at 1280 |
| **F04** | U1-25 + U2-07 + U4-01 + P1-04 + E1-02 | U1 U2 U4 P1 E1 | blocker | 283 (max of 283/283/283/283/283, from U1-25) | same defect: the ticket pin is a single-frame 283px jump with no hysteresis or easing |
| **F05** | U4-19 + P2-11 + P3-14 + P4-04 + U5-24 | U4 P2 P3 P4 U5 | medium | 400 (max of 0/0/0/400/0, from P4-04) | same caveat-finding: the 3-line/0-room seed understates real FF&E scale and scroll cost |
| **F06** | P1-07 + P2-01 + P3-02 + P4-03 | P1 P2 P3 P4 | blocker | 900 (max of 900/900/900/900, from P1-07) | same defect: no surface anywhere answers a phase-wide / cross-job question |
| **F07** | U1-10 + U5-16 + E1-11 + P1-12 | U1 U5 E1 P1 | high | 500 (max of 60/40/296/500, from P1-12) | same defect: the 56px compact rail wraps the stage caption mid-word (ACTIV/E) |
| **F08** | U2-11 + U4-07 + U4-09 + P1-28 + E1-22 | U2 U4 P1 E1 | high | 470 (max of 0/0/0/50/470, from E1-22) | same defect: folding a region drops keyboard focus to <body>; U4-09 self-declared a duplicate key |
| **F09** | P1-06 + P2-03 + P3-04 | P1 P2 P3 | high | 300 (max of 144/300/0, from P2-03) | same defect: Boards/Drawings/Spec/People doors exist only at s0 and vanish at the seam |
| **F10** | U1-03 + U1-30 + U2-01 + P1-21 | U1 U2 P1 | high | 260 (max of 260/37/0/160, from U1-03) | same defect: four-to-five money statements print unreconciled numbers; P1 scoped width/state 'all' |
| **F11** | U1-24 + U3-21 + P1-03 | U1 U3 P1 | high | 547 (max of 283/0/547, from P1-03) | same defect: at the program's named s1 offset the ticket is still unfolded — the seam state does not exist there |
| **F12** | U3-04 + P1-25 + U1-22 | U3 P1 U1 | high | 657 (max of 657/657/432, from U3-04) | same defect: on a pre-work spread the rail is 70-86% empty |
| **F13** | U1-01 + U1-02 + P1-02 | U1 P1 | blocker | 900 (max of 900/64/64, from U1-01) | same defect: nothing below the letterhead names the document; two contributors scoped width/state 'all' |
| **F14** | P1-15 + U2-04 | P1 U2 | blocker | 844 (max of 844/400, from P1-15) | same defect: at 390 no surface lets her jump to a region (the sheet lists stages) |
| **F15** | P3-05 + P4-11 | P3 P4 | blocker | 300 (max of 200/300, from P4-11) | same defect: at 1280 the seven spine marks carry no labels at all |
| **F16** | U3-10 + E1-10 + E1-24 | U3 E1 | high | 700 (max of 300/657/700, from E1-24) | same defect: pre-work spreads mount no region DOM, so nothing can be indexed or condensed |
| **F17** | P1-08 + P2-05 | P1 P2 | high | 600 (max of 600/250, from P1-08) | same defect: margin content is identical at s0/s1/s2/s3 |
| **F18** | P1-11 + P3-18 | P1 P3 | high | 900 (max of 900/900, from P1-11) | same defect: the 1280 margin sheet covers the paper while open |
| **F19** | U1-14 + U2-02 | U1 U2 | high | 46 (max of 46/0, from U1-14) | same defect: the closed margin tab at 1280 prints no count |
| **F20** | U1-23 + P1-26 | U1 P1 | high | 300 (max of 290/300, from P1-26) | same defect: the pre-work ticket prints seven-to-eight rows of absence with no doors |
| **F21** | U3-02 + U2-03 | U3 U2 | high | 550 (max of 400/550, from U2-03) | same defect: the compact rail deletes the running index (and timer/presence) between 1180 and 1439 |
| **F22** | P1-13 + U3-13 | P1 U3 | high | 160 (max of 160/0, from P1-13) | same defect: the running index carries neither extent nor exception flags |
| **F23** | P1-22 + P4-01 | P1 P4 | high | 120 (max of 120/0, from P1-22) | same defect: the FF&E line stamp carries lifecycle, not PO-acknowledgement or damage state |
| **F24** | U4-08 + E1-23 | U4 E1 | high | 240 (max of 100/240, from E1-23) | same defect: the dominant layout shift at mid is a silent late data arrival (CLS 0.13) |
| **F25** | U5-10 + P3-21 | U5 P3 | high | 60 (max of 60/30, from U5-10) | same defect: Plan room / Spec book have no route at 390 |
| **F26** | P1-14 + U3-06 | P1 U3 | medium | 210 (max of 210/150, from P1-14) | same defect: the session timer is the rail's largest figure and answers no navigation question |
| **F27** | U1-04 + P1-05 | U1 P1 | medium | 180 (max of 180/180, from U1-04) | same defect: five of eight ticket rows print only absence |
| **F28** | U1-07 + P1-09 | U1 P1 | medium | 230 (max of 230/230, from U1-07) | same defect: the margin first-touch note never recedes; P1 scoped it 'top', U1 'all' |
| **F29** | U1-29 + P2-06 | U1 P2 | medium | 150 (max of 55/150, from P2-06) | same defect: the spine index reprints facts the paper already prints on the same screen |
| **F30** | U4-20 + E1-26 | U4 E1 | medium | 283 (max of 0/283, from E1-26) | same defect: the JS reduced-motion hook has zero consumers in the document tree |
| **F31** | U1-09 + U3-20 | U1 U3 | medium | 190 (max of 126/190, from U3-20) | same defect: always-visible rail furniture (timer, presence) is read at zero of four states |
| **F32** | U3-18 + P3-17 | U3 P3 | medium | 0 (max of 0/0, from U3-18) | same finding: the 390 sheet is a better map than the 1280 compact rail |
| **F33** | U2-14 + U4-12 | U2 U4 | medium | 0 (max of 0/0, from U2-14) | same defect: the margin silently swaps interaction/motion model between 1280 and 1440 |

### Non-merges worth naming

The merge rule forbids merging across scroll states unless a contributor scoped the finding `all`.
Five pairs describe what is plainly the same defect at two different offsets and are therefore kept
as separate rows rather than merged. They are listed so the proposal can treat each pair as one
problem even though the ledger holds two rows:

- **`U5-05` (fold drops focus, `seam`)** is *not* merged into the fold-focus group (`mid`): U5
  scoped it `seam`, no contributor scoped the state `all`.
- **`P3-01` (`top`) and `P4-05` (`mid`)** — the FF&E region reads `Pieces`, never `FF&E` — stay
  separate on scroll state alone.
- **`U2-08` (`mid`) and `P1-31` (`top`)** — a folded region never shows whether she or the system
  closed it — stay separate on scroll state alone.
- **`U4-08`+`E1-23` (`mid`) and `P1-29` (`top`)** — late data arrival reflows the page under the
  reader — stay separate on scroll state alone.
- **`P2-04` (`1280`, `top`)** is *not* merged into `F` for Plan room / Spec book having no route
  (`390`, `top`, from `U5-10`+`P3-21`): the widths differ and no contributor scoped width `all`.

Two same-seat pairs were also left unmerged deliberately, because each names a different confusion
rather than restating one: `U4-01` (the pin is a hard cut) vs `U4-02` (the observer uses
`threshold:0` with no band); `U2-08` (chosen vs default fold) vs `U2-10` (scroll-pinned seam vs
chosen fold). The single same-seat merge performed is `U4-09` into the fold-focus group, because
U4 itself keyed it `fold-focus-loss-duplicate-key` and handed it to U5.

### Drop log

**No findings were dropped.** §4 permits dropping only a finding with no `scroll_state` or no task
id. All 231 raw findings carried both, verified programmatically across the ten reports
(`scroll_state` present 231/231, `task_ids` non-empty 231/231). Every raw id appears exactly once in
exactly one canonical row's `merged_from`.

### Reconciliation

| | count |
|---|---|
| raw findings read from the ten reports | 231 |
| findings absorbed by the 33 merges | 67 |
| canonical rows written | 164 |
| findings dropped | 0 |
| 164 + 67 | 231 ✅ |

Severity mass per scroll state (severity weight x contributing seats), worst first:
`all` **239** (57 rows, 4 blockers) · `top` **112** (42 rows, 1 blocker) ·
`seam` **99** (28 rows, 2 blockers) · `mid` **75** (27 rows, 0 blockers) ·
`foot` **16** (10 rows, 0 blockers).
