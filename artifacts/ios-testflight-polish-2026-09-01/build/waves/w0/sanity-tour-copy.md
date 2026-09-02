# First Flight · W0 · L0.4 — the first-launch tour bodies (staged for Kody)

Lane: **L0.4 — Help & tour content**. Sanity project `kv3qrinl`, dataset `production`.
Written 2026-09-02. **Nothing in this file was executed against Sanity.** Every read below is a
GROQ query; every write is a step in `sanity-publish-steps.md` for Kody to run.

Closes (content half): `A4-01`, `C5-01`. Under **D1** the tour is the one hoisted onto the
four-tab bar, so every sentence is checked against the bar root — Today · Spaces · Pieces · Studio —
not the flag-off root.

---

## 1. The three documents — exact ids, read from production

Queried with `mcp__claude_ai_Sanity__query_documents` (perspective `raw`) and
`mcp__claude_ai_Sanity__get_document`, project `kv3qrinl`, dataset `production`, 2026-09-02.

| Step | `surfaceKey` | **`_id`** | `_rev` | `_updatedAt` |
|---|---|---|---|---|
| 1 | `ios-app/first-launch-tour/step-1-home` | **`cb2047b7-8ea6-4b6b-9f4d-12e2e66b9c54`** | `H0TXRhQg7UgtzK6p9t3CG8` | `2026-07-28T19:44:27Z` |
| 2 | `ios-app/first-launch-tour/step-2-saved` | **`afb0ff70-4aa0-4d2d-ae11-e16a769160f1`** | `H0TXRhQg7UgtzK6p9t3CG8` | `2026-07-28T19:44:27Z` |
| 3 | `ios-app/first-launch-tour/step-3-profile` | **`6581a570-0c16-487d-b50a-b3950b5f6f71`** | `H0TXRhQg7UgtzK6p9t3CG8` | `2026-07-28T19:44:27Z` |

All three: `_type: "helpContent"`, `contentType: "coachmark"`, `persona: "all"`.
There is **no `drafts.*` copy of any of them** — `count(*[_id in path("drafts.**")])` returns `0`
for the whole dataset (anonymous read, 2026-09-02).

> **PROGRAM.md §3 · L0.4 step 2 names the keys as `…/step-1`, `…/step-2`, `…/step-3`.**
> The real keys carry the historical suffixes above (`-home`, `-saved`, `-profile`). They are the
> strings in `SurfaceKeys.swift:145-151` and are pinned by `FirstLaunchTourTests` — **do not rename
> them**, renaming orphans all three documents.

### The shape that actually renders

Each document carries **two** payload objects holding the same sentence:

```
coachmarkContent = { heading, body }     ← the one the app reads
tooltipContent   = { eyebrow, body }     ← a stale mirror; nothing reads it for these keys
```

`HelpContent.init(from:)` (`Models/HelpContent.swift:272-276`) decodes `coachmarkContent` first and
only falls back to `tooltipContent` when `coachmarkContent` is absent. The tour fetches
`contentType: "coachmark"`, `persona: .consumer` (`FirstLaunchTour.swift:894-899`), and renders
`loaded?.body ?? step.fallback?.body` (`:884-886`) — **Sanity wins over the binary.**

`tooltipContent` on these three is unreachable today: a tooltip fetch sends `contentType == "tooltip"`,
which these documents are not.

> **It is also uneditable from the Studio desk.** `studios/help-system/schemas/helpContent.ts:80-83`
> hides the whole `tooltipContent` object unless `contentType` is `tooltip`, `fieldHelper` or
> `learnMore` — a coachmark document never shows the field. So the Studio route (§3 of
> `sanity-publish-steps.md`) changes `coachmarkContent` **only**, and that is sufficient: it is the
> object the app reads. Clearing the stale mirror is an **optional** extra that only the API route can
> perform; it is listed there as step 4b and it is not a gate.

### Field caps the new copy must clear

From the same schema file: `coachmarkContent.heading` ≤ 60 (warning), `coachmarkContent.body` ≤ 120
(warning), `tooltipContent.body` ≤ 160 (**hard error — `Rule.required().max(160)` with no
`.warning()`**). Measured lengths of everything proposed below: headings 17 / 14 / 11; bodies
69 / 75 / 53; the `match-pill` tooltip body 141. All clear.

