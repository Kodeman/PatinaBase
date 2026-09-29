# Arrival engine: port spec for the designer portal

Recon, read-only, 2026-09-27. The source of truth is the mockup engine at main `8bd0d1d7f`. Paths are relative to `artifacts/designer-portal-motion-2026-09-25/design/`. `JS` means `cinematic/arrival.js` and `CSS` means `cinematic/arrival.css`. `ORC` is `verify/cinematic-oracle.mjs`, `BRW` is `verify/cinematic-browser.mjs`, and `SQ-333` is the "ARRIVAL v3 MERGED CONTRACT" comment (c_mujycadj_257cd0).

## 1. Briefing input schema (as `select()` consumes it)

```ts
type Day = string;                 // 'YYYY-MM-DD'. day() reads the first 10 chars as a UTC date (JS:52)
type Moment = string | number;     // 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM' (UTC), or epoch ms (JS:54)
type NeedKind = 'overdue_decision'|'finish_approval'|'client_approval'|'essentials'|'proposal_draft'
  |'order_send'|'booking'|'delivery_window'|'sample'|'install_date'|'care_note'|(string & {}); // unknown kinds rank 99 (JS:62,71)
interface Need {
  kind: NeedKind; owner: 'studio'|'client'|'maker';  // a teammate is owner 'studio' with who ≠ viewer (JS:66-70)
  who?: string; ask?: string;        // client form "Waiting on <who> to <ask>" (JS:89)
  dueOn?: Day|null; since?: Day;     // oldest = dueOn ?? since ?? ∞ (JS:72)
  line: string;                      // the headline sentence; the page must print it (T3)
  brief?: string;                    // the Desk and pulse short form, else lc(stop(line)) (JS:168,109)
  act?: string|null; ball?: string;  // ball = the studio tail "; the workshop waits" (JS:93)
  custody?: string;                  // the maker's custody words (JS:90)
  section?: string;                  // R8 tie-break and landing section (JS:78)
  namesCustody?: boolean;            // F3 becomes needs[1].line or 'Nothing else is yours.' (JS:142)
  urgent?: boolean;                  // present in the fixtures, NEVER read by select() (grep: no use in JS)
}
interface Change { at: Moment; by: string; kind: 'decision'|'message'|'invoice'|'sms'|'pulse'|'hours'|'workshop_note'|(string&{}); text: string; need?: NeedKind }
interface Since { anchor?: Moment|null; first?: string; changes?: Change[]; anchorNote?: string /* fixture only */ }
interface Milestone { label: string; date: Day; fidelity: 'exact'|'band'; text?: string /* Desk R4 only */ }
interface DocumentBriefing { kind?: 'document'; today: Day; viewer: string;
  job: { name: string; stage: string; paused?: Day|null }; sections?: string[];
  position?: { text: string; fidelity: 'exact'|'band' }; needs?: Need[]; milestone?: Milestone|null; rest?: string; since?: Since }
interface DeskBriefing { kind: 'desk'; today: Day; viewer: string; studio: string; sections?: string[]; since?: Since;
  jobs: { name: string; stage: string; paused?: Day|null; needs?: Need[]; milestone?: Milestone|null }[] }
interface Card { kind: 'desk'|'document'; rule: 'R1'|'R2'|'R3'|'R4'|'R5'|'Desk'; place: string; headline: string;
  facts: string[]; act: string|null; act2: string|null; need: Need|null; warn: number; job?: string; headJob?: string; headLine?: string }
```
The card shape is at JS:128 and JS:180-186. The fixture shapes are at `cinematic/index.html:264-298` and `cinematic/document.html:306-328`. Timezone hazard: every date is compared as UTC midnight (JS:52-56). Production must pass `today` as the studio-local date, and it must pass anchors and changes in the same local wall-clock format.

