# First Flight — the catalogue manifest

**For Leah.** One row per piece in `catalog-manifest.csv`. Fill the columns you can stand behind and
leave every other cell **empty**. An empty cell means "we do not know this", and the app then says
nothing at all about it — no placeholder, no "TBD", no invented dimension. That is the whole rule.

Round one needs **at least 30 pieces this week** (ruling D2). If they are not in hand by end of day 6
the app says plainly that the shelf is still being filled, and round one leans on the Studio surfaces
instead.

---

## How it is used

1. You fill `catalog-manifest.csv` and drop the photographs into the **`leah-photos/`** folder beside
   it. That folder name is not a suggestion — Kody's upload step reads it by name, so the paths in the
   CSV look like `leah-photos/oak-table-01.jpg`.
2. An agent runs `build-catalog.py --check` and comes back with anything that fails — no guessing, no
   silent fixes.
3. Kody uploads the photographs and applies the rows to production.
4. Two probes confirm the marketplace is no longer empty.

Nothing you put in this file reaches production without Kody running the step himself.

---

## The columns

### Required — a row without all seven is rejected

| column | what it is | example |
|---|---|---|
| `slug` | lowercase words joined by single hyphens; unique across the file. It is the piece's stable id — changing it later creates a second piece. | `quarter-sawn-oak-dining-table` |
| `name` | what the piece is called, as a homeowner would read it. | `Quarter-Sawn Oak Dining Table` |
| `category` | exactly one of **`seating` · `tables` · `lighting` · `storage` · `decor` · `textiles`**. Nothing else. Not `sofa`, not `chair`, not `rug`. | `tables` |
| `style` | exactly one of the twelve styles below. | `Warm Modern` |
| `maker_name` | the maker, spelled the way they spell it. Never "Unknown Maker" — the app **drops** any piece whose maker reads that way. | `Nordic Atelier` |
| `price_retail_usd` | retail, in dollars. Digits and one decimal point only — no `$`, no thousands comma. | `4200.00` |
| `image_1` | path to the first photograph, relative to this CSV. | `photos/oak-table-01.jpg` |

### Optional — fill it if it is true, leave it blank if it is not

| column | what it is | example |
|---|---|---|
| `maker_made_in` | where the piece is made. Shown under the maker's name. **One maker, one answer:** every row naming the same maker must give the same `maker_made_in`, or leave it blank — the database holds one row per maker and can only carry one value. The file is rejected if two rows disagree. | `Aarhus, Denmark` |
| `maker_website` | the maker's own site. Same one-answer-per-maker rule. | `https://nordicatelier.dk` |
| `materials` | semicolon-separated. Also feeds the style reading — see below. | `quarter-sawn white oak;tung oil` |
| `palette` | the colour story in a few words. Also feeds the style reading. | `natural oak, warm` |
| `description` | two or three sentences a homeowner would want to read. Your voice, not a spec sheet. | |
| `width_in` `depth_in` `height_in` | whole inches. Fill **all three or none** — a half-filled size reads as a mistake. | `96` `40` `30` |
| `lead_time_weeks` | whole weeks, 1–104. Blank means we do not have a lead time, and the app omits the line. | `10` |
| `finish` | the finish, as the maker names it. | `Hand-rubbed tung oil` |
| `source_url` | where the piece lives on the maker's own site. Never a retailer aggregator. | |
| `quality_score` | 0–100. **Score every piece** — a blank is not "no opinion", the app reads it as **zero** and the piece sorts below everything you did score, so the file is rejected if any row is blank. **80 or above makes the app call the piece a designer selection**, so use that end sparingly: the file is also rejected if more than a third of rows are 80+. Most pieces sit in the 50s–70s. | `84` |
| `published_at` | `YYYY-MM-DD`, only if the piece should carry a specific catalogue date. Leave blank and one is assigned, staggered across the last eight weeks. **Leave at least three blank** (or dated inside the last seven days): the app's NEW THIS WEEK rail needs three recent pieces or it does not appear at all, and the file is rejected if it cannot find them. The easiest thing is to leave this column empty on every row. | `2026-08-28` |
| `photo_verified` | `yes` only when a human has confirmed the photograph is this exact piece. Blank otherwise — the app then says nothing rather than implying verification. | `yes` |
| `shipping_flat_usd` | flat freight in dollars, when there is a real number. Blank means shipping is not known, and no screen invents one. | `275.00` |
| `tags` | semicolon-separated, only from: `maker_piece`, `designers_pick`, `sourced`, `made_to_order`. These show as small labels in the app, so anything else is rejected. | `maker_piece` |
| `image_2` `image_3` | more photographs of the same piece. | |

---

## The style vocabulary

`style` must be one of these twelve. They are the taxonomy the matcher already runs on. Spelling is
forgiving — `mid century modern` finds `Mid-Century Modern` — but the word has to be on the list.

```
Warm Modern            Soft Contemporary      Mid-Century Modern     Scandinavian Minimal
Modern Industrial      Traditional            Transitional           Rustic
Coastal                Bohemian               Maximalist             Japandi
```

Run `python3 scripts/first-flight/build-spectrums.py --list-styles` to see what each one means to the
matcher, or `--explain "Japandi"` for one.

**Why it is required.** The style, the materials and the palette are what let the app decide which
pieces suit which home. A piece with no style cannot be matched to anyone and would never be shown to a
single tester — so a row without one is rejected rather than quietly published into the dark.