---

## 2. Current bodies (verbatim from production)

**Step 1** — `cb2047b7-8ea6-4b6b-9f4d-12e2e66b9c54`

```
coachmarkContent.heading : Welcome to Patina
coachmarkContent.body    : This is your Daily Room — picks and stories chosen for your space.
tooltipContent.eyebrow   : Welcome to Patina
tooltipContent.body      : This is your Daily Room — picks and stories chosen for your space.
```

**Step 2** — `afb0ff70-4aa0-4d2d-ae11-e16a769160f1`

```
coachmarkContent.heading : Save what you love
coachmarkContent.body    : Add pieces to a room with + Add — they follow you everywhere.
tooltipContent.eyebrow   : Save what you love
tooltipContent.body      : Add pieces to a room with + Add — they follow you everywhere.
```

**Step 3** — `6581a570-0c16-487d-b50a-b3950b5f6f71`

```
coachmarkContent.heading : Your profile
coachmarkContent.body    : Rooms, saved pieces, and settings live here.
tooltipContent.eyebrow   : Your profile
tooltipContent.body      : Rooms, saved pieces, and settings live here.
```

**What is wrong with each, on the bar root D1 ships:**

- Step 1 names the **Daily Room**. That name was retired by the Daily Return's B-7(c); the word on
  the screen and on the first tab is **Today**.
- Step 2 names **`+ Add`**, a capsule on `DailyProductCard` that the Daily Return's W2 removed. The
  anchor moved to the record (`FirstLaunchTour.swift:283`, `.todayRecord`), so the sentence
  describes neither the anchor nor any control in the build.
- Step 3 names **"Your profile"**. On the bar root this step's anchor is the **Studio tab**
  (`PatinaTabBar.swift:112-114` attaches `.profileMonogram` to `tab == .studio`), and `A-60` depends
  on the word *Studio*.

---

## 3. New bodies — publish these

The three new bodies are **byte-for-byte the shipped binary fallbacks**
(`FirstLaunchTour.swift:274-299`, pinned by `PatinaTests/FirstLaunchTourTests.swift:664-669`) and are
identical to the copy reviewed at
`artifacts/ios-daily-return-2026-08-26/waves/w3/n3-sanity-copy.md`.

