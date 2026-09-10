# Memo — Nora's seat

I never see the building side of this. I see the paper — on my phone, mostly,
maybe an email link. So I read all four directions the way I'd actually meet
them: as the thing that shows up when Dave and I open our agreement, not as
the tool our designer used to build it.

**Could your editing tools leak into what I get?** Two of the four worry me.
Direction D puts a note written *to the studio* — "This agreement names no
fee. Add a rate card, a flat fee, or a per-phase fee." — right in the middle
of my paper. At full width it's off in a side column, fine. But on my phone,
your own drawing shows it collapsing to an inline line inside Role rates,
marked only by an arrow saying "the note, inline at the seam." That's not a
note about my agreement. That's an instruction to my designer, sitting where
my agreement's own sentences sit. Direction A does something similar at
phone width — the "2 of 9 needs attention" line sits directly above the
paper with nothing but a gap between it and my Services clause. Direction B
is safer because the drawer either covers the whole screen or it's gone —
when I'm just reading, I'm reading the paper and nothing else. Direction C is
safest of all: the tool is its own column, the paper is its own column, and
at phone width there's an actual button, "Preview the client's copy," that
takes me to a page that is only the paper.

**Does the send sentence promise more than I get?** Yes, and I can see it in
the words themselves. Today's sentence says I'll receive "the services,
rates, retainer policy, billing cadence, ceiling, and terms" — six things.
But my agreement has nine parts, going up to ten once the Concept fee is
added, and that sentence never mentions Deliverables or Exclusions at all. It
also promises a "retainer policy" even in the exact moment my retainer still
reads "Not yet set" — which means no policy has actually been written yet.
I'd rather the sentence just named what's actually on my page, the way the
page itself already knows how to say "Not yet set" instead of pretending.

**Reading the nine parts, plainly:** the one line I wouldn't fully follow is
under Retainer — "after the fully executed agreement and retainer payment."
I know what a payment is. I don't know what "fully executed" means until
someone tells me it just means "signed." And the first figure I'd go looking
for — what is this going to cost me, in total — isn't anywhere on the page.
I see a $24,000 ceiling, but that's a cap on hourly billing, not a price. I
see a $5,000 retainer and, if it's added, a $2,400 Concept fee, each printed
alone. Nothing adds them up for me.

**Would I want to know it was "composed from parts"?** No. I don't think
about my agreement as a kit that got assembled — I think about it as one
paper. Telling me it has nine "parts," or that it lives somewhere called a
Contract Room, would sound like insider language I'm not supposed to need.
That sentence already exists in your code, but it's written for a co-worker
standing in your workroom, not for me — and it should stay there.

## Findings

