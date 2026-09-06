# The Agreement, Composed — 6 September 2026

Kody's brief asked for four things: add and remove parts of the agreement, keep studio templates, work in more shapes, and hold trades under one roof. This program went and found out why—five research lanes across how designers contract, design-build turnkey patterns, e-sign and forms in software, Patina's own codebase, and a simulated designer panel—and turned the answer into one document: fifteen proposals in three waves, sixteen open rulings, and the core model (Agreement = Core + ordered Parts). The document is the deliverable. It exists to earn reactions and a set of rulings, not to authorize a build.

## Nothing was built

No migration was written or applied. No component, route, hook, edge function, or feature flag was created or changed. Nothing was deployed. The only files this program produced are the research notes, the document, and its review artifacts, all inside this folder.

## Folder map

| Path | What it is |
|---|---|
| `research/00-raw/` | Brief and three raw inputs |
| `research/01…05` | Five lanes: how studios contract · design-build turnkey · software e-sign and forms · the codebase today · the simulated panel |
| `source/proposal.md` | The document's spine in Markdown |
| `source/fixtures.json`, `source/check-fixture.mjs` | Recomputes all 65 fixture figures; fails loudly on drift |
| `source/check-prose.mjs` | Word-budget gate |
| `proposal.html` | The document itself — the thing to read |
| `review/` | Adversarial reviews, fix logs, render check |

Full-page render screenshots are not committed; regenerate with review/render-check.mjs.

## The fifteen proposals

| # | Name | Wave | Effort |
|---|---|---|---|
| P0 | Fix the floor | W1 | S–M |
| P1 | Parts on today's agreement | W1 | M |
| P2 | Readiness from composition | W1 | S |
| P3 | Studio agreement defaults | W1 | S–M |
| P4 | The Library | W2 | M |
| P5 | Fee schedules | W2 | M–L |
| P6 | The client's copy from parts | W2 | M |
| P7 | Addenda from parts | W2 | M |
| P8 | Change history on parts | W2 | S |
| P9 | The turnkey class | W3 | L |
| P10 | Licensing attestation | W3 | S |
| P11 | Jurisdiction attachments | W3 | M |
| P12 | Lien waivers per draw | W3 | M |
| P13 | Sign and pay in one step | W3 | M |
| P14 | The subcontract — a studio↔sub Trade Agreement | W3 | L |

## The sixteen rulings

- **R1 · Does R85 bind agreement templates?** — Kody
- **R2 · Template scope** — Kody
- **R3 · Who edits the Library** — Leah
- **R4 · The floor** — Kody
- **R5 · Prose never carries money** — Kody
- **R6 · When parts freeze** — Kody
- **R7 · Names** — Leah
- **R8 · Client copy order and visibility** — Kody
- **R9 · Which fee variants create billing authority in Wave 2** — Kody
- **R10 · Licensing attestation** — Counsel
- **R11 · Jurisdiction notices** — Counsel
- **R12 · What the client can keep** — Kody
- **R13 · What the client sees of subs** — Leah
- **R14 · Permissions inside the room** — Kody
- **R15 · Sign and pay in one step** — Kody
- **R16 · Do subs sign inside Patina?** — Kody + Counsel

Artifact: https://claude.ai/code/artifact/d1d0487b-0e7a-4963-ba49-a6703dfa4651 — "The Agreement, Composed", published 2026-09-06.

## Vision test

- Surface: The Document
- Moment: the studio's first hands drafting an agreement
- Stream: the subscription floor. Procurement parts are where V1's answer will land; construction cost-plus is the studio's margin, not Patina's
- Promise: the studio won't notice Patina
- Where it strains: Wave 3 serves a studio shape not yet on record — Leah's studio holds no subs, so it waits for a real one

## How the team can respond

Comments on the published Artifact reach us directly — leave them on the line they are about. Or take a thirty-minute walk through the Okonkwo fixture in the portal against the composed-agreement mockups, which will get further than reading. Nothing here is built, so nothing here is expensive to change.
