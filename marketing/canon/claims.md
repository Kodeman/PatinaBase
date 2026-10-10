# Claims ledger

Every factual claim a marketing piece may make, with where it comes from.

## The marker rule

- Copy cites a claim inline with its id in square brackets, in the same sentence as the fact:
  `Patina is a venture of Middle West Studio in Madison [C01].`
- Any `%`, `$` amount, or number of two or more digits (years 1900–2099 excepted) needs a marker in
  the same sentence. voice-lint fails the piece otherwise.
- Only rows with status `verified` pass lint. A `todo` row is a placeholder: rewrite the line without
  the fact until the row is promoted.
- Compose strips the markers before rendering. They never reach a reader.
- Third-party quotes keep their attribution in the piece (speaker or publication).

## Status

- `verified`: the source cell names a real in-repo doc path (with section) or a URL, and that source
  states the fact as written.
- `todo`: anything else. Every money, price, fee, take-rate or percentage figure is `todo` until
  VISION V1/V2 rule and a public page states it. A capability claim is `todo` until someone has
  checked it against the product.

## Adding a claim

Append a row with the next free id. Ids are never renumbered or reused; retire a row by changing
its claim to `RETIRED: <reason>` and its status to `todo`. Never invent a number, a quote or a
source. Keep `|` out of cells.

