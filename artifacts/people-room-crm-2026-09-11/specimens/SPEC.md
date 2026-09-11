# SPEC: the People room specimens

Build contract. Two Opus builders, one file each. You will not read any other file. Everything you need is here: the tokens, the class fragment, the fixture data, the six states, the acceptance lists, the width rules, the keyboard rules, and the render command.

House: Patina's Document. Studio surface, so the working band is 1200px. Paper, scored ink, hairline rules, no box-shadow anywhere.

---

## 1. File targets

| Builder | File (absolute) | Renders |
|---|---|---|
| A | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-crm/artifacts/people-room-crm-2026-09-11/specimens/people-room-1440.html` | the 1200px studio band, centred, in a 1440 viewport |
| B | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-crm/artifacts/people-room-crm-2026-09-11/specimens/people-room-390.html` | the 390 phone stacking |

Both files are self-contained single files.

| Rule | Statement |
|---|---|
| External resources | Only `https://fonts.googleapis.com` stylesheets (and the `https://fonts.gstatic.com` files they pull). Nothing else. Do NOT `<link>` to `_tokens-reference.css`; paste it inline instead (§2) |
| JS | Vanilla only. No library, no framework, no CDN script |
| Images | None. Inline SVG only, drawn in `var(--ink-faint)` at 1px |
| Shadows | The string `box-shadow` must not appear in either file |
| Truncation | The string `text-overflow` must not appear. Wrap |
| Structure | One `<style>` block, one `<script>` block, `<html lang="en">`, exactly one `<h1>`, headings in order |
| Last line | Each file's last line is exactly `<!-- specimen-complete -->` |

Fonts, paste these three lines in `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;1,400&family=Inter:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
```

---

## 2. The shared CSS, pasted byte for byte

Both builders paste §2.1 then §2.2 at the top of `<style>`, in that order, byte for byte, before any CSS of your own. Do not rename a token. Do not add a hex literal anywhere else in the file.

**One correction you must apply, and only this one.** The token block below ends inside its last rule: it opens four braces and closes three. After pasting §2.1 verbatim, append one closing brace `}` on its own line. Nothing else changes.

### 2.1 Tokens, verbatim

```css
/* Source: artifacts/agreement-room-2026-09-10/deck/src/index.html (lines 14-91) */
:root {
  color-scheme: light dark;

  /* paper, three stocks */
  --paper:            #FAF7F2;
  --paper-doc:        #FCFAF6;
  --rail:             #E8E3DB;

  /* ink */
  --ink:              #2C2926;
  --ink-muted:        #4E4339;
  --ink-subtle:       #5A4E43;
  --ink-faint:        #65594E;
  --ink-paper:        #FAF7F2;

  /* hairlines */
  --hairline:         #E8E3DB;
  --hairline-strong:  rgba(44, 41, 38, .14);

  /* the rest rule pigment */
  --oak:              #8B7355;

  /* state pigments: material value / paper ink */
  --clay:             #C4A57B;   --clay-ink:      #7C5E30;
  --golden:           #E8C547;   --golden-ink:    #79651E;
  --terracotta:       #D4A090;   --terracotta-ink:#9C5340;
  --sage:             #A8B5A0;   --sage-ink:      #5F6B57;

  /* rhythm */
  --module: 24px;
  --radius-hair: 2px;
  --radius-box:  3px;

  /* motion */
  --press-in:  70ms;
  --press-out: 240ms;
  --ease: cubic-bezier(.22, 1, .36, 1);

  --font-display: 'Playfair Display', Georgia, 'Times New Roman', serif;
  --font-body:    'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-meta:    'DM Mono', 'SF Mono', 'Fira Code', ui-monospace, monospace;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper:           #2A2622;
    --paper-doc:       #26221E;
    --rail:            #3A3530;
    --ink:             #F2EDE6;
    --ink-muted:       #D6CEC4;
    --ink-subtle:      #C7BEB3;
    --ink-faint:       #B8AEA2;
    --ink-paper:       #2A2622;
    --hairline:        rgba(242, 237, 230, .14);
    --hairline-strong: rgba(242, 237, 230, .22);
    --oak:             #B39572;
    --clay-ink:        #D8B98A;
    --golden-ink:      #E0C963;
    --terracotta-ink:  #E2A895;
    --sage-ink:        #AFC0A6;
  }
}
:root[data-theme="dark"] {
  --paper:           #2A2622;
  --paper-doc:       #26221E;
  --rail:            #3A3530;
  --ink:             #F2EDE6;
  --ink-muted:       #D6CEC4;
  --ink-subtle:      #C7BEB3;
  --ink-faint:       #B8AEA2;
  --ink-paper:       #2A2622;
  --hairline:        rgba(242, 237, 230, .14);
  --hairline-strong: rgba(242, 237, 230, .22);
  --oak:             #B39572;
  --clay-ink:        #D8B98A;
  --golden-ink:      #E0C963;
  --terracotta-ink:  #E2A895;
  --sage-ink:        #AFC0A6;
}
```

(The final `}` above is the appended brace. Everything before it is verbatim.)

### 2.2 The class fragment, verbatim

```css
  .crm-band { max-width: 1200px; margin: 0 auto; padding: 24px; background: var(--paper); font-family: var(--font-body); color: var(--ink); }
  .crm-h    { font-family: var(--font-display); font-size: 20px; font-weight: 500; margin: 48px 0 12px; }
  .crm-h:first-child { margin-top: 0; }

  /* ── Row (person + company share this grammar) ─────────────────────── */
  .crm-list { border-top: 1px solid var(--hairline); }
  .crm-row  { display: flex; align-items: center; gap: 16px; padding: 12px 16px; border-bottom: 1px solid var(--hairline); }

  .avatar { flex: none; display: flex; align-items: center; justify-content: center;
    font-family: var(--font-meta); font-weight: 500; font-size: 12px; color: var(--ink-paper); background: var(--oak); }
  .avatar--circle { width: 34px; height: 34px; border-radius: 50%; }
  .avatar--square { width: 42px; height: 42px; border-radius: 8px; }

  .row-id   { flex: 1 1 320px; min-width: 0; }
  .row-name { font-size: 14px; font-weight: 600; line-height: 1.4; }
  .row-sub  { font-family: var(--font-meta); font-size: 12px; letter-spacing: .04em; color: var(--ink-subtle); margin-top: 2px; }
  .row-rule { font-size: 14px; line-height: 1.5; color: var(--ink); margin-top: 4px; }
  .row-rule--blocked { border-left: 2px solid var(--terracotta-ink); padding-left: 10px; }

  .row-words { flex: none; display: flex; gap: 12px; }
  .row-chevron { flex: none; width: 16px; color: var(--ink-faint); text-align: center; }

  /* ── The word: bordered box, word + border always agree, never a fill ── */
  .word { flex: none; width: 108px; text-align: center; padding: 4px 6px;
    border: 1px solid var(--hairline-strong); border-radius: var(--radius-box);
    font-family: var(--font-meta); font-size: 11px; font-weight: 500;
    letter-spacing: .06em; text-transform: uppercase; background: transparent; }
  .word--current  { border-color: var(--sage);       color: var(--sage-ink); }
  .word--pending  { border-color: var(--golden);     color: var(--golden-ink); }
  .word--blocked  { border-color: var(--terracotta); color: var(--terracotta-ink); }
  .word--dormant  { border-color: var(--hairline-strong); color: var(--ink-faint); }
  /* Authority: a fact, not a state — no border pigment, no fill. */
  .word--plain { border-color: transparent; color: var(--ink-subtle); text-transform: none;
    letter-spacing: 0; font-weight: 400; text-align: left; width: auto; padding: 4px 0; }

  /* ── Card ────────────────────────────────────────────────────────────── */
  .crm-card { max-width: 720px; margin: 0 auto 48px; }
  .card-header { display: flex; align-items: center; gap: 16px; padding-bottom: 24px; }
  .card-name { font-family: var(--font-display); font-size: 20px; font-weight: 500; }
  .card-meta { font-family: var(--font-meta); font-size: 12px; color: var(--ink-subtle); margin-top: 4px; }
  .card-region { padding: 24px 0; border-top: 1px solid var(--hairline-strong); }
  .card-region h3 { font-family: var(--font-meta); font-size: 11px; font-weight: 500;
    letter-spacing: .08em; text-transform: uppercase; color: var(--ink-subtle); margin: 0 0 12px; }

  .crm-table { width: 100%; border-collapse: collapse; }
  .crm-table th { font-family: var(--font-meta); font-size: 11px; font-weight: 500; letter-spacing: .08em;
    text-transform: uppercase; color: var(--ink-subtle); text-align: left; padding: 0 12px 8px 0; }
  .crm-table td { font-size: 14px; padding: 12px 12px 12px 0; border-top: 1px solid var(--hairline); }
```

### 2.3 What you add on top

Only these, and only using the tokens above.

