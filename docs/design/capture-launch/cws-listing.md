# Chrome Web Store listing — Patina Capture

Paste-ready copy for the CWS developer dashboard, one field per section below.
Draws on `docs/design/capture-launch/permissions-justification.md` for the
data-use and permission wording, and on `artifacts/capture-launch-2026-08-29/rulings.md`
(CL-R7, CL-R8, CL-R10) for the calls made this lane inherits rather than re-litigates.

## Name

```
Patina Capture
```

## Summary

Character count target: ≤132. Actual: **124** (`printf '<text>' | wc -m`).

```
Save the piece in front of you — name, price, images, dimensions — from the vendor's page straight into your Patina library.
```

## Detailed description

Plain text, ≤16,000 characters. Opens on a line adapted from the seed copy
live in the portal's install prompt
(`apps/designer-portal/src/components/document/rooms/library/capture-extension-prompt.tsx:81`,
which reads "...and saves it here, ready for your eye" — adapted below to
name the library explicitly since the store listing has no portal context
around it), closes on the tagline. No "AI," "curated," "luxury," "elevated,"
or "bespoke."
Midwest examples only. Does not claim the extraction pipeline verifies,
prices, or routes anything — it tells you what it read and what it guessed,
and leaves the routing to you.

```
Patina Capture reads the piece in front of you and saves it to your Patina library, ready for your eye.

Open the side panel from the toolbar, a right-click menu, or a keyboard shortcut, and it pulls what the page already tells you — name, price, images, dimensions when they're there. Nothing is invented: every field it fills is marked as read from the page or guessed, so you know at a glance what to double-check before it's part of your library.

WHAT IT DOES

- Reads the product page you're on when you choose to capture it — one click, or Ctrl+Shift+S (Cmd+Shift+S on Mac).
- Pulls name, price, images, and dimensions where the page provides them, and shows you which fields came straight from the page versus which it guessed.
- Tells manufacturer from retailer when the page says so, so a Room & Board piece stays credited to Room & Board rather than to whichever site you found it on.
- Saves to your personal library, or into a room on a project you're already working.
- Works the same way on a large manufacturer's own site — Herman Miller, for instance — as it does on a small maker's own shop.

WHAT IT NEEDS

- A Patina account, signed in once at app.patina.cloud. Capture saves under your account, into your workspace.
- Permission to read pages you visit. The extension loads quietly on each page but stays inert — it reads nothing about the page and sends us nothing until you choose to capture it.

WHAT IT DOESN'T DO

- It's inert on every page until you capture: it reads and sends product fields only on the page you choose, only when you start a capture — never in the background, never on a tab you haven't acted on.
- It doesn't verify prices, availability, or lead times against the vendor — it reads what's on the page and tells you plainly when a field is a guess rather than a fact.
- It doesn't post, message, or share anything outside your own Patina workspace.
- It doesn't run any code beyond what ships in the extension package — no remote scripts, no server-side rendering of your data.

Built for the trade: a fast, honest way to bring the pieces you find on the open web back to your desk, so the sourcing work you already do shows up where you keep it.

Where Time Adds Value.
```

**Verify before submission:** the "Tells manufacturer from retailer" bullet
above assumes CL-R12 (W2-D9 extraction lane) has landed — brand read from
the page, domain kept as retailer-only. Check the DWR fixture in
`extraction-report.json` reports brand `Herman Miller` / retailer `Design
Within Reach`. If CL-R12 hasn't landed by submission, replace that bullet
with: "Keeps the retailer you found it on attached to the piece."

## Category, language, URLs

| Field | Value |
|---|---|
| Category | Workflow & Planning |
| Language | English (United States) |
| Homepage URL | `https://app.patina.cloud` |
| Support URL | `https://app.patina.cloud/privacy#contact` — see test below |
| Privacy policy URL | `https://app.patina.cloud/privacy` (page is being built in lane D2; not yet live at test time — see note) |

### Support URL test (signed-out)

```
$ curl -sI https://app.patina.cloud/help | head -3
HTTP/2 307
location: /auth/signin?callbackUrl=%2Fhelp

$ curl -sI https://app.patina.cloud/privacy | head -3
HTTP/2 307
location: /auth/signin?callbackUrl=%2Fprivacy
```

