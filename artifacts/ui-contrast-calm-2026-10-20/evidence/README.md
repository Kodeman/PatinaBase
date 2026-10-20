# US-42 evidence: sign-in vs Desk vs Document (SQ-1496)

Captured 2026-10-20, read-only. Every number below comes from `probe-*.json` (in-page computed styles + WCAG 2.x ratios) or `squint-metrics.json` (pixel stats). Entries marked **(px)** are measured from the screenshot pixels (median colour of the element box); **(css)** are computed from CSS (nearest opaque ancestor background). Where both exist they are listed and **px wins** (CSS cannot see gradients, opacity on the element, or fills drawn by sibling spans). Anything marked *estimate* is not a direct measurement.

## 0. How this was captured

- Headless Chromium 1208 via Playwright 1.58.2 (from the main checkout `node_modules`), viewport exactly **1440x900** and **390x844** (390 uses `isMobile`+touch), device scale factor 1, PNG screenshots. The Claude-in-Chrome extension was not used for pixels because it could not set the viewport (window stayed 1912x1531) and saves JPEG to a temp folder.
- Local: designer portal dev server from the main checkout on `localhost:3000`; its served HTML contains only `127.0.0.1:54321` (no `bkvcixdmuyejfzcijpdg`). `.env.local` itself could not be read (read denied by the sandbox), so this was verified from the served page instead.
- Account: dev-accounts panel, "Designer User" (`designer@patina.dev`, displays as Leah Hartwell). Only that sign-in was performed. No work action was clicked; no data, flag or source was changed.
- Project: **Aspen Loft Refresh** (`/doc/b0000000-0000-0000-0000-0000000000d1`), the richest seeded Document: FF&E SELECTIONS (2 lines, 2 rooms: Dining Room, Living Room), PROJECT FINANCIALS ($4,250 receivable), a Next band ("2 decisions overdue — oldest due 14 October" + CHASE THE APPROVAL), CLIENT APPROVALS, SCHEDULE DATES, PROJECT CLOSEOUT. It has no accepted-and-priced budget, so the financials body is thin ("no budget yet").
- Sign-in prod (`https://app.patina.cloud/auth/signin`) was loaded signed-out, view only. In both sign-in surfaces the primary button is **disabled** at rest (email empty). To measure its enabled state, a placeholder address was typed into the email field and never submitted (`primaryButtonEnabled` in the JSON).
- Local screenshots include two dev-only overlays (Next.js "N" badge bottom-left, a round widget bottom-right) that are not in prod. They cover well under 0.3% of pixels; they are in the squint stats of local shots.
- Leah's example: `proposal-1019-img0.png` (copied unmodified).

Files: `signin-local-{1440,390}.png`, `signin-prod-{1440,390}.png`, `desk-{1440,390}.png`, `doc-top-{1440,390}.png`, `doc-ffe-{1440,390}.png`, `doc-mobilebar-390.png`, `squint-<surface>.png` (all of the above, blurred+desaturated), `probe-{signin-local,signin-prod,desk,doc}.json`, `squint-metrics.json`.

## 1. Squint metrics (pixel stats on the screenshots)

Luma = 0.2126R+0.7152G+0.0722B on sRGB-encoded values, 0-100%. "Dark anchor share" = share of pixels with luma < 25%. Raw columns are from the un-blurred screenshot; the blurred columns use the squint render (grayscale + Gaussian blur 10px at 1440, 6px at 390) and include a faint dark falloff at the image edges from the blur, so use raw for decisions and blurred only to see layout.

| screenshot | mean luma % | p5 % | p50 % | p95 % | p5-p95 range (pts) | dark anchor share % | blurred mean % | blurred dark share % |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| signin-local-1440 | 61.1 | 7.06 | 96.16 | 98.06 | 91.01 | 38.86 | 60.54 | 35.57 |
| signin-prod-1440 | 61.24 | 7.06 | 96.16 | 98.04 | 90.98 | 38.81 | 60.68 | 35.63 |
| desk-1440 | 95.67 | 96.97 | 96.97 | 100 | 3.03 | 0.57 | 94.93 | 0 |
| doc-top-1440 | 94.84 | 88.74 | 98.09 | 100 | 11.26 | 1.02 | 94.19 | 0 |
| doc-ffe-1440 | 94.46 | 83.19 | 98.09 | 100 | 16.81 | 1.27 | 93.82 | 0 |
| signin-local-390 | 46.93 | 6.78 | 18.98 | 98.09 | 91.32 | 52.81 | 46.12 | 49.77 |
| signin-prod-390 | 47.16 | 6.78 | 19.24 | 98.09 | 91.32 | 52.55 | 46.35 | 49.77 |
| desk-390 | 94.37 | 70.86 | 96.97 | 98.09 | 27.23 | 1.11 | 93.53 | 0 |
| doc-top-390 | 94.15 | 65.15 | 98.09 | 98.09 | 32.94 | 2.7 | 93.26 | 0.06 |
| doc-ffe-390 | 94.73 | 70.77 | 98.09 | 98.09 | 27.33 | 1.32 | 93.87 | 0 |

Squint renders requested: `squint-signin-local-1440.png`, `squint-desk-1440.png`, `squint-doc-top-1440.png`, `squint-doc-ffe-1440.png` (the 390 and prod ones are extra).

## 2. Sign-in (`/auth/signin`, signed out)

Local and prod render the same layout; compare their numbers below. Prod squint/pixel stats differ by less than 0.2 points of mean luma (the QR countdown and dev badges).

### Sign-in (local): region-to-region value contrast (1440)

Page: html `#000000` (unpainted), body `#f5f1e6`.

