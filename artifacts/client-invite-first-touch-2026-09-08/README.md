# The First Letter — a studio-written client invite (design proposal, 8 September 2026)

**Standing.** Nothing here is built. Proposal for Kody and Leah's studio to comment and rule. Today the homeowner's first-ever contact with Patina is a generic Supabase Auth email — subject "You're invited to Patina" — that names no studio, no designer, no project, and carries no note. This folder holds the UX panel's design for a studio-written invite: the designer's composer, the letter the homeowner receives, and the first arrival, presented as a single scrolling proposal document with numbered rulings.

Artifact: https://claude.ai/code/artifact/b80a403f-56a7-421f-baa7-b74f973490ad (private; comment on the line it concerns)

## Folder map

| Path | What it holds |
|---|---|
| `research/01-invite-flow.md` | Current state: live GoTrue path, dormant `client-invite` path, the three designer entry points, data model, resend/expiry, where the homeowner lands |
| `research/02-email-system.md` | Branded email shell, studio identity resolver, the `sendCompliantEmail` chokepoint, composers and preview primitives, templating tokens, dev tooling, PostHog flag conventions |
| `research/03-rulings-and-voice.md` | Vision, PP-1/PP-9, R7, vocabulary blacklist, brand voice, Arrival Arc and other precedents, deck conventions and visual tokens |
| `panel/lens-1…6.md` | One file per UX lens: homeowner first touch · designer's moment (composer) · email craft & envelope · brand voice & copy · continuity & arrival · systems (engineer) |
| `panel/synthesis.md` | Fable's synthesis: the single recommended design and the rulings list |
| `specimens/email-letter.html` | The invite email as rendered (light/dark, images-off text block) |
| `specimens/composer-sheet.html` | The add-person sheet with the note field |
| `specimens/arrival.html` | Landing / first-visit Threshold carrying the note |
| `proposal.html` | **The deliverable** — scrolling proposal document (house Idiom A). Twelve numbered sections plus an appendix; the three specimens are embedded unchanged inside `figure.mock` wrappers |
| `source/proposal.md` | Prose spine — section headings and paragraphs, no markup |
| `source/check-prose.mjs` | Word-budget gate (`data-prose-cap` per top-level `<section>`, `data-prose-total` on `<body>`). Run `node source/check-prose.mjs` from this folder |
| `review/adversarial-review.md` | Separate-context review of proposal + specimens |
| `review/render-check/proposal-{light,dark}-{1440,390}.png` | Full-page renders, light and dark, at 1440 and 390 |

review/render-check/ PNGs are kept locally, not committed (full-page renders, several MB).

## Rules that bind this feature

- R7: the studio signs client mail (given name, studio, city). "Patina does not sign emails to homeowners."
- PP-1 / PP-9 (`artifacts/portal-polish-review-2026-09-08/rulings.md`): client surfaces — letterhead law, colophon "Prepared by {Studio} · Sent through Patina", **no Patina wordmark above the colophon**, never a placeholder identity, copy in the studio's voice. PP-6: amendments (V9) owed, not landed. Whether the email shell counts as a "client surface" under PP-1 is **unruled** — surface as a ruling.
- Vocabulary blacklist for homeowner copy: never "gate", "task", "dashboard", "AI", "overdue"; no urgency, no guilt, no apology, no social proof, no badges/pills/green fills/spinners/✓ glyphs.
- Brand voice (`.claude/skills/patina-brand-voice/SKILL.md`): plain-spoken Midwest, sensory, outcomes first, ≤150-word outreach, no "curated/luxury/elevated/bespoke/AI-powered". Do NOT import the skill's Pledge or tagline lines (VISION V5/V6 keep those open).
- Vision: homeowner is the studio's client; Patina does not sell to her (S2); V8 the client page is The Document's client-facing face; "you're engaged every day, and you and your designer are looking at the same agreed direction."
- Deck visual contract: `artifacts/portal-polish-review-2026-09-08/specimens/SPEC.md` §A tokens, pasted verbatim, no hex literals outside the token block; Playfair Display / Inter (or Newsreader) / DM Mono; no shadows, no pills, `color-scheme: light dark` with `[data-theme]` twins. `proposal.html` loads a second Google Fonts link (Fraunces / Hanken Grotesk / IBM Plex Mono) because the email specimen ships its own `--e-*` type stack — the one permitted exception, declared inside `.spec-letter`.
