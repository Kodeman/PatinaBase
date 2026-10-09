# Patina voice — the canon for The Press

This is the long form of the `patina-brand-voice` skill, for the agents that write marketing pieces
in `marketing/runs/`. `docs/vision/VISION.md` wins every conflict. If this page disagrees with
VISION, VISION is right; flag the line, don't write around it.

The lint (`marketing/tools/voice-lint.mjs`) reads its word lists from `marketing/canon/lexicon.json`.
The lexicon below mirrors that list so prose and machine rules agree. If you change one, change both.

## 1. Who we are talking to

**A growing design studio at the moment it adds its first hands while its workload doubles.**
Leah's studio first, then studios like hers, Madison and Milwaukee outward.

That is a moment, not a demographic. The owner is delegating for the first time. Her hours are
already spoken for twice. The one thing she cannot afford is a new system to learn. Write to her.

- **Homeowners are the studio's clients.** Never address a homeowner as Patina's customer. When a
  homeowner appears in copy, she is the studio's client, seen through the studio's work.
- **Makers are the studio's vendors.** Patina qualifies them and carries the order. Copy may honor
  a maker's craft; it never sells Patina to a maker or sells a maker to a homeowner directly.
- **No consumer push.** No "shop now", no homeowner sign-up, no funnel copy.

## 2. The promise

- **To the studio: you won't notice Patina.** It is not a place you go. It prompts and collects
  when and where you need it, then gets out of the way. We never sell engagement, streaks,
  dashboards or "time in app". A quiet desk is the point.
- **To the homeowner, through the studio: one agreed direction.** She and her designer look at the
  same page every day. Fewer surprises. The decision record is the relationship.
- Outcomes first: less re-entry, one page per client, a new hire who can pick up the job.
  Never lead with how it works inside.

## 3. What we call things

- **Designer-Taught Intelligence.** Never "AI", never "machine learning", never "algorithm", never
  "powered by". It is a real designer's eye, starting with Leah's. It is the long-term thesis, not
  the headline: in most pieces you won't name it at all. Say what the studio gets.
- **The Document**: one living document per client, from brief to install.
- **The desk**: where the work that needs her hand lands.
- **Patina-grade**: a maker a designer would stake her name on.
- **Studio**, not "firm", "agency" or "team account". **Designer**, not "user".

## 4. Held and legal-gated (never in public copy)

- **The Pledge.** Pledge language is legal-gated (VISION §3). No teaching royalties, no "a share of
  our commission goes back to designers", no "when Patina earns, you earn". Not hinted, not softened.
- **"Where Time Adds Value"** is HELD pending VISION V5. Lint fails it. No other tagline either.
- **Prices, take rates, fees and percentages** wait on V1/V2. Every money number in
  `claims.md` is `todo`. Write "pricing is on one page" only once that page exists.
- **"Your data exports" and "no lock-in"** are promises, not yet facts. Don't claim them as true.
- **Bylines.** "Middle West Studio" and first names. No "co-founder" titles (V4).
- **Time saved.** Nothing has been timed. No "save 10 hours a week", projected or measured.
- **Vendor statistics** ("36% of a designer's time is admin", "6 tools, 6 logins") never ran true.

## 5. Place: Midwest only

Every example, room, maker, client and city is Midwestern: Madison, Milwaukee, Door County, the
Driftless, Minneapolis, Chicago's North Shore, Ann Arbor, Iowa City, Galena. No coastal signifiers:
no NYC, New York, Manhattan, Brooklyn, Hamptons, LA, Los Angeles, San Francisco, Miami, penthouse.

## 6. How it sounds

1. **Specific.** A named room, a named material, a real moment in the job. "The walnut for the
   Shorewood dining room is a week late" beats "manage your projects".
2. **Sensory.** Words you can touch: linen, leather, white oak, cedar, grain, hand-rubbed oil,
   kiln-dried, the first frost on a studio window.
3. **Plain-spoken.** Short sentences. Midwest honest. Confident, never arrogant. Understatement
   over exclamation.
4. **Warm, not chummy.** A colleague who has run a job, not a brand that wants a hug.
5. **One idea per piece.** If a piece says two things, cut one.

## 7. Lexicon

**Prefer:** studio, the job, the house, the client, one page, the Document, the desk, hand it off,
first hire, the brief, the install, workshop, maker, Patina-grade, provenance, grain, heirloom,
hand-built, honest materials, trade, Designer-Taught Intelligence.

**Avoid — lint ERROR (the piece fails):**
- `AI` as a word, "AI-powered", "artificial intelligence", "machine learning", "powered by",
  "algorithm"
- "pledge", "Where Time Adds Value"
- disrupt*, revolutioni*, curated, luxury, gig, game-chang*, seamless, unlock
- non-Midwest places: NYC, New York, Manhattan, Brooklyn, Hamptons, LA, Los Angeles,
  San Francisco, Miami, penthouse
- any `%`, `$` amount, or number of two or more digits (years 1900–2099 excepted) without a
  `[Cnn]` claim marker in the same sentence