| region (first example) | count | bg | bg behind it | ratio | box (w x h) | note |
| --- | --- | --- | --- | --- | --- | --- |
| `main.min-h-screen.bg-[#FAF7F2].px-[16px]` | 1 | #faf7f2 | #f5f1e6 | 1.06 | 1440x1031 |  |
| `div.pa-auth-card.mx-auto.grid` | 1 | #fcfaf6 | #faf7f2 | 1.03 | 1152x967 |  |
| `section.relative.z-0.flex` | 2 | #1a1816 | #fcfaf6 | 16.98 | 622x965 |  |
| `span.pa-auth-display-fill.block.animate-[pa-auth` | 1 | #1a1816 | #1a1816 | 1 | 509x98 | has gradient/image; px bg #1d1b19 |
| `input#portal-auth-email.h-[48px].w-full.border` | 2 | #ffffff | #fcfaf6 | 1.04 | 384x48 | px bg #fefefe |

### Sign-in (local): boundary contrast, rules and borders (1440)

| boundary (first example) | count | sides: width, colour, ratio vs surrounding bg | box |
| --- | --- | --- | --- |
| `div.pa-auth-card.mx-auto.grid` | 1 | T 1px #8b7355 4.2:1; R 1px #8b7355 4.2:1; B 1px #8b7355 4.2:1; L 1px #8b7355 4.2:1 | 1152x967 |
| `section.relative.z-0.flex` | 1 | R 1px #8b7355 4.3:1 | 622x965 |
| `input#portal-auth-email.h-[48px].w-full.bord` | 4 | T 1px #8b7355 4.3:1; R 1px #8b7355 4.3:1; B 1px #8b7355 4.3:1; L 1px #8b7355 4.3:1 | 384x48 |
| `div.border-b.border-border` | 1 | B 1px #dbd0ba 1.47:1 | 384x56 |

### Sign-in (local): key text elements (1440)

| element | text | colour | bg | ratio | size / weight | case, tracking | font | box |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| heroHeading | "Welcome back to the studio" | #c4a57b | #1d1b19 | 7.37 (px) | 47.52px / 500 | none, -1.9px | Playfair Display | 509x98 |
| heroSub | "Your projects, proposals, " | #b8a999 | #23211e | 7.01 (px) | 14px / 400 | none, 0 | Inter | 300x45 |
| eyebrowTheStudio | "THE STUDIO" | #c4a265 | #1d1b19 | 7.12 (px) | 11px / 400 | uppercase, 2.75px | DM Mono | 509x17 |
| footerCopy | "A workshop for interior de" | #b8a999 | #28241e | 6.74 (px) | 14px / 400 | none, 0 | Inter | 318x45 |
| signInHeading | "SIGN IN" | #65594e | #fbf9f5 | 6.46 (px) | 11px / 400 | uppercase, 2.75px | DM Mono | 384x17 |
| signInSub | "Start with your email." | #2c2926 | #fbf9f5 | 13.75 (px) | 30px / 500 | none, -0.9px | Playfair Display | 384x33 |
| emailLabel | "EMAIL ADDRESS" | #65594e | #fbf9f5 | 6.46 (px) | 11px / 600 | uppercase, 1.65px | Inter | 384x15 |
| primaryButton | "Email sign-in code" | #faf7f2 @op0.55 | #7f7e7b | 2.25 (px) | 14px / 600 | none, 0 | Inter | 384x48 |
| appleButton | "Continue with Apple" | #2c2926 | #fefefe | 14.34 (px) | 14px / 600 | none, 0 | Inter | 384x48 |
| passwordLink | "Use a password instead" | #2c2926 | #f9f6f1 | 13.41 (px) | 14px / 600 | none, 0 | Inter | 161x21 |
| createAccount | "Create designer account" | #65594e | #f9f6ef | 6.29 (px) | 15.75px / 400 | none, 0 | Inter | 183x19 |

Not found on this surface: panelFooterRule.

Prod, same elements:

| element | local text ratio | prod text ratio | local colour/bg | prod colour/bg |
| --- | --- | --- | --- | --- |
| heroHeading | 7.37 (px) | 7.37 (px) | #c4a57b/#1d1b19 | #c4a57b/#1d1b19 |
| heroSub | 7.01 (px) | 7.01 (px) | #b8a999/#23211e | #b8a999/#23211e |
| eyebrowTheStudio | 7.12 (px) | 7.12 (px) | #c4a265/#1d1b19 | #c4a265/#1d1b19 |
| footerCopy | 6.74 (px) | 6.74 (px) | #b8a999/#28241e | #b8a999/#28241e |
| signInHeading | 6.46 (px) | 6.46 (px) | #65594e/#fbf9f5 | #65594e/#fbf9f5 |
| signInSub | 13.75 (px) | 13.75 (px) | #2c2926/#fbf9f5 | #2c2926/#fbf9f5 |
| emailLabel | 6.46 (px) | 6.46 (px) | #65594e/#fbf9f5 | #65594e/#fbf9f5 |
| primaryButton | 2.25 (px) | 2.25 (px) | #faf7f2/#7f7e7b | #faf7f2/#7f7e7a |
| appleButton | 14.34 (px) | 14.34 (px) | #2c2926/#fefefe | #2c2926/#fefefe |
| passwordLink | 13.41 (px) | 13.41 (px) | #2c2926/#f9f6f1 | #2c2926/#f9f6f0 |
| createAccount | 6.29 (px) | 6.24 (px) | #65594e/#f9f6ef | #65594e/#f8f5ef |

Sign-in primary button, both states (the whole form has exactly one filled control):

