Reference captures of third-party sites for internal design study only; not for redistribution.

# House Issue v2: inspiration sheet (SQ-1568)

Captured 2026-10-21 by `capture.mjs` (headless Chromium, Playwright 1.58.2). Raw data is in `measurements/<site>.json` and renders are in `_renders/`. Numbers come from computed styles, the sites' CSS files, or a 48-column `elementsFromPoint` grid. Anything read off a picture is marked "visual".

| Site | Live URL | Captured |
|---|---|---|
| Fitosauna (Qream) | https://fitosauna.com/ | Mobile 0/1/2. **Desktop blocked**: HTTP 403 on headless-shell, new-headless Chromium and Chrome (three attempts). The iPhone user agent was served. The desktop record is the Awwwards gallery image, a laptop mock-up of the 1440 hero. |
| ERA Residence (The First The Last) | https://www.era-residence.com/ | Desktop 0/1/2/3/5 + full, mobile 0/1/2. Awwwards exposed no gallery asset. |
| STANZZA design (ADELT) | https://stanzza.design/ | Desktop 0/1/2/3/5 + full, mobile 0/1/2, Awwwards gallery 1. |

Awwwards answered 403 to headless Chromium, Chrome and curl. The live and gallery URLs were read from the page text with WebFetch and are pinned in `capture.mjs`.

**Notes on the captures.**
- Reduced motion was on for every served page.
- Cookie notices were accepted before measuring.
- Actual scroll offsets: Stanzza 0/910/1732/2726/4417; Era 0/905/1722/2734/4543; Fitosauna mobile 1/801/1601.
- The full-page captures are weak. Scroll reveals do not fire in them, and Era's pinned scenes collapse (10,901 px captured of 24,605). Both were downscaled to fit 400 KB: Stanzza to 1224 px wide, Era to 638 px.
- Image share counts any image layer under a sample point. Era's flat colour bands sit over a full-viewport image layer, so its 100% overstates what reads as photograph.

---

## 1. STANZZA design

**Arrival.**
- **Desktop.** One full-bleed hero (video still of an interior, figure at a window) covers **98%** of the screen. The first words are the 12 px nav labels at y=37. The headline "Composed residential interiors" (72 px) is centred at x=452, y=598, with a script kicker above it and a 24 px subline at y=748.
- **390 px.** Image share is **97%**. The headline is 48 px at x=24, y=379.
- **Nav.** A fixed `header`, 92 px tall (80 px on mobile), with a transparent background. It holds MENU on a 24%-opacity plate, the centred wordmark and an outlined "Request a call". On scroll down it takes `is-hide` and moves to top −101 px.

**Image rhythm.**
- **Desktop, first five screens.** Hero at 900 px (ratio 1.58) → 1 word → a scattered collage of small linked images (188–415 px tall; ratios 0.71, 0.55, 0.83) → 31 words → one image at 0.71 → 50 words → a project strip of 1.59 slides.
- **The project strip.** Its image grows from 928×584 on an olive field to 1440×900 full bleed by screen 5.
- **Totals.** 3 of 38 images are full bleed.
- **Mobile.** Hero 860 px → 52 words → a row of 5 cards at 0.73 → 23 words → 5 cards at 0.86 → 58 words.

**Typography.**
- **Display.** Instrument Serif 400, 72 px, line-height 0.88. Section titles are 56 px.
- **Body.** Helioscond (a condensed grotesk) 18 px, line-height 1.32, letter-spacing −0.18 px. Lead lines are 24 px.
- **Labels.** 12 px uppercase, letter-spacing 1.92 px (0.16 em). Script accents use Katherine Plus.
- **Line length.** 338–400 px, about 44 characters.
- **Mobile.** Display 48 px, body 16 px (about 58 characters), labels **9 px**.

**Grid.**
- **Containers.** CSS max-widths are 1440 and 1920 px. Text blocks are capped at 400–540 px.
- **Gutters.** 24 px at 1440, with visible vertical hairlines at x=24/473/953/1401 (three columns of 449–480 px). 16 px at 390.

**Colour.**
- **Ground and ink.** Ground `#f4f3eb`, ink `#1e1e1e`, secondary ink `#8c8c8c`.
- **Accent.** The olive project field, sampled `#778051` → `#555e31`.
- **Text over image.** Uses a gradient scrim, `linear-gradient(rgba(15,15,15,0) 60%, rgba(15,15,15,.4))`.

**Imagery as navigation.**
- **Linked images.** 8 images are links (project cards).
- **Project strip.** It shows "01/05" plus a progress rule.
- **Facts beside images.** 12 px labels ("PROJECT EXECUTED", "AREA", "CITY & COUNTRY") over 24 px values ("In 62 days", "150 m²", "Barcelona, Spain").
- **Hover.** 42 `:hover` rules: 7 change opacity, none transform.