### Selection, `select(inputs, today, viewer)` (JS:125-155): a pure function (ORC:515)
- **Sort** (JS:73-79): **band** (JS:66) comes first. Band 0 is the studio's (or a teammate's) need that is overdue, band 1 is the studio's need that is not overdue, band 2 is the client's, and band 3 is the maker's. Ties break by `NEED_RANK` (JS:62), then by the oldest date, then by the kind string, then by the `sections` index.
- **R1 paused** (JS:133-136) gives the headline `Paused since <Mon D>.` and the facts `Stopped in <stage>.`, the since line, and `At rest.`
- **R2/R5** use the head need `h` (JS:139-147). The headline is `h.line`. If `h` is overdue, the headline becomes `Overdue N days: <lc line>`, but only when that fits in 8 words or fewer. Otherwise the headline stays `h.line` and the overdue count moves into F3 (JS:118-123). The rule is R5 when `h` is overdue and R2 otherwise.
- **F1** is `position.text`, unless it is absent or `fidelity==='band'`. In that case F1 is `No dates fixed yet.` (JS:132).
- **F2** is the since line (JS:103-117):
  - With no anchor it reads `First visit: <first|opened by the studio>.`
  - Otherwise the engine keeps the changes that are strictly after the anchor, where `by ≠ viewer`, and whose kind is neither `hours` nor `workshop_note`.
  - It also adds a synthetic `pulse`, "<brief> fell overdue <when>", for each need whose due date passed after the anchor (Documents only; the Desk and R3/R4 pass no needs, see JS:153 and 171).
  - It picks the newest change on the head need. Failing that, it picks by `KIND_ORDER` decision › message › invoice › sms › pulse (JS:63) and then by newest.
  - The anchor word is `earlier today`, `yesterday`, a weekday within 7 days, or `Mon D` (JS:97-100).
  - An empty result reads `Nothing new since <w>.`
- **F3, the custody line** (JS:87-96):
  - client: `Waiting on <who>[ to <ask>][, overdue N days].`
  - maker: `<custody>; <due|no date>.` or `With the maker; promised by <date|today|no date>…`
  - studio: `Your pen` when `who` is empty or equals the viewer. Otherwise it is **the teammate form** `With <who>`, followed by `, due …`/`, overdue …` and `; <ball>`. Example: "With Tomás; walkthrough Sep 29." (ORC:27)
- **act** is `h.act`. **act2** is the first other need in band 1 or lower that has an act (JS:144-146).
- **The quiet form, R3/R4** (JS:149-154):
  - An exact milestone gives `<label> starts <Mon D>; nothing needs you.`
  - A band milestone gives `<stage> under way; nothing needs you.`
  - No milestone gives `Nothing needs your hand.`
  - The facts are `[F1, since, 'At rest[; <rest>].']`, and there is no act.
- **The Desk** (JS:157-188):
  - The place line is `<studio> · <Weekday>, <Mon D>`.
  - Each unpaused job contributes its top need, and those are ranked by the same comparator, then by job name.
  - With no heads, the rule is R4, `Nothing needs your hand today.`, and the facts are up to two exact milestones (no since line).
  - Otherwise, an overdue head takes the brief form `<Job>: <brief> overdue N days.` and any other head reads `<Job>: <lc headline>`. The facts are the next two briefs plus the since line. `warn` is the index of the first overdue fact among those two. The act is the top need's act.
- **`DOORWAY`** is `/^(review|open|read|see|plan|draft|continue|follow up|inspect|resolve)\b/i` (JS:124). A doorway verb lands focus on the act; any other verb, or no act, lands it on `head` (JS:738).
- **`message(card)`** (JS:190-194) is the place (with ` · ` replaced by `, `) plus `.`, then the headline, then the facts, then `Tab to <act>, or press any key to open the page.` or `Press any key to open the page.` It is spoken once, at compose end (JS:564), and cleared at rest (JS:728).
- **T2 budgets** (ORC:572-581):
  - The place line has 5 words or fewer (6 on the Desk).
  - The headline has 3 to 8 words and ends with `.`.
  - Each fact has 7 words or fewer.
  - The act has 1 to 3 words. The phrasal verbs Follow up, Sign off, Check in and Call back fold to one word (ORC:30).
  - The core (place + headline + act) is 12 words or fewer, the card is 36 or fewer, and the message is 45 or fewer.