Per CL-R7's rule ("`app.patina.cloud/help` if reachable signed-out, else the
contact address on the new privacy page"): `/help` redirects signed-out
visitors to `/auth/signin` (307, not 200) — it is behind auth middleware
today, so it fails the test. Use **`https://app.patina.cloud/privacy#contact`**
as the support URL instead.

Caveat for whoever fills the dashboard: `/privacy` *also* 307s signed-out
right now, because lane D2 (which builds the public `(legal)` route group and
adds `/privacy`/`/terms` to `isPublicPage`) has not landed in this worktree.
This is expected — D2 is a parallel W1 lane, not a defect in this one. Before
submitting the listing (W4), re-run both curls; `/privacy` must return 200
signed-out or the support URL points at a dead end. If `/help` also ships
public before submission, prefer it per the ruling.

## Single-purpose statement

```
Saves the product on the web page a designer is viewing — name, price, images, dimensions, and vendor — into their Patina library or an active project, only when the designer chooses to capture it.
```

## Remote code

**No.**

Two prerequisites make this true, both W1/W2 lanes in this same program:

1. **Fonts bundled (W2-E7)** — `src/style.css:1` currently imports Fraunces /
   Hanken Grotesk / IBM Plex Mono from Google Fonts at runtime, which counts
   as a remote resource. E7 vendors the woff2 files under `assets/fonts/` and
   switches to local `@font-face`. `check-bundle.sh` greps the production
   build for `fonts.googleapis` and fails the gate if it's still present.
2. **OCR removed (W1-E5)** — `tesseract.js` and the `web_accessible_resources`
   entry for `tesseract/*` are cut this wave (CL-R3); the assets never
   existed, so the toggle was dead weight, but the dependency and the
   `wasm-unsafe-eval` CSP token needed to go too. Once both land, the
   manifest's `content_security_policy.extension_pages` is `script-src 'self'`
   only and nothing in the bundle fetches code at runtime.

Do not tick "No" on the dashboard until both E5 and E7 have merged and a
fresh `check-bundle.sh` run is clean.

## Data-use disclosure

Tick:

- **Authentication information** — the extension reads the designer's Patina
  session (portal cookie or QR/email sign-in) to know who is capturing;
  `src/lib/portal-cookie.ts:137` (`chrome.cookies.getAll`) and
  `src/lib/chrome-storage-adapter.ts` (Supabase session persistence).
- **Personally identifiable information** — account email only, used for
  authentication and support identification. No other PII is collected.
  (Note: `email_domain` was previously sent as a PostHog identify property;
  CL-R8 drops it in W3-E10 — `identifyUser` in `src/lib/analytics.ts:41-49`
  stops taking `properties?.emailDomain`. Do not check this box claiming more
  than account email, and re-verify `analytics.ts` before submission that the
  drop has actually landed.)
- **Website content** — the product page's visible fields (name, price,
  images, dimensions, materials) that the designer captures, plus any note
  they type alongside the capture, and only that page, and only on the
  designer's action (`src/contents/extractor.ts`, invoked from
  `src/hooks/use-capture-controller.ts`).
- **User activity** — anonymized product-analytics events (capture opened,
  product captured, extraction outcome) via PostHog, `src/lib/analytics.ts`.
  No autocapture, no session recording (`disable_session_recording: true`,
  `autocapture: false`, `analytics.ts:19-23`), no IP collection (`ip: false`).

Leave unticked, with reasoning:

