# THE DOCUMENT — Implementation Index

**Drive Claude Code from this one page.** Updated 2026-06-18.
Authority order: **codebase → spec → prototypes → `DECISIONS.md`.**

## Snapshot
- `DECISIONS.md` through **R66** · spec **v1.6** (a **v1.7 fold is owed** for R61–R66) · flipped to default (flag `the-document-pilot`).

## Built & live — verified in the running app (2026-06-18)
Slices 0–6 · **THE FLIP** · Track 1 (in-document parity) · Track 2 (the Orders book) · Track 3 (Library Room · Engine · Accounts book · Composing Page) · Track 4 (Proposal Authoring) · Track 5 (Project Coordination / the ball-in-court) · the Decision Composer (R55–R56) · the People Room (R57–R60). *Action: confirm each track's branch is merged to `main`.*

## TO BUILD — Track 6 (R61–R66) ← the one outstanding round
Package: **`the-document-track6-package.md`** · look/feel: `patina-p0-intake-and-proposal-prototype.html`, `patina-discovery-section-prototype.html`

| Slice | Ruling | What it builds |
|---|---|---|
| 1 — Intake triage | R61 | `useBeginDiscovery`; Accept→Discovery / Nurture (dated touchpoint) / Pass on the Desk folder |
| 2 — Capture + ⌘K | R62 | "＋ Capture a lead" CTA + alias-aware ⌘K "new lead" → `CaptureLeadSheet`, route to `/doc/{leadId}`; people in ⌘K |
| 5 — Discovery | R66 | self-composing section, 5 **structured** essentials, margin = unstructured notes only, essentials→**ready**, **auto-seed** the proposal |
| 3 — Proposal action | R63 | expired/declined instruments (Revise · Preview · Resend) + stage-consistent letterhead; follow-up = Send a note |
| 4 — Runaway timer | R64 | 30-min abandonment bound + auto-pause (extends D10) |

**Chain:** 1 → 2 → 5 → feeds 3 · **Slice 4 parallel.** Build **audit-first** — the repo is ahead of the gap matrix; verify what already exists before writing.

## Handoff packages (all in `docs/design/the-document/`)
- `the-document-track6-package.md` — R61–R66 — **TO BUILD**
- `the-document-track3-package.md` + `-fixes-package.md` — Tracks 1–3 + F1–F4 — built *(verify merged)*
- `the-document-proposal-authoring-package.md` — Track 4 — built
- `the-document-decision-composer-package.md` — R55–R56 — built
- *(People Room R57–R60 built live; no separate package.)*

## The build loop
0. **Commit the design files** (Step 0 below) — the only blocker; Claude Code reads the committed repo.
1. Open **Claude Code in `~/Code/patina-merged`**; paste the package's **kickoff line** (bottom of `the-document-track6-package.md`).
2. Claude Code builds **audit-first**, one slice per PR, logging an **I-entry + screenshots** (`screenshots/track-6/`).
3. **Bring each slice back to the design session** (here) for review (Mode B): bless + numbered fixes → merge to `main`.
4. When Track 6 lands, **cut spec v1.7** (fold R61–R66).

## Step 0 — the commit (run in YOUR terminal — the sandbox can't write `.git`)
```bash
cd ~/Code/patina-merged
rm -f .git/index.lock        # clear the stale lock the sandbox left behind
git add docs/design/the-document/DECISIONS.md \
        docs/design/the-document/patina-discovery-section-prototype.html \
        docs/design/the-document/patina-people-room-prototype.html \
        docs/design/the-document/the-document-track6-package.md \
        docs/design/the-document/the-document-IMPLEMENTATION-INDEX.md
git commit -m "docs(the-document): R66 Discovery + Track 6 package + index + prototypes"
```

## Open threads
Step 0 commit · **spec v1.7 fold** (R61–R66) · **§14.15** Via-Patina rate finals + the Aesthete-fold Accounts rendering · confirm Tracks 3–5 branches merged to `main`.