- **T7 voice** (ORC:612-619): the headline and facts end with a period. There is no `!`, `AI`, `please`, `smart`, `just` or emoji. The act matches `^[A-Z][a-z]+( [a-z]+){0,2}$` and has no period.
- **T3 preview rule** (ORC:582-589): every card line, split on ` · ` and `X: y`, must appear in the page's own text. **In the port, the page and the card must render from the same `select()` output.** The mockup authors its page copy by hand.
- **T4** (ORC:590): selection is stable when the needs, jobs and changes are shuffled. **T5** (ORC:604): one day later, "due today" becomes "overdue 1 day".
- **Copy drift:** SQ-333 O4 gives Okafor-Bright as "Yours to add: …". The oracle expects "Still to add: …" (ORC:27), which was changed by R-DM37/38 in commit 8bd0d1d7f.

## 2. DOM contract

| Mark | Element (fixture) | Used for |
|---|---|---|
| `html[data-arrival="desk"\|"doc"]` | `<html>` (index.html:2, document.html:2) | the gate: with no value there is no arrival (JS:35,42). It also marks the Desk for `pl-desk` (JS:890) |
| `data-part="headline"` | the need's `p.t-d1` (document.html:246). On the Desk, the TOP job's line (index.html:205) | carrier H: the real node flies (JS:473,528). Required (ORC:557) |
| `act` / `act2` | the act `button`/`a.act` containing `.rule` (document.html:246) | carriers. Hit-testable once shown. `unit()` treats `.act` with `.rule` as kind "act" (JS:406). The compose step draws `.rule` (JS:550) |
| `f1` | the position line (document.html:246) | the F1 double rides home and dissolves into it (JS:342,620-627) |
| `f2`, `f3` | the margin note row and the custody line (document.html:277,246) | canonical copies, preview rule only (not keep-listed) |
| `name`, `stage` | spine job name, current spine jump `[aria-current]` (document.html:195,201) | kept visible, snap in at 0 (JS:489,640) |
| `crown` | Strata Mark `svg.sm.active` inside stage (document.html:201) | cloned into card as `.arr-crown` (JS:275-276) |
| `job` | Desk name link of top job (index.html:204) | card `.arr-job`; prints as sentence lands (JS:273,641) |
| `warn` | Desk past-due line (index.html:199) | past-due double swaps in one frame (JS:626) |
| `head` | section `h2[tabindex=-1]` (document.html:245; index.html:191) | landing focus for non-doorway (JS:738) |
| `settle` | the state word `span.state` (document.html:245) | clay settle faint→own colour (JS:679) |
| `place` | named in header comment (JS:6) but **no fixture uses it and no code reads it** | — |

`part()` takes the first *rendered* match (JS:225), so hidden duplicates are allowed. The engine also depends on some other selectors:
- `[data-record]`: `busy()` and the hash target (JS:251, 32)
- `section[id]`: the hash target
- `.spine` and `[aria-current]` (JS:260, 463)
- `.act .rule`
- `.mc` and `[data-arr-replay]` (mockup exclusions, JS:253, 372)
- `[data-arr]`: any node carrying it is skipped by `collect()` (JS:372)
- the CTRL list (JS:347)

**Nodes the engine adds:**
- `div.arr-card[aria-hidden=true][data-arr]` (JS:268). Its children are:
  - `.arr-crown`, `.arr-place` (Document) or `.arr-slug`, `.arr-day`, `.arr-job` (Desk)
  - `.arr-f1`/`.arr-f` (plus `.arr-warn`)
  - `.arr-cue`, whose text is "Tap or scroll to open the page" on coarse pointers or "Click, scroll or press any key to open the page" otherwise
  - `span.arr-line`
- `.arr-rules` (absolute) and `.arr-rules-fix` (fixed, for pinned parts), holding `.arr-rule` spans (JS:500)
- `button.arr-skip[data-arr]` "Skip arrival", `aria-describedby="arr-hint"` (JS:482-486)
- `p#arr-hint.arr-vh[aria-hidden=true]` "Skip goes straight to the page; any key opens it."
- one persistent `div.arr-vh[role=status][aria-live=polite][data-arr]` (JS:884)
- a transient `.arr-safe` probe for the safe-area insets (JS:241)