| Need | Add |
|---|---|
| Page ground | `body { background: var(--paper); color: var(--ink); margin: 0; font-family: var(--font-body); }` |
| Type scale | `.t-d1` display 34/1.15 w500; `.t-d2` display 26/1.20 w500; `.t-d3` display 20/1.30 w500; `.t-body` body 16/1.55; `.t-body-sm` body 14/1.50; `.t-meta` meta 12/1.50 tracking .08em sentence case; `.t-head` meta 11/1.50 w500 tracking .08em UPPER |
| Acts | `.act` min 44x44, DM Mono 13px w500 caps tracking .06em, no border, no background, a 1px `var(--oak)` rule under the label at rest. `.act--secondary` adds a second `var(--clay)` rule. `.act--terminal` is `var(--ink)` ground, `var(--ink-paper)` text, 3px radius, Inter 500 16px sentence case label. `.act:focus-visible { outline: 2px solid var(--clay-ink); outline-offset: 2px; }` |
| Gated act | `[aria-disabled="true"] { cursor: not-allowed; color: var(--ink-faint); }`. Never `opacity`. Never the `disabled` attribute |
| Chips | pressed: `var(--rail)` ground, 1px `var(--ink-faint)` border, `var(--ink)` text. Unpressed: `var(--paper)` ground, 1px `var(--hairline-strong)` border. 3px radius, never fully rounded |
| Held | `var(--rail)` ground, `border-left: 2px solid var(--terracotta-ink)`, `padding-left: 11px`, reason printed beneath in `.t-body-sm` at full `var(--ink)` |
| Fields | label always visible as `.t-head` above the control, never a `placeholder` attribute. Control: `var(--paper-doc)` ground, 1px `var(--hairline-strong)` box, 1px `var(--ink-faint)` bottom rule, 2px radius, 12px padding, Inter 16/1.55 |
| Rhythm | block gaps of 12, 24, 48 or 72px only. Radius 2px or 3px only, plus 50% for the person circle and 8px for the company square (already in §2.2) |
| Rules | `1px solid var(--hairline)` between rows; `1px solid var(--hairline-strong)` at a card region seam |
| Reduced motion | the `@media (prefers-reduced-motion: reduce)` block zeroing animation and transition durations |
| Forced colors | `@media (forced-colors: active)` giving `.word` and `.act--terminal` a `ButtonText` border and the focus ring `Highlight` |

---

## 3. The fixture, one JSON block

Paste this verbatim into the `<script>` of BOTH files as `const FIXTURE = {...}` and render every face from it. Both widths must show identical facts.

Derivations you must not change:

| Value | Rule |
|---|---|
| Today | 2026-10-20. "This week" is 19 to 25 October 2026 |
| Phones | `(612) 555-01NN` where NN is the fixture row number (F-11 gives `(612) 555-0111`). Fixture.md carries no digits; this rule is what makes the two widths agree |
| Emails | `<first>@<firm-slug>.com`, lowercase, ASCII (`dana@northgateelectric.com`) |
| Head count | "29 people · 22 firms". 29 = the 27 distinct humans of fixture §2 (F-28 is F-08's second seat, not a second human) plus Karin Lindqvist and Ben Ostrom from fixture §4. 22 = the 19 firms named in fixture §2 plus Ostrom Builders, Rivera Finishes and Granite North. The Okonkwo household is a household, not a firm |
| Site hours and staging note | specimen-set values, fixed below so both widths agree. They are not names, phones, or state words |

```json
{
  "today": "2026-10-20",
  "thisWeek": { "from": "2026-10-19", "to": "2026-10-25" },
  "head": { "people": 29, "firms": 22 },
  "project": {
    "id": "okonkwo",
    "name": "Okonkwo residence",
    "address": "4412 Fremont Ave S, Minneapolis MN 55409",
    "permitIssued": "2026-10-06",
    "demoStarted": "2026-10-12",
    "substantialCompletion": "2027-08-13"
  },
  "companies": [
    { "id": "hartwell",   "name": "Hartwell Studio",                    "kind": "Design studio",          "crew": 3, "jobs": 2, "paper": "Current" },
    { "id": "marrow",     "name": "Marrow & Sons",                      "kind": "GC",                     "crew": 3, "jobs": 2, "paper": "Current",
      "documents": [
        { "type": "COI, general liability", "number": "GL-4417-22", "issuer": "Cedar States Mutual", "issued": "2026-04-01", "expires": "2027-03-31", "state": "Current", "heldBy": "studio", "blocks": ["site access", "payment", "draw"] },
        { "type": "W-9", "number": "", "issuer": "", "issued": "2025-02-18", "expires": "", "state": "Current", "heldBy": "studio", "blocks": ["payment"] },
        { "type": "MN BC contractor licence", "number": "BC-708341", "issuer": "MN DLI", "issued": "2026-01-02", "expires": "2027-12-31", "state": "Current", "heldBy": "studio", "blocks": ["contract", "permit"] }
      ],
      "payee": { "remitTo": "Marrow & Sons", "taxIdLast4": "2208", "retainage": "10%" },
      "designations": { "paperworkContact": "F-08", "signer": "F-07", "siteContact": "F-09" } },
    { "id": "beckrowe",   "name": "Beck + Rowe Architects",             "kind": "Architect",              "crew": 1, "jobs": 1, "paper": "Current" },
    { "id": "northgate",  "name": "Northgate Electric",                 "kind": "Electrical sub",         "crew": 1, "jobs": 2, "paper": "Lapsed", "warrantyUntil": "2026-11-21",
      "documents": [
        { "type": "COI, general liability", "number": "GL-9021-18", "issuer": "Lakes Casualty", "issued": "2025-04-01", "expires": "2026-03-31", "state": "Lapsed", "heldBy": "studio", "blocks": ["site access", "payment", "draw"] },
        { "type": "W-9", "number": "", "issuer": "", "issued": "2025-04-14", "expires": "", "state": "Current", "heldBy": "studio", "blocks": ["payment"] },
        { "type": "MN electrical contractor licence", "number": "EA-114522", "issuer": "MN DLI", "issued": "2026-01-02", "expires": "2027-12-31", "state": "Current", "heldBy": "studio", "blocks": ["contract", "permit"] },
        { "type": "COI, workers compensation", "number": "", "issuer": "", "issued": "", "expires": "", "state": "Not on file", "heldBy": "studio", "blocks": ["site access", "draw"] }
      ],
      "payee": { "remitTo": "Northgate Electric", "taxIdLast4": "4417", "retainage": "10%" },
      "designations": { "paperworkContact": "F-11", "signer": "F-11", "siteContact": "F-11" },
      "soleProprietor": true,
      "history": "First job 2025, the Lindqvist kitchen. Two projects. No verdict recorded." },
    { "id": "rusk",       "name": "Rusk Mechanical",                    "kind": "Plumbing sub",           "crew": 1, "jobs": 2, "paper": "Current" },
    { "id": "halvorsen",  "name": "Halvorsen Cabinet Works",            "kind": "Cabinetry sub",          "crew": 1, "jobs": 2, "paper": "Current" },
    { "id": "tcdrywall",  "name": "Twin Cities Drywall & Plaster",      "kind": "Drywall sub",            "crew": 2, "jobs": 1, "paper": "Current",
      "designations": { "paperworkContact": "F-14", "signer": "F-15", "siteContact": "F-14" } },
    { "id": "lakeshore",  "name": "Lakeshore Painting Co.",             "kind": "Paint sub",              "crew": 1, "jobs": 1, "paper": "Current" },
    { "id": "boreal",     "name": "Boreal HVAC",                        "kind": "HVAC sub",               "crew": 1, "jobs": 1, "paper": "Current" },
    { "id": "cedariron",  "name": "Cedar & Iron Framing",               "kind": "Framing sub",            "crew": 1, "jobs": 1, "paper": "Current" },
    { "id": "radonnorth", "name": "Radon Solutions North",              "kind": "Radon sub",              "crew": 1, "jobs": 1, "paper": "Current" },
    { "id": "stonehaven", "name": "Stonehaven Tile Gallery",            "kind": "Showroom",               "crew": 1, "jobs": 2, "paper": "Current" },
    { "id": "waterline",  "name": "Waterline Supply",                   "kind": "Supplier",               "crew": 1, "jobs": 1, "paper": "Current" },
    { "id": "lumen",      "name": "Lumen & Co.",                        "kind": "Showroom",               "crew": 1, "jobs": 1, "paper": "Current" },
    { "id": "ashgrove",   "name": "Ashgrove Millwork",                  "kind": "Maker",                  "crew": 1, "jobs": 1, "paper": "Lapses in 30 days" },
    { "id": "kestrel",    "name": "Kestrel Staging",                    "kind": "Stager",                 "crew": 1, "jobs": 1, "paper": "Current" },
    { "id": "jfeld",      "name": "Jonah Feld Photography",             "kind": "Photography",            "crew": 1, "jobs": 1, "paper": "Current" },
    { "id": "gnbank",     "name": "Great Northern Bank",                "kind": "Lender",                 "crew": 1, "jobs": 1, "paper": "Not on file" },
    { "id": "cped",       "name": "City of Minneapolis, CPED Inspections", "kind": "Authority",           "crew": 1, "jobs": 1, "paper": "Not on file" },
    { "id": "ostrom",     "name": "Ostrom Builders",                    "kind": "GC",                     "crew": 1, "jobs": 1, "paper": "Current" },
    { "id": "rivera",     "name": "Rivera Finishes",                    "kind": "Paint sub",              "crew": 0, "jobs": 1, "paper": "Not on file" },
    { "id": "granite",    "name": "Granite North",                      "kind": "Countertop fabricator",  "crew": 0, "jobs": 1, "paper": "Not on file" }
  ],
  "persons": [
    { "id": "F-01", "name": "Leah Hartwell",    "company": "hartwell",   "roleAtFirm": "principal",        "side": "studio", "reach": "Account",    "consent": null,          "phone": "(612) 555-0101", "email": "leah@hartwellstudio.com" },
    { "id": "F-02", "name": "Priya Natarajan",  "company": "hartwell",   "roleAtFirm": "lead designer",    "side": "studio", "reach": "Account",    "consent": null,          "phone": "(612) 555-0102", "email": "priya@hartwellstudio.com" },
    { "id": "F-03", "name": "Dale Whitcomb",    "company": "hartwell",   "roleAtFirm": "bookkeeper",       "side": "studio", "reach": "Account",    "consent": null,          "phone": "(612) 555-0103", "email": "dale@hartwellstudio.com" },
    { "id": "F-04", "name": "Adaeze Okonkwo",   "company": null,         "roleAtFirm": "Okonkwo household","side": "client", "reach": "Account",    "consent": "Texting",     "phone": "(612) 555-0104", "email": "adaeze@okonkwohousehold.com" },
    { "id": "F-05", "name": "Chidi Okonkwo",    "company": null,         "roleAtFirm": "Okonkwo household","side": "client", "reach": "On paper",   "consent": "Not asked",   "phone": "(612) 555-0105", "email": "chidi@okonkwohousehold.com" },
    { "id": "F-06", "name": "Ngozi Eze",        "company": null,         "roleAtFirm": "key holder",       "side": "crew",   "reach": "Field link", "consent": "Texting",     "phone": "(612) 555-0106", "email": null },
    { "id": "F-07", "name": "Tom Marrow",       "company": "marrow",     "roleAtFirm": "owner, signer",    "side": "crew",   "reach": "Field link", "consent": "Not asked",   "phone": "(612) 555-0107", "email": "tom@marrowandsons.com" },
    { "id": "F-08", "name": "Erin Sato",        "company": "marrow",     "roleAtFirm": "project manager",  "side": "crew",   "reach": "Field link", "consent": "Texting",     "phone": "(612) 555-0108", "email": "erin@marrowandsons.com" },
    { "id": "F-09", "name": "Luis Ochoa",       "company": "marrow",     "roleAtFirm": "superintendent",   "side": "crew",   "reach": "Field link", "consent": "Texting",     "phone": "(612) 555-0109", "email": null },
    { "id": "F-10", "name": "Sam Rowe",         "company": "beckrowe",   "roleAtFirm": "architect of record", "side": "crew","reach": "On paper",   "consent": "Not asked",   "phone": "(612) 555-0110", "email": "sam@beckandrowe.com" },
    { "id": "F-11", "name": "Dana Kowalski",    "company": "northgate",  "roleAtFirm": "owner-operator",   "side": "crew",   "reach": "Field link", "consent": "Texting",     "phone": "(612) 555-0111", "email": "dana@northgateelectric.com" },
    { "id": "F-12", "name": "Pete Rusk",        "company": "rusk",       "roleAtFirm": "owner",            "side": "crew",   "reach": "On paper",   "consent": "Opted out",   "phone": "(612) 555-0112", "email": null },
    { "id": "F-13", "name": "Ingrid Halvorsen", "company": "halvorsen",  "roleAtFirm": "owner",            "side": "crew",   "reach": "On paper",   "consent": "Not asked",   "phone": "(612) 555-0113", "email": "ingrid@halvorsencabinetworks.com" },
    { "id": "F-14", "name": "Rosa Delgado",     "company": "tcdrywall",  "roleAtFirm": "office manager",   "side": "crew",   "reach": "On paper",   "consent": "Not asked",   "phone": "(612) 555-0114", "email": "rosa@twincitiesdrywall.com" },
    { "id": "F-15", "name": "Frank Bauer",      "company": "tcdrywall",  "roleAtFirm": "owner, signer",    "side": "crew",   "reach": "On paper",   "consent": "Not asked",   "phone": null,             "email": null },
    { "id": "F-16", "name": "Amara Osei",       "company": "lakeshore",  "roleAtFirm": "owner",            "side": "crew",   "reach": "Account",    "consent": "Texting",     "phone": "(612) 555-0116", "email": "amara@lakeshorepainting.com" },
    { "id": "F-17", "name": "Jim Lindgren",     "company": "boreal",     "roleAtFirm": "project manager",  "side": "crew",   "reach": "On paper",   "consent": "Not asked",   "phone": "(612) 555-0117", "email": "jim@borealhvac.com" },
    { "id": "F-18", "name": "Joe Wozniak",      "company": "cedariron",  "roleAtFirm": "framing foreman",  "side": "crew",   "reach": "Field link", "consent": "Invited",     "phone": "(612) 555-0118", "email": null },
    { "id": "F-19", "name": "Kelly Marsh",      "company": "radonnorth", "roleAtFirm": "owner",            "side": "crew",   "reach": "On paper",   "consent": "Not asked",   "phone": "(612) 555-0119", "email": "kelly@radonsolutionsnorth.com" },
    { "id": "F-20", "name": "Claire Bissett",   "company": "stonehaven", "roleAtFirm": "showroom rep",     "side": "maker",  "reach": "On paper",   "consent": "Not asked",   "phone": "(612) 555-0120", "email": "claire@stonehaventile.com" },
    { "id": "F-21", "name": "Marcus Hale",      "company": "waterline",  "roleAtFirm": "fixtures rep",     "side": "maker",  "reach": "On paper",   "consent": null,          "phone": "(612) 555-0121", "email": "marcus@waterlinesupply.com" },
    { "id": "F-22", "name": "Sofia Ferraro",    "company": "lumen",      "roleAtFirm": "lighting rep",     "side": "maker",  "reach": "On paper",   "consent": null,          "phone": "(612) 555-0122", "email": "sofia@lumenandco.com" },
    { "id": "F-23", "name": "Owen Ashby",       "company": "ashgrove",   "roleAtFirm": "owner",            "side": "maker",  "reach": "Account",    "consent": null,          "phone": "(612) 555-0123", "email": "owen@ashgrovemillwork.com" },
    { "id": "F-24", "name": "Nadia Brooks",     "company": "kestrel",    "roleAtFirm": "owner",            "side": "crew",   "reach": "On paper",   "consent": "Not asked",   "phone": "(612) 555-0124", "email": "nadia@kestrelstaging.com" },
    { "id": "F-25", "name": "Jonah Feld",       "company": "jfeld",      "roleAtFirm": "owner",            "side": "crew",   "reach": "On paper",   "consent": "Not asked",   "phone": "(612) 555-0125", "email": "jonah@jonahfeldphotography.com" },
    { "id": "F-26", "name": "Carol Nystrom",    "company": "gnbank",     "roleAtFirm": "draw inspector",   "side": "crew",   "reach": "On paper",   "consent": "Not asked",   "phone": "(612) 555-0126", "email": "carol@greatnorthernbank.com" },
    { "id": "F-27", "name": "Ray Thao",         "company": "cped",       "roleAtFirm": "building inspector","side": "crew",  "reach": "On paper",   "consent": "Not asked",   "phone": "(612) 555-0127", "email": "ray.thao@minneapolismn.gov" },
    { "id": "L-01", "name": "Karin Lindqvist",  "company": null,         "roleAtFirm": "Lindqvist household","side": "client","reach": "Account",   "consent": null,          "phone": "(612) 555-0201", "email": "karin@lindqvisthousehold.com" },
    { "id": "L-02", "name": "Ben Ostrom",       "company": "ostrom",     "roleAtFirm": "owner",            "side": "crew",   "reach": "On paper",   "consent": "Texting",     "phone": "(612) 555-0202", "email": "ben@ostrombuilders.com" }
  ],
  "channels": {
    "F-11": [
      { "kind": "Mobile", "value": "(612) 555-0111", "preferred": true,  "smsCapable": true,  "verified": "2026-10-12", "status": "ok",      "consent": "Texting" },
      { "kind": "Email",  "value": "dana@northgateelectric.com", "preferred": false, "smsCapable": false, "verified": "", "status": "bounced", "consent": null }
    ],
    "F-12": [
      { "kind": "Mobile", "value": "(612) 555-0112", "preferred": true,  "smsCapable": true,  "verified": "2025-05-02", "status": "ok",      "consent": "Opted out" }
    ],
    "F-15": [],
    "F-14": [
      { "kind": "Email",  "value": "rosa@twincitiesdrywall.com", "preferred": true,  "smsCapable": false, "verified": "2026-10-09", "status": "ok", "consent": null },
      { "kind": "Office", "value": "(612) 555-0114", "preferred": false, "smsCapable": false, "verified": "2026-10-09", "status": "ok", "consent": null }
    ],
    "F-08": [
      { "kind": "Mobile", "value": "(612) 555-0108", "preferred": true,  "smsCapable": true,  "verified": "2026-10-08", "status": "ok", "consent": "Texting" },
      { "kind": "Email",  "value": "erin@marrowandsons.com", "preferred": false, "smsCapable": false, "verified": "2026-10-08", "status": "ok", "consent": null }
    ],
    "F-18": [
      { "kind": "Mobile", "value": "(612) 555-0118", "preferred": true,  "smsCapable": true,  "verified": "2026-10-13", "status": "ok", "consent": "Invited" }
    ],
    "F-27": [
      { "kind": "Office",     "value": "(612) 555-0127", "preferred": true,  "smsCapable": false, "verified": "2026-10-06", "status": "ok", "consent": null },
      { "kind": "Email",      "value": "ray.thao@minneapolismn.gov", "preferred": false, "smsCapable": false, "verified": "", "status": "ok", "consent": null },
      { "kind": "311 portal", "value": "inspection scheduling", "preferred": false, "smsCapable": false, "verified": "", "status": "ok", "consent": null }
    ]
  },
  "consents": [
    { "person": "F-11", "channelValue": "(612) 555-0111", "state": "Texting",   "source": "written", "recorded": "2025-05-02", "originJob": "Lindqvist kitchen", "note": "Carried forward to the Okonkwo residence, 12 October 2026." },
    { "person": "F-12", "channelValue": "(612) 555-0112", "state": "Opted out", "source": "inbound text", "recorded": "2025-12-03", "originJob": "Lindqvist kitchen", "note": "Opted out by text, 3 December 2025, on the Lindqvist kitchen." },
    { "person": "F-18", "channelValue": "(612) 555-0118", "state": "Invited",   "source": "verbal",  "recorded": "2026-10-13", "originJob": "Okonkwo residence", "note": "Recorded by Priya Natarajan at the site kickoff, 13 October 2026. No YES yet." },
    { "person": "F-06", "channelValue": "(612) 555-0106", "state": "Texting",   "source": "written", "recorded": "2026-10-10", "originJob": "Okonkwo residence", "note": "Site kickoff form, 10 October 2026." },
    { "person": "F-08", "channelValue": "(612) 555-0108", "state": "Texting",   "source": "written", "recorded": "2026-10-08", "originJob": "Okonkwo residence", "note": "Written consent, 8 October 2026." },
    { "person": "F-09", "channelValue": "(612) 555-0109", "state": "Texting",   "source": "verbal",  "recorded": "2026-10-10", "originJob": "Okonkwo residence", "note": "Verbal at kickoff, recorded by Priya Natarajan." },
    { "person": "F-16", "channelValue": "(612) 555-0116", "state": "Texting",   "source": "web form","recorded": "2026-10-14", "originJob": "Okonkwo residence", "note": "Web form, 14 October 2026." }
  ],
  "rules": [
    { "person": "F-11", "text": "Text only. The email on file bounces.", "block": false, "setBy": "Priya Natarajan", "setAt": "2026-10-12" },
    { "person": "F-15", "text": "Do not contact directly. Write Rosa Delgado instead.", "block": true, "routeTo": "F-14", "setBy": "Leah Hartwell", "setAt": "2026-10-09" },
    { "person": "F-27", "text": "Never text. Office phone or the 311 portal only.", "block": true, "setBy": "Priya Natarajan", "setAt": "2026-10-06" },
    { "person": "F-13", "text": "Email only. No cell for work.", "block": false, "setBy": "Priya Natarajan", "setAt": "2026-10-09" },
    { "person": "F-10", "text": "Email only. Phone for emergencies.", "block": false, "setBy": "Priya Natarajan", "setAt": "2026-10-06" },
    { "person": "F-05", "text": "Email first. Call for anything over $2,500.", "block": false, "setBy": "Leah Hartwell", "setAt": "2026-09-30" },
    { "person": "F-06", "text": "Text only. Never opens email.", "block": false, "setBy": "Priya Natarajan", "setAt": "2026-10-10" },
    { "person": "F-09", "text": "Text only. Phone calls.", "block": false, "setBy": "Priya Natarajan", "setAt": "2026-10-10" },
    { "person": "F-26", "text": "Never text. Email and phone only.", "block": true, "setBy": "Dale Whitcomb", "setAt": "2026-10-06" }
  ],
  "grants": [
    { "person": "F-11", "tier": "Field link", "opens": "the Call Sheet and the site access card", "granted": "2026-10-12", "lastUsed": "2026-10-17", "ends": "2027-08-13", "endsWords": "Ends with the job, 13 August 2027. Renews when they use it." },
    { "person": "F-08", "tier": "Field link", "opens": "the Call Sheet and the site access card", "granted": "2026-10-08", "lastUsed": "2026-10-19", "ends": "2027-08-13", "endsWords": "Ends with the job, 13 August 2027. Renews when they use it." },
    { "person": "F-04", "tier": "Account",    "opens": "the client page and the Patina app",      "granted": "2026-09-22", "lastUsed": "2026-10-20", "ends": "",           "endsWords": "No end date. Revoked by removing the account." },
    { "person": "F-18", "tier": "Field link", "opens": "the Call Sheet and the site access card", "granted": "2026-10-13", "lastUsed": "2026-10-14", "ends": "2026-12-19", "endsWords": "Ends with the framing window, 19 December 2026." },
    { "person": "F-16", "tier": "Account",    "opens": "the maker book at another studio",        "granted": "2026-05-11", "lastUsed": "2026-10-02", "ends": "",           "endsWords": "Held elsewhere. Matched on email, 14 October 2026." }
  ],
  "engagements": [
    { "person": "F-02", "company": "hartwell",   "band": "studio",  "kind": "lead designer",        "trade": "",                   "stage": "On the job", "from": "2026-08-01", "to": "2027-09-30", "authority": "Change orders, design intent. No money.", "access": "controls" },
    { "person": "F-03", "company": "hartwell",   "band": "studio",  "kind": "bookkeeper",           "trade": "",                   "stage": "On the job", "from": "2026-08-01", "to": "2027-09-30", "authority": "Prepares only.",                        "access": "none" },
    { "person": "F-01", "company": "hartwell",   "band": "studio",  "kind": "principal",            "trade": "",                   "stage": "On the job", "from": "2026-08-01", "to": "2027-09-30", "authority": "Approves fee changes.",                 "access": "none" },
    { "person": "F-04", "company": null,         "band": "client",  "kind": "client",               "trade": "",                   "stage": "On the job", "from": "2026-08-01", "to": "2027-09-30", "authority": "Selections.",                           "access": "key" },
    { "person": "F-05", "company": null,         "band": "client",  "kind": "household member",     "trade": "",                   "stage": "On the job", "from": "2026-08-01", "to": "2027-09-30", "authority": "Signs money to $2,500.",                "access": "key" },
    { "person": "F-07", "company": "marrow",     "band": "week",    "kind": "gc",                   "trade": "general contracting","stage": "On the job", "from": "2026-10-12", "to": "2027-08-13", "authority": "Signs sub payments. Prices change orders.", "access": "controls" },
    { "person": "F-08", "company": "marrow",     "band": "week",    "kind": "gc",                   "trade": "project management", "stage": "On the job", "from": "2026-10-12", "to": "2027-08-13", "authority": "Prepares only.",                        "access": "controls" },
    { "person": "F-09", "company": "marrow",     "band": "week",    "kind": "gc",                   "trade": "field supervision",  "stage": "On the job", "from": "2026-10-12", "to": "2027-08-13", "authority": "Controls the gate.",                    "access": "controls" },
    { "person": "F-18", "company": "cedariron",  "band": "week",    "kind": "sub",                  "trade": "carpentry / framing","stage": "On the job", "from": "2026-10-12", "to": "2026-12-19", "authority": "",                                      "access": "escorted" },
    { "person": "F-11", "company": "northgate",  "band": "week",    "kind": "sub",                  "trade": "electrical",         "stage": "On the job", "from": "2026-10-12", "to": "2027-08-13", "authority": "",                                      "access": "escorted",
      "held": "Site access held. Northgate Electric's insurance lapsed 31 March 2026." },
    { "person": "F-06", "company": null,         "band": "week",    "kind": "receiver",             "trade": "",                   "stage": "On the job", "from": "2026-10-12", "to": "2027-09-30", "authority": "Holds a key.",                          "access": "key" },
    { "person": "F-10", "company": "beckrowe",   "band": "week",    "kind": "architect",            "trade": "architecture",       "stage": "On the job", "from": "2026-08-01", "to": "2027-08-13", "authority": "Change orders, design conformance. No money.", "access": "scheduled" },
    { "person": "F-27", "company": "cped",       "band": "later",   "kind": "inspector",            "trade": "code enforcement",   "stage": "Awarded",    "from": "2026-11-16", "to": "2027-08-13", "authority": "Passes or fails an inspection.",        "access": "scheduled" },
    { "person": "F-26", "company": "gnbank",     "band": "later",   "kind": "inspector",            "trade": "construction lending","stage": "Awarded",   "from": "2026-11-02", "to": "2027-08-13", "authority": "Releases a draw.",                      "access": "scheduled" },
    { "person": "F-12", "company": "rusk",       "band": "later",   "kind": "sub",                  "trade": "plumbing",           "stage": "Awarded",    "from": "2026-11-09", "to": "2027-04-24", "authority": "",                                      "access": "escorted" },
    { "person": "F-17", "company": "boreal",     "band": "later",   "kind": "sub",                  "trade": "hvac",               "stage": "Awarded",    "from": "2027-02-01", "to": "2027-05-14", "authority": "Prices change orders, sub side.",       "access": "escorted" },
    { "person": "F-19", "company": "radonnorth", "band": "later",   "kind": "sub",                  "trade": "radon mitigation",   "stage": "Awarded",    "from": "2027-02-01", "to": "2027-02-19", "authority": "",                                      "access": "escorted" },
    { "person": "F-14", "company": "tcdrywall",  "band": "later",   "kind": "sub",                  "trade": "drywall / plaster",  "stage": "Awarded",    "from": "2027-01-11", "to": "2027-02-27", "authority": "",                                      "access": "none" },
    { "person": "F-15", "company": "tcdrywall",  "band": "later",   "kind": "sub",                  "trade": "drywall / plaster",  "stage": "Awarded",    "from": "2027-01-11", "to": "2027-02-27", "authority": "Signs the subcontract, sub side.",      "access": "none" },
    { "person": "F-13", "company": "halvorsen",  "band": "later",   "kind": "sub",                  "trade": "cabinetry",          "stage": "Awarded",    "from": "2027-04-05", "to": "2027-05-28", "authority": "",                                      "access": "escorted" },
    { "person": "F-16", "company": "lakeshore",  "band": "later",   "kind": "sub",                  "trade": "paint",              "stage": "Awarded",    "from": "2027-05-04", "to": "2027-06-18", "authority": "",                                      "access": "escorted",
      "bid": "Quoted 2 October 2026. Selected 9 October 2026." },
    { "person": "F-23", "company": "ashgrove",   "band": "later",   "kind": "maker",                "trade": "millwork fabrication","stage": "Awarded",   "from": "2027-06-07", "to": "2027-06-11", "authority": "",                                      "access": "scheduled" },
    { "person": "F-24", "company": "kestrel",    "band": "later",   "kind": "stager",               "trade": "staging",            "stage": "Awarded",    "from": "2027-08-16", "to": "2027-08-20", "authority": "",                                      "access": "scheduled" },
    { "person": "F-25", "company": "jfeld",      "band": "later",   "kind": "photographer",         "trade": "photography",        "stage": "Awarded",    "from": "2027-09-13", "to": "2027-09-13", "authority": "",                                      "access": "scheduled" },
    { "person": null,   "company": "rivera",     "band": "bidding", "kind": "sub",                  "trade": "paint",              "stage": "No response","from": "", "to": "", "authority": "", "access": "none",
      "bid": "Asked 28 September 2026. Due 5 October 2026. Nobody owed an answer after that." },
    { "person": null,   "company": "granite",    "band": "done",    "kind": "sub",                  "trade": "countertop fabrication","stage": "Off the job","from": "", "to": "", "authority": "", "access": "none",
      "closed": "Off the job 2 October 2026. The slab program went to Stonehaven Tile Gallery." }
  ],
  "siteAccess": {
    "project": "Okonkwo residence",
    "address": "4412 Fremont Ave S, Minneapolis MN 55409",
    "callFirst": [
      { "person": "F-09", "role": "superintendent", "phone": "(612) 555-0109" },
      { "person": "F-05", "role": "owner",          "phone": "(612) 555-0105" },
      { "person": "F-10", "role": "architect",      "phone": "(612) 555-0110" }
    ],
    "wayIn": "Lockbox, version 3. The code is held off Patina; ask Luis Ochoa.",
    "gateControl": "Luis Ochoa controls the gate.",
    "keyHolder": { "person": "F-06", "line": "Ngozi Eze holds a key. Text only, (612) 555-0106." },
    "hours": "Weekdays 07:00 to 17:00. No Saturday work before 09:00.",
    "receiving": "Ngozi Eze receives deliveries. Stage in the detached garage.",
    "changeLog": [
      { "what": "Lockbox changed to version 3.", "when": "2026-10-16", "by": "Priya Natarajan", "told": ["F-09", "F-06", "F-18", "F-11"] },
      { "what": "Site hours set for the demo phase.", "when": "2026-10-12", "by": "Priya Natarajan", "told": ["F-07", "F-08", "F-09"] }
    ]
  },
  "addSheet": {
    "dateline": "Add sheet, mid-flow, 13 October 2026",
    "kind": "a sub",
    "project": "Okonkwo residence",
    "name": "Joe Wozniak",
    "firm": "Cedar & Iron Framing",
    "trade": "carpentry / framing",
    "channels": [
      { "kind": "Mobile", "value": "(612) 555-0118", "smsCapable": true },
      { "kind": "Email",  "value": "", "smsCapable": false }
    ],
    "rule": "Text only. No working email.",
    "consent": { "checked": true, "method": "verbal", "evidence": "Recorded by Priya at the site kickoff, 13 October 2026." },
    "consequence": "Adding Joe Wozniak puts him on the Okonkwo residence Call Sheet and opens a field link for the framing window. It never opens billing or the agreement.",
    "terminal": "Add to the roster"
  }
}
```

---

## 4. The state switcher

Seven states. Default `state-directory`.

| Hash | State | Opens |
|---|---|---|
| (empty) or `#state-directory` | Directory | the studio book, Everyone chip pressed |
| `#state-person` | Person card | F-11 Dana Kowalski |
| `#state-company` | Company card | Northgate Electric, COI lapsed |
| `#state-roster` | Project roster | Okonkwo Call Sheet, this week / later / bidding / done |
| `#state-pick` | Bring forward | the rolodex picker over the Okonkwo Call Sheet, four Lindqvist people selected |
| `#state-add` | Add sheet | mid-flow, Joe Wozniak, text only, consent capture |
| `#state-access` | Site access card | Okonkwo residence |

**Why Northgate Electric and not Marrow & Sons in `#state-company`.** The brief names Marrow & Sons with a lapsed COI, but the fixture gives Marrow a current COI (expires 31 March 2027) and gives Northgate Electric the only real lapse (expired 31 March 2026). The fixture wins. The state id is unchanged, so the deck's switcher still works, and Marrow & Sons appears in `#state-directory` as a firm row reading Current.

Mechanics, identical in both files:

| Rule | Statement |
|---|---|
| Hash format | A list of tokens separated by `&` or `,`. The first token matching `state-*` sets the state. The token `nobar` hides the state bar. `#state-person&nobar` is valid |
| On load | Read `location.hash` on `DOMContentLoaded`. The render tool navigates straight to the hash, so a `hashchange`-only listener will never fire. Wire both |
| On change | Listen for `hashchange` and re-render |
| postMessage | `window.addEventListener('message', e => {...})`, accepting `{ state: 'state-person' }` or `{ state: 'person' }`. Normalise by prefixing `state-` when absent. Ignore any message whose `state` is not one of the six. Never call `eval`, never trust any other field |
| Switching | Exactly one state region is in the DOM flow at a time. Use the `hidden` property, not `style.display`. The other five must not be reachable by Tab |
| Announce | On every state change write the state's name into a page-level `<p role="status">` |

The state bar (hidden by the `nobar` token):

```
[ Directory ] [ Person card ] [ Company card ] [ Project roster ] [ Bring forward ] [ Add sheet ] [ Site access ]
People room specimen · Okonkwo residence · 20 October 2026 · invented data
```

| Rule | Statement |
|---|---|
| Ground | `var(--rail)`, `var(--ink-muted)` text, DM Mono 11px, tracking .04em, 1px `var(--hairline-strong)` bottom rule, padding 10px 24px |
| Buttons | `.act .act--tertiary` with `aria-pressed`; the pressed one reflects the current state |
| Position | Above the page, outside it. It is the only place the word "invented" or any caveat may appear. Nothing inside the mocked page says specimen, prototype, example or fictional |
| Type | No Playfair in the bar |

---

## 5. Per-state acceptance

Every string below must appear on the face, spelled exactly. Every state word listed must render as a `.word` with the token named.

### 5.1 `#state-directory`

| # | Must be visible |
|---|---|
| 1 | `<h1>` reading "The People Room" and, beside it, "29 people · 22 firms" |
| 2 | Chip row, `role="group"` labelled "Narrow the book", six chips in order: Everyone, Clients, Crew, Makers, Studio, Firms. Everyone `aria-pressed="true"` |
| 3 | Second chip line under Crew: electrical, plumbing, cabinetry, drywall, paint, hvac, carpentry / framing, radon mitigation |
| 4 | Lens: two scored words MINE and STUDIO, STUDIO pressed |
| 5 | At least these ten person rows, in this order: Adaeze Okonkwo, Chidi Okonkwo, Tom Marrow, Erin Sato, Luis Ochoa, Dana Kowalski, Joe Wozniak, Pete Rusk, Rosa Delgado, Frank Bauer, Ray Thao |
| 6 | At least these three firm rows with 42px rounded squares: Marrow & Sons, Northgate Electric, Twin Cities Drywall & Plaster |
| 7 | Row grammar (PR-p, C1, C4): a person row carries exactly three bordered `.word` columns — reach, consent, paper, in that order. Stage is never a person-row word column; it prints only on the seat line beneath, one line per live seat. A company row keeps its two word columns (paper, payee marker) — unchanged |
| 8 | Dana Kowalski's row: circle "DK", "Dana Kowalski", "Northgate Electric · electrical", rule clause "Text only. The email on file bounces.", `tel:` link "(612) 555-0111", the row's three word columns — reach `Field link` (`--golden`), consent `Texting` (`--sage`), paper `Lapsed` (`--terracotta`) — and one seat line beneath carrying the stage word `On the job` (`--sage`): "Okonkwo residence · sub · electrical · On the job · 12 Oct 2026 to 13 Aug 2027" |
| 9 | Pete Rusk's row: consent word `Opted out` (`--terracotta`) and the clause "Opted out by text, 3 December 2025, on the Lindqvist kitchen." |
| 10 | Frank Bauer's row: no phone printed, clause "Do not contact directly. Write Rosa Delgado instead." printing Rosa Delgado's email (`rosa@twincitiesdrywall.com`) and her office phone as a `tel:` link — the routed-contact rule in both files: email if present, then the office phone tel-linked, never a bare phone string — with a 2px `--terracotta-ink` leading rule, reach word `On paper` (`--ink-faint`) |
| 11 | Ray Thao's row: clause "Never text. Office phone or the 311 portal only." with the leading rule, the row's word columns — reach `On paper`, consent `Not asked` — and no paper word (lender and inspector people print no paper word, R-A) — and a seat line beneath carrying the stage word `Awarded` |
| 12 | Joe Wozniak's row: consent word `Invited` (`--golden`) |
| 13 | Marrow & Sons firm row: "GC · 3 on the crew · 2 open jobs", paper word `Current` (`--sage`), plain uncoloured payee marker "Signs: Tom Marrow" |
| 14 | Northgate Electric firm row: paper word `Lapsed` (`--terracotta`) |
| 15 | Every phone on screen is an `<a href="tel:+16125550111">`-style link, its own control, at least 44x44, at least 8px from the row's own control |
| 16 | No `StatusDot`-style bare colour dot anywhere. Every state carries a visible word |
| 17 | Duplicate band above the list, at both widths: the sentence "These two cards share a phone." followed by the two names, Adaeze Okonkwo and Chidi Okonkwo, each a live open-person control that opens that person's card. The band carries no "Compare & merge" act and no "Compare them?" question — the Compare & merge sheet is phase 2 (direction.md §8), so the specimen shows the notice and its two doors, nothing more (R-Y) |
| 18 | A firm whose only people are inspectors or lenders (Great Northern Bank, City of Minneapolis CPED Inspections) holds no compliance paper for the studio: its firm row prints no paper word at all, and no company suffix names one — no payee marker either, a lender or inspector firm has none. Never "Not on file", never blocked |
| 19 | Great Northern Bank and City of Minneapolis, CPED Inspections appear as Directory firm rows under both the Everyone chip and the Firms chip, demonstrating #18: no paper word, no payee marker, on either row |

### 5.2 `#state-person`

| # | Must be visible |
|---|---|
| 1 | Header: 48px circle "DK", "Dana Kowalski" in `.t-d3`, "Northgate Electric · owner-operator, since 2025", "Sole proprietor" |
| 2 | Region "Reach & access" with three sub-heads in this order: "Channels", "Contact rule", "Access grants" |
| 3 | Channels table: "Mobile · (612) 555-0111 · preferred · verified 12 Oct 2026" with consent word `Texting`; "Email · dana@northgateelectric.com" in the held treatment (`--rail` ground, 2px `--terracotta-ink` leading rule) with the reason "This address bounced back, 12 March 2026. Texts and calls still reach them." |
| 4 | Consent line under the mobile channel: "Written consent, 2 May 2025, on the Lindqvist kitchen. Carried forward to the Okonkwo residence, 12 October 2026." |
| 5 | Contact rule: "Text only. The email on file bounces. Set by Priya Natarajan, 12 October 2026." plus a tertiary act "Edit the rule" |
| 6 | Access grants: "Field link · the Call Sheet and the site access card · minted 12 Oct 2026 · used 17 Oct 2026 · Ends with the job, 13 August 2027. Renews when they use it." plus a tertiary act "Revoke" |
| 7 | Region "Seats on projects": one row "Okonkwo residence · sub · electrical" with stage word `On the job` (`--sage`), window "12 Oct 2026 to 13 Aug 2027", authority as plain text "No authority on this job", "Escorted on site", "Contracted through Marrow & Sons", "Hidden from the client" |
| 8 | Region "Past seats": "Lindqvist kitchen · sub · electrical · Closed 21 Nov 2025 · Warranty through 21 Nov 2026" with stage word `Warranty` (`--ink-faint`) |
| 9 | Region "Paper" (she is a sole proprietor): "COI, general liability · GL-9021-18 · Lakes Casualty · expired 31 March 2026" with paper word `Lapsed`, and beneath it "Blocks site access, payment and the draw." |
| 10 | Region "History": "Worked 2 of the studio's projects. Last touch 17 October 2026, text, logistics." |
| 11 | A "Send a text" act, enabled, with the consequence sentence above it |
| 12 | No act anywhere carries the `disabled` attribute |

### 5.3 `#state-company`

| # | Must be visible |
|---|---|
| 1 | Header: 42px rounded square "NE", "Northgate Electric" in `.t-d3`, "Electrical sub · 1 person · 2 projects · warranty through 21 Nov 2026" |
| 2 | Region "Crew & designations": "Dana Kowalski · owner-operator · paperwork contact · signer · site contact · holds the trade licence", linking to her person card |
| 3 | Region "Paper", a table with header cells Type, Number, Issuer, Expires, State, Held by, Blocks, and four rows: COI general liability (`Lapsed`, expires 31 Mar 2026, blocks site access, payment, draw); W-9 (`Current`, on file 14 Apr 2025, blocks payment); MN electrical contractor licence (`Current`, expires 31 Dec 2027, blocks contract, permit); COI workers compensation (`Not on file`, blocks site access, draw) |
| 4 | Directly under the table, in words: "Site access, payment and the draw are held until a current certificate is on file." with a 2px `--terracotta-ink` leading rule. The Paper region's order is fixed at both widths: the table, then this leading-rule clause, then the consequence sentence, then the act row (R-P) |
| 5 | Consequence sentence, directly after the clause and before the acts: "This drafts a note to Northgate Electric's paperwork contact and files it for your review. Nothing is sent until you send it." Then the act row: secondary "Record a document", tertiary "Chase the renewal" |
| 6 | Region "Payee": "Remit to Northgate Electric", "Tax id ending 4417", "Retainage 10%" |
| 7 | Region "Jobs": "Okonkwo residence · Dana Kowalski · On the job" with the stage word, and a read-only line "Draw 1 waiver ledger, in the money book" as an inline act |
| 8 | Region "History": "First job 2025, the Lindqvist kitchen. Two projects. No verdict recorded." |
| 9 | No consent word and no reach word anywhere on the company card. A firm has neither |
| 10 | Paper region, every company card: a firm with no `documents` array in the fixture renders the Paper region with paper word `Not on file` and the act "Record a document". A firm whose only people are inspectors or lenders holds no compliance paper for the studio: its Paper region prints no table and no state word, only one line, "No paper is held for this firm.", and no act. Never "Not on file", never blocked, for that firm |

### 5.4 `#state-roster`

| # | Must be visible |
|---|---|
| 1 | Sheet head "Call sheet · Okonkwo residence" |
| 2 | Site access line at the head: "Key held by Ngozi Eze. Luis Ochoa controls the gate. Changed 16 Oct 2026." with an inline act "Open the site access card" |
| 3 | Vitals: "12 on the job this week · 5 reachable by text · 4 with accounts · 2 on paper" |
| 4 | Band "Studio side": Priya Natarajan (lead designer), Dale Whitcomb (bookkeeper, "Prepares only."), Leah Hartwell (principal, "Approves fee changes.") |
| 5 | Band "Client side": Adaeze Okonkwo with authority "Selections." and reach word `Account`; Chidi Okonkwo with authority "Signs money to $2,500." and reach word `On paper` |
| 6 | Band "On the job · this week": Tom Marrow, Erin Sato, Luis Ochoa, Joe Wozniak, Dana Kowalski, Ngozi Eze, Sam Rowe, all with stage word `On the job` |
| 7 | Dana Kowalski's roster row carries the held clause "Site access held. Northgate Electric's insurance lapsed 31 March 2026." with a 2px `--terracotta-ink` leading rule, and it is a clause in words, never a badge |
| 8 | Band "On the job · later": Pete Rusk (9 Nov 2026), Carol Nystrom (2 Nov 2026), Ray Thao (16 Nov 2026), Rosa Delgado and Frank Bauer (11 Jan 2027), Jim Lindgren and Kelly Marsh (1 Feb 2027), Ingrid Halvorsen (5 Apr 2027), Amara Osei (4 May 2027), Owen Ashby (7 Jun 2027), Nadia Brooks (16 Aug 2027), Jonah Feld (13 Sep 2027), all with stage word `Awarded` |
| 9 | Band "Bidding", visually separate from the crew bands: "Rivera Finishes · paint · Asked 28 September 2026. Due 5 October 2026." with stage word `No response` (`--ink-faint`). One row is correct |
| 10 | Band "Done": "Granite North · countertop fabrication · Off the job 2 October 2026. The slab program went to Stonehaven Tile Gallery." with stage word `Off the job` |
| 11 | Every row carries a reach word and a `tel:` link where a phone exists |
| 12 | Frank Bauer's row shows no phone and carries the clause "Do not contact directly. Write Rosa Delgado instead." printing Rosa Delgado's email and her office phone as a `tel:` link — the same routed-contact rule as §5.1 #10: email if present, then the office phone tel-linked, never a bare phone string |
| 13 | One row is unfolded (Dana Kowalski), showing phone, consent with source and date, and the acts Text, Copy field link, Show to client, Close this seat. The unfold trigger carries `aria-expanded` and `aria-controls` pointing at the panel's `id` |
| 14 | The word "Remove" appears nowhere. Closing is "Close this seat" |

### 5.5 `#state-add`

| # | Must be visible |
|---|---|
| 1 | Eyebrow "ADD · TO YOUR ROSTER", title "Bring someone in", dateline "Add sheet, mid-flow, 13 October 2026" (dateline in the state bar only if the page has no room; otherwise under the title in `.t-meta`) |
| 2 | Kind switch, `role="group"`, eight words: a client, a household member, a maker, a GC, a sub, an installer, a receiver, someone else. "a sub" pressed |
| 3 | Field "PROJECT" with the value "Okonkwo residence" |
| 4 | Field "FULL NAME" with the value "Joe Wozniak" |
| 5 | Field "COMPANY" with the value "Cedar & Iron Framing" |
| 6 | Field "TRADE" with the value "carpentry / framing" |
| 7 | Channels block: a typed row "MOBILE" holding "(612) 555-0118", and a typed row "EMAIL" left empty. The empty email row shows no error and no placeholder |
| 8 | Contact rule field, filled: "Text only. No working email." |
| 9 | Checkbox, checked: "They gave prior express consent for text updates" |
| 10 | Select "HOW CONSENT WAS GIVEN" set to "verbal" |
| 11 | Prose field "WHERE AND WHEN THEY AGREED" holding "Recorded by Priya at the site kickoff, 13 October 2026." |
| 12 | Every field carries a visible `.t-head` label above it. The string `placeholder=` appears nowhere in the file |
| 13 | Consequence sentence directly above the terminal act: "Adding Joe Wozniak puts him on the Okonkwo residence Call Sheet and opens a field link for the framing window. It never opens billing or the agreement." |
| 14 | Terminal act, charcoal ground, Inter 500 16px sentence case: "Add to the roster" |
| 15 | A line beneath the consent block: "He is invited, not consenting, until he replies YES." |
| 16 | Authority field, both branches, both files: when the source engagement carries authority, print the note "Defaulted from the agreement. Confirm it, or write a different one." with the act "Confirm from the agreement". When it does not (Joe Wozniak's case here, added fresh with no source engagement), print "Nothing defaulted from the agreement." with the act "Record the authority" |

### 5.6 `#state-access`

| # | Must be visible |
|---|---|
| 1 | Head "Site access · Okonkwo residence" and "4412 Fremont Ave S, Minneapolis MN 55409" |
| 2 | Region "Who to call first", in this order, each a `tel:` link: "Luis Ochoa, superintendent, (612) 555-0109"; "Chidi Okonkwo, owner, (612) 555-0105"; "Sam Rowe, architect, (612) 555-0110" |
| 3 | Region "The way in": "Lockbox, version 3. The code is held off Patina; ask Luis Ochoa." and "Luis Ochoa controls the gate." No code digits appear anywhere |
| 4 | Region "Key holder": "Ngozi Eze holds a key. Text only, (612) 555-0106." with consent word `Texting` |
| 5 | Region "Hours": "Weekdays 07:00 to 17:00. No Saturday work before 09:00." |
| 6 | Region "Receiving": "Ngozi Eze receives deliveries. Stage in the detached garage." |
| 7 | Region "Who was told", newest first: "Lockbox changed to version 3. 16 October 2026, by Priya Natarajan. Told: Luis Ochoa, Ngozi Eze, Joe Wozniak, Dana Kowalski."; "Site hours set for the demo phase. 12 October 2026, by Priya Natarajan. Told: Tom Marrow, Erin Sato, Luis Ochoa." |
| 8 | One secondary act, "Log who was told", opening an inline band with a text field and a confirm, never a modal |
| 9 | A line under the head: "Studio only. This card never reaches a client page." |

### 5.7 `#state-pick`, "Bring forward"

Acceptance (identical facts both widths):

| # | Must be visible |
|---|---|
| 1 | State bar button reads "Bring forward"; role="status" announces "Bring forward" |
| 2 | The Okonkwo Call Sheet head remains visible behind/above; the picker is a DocSheet region titled "From the rolodex" with the eyebrow "OKONKWO RESIDENCE". The site-access summary line "Key held by Ngozi Eze. Luis Ochoa controls the gate. Changed 16 Oct 2026." prints under the Call Sheet heading, at both widths (R-U) |
| 3 | Search field with the value "Lindqvist" and the line "4 of 5 from the Lindqvist kitchen selected" |
| 4 | Five mini rows in this order, each with a checkbox (drawn per §8 #5, no tick glyph), the 34px circle, name, firm and trade, one history line, and its words: <br>a. Dana Kowalski · Northgate Electric · electrical · selected · history "Worked 1 prior project, Lindqvist kitchen, closed 2025" · paper word "Lapsed" · reach "Field link" · consent "Texting". <br>b. Pete Rusk · Rusk Mechanical · plumbing · selected · same history line · consent "Opted out" with the line "Opted out by text 3 Dec 2025, on the Lindqvist kitchen." · reach "On paper". <br>c. Ingrid Halvorsen · Halvorsen Cabinet Works · cabinetry · selected · same history line · rule clause "Email only. No cell for work." · consent "Not asked" · reach "On paper". <br>d. Claire Bissett · Stonehaven Tile Gallery · tile & stone · selected · line "Saved twice, one firm." · reach "On paper". <br>e. Ben Ostrom · Ostrom Builders · general contracting · not selected · same history line · reach "On paper". No verdict on any row (PR-i) |
| 5 | A pane beside the list (1440) or below it (390) headed "What travels": identity · typed channels · contact rule · consent by channel value · document expiries · one history line. Then "What stays behind": 2025 pricing · 2025 project notes · show to client |
| 6 | The act row comes first, at both widths: terminal act label "Add four to the roster"; secondary act "Put back". Both checkboxes (row 4) and "Put back" are live — never `aria-disabled`, never the `disabled` attribute — and both acts are reachable by Tab; aria-live announces nothing on load |
| 7 | Consequence sentence directly under the act row, at both widths, exactly: "Adds four seats to the Okonkwo residence. Pete Rusk arrives opted out of texting. Northgate Electric's insurance lapsed 31 Mar 2026." |
| 8 | Forbidden here as everywhere: schema words, caveats, any name outside §3 |
| 9 | 390: full width, rows stacked, pane after the list, the act and its sentence in flow |

### 5.8 Shared sentences and clauses

These wordings are identical at both widths, wherever the naming call site renders them:

| Rule | Statement |
|---|---|
| Consent sentence (R-Q) | One wording everywhere: "<Source> consent, <d Mon yyyy>, on the <project>." Examples: "Written consent, 2 May 2025, on the Lindqvist kitchen."; "Verbal consent, 13 Oct 2026, on the Okonkwo residence."; "Opted out by text, 3 Dec 2025, on the Lindqvist kitchen." |
| Blocked clause (R-S) | A blocked rule clause prints wherever a rule is shown — Directory row, roster row, person card, company card crew line — whenever the rule blocks, with the routed line ("Write Rosa Delgado instead." pattern, see R-L below) appended only when a route exists. Identical at both widths |
| Opted-out note (R-T) | An opted-out note prints on a collapsed roster row, not only inside its unfold, at both widths — a sub the studio may not text must be visible at a glance |
| Bid note (R-R) | A roster row with a bid history prints it at both widths, e.g. "Quoted 2 October 2026. Selected 9 October 2026." |
| Routed line (R-L) | "Write Rosa Delgado instead." followed by her email and her office phone as a `tel:` link prints on the Directory row, the roster row, and the company card, at both widths |

---

## 6. Width rules

### 6.1 `people-room-1440.html`

| Rule | Statement |
|---|---|
| Band | One wrapper, `max-width: 1200px; margin: 0 auto; padding: 48px 24px;`. The 1440 viewport shows it centred with paper either side |
| Row measure | The row spans the band's content width. Fixed columns: 34px avatar, 16px gap, flexible identity block (min 320px), 12px gaps, three `.word` columns at 108px each (reach, consent, paper — stage is never a row column, only on the seat line beneath), 16px gap, 16px chevron |
| Company row | 42px rounded square, then the same grammar, but only two word columns (paper, payee marker) |
| Cards | Person card and company card at `max-width: 720px`, centred in the band. Region seams `1px solid var(--hairline-strong)`, 48px apart, 24px padding inside |
| Call Sheet | 760px wide, centred, to stand for the DocSheet. Two word columns on a row (reach, stage); consent and paper move into the unfold |
| Prose | Any paragraph caps at 65ch. Consequence sentences cap at 56ch |
| Overflow | `document.documentElement.scrollWidth` must not exceed `clientWidth` |

### 6.2 `people-room-390.html`

| Rule | Statement |
|---|---|
| Band | One wrapper at `width: 100%; padding: 24px 16px;`. No horizontal scroll at 390 |
| Row | Two lines that never fold: name (wraps, never truncates) on line 1; reach · consent · paper as three plain inline words (no border, separated by a middle dot), plus the `tel:` link, on line 2 — on EVERY person row, folded or not (R-M). Everything else moves into the unfold or the card |
| Row order at 390 | avatar 34px, name, firm and trade, rule clause when one exists, then line 2 |
| Word columns | At 390 a person row prints reach, consent and paper as plain inline words on line 2 per the Row rule above, never as bordered columns — §5.1 #7's bordered columns apply at 1440 only (R-M). Stage prints only on the seat line inside the unfold, never on line 2. A company row keeps its two bordered word columns (paper, payee marker), unchanged |
| Targets | The row's open control and the `tel:` link are two sibling controls, each at least 44x44, at least 8px apart. An `<a>` never nests inside a `<button>` |
| Cards | One column, full width. Tables become label-over-value stacks; a table never scrolls sideways |
| Site access | Order: Who to call first, The way in, Key holder, Hours, Receiving, Who was told. Emergency lines sort above the lockbox line |
| Site access target | The whole who-to-call line is the `tel:` target at 390; at 1440 only the digits are linked. At 390 that line is at least 44px tall. A deliberate mobile adaptation, not a parity finding (R-X) |
| Call Sheet | Full width, bands stacked, one row per person, unfold in place |
| Add sheet | Full width, fields stacked, the terminal act and its consequence sentence in flow, never docked over the sentence |
| Overflow | `document.documentElement.scrollWidth` must not exceed `clientWidth` |

---

## 7. Keyboard and assistive

| # | Rule |
|---|---|
| 1 | Every act is reachable by Tab in reading order, and operable by Enter and Space |
| 2 | Focus ring on every act and field: `outline: 2px solid var(--clay-ink); outline-offset: 2px`. Drawn with `outline`, never `border`, so nothing moves |
| 3 | A page-level `<p role="status" aria-live="polite">` carries state-change announcements, consent changes and grant changes. Exactly one live region per file |
| 4 | A blocked act uses `aria-disabled="true"` plus `aria-describedby` pointing at the visible reason. The attribute `disabled` must not appear in either file |
| 5 | Every disclosure (a row's seats, a row's unfold, an inline confirm) pairs `aria-expanded` on the trigger with `aria-controls` pointing at the panel's real `id` |
| 6 | A Directory row is a container, not a button. Inside it: an open-person `<button>` whose accessible name is the person's name and role summary only; a separate `<a href="tel:...">`; a separate seats-disclosure `<button>` whose panel is a `<ul>` of focusable seat rows |
| 7 | Every chip row is wrapped in `role="group"` with an `aria-label` naming what it narrows |
| 8 | Every chip carries `aria-pressed` |
| 9 | No state is carried by colour alone. Every `.word` prints its word; its border pigment and its word always agree |
| 10 | Inline SVG that carries meaning gets a `<title>`; decorative SVG gets `aria-hidden="true"` |
| 11 | Headings run `h1` then `h2` then `h3`, in order, one `h1` per file |
| 12 | `@media (prefers-reduced-motion: reduce)` zeroes animation and transition durations |
| 13 | These are design specimens, not a prototype of writes. The acts that would write to the studio's book — Edit the rule, Revoke, Send a text, Record a document, Chase the renewal, Text, Copy field link, Show to client, Close this seat, Add four to the roster, Add to the roster, Save this note — are deliberately inert. They stay enabled, focusable buttons beside their consequence sentences: no `aria-disabled`, no caveat on the face |

---

## 8. Forbidden

| # | Never |
|---|---|
| 1 | Lorem ipsum, placeholder names, "example", "sample", "TBD", "Lorem" |
| 2 | Any person, firm, place or phone not in §3's JSON |
| 3 | Any string in a language other than the room's current voice: plain, present-tense, sentence-case English, the studio's words. No schema words on a face: never `client_rep`, `party_kind`, `sms_consent_status`, `studio_contact_id`, `project_parties`, `PD-n`, `CRM-n`, `G-n`, `F-nn`, `E1`..`E15` |
| 4 | The words AI, CRM, dashboard, wizard, badge, pill, chip, modal, toast, spinner, anywhere on a face |
| 5 | `box-shadow`, `text-overflow`, `opacity` used to express a state, a `disabled` attribute, a bare colour dot, a fully rounded pill, a ✓ glyph, a spinner, a green success fill |
| 6 | Any external resource other than the two `fonts.googleapis.com` / `fonts.gstatic.com` preconnects and the one Google Fonts stylesheet |
| 7 | A hex literal outside the pasted token block |
| 8 | A caveat word inside the mocked page. The state bar is the only place one may appear |
| 9 | A live gate code, lockbox code, or alarm code digit anywhere |
| 10 | A filled state pigment. Every `.word` is a border plus text on a transparent or paper ground |

---

## 9. Render

Run from anywhere. Output lands in `.../people-room-crm-2026-09-11/shots/`. Use `render.mjs` (its `playwrightModulePath` already points at the workspace's Playwright install). Chromium fails inside a sandboxed shell with a Mach port bootstrap error; run render commands with the sandbox disabled. Use `--name people-room-1440` or `--name people-room-390` (NOT the shared `--name people-room`) so the two builders' console json files do not overwrite each other; plate file names then become `people-room-<width>-state-<x>-<width>.png`, which is fine.

Builder A, 1440:

```bash
node /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-crm/artifacts/people-room-crm-2026-09-11/tools/render.mjs \
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-crm/artifacts/people-room-crm-2026-09-11/specimens/people-room-1440.html \
  --out /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-crm/artifacts/people-room-crm-2026-09-11/shots \
  --name people-room-1440 \
  --widths 1440 \
  --hashes state-directory,state-person,state-company,state-roster,state-pick,state-add,state-access \
  --console
```

Builder B, 390:

```bash
node /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-crm/artifacts/people-room-crm-2026-09-11/tools/render.mjs \
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-crm/artifacts/people-room-crm-2026-09-11/specimens/people-room-390.html \
  --out /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-crm/artifacts/people-room-crm-2026-09-11/shots \
  --name people-room-390 \
  --widths 390 \
  --hashes state-directory,state-person,state-company,state-roster,state-pick,state-add,state-access \
  --console
```

Expected file names, fourteen in all:

| State | 1440 | 390 |
|---|---|---|
| Directory | `people-room-1440-state-directory-1440.png` | `people-room-390-state-directory-390.png` |
| Person card | `people-room-1440-state-person-1440.png` | `people-room-390-state-person-390.png` |
| Company card | `people-room-1440-state-company-1440.png` | `people-room-390-state-company-390.png` |
| Project roster | `people-room-1440-state-roster-1440.png` | `people-room-390-state-roster-390.png` |
| Bring forward | `people-room-1440-state-pick-1440.png` | `people-room-390-state-pick-390.png` |
| Add sheet | `people-room-1440-state-add-1440.png` | `people-room-390-state-add-390.png` |
| Site access | `people-room-1440-state-access-1440.png` | `people-room-390-state-access-390.png` |

The tool also writes `people-room-console.json` beside them. Each builder's run must report zero errors, zero warnings, and `horizontalOverflow: false` on every capture. The tool navigates directly to each hash and does not click, so the page must set its state from `location.hash` at load.

---

## 10. Done

| # | Check before you hand back |
|---|---|
| 1 | The file's last line is exactly `<!-- specimen-complete -->` |
| 2 | `grep -c 'box-shadow\|text-overflow\|placeholder=\| disabled' <file>` returns 0 |
| 3 | Every string in §5's acceptance list for all six states appears on the face, spelled exactly |
| 4 | Every name, firm and phone on the face is in §3's JSON |
| 5 | The render command ran clean: fourteen names for the pair, zero errors, zero warnings, no horizontal overflow |
| 6 | The token block and the class fragment are byte for byte as pasted in §2, plus the one appended `}` |