| id | claim | source | status |
|----|-------|--------|--------|
| C01 | Patina is a venture of Middle West Studio in Madison, Wisconsin. | docs/vision/VISION.md §1 | verified |
| C02 | Leah Kochaver leads design, voice and teaching at Patina; Kody leads build, infrastructure and operations. | docs/vision/VISION.md §1 | verified |
| C03 | Patina is built for the year a studio brings on its first designer or assistant and its workload doubles. | docs/vision/recruiting-one-liners.md §To a designer ("Why now") | verified |
| C04 | Patina is one living document per client, from brief to install. | docs/vision/recruiting-one-liners.md §To a designer ("The line"); docs/vision/VISION.md §5.1 | verified |
| C05 | The studio's client sees the same page the designer does: one agreed direction. | docs/vision/recruiting-one-liners.md §To a designer ("Why now"); docs/vision/VISION.md §4 | verified |
| C06 | The Document has no dashboards, no task manager and no tab bars. | docs/vision/VISION.md §5.1 | verified |
| C07 | Patina-grade means makers qualified by a designer's standard: heritage, material and the way a piece ages. | docs/vision/recruiting-one-liners.md §To a maker ("Why you") | verified |
| C08 | Patina starts with studios in Madison and Milwaukee and grows outward through Leah's network. | docs/vision/VISION.md §2 | verified |
| C09 | "If your process only exists in your head, it's not really a process — it's a habit." (IDCO Studio) | https://www.idco.studio/post/the-exact-interior-design-process-outline-successful-studios-use (captured in artifacts/studio-hook-2026-09-22/research/07-studio-ethnography.md §4 #1) | verified |
| C10 | "You can't duplicate yourself. But you can duplicate a well-built process." (IDCO Studio) | https://www.idco.studio/post/the-exact-interior-design-process-outline-successful-studios-use (07-studio-ethnography.md §4 #2) | verified |
| C11 | "It would've been quicker to do it myself." (Interior Designers Hub, on a designer's first assistant) | https://www.interiordesignershub.co.uk/blog/how-to-delegate-without-losing-your-mind (07-studio-ethnography.md §4 #3) | verified |
| C12 | "This isn't a hiring problem. It's a systems problem." (Interior Designers Hub) | https://www.interiordesignershub.co.uk/blog/how-to-delegate-without-losing-your-mind (07-studio-ethnography.md §4 #4) | verified |
| C13 | "You spend 45 minutes hunting for that chair again — only to discover it's been discontinued." (Programa) | https://programa.design/blog/interior-designer-workflow-mistakes (07-studio-ethnography.md §4 #8) | verified |
| C14 | Patina's intelligence is a real designer's eye, starting with Leah's, that learns the studio's as it works. | docs/vision/recruiting-one-liners.md §To a designer ("What it isn't"); capability unchecked against the product | todo |
| C15 | Pricing is one page, public and stable. | Promise in docs/vision/VISION.md §4; no public pricing page exists yet (artifacts/studio-hook-2026-09-22/deck/BRIEF.md slide 12) | todo |
| C16 | No lock-in; the studio's data exports. | Promise in docs/vision/VISION.md §4; not yet true (artifacts/studio-hook-2026-09-22/design/completeness-critic.md §4.10) | todo |
| C17 | Ten Midwest makers are in the pipeline. | docs/vision/recruiting-one-liners.md §To a maker (Status: Draft, 2026-09-01); recount before use | todo |
| C18 | Capture brings any product into the library in under ten seconds. | docs/vision/VISION.md §5.4 (differentiator, never timed; completeness-critic.md §4.16 bars time numbers) | todo |
| C19 | Studio subscription price and tiers (working figures Pro / Studio). | docs/vision/VISION.md §7 V2 (open ruling) | todo |
| C20 | Patina's furniture margin and client project fee (v4 working figures). | docs/vision/VISION.md §3 and §7 V1 (working figures, never quote) | todo |
| C21 | Studio Designer charges for desktop-to-cloud migration as a paid line item. | artifacts/studio-hook-2026-09-22/research/05-competitor-activation.md line 13 (competitor price; money) | todo |
| C22 | Mydoma charges a one-time onboarding fee on its annual plan. | https://mydomastudio.com/pricing/ via 05-competitor-activation.md line 52 (competitor price; pricing has changed over time) | todo |
| C23 | The Founding 50 is a circle of 50 working designers shaping Patina; Kody and Leah read every application at patina.cloud/designers. | https://patina.cloud/designers (hero and application sections, read 2026-10-08) | verified |
| C24 | Patina's app and marketplace are pre-launch. | https://patina.cloud (status line, read 2026-10-08) | verified |
| C25 | Kippley Custom Carpentry is a family-owned builder in Sauk City, Wisconsin, building homes since 1987, that employs its own framing and finishing carpenters. | https://www.kippleycustomcarpentry.com (home page: "Since 1987", "family-owned", "we employ our own framing and finishing carpenters", footer address; read 2026-10-09) | verified |
| C26 | Kippley Custom Carpentry builds its own custom woodwork: fireplace mantels, entertainment centers, built-ins and cabinetry. | https://www.kippleycustomcarpentry.com (home page, "Intricate Custom Woodworking" and "Remodeling and Additions"; read 2026-10-09) | verified |
| C27 | The 2026 Madison Fall Parade of Homes, hosted by the Madison Area Builders Association, runs October 9–11 and 16–18, 2026: Fridays 3–7 PM, Saturdays and Sundays 11 AM–6 PM. | https://www.madisonfallparadeofhomes.com (home page, dates and hours; read 2026-10-09) | verified |
| C28 | Middle West Studio designed the interiors of Kippley Custom Carpentry's 2026 Fall Parade home on Moll Drive in Waunakee (the Moll Drive house). | docs/marketing/partners/kippley.md §Moll Drive house | verified |
| C29 | The Moll Drive house is a traditional home with warm wood accents, a kitchen with a generous island and walk-in pantry, rear windows onto the landscape, and a finished walkout lower level. | https://www.madisonfallparadeofhomes.com/kippleycustomcarpentry (listing; read 2026-10-09) | verified |
| C30 | Leah will be at the Moll Drive house during the Fall Parade on ⟨day and hours⟩. | Kody, chat 2026-10-09: Leah or Kody will be present the second weekend. Promote once the day and hours are set and recorded in docs/marketing/partners/kippley.md | todo |
| C31 | On Patina, everyone who acts on a job (the client's household, the contractor, the trades and the studio's own team) holds a seat on that job, and a seat's access ends when the job does. | docs/design/the-document/DECISIONS.md R151 (PR-c household + seat; PR-d grant ends with the engagement window; built and deployed in the People room program) | verified |
| C32 | A trade sends its insurance certificate, W-9 and licence to the studio through a link, and the studio confirms them. | docs/design/the-document/DECISIONS.md R151 PR-a (tokened field-link page a trade writes to, unverified until a studio member confirms) | verified |

## Never claim (not ledger rows; lint cannot catch all of these)

- Anything about the Pledge or teaching royalties (VISION §3, legal-gated).
- Any time-saved figure, projected or measured. Nothing has been timed.
- That any studio besides Leah's Middle West Studio uses Patina today.
- Vendor statistics: "36% of a designer's time is admin", "6 tools, 6 logins", "20–40 hours a month
  reconciling" (completeness-critic.md §4.7).
- "8–16 hours of transcription" (an inferred figure; completeness-critic.md §4.8).
- "Leah Hartwell". Her surname is Kochaver.
- "Where Time Adds Value" (held, VISION V5).
