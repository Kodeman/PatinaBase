# RC-4b: visual re-evaluation of the round-8 desk and job paper on tip `8abc747d6`

Ticket SQ-2331 (US-52 W6). Run 2026-10-28. Read-only role: no source edits, no Strata, no shared stack.

**Verdict: the high defects are repaired. D1, D3 (overlap), D4 (job paper), D5, D6 and D8 PASS. D7 and D9 are unchanged debt. Three new low or medium defects (N1-N3).** No horizontal page overflow at 1920, 1440, 1180, 1179, 390 or 320 on `/desk` or the job.

## How it was run

- Owned Supabase stack `patina-sq2331-rc4b` (API 61321, DB 61322), 5 version pins copied, `-x studio,mailpit,logflare,vector,edge-runtime,imgproxy,postgres-meta`. All 816 migrations plus the config seed applied at `start`, so no separate reset was needed. `f01-fixture.sql` loaded.
- Designer dev on 3400, process-env Supabase trio pinned to 61321, `NEXT_PUBLIC_FLAG_OVERRIDES=designer-paper-round8:true,one-voice:true`, live data mode. Signed in as `f01-designer@test.invalid`. Root marker `data-paper-renderer="round8"` confirmed at every width.
- Reference: frozen `artifacts/room-proof-round8-2026-10-23/` (`studio.html`, `job.html`) served unchanged on 4179.
- Playwright Chromium at 1920, 1440, 1180, 1179, 390, 320 (DPR 1).
- **Fixture additions to my own stack only, for two checks the F01 fixture cannot show.** Three `schedule_milestones` rows with an anchor date (D6). The H02 two-invoice, one-payment set from `accounts-paper.spec.ts` (accounts sheet). The stack is torn down with `--no-backup`.
- Screenshots: compressed copies under `evidence/rc/visual-rc4b/`. Raw PNGs and JSON audits in `/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-2331/shots/`.
  - `top-portal-{desk,job}-<w>.jpg` is the portal; `top-ref-...` is the reference at the same width (first 1100 px).
  - `sched2-portal-{1440,390,320}.jpg`, `acct-{closed,open}-{1440,390}.jpg`, `ledger-open-1440.jpg`.

## Items

| Item | Result | Evidence |
|---|---|---|
| D1 and D3: cover and next-act band overlap | **PASS** | `visual-rc4b/top-portal-job-1440.jpg`, `-1179.jpg`, `-390.jpg`, `-320.jpg`. "Open the task" sits after the "Task due" line, never over text, at all widths. The cover is a kicker, the title and a quiet empty-cover card. See N2 for a leftover in the label. |
| D4: 12px floor and mono-caps | **PASS on the paper, DEBT in the shell and sheet** | Text-node audit over `[data-paper-renderer]` at all six widths finds zero nodes under 12px on desk and job (`shots/audit-portal.json`). Over the whole body there remain 3 nodes at 11px at 1440 (dock "FF", "F01 Fictional Designer", "F01 Fictional Studio") and 2 at 390 (mobile bar "Section:", "approvals"). The Studio accounts sheet has 8+ at 11px (N1). Mono-caps remain by design for kickers, but now at 12px or more. |
| D5: studio heading, Studio tab, phone nav (SQ-2302) | **PASS** | Heading "The studio, in hand." with intro at every width. Studio tab present and current. At 390 and 320 the five rooms plus Studio books and Correspondence wrap onto two lines and stay reachable (`top-portal-desk-390.jpg`). |
| D5 / SQ-2305 F1: intro under the h1, not in a right column | **Ruled acceptable (low, DEBT)** | At 1440 the reference puts the intro to the right of the h1 (`top-ref-desk-1440.jpg`); the portal stacks it under. Same words, same hierarchy; only the composition differs, and the stacked form is what the page does below 1180. Not worth a defect on its own. |
| D5 / SQ-2305 F3: current tab ink + font-medium vs moss + underline at 600 | **Ruled a defect, low** | Computed on the current tab: colour `rgb(44,41,38)` ink, weight 400 on the anchor, 2px ink underline. The reference marks the current room in moss at weight 600. The underline is there, so a designer finds the room; the moss accent is the round-8 signal and it is missing. Low, because location is still clear. |
| D6: schedule clip at 390, diamond and name on one line | **PASS** | `sched2-portal-390.jpg`, `-320.jpg`. At 390 the "Install" milestone and its "Anchored · 17 December" chip share a line; the long name wraps beside its diamond, no ellipsis and no clip. DOM check: no `scrollWidth` clipping on the milestone or chip at 390 or 320. See N3 for a separate right-edge issue at 320. |
| D8: dev "2 Issues" overlay | **PASS** | The Next dev indicator shows no issue count on desk or job at any width. 40 console errors on desk are cross-origin Sanity CDN requests from `localhost:3400` (env, not a render issue); one 403 on the job load was not traced. |
| D7: shell dock overlaps the page foot | **Unchanged (DEBT)** | At 1440 the dock still sits over the wordmark and truncates "F01 FICTIONAL STU…" at the right (`top-portal-desk-1440.jpg`). Not the round-8 renderer. |
| D9: "priced vs released" question | **Not reproducible, unchanged (DEBT)** | The F01 job has 80 placeholders and "nothing released", so there are no priced or released totals to compare. |
| Accounts ledger sheet, closed and open at 1440 and 390 | **PASS with N1** | `acct-closed-*.jpg`, `acct-open-*.jpg`. Opens from the Ledgers dock at 1440 and from More, Ledgers at 390 (the mobile door). Shows "$240.00 issued; $50.00 received; $190.00 due." and the invoice rows. Sheet fits the viewport (760 px at 1440; 354 px at 390). Esc closes it. No horizontal overflow. |

## New defects

**N1 (low-medium). The Studio accounts sheet misses the 12px floor.** At 1440 and 390 the sheet carries 8 or more 11px nodes: "STUDIO EYES ONLY", "LEDGER", "RECEIVABLES", "EARNINGS", the lede "Revenue, what's owed…", and the export manifest note. A reader sees tiny sage mono-caps labels next to 18px money text. Screenshot `visual-rc4b/acct-open-1440.jpg`.

**N2 (low). The next-act label drops the task name below 1180.** At 1440 it reads "NEXT — Task due — F01 review living-room selections". At 1179, 390 and 320 it reads "NEXT TASK DUE · TASK" in mono caps, so a designer sees a button, "Open the task", for a task they cannot name. `top-portal-job-1179.jpg`, `-390.jpg`.

**N3 (low). At 320 the schedule phase "···" menu is clipped at the right edge.** For the longer phase names ("Construction Documentation") the "···" menu trigger sits at about x=311 to 322 and is partly outside the 320 viewport; four such triggers report a right edge past 320. The "Name a phase…" underline also runs to the edge. `sched-portal-320.jpg` (shots dir) and `visual-rc4b/sched2-portal-320.jpg`. Page `scrollWidth` still equals 320, so this is clipped, not scrolling.

## Observations, no verdict

- The F01 cover has no photograph, tagline, "Prepared for" or facts line, so the cover is still far from the reference. That is mostly data (no cover image or tagline in the fixture), and not part of the D1/D3 overlap question. The contents margin "In this job" appears beside the chapters only after scrolling; it is not visible on the first screen at 1440.
- Quality gate and tests: not applicable, documents only.

Pinned verifier: `test -s docs/design/designer-portal-round8/evidence/rc/rc4b-visual-reeval.md`.