**Parity is the point, not a coincidence.** Sanity overrides the binary. The only state in which
that override is harmless is the one where the two strings are equal — otherwise the tests stay green
on text no tester ever sees, which is the exact defect `C5-01` records. Any future change to these
sentences is a binary change first (L1-E's copy deck) and a Sanity change second.

### Step 1 — `cb2047b7-8ea6-4b6b-9f4d-12e2e66b9c54` (`ios-app/first-launch-tour/step-1-home`)

| field | new value |
|---|---|
| `coachmarkContent.heading` | `Welcome to Patina` *(unchanged)* |
| `coachmarkContent.body` | `This is Today — what moved in your house, and what is waiting on you.` |
| `tooltipContent.eyebrow` | `Welcome to Patina` *(unchanged)* — optional, API route only |
| `tooltipContent.body` | `This is Today — what moved in your house, and what is waiting on you.` — optional, API route only |

Anchor: the greeting header (`DailyGreetingHeader.swift:85`, `.homeGreeting`). True on the bar root —
Today is the first tab (`PatinaTab.swift:27`).

### Step 2 — `afb0ff70-4aa0-4d2d-ae11-e16a769160f1` (`ios-app/first-launch-tour/step-2-saved`)

| field | new value |
|---|---|
| `coachmarkContent.heading` | `What needs you` |
| `coachmarkContent.body` | `Anything waiting on you lands here, dated. Tap a line to go straight to it.` |
| `tooltipContent.eyebrow` | `What needs you` — optional, API route only |
| `tooltipContent.body` | `Anything waiting on you lands here, dated. Tap a line to go straight to it.` — optional, API route only |

Anchor: the record on Today (`DailyRoomView.swift:285`, `.todayRecord`). The key still reads
`step-2-saved` — a historical name, kept because renaming orphans the document.

### Step 3 — `6581a570-0c16-487d-b50a-b3950b5f6f71` (`ios-app/first-launch-tour/step-3-profile`)

| field | new value |
|---|---|
| `coachmarkContent.heading` | `Your Studio` |
| `coachmarkContent.body` | `Your studio — projects, proposals, invoices and files` |
| `tooltipContent.eyebrow` | `Your Studio` — optional, API route only |
| `tooltipContent.body` | `Your studio — projects, proposals, invoices and files` — optional, API route only |

Anchor: on the bar root, the **Studio tab** (`PatinaTabBar.swift:112-114`); on the flag-off root, the
Studio pill in the header (`DailyGreetingHeader.swift:135`). The body carries no terminal full stop —
that is how it is pinned in the binary, and parity beats punctuation.

---

## 4. A fourth document that also renders a lie — `L04-N1` (new; not in `findings.json`)

Not one of the three tour rows, found while sweeping the lane's own surface. **It is a tester-visible
production string and it is on the piece-detail screen, which every round-one tester opens.**

| | |
|---|---|
| id | **`50c728fe-68d2-4403-be5d-b42be3bcd651`** |
| surfaceKey | `ios-app/home/match-pill` |
| contentType | `tooltip` · persona `all` · `_rev` `8wKiQzKRXIkGb61329gDKa` |
| current `tooltipContent.body` | `PLACEHOLDER pending Leah review — explain match pill.` |
| rendered by | `ProductDetailView.swift:409-411` — a `HelpTooltip` wrapped around the match label next to the price |

Live probe (read-only, exactly the request the app builds — `SanityHelpClient.buildQueryURL`):

```
curl -sS -G 'https://kv3qrinl.api.sanity.io/v2024-01-01/data/query/production' \
  --data-urlencode 'query=*[_type == "helpContent" && surfaceKey == $sk && contentType == $ct && persona == $p][0]' \
  --data-urlencode '$sk="ios-app/home/match-pill"' \
  --data-urlencode '$ct="tooltip"' --data-urlencode '$p="all"'
→ HTTP 200
  "tooltipContent": { "body": "PLACEHOLDER pending Leah review — explain match pill." }
```

The call site passes a good inline fallback, and Sanity overrides it:

```swift
// ProductDetailView.swift:409-412
HelpTooltip(
    surfaceKey: SurfaceKeys.IOSApp.Home.matchPill,
    fallback: "Match score blends your room's dimensions, style cues, and palette against this piece. Higher means a better fit for the room you're viewing."
)
```

**Fix (same discipline as the tour): make Sanity say what the binary says.**

| field | new value |
|---|---|
| `tooltipContent.body` | `Match score blends your room's dimensions, style cues, and palette against this piece. Higher means a better fit for the room you're viewing.` |

### The other twelve placeholder documents — recorded, not touched

All 13 non-coachmark `ios-app/*` documents in production carry
`PLACEHOLDER pending Leah review — explain <thing>.` Eleven of them are `contentType: "fieldHelper"`,
and **`HelpTooltip` queries `contentType == "tooltip"`** (`HelpTooltip.swift:188-191`) — the content
type is a fixed query parameter and never falls back, so a `fieldHelper` document can never satisfy a
tooltip fetch. Those eleven are invisible in build 1.

The only other `tooltip`-typed one is `ios-app/home/tier-pill`
(`96fe7cf3-f911-4c6e-a879-5fe4d7f26623`), and **no call site mounts `SurfaceKeys.IOSApp.Home.tierPill`**
(`grep -rn 'tierPill' Patina/` matches only `SurfaceKeys.swift`). Dormant today.

Recommendation: **unpublish `96fe7cf3-…` in round one** (step 5 of `sanity-publish-steps.md`) so no
route can ever surface the placeholder, and open one W2 row to author real tier-pill copy when a
tier-pill tooltip is mounted. Leave the eleven `fieldHelper` documents alone — rewriting twelve
strings nobody can reach is exactly the time-pressure authoring D2's fallback logic tells us to
refuse.

---

## 5. Brand-voice check (`.claude/skills/patina-brand-voice/SKILL.md`)

Run over the four new bodies and the three headings.

| Rule | Verdict |
|---|---|
| *Technology is the silent enabler — never lead with AI, algorithm, engine mechanics, ML, "powered by"* | **Pass.** No sentence names a mechanism. `match-pill` says what the number *means to the reader* ("a better fit for the room you're viewing"); the three input words — dimensions, style cues, palette — are the room's properties, not the machinery, and the sentence leads with the outcome. |
| *Confident yet unpretentious* | **Pass.** "what moved in your house, and what is waiting on you" states a fact and makes no promise. |
| *Sensory & tangible* | **Partial, and correctly so.** A coachmark is wayfinding, not product prose; the tangible words here are the nouns the reader is about to tap — house, projects, proposals, invoices, files. |
| *Plain-spoken Midwest, zero luxury haze* | **Pass.** Shortest possible sentences, no adjectives of prestige. |
| *Designers are the intelligence layer — no labor/gig framing* | **Pass.** No designer is described. |
| *Lexicon — avoid `curated`, `elevated`, `bespoke`, `journey`, `disrupt`, `luxury`, marketplace-speak* | **Pass.** None present. Note the retired step-1 body did carry marketplace-speak — *"picks and stories **chosen** for your space"* — and it goes away with this publish. |
| *Never print a vendor or server error string to a homeowner* | **Pass.** No error strings here; the Help-sheet half of that rule is `R-10`, routed to L1-B. |
| *Numbers must be true and sourced* | **N/A** — no numbers. |

One deliberate voice call: step 3's body has **no terminal full stop** and repeats the word *studio*
in heading and body. Both are how the binary ships it and how `FirstLaunchTourTests:669` pins it.
Parity outranks polish; changing it means changing the binary first.

---

## 6. AI-word sweep on the new bodies

The repo-side compiled-string sweep is clean (PROGRAM.md assignment note 9). This copy lives **outside
the repo**, so it is swept separately here. Script `sweep.py`, run 2026-09-02; standalone-token regex
`(?<![A-Za-z])AI(?![A-Za-z])` (so `waiting` and `Patina` do not false-hit) plus case-insensitive
substrings for the banned phrases, the brand-voice avoid-list, and the three retired product strings.

```
--- CURRENT production bodies ---
step-1-home  heading   CLEAN
step-1-home  body      HIT: daily room
step-2-saved heading   CLEAN
step-2-saved body      HIT: + add
step-3-prof  heading   HIT: your profile
step-3-prof  body      CLEAN
match-pill   body      HIT: placeholder
strings with hits: 4/7

--- PROPOSED new bodies ---
step-1-home  heading   CLEAN
step-1-home  body      CLEAN
step-2-saved heading   CLEAN
step-2-saved body      CLEAN
step-3-prof  heading   CLEAN
step-3-prof  body      CLEAN
match-pill   body      CLEAN
strings with hits: 0/7
```

Terms swept: `AI` (standalone token), `a.i.`, `artificial intelligence`, `machine learning`,
`journey`, `curated`, `curation`, `elevated`, `bespoke`, `disrupt`, `revolutioni*`, `powered by`,
`algorithm`, `luxury`, `gig `, `placeholder`, `daily room`, `+ add`, `your profile`.

**Result: zero hits on all seven proposed strings.** The sweep must be re-run against *published*
production content after Kody's edit — that re-run is step 6 of `sanity-publish-steps.md`, and it is
the thing that closes this half of the lane, not this file.

---

## 7. The one thing this copy does not do — for Kody's call

Under **D1** the first launch shows a four-tab bar: **Today · Spaces · Pieces · Studio**. The tour
names **two** of the four. Step 1 names Today; step 3 names Studio; **Spaces and Pieces are never
introduced**, and no fourth step exists.

Nothing here is *false* on the bar root — every sentence describes an anchor the bar root mounts, and
`FirstLaunchTour.swift:266-271` records that both roots mount all three anchors. The gap is coverage,
not truth, so it is **not** a reason to hold the publish.

If Kody wants the tour to hand the tester the whole map, the smallest honest version is a **step-3
body change**, and it must land in the binary and Sanity **together** — Sanity alone re-creates the
drift this lane exists to close, and the binary alone is overridden. Proposed text, not staged:

```
Your studio — projects, proposals, invoices and files. Spaces holds your rooms; Pieces is what to look at next.
```

Sweep on that variant: CLEAN (same script, same term list). It would need
`FirstLaunchTour.swift:296` and `FirstLaunchTourTests.swift:669` changed in the same commit — an
integration note to **W1 · L1-C** (`Features/Help/**` is its glob). **Not written as a note**, because
the lane brief does not ask for a copy change and an unruled note is not a plan. Say the word and it
is two lines.
