# Roads not taken

*Companion to `source/proposal.md`. Seven roads. Each was a real proposal in this program, argued by a seat that believed it. Each has one killer, named, quoted, with its defect id. A road with no named killer is not a road, it is a preference.*

---

## 1 · The map rail drawn at true proportional extent

**The road.** The ladder is a scaled elevation of the paper itself. Each of the six segments is drawn at its region's real share of the document's height, so the `Pieces` segment is genuinely eleven times the `Money` segment on a spread where the schedule is eleven times the money region, and a designer reads the shape of her own document off the left edge before she has scrolled a pixel. No count, no number, no legend — the drawing *is* the count. The reading window brackets her share of that elevation, so "how far in am I" and "how much of this is the schedule" are one mark, answered without a word.

**Why it was attractive.** It is the only version of the rail that does something the paper physically cannot do while she is inside one part of it. F22 is the finding: *"Four equal rows: no extent, no distance, no mark of which one is overdue."* A true elevation answers extent, distance and position in a single drawing, in a register that is already three rule weights and nothing else. It is also the most beautiful thing either author drew, and it is the one place in the program where the left edge earns its 200px on aesthetics as well as on function. P1's own walk names the gain: *"That is the first time this product has ever told me the shape of my own schedule before I scrolled into it."*

**The one thing that killed it.** A floor. Every segment needs a press target, the press target sets a minimum height, and the minimum eats the proportion: with a 36px floor on a 443px track, six stops spend 216px on floors and have 227px left to distribute, so an 11:1 truth draws as 3.5:1. The drawing that was supposed to show scale is the thing that flattens it.

**Who killed it.** **C-practitioner**, Dp-11: *"The one thing a map is for — how much of this paper is my schedule — is the thing the drawing flattens."*

---

## 2 · No lens line at all

**The road.** Nothing on the paper is `position: sticky`. The header is the top of a piece of paper: letterhead, vitals, one reserved 136px band carrying what needs her, and then it leaves, the way a letterhead leaves. The instrument moves entirely to the column beside the work, where it costs the reading zero vertical pixels. Below s0 the paper is *only* paper — 93.3% of every frame at s2, against the 87.1% a band permits — and `--doc-seam-height` drops to zero writers with nothing left to publish.

**Why it was attractive.** It is the largest and cleanest recovery in the program, and it is honest about where the cost of a header actually falls. A 56px band is a permanent 6.2% of a 900px frame, at every offset, forever, on the one axis the work needs — and it is spent carrying facts a column carries for free. The argument has teeth: the whole reason the first region head lands at 1005.31px today is that the top of this page competes with the page for vertical pixels, and the only design that never competes is one where nothing pins. It also removes an entire class of defect rather than constraining it: with nothing sticky, F04, F34, F87 and F120 have no surface left to land on.

**The one thing that killed it.** The act. The exception's *word* survives on the ladder at every offset; the exception's *act* does not, because a non-sticky band is off screen from s2 down — and `SEND A REMINDER` for a six-day-overdue approval ends up two thousand pixels above the line she is reading, on the one task the ask's own sentence is about.

**Who killed it.** **J1**, Dj1-06: *"The needs band is non-sticky, so `SEND A REMINDER` for the six-day overdue approval is ~2,000px above her at s2. The exception's word survives on the ladder; its act does not."*

---

## 3 · The value-free rail — six equal rungs, position and nothing else

**The road.** The rail stops being furniture and becomes six equal rungs, a reading line, and no values at all. No counts, no dollars, no `NOT SCHEDULED`, no exception marks — position, never facts. The 40px it gives back goes to the margin, the organ the ask calls cramped. The principle is exact and it is one sentence long: **a rail that prints no figure cannot print a false one.**

**Why it was attractive.** The diagnosis behind it is the best in the program and it is measured. F108: `Money unread` and `$6,200 OWED` print at the same font size, weight and row position in the same component — a fallback string wearing a live figure's clothes. F29: `Client approvals` / `0 IN THE LOG` in the rail at y252, and `Client approvals NO DECISION LEAD · NO APPROVALS AUTHORED` on the paper at y792, the same emptiness in two type registers 540px apart. F10: five money statements and four numbers on one screen. A rail that carries only position cannot commit any of those errors, and the rail gets quieter in *words* — 18 distinct labels down to 7 — which is the direct, literal answer to Kody's first sentence.

**The one thing that killed it.** P4's working instrument. `36 lines · 4 rooms · 1 damaged` would then exist in exactly one place on earth — inside the `Pieces` region, while the `Pieces` region is in frame — so reconciling a 36-line schedule against an approval at install-minus-ten means holding the counts in her head, which is the two-hour credenza retrace her persona is built from.

**Who killed it.** **J1**, §6 "Who is worse off": *"Y deletes it on a principle — that a rail which prints no figure cannot print a false one — which is a good principle bought with her working instrument."*

---

## 4 · The 40px transfer — a 160px rail funding a 272px margin

**The road.** Narrow the rail to 160px and give the recovered 40px to the margin, so `page.tsx:1764` becomes `min-[1440px]:grid-cols-[160px_minmax(0,1fr)_272px]`. The paper column measures the same 1008px it measures today, so the measure loses nothing, and the organ Kody calls *cramped for the space needed for the functionality it contains* gets 40px of width on top of the ~160px of vertical the deletions return. It is the only move in the program that answers the width half of that complaint at all.