| surface | state | colour on fill | ratio | notes | box |
| --- | --- | --- | --- | --- | --- |
| signin-local | disabled (email empty) | #faf7f2 on #7f7e7b | 2.25 (px) | opacity 0.55, own fill #1a1816 | 384x48 |
| signin-local | enabled (placeholder typed, not submitted) | #faf7f2 on #1a1816 | 16.57 (px) | 14px / 600, none | 384x48 |
| signin-prod | disabled (email empty) | #faf7f2 on #7f7e7a | 2.25 (px) | opacity 0.55, own fill #1a1816 | 384x48 |
| signin-prod | enabled (placeholder typed, not submitted) | #faf7f2 on #1a1816 | 16.57 (px) | 14px / 600, none | 384x48 |

Sign-in controls other than the primary (1440, local):

| control | colour on bg | ratio | border | size / weight | box | fill vs surround |
| --- | --- | --- | --- | --- | --- | --- |
| Email sign-in code | #faf7f2 on #7f7e7b | 2.25 (px) | none | 14px / 600 | 384x48 | 16.98:1 |
| Continue with Apple | #2c2926 on #fefefe | 14.34 (px) | 1px #8b7355 (4.3:1) | 14px / 600 | 384x48 | 1.04:1 |
| Use a password instead + | #2c2926 on #faf7f1 | 13.52 (px) | none | 14px / 600 | 384x47 | none |
| DEV ACCOUNTS 4 AVAILABLE | #65594e on #fbf9f5 | 6.46 (px) | none | 15.75px / 500 | 382x53 | none |
|  | #4a3f35 on #cfbb6b | 5.34 (px) | none | 18px / 400 | 40x40 | none |

Email input: text #2c2926 on #ffffff = 14.46:1; placeholder #7a6a5b (you@example.com); border 1px #8b7355 = 4.3:1 vs the card; box 384x48. The input is white (#ffffff) on the #fcfaf6 card: 1.04:1 fill-to-card (see region table).

Actions in the sign-in "region head": the form has no ledger of region actions. It offers, in order: Email sign-in code (filled, 600 weight), Continue with Apple (outlined, 600), Use a password instead (text, 600), Create designer account (underlined text, 400), Dev accounts (outlined, local only). Distinct weights across these: 600 and 400. One filled control, one outlined, three text.

At 390 the sign-in stacks the dark panel above the form; see `signin-local-390.png` and `squint-metrics.json` (dark share 52.8% of the 390 screenshot).

## 3. Desk (`/desk`, signed in)

### Desk: region-to-region value contrast (1440)

Page: html `#000000` (unpainted), body `#f5f1e6`.

| region (first example) | count | bg | bg behind it | ratio | box (w x h) | note |
| --- | --- | --- | --- | --- | --- | --- |
| `div.document-route-shell.min-h-screen.bg-[var(--` | 1 | #faf7f2 | #f5f1e6 | 1.06 | 1440x3397 |  |
| `article.card.st-project` | 5 | #fcfaf6 | #faf7f2 | 1.03 | 309x226 | px bg #fcfaf6 |
| `nav.fixed.inset-x-0.bottom-0` | 1 | #ffffff | #faf7f2 | 1.07 | 1440x60 | px bg #ffffff |

### Desk: boundary contrast, rules and borders (1440)

| boundary (first example) | count | sides: width, colour, ratio vs surrounding bg | box |
| --- | --- | --- | --- |
| `section.section.day-sheet` | 2 | B 1px #2c2926 13.53:1 | 976x557 |
| `article.card.st-project` | 2 | T 1px #8f8c88 3.13:1; R 1px #8f8c88 3.13:1; B 1px #8f8c88 3.13:1; L 3px #6d4e24 7.11:1 | 309x226 |
| `article.card.st-proposal` | 3 | T 1px #8f8c88 3.13:1; R 1px #8f8c88 3.13:1; B 1px #8f8c88 3.13:1; L 3px #575d1d 6.58:1 | 309x226 |
| `ul.rows` | 3 | T 1px #2c2926@0.18 1.41:1 | 976x672 |
| `li#roster-line-9e008a11-7a1d-44ae-8c7f-07f42` | 25 | B 1px #2c2926@0.18 1.41:1 | 976x77 |
| `section.mt-16.border-t.border-[var(--border-` | 1 | T 1px #e5e2dd@0.6 1.12:1 | 976x430 |
| `nav.fixed.inset-x-0.bottom-0` | 1 | T 1px #e5e2dd 1.21:1 | 1440x60 |

### Desk: key text elements (1440)

| element | text | colour | bg | ratio | size / weight | case, tracking | font | box |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| greeting | "Good afternoon, Leah" | #2c2926 | #faf7f2 | 13.53 (px) | 30.6px / 400 | none, 0 | Playfair Display | 295x46 |
| mineTab | "MINE" | #2c2926 | #faf7f2 | 13.53 (px) | 12px / 400 | uppercase, 0.96px | DM Mono | 44x44 |
| studiosTab | "THE STUDIO’S" | #4e4339 | #faf7f2 | 8.99 (px) | 12px / 400 | uppercase, 0.96px | DM Mono | 98x44 |
| dateLine | "TUESDAY 20 OCTOBER · TODAY" | #2c2926 | #faf7f2 | 13.53 (px) | 12px / 500 | uppercase, 0.96px | DM Mono | 212x16 |
| findAnything | "FIND ANYTHING" | #65594e | #faf7f2 | 6.35 (px) | 12px / 300 | uppercase, 1.2px | DM Mono | 109x12 |
| recordInquiry | "RECORD AN INQUIRY" | #5c4a3c | #faf7f2 | 7.86 (px) | 12px / 400 | uppercase, 1.2px | DM Mono | 143x16 |
| createProject | "CREATE A PROJECT FILE" | #5c4a3c | #faf7f2 | 7.86 (px) | 12px / 400 | uppercase, 1.2px | DM Mono | 176x16 |
| firstCardTitle | "Chen Residence" | #2c2926 | #fcfaf6 | 13.87 (px) | 20px / 500 | none, 0 | Playfair Display | 145x27 |
| firstCardKind | "PROJECT" | #2c2926 | #faf7f2 | 13.53 (css) | 12px / 400 | uppercase, 0.96px | DM Mono | 96x16 |
| firstCardLine | "Balance to Woodward & Sons" | #4e4339 | #fcfaf6 | 9.22 (px) | 18px / 400 | none, 0 | Inter | 267x54 |
| firstAction | "RECORD PAYMENT" | #5c4a3c | #fcfaf6 | 8.06 (px) | 12px / 400 | uppercase, 1.2px | DM Mono | 118x12 |
| notToday | "NOT TODAY" | #65594e | #fcfaf6 | 6.51 (px) | 12px / 300 | uppercase, 1.2px | DM Mono | 76x12 |

