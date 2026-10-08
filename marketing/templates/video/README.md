# Video scaffold (HyperFrames)

For the Opus agent that composes a `video` piece. `compose.mjs` skips video on purpose: you build
the composition by hand from this scaffold, then `render.mjs` renders it.

Two standalone HyperFrames projects, one per channel in `marketing/canon/channels.json`:

| folder | channel | frame | max length |
|---|---|---|---|
| `9x16/` | `video-9x16` | 1080×1920 | 30 s |
| `16x9/` | `video-16x9` | 1920×1080 | 60 s |

Each `index.html` runs four scenes: title card → still with a slow pan → Midjourney clip → end
card. `assets/still.jpg` and `assets/clip.mp4` are PLACEHOLDER files so the scaffold passes
`npx hyperframes lint`. Replace both before rendering.

## Fill it from `copy/<P>.final.md`

The video final has `title` and `scenes: [{seconds, visual, onscreen, vo}]`. Claim markers
(`[C01]`) never go on screen.

1. Copy the folder that matches the piece's channel to `compose/<P>/`, so you have
   `compose/<P>/index.html` and `compose/<P>/assets/`.
2. Put the media in `compose/<P>/assets/`:
   - a still job: the file from `mj/picks.json` (fallback: the first file in `mj/assets.json`) for
     that job id;
   - a video job (MJ image-to-video, `startFrom` = the still it animates): Kody's clip from
     `mj/inbox/<J>/`.
   Keep ids and file names unique. Two `<img>`/`<video>` elements with the same id render blank.
3. Title card: set `#title-eyebrow` to the concept name and `#title-text` to `title`.
4. One timed block per scene, in order:
   - `data-start` = the sum of the earlier scenes' `seconds`, `data-duration` = this scene's `seconds`;
   - a still visual → an `<img class="clip full">` with the slow-pan `fromTo` (one camera move, no
     zoom-and-pan combos); a video visual → a `<video class="clip full" muted playsinline>`;
   - `onscreen` → a `<p class="clip onscreen">` in the middle third, 7 words or fewer, Inter.
   Copy the existing scene blocks; add new ones for extra scenes. Every clip stays a direct child
   of `#root`. Keep at most two or three clips per `data-track-index` (lint warns on dense tracks)
   and never overlap two clips on one track.
5. End card: the Patina mark once, at the end, on paper. `#end-line` takes the closing line.
6. Set the root `data-duration` to the total (title + scenes + end card). Keep it at or under the
   channel's max length.
7. Timeline: one paused GSAP timeline at `window.__timelines["main"]`. Use `fromTo` for every
   entrance; never pair a CSS `transform` with a tween on the same property; no `repeat: -1`.
8. `vo` lines are the voice-over script. The scaffold has no audio track. If a VO recording
   exists, add it as a separate `<audio>` element with its own track index.

## Check and render

From the repo root:

```bash
npx hyperframes lint marketing/runs/<run>/compose/<P>    # must report 0 errors
node marketing/tools/render.mjs marketing/runs/<run> --piece <P>
```

`render.mjs` runs `npx --no-install hyperframes render` into `out/<P>/<P>.mp4` when the CLI is
installed. Without it (or without ffmpeg) it records `skipped` in `ledger.json` with the reason.