**Why it was attractive.** Kody's fourth sentence is about width, and every other answer in this program answers it with vertical space and hopes nobody notices. The margin at 232px carries six tenses of work — the first-touch note, file-change notes, the capture acts, a Drafts fold, seven chips of two kinds, a note composer, handoffs — and F17 says it prints the same seven chips in the same order at top, seam, mid and foot. Forty more pixels of measure is a real, legible improvement to the one column that has to hold a sentence and a figure side by side, and it costs the paper nothing.

**The one thing that killed it.** The rail's inner measure. Forty pixels off a 200px column is forty pixels off a 168px inner measure, which is the entire width of the value line — the ladder's whole payload — and the measure it buys the margin exists only at exactly 1440 and vanishes at 1472 and above, where `max-w-[1040px]` caps the paper anyway.

**Who killed it.** **J2**, merge instruction, *Sections and margin*: *"32px of measure recovered at exactly 1440 and none at 1472 and above, against 40px of the rail's 168px inner measure, which is the whole of the value line."*

---

## 5 · The text-free 1280 tier

**The road.** At 1180–1439 the rail prints no words at all, and therefore breaks none. One `--rule-hair` down the column, one 12px tick per stop, the clay segment on the stop she is in, every tick a `min-h-11` press target. Pressing any tick opens the Sections sheet the mobile spine already builds, which prints every stop with its full name. `Put down` becomes its glyph. SP-11's second branch, taken cleanly, and priced by E1 §4(b) at **days** against **weeks** for widening.

**Why it was attractive.** F07 is measured, not predicted: at a 44px content box, `Project` / `ACTIV` / `E` breaks a status word mid-syllable and `PUT` / `DOWN` wraps. Widening the rail moves the paper's x-origin, and four pinned contracts guard that origin — `quiet-responsive-shell.spec.ts:223-228`, `quiet-release-contracts.spec.ts:105-118`, and `shelf-panel.tsx:144`'s `min-[1440px]:left-[200px]`. The text-free line refuses to fight any of them. It is the cheapest correct answer to a real defect, it introduces no new iconography beyond a tick, and every label is one press away rather than gone.

**The one thing that killed it.** It stops being paper. A hairline with six ticks in a stock-coloured column is a scrollbar, not a rail — and the arithmetic showed the fight was never necessary: `1180 − 136 = 1044 ≥ 1040`, so the words fit at that tier without moving the paper's x-origin by a single pixel.

**Who killed it.** **J2**, axis 6: *"A hairline with six ticks is the one place in either proposal where the document stops looking like paper furniture and starts looking like a scrollbar, and it is a tier Kody works at."*

---

## 6 · The measured band — one writer, a `ResizeObserver`, SP-04 kept to the letter

**The road.** The band keeps `--doc-seam-height`'s name and its single writer. A `ResizeObserver` on `[data-lens-band]` measures the real box and publishes it once, always — on mount and on every resize — rather than only while pinned-and-unfolded. Declared is the minimum; measured is the truth. At 390, where line 2 wraps in a 334px measure, the measurement is what governs, and the four consumers keep reading a value that is always correct for the width and the string in front of them.

**Why it was attractive.** It is the only version that is literally compliant with the shared floor: SP-04 says *"exactly one element measures and publishes its height (`--doc-seam-height` keeps its name and its single writer)"*, and this is that sentence built. It is also the conservative choice — it keeps `page.test.tsx:1361-1382`'s sentinel contract alive as a selector rename, it never has to argue that a string cannot wrap, and it is right at every width by construction rather than by rule. F44 is the finding it honours: the published height is content-dependent, its deps include `seam.identity` and `seam.exceptions`, and at 390 the seam already wraps today.

**The one thing that killed it.** A live string can still overrun, and the only defence a measured band has is a promise not to ship one — which is a decision somebody makes in a review, not a mechanism the code enforces every frame.

**Who killed it.** **J2**, Dj2-13: *"Y's own R2 concedes a live exception string can overrun 56px; the mitigation is a pre-ship gate … which is a decision, not a mechanism."*

---

## 7 · Releasing a region above the reading line, with a same-frame scroll correction

**The road.** Density runs both ways. A region whose bottom has passed above the frame's top releases — its body unmounts, its height drops to a reserve — and in the same layout pass a `scrollBy(−Δ)` takes back the exact height delta, so nothing on screen moves. Density becomes a true lens: the paper ahead of her is quiet, the paper behind her is quiet, and only the region she is in carries its full weight, at any depth, forever. The DOM never holds more than one full body, and the render cost of a 60-line unvirtualized schedule is bounded no matter how far she scrolls.

**Why it was attractive.** It is the only mechanism in the program that makes the lens metaphor symmetrical, and the render-cost argument is real: `ffe-section.tsx` is 1,549 lines with no virtualization (F53), and under a one-way rule every region she has passed stays mounted, so by the end of a session the whole document is in the DOM. The correction was specified rather than hand-waved, its author priced it as their own Rank-1 risk, and they named the seeding task that would falsify it. C-feasibility called it *"the single strongest engineering line in either document."*

**The one thing that killed it.** It has to be right every frame. On a trackpad fling crossing three releases in 200ms, a correction that lands one frame late walks the paper upward under a paragraph she is reading — the 283px bug redistributed, at a higher frequency, and harder to see because no instrument in the tree records it.

**Who killed it.** **C-feasibility**, DC-01: *"A region that releases above the reading line takes its height with it and nothing gives it back… every pixel below it — the line she is reading — rises by 1,728px."*

---

*Ends. Six of these seven were killed by a number rather than by a preference: a floor, a distance, a measure, a wrap, a frame. The seventh — the value-free rail — was killed by a person, which is the harder kind of evidence and the one this program was built to produce.*