**Motion.**
- **Preloader.** Present: `div.preloader`, z-index 1000, `#fffbf5` at +400 ms. Reduced motion sets `preloader-skip`. The Awwwards image records its thumbnail-grid state.
- **Scroll.** Lenis smooth scroll. GSAP 3.15 ScrollTrigger has 25 triggers, all scrubbed, 0 pinned. Five sticky blocks; the collage drifts at different rates (parallax).
- **Other motion.** A Swiper slider and a 20 s linear marquee.
- **Transitions.** 0.3–0.35 s `ease-out` and `cubic-bezier(.32,.72,0,1)`.
- **Reduced motion.** No `prefers-reduced-motion` query in the CSS.

**At 390.** Columns stack into a single column with a 16 px gutter. The collage becomes card rows. The CTA is replaced by the logo roundel. 41 of 49 links/buttons are under 44 px tall.

---

## 2. ERA Residence

**Arrival.**
- **Desktop.** One full-bleed architectural render (sky, pool terrace, figures) covers **100%** of the screen. The first live words are the 8.1 px "BOOK A CALL / CONTACT" at x=1312, y=116.
- **Wordmark.** A lettered lockup about 475 px wide (visual; not live text).
- **Flanking line.** "A PLACE … TO RETURN TO" flanks a BY DAY / BY NIGHT switch at y=472.
- **No header element.** The furniture is a roundel logo top-left (110 px), an underlined "SELECT AN APARTMENT" top-right, and a vertical rail at x≈104. The rail carries a running counter (00 → 05 → 08 → 13 → 20) and "SCROLL ↓".
- **390 px.** Image share is 100%. "MENU ⋮" sits at 8.4 px, and a ring link reads "View available apartments" over the image.

**Image rhythm.**
- **Held hero.** The hero is `position: sticky` and holds for about 3.5 screens (1081 px wide, ratio 1.11 scrubbed toward 1.63).
- **Screen 3.** A sky `#b6cddb` arch rises over it carrying "THREE REASONS TO CHOOSE ERA" on a curve.
- **Screen 5.** A flat sky field with 16 words of centred body; a cropped image enters bottom-left.
- **Ratios.** Range 0.65 to 2.0, plus a 5.15 panorama. 6 of 35 images are full bleed.
- **Mobile.** Hero 971 px (0.46) → 20 words → a 2:1 image at 345 px, inside the measure → 36 words → two full-bleed squares → 23 words.

**Typography.**
- **Heads.** ambroise-francois-std uppercase (condensed didone), 56.7 px, line-height 0.88, letter-spacing −0.91 px. Subheads are 36 px. The script sloop-script-three is used for accents.
- **Body.** Maison Neue Extended **11.7 px**, line-height 16.1 px, in a 533 px column (about 74 characters).
- **Labels.** 9.9 px bold uppercase. Nav micro-labels are **8.1 px**, letter-spacing 2.59 px (0.32 em).
- **Mobile.** Display 90 px, body 12.2 px (38–49 characters).

**Grid.** Widths are in vw (96vw, 82.3vw); there is no px max-width. Body copy is a centred 533 px column. Furniture sits about 50 px in from each edge. The mobile gutter is 23 px.

**Colour.**
- **Ground and ink.** Ground `#f3f3ec`, ink navy `#17233b`.
- **Bands.** Plum `#340c24`, sky `#b6cddb` and ground alternate. Plum is the accent.
- **Text over image.** Sits straight on the render with no scrim or plate: 0 tinted layers under any over-image text.

**Imagery as navigation.**
- **On the image.** About 32 px hotspot rings on the render, and the ring link to apartments.
- **Galleries.** "‹ 1 —— 2 ›" pagers.
- **Day/night switch.** Restyles the whole page.
- **Rail counter.** A running index. 0 images are wrapped in links.

**Motion.**
- **Preloader.** None found at +400 ms.
- **Libraries.** Lenis; GSAP 3.15 with ScrollTrigger (194 triggers, 28 scrubbed), SplitText, CustomEase, Lottie; Barba page transitions.
- **Pinned scenes.** 3 sticky scenes.
- **Transitions.** 400–800 ms on `cubic-bezier(0.25,1,0.5,1)` and `cubic-bezier(0.76,0,0.24,1)`. A 32 s marquee.
- **Reduced motion.** No `prefers-reduced-motion` query.

**At 390.** The rail and nav collapse to "MENU ⋮". The hero recrops to 0.46 portrait. Galleries become full-bleed squares. 11 of 17 targets are under 44 px.

---

## 3. Fitosauna (mobile live; desktop from the Awwwards image)