### Desk: action labels (1440)

| variant | count | example labels | size / weight / case / tracking | colour on bg | text ratio | filled? (fill vs surround) | hit box |
| --- | --- | --- | --- | --- | --- | --- | --- |
| secondary | 2 | "＋ RECORD AN INQUIRY", "＋ CREATE A PROJECT FILE" | 12px / 400 / uppercase / 1.2px | #5c4a3c on #faf7f2 | 7.86 (px) | text only | 177x44 |
| tertiary | 1 | "FIND ANYTHING ⌘K" | 12px / 300 / uppercase / 1.2px | #65594e on #faf7f2 | 6.35 (px) | text only | 158x44 |
| secondary | 5 | "RECORD PAYMENT", "FOLLOW UP", "REVIEW DECISIONS" | 12px / 400 / uppercase / 1.2px | #5c4a3c on #fcfaf6 | 8.06 (px) | text only | 130x44 |
| tertiary | 10 | "NOT TODAY", "UNTIL…" | 12px / 300 / uppercase / 1.2px | #65594e on #fcfaf6 | 6.51 (px) | text only | 88x44 |
| secondary | 25 | "OPEN PROJECT FILE", "FOLLOW UP WITH THE MAKER", "REVIEW AND SEND" | 12px / 400 / uppercase / 1.2px | #5c4a3c on #faf7f2 | 7.86 (css) | text only | 150x44 |
| tertiary | 1 | "SHOW" | 12px / 300 / uppercase / 1.2px | #65594e on #faf7f2 | 6.35 (css) | text only | 46x44 |

Desk actions per card (buttons whose hit box lies inside the card), 1440:

| card (y) | actions | labels | distinct weights | distinct variants | any filled/inked? |
| --- | --- | --- | --- | --- | --- |
| 249 / x232 | 3 | RECORD PAYMENT, NOT TODAY, UNTIL… | 400,300 | secondary,tertiary | no |
| 249 / x565 | 3 | FOLLOW UP, NOT TODAY, UNTIL… | 400,300 | secondary,tertiary | no |
| 249 / x899 | 3 | FOLLOW UP, NOT TODAY, UNTIL… | 400,300 | secondary,tertiary | no |
| 499 / x232 | 3 | FOLLOW UP, NOT TODAY, UNTIL… | 400,300 | secondary,tertiary | no |
| 499 / x565 | 3 | REVIEW DECISIONS, NOT TODAY, UNTIL… | 400,300 | secondary,tertiary | no |

The Desk has no inked (dark-filled) control anywhere in the 1440 probe: inked variant count = 0. The only dark pixels are the 2px section rules and text (dark anchor share 0.57%).

## 4. Document (`/doc/<id>`, Aspen Loft Refresh, signed in)

### Document: region-to-region value contrast (1440)

Page: html `#000000` (unpainted), body `#f5f1e6`.

| region (first example) | count | bg | bg behind it | ratio | box (w x h) | note |
| --- | --- | --- | --- | --- | --- | --- |
| `div.document-route-shell.min-h-screen.bg-[var(--` | 1 | #faf7f2 | #f5f1e6 | 1.06 | 1440x3204 |  |
| `div.relative.grid.min-h-screen` | 7 | #fcfaf6 | #faf7f2 | 1.03 | 1440x3204 |  |
| `aside.sticky.top-0.z-[2]` | 1 | #e8e3db | #fcfaf6 | 1.23 | 200x900 | px bg #e8e3db |
| `div#care-region-heading.mt-[var(--doc-region-gap` | 1 | #f1ece3 | #fcfaf6 | 1.13 | 900x92 |  |
| `div.mt-[var(--doc-region-gap)].flex.flex-wrap` | 1 | #fdfcfa | #fcfaf6 | 1.02 | 900x67 |  |
| `aside#_r_d_-panel.z-[32].hidden.border-[var(--co` | 1 | #faf7f2 | #fcfaf6 | 1.03 | 232x900 | px bg #faf7f2 |
| `nav.fixed.inset-x-0.bottom-0` | 1 | #ffffff | #faf7f2 | 1.07 | 1440x111 | px bg #ffffff |

### Document: boundary contrast, rules and borders (1440)

