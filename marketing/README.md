# The Press

A repo-local pipeline that turns one brief into a batch of Patina marketing pieces (social posts,
pins, email, one-pager, deck, PR pitch, poster, video) and a single-file review board. It runs as
two Claude Code Workflows with a human Midjourney step between them.

Output lands only in a run folder and the board. **Nothing is ever sent, posted or published.**
Midjourney is a human hand-off: its terms ban automated access, so nothing here drives it.

Canon lives in `canon/` (`voice.md`, `claims.md`, `art-direction.md`, `channels.json`,
`lexicon.json`). `docs/vision/VISION.md` wins every conflict. The skill that drives a run is
`.agents/skills/patina-marketing/SKILL.md`.

## One-time setup

1. **Model gateway** (the Sol seat): `node ~/.claude/model-gateway/model-gateway.js setup`, then
   log in. `tools/sol.mjs` posts to `$GATEWAY_URL` (default `http://127.0.0.1:18764/v1/messages`).
2. **Playwright chromium** (renders): `npx playwright install chromium`. In a fresh worktree,
   install the package first: `pnpm install --filter @patina/marketing --offline`.
3. **mflux** (local FLUX placeholders for jobs Kody has not filled): install the
   `mflux` Python package so `mflux-generate` is on `PATH` (for example `uv tool install mflux`).
4. **ffmpeg** (video): `brew install ffmpeg`.
5. **HyperFrames CLI** (video): `npm install -g hyperframes@0.8.142`. `render.mjs` calls
   `npx --no-install hyperframes render`; without the CLI or ffmpeg, video renders are recorded
   `skipped` and show up that way in the compose result and on the board.
6. **Midjourney style reference**: put Kody's `--sref` code on the `SREF:` line of
   `canon/art-direction.md` (it reads `SREF: {{SREF}}` until then; `mj-pack` warns).
7. **Logo files**: when the Patina mark exists as a file, save it as `canon/wordmark.svg`.
   `compose.mjs` inlines it; until then the templates set "Patina" in type.

Check it: `node marketing/tools/preflight.mjs` (add `--json` for machine output). Required:
gateway reachable, chromium launchable. Optional (warn): mflux, ffmpeg, HyperFrames, ≥ 20 GiB free.

## Running a batch

From a Claude Code session in the repo, ask to "run the press" with a brief (the
`patina-marketing` skill takes it from there):

1. Copy `briefs/_template.md` to `briefs/<YYYY-MM>-<slug>.md` and fill it.
2. Preflight.
3. Workflow `marketing-draft` with `{brief: "marketing/briefs/<file>.md"}` → content test,
   plan, rival drafts, judged finals, cold read, Midjourney prompt pack. Returns
   `awaiting-midjourney` with `promptsPath`, or `refused` / `blocked` with a reason.
4. Kody pastes each block of `mj/prompts.md` into Midjourney by hand and drops the results in
   `mj/inbox/<J>/`.
5. Workflow `marketing-compose` with `{run: "<runDir>"}` → ingest, picks, compose, render,
   review, one fix pass, board. Returns `ready-for-review` with the board path.
6. The main session publishes `board.html` as a **private** Artifact for review.
7. "approve P01, P03" copies `out/<P>/` to `approved/<P>/` (PNGs compressed with `sips -Z`).
   "revise P02: …" reruns `marketing-compose` with `{run, pieces: ["P02"], feedback}`, which
   rewrites only those pieces' copy and re-composes and re-renders only them.

## Folder layout

```
marketing/
  canon/       voice, claims, art direction, channels.json, lexicon.json (lint source)
  briefs/      one brief per run; _template.md
  prompts/     Sol seat templates: sol-draft, sol-cold-read, sol-render-review
  templates/   social, pin, poster, one-pager, email (HTML); deck/; video/{9x16,16x9}
  tools/       CLIs (below) + lib/run.mjs + test/
  runs/<YYYY-MM-DD>-<slug>/
    brief.md  plan.json  ledger.json  board.html
    copy/      <P>.opus.md  <P>.sol-prompt.md  <P>.sol.md  <P>.final.md
    critique/  lint-<P>.json  lint-<P>.<seat>.json  cold-read.sol.md  cold-read.resolution.md
               review.md  review.sol.md  picks.md  fix-notes.md
    mj/        prompts.md  jobs.json  inbox/<J>/ (Kody's files)  assets.json  picks.json
    flux/<J>/  local placeholders
    compose/<P>/  out/<P>/  approved/<P>/
```

Git ignores `mj/inbox/`, `flux/` and every `.mp4` under `compose/` and `out/`.

Tools (`node marketing/tools/<x>.mjs`): `preflight`, `plan-check <run>`, `sol`, `voice-lint`,
`mj-pack`, `ingest`, `flux`, `compose`, `render`, `board`. Each prints its usage when run without
arguments.

## Model seats

| Seat | Model | Does |
|---|---|---|
| Direction, judge, review | Fable | content test, concept, plan; choose or merge rival drafts; final review of renders; targeted revisions |
| Lead | Opus | lead drafts, cold-read resolution, art direction and prompt pack, image picks, deck and HyperFrames video |
| Rival voice | GPT Sol via `tools/sol.mjs` | an independent draft per piece, the cold read, a render review. Run by a Haiku agent through Bash, because Workflow `agent()` cannot take gateway model ids |
| Production | Haiku, Sonnet | setup, tool runs, ingest, render, board (Haiku); the one fix pass (Sonnet) |

A Sol failure never blocks a batch: the piece is marked `sol: unavailable`, the ledger records
it, and the judge works from the Opus draft alone.

## Cost notes

- The Fable and Opus seats are most of the spend; they scale with piece count (per piece: one
  Opus draft and one Fable judge; per batch: one direction, one cold-read resolution, one art
  direction, one review). Keep a batch to the pieces the brief needs.
- Sol calls go through the local gateway on the ChatGPT plan, not Anthropic billing. `ledger.json`
  records each call's usage; the board summarizes it.
- Midjourney runs on Kody's subscription by hand. FLUX placeholders and Playwright renders run
  locally at no API cost.
- A revise run only spends on the named pieces.

## Tests

`node --test 'marketing/tools/test/*.test.mjs'` (quote the glob; the bare directory form fails on
Node 24). Tests need no network, gateway, mflux, ffmpeg or Midjourney: they stub HTTP via
`GATEWAY_URL` and shim binaries on `PATH`. `workflow.test.mjs` loads both Workflow scripts with
stubbed Workflow globals and scripted agent replies.
