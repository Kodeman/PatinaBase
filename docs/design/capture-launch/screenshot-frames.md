# Capture-launch screenshot shooting script

Kody's step-by-step for the five Chrome Web Store listing frames. Total: 20 minutes.

## Setup (follow walk-sheet.md P1 through step 4)

1. `git checkout capture-launch/integration && pnpm install && pnpm --filter @patina/extension build`
2. Chrome → `chrome://extensions` → Developer mode on → Load unpacked → select `apps/extension/build/chrome-mv3-prod`
3. Pin the extension to the toolbar
4. Sign in at https://app.patina.cloud in a normal tab first
5. Open a project with a room that has ≥1 empty FF&E line
6. Have the five vendor URLs ready in separate tabs

## Window sizing (macOS)

Run this once to set the Chrome window to exactly 1280×800 at screen origin (Retina multiplies to 2560×1600 pixels):

```bash
osascript -e 'tell app "Google Chrome" to set bounds of window 1 to {0, 0, 1280, 800}'
```

Verify the window is pinned to top-left and shows no scroll. If AppleScript doesn't work on your version of Chrome or Chrome isn't running, fall back to interactive pick: `screencapture -i ~/Desktop/frame-test.png` (select the Chrome window), note the size, and adjust as needed. This is safer — use it if osascript times out.

## Capture (repeat for each frame)

```bash
screencapture -l $(osascript -e 'tell app "Google Chrome" to id of window 1') -x ~/Desktop/frame-N.png
```

This captures only the Chrome window (no menu bar, dock, or desktop). If the AppleScript returns null, use the interactive fallback: `screencapture -i ~/Desktop/frame-N.png` and select just the panel.

After each frame, move it to `docs/design/capture-launch/screenshots/raw/frame-N.png` in the worktree:

```bash
mv ~/Desktop/frame-N.png /path/to/worktree/docs/design/capture-launch/screenshots/raw/
```

## Frame details

| # | Vendor URL | Panel state (how to reach it) | What must be visible | Caption | Gate |
|---|---|---|---|---|---|
| 1 | https://www.roomandboard.com/products/stevens-sofas | Open the extension on the URL; let extraction finish | Record fields (Name, Price, Brand, SKU / model #, Dimensions, Materials, Finish, Description) with verified/guessed badges visible | Reads the page you're on. | None |
| 2 | https://www.dwr.com/products/eames-lounge-chair-and-ottoman-walnut | Open the extension; scroll down to see Brand row showing "Herman Miller" and Dimensions row below it | Brand row displaying "Herman Miller", Dimensions row visible, both with verified badges | Manufacturer, not just retailer. | **CL-R12**: Brand must read as "Herman Miller" (not "Design Within Reach"). Check `extraction-report.json` DWR fixture before shooting. |
| 3 | https://www.hermanmiller.com/products/seating/lounge-seating/eames-lounge-chair-and-ottoman/ | Open the extension; select destination "An open spot in a room" from dropdown; select a project and room; then select an empty FF&E line | Destination option and FF&E line chosen, primary button visible | Saves straight into the room. | **CL-R10**: Primary button must say "Save into this room" or "Add to this room" (from `CommitBar.tsx` line 154–156). Quote the exact label visible in the actual destination flow. |
| 4 | https://www.1stdibs.com/furniture/lighting/chandelier/ (pick any multi-image listing) | Open the extension; tap the hero image to open the C3 image-selection sheet | Image carousel visible with multiple thumbnails and selection controls | Pick the image that's right. | None |
| 5 | Any of the above URLs | Complete a save to library (frame 1–4 can be re-used) and wait for the terminal screen; then note the "Recent" list showing the saved item | "Saved to your library" heading and at least one entry in the Recent list below | Saved. Ready for your eye. | None |

## After shooting

1. Verify all five `frame-1.png` through `frame-5.png` are in `docs/design/capture-launch/screenshots/raw/`
2. Each should be exactly 1280×800
3. Check frame 2 brand read and frame 3 button label against the gates above before committing