- a `[Cnn]` marker that is not a `verified` row in `claims.md`
- social or pin with more than 4 hashtags; PR pitch body over 150 words; email subject over 60
  characters

**Avoid — lint WARN (fix unless you can defend it):** "elevated", "bespoke" (only when literally
custom), emoji, more than one exclamation mark in a piece.

**Avoid by judgment (lint can't see these):** "platform", "solution", "empower", "leverage",
"all-in-one", "next-level", "our designers" (as labor), "unlimited revisions", "dashboard",
"productivity", marketplace-speak, flattery filler.

## 8. Numbers and claims

Every number, percentage or dollar figure in copy carries a claim marker in the same sentence:
`[C03]`. The marker points at a row in `marketing/canon/claims.md`. Only `verified` rows pass lint.
Compose strips the markers before anything is rendered. If the claim you need is `todo` or missing,
rewrite the line without the number. Never invent a number, a quote, a client or a maker.
Third-party quotes keep their attribution in the piece.

Generated images are illustrations. Never caption one as a real project, a real client's home or
a real maker's piece.

## 9. Craft rules per kind

The frontmatter fields for each kind are fixed by the story contract; they are listed here so the
copy agent writes to them.

**Social** (`headline`, `caption`, `hashtags`, `alt`). Lead with something you can see or touch.
One idea. Headline ≤ 8 words. Caption 40–90 words, the studio moment in the first line, no
link-in-bio begging. Hashtags 0–4, specific (`#madisoninteriors`), never generic walls. Alt text
describes the image plainly for a screen reader, not the message.

**Pin** (`headline`, `caption`, `hashtags`, `alt`). Same as social, tighter: headline ≤ 6 words,
caption ≤ 50 words, one sensory lead, a reason to save it. ≤ 4 hashtags.

**Email** (`subject`, `preheader`, markdown body). Write a letter, not a newsletter. Subject
≤ 60 characters, plain, no clickbait, no emoji. Preheader finishes the subject's thought. Body
120–220 words, readable with images off, exactly one ask. Signed by a person (Kody or Leah), never
"The Patina Team". End with a reply invitation: "Reply here; it comes straight to me."

**One-pager** (`title`, `sections`, `cta`). Three or four sections, each a heading and ≤ 70 words.
The first section names the studio moment; the last answers "what does it ask of me?". One CTA.
No feature grid, no comparison table against competitors.

**Deck** (`title`, `slides`). One sentence per slide headline that could stand alone. Body ≤ 40
words per slide. Ten slides or fewer for outreach. Evidence before claims; a sourced number or none.
No progress bars, scores or big lone numbers.

**PR pitch** (`subject`, markdown body). The outreach rule applies: **≤ 150 words, a specific
observation about the recipient's own work first, one ask.** The observation must be checkable
(a story they ran, a room they shot). No flattery filler, no attachments promised, no "exclusive".
One ask: a call, a visit to a studio mid-job, or a reply.

**Poster** (`headline`, `subhead`, `body`, `visual`). Readable from six feet: headline ≤ 6 words,
subhead ≤ 14 words, body ≤ 35 words. One image (the `visual` job id), one idea. No QR-code-first
design; the words carry it.

**Video script** (`title`, `scenes`). Each scene has seconds, one visual job id, on-screen text
(≤ 7 words) and VO. 9:16 runs ≤ 30 s, 16:9 ≤ 60 s. Open on hands, material or a room mid-job in
the first two seconds, not a logo. VO is spoken: read it aloud; one breath per line. The Patina
mark appears once, at the end. No music cues that promise drama.

**Outreach of any kind** (a note to a studio, an editor, a maker): ≤ 150 words, a specific personal
observation about their work in the first two sentences, one concrete ask, zero flattery filler.

## 10. Good and bad

**The promise**
- Bad: "Patina's AI-powered platform streamlines your entire workflow!"
- Good: "Your new hire opens one page and knows where the Shorewood job stands. You go back to the
  drawings."

**The audience**
- Bad: "Homeowners, shop Midwest heirlooms curated just for you."
- Good: "Your client sees the same page you do: one direction, agreed, every morning."

**Numbers**
- Bad: "Studios save 12 hours a week with Patina."
- Good: "The quote, the revision and the client's yes live on one page, so nobody asks twice."

**Place and texture**
- Bad: "Bring Manhattan penthouse luxury to your next project."
- Good: "White oak, hand-rubbed oil, and a dining room in Shorewood Hills that will look better in
  twenty years."

**Outreach opening**
- Bad: "Hi! I love your amazing work and think you'd be a great fit for our revolutionary tool."
- Good: "Your Spring Green farmhouse kitchen kept the original fir floors and let the plaster show.
  I'd like twenty minutes to show you one page we built for studios at exactly your size."

(The "twenty years" and "twenty minutes" above are spelled out; written as digits they would need
a claim marker. Prefer words for small, non-factual counts.)

## 11. Older copy

`docs/marketing/founding-onboarding/copy-deck.md` is a good rhythm reference: letters, one ask,
signed by a person. It predates VISION: its T0 email states the Pledge and signs off with the held
tagline. Borrow its cadence, never those lines.
