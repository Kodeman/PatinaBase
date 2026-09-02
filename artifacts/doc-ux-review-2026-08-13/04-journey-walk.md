# Prod walk phase 2 — creation → install journey (2026-08-13)
*(Fresh walker resumed prior partial work. Test engagement: client "UX Walk Aug 13", kody+uxwalk@kochaver.com. Prior agent completed Brief + Discovery (1 room Kitchen, $25k–45k, style tags); doc originally /doc/597e1166-b69e-4140-8601-4480d25c546a. All screenshots below verified portal captures.)*

## Friction log (chronological)

1. **Discovery → Direction skips the doc.** "Begin the Direction" hard-navigates into the Drafting Room proposal editor (/drafting/daa68058-…) with 4 of 7 facets silently pre-filled — no Direction-phase landing section like Brief/Discovery had. (Direction section DOES exist on the doc — shot 37 "Shape the direction" — but this entry path never shows it.) MEDIUM.
2. **Client-select auto-sends an invite.** Clicking the client row (labeled "INVITE & LINK") in the "Select or invite a client…" combobox flipped to "INVITING…" and fired the link/invite immediately — no confirm, no undo. An irreversible-feeling send disguised as a picklist selection. HIGH.
3. Facets 3–7 (Role rates, Rates & ceiling, Retainer, Terms) needed manual fill despite "4 of 7 facets written" claim; $0 defaults. Minor.
4. "Save agreement" is a true draft save (verified no dispatch). OK.
5. **HARD WALL: "Review & Send" → "Send for the client signature" modal offers only "Send later" or "Send agreement →" (real email to the client). No in-portal designer-side mark-as-signed / simulate-acceptance.** Backed out via "Put back." Blocks reaching Project/Install without a real send — also means designers can't dry-run the lifecycle. HIGH (for lifecycle QA).
6. **Doc URL breaks permanently once Direction starts.** Original /doc/597e1166… and its ⌘K "recent" entry now return "No document answers to this name"; canonical URL silently became /doc/daa68058… (the proposal id). Reproduced twice. Bookmarks/history/recents captured pre-Direction are dead links forever. HIGH — reproducible bug.
7. **Nurture mislabels a draft as sent.** People-room client record reads "Proposal sent · hesitating"; Nurture card: "Proposal out — a nudge or a call may be overdue" + "Reach out" CTA — for a proposal only ever SAVED, never sent. Would prompt needless client chasing. HIGH.
8. **Proposal phase never advances in the rail** even at "7 of 7 facets written" + saved: Direction = DRAFTING, Proposal = "–". Phase advance is gated entirely behind the send+signature wall.

## Later-phase observations (read-only on reference docs)

- **Winky (project)**: "NO ACTIVE OR DELAYED PHASE IS CONFIGURED" caption sits directly ABOVE a fully-populated 6-milestone schedule (Consultation→Care) — phase-tracking layer and schedule-of-record visibly disconnected. Design Authority $100,000/$0/$0/$100,000 + rate card; Working Budget v2 with sync-from-schedule; Authorizations table (2 executed + 1 draft trade scope); Accounts "$0 budget · $0 committed · STUDIO EYES ONLY" visibly disconnected from the $13,772-released Living-room ledger above it. Mood boards + Plan Room: clean on-brand empty states.
- **Harper Vale (install settled/care)**: even fully closed, still surfaces "NEEDS ATTENTION — Two installs collide — week of Nov 30" and "no designated decision lead yet" — install/care don't suppress open operational alerts. Baseline captions verbatim: "2 ACTIVE PHASES NOT CLASSIFIED TO A CANONICAL STAGE" / "DERIVED FROM THE PROJECT SCHEDULE · NO TEMPLATE PROVENANCE RECORDED". Install: "0 OF 1 INSTALLED · BILL 1 UNINVOICED"; Care: "The book closed Jul 31".

## 5 worst breakdowns of the creation→install journey
1. Client invite auto-fires on a picklist click, no confirmation (#2).
2. Doc URL permanently breaks on phase advance (#6).
3. Nurture reports a draft proposal as "sent"/"nudge overdue" (#7).
4. No designer-side path to signed without a real external send (#5) — blocks lifecycle dry-runs.
5. Direction phase has landing content that its own entry point skips (#1).

## Verified screenshots
Dir: /private/tmp/claude-501/-Users-kody-Code-patina-merged/6cc55e5f-350a-4575-9144-d24a5ce4a9f5/scratchpad/shots/
- 27-discovery-ready-for-direction, 28-drafting-room-direction-skip, 29-client-attached-auto-invite, 30-drafting-room-all-7-facets, 31-agreement-saved, 32-post-disconnect-check, 33-send-for-signature-wall, 34-back-to-document-broken, 35-doc-vanished-after-direction, 36-client-profile-proposal-out-mislabel, 37-doc-direction-new-url
- Phase-1 reshoots (verified): 60-desk-top, 61-winky-header-phase-rail, 62-winky-schedule-no-active-phase, 63-winky-design-authority-budget, 64-winky-authorizations-accounts-empty-states, 65-harper-vale-install-care-uninvoiced, 66-harper-vale-rail-settled-ongoing
- 22–26 (prior agent, small window captures of lead form/discovery — usable)

## Prod residue to clean up eventually
Test client "UX Walk Aug 13" (kody+uxwalk@kochaver.com) with drafted (unsent) agreement at /doc/daa68058-…; client link/invite fired during walk (to a kochaver.com plus-address). Nurture shows it as "Proposal sent".