**Arrival.**
- **Desktop (mock-up).** A full-bleed product photograph (timber sauna, plaster wall, leaf shadow). The headline "Relieve stress at home" sits top-left. CSS declares `font-size: 6.11vw`, which is 88 px at 1440; a live desktop render could not confirm it. A 4-line lead sits bottom-left and a showreel thumbnail bottom-right. The header is boxed: "MENU | EN", wordmark, "GET A CONSULTATION →".
- **390 px.** Image share is **100%**. The headline is Archivo 500 at 48 px, at x=16, y=92. Below it, a 12 px outlined "CHOOSE RELAXATION" with a 43 px circular arrow.
- **Mobile header.** Fixed, 68 px tall, transparent; it turns `rgba(252,246,236,.16)` after scroll. Cart badge "0", WhatsApp, EN and MENU sit in boxed buttons about 35 px tall.

**Image rhythm (mobile).** Hero 844 px (0.46) → a second full-bleed portrait, 1182 px (0.33), pinned while three 32 px statements change over it → 20 words → a strip of 7 cards at 1.77 → 68 words. 11 of 30 images are full bleed.

**Typography.**
- **Display.** Archivo 500, 48 px, letter-spacing −0.04 em, line-height 0.84. Statements are 32 px.
- **Labels.** Archivo Narrow 600, 12 px uppercase, letter-spacing 0.04 em.
- **Body.** 14–16 px at 286–300 px wide (37–43 characters).
- **Fluid sizes.** Includes 6.11 vw, 3.889 vw and 1.667 vw.

**Grid.** Max-width 87rem (1392 px). Breakpoints at 768, 1024 and 1440. 16 px mobile gutter.

**Colour.**
- **Ground, ink, accent.** Ground `#fcf6ec`, ink `#27221a`. The accent is gold `#d2942d`, used for inline glyphs inside statements.
- **Text over image.** Sits on a visibly darkened frame (sampled `#6f5e4a`). The probe found no tinted element, so the tint lives in a pseudo-element or in the image.

**Imagery as navigation.**
- **Cards.** Product cards in a Swiper strip.
- **Numerals.** 14 px step numerals ("01").
- **Hover.** 395 `:hover` rules: 37 transform (image scale), 41 change opacity.

**Motion.**
- **Preloader.** None under reduced motion.
- **Scroll.** GSAP 3.14.1 ScrollTrigger: 19 triggers, **5 pinned**, 7 scrubbed. No smooth-scroll library.
- **Keyframes.** A ticker, a marquee and a 6 s dot cycle.
- **Transitions.** Mostly 0.3 s, on `cubic-bezier(0.16,1,0.3,1)` and `(0.22,1,0.36,1)`.
- **Reduced motion.** 1 `prefers-reduced-motion` query.

**At 390.** The product image moves under the headline. The header becomes four boxed buttons, and the pinned scenes stay. 41 of 46 targets are under 44 px.

---

## 4. Shared moves, ranked by visual impact

1. **The first screen is one photograph, edge to edge.** Image share 98/100/100% at 1440 (Fitosauna from the mock-up) and 97/100/100% at 390.
2. **The first headline sits in the photograph, in paper-coloured ink.** Stanzza 72 px over a 0→40% scrim; Era's lockup on sky with no tint; Fitosauna 48 px on a darkened frame.
3. **Display at three to five times body.** 72/18 = 4.0×, 56.7/11.7 = 4.8×, 48/14 = 3.4×. Display line-height 0.84–0.88.
4. **One image held across several screens.** Era holds about 3.5 screens. Fitosauna's portrait holds three statements. Stanzza's project image grows from 928 px wide to full bleed.
5. **Short runs of words between images.** 1/31/50 and 52/23/58 (Stanzza), 20/36/23 (Era mobile), 20/68 (Fitosauna). No run exceeds 70 words.
6. **Warm paper ground, warm near-black ink.** `#f4f3eb`/`#1e1e1e`, `#f3f3ec`/`#17233b`, `#fcf6ec`/`#27221a`.
7. **One accent, taken from the photography.** Olive `#778051`, plum `#340c24`, gold `#d2942d`. Each is used as a field or a glyph, not as a button colour.
8. **Small uppercase tracked labels are the whole interface voice.** 12 px at 0.16 em; 8.1–9.9 px at up to 0.32 em; 12 px at 0.04 em.
9. **Navigation reduced to furniture.** One menu control, a wordmark and one act. Headers are transparent, hidden or absent.
10. **Mixed aspect ratios, with portrait recrops on phones.** Desktop 1.58–2.0, cards 0.71–0.86, phone heroes 0.33–0.48.
11. **Facts as label/value pairs next to the image.** Stanzza 12 px over 24 px; Era's locale labels; Fitosauna's spec line.
12. **Choreographed scroll.** GSAP ScrollTrigger on all three (25/194/19 triggers), Lenis on two, reduced-motion CSS nearly absent (0/0/1 queries).