**Classes on `<html>`:**
- `arr-pre` hides the body during the wait (CSS:4)
- `arr-on` sets `overflow-anchor:none` (CSS:5) and `body{overflow-x:clip}` (CSS:6), and sets `pointer-events:none` on the body until `arr-asm` (CSS:7-8)
- `arr-asm` marks Act 3 (JS:608)

**CSS tokens the engine reads:** `--text-faint`, `--text-muted`, `--ink`, `--aged-oak`, `--clay`, `--clay-ink`, `--font-display/-body/-meta` (CSS:16-28). `cssVar('--text-faint')` reads them off `<html>` (JS:462,480).

**Sentinel:** `:root{--arr-ok:1}` (CSS:3). Boot declines unless it reads exactly `'1'` (JS:893).

**Loading:** in `<head>`, the page loads the CSS first, then the script with `defer` (index.html:169-170). Boot runs at DOMContentLoaded (index.html:665-666).

**Host object `K`** (JS:218,249,475,492):
- `slow`
- `rm()`
- `sheet.openId()`
- `overlay`
- `unsaved()`
- `arrScale0`

`Arrival.boot(K, decline)` installs `K.arrival` (JS:906-909). `decline` is the page's own entry move (document.html:698).

## 3. Choreography constants (the `S` table, JS:198-204, 457)

**Curves** (JS:198):
- X `.16,1,.3,1`
- O `0,0,.58,1`
- Q `.42,0,.58,1`
- EXIT `.4,0,1,1`
- IO `.65,0,.35,1` (x)
- YL `.45,0,.25,1` (y)
- DRAW `.55,0,.1,1`

**Composition, Act 1** (JS:535-556). Each entry is [start ms, duration]. Lines grow from a scale of .94.
- crown [0,560]
- place [80,640]
- slug [0,560]
- day [120,560]
- job [240,560]
- H [360,960]: the sentence, with a blur of 6px going to 0 on desktop only
- F1/F2/F3 at 900, 1020 and 1140, each lasting 600
- act [1260,480]
- act rule draw [1380,420]
- act2 [1440,360]
- CE = 1800, which hands to the hold

**Hold, Act 2:**
- `hold` lasts 10000.
- The cue fades in at +1500 over 600ms (200 when reduced).
- The hairline (`.arr-line`: 160px wide, ink at 40%) scales X linearly from 1500 to 10000 (JS:566, CSS:27).
- Focus freezes the hairline and cools it to text-faint over 200ms (JS:586-590).

**Hand-off, Act 3** (JS:603-685):
- Skip fades out over 120 and the cue over 160.
- Context lines exit backward (f3→crown), 40ms apart, each over 240ms on EXIT, to a scale of .96.
- Carriers start at `hand`=60, and each act follows `lag`=60 later.
- `d = clamp(880, 700 + 1.25·dist, 1100)` (JS:329).
- x (with scale) moves on `transform` along IO. y moves on the independent **`translate` property** along YL (JS:600-602).
- The F1 double prints `lead`=120 before landing and dissolves over 120. The warn double swaps in one frame at `warnD`=1100.
- The hairline completes from its progress over 180ms, then fades over 160.

**Scale ladder** (JS:293):
- Desktop at vw 1024 and wider tries 56 then 44px. From 761 to 1023 it tries 44px only.
- A step is accepted only when the widest line × k is 640 or less and the headline is 2 lines or fewer. Otherwise s=1 (34px). Phones (≤760) always use s=1.
- The midline sits at `top + (portrait ? .40 : .44)·H` (JS:295).
- The card is centred above 760px and flush-left on a 16px gutter below (JS:319).
- The fit lifts the card clear of Skip and the bottom edge, and it never declines (JS:314-318).

**Reading position** (JS:256-264) is one pre-frame-0 `scrollTo`:
- Document: the headline top sits at the view top, plus the spine bar on phones, plus 160 on phones or `clamp(.28H, 160, 240)` otherwise.
- Desk: the page stays put if the job label and the act are both in view. Otherwise it scrolls so the act's bottom meets the view's bottom.

**Assembly field** (JS:432-454):
- `t = 520 + 1480·u^1.25`, where `u = d/dmax`.
- The nearest-point metric is `sqrt(.5625·dx² + dy²)` (JS:362-365).
- The corridor: a part begins only once no carrier's remaining path overlaps it, sampled at 24 points with a 4px inflate (JS:425-431).
- Concurrency is capped at **12 parts on desktop and 8 on phone**. The last onset is at 2000 or earlier, and the target rest is 3200 or earlier (ORC:878-903).