| ID | P1–P3 | confidence | surface | claim | evidence | proposed change |
|---|---|---|---|---|---|---|
| NO-1 | P2 | medium | composer page (390) | A's phone view puts "2 of 9 needs attention · names no fee" directly above the paper with no visible boundary, since A merges editing and paper into one surface. | directions.md Direction A, 390 schematic; house-sheet rule #4 (no shadow to mark separation) | Give the attention band its own register (a rule or type change), not just proximity, so it can't read as a line of my agreement. |
| NO-2 | P3 | low | composer page, drawer open | B's 1440 mock prints "DRAFT" on the visible paper next to the title; unclear if that word is meant only for pre-signature. | directions.md Direction B, 1440 schematic | Confirm "DRAFT" only ever means "not yet signed" and spell it out in words I'd understand. |
| NO-3 | P2 | medium | composer page, drawer closed | With B's drawer closed, "Edit the parts · 2 of 9 need attention · names no fee" sits directly under the paper at the same measure. | directions.md Direction B, "DRAWER CLOSED" schematic | Set that line apart from the paper's own type scale. |
| NO-4 | P1 | high | galley paper (390) | D's marginal note collapses to an inline line inside the Role rates part at phone width — studio instruction language sitting where my sentences sit. | directions.md Direction D, 390 schematic ("inline at the seam") | Keep marginal notes out of the flow the real paper renders, even at 390. |
| NO-5 | P2 | medium | galley outline | D's outline lists every part name, including one that might be hidden from me (e.g. Exclusions), only 36px from the paper that would never print it. | directions.md Direction D, 1440 schematic; agreement-parts-body.tsx:554-561 | The outline should never name a part I can't see, or be unmistakably marked as the studio's own list. |
| NO-6 | P2 | medium | A & D editor placement | A and D put the money editor where the paper is rather than in a separate container (unlike B's drawer, C's accordion); R51 requires the studio's cost view to stay off my page. | directions.md Direction A "Must prove" (R27/R51); panel-brief-common.md §8 R51 | A/D specimens must show the money editor rendered visibly apart from the printed paper. |
| NO-7 | P1 | high | send sheet | Today's consequence sentence names six fixed items but my paper has nine or ten parts; it never names Deliverables or Exclusions, and would promise a "retainer policy" even when my retainer reads "Not yet set." | current-state.md §3 (service-agreement-send-sheet.tsx:105-112); fixture.md §2; agreement-parts-body.tsx:408-424 | Build the sentence from the parts actually on my page, using their names, skipping anything not yet set — the way the paper already does. |
| NO-8 | P1 | high | paper body | My paper never adds up to one total; only a design-build agreement gets a computed sum. The first figure I'd look for — the total cost — isn't printed anywhere, only a ceiling (a cap), a retainer, and a separate flat fee. | agreement-parts-body.tsx:160-209 (turnkey-only total), :388-406, :408-424, :470-479; fixture.md §1-§2 | Show me, somewhere, what these figures mean added together — or say plainly that no total exists yet. |
| NO-9 | P2 | medium | paper, Retainer part | "After the fully executed agreement and retainer payment" uses legal shorthand I wouldn't know without help. | agreement-copy.ts:19-20; fixture.md §2 part 7 | Say "once we've both signed" instead of "fully executed." |
| NO-10 | P2 | medium | not currently shown to me | The "composed from parts" sentence is written for a co-worker in the studio's own workroom, not for me; none of the four directions should add it to my copy. | agreement-copy.ts:54-55; panel-brief-common.md §7 R7/R138 | Keep that sentence off my page in every direction's specimen. |
| NO-11 | P3 | low | composer, all directions | Today's composer already labels my preview "The client's copy · live" on the studio's own page; worth checking none of the four repeats "live" where I'd actually read it. | current-state.md §6 item 4; panel-brief-common.md §9 banned words | Keep "live" (if kept) on the studio's own label, never inside the paper's type steps. |
| NO-12 | P3 | low | composer (accordion) | C keeps readiness at the head of its own column, 36px from the paper, and gives phone users an explicit "Preview the client's copy" button leading to a page that's only the paper — the cleanest separation of the four. | directions.md Direction C, 1440 and 390 schematics | None — worth preserving in the build. |

All twelve are **new** against §6, except **NO-7**, which is **known** — it
restates §6 item 1 (N4: the send sheet still speaks in a fixed enumeration
that overpromises against the actual composition) — and **NO-11**, which
**touches** §6 item 4 (the existing "The client's copy · live" label), a
different concern (contrast, not leak) about the same word.

## Ranking A–D, one sentence each

1. **C** — the tool and the paper are separate columns at every width I'd
   ever meet, with an explicit "preview my copy" step, so nothing built for
   the studio can accidentally sit where my sentences sit.
2. **B** — when I'm reading, I'm reading only the paper; the drawer is either
   gone or covers the whole screen, never half-blended with my document.
3. **A** — "the paper is the page" sounds right until the readiness band sits
   with no gap above my Services clause on a phone.
4. **D** — the direction closest to my real paper's own component, but its
   phone view puts studio instructions inline inside my Role rates part,
   which is the clearest leak of the four.

## What the specimen must show to change my mind

A screenshot of my actual phone screen, at 390, showing nothing but the
paper — no count, no "Draft," no margin note bleeding into a part — for
whichever direction gets built. For D specifically: show the marginal note
rendered somewhere genuinely separate at 390, not inline in the part flow,
before I'd move it off last place.