## 5. Borrow

These are compatible with invoices, approvals, the designer's letter, anchors, and the 16 px body / ≥15 px money / 44 px target floors.

- **B1. A photograph owns the first screen, full width.** It must be job-owned, ranked per R142, and captioned what · whose · when. Whether it may sit above the first money or approval act is open ruling Q1, and full-measure photography is C2. This list does not settle either.
- **B2. Display near 4× body.** With 16 px body, that is 64–72 px, inside the brief's `clamp(34px, 5.2vw, 72px)`. Keep line-height at Playfair's 1.0 floor.
- **B3. A held image, made by height and stillness, not pinning.** One tall plate per chapter, about one viewport on a phone, using portrait crops of 0.33–0.48.
- **B4. 20–70 words between images.** A paragraph, a plate, a paragraph suits the designer's letter.
- **B5. Warm paper, warm ink, one accent.** Patina's paper, ink and forest already fit. The job palette stays on the 4 px plate rule.
- **B6. Tracked uppercase eyebrows.** Use 0.04–0.16 em tracking at the brief's eyebrow size, never the measured 8–9 px. Money, dates and names stay ≥15 px in sentence case.
- **B7. Label/value pairs beside a plate.** Item, maker, date; or an approval's choice and its consequence. Values are words and dates, never counts or percentages.
- **B8. Hairline structure.** Stanzza's 1 px column rules map to the brief's hairline `#E8E3DB`.
- **B9. Navigation as a few words in the top band.** That is the link row (Invoices · Approvals · Progress · Updates · Documents · Contact), in the page flow, each anchor a 44 px target.
- **B10. The whole image as the link.** A plate linking to its approval or invoice anchor gives a target far larger than 44 px.
- **B11. The settle easings only.** Use `cubic-bezier(0.16,1,0.3,1)` or `(0.25,1,0.5,1)` at 300–400 ms for the brief's on-mount image settle.

## 6. Refuse

- **R1. Preloader.** Stanzza's `div.preloader`. Brief §8: no preloader.
- **R2. Smooth-scroll hijack, pinned scenes, scrubbed parallax.** Lenis on Stanzza and Era; Fitosauna's 5 pinned scenes; Stanzza's drifting collage. Brief §8 and Q3 rule them out, and they break anchors and 200% zoom.
- **R3. Carousels, sliders, marquees.** Stanzza's "01/05" Swiper, Era's paged galleries, Fitosauna's card strip, and the 20 s and 32 s marquees. Brief: no carousels, no auto-advance.
- **R4. Counters and denominators.** "01/05" with a progress rule, Era's 00–20 rail, the cart "0" badge, "In 62 days". V8/V9: no counts, percentages, denominators or progress bars.
- **R5. Type on photographs over a scrim or tint.** Stanzza's `rgba(15,15,15,.4)` gradient, Fitosauna's darkened frame, translucent plates. The brief allows no gradients and no translucency, and 4.5:1 contrast cannot be guaranteed on job photographs. Captions sit beside or under the plate; concept-render labels are the R142 exception.
- **R6. Sub-floor sizes.** Body 11.7–14 px, labels 8.1–9.9 px, and 41 of 49, 11 of 17 and 41 of 46 targets under 44 px. These fail 16 px body, ≥15 px money and 44 px targets.
- **R7. Fixed, hide-on-scroll or translucent headers.** The spec forbids a fixed header, tabs or a bottom bar on the homeowner page.
- **R8. Video heroes.** Awwwards lists Stanzza's "Hero page video". Brief: no video.
- **R9. Renders and lifestyle people at hero scale.** Era's hero is a render of an unbuilt building; Stanzza and Fitosauna use posed figures. R142: no render at hero scale, never stock, job-owned imagery only.
- **R10. Sales calls to action and commerce furniture.** "Request a call", "Book a call", "Select an apartment", "Choose relaxation", the cart, WhatsApp. Brand voice forbids sales CTAs.
- **R11. Script faces and lettered lockups.** Era's sloop-script, Stanzza's Katherine Plus. The brief fixes the type roles (§3.2), and a lettered lockup is not live text.

## 7. Why these read as "a professional website" and not "a portal"

Each page gives its first 900 px, and most of every later screen, to one photograph. It speaks in two registers only: a very large display line and very small tracked labels, with almost nothing at the middle sizes where portal UI lives. There are no panels, shadowed cards, tab bars, tables, status chips or sidebars. Image edges, hairlines and whitespace carry the structure, and navigation is a few words. The paper and ink are warm, and the single accent comes out of the pictures, so each page looks art-directed for one subject rather than themed for many users. Words arrive in short runs between plates, like a magazine spread. That quality carries over to the House Issue without the scroll theatre, scrims, carousels and sub-floor type these sites also use, all of which the Patina authority already rules out.