| boundary (first example) | count | sides: width, colour, ratio vs surrounding bg | box |
| --- | --- | --- | --- |
| `aside.sticky.top-0.z-[2]` | 1 | R 1px #e5e2dd 1.24:1 | 200x900 |
| `div.doc-rule-mid.mb-3.min-h-[107px]` | 1 | B 1px #2c2926 11.32:1 | 163x93 |
| `span.strata-line.relative.inline-block` | 2 | rule-fill #2c2926@0.22 1.51:1 (3px tall) | 88x3 |
| `span.strata-fill.absolute.inset-0` | 1 | rule-fill #5c4a3c 4.36:1 (3px tall) | 88x3 |
| `span.strata-fill.absolute.inset-0` | 1 | rule-fill #c4a57b 1.21:1 (3px tall) | 70x3 |
| `div.mt-auto.shrink-0.border-t` | 1 | T 1px #e5e2dd 1.01:1 | 163x251 |
| `header#document-project-status.doc-rule-mid.` | 7 | B 1px #2c2926 13.87:1 | 900x227 |
| `div.min-w-0.min-[1180px]:col-span-2.title-ru` | 1 | L 3px #6d4e24 7.28:1 | 900x37 |
| `section.mt-[var(--doc-region-gap)].min-w-0.b` | 1 | T 1px #e5e2dd@0.6 1.13:1; B 1px #2c2926 13.87:1 | 900x135 |
| `div.mt-4.border-l-2.border-[var(--color-gold` | 1 | L 2px #e8c547 1.61:1 | 900x20 |
| `section.mb-5.border-y.border-[var(--color-pe` | 1 | T 1px #e5e2dd 1.24:1; B 1px #e5e2dd 1.24:1 | 900x216 |
| `li.flex.flex-col.items-start` | 3 | T 1px #e5e2dd 1.24:1 | 900x72 |
| `button.inline-block.whitespace-nowrap.rounde` | 2 | T 1px #2c2926 13.87:1; R 1px #2c2926 13.87:1; B 1px #2c2926 13.87:1; L 1px #2c2926 13.87:1 | 190x18 |
| `button.flex.w-full.flex-wrap` | 1 | B 1px #e5e2dd 1.24:1 | 640x59 |
| `span.w-20.flex-shrink-0.rounded-[3px]` | 1 | T 1px #e8c547 1.61:1; R 1px #e8c547 1.61:1; B 1px #e8c547 1.61:1; L 1px #e8c547 1.61:1 | 90x25 |
| `div[role=separator].mb-[1.4rem].mt-[0.2rem].` | 1 |  | 900x2 |
| `div.relative.col-span-2.h-[1.5px]` | 1 | rule-fill #2c2926 13.87:1 (2px tall) | 900x2 |
| `input.min-w-[280px].max-w-full.border-b` | 1 | B 1px #c4a57b 2.23:1 | 280x35 |
| `div.mt-[var(--doc-region-gap)].flex.flex-wra` | 1 | L 2px #c4a57b 2.23:1 | 900x67 |
| `aside#_r_d_-panel.z-[32].hidden.border-[var(` | 1 | L 1px #e5e2dd 1.24:1 | 232x900 |
| `aside[role=note].flex.max-w-[34ch].items-sta` | 6 | T 1px #8f8c88 3.13:1; R 1px #8f8c88 3.13:1; B 1px #8f8c88 3.13:1; L 1px #8f8c88 3.13:1 | 195x361 |
| `nav.fixed.inset-x-0.bottom-0` | 1 | T 1px #e5e2dd 1.21:1 | 1440x111 |

### Document: key text elements (1440)

| element | text | colour | bg | ratio | size / weight | case, tracking | font | box |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| backLink | "BACK TO STUDIO OVERVIEW" | #2c2926 | #e8e3db | 11.32 (px) | 12px / 400 | uppercase, 0.96px | DM Mono | 128x36 |
| projectTitle | "Aspen Loft Refresh" | #2c2926 | #fcfaf6 | 13.87 (px) | 34px / 500 | none, 0 | Playfair Display | 292x37 |
| forTheClient | "for the client↗" | #7c5e30 | #fcfaf6 | 5.75 (px) | 20.7px / 400 | none, 0 | Playfair Display | 125x26 |
| railFirst | "CLIENT APPROVALS" | #2c2926 | #fcfaf6 | 13.87 (px) | 12px / 500 | uppercase, 0.96px | DM Mono | 131x16 |
| nextBandLine | "2 decisions overdue — olde" | #9c5340 | #fcfaf6 | 5.41 (px) | 16px / 400 | none, 0 | Inter | 344x21 |
| nextBandAction | "CHASE THE APPROVAL" | #2c2926 | #fcfaf6 | 13.87 (px) | 12px / 500 | uppercase, 1.44px | DM Mono | 156x12 |
| nextBandMore | "+4 MORE" | #9c5340 | #fcfaf6 | 5.41 (px) | 11px / 400 | uppercase, 0.88px | DM Mono | 52x14 |
| regionClientApprovals | "CLIENT APPROVALS" | #2c2926 | #fcfaf6 | 13.87 (px) | 12px / 500 | uppercase, 0.96px | DM Mono | 131x16 |
| ffeHeading | "FF&E SELECTIONS" | #2c2926 | #fcfaf6 | 13.87 (css) | 12px / 500 | uppercase, 0.96px | DM Mono | 122x16 |
| ffeEdit | "EDIT FF&E SCHEDULE" | #faf7f2 | #2c2926 | 13.53 (css) | 12px / 500 | uppercase, 1.44px | DM Mono | 156x12 |
| ffeRecordChange | "RECORD A CHANGE" | #5c4a3c | #fcfaf6 | 8.06 (css) | 12px / 400 | uppercase, 1.2px | DM Mono | 126x12 |
| finHeading | "PROJECT FINANCIALS" | #2c2926 | #fcfaf6 | 13.87 (css) | 12px / 500 | uppercase, 0.96px | DM Mono | 147x16 |
| finAction | "DRAFT AN INVOICE" | #faf7f2 | #2c2926 | 13.53 (css) | 12px / 500 | uppercase, 1.44px | DM Mono | 138x12 |
| closeoutAction | "CLOSE OUT PROJECT" | #65594e | #f1ece3 | 5.75 (css) | 12px / 500 | uppercase, 1.44px | DM Mono | 147x12 |
| scheduleHeading | "SCHEDULE DATES" | #2c2926 | #fcfaf6 | 13.87 (px) | 12px / 500 | uppercase, 0.96px | DM Mono | 114x16 |
| metaLine | "$4,250 receivable · not ye" | #4a3f35 | #fcfaf6 | 9.81 (css) | 18px / 400 | none, 0 | Inter | 1x1 |

