# Headless Render Tool

A CLI tool for rendering HTML files and URLs to PNG screenshots at multiple widths, with support for hash-based navigation, interactive states, and comprehensive error reporting.

## Installation

The tool requires Playwright to be installed in the monorepo. It resolves Playwright from the pnpm workspace root.

## Usage

```bash
node render.mjs <file-or-url> --out <dir> [options]
```

### Options

- `--out <dir>` (required) — Output directory for PNG files and `console.json`
- `--name <base>` — Base filename (default: derived from file/URL)
- `--widths 1440,390` — Viewport widths to capture (default: 1440 and 390)
- `--hashes slide-1,slide-2` — Hash anchors to navigate (default: none, single capture)
- `--click "<selector>"` — CSS selector to click before each screenshot (repeatable)
- `--state "label=selector"` — Named state: click selector and capture with label suffix (repeatable)
- `--full` — Capture full page (default: true; use `--full false` for viewport only)
- `--dark` — Use dark color scheme (default: light)
- `--reduced-motion` — Use prefers-reduced-motion (default: no preference)
- `--console` — Print all console errors and warnings to stdout

### Examples

**Single page:**
```bash
node render.mjs /path/to/page.html --out screenshots/ --name mypage --widths 1440
```
Produces: `screenshots/mypage-1440.png`, `screenshots/mypage-console.json`

**Hash-paged deck:**
```bash
node render.mjs /path/to/deck.html --out deck-shots/ --name deck --hashes slide-1,slide-2,slide-3 --widths 1440,390
```
Produces:
- `deck-shots/deck-slide-1-1440.png`
- `deck-shots/deck-slide-1-390.png`
- `deck-shots/deck-slide-2-1440.png`
- `deck-shots/deck-slide-2-390.png`
- (etc.)
- `deck-shots/deck-console.json`

**Interactive states (e.g., a button click, then a modal state):**
```bash
node render.mjs /path/to/form.html --out form-shots/ --name form --state "expanded=button[aria-expanded=false]" --state "submitted=form button[type=submit]" --widths 1440
```
Produces:
- `form-shots/form-expanded-1440.png` (page with button clicked)
- `form-shots/form-submitted-1440.png` (page with submit button clicked)
- `form-shots/form-console.json`

## Behavior Details

### Navigation
- If `--hashes` are provided, a fresh browser context is opened for each hash (width × hash combination)
- No hash means one screenshot per width
- Hash is appended to the URL as a fragment: `file://...#hash`
- Same-document navigation (hash-only changes) do not re-run inline init scripts; each capture uses a fresh page

### Viewport Configuration
- **1440px** — desktop width, 900px height, device scale 1×
- **390px** — mobile width, 844px height, device scale 2× (renders and saves at 780×1688)
- Custom widths use default 900px height and 1×scale, or can be specified in `--widths`

### Device scale factor

`deviceScaleFactor` is a top-level `browser.newContext()` option in Playwright,
not a field of `viewport`. Until 8 September 2026 this tool nested it inside the
viewport object, where Playwright silently ignored it — every 390px capture came
out at 1× (390×844) instead of 2× (780×1688). Fixed; 390 captures are now 780px
wide. If you compare a capture made before that date with one made after, the
pixel dimensions will differ even when nothing on the page changed.

### Wait Behavior
- Waits for `document.fonts.ready`
- Waits for all `<img>` elements to load or timeout (15s total)
- Continues on timeout with a warning (no exit error)

### States and Clicks
- Each `--state` creates a fresh page
- `--click` selectors are applied to every capture (state or not)
- 300–500ms delay between clicks to allow animations

### Console Logging
- All `console.error()`, `console.warn()`, `console.log()` calls are captured
- Uncaught exceptions and page errors are captured
- Written to `<out>/<name>-console.json`
- Exit code 1 if any page error or uncaught exception occurred

### Filenames
Captures are named:
```
<name>[-<hash>][-<state>]-<width>[-dark][-rm].png
```

Examples:
- `mypage-1440.png` (single page)
- `deck-slide-1-1440.png` (hash, no state)
- `form-expanded-1440.png` (state, no hash)
- `form-expanded-dark-1440.png` (state + dark mode)

## console.json Format

```json
{
  "captures": [
    {
      "file": "mypage-1440.png",
      "width": 1440,
      "hash": null,
      "state": null,
      "errors": ["Uncaught TypeError: Cannot read property 'x' of undefined"],
      "warnings": ["Failed to load font: ..."],
      "horizontalOverflow": false
    }
  ]
}
```

**Fields:**
- `file` — Output filename
- `width` — Viewport width used
- `hash` — Hash fragment navigated to (null if none)
- `state` — State label (null if no state)
- `errors` — Page errors and uncaught exceptions
- `warnings` — Console.warn() and navigation/load warnings
- `horizontalOverflow` — Boolean; true if `document.documentElement.scrollWidth > window.innerWidth + 1`

Use console.json to:
1. **Validate captures** — check that expected pages loaded without errors
2. **Debug failures** — inspect error messages and warnings
3. **Detect layout issues** — identify captures with horizontal overflow

## Browser Sandbox Note

On macOS, Chromium may fail inside the Claude Code sandbox with:
```
[FATAL:base/apple/mach_port_rendezvous_mac.cc:155] 
bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer: Permission denied
```

If this occurs, run the script with `dangerouslyDisableSandbox: true` (in Claude Code) or outside the sandboxed environment.

## Fresh Context Per Hash

**Important:** When navigating to a new hash in the same page, the browser does not re-execute inline `<script>` blocks; it performs a same-document navigation. To capture different interactive states or page-initialization variants, use the `--state` option (which opens a fresh page per state) or pass a fresh `--hashes` on separate command invocations.

## Self-Test

The tool was tested by rendering `/private/tmp/patina-design-proposal-2026-09-07-kul503/index.html` to a test directory, capturing `#slide-1` at 1440px width. The output PNG and console.json were validated to confirm:
- Playwright resolution works from any working directory
- Hash navigation functions correctly
- Console.json is written with correct metadata
- Exit code is 0 for clean runs

Test output was deleted after verification.