- **Health information** — never collected; the extension has no path to it.
- **Financial and payment information** — never collected; capture never
  touches price entry beyond reading the displayed price off the page as
  product data (that's "website content," not payment info) — no card, bank,
  or billing data is read or stored.
- **Personal communications** — never read; the extension doesn't access
  email, messages, or chat content.
- **Location** — never requested; no geolocation API is used.
- **Web history** — the extension does not log or transmit the designer's
  browsing history; it reads only the single active tab, only on capture
  (`activeTab`, not `tabs`, and no `history` permission in the manifest).

### Certifications (tick all three)

1. I do not sell or transfer user data to third parties, outside of the
   approved use cases.
2. I do not use or transfer user data for purposes unrelated to the item's
   single purpose.
3. I do not use or transfer user data to determine creditworthiness or for
   lending purposes.

All three are true as built: captured data goes to the designer's own Strata
project (`products`/`vendors`/`proposal_captures` tables, RLS-scoped to the
authenticated user), analytics goes to Patina's own PostHog project, and
nothing is sold, brokered, or repurposed.

## Asset spec

| Asset | Spec | Status |
|---|---|---|
| Icon | 128×128 PNG, ~96px artwork, ~16px margin | **Flag — see below.** Source is `apps/extension/assets/icon.png`. |
| Screenshots | 5 × 1280×800, 24-bit PNG or JPEG, no alpha channel | Not yet produced (W3-D8, Kody shoots raw frames per CL-R6) — planned frames listed below |
| Small promo tile | 440×280, no alpha | Not yet produced (W3-D8, cut from screenshot frame 1) |
| Marquee (1400×560) | — | Skipped for v1 per the plan |
| Trader declaration | Dashboard field | Kody fills at submission |
| Verified contact email | Dashboard field | Kody's, at submission |

### Icon audit

```
$ sips -g pixelWidth -g pixelHeight -g hasAlpha apps/extension/assets/icon.png
  pixelWidth: 512
  pixelHeight: 512
  hasAlpha: yes
```

**Flag: this is not the 128×128 PNG the CWS dashboard's icon upload field
wants — it's the 512×512 master Plasmo generates the manifest's 16/32/48/128
icon set from.** For the *store listing* icon (a separate upload from the
manifest icons), someone needs to export a 128×128 PNG from this master
before the dashboard will accept it — describing the resize, not doing it
here, since this pathspec is docs-only.

Visual check on the 512×512 master: the mark is three horizontal bars
(rounded rects) centered in the canvas — roughly 410px wide × 180px tall
inside the 512×512 frame. Horizontal margins are close to the ~16px-at-128
(≈64px-at-512) target — about 50px each side, slightly tight but workable.
Vertical margins are much larger than needed (~155px top and bottom) because
the mark itself is short and centered, not because of deliberate padding —
at a 128×128 export the three bars will read as a thin horizontal band with
a lot of empty top/bottom space, and at 16×16 (favicon/toolbar-pinned size)
the two thinner bottom bars are likely to blur together or vanish. Worth a
design look before the 128×128 export is cut, not just a mechanical resize.

### Screenshot frames (planned, W3-D8)

1. `roomandboard.com` — capture panel open, verified field badges visible.
2. `dwr.com` (Eames chair) — Brand shows "Herman Miller" while the page/URL
   is Design Within Reach, with the dimensions row visible — demonstrates
   manufacturer ≠ retailer (CL-R12). **Verify before shooting/submitting:**
   CL-R12 (W2-D9 extraction lane) has landed — the DWR fixture must report
   brand `Herman Miller` / retailer `Design Within Reach` in
   `extraction-report.json`. If it hasn't landed, shoot this frame with the
   fallback claim instead: "Keeps the retailer you found it on attached to
   the piece."
3. `hermanmiller.com` — the route flow: project → room → placement, "Save &
   fill" as the primary action. **Verify before shooting:** the primary
   button copy must be the post-CL-R10 wording (no "slot"/"line"/bare
   "decision" — W2-D7 retires those from primary buttons in `CommitBar.tsx`
   / `DecisionSheet.tsx`) before this frame is shot, or the screenshot will
   show internal nouns a reviewer or a designer shouldn't see.
4. `1stdibs.com` — the image-selection sheet mid-capture.
5. Saved state — the panel's terminal/confirmation screen plus the "Recent"
   list showing the capture landed.

### Store screenshot captions (≤5 words each)

1. Reads the page you're on.
2. Manufacturer, not just retailer.
3. Saves straight into the room.
4. Pick the image that's right.
5. Saved. Ready for your eye.

## Version line

```
0.3.0
```

Tag: `extension-v0.3.0` (cut at W4, per the program plan's tag/submit step —
not this lane's job to push).
