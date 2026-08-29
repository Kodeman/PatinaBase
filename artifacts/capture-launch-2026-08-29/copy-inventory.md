# Copy inventory — capture-launch W0-D1

Every user-facing string in the files named by the brief: `src/tabs/onboarding.tsx`,
`src/components/AuthScreen.tsx`, `src/panel/CommitBar.tsx`,
`src/screens/TerminalScreens.tsx`, `src/panel/regions/*.tsx`,
`src/overlays/*.tsx`, and the context-menu titles in `src/background.ts`.
Dynamic template strings are shown with their literal wrapper text; the
interpolated value is noted as `{…}`.

**Overall read against `patina-brand-voice`**: no hits on the banned lexicon
(curated/luxury/elevated/bespoke) and nothing leads with "AI"/"algorithm"/
"powered by" — the surface is clean on that front. The real gaps are (1) one
outright false privacy claim, (2) confidence-score/pipeline-mechanics
language surfacing where outcome language belongs, and (3) internal
data-model nouns ("slot", "line", "decision") leaking straight into primary
button copy.

## `src/tabs/onboarding.tsx`

| Line | String | Surface | Voice note |
|---|---|---|---|
| 45 | "Patina Capture" | O-flow header wordmark | On-brand, no note. |
| 105 | "Welcome" | eyebrow, step 0 | — |
| 105 | "Capture, in one keystroke." | title, step 0 | Confident/unpretentious, on-voice. |
| 105 | "Get started" | primary button, step 0 | — |
| 106–107 | "Pull any furniture page into your Patina library — verified, priced, and routed to the right project. Let's set it up; it takes a minute." | body, step 0 | **"verified"** is a puffery risk: nothing in the pipeline actually verifies a captured field against a source of truth — extraction is best-effort DOM scraping (this audit's own extraction-report.json shows wrong currencies, missed dimensions, a crash). Reads as an overclaim on day one. Plain-spoken otherwise. |
| 113–119 | "Connect workspace" / "Sign in to Patina" / "Open Patina to sign in" | eyebrow/title/button, step 1 | — |
| 121–122 | "Capture saves straight into your workspace. Sign in to the Patina portal and the extension adopts your session automatically — then come back here." | body, step 1 | "adopts your session automatically" is dev-flavored ("session" as an auth-token concept) for a first-run explainer; a plainer "you'll be signed in here too" would match the plain-spoken register better. Low severity. |
| 129 | "I'm signed in →" | button, step 1 | — |
| 137 | "Why page access" / "Reading the page" / "Makes sense" | eyebrow/title/button, step 2 | "Makes sense" as a primary CTA is casual to the point of vague, but this is a low-stakes permissions screen — fine. |
| 138–140 | "To pull a product's name, price, and images, Patina reads the page you're on when you capture — only then, only that tab. Nothing is read in the background, and nothing leaves your workspace." | body, step 2 (page-access primer) | **False claim, high severity.** "Nothing leaves your workspace" is not true: PostHog analytics and Supabase both receive data from the extension (`src/lib/analytics.ts`, `src/lib/supabase.ts`, every save/search RPC). This is the exact install-time trust claim a privacy-conscious installer will hold Patina to later. Needs a rewrite or removal — not a wording nit. |
| 147–153 | "Ready" / "You're set to capture" / "Start capturing" / "Pin Patina to your toolbar so it's one click away — open the puzzle-piece menu in Chrome and pin it." | eyebrow/title/button/body, step 3 | Plain, accurate, on-voice. |
| 156–162 | "Shortcut: {shortcut}" / "Set a shortcut at chrome://extensions/shortcuts" | body, step 3 | Technical (chrome:// URL) but necessary and accurate — fine for a setup screen. |
| 80 | "Back" | nav button (Shell) | — |

## `src/components/AuthScreen.tsx`

| Line | String | Surface | Voice note |
|---|---|---|---|
| 52 | "Patina" | header wordmark | — |
| 53, 116 | "Sign in to capture products" | header subtitle (both screens) | — |
| 64 | "Back to QR code" | button | — |
| 75 | "Email" | field label | — |
| 87 | "Password" | field label | — |
| 104 | "Signing in..." / "Sign in" | submit button states | Inconsistent ellipsis style vs. the panel's "…" (single-glyph) elsewhere — cosmetic, not voice. |
| 156 | "Code expired" | QR expiry state | — |
| 161 | "Generate new code" | button | — |
| 179 | "Try again" | button, error state | — |
| 187 | "Scan with the Patina iOS app" | QR instructions | — |
| 189 | "Expires in {mm:ss}" | QR countdown | — |
| 195 | "Signed in!" | success state | — |
| 212 | "Sign in with email" | button | — |
| 221 | "Use email code on patina.cloud" | button | Mentions the portal domain directly — fine, it's literally where the flow goes. |
| 223–225 | "After you sign in, this extension will pick up your session automatically." | helper text | Same "session" framing note as onboarding step 1 — minor, consistent at least. |

## `src/panel/CommitBar.tsx`

| Line | String | Surface | Voice note |
|---|---|---|---|
| 99–103 | "Placing…" / "Retry project placement" / `Place existing "{name}"` | dedup + project-placement button | "placement" is internal spec-book vocabulary carried straight into the primary CTA. A designer reads "placement" fine (it's their domain word); a homeowner-side installer would not — but this button only appears once a duplicate + project route is already resolved, a designer-only path, so acceptable. |
| 111 | "Saving & placing…" / "Save as new selection" | secondary button | — |
| 124 | "Updating…" / `Update "{name}"` | dedup update button | — |
| 132 | "Saving…" / "Save as new instead" | secondary button | — |
| 146–158 | "Saving…" / "Retry project placement" / **"Save & fill slot"** / **"Save & create line"** / "Save to project inbox" / "Save to library" | primary save button, state-dependent | **Jargon a public installer wouldn't know, medium-high severity.** "Slot" and "line" are internal FF&E spec-book nouns (`project_ffe_items`, `SpecBookPlacementRoute.kind`) surfaced verbatim in the single most load-bearing button in the whole panel. A first-time user has no way to know what a "slot" or a "line" is without having used the designer portal's Spec Book first. |
| 167 | "Saving…" / "Send to inbox" | inbox button | "Inbox" is plain enough (matches consumer mental model), fine. |
| 176 | "Send for client approval →" | decision-flow trigger | Plain, clear intent — good. |

## `src/screens/TerminalScreens.tsx`

| Line | String | Surface | Voice note |
|---|---|---|---|
| 13, 62 | "Capture another" | next-action button (both terminals) | — |
| 43–49 | "The piece is in your library and its existing project selection was reused." / "…filled the selected project need." / "…its project placement is held for review." / "…a project selection was created." / "The piece is in your library, ready to place." | S4 save-outcome subline | "held for review" surfaces an internal moderation-state word ("held") without saying who's reviewing or why — a little opaque for a success screen. Otherwise plain and on-voice ("the piece," sensory/tangible noun choice, good). |
| 53 | "Saved to your library" | S4 title | Good, plain, confident. |
| 72–73 | "Sent to your inbox" / "Tucked into the inbox to sort when you're back at the desk." | S5 (inbox) terminal | "Tucked into" is a nice sensory, unpretentious verb — on-voice. |
| 84–86 | "Couldn't read this page" / "The page blocked extraction or timed out. Try again, or capture it by hand." | R5 error screen | "extraction" is pipeline-internal terminology; "the page blocked us" or "we couldn't pull the details" would read more human. Low-medium severity — this is an error state so some technical candor is expected, but "extraction" specifically is jargon. |
| 94 | "Retry" | button | — |
| 101 | "Snapshot" | button | Names the fallback capture mode by its internal name (matches `R2`/`SNAPSHOT_CAPTURED` in state); a first-time user seeing this cold has no context for what "Snapshot" does differently from "By hand." Minor. |
| 108 | "By hand" | button | Good plain-spoken alternative to "manual entry." |

## `src/panel/regions/RecordRegion.tsx`

| Line | String | Surface | Voice note |
|---|---|---|---|
| 22, 30, 30, 40 | "Reading image…" / "No text read" / "Filled from image" / "Read text from image" | OCR trigger button states | Good — "OCR" itself never leaks into the UI copy, only into the internal pref name (`ocrEnabled`, shown to users as "Read text from images" in Settings). This is the surface doing it right. |
| 95 | "Name" | field label | — |
| 101 | "Product name" | input placeholder | — |
| 109 | "Price" | field label | — |
| 118 | "0.00" | input placeholder | — |
| 127 | "Brand" | field label (only renders when a vendor is linked — see field-visibility.json: it never renders straight out of extraction) | — |
| 135 | "Description" | field label | — |
| 141 | "—" | textarea placeholder (empty state) | — |
| 79 | "no image" | hero placeholder | — |
| 74 | "Choose images" | hero button title attribute | — |

## `src/panel/regions/TradeRegion.tsx`

| Line | String | Surface | Voice note |
|---|---|---|---|
| 22 | "Trade" | section label | — |
| 28–30 | "Trade pricing resolves against {vendor} once the account is linked." / "Link a manufacturer to surface trade pricing." | body copy | "resolves against" and "surface" are both dev-register verbs ("the query resolves against the table," "surface the data") rather than something a trade professional would say out loud. A plainer "You'll see {vendor}'s trade price once your account is linked" reads more like the brand voice elsewhere. Low-medium severity. |

## `src/panel/regions/InsightRegion.tsx`

| Line | String | Surface | Voice note |
|---|---|---|---|
| 39 | "Patina insight" | section label | On-brand name, but see below — the content under it leans mechanical. |
| 43 | "{confidence} confidence" | badge (`high`/`medium`/`low`, straight from `ExtractionConfidence`) | **Pipeline-mechanics leaking into copy, medium severity.** This surfaces the extractor's internal scoring band verbatim as if it were a finished product feature, with zero explanation of what "confidence" measures or why a user should care. Violates the "technology is the silent enabler, outcomes first" rule more than any other single string in this surface — it's the algorithm's self-assessment, shown raw. |
| 47–49 | "Read {n} of {m} fields from {host}." / "{flagged fields} need a look." | body copy | Same issue at lower severity: "Read N of M fields" narrates the extraction process itself rather than the outcome ("here's what's ready" vs. "here's what I did"). The flagged-field list literally prints internal field keys (`materials, colors, finish, dimensions`) as the sentence's subject — readable, but it's schema field names doing double duty as prose. |

## `src/panel/regions/RouteCommitRegion.tsx`

| Line | String | Surface | Voice note |
|---|---|---|---|
| 37 | "Route to" | section label | "Route" is logistics/ops language for what is, to the user, just "where does this go" — mild jargon, but short enough to read as a neutral label rather than a sentence. |
| 44 | "+ New project" | button | — |
| 60 | "Loading project placement" | aria-label (not visually rendered — screen-reader only) | — |

## `src/overlays/AccountSheet.tsx`

| Line | String | Surface | Voice note |
|---|---|---|---|
| 18 | "Account" | overlay title | — |
| 22 | "Signed in" | dt label | — |
| 27 | "Version" | dt label | — |
| 32 | "updated by Chrome" | version subtext | Plain and accurate. |
| 41 | "Sign out" | button | — |

## `src/overlays/CreateProjectSheet.tsx`

| Line | String | Surface | Voice note |
|---|---|---|---|
| 33 | "New project" | overlay title | — |
| 41 | "Creating…" / "Create & route here" | submit button | "route" again — logistics word, but reads fine as a short button label. |
| 21 | "Could not create the project." | error state | — |
| 51 | "Project name" | field label | — |
| 59 | "e.g. Aspen Residence" | placeholder | Midwest-neutral example name — no coastal signifier, on-voice per the hard rule. |

## `src/overlays/ImageSelectSheet.tsx`

| Line | String | Surface | Voice note |
|---|---|---|---|
| 19 | "Choose images" | overlay title | — |
| 19 | "{n} of {m} kept" | subtitle | — |
| 21 | "No images were found on this page." | empty state | — |

## `src/overlays/InsightSheet.tsx` (C5 — expanded Patina insight)

| Line | String | Surface | Voice note |
|---|---|---|---|
| 29 | "What we read" | overlay title | Better than the collapsed region's raw "confidence" badge — process-framed but at least in plain words. |
| 29 | "{confidence} confidence" | subtitle | Same raw-confidence-score note as InsightRegion above. |
| 30–33 | "Pulled from {host}. Verdigris means we're confident; rust means it needs your eye." | body copy | Explains the color coding using the design system's own paint names (verdigris, rust) — unusual word choice for UI copy, but thematically on-brand (aged-metal, patina vocabulary) rather than jargon; net positive, not a flag. |
| 7–15 | "Name" / "Price" / "Description" / "Materials" / "Colors" / "Finish" / "Dimensions" | row labels | Plain field names, fine. |
| 51 | "Open source page ↗" | link | — |

## `src/overlays/RecentCapturesSheet.tsx`

| Line | String | Surface | Voice note |
|---|---|---|---|
| 76 | "Recent" | overlay title | — |
| 80 | "Search your library…" | input placeholder | — |
| 86 | "No matches." | empty state (search) | — |
| 92–93 | "Nothing captured yet this session." | empty state (no history) | — |
| 14–17 | "Library" / "Inbox" / "Decision" / "Updated" | `TARGET_LABEL` row sublabels | "Decision" as a bare noun here assumes the reader already knows Patina's client-decision feature exists — see `DecisionSheet.tsx` note below, same root issue. |

## `src/overlays/SettingsSheet.tsx`

| Line | String | Surface | Voice note |
|---|---|---|---|
| 7 | "Trade layer" / "Show the trade pricing region" | toggle | "Trade layer" and "region" are both internal-architecture words (this app's own region/slice naming) doing double duty as user copy. A designer will parse "Trade" fine; "layer" specifically reads like a settings-panel-of-a-settings-panel word. Low-medium severity. |
| 8 | "Duplicate warnings" / "Flag look-alikes already in your library" | toggle | "look-alikes" is a nice, plain, sensory substitute for "duplicates" — good on-voice writing. |
| 9 | "Snapshot fallback" / "Offer a screenshot when a page blocks extraction" | toggle | "extraction" jargon again, same as the R5 error screen. |
| 10 | "Read text from images" / "Use OCR to pre-fill from snapshots" | toggle | Inconsistent with RecordRegion's clean avoidance of "OCR" — the label is plain but the **hint** spells out "OCR," undoing that discipline for anyone who reads past the label. |
| 11 | "Auto-detect vendor pages" / "Switch to vendor mode on brand pages" | toggle | "vendor mode" is an internal page-mode enum (`PageMode = 'vendor'`) surfacing directly; a plainer "when you're on a maker's own site" would fit the brand's maker/workshop lexicon better. |

## `src/overlays/DecisionSheet.tsx` (DEC — send as client decision)

| Line | String | Surface | Voice note |
|---|---|---|---|
| 41–42 | "Sent for approval" / "The client has been notified." | success state | Plain, clear. |
| 51 | "Capture another" | button | — |
| 60–61 | "Send for approval" / "Create a client decision" | overlay title/subtitle | **"a client decision" is unexplained internal product terminology, medium severity.** Nothing on this screen or the ones before it ever tells the installer what a "decision" is as a distinct object from an "approval" or a "proposal" — the subtitle assumes the reader already knows Patina's spec-book decision model. Ties back to the same bare "Decision" label in RecentCapturesSheet. |
| 69 | "Sending…" / "Choose a client" / "Send to client" | submit button states | — |
| 79–81 | "Decision title" / `Approve: {name}` (placeholder) | field label/placeholder | "Approve:" prefix presumes the decision is a yes/no approval ask, which is consistent — fine. |

## `src/background.ts` — context menu titles

| Line | String | Surface | Voice note |
|---|---|---|---|
| 462 | "Capture page with Patina" | right-click → page | Clean, plain, on-voice. |
| 463 | "Capture this image" | right-click → image | Clean. |
| 464 | "Capture selection as product" | right-click → selection | Clean, though "as product" is a small nod to internal typing (`captureKind: 'product'`) — negligible. |

## Top 5 findings (by severity)

1. **False privacy claim** — onboarding step 2 (`src/tabs/onboarding.tsx:140`): "nothing leaves your workspace" while PostHog + Supabase both receive extension data. This is the single highest-severity item — it's an install-time trust promise, not a wording nit.
2. **"Save & fill slot" / "Save & create line"** (`src/panel/CommitBar.tsx:146-158`) — internal FF&E spec-book nouns in the primary save CTA, unexplained anywhere upstream.
3. **Raw `{confidence} confidence` badge** (`InsightRegion.tsx:43`, `InsightSheet.tsx:29`) — the extractor's internal scoring band shown as-is, the clearest single violation of "technology is the silent enabler."
4. **"a client decision" / bare "Decision"** (`DecisionSheet.tsx:61`, `RecentCapturesSheet.tsx:17`) — unexplained internal object name for the client-approval feature.
5. **"verified, priced, and routed"** puffery in the onboarding step-0 pitch (`onboarding.tsx:106`) — "verified" oversells what a best-effort extractor actually does, as this lane's own extraction-report.json demonstrates (wrong currency on 1stDibs, missed dimensions, a hard crash on Pinterest).