### Document (document load, scroll 0): action labels (1440)

| variant | count | example labels | size / weight / case / tracking | colour on bg | text ratio | filled? (fill vs surround) | hit box |
| --- | --- | --- | --- | --- | --- | --- | --- |
| primary | 4 | "MESSAGE", "CHASE THE APPROVAL", "COMPLETE PHASE" | 12px / 500 / uppercase / 1.44px | #2c2926 on #fcfaf6 | 13.87 (px) | text only | 72x44 |
| secondary | 1 | "PREVIEW" | 12px / 400 / uppercase / 1.2px | #5c4a3c on #fcfaf6 | 8.06 (px) | text only | 71x44 |
| tertiary | 3 | "SHARING", "PROJECT DIRECTORY · 0", "COLLAPSE ↑" | 12px / 300 / uppercase / 1.2px | #65594e on #fcfaf6 | 6.51 (px) | text only | 71x44 |
| inked | 1 | "ASSIGN PROJECT CLIENT" | 12px / 500 / uppercase / 1.44px | #faf7f2 on #2c2926 | 13.53 (px) | css fill 13.87:1 (189x28 visible pill) | 193x44 |
| inked | 3 | "+ NEW OPEN ITEM", "EDIT FF&E SCHEDULE →", "DRAFT AN INVOICE" | 12px / 500 / uppercase / 1.44px | #faf7f2 on #2c2926 | 13.53 (css) | css fill 13.87:1 (138x28 visible pill) | 142x44 |
| tertiary | 4 | "COLLAPSE ↑", "ARCHIVE PROJECT" | 12px / 300 / uppercase / 1.2px | #65594e on #fcfaf6 | 6.51 (css) | text only | 97x44 |
| secondary | 6 | "HOLD A WINDOW", "ADD TASK", "RECORD A CHANGE" | 12px / 400 / uppercase / 1.2px | #5c4a3c on #fcfaf6 | 8.06 (css) | text only | 121x44 |
| inked | 1 | "CLOSE OUT PROJECT" | 12px / 500 / uppercase / 1.44px | #65594e on #f1ece3 | 5.75 (css) | text only | 159x44 |
| primary | 1 | "FROM THE ROLODEX" | 12px / 500 / uppercase / 1.44px | #2c2926 on #fdfcfa | 14.1 (css) | text only | 150x44 |
| secondary | 1 | "NEW PERSON" | 12px / 400 / uppercase / 1.2px | #5c4a3c on #fdfcfa | 8.19 (css) | text only | 96x44 |
| tertiary | 1 | "LATER" | 12px / 300 / uppercase / 1.2px | #65594e on #fdfcfa | 6.62 (css) | text only | 54x44 |
| secondary | 1 | "+ DECISION" | 12px / 400 / uppercase / 1.2px | #5c4a3c on #ffffff | 8.4 (px) | text only | 96x44 |
| secondary | 1 | "+ NOTE" | 12px / 400 / uppercase / 1.2px | #5c4a3c on #faf7f2 | 7.86 (css) | text only | 62x44 |

### Document region heads at page load (1440, quiet state)

| region head | heading text ratio | acts | weights | variants | differ in weight? | each act (label: variant, weight, ratio, fill) |
| --- | --- | --- | --- | --- | --- | --- |
| approvals-head | 13.87:1 (12px/500) | 2 | 500, 300 | inked, tertiary | YES | ASSIGN PROJECT CLIENT: inked, 500, 13.53 (css), pill 13.87:1 ; COLLAPSE ↑: tertiary, 300, 6.51 (css) |
| schedule | 13.87:1 (12px/500) | 2 | 500, 300 | inked, tertiary | YES | + NEW OPEN ITEM: inked, 500, 13.53 (css), pill 13.87:1 ; COLLAPSE ↑: tertiary, 300, 6.51 (css) |
| ffe | 13.87:1 (12px/500) | 3 | 500, 400, 300 | inked, secondary, tertiary | YES | EDIT FF&E SCHEDULE →: inked, 500, 13.53 (css), pill 13.87:1 ; RECORD A CHANGE: secondary, 400, 8.06 (css) ; COLLAPSE ↑: tertiary, 300, 6.51 (css) |
| money-head | 13.87:1 (12px/500) | 2 | 500, 300 | inked, tertiary | YES | DRAFT AN INVOICE: inked, 500, 13.53 (css), pill 13.87:1 ; COLLAPSE ↑: tertiary, 300, 6.51 (css) |
| closure | 12.24:1 (12px/500) | 1 | 500 | inked | no | CLOSE OUT PROJECT: inked, 500, 5.75 (css) |
| record | 13.87:1 (12px/500) | 0 | - | - | no |  |

### Document region heads with FF&E scrolled to the top (1440, active state; the FF&E head grew from 3 to 5 acts and Financials from 2 to 4)

