# US-43 integrated visual QA (SQ-1505)

Main at a4b9d6f56, designer portal dev server on :3010 from an isolated worktree, LOCAL Supabase only (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`). Playwright/Chromium, Designer User (Leah). Project "Aspen Loft Refresh" Document + Desk. Dev "N" badge hidden in most shots. No send/sign/release/pay act clicked; the only writes were Later > Not today and Undo on one Desk card (restored). Screenshots are JPEG (sips -Z 1600); `probe-*.json`/`cap*-report.json` hold the measured numbers.

| # | Check | Result | Evidence |
| - | - | - | - |
| 1 | Next band / dock / one Next | FAIL <600 (PASS >=600) | doc-top-{320,390}.jpg, dock-390.jpg, cap3-report.json |
| 2 | Focus visible | PARTIAL | focus-band-*.jpg, focus-dock-390.jpg |
| 3 | Region heads, rule budget | PARTIAL | doc-ffe-*.jpg, doc-top-1440.jpg |
| 4 | One lead, no inked pills, FF&E/financials | PARTIAL | doc-ffe-*.jpg, doc-fin-*.jpg |
| 5 | Sentence-case actions | FAIL | probe-doc-*.json, cap4-report.json |
| 6 | Desk | PARTIAL (FAIL settle height at 390, menu hidden by dock) | desk-top-*.jpg, desk-later-menu-*.jpg, desk-settled-*.jpg |
| 7 | 390 overlap gone | PARTIAL | dock-390.jpg, doc-ffe-390.jpg |
| 8 | Forced colors | PARTIAL (terminal box not exercised) | forced-*.jpg |
| 9 | 200% zoom / 320 reflow | FAIL at Desk 768 only | zoom200-*.jpg, probe-desk-768.json |
| 10 | Squint vs sign-in | PARTIAL | squint-*.jpg |

Full findings are in the SQ-1505 submission body.