---

## The photographs

- **Formats:** JPEG, PNG, WebP, AVIF or HEIC. JPEG is the safe choice.
- **Size:** **1600 px on the long edge**, quality 80. Bigger is not better here — the app renders these
  at about 400 pt wide, and a phone on cellular in a client's living room is what we are designing for.
  To resize a folder on a Mac:

  ```
  sips -Z 1600 leah-photos/*.jpg
  ```

- **Hard limit:** 50 MB per file. Anything over is rejected.
- **One folder beside the CSV, called `leah-photos`.** File names inside it are yours. The CSV points
  at them by path — `leah-photos/oak-table-01.jpg`.
- **The photograph must be of the piece.** Not a room it might suit, not a mood shot — the piece. A
  second and third image can be a detail or the piece in a room.
- **No hot-links.** Do not paste a URL from a maker's site into `image_1`; those break, and fourteen
  rows in the database already point at other people's CDNs. Send the file.

---

## What happens if something is wrong

`build-catalog.py --check` prints **every** problem at once, with the line number and the slug, and
emits nothing. It fails the file rather than fixing it, because a guessed dimension in a catalogue is
worse than a missing one.

The five whole-file rules for round one:

- at least **30** pieces
- all **six** categories represented
- at least **3** makers
- at least **3** pieces published inside the last 7 days (so "new this week" has something to show)
- **100% of pieces carry a `quality_score`** — every row, no blanks

That last one is the newest and the least obvious, so here is the reasoning in full. `quality_score` is
an *optional* column in the sense that a row without it still parses — but the app does not treat a
blank as "unrated". `get_recommendations` orders on `COALESCE(quality_score, 0)`, so a blank is a **zero**:
the piece sorts below every scored piece on the shelf and can never reach designer-selection tier. A
file where half the pieces are scored and half are blank therefore ships a two-class catalogue where
the unscored half is effectively invisible, and every other count in the checker still reads clean.
Scoring all of them is the only state where the ordering means what it looks like it means.

The floor applies to the **release** profile only. `--profile fixture` (a handful of rows, a mechanics
check, or a partial file you are still filling in) does not enforce it, so you can run `--check` as you
go without the blanks shouting at you.

---

## Worked example

One filled row, with the optional columns a real piece would carry:

```
slug,name,category,style,maker_name,maker_made_in,maker_website,price_retail_usd,materials,palette,description,width_in,depth_in,height_in,lead_time_weeks,finish,source_url,quality_score,published_at,photo_verified,shipping_flat_usd,tags,image_1,image_2,image_3
quarter-sawn-oak-dining-table,Quarter-Sawn Oak Dining Table,tables,Warm Modern,Nordic Atelier,"Aarhus, Denmark",https://nordicatelier.dk,4200.00,quarter-sawn white oak;tung oil,natural oak warm,"Solid quarter-sawn white oak, made to order by a three-person workshop outside Aarhus.",96,40,30,10,Hand-rubbed tung oil,https://nordicatelier.dk/dining,84,,yes,,maker_piece,photos/oak-table-01.jpg,photos/oak-table-02.jpg,
```

Note the two empty cells near the end — `published_at` and `shipping_flat_usd`. Empty is a complete
answer.

Commas inside a cell need the cell wrapped in double quotes, as `"Aarhus, Denmark"` is above. Most
spreadsheet apps do this for you when you save as CSV.

---

## The three stories — `editorial-manifest.csv`

The app's home screen opens with one story card. There are three stories in the database today and all
three are **broken in the same two ways**: no photograph (so the card is a coloured rectangle), and a
read time nobody could hit — "4 MIN READ" over two short paragraphs. Round one fixes both.

`editorial-manifest.csv` already contains the three rows, with their ids filled in. **Do not add a
fourth and do not change `story_id`** — the ids are what make this an edit of the three live stories
rather than three new ones.

| column | what it is |
|---|---|
| `story_id` | already filled. Leave it alone. |
| `slug` | already filled. It names the body file. |
| `tag` | the small label above the title — `Maker Spotlight`, `Editor's Note`, `Material Study`. |
| `title` | the headline. |
| `subtitle` | one line under it. Optional. |
| `maker_name` `maker_location` | who the story is about and where they work. Optional. |
| `body_file` | the story itself, as a `.md` file in `editorial-bodies/` beside the CSV. **Give this or `body_md`, not both.** |
| `body_md` | the story typed straight into the cell instead. Fine for a short one; a file is easier for anything longer. |
| `hero_image` | **required.** A photograph for the card, same rules and same `leah-photos/` folder as the pieces. This is the half that turns a coloured rectangle into a story. |
| `featured_slug` | the `slug` of a piece in `catalog-manifest.csv` the story is about. Optional; must match a row in that file. |
| `published_offset_days` `sort_order` | leave blank. |

**There is no `read_minutes` column, and that is deliberate.** The read time is counted from the body
at 200 words a minute and written for you. A 90-word story says "1 min read" because that is true. If
you want it to say five minutes, write five minutes of story.

Two rules for the whole file: **three stories**, and **every one has a hero photograph**. Both are
checked before anything reaches production.

The three files in `editorial-bodies/` currently hold the stories exactly as they read in the app
today. Rewrite them in place — the local test copy reads the same three files, so whatever you write
is what the next person sees on the home screen when they run the app locally.