| region head | heading text ratio | acts | weights | variants | differ in weight? | each act (label: variant, weight, ratio, fill) |
| --- | --- | --- | --- | --- | --- | --- |
| approvals-head | 13.87:1 (12px/500) | 2 | 500, 300 | inked, tertiary | YES | ASSIGN PROJECT CLIENT: inked, 500, 13.53 (css), pill 13.87:1 ; COLLAPSE ↑: tertiary, 300, 6.51 (css) |
| schedule | 13.87:1 (12px/500) | 2 | 500, 300 | inked, tertiary | YES | + NEW OPEN ITEM: inked, 500, 13.53 (css), pill 13.87:1 ; COLLAPSE ↑: tertiary, 300, 6.51 (css) |
| ffe | 13.87:1 (12px/500) | 5 | 500, 400, 300 | inked, secondary, tertiary | YES | EDIT FF&E SCHEDULE →: inked, 500, 13.53 (px), pill 13.87:1 ; ADD PROJECT ITEMS: secondary, 400, 8.06 (px) ; PREPARE PURCHASING AUTHORI: secondary, 400, 6.51 (px) ; RECORD A CHANGE: secondary, 400, 8.06 (px) ; COLLAPSE ↑: tertiary, 300, 6.51 (px) |
| money-head | 13.87:1 (12px/500) | 4 | 500, 400, 300 | inked, secondary, tertiary | YES | DRAFT AN INVOICE: inked, 500, 13.53 (px), pill 13.87:1 ; AMENDMENT: secondary, 400, 8.06 (px) ; PROJECT TIME LEDGER ↗: tertiary, 300, 6.51 (px) ; COLLAPSE ↑: tertiary, 300, 6.51 (px) |
| closure | 12.24:1 (12px/500) | 1 | 500 | inked | no | CLOSE OUT PROJECT: inked, 500, 5.75 (css) |
| record | 13.87:1 (12px/500) | 0 | - | - | no |  |

FF&E-scrolled view: pixel-measured action ratios (1440):

| head | label | variant / weight / size | ratio on pixels | sampled bg |
| --- | --- | --- | --- | --- |
| ffe | EDIT FF&E SCHEDULE → | inked / 500 / 12px | 13.53 | #2c2926 |
| ffe | ADD PROJECT ITEMS | secondary / 400 / 12px | 8.06 | #fcfaf6 |
| ffe | PREPARE PURCHASING AUTHORIZATI | secondary / 400 / 12px | 6.51 | #fcfaf6 |
| ffe | RECORD A CHANGE | secondary / 400 / 12px | 8.06 | #fcfaf6 |
| ffe | COLLAPSE ↑ | tertiary / 300 / 12px | 6.51 | #fcfaf6 |
| money-head | DRAFT AN INVOICE | inked / 500 / 12px | 13.53 | #2c2926 |
| money-head | AMENDMENT | secondary / 400 / 12px | 8.06 | #fcfaf6 |
| money-head | PROJECT TIME LEDGER ↗ | tertiary / 300 / 12px | 6.51 | #fcfaf6 |
| money-head | COLLAPSE ↑ | tertiary / 300 / 12px | 6.51 | #fcfaf6 |

FF&E and Financials text, scrolled view (1440): section title, room rows, amounts.

| text | colour on bg | ratio | size / weight / case | font |
| --- | --- | --- | --- | --- |
| $12,900 released | #2c2926 on #fcfaf6 | 13.87 (px) | 16px / 400 / none | Inter |
| Dining Room | #2c2926 on #fcfaf6 | 13.87 (px) | 16px / 400 / none | Playfair Display |
| Living Room | #2c2926 on #fcfaf6 | 13.87 (px) | 16px / 400 / none | Playfair Display |

Mobile (390) Document fixed/sticky bars at 400px scroll:

| element | box (x,y,w,h) | bg | text (first 70 chars) |
| --- | --- | --- | --- |
| section.doc-rule-mid.sticky.top-0 | 32,0,327,75 | rgb(252, 250, 246) | "THE CLIENT · DESIGN DEVELOPMENT 2 OF 5 OVERDUE 6D · DECISIONS CHASE +4" |
| nav.fixed.inset-x-0.bottom-0 | 0,718,390,126 | rgb(252, 250, 246) | "PROJECT FILE SECTIONS Client User SECTION: CLIENT APPROVALS MESSAGE TH" |
| ol.fixed.top-0.z-[100] | 0,0,390,36 | rgba(0, 0, 0, 0) | "" |

## 5. Cross-surface summary (1440)

| surface | text entries probed | min text ratio | entries < 4.5:1 | entries < 3:1 | text entries <= 12px | inked/filled controls (fill >= 3:1) | largest region-to-region bg ratio |
| --- | --- | --- | --- | --- | --- | --- | --- |
| signin-local | 17 | 2.25 | 1 | 1 | 8 | 0 inked; 1 filled | 16.98 |
| signin-prod | 15 | 2.25 | 1 | 1 | 6 | 0 inked; 1 filled | 16.98 |
| desk | 195 | 5.41 | 0 | 0 | 96 | 0 inked; 0 filled | 1.07 |
| doc | 164 (+2 excluded) | 2.64 | 8 | 1 | 115 | 5 inked; 4 filled | 1.23 |

