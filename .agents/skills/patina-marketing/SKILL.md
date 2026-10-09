---
name: patina-marketing
description: Use when asked for Patina marketing material — social posts, pins, a campaign, a poster, a promo video, a one-pager, a deck, a launch email, a press pitch — or told to "run the press". Runs The Press (marketing/) from a brief to a private review board. Not for one-off copy edits (use patina-brand-voice).
---
# The Press — Patina marketing pipeline

The Press turns one brief into a batch of reviewable pieces under `marketing/runs/<date>-<slug>/`
and a single-file review board. Two Workflows do the work, with a human Midjourney step between
them. Details, setup and folder layout: `marketing/README.md`. Canon: `marketing/canon/`.

Invoking this skill is the user's opt-in to run the two Workflows below.

## Hard rules

- Never send or publish anything externally: no email, no social posts, no CMS publish, no
  schedulers. The only thing shared is the board, as a **private** Artifact, after the run.
- Workflow seats keep every tool the session has (Workflow `agent()` takes no tool allowlist), so
  for them "never send" is a prompt rule only. Watch for any send, post or publish tool call in a
  run and stop it; see "Residual risk" in `marketing/README.md`.
- Never automate Midjourney (its terms ban automated access). Kody runs the prompt pack by hand.
- `docs/vision/VISION.md` wins every conflict. Never "AI", no Pledge language, the tagline
  "Where Time Adds Value" is held, Midwest only, every number cites a verified claim as `[Cnn]`.

## Procedure

1. **Brief.** Pick a brief in `marketing/briefs/`, or copy `marketing/briefs/_template.md` to
   `marketing/briefs/<YYYY-MM>-<slug>.md` and fill it with Kody. A brief whose reader is not a
   design studio will be refused by the content test; fix the brief, not the test.
2. **Preflight.** `node marketing/tools/preflight.mjs`. A FAIL (gateway or Playwright chromium)
   blocks the run; fix it first. Warnings are fine: without mflux, empty Midjourney jobs get no
   FLUX placeholder; without the HyperFrames CLI and ffmpeg, video renders are recorded `skipped`.
3. **Draft.** Call the Workflow tool with name `marketing-draft` and
   `args: {brief: "marketing/briefs/<file>.md"}` (optional `slug`, `root`).
   - `blocked` → relay the reason (preflight, setup, plan-check, or no piece passed lint) and stop.
   - `refused` → relay the content-test reason to Kody and stop. Do not work around it.
   - `awaiting-midjourney` → every piece is `ok`; go on. Note any piece whose `sol` is
     `unavailable`.
   - `awaiting-midjourney-with-failures` → go on, but tell Kody which pieces are not `ok`
     (`lint-failed`, `draft-failed`, `judge-failed`) and any `sol: unavailable`.
4. **Hand-off.** Show Kody `<runDir>/mj/prompts.md` (each job: the prompt with full params, the
   variant count, the inbox folder `mj/inbox/<J>/` to drop files into). Then **stop** and wait.
5. **Compose.** When Kody says the images are in, call the Workflow tool with name
   `marketing-compose` and `args: {run: "<runDir>"}`. It returns `ready-for-review` (every piece
   `rendered`), `ready-with-failures` (some pieces not `rendered`), or `blocked` (the board
   failed, or no piece rendered cleanly: relay the reason and the piece statuses).
6. **Board.** Publish `<runDir>/board.html` with the Artifact tool (private, never public) and
   give Kody the link. Only `rendered` is final. List every piece whose status is anything else
   (`image-missing`, `render-skipped`, `render-failed`, `compose-failed`, `lint-failed`,
   `revise-failed`) and every PLACEHOLDER (FLUX) or MISSING image badge on the board, since
   those are not final.
7. **Approvals and revisions.**
   - "approve P01, P03" → copy `<runDir>/out/<P>/` to `<runDir>/approved/<P>/` for each, then
     compress PNGs: `sips -Z 2400 <runDir>/approved/<P>/*.png`. Approval files a piece for Kody;
     it does not post or send it.
   - "revise P02: <feedback>" → Workflow `marketing-compose` with
     `args: {run: "<runDir>", pieces: ["P02"], feedback: "<feedback>"}`, then republish the board
     to the same Artifact and give the link again.

## Checks

Tests: `node --test 'marketing/tools/test/*.test.mjs'` (no network, gateway, mflux, ffmpeg or
Midjourney needed). On Node 24 the bare directory form fails; always quote the glob.