**Part types** (JS:400-417):
- RISE lasts 720ms and eases on X, from `translate(0,6px) scale(.96)` with its origin on the column's left edge.
- Rules are drawn over 560 (DRAW), with borders replaced by `.arr-rule` overlays scaled from the focus x.
- Stems scale Y over 640, and their kids ride the front by a -6px x-offset.
- Lists put 50ms between rows.
- Lines come 80ms before type. The act rule starts at +120.
- The clay settle lasts 400ms and starts at field end.

**Guard ladder** (JS:694-718):
- A trip is any of: a frame gap over 50ms in the first 3 frames, any gap over 100ms, or two consecutive gaps over 34ms.
- A trip during compose finishes the compose and goes to the hold.
- The first Act 3 trip thins the pending parts to 160ms linear fades. The second goes to rest.
- The hold is never watched.

**Reduced motion** (JS:537-541, 643-651; ORC:849-863):
- It is the same card, unscaled, with opacity only.
- Lines appear 100ms apart, each fading over 150.
- Parts fade over 200, with all onsets inside 400.
- There is no hairline and no corridor. Skip stays visible.

**Layout-read rule:** no layout reads and no scroll writes happen after `t0` (ORC:917-921). Everything is measured before frame 0.

## 4. Input model (JS:741-866)

The engine wires its listeners in the capture phase on `documentElement` (JS:837-853). A **hand** is any keydown, pointerdown, wheel, touchstart or touchmove. `mark()` records it (JS:816), and a scroll counts as input only when a hand came within `GESTURE`=800ms before it. Otherwise the scroll is a layout shift: the engine re-baselines `st.y` and ignores it (JS:817-823). `overflow-anchor:none` also keeps reflows from scrolling the page (CSS:5).

| Input | Font wait | Act 1 (compose) | Act 2 (hold) | Act 3 (assemble) |
|---|---|---|---|---|
| any key (incl. lone modifier) | `halt()`: ordinary page for good; Esc prevented (JS:751) | — | — | — |
| letter / chord (Cmd+C) | — | `advance('key')`: finish compose → Act 3, `kbd=true` | same | native |
| Enter, Esc, arrows, PgUp/Dn, Home, End, Space | — | preventDefault + advance; Esc also stopPropagation (not the put-down) (JS:766-768) | same | Esc swallowed; others native (JS:774) |
| Enter/Space on focused act | — | `activate()`: `finish()` then `el.click()` once, no assembly (JS:749,763) | same | native |
| Enter/Space on Skip | — | `finish(true)` rest (JS:764) | same | Skip gone |
| Tab / Shift+Tab | — | prevented; cycle act → act2 → Skip (act only after `actAt`) (JS:755-759) | same, and pauses timer | prevented; `finish(true)`, focus on act else landing (JS:770-773) |
| lone Shift/Ctrl/Alt/Meta/CapsLock/Fn… | — | ignored (JS:743,761) | ignored | native |
| pointerdown on blank/page | `halt()` + swallow click (JS:778) | advance, swallow the click, remember for double (JS:789) | same | on a CTRL outside the card: `finish()` synchronously, then the native click acts once (JS:790); else nothing |
| press on act (after `actAt`) | — | tracked; release inside rect → `finish()` + dispatched click carrying modifiers (JS:786-801); release outside (drag) → advance (JS:797) | same | hit-tested at the act's *flying* rect (JS:785) |
| press on act before `actAt` | — | ordinary advance | — | — |
| pointercancel during press | — | advance (JS:842) | same | clears |
| 2nd click of a double (<500ms, ≤8px) | — | — | (first advanced) | swallowed (JS:783) |
| click without press (AT) on act | — | `finish()`, native click proceeds (JS:809) | same | control → `finish()` (JS:810) |
| touchstart | `cut()` | advance unless an act press is live (JS:812) | same | nothing; touch-scroll scrolls |
| wheel | `cut()` | advance (JS:813) | same | native |
| scroll | — | advance only after a hand ≤800ms | same | native (never cancels) |
| non-collapsed selection | — | `finish()` (JS:848) | same | ignored |
| focusin outside card | — | advance('focus') (JS:829) | same | `finish()` |
| focus into act/act2/Skip | — | recorded | pauses timer + cue + hairline freeze (JS:827,573-584) | — |
| visibility hidden | — | `finish()` | pause (starts paused if hidden at hold start, JS:568-570) | `finish()` (JS:854-859) |
| width change >1px | — | `finish()` (JS:833) | same | same |
| height-only resize | — | nothing | nothing | nothing |
| pointermove | stopped at root while running (JS:843) | | | |
| pagehide, beforeprint, OS reduced-motion change | `cut()` (JS:852,861) | | | |
| pageshow persisted | `finish()` (JS:853) | | | |
| **10s timer** | — | — | `advance('timer')`, the remaining time after pauses (JS:571,581) | — |