Excluded from that table: text at opacity ~0 (the "DESIGN DEVELOPMENT" rail label in its hidden state) and text whose colour equals its CSS bg with no pixel sample (the "Today · 20 October" marker in the schedule, #2c2926 on #2c2926, a CSS bg mismatch not resolved). Lowest remaining Document text: "Sign-off" chip 2.64:1 (11px, #b8923a on #faf4e1, CSS-derived), and several 4.3:1 labels (#8b7355 on #fcfaf6: "Phase handoffs", phase names Schematic Design / Installation & Styling / Completion, "Due 30 October", "blocks this phase", "the dependency web").

Text ratio uses pixel-sampled bg when the element was inside the first viewport, otherwise CSS effective bg. For the Document this means below-the-fold text relies on CSS bgs, which are flat on that surface.

## 6. What the eye does (plain language; numbers from the tables above)

1. Sign-in builds one huge, unmistakable value step: a near-black panel (#1a1816) against cream (#fcfaf6) is 16.98:1, and the dark half is 38.86% of the screenshot. The eye lands on the dark/light seam first, then the cream half.
2. Inside the cream half the form is a single column with one answer-shaped path: the only filled control is the "Email sign-in code" button (#faf7f2 on #1a1816, 16.57:1 once enabled, 384x48 px, 600 weight), the Apple button is outlined (border 4.3:1), everything else is quiet text.
3. The sign-in headings are large serif (30px "Start with your email.", 13.87:1, and 47.5px hero at about 7.4:1) so the hierarchy is carried by size and one dark mass, not by many small labels.
4. The Desk is one value: its screenshot spans only 3.03 luma points between p5 and p95, with 0.57% dark pixels. Cards are #fcfaf6 on #faf7f2 (1.03:1) and are separated by 1px #8f8c88 outlines (3.13:1). Nothing is dark-filled; there are zero inked controls.
5. On the Desk every action is the same 12px uppercase mono label: "secondary" (400 weight, about 8:1) and "tertiary" (300 weight, 6.5:1) differ by weight and a hair of colour, not by size or fill, so Record Payment, Not Today and Until sit at nearly the same visual rank.
6. The Document has dark ink in small, scattered doses: 1.02% dark pixels at the top and 1.27% at FF&E, p5-p95 range 11.26 and 16.81 points, versus 91.01 on sign-in. Its only large value step is the left rail (#e8e3db vs paper #fcfaf6, 1.23:1).
7. The Document's one strong cue is the inked pill (#faf7f2 on #2c2926, 13.5:1, about 190x28 px visible). It repeats in every region head that has a lead act (Assign Project Client, + New Open Item, Edit FF&E Schedule, Draft an Invoice), so with several regions in view the eye gets several equal-weight dark pills instead of one.
8. Next to those pills sit 2-4 other acts per head at the same 12px mono caps (secondary 400, tertiary 300; 3 distinct weights in the FF&E and Financials heads when active). The act count in a head changes with the active region (FF&E 3 acts at load, 5 when scrolled to; Financials 2 then 4), so the head's shape shifts under the reader.
9. The Document's section dividers are 1px #2c2926 rules (13.9:1) plus pale 1px #e5e2dd lines (1.24:1). The strong rules mark region ends, but region interiors are separated by whitespace only (page #faf7f2, paper #fcfaf6, 1.03:1), so the dark rules are the main "where to go" cue, and they are thin.
10. Net: sign-in tells the eye where to go with one 17:1 value block and one filled button; the Desk and Document keep almost everything within a narrow band of luma (p5-p95 range: Desk 3.03 points, Document 11.26-16.81, sign-in 91.01) and spend their few dark pixels on many 12px labels and several same-weight pills.

## 7. Gaps and things not captured

- Prod signed-in surfaces (Desk, Document) were not captured: no prod credentials were used and prod walks are out of scope. Local data is seeded, so lengths and counts differ from Leah's real Document (see `proposal-1019-img0.png`).
- No priced FF&E / populated financials were found among the 13 Documents scanned from the Desk (not all projects were scanned): Aspen Loft Refresh has 2 FF&E lines with $12,900 released but "no budget yet" in Financials. Leah's example has more rows than this.
- `doc-mobilebar-390.png` shows the mobile bar at a 400px scroll; at that scroll the top Next band and the bottom bar both overlap content in the screenshot (the label "Client User" text collides with "SECTION: CLIENT APPROVALS"). This was not investigated further.
- Hover, focus and pressed states were not captured (read-only, no pointer interaction). Every action has a `.da-pool` span; only the `inked` variant paints it dark at rest (#2c2926, 189x28 px for the longest label). For the other variants the pool CSS colour is recorded in the JSON (`poolCssBg`, e.g. #eee6db on secondary) but the pixel samples show the page colour behind the label, so they are treated as text-only; it is probably a hover/press fill, not verified. One `inked` act, CLOSE OUT PROJECT, renders as grey text with no dark pill (#65594e on #f1ece3, 5.75:1; it sits in the CLOSEOUT band with "No recorded activity", likely a held/disabled state, not verified).
- Pixel-sampled backgrounds exist only for elements inside the first viewport at scroll 0 (plus the FF&E-scrolled viewport for the Document heads). Below-the-fold values are CSS-derived. Gradient backgrounds (sign-in dark panel) are measured by pixels only.
- Squint blurred metrics include a falloff at image edges; the raw columns are unaffected. The squint blur radius is a choice (10px at 1440, 6px at 390), not a perceptual model.
- `.env.local` could not be read (denied); local-vs-prod DB was confirmed from the served page instead.
- Mean/percentile luminance counts every pixel equally, so the sign-in's large dark panel dominates; this measures how much dark is on screen, not how well the eye is guided.
- The Next band act (CHASE THE APPROVAL) is a `primary` text act (500 weight, 13.87:1, no fill) while region heads below it print inked pills. `region-head.tsx` says that when the band prints its Next act every head's leader drops to text (`BandLeadsContext`, flag `one-voice`); in this local run heads are still inked, so that flag state is unknown/off here and was not toggled (read-only).
