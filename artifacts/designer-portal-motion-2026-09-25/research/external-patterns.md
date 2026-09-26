# External patterns: quiet, reveal-on-intent interfaces

Research memo for the designer-portal motion direction. Every claim below is sourced; no invented statistics.

## §1. HER (Spike Jonze, 2013)

Production designer K.K. Barrett has explained the OS1 interface's central move: after failing to design a new desktop for the film's operating-system upgrade, Jonze resolved it by deciding "it shouldn't be anything" — installing OS1, "the screen goes blank, then comes back and looks exactly the same as it did before, except now her voice comes out. We wanted to make Samantha's voice be the center of attention" ([Fast Company](https://www.fastcompany.com/3023518/designing-a-future-of-comfort-color-and-gorgeous-gadgets-in-her)). Barrett set the palette against genre convention: "We wanted the world to be warm and comfortable, and we weren't afraid of reds and oranges and golden sunlight... The use of red in the movie is so strong and gives you a focus. It was our way of uncluttering. We were anti-dystopian" ([Deadline](https://deadline.com/2014/02/oscars-uploading-her-with-production-designer-k-k-barrett-676384/)). Cinematographer Hoyte van Hoytema named the same choice directly: "modern should be very soulful and warm and tactile. And I guess that's part of the reason we eliminated blue" (Fast Company, same source).

Artist Geoff McFetridge, who had never designed a GUI before, drew the on-screen graphics — the OS1 device UI, the handwriting app, the game — and "started with an idea rather than an aesthetic: that you could see evidence of the hand in the interface" ([Gizmodo](https://gizmodo.com/an-interview-with-geoff-mcfetridge-on-the-interfaces-fr-1526237090)). Rhizome's critical-design essay identifies the structural reason screens stay near-empty: "computers are voice-controlled, which makes for more cinematic interaction and a leaner production; the presence of screens is played down" ([Rhizome](https://rhizome.org/editorial/2014/feb/3/ill-send-os-world-her-product-spec/)). In the email-reading and game scenes, the screen supplies confirmation and light texture — cursive handwriting when Samantha calls, swirling patterns marking her absence — while voice carries the primary channel ([It's Nice That](https://www.itsnicethat.com/articles/her)).

**Borrowable, screen-only principles:** (1) a near-empty resting screen is a resolved design choice about attention, not an absence of one; (2) warm, restrained color can do the job chrome usually does — giving the eye one focus; (3) one typeface, used large, reads as considered rather than sparse; (4) cutting a whole color family (Her removed blue) signals "not tech-coded" more effectively than adding warmth; (5) confirmation appearing *after* an action, not before, keeps the user's own work as the center of attention; (6) hand-evident, textured graphics read as authored rather than generated; (7) anti-dystopian-by-default warmth is a useful antidote to "AI-coded" visual clichés; (8) uncluttering happens through color restraint, not through hiding real structure.

**What Patina must not copy:** (1) no persona or anthropomorphism — Samantha is a character; a professional portal must never imply it is "someone"; (2) no "OS speaks first" — Her's system-initiates-contact pattern inverts the promise that the studio surface must never optimize for engagement; (3) no voice-first architecture — voice-first is *why* Her's screens can vanish; a text tool can only borrow the intent, not the "make it nothing" move itself; (4) no narrative prop-dressing — the OS1 device's cigarette-case object design was storytelling, not interface guidance; (5) no "blank screen means nothing changed" for a working tool — designers need confirmation that a save, send, or edit actually landed.

## §2. Calm technology and ambient display

Weiser and Brown's "calm technology" papers frame the problem as attention management: "calm technology engages both the center and the periphery of our attention, and in fact moves back and forth between the two" ([Weiser & Brown](https://people.csail.mit.edu/rudolph/Teaching/weiser.pdf); revised as ["The Coming Age of Calm Technology"](https://calmtech.com/papers/coming-age-calm-technology)). Periphery does not mean unimportant — "what is in the periphery at one moment may in the next moment come to be at the center of our attention." Their example is engine noise, unattended until it changes; the goal is a technology that "will move easily from the periphery of our attention, to the center, and back," which they call counterintuitive by design: "it seems almost nonsensical to say that the way to become attuned to more information is to attend to it less."

Amber Case formalized this into principles in *Calm Technology* (O'Reilly): "Technology should require the smallest possible amount of attention... Technology can communicate, but doesn't need to speak. Create ambient awareness through different senses... A person's primary task should not be computing, but being human" ([caseorganic.com](https://caseorganic.com/post/principles-of-calm-technology/)). Her car-engine analogy restates Weiser directly: "You don't always listen to the engine of your car, but if there is a problem with it, you'll notice it very quickly."

Ambient-display HCI research operationalizes the split. Matthews, Forlizzi & Rohrbach define the target property: "By glanceable, we mean enabling users to understand information quickly and easily... with minimal interruption to their primary task" ([ResearchGate](https://www.researchgate.net/publication/221441473_Designing_and_Evaluating_Glanceable_Peripheral_Displays)). Foundational Berkeley work (Mankoff & Dey) frames ambient displays as able to "move from the periphery to the focus of attention and back," using "abstract, simple and minimalistic representations" ([CSD-02-1211](https://www.morganya.org/research/CSD-02-1211.pdf)).

**On motion specifically:** periphery motion should stay slow and non-demanding — Weiser and Brown's "Dangling String" network display moves gently and continuously, never assertively. Motion on demand — a reveal the user asked for by hovering, clicking, or focusing — is a different category and may be faster and more assertive, since attention is already centered. The named failure mode: a display built to be ambient behaving like a *notification*, which "attract[s] immediate attention from users" when it was meant to rest in the periphery.

## §3. Reveal-on-intent in professional tools

Each entry: what rests, what reveals, the trigger, approximate duration, performed (user-caused) vs. ambient.

1. **iA Writer Focus Mode** — rests: full document, evenly weighted. Reveals: the active sentence/paragraph highlighted, rest dimmed. Trigger: cursor placement. Performed. Founder Oliver Reichenstein: "We try to slow down people that write... making people more concentrated, more focused, on expressing themselves is ultimately a good thing" ([ia.net](https://ia.net/writer/support/editor/focus-mode); [DeMagSign](https://medium.com/demagsign/oliver-reichenstein-from-ia-on-the-need-for-an-ethical-and-philosophical-approach-in-digital-c57f2d00738)).

2. **Notion's hover controls and page previews** — rests: plain text blocks. Reveals: drag handle and "+" on hover; a page-content preview on link hover. Trigger: mouse hover, instant. Performed — but contested: users called the page preview "disorienting" and asked for it to be optional rather than default ([LinkedIn](https://www.linkedin.com/posts/notionhq_you-ever-want-to-peek-at-a-notion-page-activity-7122261070387310594-5sve)), evidence that even performed reveals need an opt-out.

3. **Arc's "Little Arc" and hidden chrome** — rests: no visible tab strip or URL bar. Reveals: URL bar on click/Cmd+L; window controls on hover. Little Arc itself is a whole separate window for one link, "no chrome, distraction-free," that "disappears when you're done" ([allthings.how](https://allthings.how/whats-little-arc-in-the-arc-browser-and-how-to-configure-it/)). A design write-up documents the mechanism: a ~100ms hover delay before a ~150ms opacity fade ([blakecrosley.com](https://blakecrosley.com/guides/design/arc)). Performed.

4. **Linear's command menu and "calmer interface"** — rests: minimal chrome, keyboard-first navigation. Reveals: command palette on shortcut, contextual panes on selection. Linear's own post on its latest refresh states the goal directly: "A calmer interface for a product in motion" ([linear.app/now](https://linear.app/now/behind-the-latest-design-refresh)). Performed.

5. **Apple's Dynamic Island** — rests: a small black pill. Reveals: expands for a live activity or tap. Hybrid: recede/expand for system events is ambient, tap-to-expand is performed. Apple calls it "a singular system layer that can organically shape shift" ([Apple Developer](https://developer.apple.com/news/?id=mis6swzt)); Emil Kowalski cites it as the reference case for interruptibility ([emilkowal.ski](https://emilkowal.ski/ui/great-animations)). Recreated timings run ~800ms for a discrete expand/collapse.

6. **macOS Stage Manager** — rests: one focused window; others recede to thumbnails. Reveals: prior windows return on click. Measured at roughly a quarter to a fifth of a second for the full transition, with the practical payoff that "you can immediately start typing in the window you switched to, whereas the Spaces transition makes you wait ~1s" ([Eclectic Light Company](https://eclecticlight.co/2023/01/11/stage-manager-for-the-unimpressed-1-getting-started/)). Recede is ambient; return is performed.

7. **Stripe's and Vercel's dashboards** — Stripe rests: four KPI cards with number, trend arrow, sparkline; reveals deeper detail on click-through — "opens with your total volume and a net revenue chart. No sidebar clutter" ([Mantlr](https://mantlr.com/blog/stripe-linear-vercel-premium-ui)). Vercel rests: a near-monochrome UI where color is reserved entirely for deployment status, so "status colors carry all the semantic weight precisely because nothing else competes with them" (same source). Both ambient at rest, performed on drill-down.

8. **Things 3's progressive task detail** — rests: a plain task row. Reveals: notes, date, tags, deadline icons, "discoverable when the user hits the + button," shown in gray until touched ([IXD@Pratt](https://ixd.prattsi.org/2020/02/design-critique-things-3-ios-app/)). Performed, on tap.

9. **Kinopio — the deliberate counter-case.** Kinopio's creator rejects hover-only reveal as a default, citing "not relying on hover to reveal controls" as a constraint because touch and cross-device use break it, and pushes back on "clean minimal" orthodoxy generally: "Screw minimal — I want to do real work wherever I want" ([pketh.org](https://pketh.org/design-principles.html)) — a caution against over-applying hover reveal to a tool used on tablets or via keyboard.

## §4. Motion design guidance

**Material Design** ties duration to distance traveled, not a flat number: "Transitions that cover small areas of the screen have short durations... transitions that exit, dismiss, or collapse an element use shorter durations. Exit transitions are faster because they require less attention than the user's next task" ([m3.material.io](https://m3.material.io/styles/motion/easing-and-duration)). The classic M1 baseline is ~300ms, with "Transitions that exceed 400ms may feel too slow" ([m1.material.io](https://m1.material.io/motion/duration-easing.html)); M3's bands run 50–200ms (utility) through 500–600ms (large expressive transitions) — which is why 200–500ms is the working range.

**Apple's HIG:** "Prefer quick, precise animations... Avoid gratuitous motion. In general, avoid adding motion to interactions that occur frequently... Don't use animation for the sake of using animation," plus a consistency rule: "if someone reveals a view by sliding it down from the top of the screen, they don't expect to dismiss the view by sliding it to the side" ([Apple HIG](https://developers.apple.com/design/human-interface-guidelines/foundations/motion)).

**Emil Kowalski:** "UI animations should generally stay under 300ms," ease-out (never ease-in) for anything entering, and interruptibility as the load-bearing rule for a professional tool: "It allows the user to change the state of the animation at any time while maintaining a smooth transition" ([emilkowal.ski](https://emilkowal.ski/ui/great-animations)). His restraint rule answers "no idle wobble" directly: "Remove animations or hover interactions altogether if they are seen tens, maybe even hundreds of times a day... they'll quickly become annoying."

**Rauno Freiberg** grounds motion in real-world metaphor: "Great interactions are modeled after properties from the real world, like interruptability... Why does swiping horizontally navigate between pages? Because that's how we've intuitively interfaced with books for thousands of years" ([rauno.me](https://rauno.me/craft/interaction-design)). His checklist gives a concrete "skip the enter-animation" rule for high-frequency controls: "the native macOS right click menu only animates out, not in, due to the frequent usage of it" ([github.com/raunofreiberg/interfaces](https://github.com/raunofreiberg/interfaces)).

**Disney's principles**, adapted, contribute two usable ideas: anticipation (a hover lift before a click lands, signaling what happens next) and restrained squash-and-stretch — "Accentuate motion with squashing and stretching but avoid cartoonish deformations. Aim for precision and accuracy" ([IxDF](https://ixdf.org/literature/article/ui-animation-how-to-apply-disney-s-12-principles-of-animation-to-ui-design)).

**Recommended table** (Kowalski/Material for numbers, Freiberg/HIG for restraint):

| Motion | Duration | Easing | Note |
|---|---|---|---|
| Reveal (hover/focus) | 120–180ms | ease-out, custom curve | scale from 0.95–0.97 + opacity, never from 0 |
| Recede (dismiss) | 100–150ms | fast ease-in-out | shorter than reveal |
| Reflow | 200–300ms | standard ease-out | transform/opacity only |
| Page enter | 250–400ms | snappy takeoff, soft landing | scale by distance traveled |
| Page leave | 150–250ms | fast ease-in-out | exits faster than entries |
| Hover | 80–120ms | linear/gentle ease-out | must be interruptible |
| Focus ring | 0ms | none | never animate focus |

## §5. Accessibility and cognition

**WCAG 2.3.3 (AAA)** requires that "motion animation triggered by interaction can be disabled, unless the animation is essential" ([W3C](https://w3c.github.io/wcag21/understanding/animation-from-interactions.html)). Its intent: "Some people have vestibular disorders, which means motion effects can literally make them sick... People with cognitive disabilities can also be affected" ([Silktide](https://silktide.com/accessibility-guide/the-wcag-standard/2-3/seizures-and-physical-reactions/2-3-3-animation-from-interactions/)). Cited scale: "as many as 35% of adults aged 40 years or older in the United States have experienced some form of vestibular dysfunction" ([A List Apart](https://alistapart.com/article/designing-safer-web-animation-for-motion-sensitivity/)) — reason enough that a daily-use professional tool can't treat motion as free.

**`prefers-reduced-motion` practice** converges on substitution, not elimination: keep opacity fades and small-scale changes; strip parallax, large translation, zoom, spin, scroll-hijacking. "A better default: keep opacity transitions, remove transforms" ([Smashing Magazine](https://www.smashingmagazine.com/2020/09/design-reduced-motion-sensitivities/)). The common failure is a blanket kill switch: "the lazy implementation... practically makes your app feel broken — modals appear with no indication of where they came from" (same source). WCAG's technical scope exempts "changes of color, blurring, or opacity which do not change the perceived position/size of an element" from "motion animation" entirely — a crossfade reveal is safe even under reduce-motion.

**Interruption timing:** Adamczyk & Bailey's CHI 2004 study found that "the timing of interruptions within task execution has a significant effect on an individual's perceived amount of stress and frustration," with task-boundary interruptions costing less than mid-task ones ([interruptions.net](https://interruptions.net/literature/Adamczyk-CHI04-p271-adamczyk.pdf)). For reveal-on-intent, a reveal triggered by the user's own hover or click is inherently well-timed; an ambient, unprompted reveal risks landing mid-task.

**Object constancy:** Heer & Robertson (2007) found "appropriately-designed animated transitions significantly improve graphical perception," via *staging* — breaking a transition into phases so identity survives the change — with the rule "transitions be as long as needed, but no longer," recommending "around 1 second" for complex re-layouts, faster for minimal-movement changes ([idl.uw.edu](https://idl.uw.edu/papers/animated-transitions)). This supports motion for identity-preserving state changes (card expands to detail view), not for simple reveal/recede, which needs a much smaller budget.

**Kinetic typography:** the evidence base is thin. A 2020 Visible Language eye-tracking study found "significant differences between Fluid Typography and Serial Presentation in attention duration" but flagged comprehension itself as still unstudied ([documentserver.uhasselt.be](https://documentserver.uhasselt.be/bitstream/1942/32698/1/impact-of-kinetic-typography-on-readers-attention.pdf)). A 2023 review is more affirmative for *learning* but attributes the benefit to sequencing, not motion: "a critical learning benefit of moving text is not from the movement itself but from 'a shared thinking process'... through sequential presentation" ([nature.com](https://www.nature.com/articles/s41599-023-01646-6)).

**Plain conclusions for a text-first tool:** every reveal should track object identity, not decorate; trigger reveals on the user's own action so timing is favorable; default every animation to opacity-only or opacity+small-scale, gating larger transforms behind `prefers-reduced-motion: no-preference`; never make motion the sole channel for meaning — the comprehension evidence is too thin to lean on.

## §6. What annoys professionals

1. **Forced splash animations with no payoff.** "I worked at a company that forced me to put an 8 second splash on the application I was building, even though it was 100% not necessary"; counter-guidance: "No animation longer than 200 milliseconds... for work-adjacent categories like finance, no animation" ([Appy Pie](https://www.appypie.com/blog/app-splash-screen-best-practices)).

2. **Staggered list reveals that delay reading.** A Flutter case: 24 grid items each running two overlapping fade/slide animations, causing layout thrash during scroll — fixed by dropping the stagger for progressive loading ([GitHub](https://github.com/prit-007/wallbizz/issues/19)).

3. **Hover-only reveals with no keyboard/touch equivalent.** "Hover is over" argues designers should stop relying on hover for essential controls: "there's no universal UI language that says 'this item can be hovered'... hover-based UI designs require mouse finesse." Notion's own hover-preview drew complaints as "disorienting" and requests to make it opt-in.

4. **No working "turn animations off" toggle.** A 2020 Notion complaint: "The UI animations take up valuable time when navigating around the interface... trying to override the CSS didn't work" ([GitHub](https://github.com/dragonwocky/notion-enhancer/issues/182)) — and a 2026 bug report elsewhere: "'Reduce animation' toggle has no effect — animations continue when enabled" ([GitHub](https://github.com/DICOMPUTE/Open/issues/762)).

5. **Transition glitches on frequent navigation.** A Figma Motion report: a page transition's final state "briefly flashes (~0.5s) before snapping back... visible glitch every time you navigate between pages" ([Figma forum](https://forum.figma.com/report-a-problem-6/figma-motion-feedback-glitch-55346)) — motion bugs compound when hit dozens of times a day.

6. **Gratuitous motion on high-frequency controls**, the general case: "avoid adding motion to interactions that occur frequently" ([Apple HIG](https://developers.apple.com/design/human-interface-guidelines/foundations/motion)); "remove animations... if they are seen tens, maybe even hundreds of times a day... they'll quickly become annoying" ([emilkowal.ski](https://emilkowal.ski/ui/great-animations)).

## §7. Summary — 10 to adopt, 5 to refuse

**Adopt:**
1. A near-empty resting screen is a designed attention choice, not an absence of design (Her — K.K. Barrett).
2. Warm, restrained color can replace chrome as what gives the eye a focus (Her — Deadline).
3. Motion should move fluidly between periphery and center, not live in one (Weiser & Brown).
4. Ambient signals must stay glanceable and never behave like a notification (Matthews et al.).
5. Trigger reveals on the user's own action so timing is inherently favorable (Adamczyk & Bailey).
6. Default every animation to opacity/small-scale; gate large transforms behind reduce-motion's no-preference branch (Smashing Magazine; WCAG 2.3.3).
7. Keep reveal at 120–180ms, recede shorter than reveal, all of it interruptible (Kowalski; Material).
8. Never animate high-frequency controls or focus rings (Freiberg's macOS-menu rule; Apple HIG).
9. Use staged, identity-preserving transitions for real state changes, not simple reveal/recede (Heer & Robertson).
10. Ground motion in a real-world metaphor the user already understands, not decoration (Freiberg).

**Refuse:**
1. No persona, voice, or "system speaks first" behavior (Her's central pattern — not portable to a text-first tool).
2. No hover-only essential controls with no keyboard/touch equivalent ("Hover is over"; Kinopio's explicit rejection).
3. No splash/brand animation on a fixed timer independent of readiness (Appy Pie; the "8 second splash" complaint).
4. No staggered reveal animations on lists scrolled daily (Flutter grid case).
5. No motion that ignores or fights an explicit reduce-motion preference — the toggle must actually work (DICOMPUTE bug report; WCAG 2.3.3's core requirement).

**Tension worth flagging:** §3's Dynamic Island entry — praised by Kowalski as the model for "natural, living" interruptible motion — sits close to the line §7 draws against anthropomorphism; Kowalski's own phrase ("feels natural, almost like a living organism") is exactly the framing Her shows should be avoided in a professional tool. Resolution: keep the *mechanism* (interruptible, state-preserving motion), drop the *framing* (organism-like) — borrow the physics, not the personality.