**Exactly once:** `advance()` and `assemble()` are guarded against re-entry, and `s.adv` counts the advances (JS:594-607, ORC:774-778). `finish()` is idempotent. It restores every saved inline style in reverse order and the draggable state, removes the nodes, clears the status message, and never saves, sends or closes her work (JS:719-736).

**`busy()`:** the arrival never starts over an open sheet or overlay, unsaved text, a live selection, a rendered `[data-record]`, or focus on a real control (JS:248-254).

## 5. Visit and storage model

**Storage:** sessionStorage with a probe. If it throws, the engine falls back to a JSON blob on `window.name` after the marker `⁣pl:` (JS:19-27).

**The gate,** once per load (JS:34-49):
1. Spend `pl-arrive`. It is `'kbd'` or `'ptr'`, written by the Desk name-link click unless modifier keys were held (index.html:655).
2. If `pl-visit` is missing or more than **30 min** old, delete `pl-desk`.
3. Write `pl-visit=now`. `mark()` also refreshes it at most every 10s on input (JS:816).
4. Suppress the arrival, in order, when:
   - there is no `data-arrival`
   - the URL has `?arrive=0`
   - the hash names an element that matches `[data-record],section` (JS:29-33). **An unknown hash still plays** (ORC:1102)
   - the navigation type is `back_forward`
   - `performance.now() ≥ 1500` (it is "late")
   - it is the Desk and `pl-desk` is set (the same visit)

   Otherwise add `arr-pre`, plus a safety timer that removes it at `1700 − t` (JS:48).

**`pl-desk`** is set only after the Desk starts successfully (JS:890). A visit that began on a Document never suppresses the Desk's first briefing (ORC:1123).

**`pl-from-doc`:**
- The put-down writes the Document's filename (document.html:683).
- The Desk consumes it and scrolls that job's row into view (`block:'center'`) before the first paint (index.html:661-663, ORC:1134-1141).

**`pl-carry`** is the paper pick-up move. It plays only when the arrival declines, through `decline` (document.html:696-698).

**Hash rules:** `hashchange` to `#rec` finishes the arrival and opens the record (document.html:701-702).

**BFCache:** `back_forward` suppresses the arrival. `pageshow.persisted` calls `finish()`, and `pagehide` calls `cut()`. Print hides the layers (CSS:37).

## 6. Failure model (every failure gives the ordinary page)

- **The JS never runs or hangs:** `arr-pre` is only ever set by the JS, so the body is never hidden (BRW:260-275).
- **The host boot throws or never calls:** the `A.safety` timer removes `arr-pre` (JS:48).
- **The CSS is missing:** the `--arr-ok` sentinel is absent, so boot calls `no()` (JS:893, BRW:252).
- **Fonts fail:** `fonts.load` resolves empty, or `check()` is false, or 1500ms pass since navigation start. Boot then calls `no()` and never plays in fallback faces (JS:870-881, ORC:1091-1099, BRW:277).
- **The Briefing JSON fails to parse:** `BOX=null`, so boot calls `no()` (JS:886, 892).
- **`start()` throws:** `finish()` then `no()` (JS:890).
- **The page is hidden at boot:** `no()`.
- **Late:** `no(true)`, meaning no entry move at all (JS:891).

## 7. Mockup only (do not ship)

- `replay()` and the four `[data-arr-replay]` footer buttons (Replay, reduced, "without scale", cold), and the `sim` fake wait (JS:896-905, 875-880; index.html:253)
- The `.mc` review panel: `#mc-rm`, `#mc-tr` (the R-DM10 "Translate only" note), `#mc-slow`, and `K.slow` (index.html:254-263, 617-637; JS:862-865)
- The query flags `?controls=1`, `?rm=1` and `?scale=0` (index.html:168; JS:887). `?arrive=0` could be kept as an internal kill switch or e2e hook (optional).
- The fixture JSON and its `anchorNote`, the `.fixture-foot` and `[data-fixture]`, and the `.fixture-foot .act` rule (CSS:31)
- The Google Fonts preconnect and stylesheet, and the literal `FACES` family strings (index.html:8-10; JS:868)
- The `window.ARR` and `window.Arrival` globals, and `K.arrival.schedule/card/advances` (these are oracle hooks; keep them only behind a test seam)

Note: ORC stubs `--text-faint` as `#9A8F84` (ORC:352), but the real token is `#65594E` (index.html:19; portal `globals.css:117`).

## 8. Port strategies

**(A) Ship arrival.js nearly as-is, as a framework-agnostic module mounted by a small `<Arrival>` client component**

Pros:
- It keeps roughly 900 lines of verified behaviour: 135 vm checks plus the B1-B13 Chromium lane.
- The engine is inherently imperative. It measures real rects before frame 0, animates the page's own nodes with WAAPI (`fill:both`, the separate `translate` property), and restores styles at the end. React adds nothing to that.
- Measure-then-animate stays inside one synchronous `start()`.

Cons and required refactors:
- The gate runs at module evaluation (JS:34-49). In a bundle that happens once per session, so it must become `gate(nav)`, called on every route entry.
- `performance.now()` since navigation start (JS:40, 46, 894) is meaningless after a soft navigation. The budget must be re-based to the route-change timestamp.
- `getEntriesByType('navigation')` only describes the hard load. Soft Back and Forward (`popstate`) must be detected separately.
- `wire()` is permanent (`wired` flag, JS:834-866) and the status node is never removed. Both need an `unwire()` for unmount or flag-off.
- The listeners live on `documentElement` capture. React 19 attaches its capture listeners to the root container (App Router hydrates `document`), which fires **before** `<html>` capture. Move the engine to `window` capture so it sees keys and pointers first.
- `K` must be adapted to the portal: its sheet and overlay state, an unsaved-drafts registry, and `useReducedMotion`.
- The exclusion list (`.mc`, `[data-arr]`, JS:372) must grow to cover the portal's own chrome, such as `TesterWidget` and `DebugPanel` (layout.tsx:79-80) and any toasts or command palette. Mark them `data-arr` or a new `data-arr-skip`.
- The engine's class hooks don't exist in the portal:
  - There is no `.act .rule`, no `.spine`, and no `data-part` anywhere in `apps/designer-portal/src` (grep found none).
  - The portal's `doc-spine.tsx:140` is `hidden` below 1180px and has `overflow-y-auto`, so `readingY`'s phone spine bar and `current()` need new selectors. `seen()` clipping will also treat that spine as a clipping container.
- Write it in TypeScript, split into `select.ts` (pure, shared with page render), `gate.ts` and `engine.ts`.

**(B) Rewrite as React components with WAAPI/CSS**

Pros:
- It is idiomatic, typed, and uses lifecycle cleanup.
- It could render the card as JSX.

Cons:
- The behaviour lives in the input model, the geometry (ladder, fit, corridor, cap, nearest-point field), and the restore semantics, not in markup.
- A React version still needs refs, imperative WAAPI and a single synchronous measure pass. Driving motion through state would re-render at 60fps and break the "no layout reads after t0" rule.
- It discards the oracle, whose vm harness runs arrival.js itself (ORC:413-416), and it guarantees drift across about 40 edge rules (Section 4).

**Recommendation: (A), as a typed near-verbatim port.** Port the ORC/BRW assertions into vitest (select and gate) and into Playwright against the portal routes.

## 9. React and Next hazards, either way

1. **`arr-pre` before the first paint.**
   - `next/script` with `beforeInteractive` is too late. The layout's own comment says the main-app bootstrap runs it right before hydrate (layout.tsx:60-76), which is after HTML paint.
   - Use a raw inline `<script dangerouslySetInnerHTML>` in the root layout, which is parser-blocking. It should run a tiny gate: route is `/desk` or `/doc/[id]`, no `arrive=0`, the hash rule, not `back_forward`, the sessionStorage visit rule, and a flag hint. It adds `arr-pre` and arms a safety timeout.
   - `<html suppressHydrationWarning>` already exists (layout.tsx:58), and React sets no className on `<html>`, so the class survives hydration.
   - A cookie with a server-rendered class cannot see sessionStorage visit state. CSS alone cannot see storage or the flag.
2. **The flag is async.** `useFeatureFlag` is client-only and starts `{value:false,isLoading:true}` (use-feature-flag.ts:75-85), and there is no server-side PostHog (only `posthog-js`, package.json:71). The pre-paint script therefore needs a persisted hint, for example a first-party cookie or localStorage key written when the flag resolves true. Alternatively, accept that the very first flagged load does not play. `NEXT_PUBLIC_FLAG_OVERRIDES` works for e2e.
3. **Data arrives after hydration.**
   - Both routes are `'use client'` (desk/page.tsx:1, doc/[id]/page.tsx:1).
   - The Document renders "Picking up…" until hydrated and resolved (doc/[id]/page.tsx:2426-2432).
   - The engine must start on a `ready` signal: the Briefing is built and the marked targets are mounted, measured in `useLayoutEffect`. It should not start at DOMContentLoaded.
   - The 1500ms budget will often be spent on a cold load. That is by design (it shows the ordinary page), but plan for it.
4. **Soft navigation.**
   - Desk to Document goes through `next/link`, so there is no reload.
   - Start the engine from the page-level component on each pathname entry. Add `arr-pre` in `useLayoutEffect` before that commit paints. `pl-arrive` is still written on the click.
   - Call `finish()` and unwire on unmount or pathname change, since a route change mid-flight must rest.
5. **React re-renders the landing targets mid-flight.**
   - The engine writes inline `opacity`, `transform`, `translate`, `transformOrigin`, `willChange`, `pointerEvents`, `position`, `zIndex` and the border colours, then restores them (JS:461, 726). React leaves unknown style keys alone, but any node it replaces or unmounts loses its animation, and any style prop React owns on those keys gets overwritten.
   - Freeze during the arrival: suspend `refetchOnWindowFocus` refetches, which are used at use-drafting-state.ts:107 and elsewhere. Also `finish()` on a MutationObserver change touching a kept element or a unit.
6. **StrictMode.** `reactStrictMode: true` (next.config.js:5) double-invokes effects in dev. The gate would spend `pl-arrive` and write `pl-desk` on the first mount, so the second mount would decline. Memoise the gate decision per navigation key, and have cleanup `finish()` without writing to storage.
7. **Fonts.**
   - `next/font` self-hosts under hashed family names, which it exposes as `playfair.style.fontFamily`. The `--font-heading`, `--font-inter` and `--font-mono` variables are set on `<body>` (layout.tsx:15-30,59; globals.css:1558-1562).
   - `fonts.load('500 34px "Playfair Display"')` will match no face, so the engine will always decline (JS:871-872). Build `FACES` from the `next/font` objects: Playfair 500 at 34 and 20px, Inter 400 at 16 and 14px, DM Mono 400 and 500 at 11px.
   - Drop the preconnect.
8. **Entry-move collision.** The Document grid already plays `motion-safe:animate-[doc-raise_270ms]` and `motion-reduce:animate-[doc-fade_200ms]` (doc/[id]/page.tsx:2745). Only one entry move is allowed: the arrival replaces it, and it becomes the `decline` path.
9. **Body overflow.** The portal body has Tailwind `overflow-x-hidden` (globals.css:1555), and `arr-on` switches it to `clip` (CSS:6). This needs a check on a phone. The Document scrolls the window (main has no overflow, doc/[id]/page.tsx:2793-2797), which fits the engine's `window.scrollY` model.
