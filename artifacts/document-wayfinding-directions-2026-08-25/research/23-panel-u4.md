# U4 — Content design & lexicon

Lens: U4 (Content design & lexicon). Walked all sixteen tasks against both baselines — today's
paper (`w1440-`/`w1280-`/`m390-` shots, flag off) and the Worktable (`wt-` shots, flag on) — at
all three width tiers, against `apps/designer-portal` at `main@695addb5f`. Brand voice loaded
from `.claude/skills/patina-brand-voice/SKILL.md`.

## Overall

The surface's best copy — "← Put down," "Call sheet · who is on the job," the seven stage
eyebrows ("Brief · decide the fit," "Care · close the loop") — is genuinely in Patina's voice:
plain, trade-literate, no AI framing. But that discipline breaks in three concrete ways: (1) one
real "Ask the Engine" drift sits at the very first contact point (⌘K's own placeholder); (2) three
region/document names printed in canon (The Record, Contents Page) never match what's actually
on screen (Previous work, The Studio), so the ledger and the app are teaching two different
vocabularies; (3) a repeated "Review ___" verb across four of seven stage actions, plus one raw
migration sentence in the money explainer, quietly re-introduce the shrug the guide was built to
remove. None require restructuring — every fix below is a word swap.

## Task table

| Task | What-to-do | How-to-get-there | Note |
|---|---|---|---|
| T1 | 4 | 5 | "Needs your hand" / "Studio pulse" plain and strong; "The Studio" eyebrow doesn't match canon's "Contents Page" name (U4-20), cosmetic only |
| T2 | 2 | 1 | No phase-wide surface exists (structural, known-open); no label fix available |
| T3 | 4 | 5 | Guide sentence itself is clear per stage, but 4/7 primary actions share the lead verb "Review" (U4-04) and the operational-need reason reads as engineering copy (U4-05) |
| T4 | 4 | 3 | "Project · FF&E" / room heading language is clear; 1280 compact rail drops to unlabeled icons (U4-15), and "room" carries 3 senses on this surface (U4-10) |
| T5 | 4 | 3 | "Mood boards" noun is consistent across all three doors; the doors themselves differ in chrome, not vocabulary — a U1 concern, not lexicon |
| T6 | 3 | 2 | "Plan room" and "Spec book" are decodable from their eyebrows in context, but "room" collision (U4-10) and total absence below 1440 both cost her |
| T7 | 5 | 4 | Send-wall state line ("Sent yesterday," "not yet") is plain and complete |
| T8 | 5 | 5 | "Add a room" in-flow line is a model of scored-ink plain language |
| T9 | 3 | 3 | "Draw an invoice" is clear; the four money-row words (Authority/Plan/Committed/Moved, U4-13) and "Design authority"'s missing money-scent (U4-08) both cost her |
| T10 | 4 | 4 | "Adjust dates" is plain; ripple visibility is U2/U3 territory, not lexicon |
| T11 | 5 | 5 | "← Put down" is the strongest single label on the surface — a trade verb doing real work |
| T12 | 4 | 5 | "Capture a lead · begin a Brief" vs. "Open a project · no proposal needed" — the subLabels do the disambiguating work well |
| T13 | 3 | 3 | The Orders ledger shows RECEIVED/INSPECT, IN TRANSIT, NOT SENT — but no visible word for PO *acknowledgment* anywhere on the sheet she'd actually open (U4-22) |
| T14 | 3 | 3 | "Receiving" tab exists on the Orders sheet; no damage-claim-specific label was captured in evidence to confirm decodability — flagged as unverified, not scored down further |
| T15 | 5 | 4 | "Call sheet · who is on the job" is the best-paired label in the inventory |
| T16 | 3 | 3 | "The Post" is a postal metaphor that doesn't scent "reply to a client message" the way "Message {Family}" elsewhere on the same document does (U4-12) |

## Findings

```json
[
  {
    "id": "U4-01",
    "lens": "U4",
    "persona": null,
    "task_ids": ["T2", "T6", "T9"],
    "key": "cmdk|1440|off|ask-the-engine-drift",
    "surface": "⌘K", "width": "all", "flag": "off",
    "title": "\"Ask the Engine\" is AI/engine framing on a core surface",
    "observation": "Command bar fallback group and result row read verbatim: \"Ask the Engine\" (group eyebrow) and \"The Engine · “{query}”\" (results header), with a row sublabel \"'{query}' · ask & place\".",
    "why_it_blocks": "both",
    "evidence": {"shots": ["w1440-cmdk-typed.png", "w1440-cmdk-engine-row.png"], "refs": ["apps/designer-portal/src/components/document/command-bar.tsx:644-645", "apps/designer-portal/src/components/document/command-bar.tsx:826", "apps/designer-portal/src/components/document/command-bar.tsx:833"]},
    "severity": "high", "confidence": 0.95,
    "already_ruled": null,
    "suggested_fix": "Rename to a plain-spoken fallback, e.g. \"No match — ask the studio\" / \"Search the library\"; drop \"Engine\" from every visible string.",
    "hesitation_seconds_estimate": 5
  },
  {
    "id": "U4-02",
    "lens": "U4",
    "persona": null,
    "task_ids": ["T1", "T2"],
    "key": "cmdk|1440|off|placeholder-engine-framing",
    "surface": "⌘K", "width": "1440", "flag": "off",
    "title": "⌘K's own placeholder invites \"ask the Engine\"",
    "observation": "Input placeholder reads: \"Find a document or a ledger — or ask the Engine…\" — the first text a designer reads inside search.",
    "why_it_blocks": "both",
    "evidence": {"shots": ["w1440-cmdk-open.png"], "refs": ["apps/designer-portal/src/components/document/command-bar.tsx:793"]},
    "severity": "high", "confidence": 0.9,
    "already_ruled": null,
    "suggested_fix": "\"Find a document or a ledger…\" alone is complete and in-voice; drop the second clause entirely rather than rephrase it.",
    "hesitation_seconds_estimate": 3
  },
  {
    "id": "U4-03",
    "lens": "U4",
    "persona": null,
    "task_ids": ["T3", "T11"],
    "key": "doc|all|both|record-label-drift",
    "surface": "/doc/[id]", "width": "all", "flag": "both",
    "title": "Canon's \"The Record\" never prints on screen",
    "observation": "DECISIONS.md names this region \"The Record\" (I137: \"The Record moves to the foot of the paper\"), but the only visible string is \"Previous work · {n} complete\" — \"The Record\" appears nowhere in the rendered DOM.",
    "why_it_blocks": "obvious-what-to-do",
    "evidence": {"shots": ["w1440-record-foot.png"], "refs": ["apps/designer-portal/src/components/document/previous-work.tsx:45-46", "docs/design/the-document/DECISIONS.md:8608"]},
    "severity": "low", "confidence": 0.8,
    "already_ruled": "C10",
    "suggested_fix": "Standardize on \"Previous work\" as the name everywhere, including future canon entries; retire \"The Record\" as a UI-facing name so it can't leak into a future build unreviewed.",
    "hesitation_seconds_estimate": 0
  },
  {
    "id": "U4-04",
    "lens": "U4",
    "persona": null,
    "task_ids": ["T3", "T11"],
    "key": "doc|all|off|review-verb-repetition",
    "surface": "/doc/[id] guide", "width": "all", "flag": "off",
    "title": "Four of seven stage actions all start with \"Review\"",
    "observation": "Primary action labels by stage: \"Review the brief\" (brief), \"Continue Discovery\" (discovery), \"Open Drafting Room\" (direction), \"Review proposal\" (proposal), \"Review active work\" (project), \"Review installation\" (install), \"Review closeout\" (care). The default need action label is also \"Review now\".",
    "why_it_blocks": "obvious-what-to-do",
    "evidence": {"shots": [], "refs": ["apps/designer-portal/src/lib/document/document-guide.ts:91-141", "apps/designer-portal/src/lib/document/document-guide.ts:242"]},
    "severity": "medium", "confidence": 0.9,
    "already_ruled": null,
    "suggested_fix": "Give each stage a distinct lead verb tied to its actual next move, e.g. \"Answer the brief\" / \"Follow up\" / \"Move the project\" / \"Finish the install\" / \"Close it out\" — never repeat \"Review\" as the first word twice.",
    "hesitation_seconds_estimate": 10
  },
  {
    "id": "U4-05",
    "lens": "U4",
    "persona": null,
    "task_ids": ["T3"],
    "key": "doc|all|both|operational-signals-copy",
    "surface": "/doc/[id] guide", "width": "all", "flag": "both",
    "title": "Guide's need-reason reads as system log, not her voice",
    "observation": "Verbatim reason text on the needs-attention branch: \"This action comes from the operational signals available on the current document.\"",
    "why_it_blocks": "obvious-what-to-do",
    "evidence": {"shots": [], "refs": ["apps/designer-portal/src/lib/document/document-guide.ts:374-381"]},
    "severity": "medium", "confidence": 0.9,
    "already_ruled": null,
    "suggested_fix": "Print the specific reason (already available as `need.text`) or drop the generic sentence entirely rather than explain the mechanism.",
    "hesitation_seconds_estimate": 5
  },
  {
    "id": "U4-06",
    "lens": "U4",
    "persona": null,
    "task_ids": ["T9"],
    "key": "doc|1440|off|money-explainer-migration-leak",
    "surface": "/doc/[id] money region", "width": "1440", "flag": "off",
    "title": "Money explainer names its own old UI to a designer",
    "observation": "Verbatim: \"Absorbs today's four separate bands: design authority, working budget, authorizations & trade scopes, the accounts.\" printed directly beneath the Authority/Plan/Committed/Moved rows.",
    "why_it_blocks": "obvious-what-to-do",
    "evidence": {"shots": ["w1440-money-region.png"], "refs": ["apps/designer-portal/src/components/document/commercial/money-region.tsx:327-336"]},
    "severity": "medium", "confidence": 0.9,
    "already_ruled": null,
    "suggested_fix": "Cut the \"Absorbs today's four separate bands\" sentence — it addresses a teammate who remembers the old layout, not a designer reading this document.",
    "hesitation_seconds_estimate": 8
  },
  {
    "id": "U4-07",
    "lens": "U4",
    "persona": null,
    "task_ids": ["T3", "T14"],
    "key": "doc|1440|both|care-spread-says-install",
    "surface": "/doc/[id] care", "width": "1440", "flag": "both",
    "title": "Closed-out Care document's FF&E spread is headed \"Install\"",
    "observation": "On Birch Hollow (Care, book closed Aug 25) the FF&E section directly beneath the Care band prints heading \"Install\" and empty-state \"No FF&E lines are scheduled for installation.\" while the paragraph immediately above correctly reads \"Plan the care work.\"",
    "why_it_blocks": "obvious-what-to-do",
    "evidence": {"shots": ["w1440-care-band.png", "wt-delivery-care-1440.png"], "refs": ["apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:1436-1445", "apps/designer-portal/src/components/document/ffe-section.tsx:1037,1232", "apps/designer-portal/src/components/document/schedule/work-block.tsx:181"]},
    "severity": "high", "confidence": 0.95,
    "already_ruled": null,
    "suggested_fix": "Have the section heading and its empty-state copy read `sectionKey` the same way `work-block.tsx` already does — print \"Care\" and \"No FF&E lines are scheduled for care.\"",
    "hesitation_seconds_estimate": 15
  },
  {
    "id": "U4-08",
    "lens": "U4",
    "persona": null,
    "task_ids": ["T9"],
    "key": "doc|1440|off|design-authority-no-money-scent",
    "surface": "/doc/[id] spine + region", "width": "1440", "flag": "off",
    "title": "\"Design authority\" never says \"money\" outside one small eyebrow",
    "observation": "Running index row reads only \"Design authority\"; region head reads \"Design authority\" with eyebrow \"Money · one region\" — the only place the word \"money\" appears near this region at all.",
    "why_it_blocks": "obvious-how-to-get-there",
    "evidence": {"shots": ["w1440-spine-detail.png", "w1440-money-region.png"], "refs": ["apps/designer-portal/src/lib/document/document-index.ts:34-55", "apps/designer-portal/src/components/document/commercial/money-region.tsx:295-305"]},
    "severity": "medium", "confidence": 0.85,
    "already_ruled": null,
    "suggested_fix": "Pair the running-index row itself, e.g. \"Design authority · money\", matching the studio-word + trade-word pattern already used for \"Call sheet · who is on the job\".",
    "hesitation_seconds_estimate": 20
  },
  {
    "id": "U4-09",
    "lens": "U4",
    "persona": null,
    "task_ids": ["T6"],
    "key": "doc|1440|off|knowledge-shelf-double-name",
    "surface": "/doc/[id] shelves", "width": "1440", "flag": "off",
    "title": "\"Knowledge\" shelf calls itself \"Studio library\" three lines down",
    "observation": "Shelf title reads \"Knowledge\"; its own eyebrow reads \"Studio library · Cross-project\"; its empty-state act reads \"Open the studio library.\" Three names, one shelf, none of them the surface it actually points to (`/library`, itself labeled \"Library\").",
    "why_it_blocks": "obvious-what-to-do",
    "evidence": {"shots": ["w1440-shelves-block.png", "w1440-shelf-knowledge.png"], "refs": ["apps/designer-portal/src/lib/document/shelves.ts:62-68"]},
    "severity": "medium", "confidence": 0.9,
    "already_ruled": "I136 (known-open)",
    "suggested_fix": "Rename the shelf title to match its own eyebrow and destination — \"Studio library\" — until (or unless) a real Knowledge surface is ruled.",
    "hesitation_seconds_estimate": 20
  },
  {
    "id": "U4-10",
    "lens": "U4",
    "persona": null,
    "task_ids": ["T4", "T6"],
    "key": "doc|1440|off|room-word-collision",
    "surface": "/doc/[id] shelves + FF&E + drawer", "width": "1440", "flag": "off",
    "title": "\"Room\" names three unrelated things with no disambiguation",
    "observation": "\"The Rooms\" (global doorway to scanned physical rooms), \"Plan room\" (a document shelf holding drawings), and FF&E's own room heading/room lens (a grouping of furniture lines) all use the bare word \"room\" with no qualifier distinguishing them.",
    "why_it_blocks": "obvious-what-to-do",
    "evidence": {"shots": [], "refs": ["apps/designer-portal/src/lib/document/shelves.ts:34-40", "apps/designer-portal/src/lib/document/registry.tsx:106-119"]},
    "severity": "low", "confidence": 0.6,
    "already_ruled": null,
    "suggested_fix": "Would be settled by watching P3 define \"Plan room\" before she clicks it; if she guesses a physical room, rename to \"Plan set\" or \"Drawings.\"",
    "hesitation_seconds_estimate": 15
  },
  {
    "id": "U4-11",
    "lens": "U4",
    "persona": null,
    "task_ids": ["T3", "T11"],
    "key": "doc|all|off|next-up-only-on-error",
    "surface": "/doc/[id] guide", "width": "all", "flag": "off",
    "title": "\"Next up\" only appears when guidance is broken",
    "observation": "The eyebrow string \"Next up\" is used exactly once, on the `unavailable` (error) branch of the guide (headline \"Guidance is unavailable\"); every healthy state uses a different, stage-specific eyebrow instead.",
    "why_it_blocks": "obvious-how-to-get-there",
    "evidence": {"shots": [], "refs": ["apps/designer-portal/src/lib/document/document-guide.ts:327-339", "apps/designer-portal/src/lib/document/document-guide.ts:91-141"]},
    "severity": "low", "confidence": 0.75,
    "already_ruled": null,
    "suggested_fix": "Give the guide one stable kicker word (e.g. always print \"NEXT\" above the stage-specific eyebrow) so a designer scanning many documents in a row always finds the same anchor, healthy or not.",
    "hesitation_seconds_estimate": 5
  },
  {
    "id": "U4-12",
    "lens": "U4",
    "persona": null,
    "task_ids": ["T16"],
    "key": "doc|all|off|the-post-vs-message",
    "surface": "/doc/[id] + drawer", "width": "all", "flag": "off",
    "title": "\"The Post\" and \"Message {Family}\" name the same idea differently",
    "observation": "The inbox door is labeled \"The Post\" (a postal noun); the letterhead's own reply action is labeled \"Message {Family}\" (a plain verb) — both concern client correspondence, but nothing ties the two words together.",
    "why_it_blocks": "obvious-what-to-do",
    "evidence": {"shots": [], "refs": ["apps/designer-portal/src/lib/document/registry.tsx:214-227", "apps/designer-portal/src/components/document/letterhead-instruments.tsx:329"]},
    "severity": "low", "confidence": 0.6,
    "already_ruled": null,
    "suggested_fix": "Keep \"The Post\" as the studio's own idiom, but add the sublabel \"messages\" beside it wherever it appears outside the drawer, matching the aliasing already done for other rooms.",
    "hesitation_seconds_estimate": 10
  },
  {
    "id": "U4-13",
    "lens": "U4",
    "persona": null,
    "task_ids": ["T9"],
    "key": "doc|1440|off|moved-row-undecodable",
    "surface": "/doc/[id] money region", "width": "1440", "flag": "off",
    "title": "Money row \"Moved\" is not decodable from the word alone",
    "observation": "The fourth money row reads only \"Moved · $14,420 in motion — ordered through installed\" with a full explanatory paragraph required below to understand it means \"the accounts' committed figure — not funds disbursed.\"",
    "why_it_blocks": "obvious-what-to-do",
    "evidence": {"shots": ["w1440-money-region.png"], "refs": ["apps/designer-portal/src/components/document/commercial/money-region.tsx:308-336"]},
    "severity": "medium", "confidence": 0.85,
    "already_ruled": null,
    "suggested_fix": "Rename the row itself to something self-explanatory, e.g. \"In motion\" (which the sub-line already uses) rather than the more abstract \"Moved.\"",
    "hesitation_seconds_estimate": 20
  },
  {
    "id": "U4-14",
    "lens": "U4",
    "persona": null,
    "task_ids": ["T9", "T13"],
    "key": "desk|1440|off|ledgers-header-unglossed",
    "surface": "/desk", "width": "1440", "flag": "off",
    "title": "Desk Contents column header \"Ledgers\" carries no plain-word pairing",
    "observation": "Column head reads \"LEDGERS\" above rows \"Orders / Accounts / Hours / The Post,\" each tagged only \"SHEET\" — contrast \"Call sheet · who is on the job,\" which pairs the studio word with a trade phrase explicitly.",
    "why_it_blocks": "obvious-what-to-do",
    "evidence": {"shots": ["w1440-desk.png"], "refs": ["apps/designer-portal/src/components/document/desk-contents.tsx:204"]},
    "severity": "low", "confidence": 0.6,
    "already_ruled": null,
    "suggested_fix": "Pair the column head once, e.g. \"Ledgers · the books,\" consistent with the row-level pairing pattern already used elsewhere.",
    "hesitation_seconds_estimate": 5
  },
  {
    "id": "U4-15",
    "lens": "U4",
    "persona": null,
    "task_ids": ["T4", "T5", "T6"],
    "key": "doc|1280|off|compact-rail-unlabeled",
    "surface": "/doc/[id] spine", "width": "1280", "flag": "off",
    "title": "1280 compact rail drops every label to an unmarked 56px icon",
    "observation": "At 1180–1439 the spine renders as a 56px icon-only rail with no per-mark text; the running index, rooms block, and shelves block (which carry all the vocabulary this review audits) do not mount at all at this width.",
    "why_it_blocks": "obvious-how-to-get-there",
    "evidence": {"shots": ["w1280-spine-detail.png"], "refs": ["apps/designer-portal/src/components/document/doc-spine.tsx:63", "apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:1047"]},
    "severity": "high", "confidence": 0.85,
    "already_ruled": "C8",
    "suggested_fix": "No copy fix changes the ≥1440 gate itself (structural, C8); at minimum give each icon a visible on-hover text label at 1280 rather than relying on `title` tooltips alone.",
    "hesitation_seconds_estimate": 15
  },
  {
    "id": "U4-16",
    "lens": "U4",
    "persona": null,
    "task_ids": ["T3", "T7"],
    "key": "doc|all|off|review-signing-controls-repeated",
    "surface": "/doc/[id] proposal", "width": "all", "flag": "off",
    "title": "\"Review signing controls\" repeats across unrelated proposal states",
    "observation": "The proposal-lifecycle guide uses \"Review signing controls\" as the action for the draft-fallback branch AND the general fallthrough branch, and the near-identical \"Review countersign controls\" for client_signed — three different situations sharing one undifferentiated verb pair.",
    "why_it_blocks": "obvious-what-to-do",
    "evidence": {"shots": [], "refs": ["apps/designer-portal/src/lib/document/document-guide.ts:261-313"]},
    "severity": "medium", "confidence": 0.8,
    "already_ruled": null,
    "suggested_fix": "Give each proposal state a distinct action phrase naming the actual control (e.g. \"Send for signature,\" \"Countersign the agreement\") instead of the generic \"Review ___ controls\" pattern.",
    "hesitation_seconds_estimate": 10
  },
  {
    "id": "U4-17",
    "lens": "U4",
    "persona": null,
    "task_ids": ["T8", "T12"],
    "key": "doc|all|off|add-to-project-vs-open-a-project",
    "surface": "/doc/[id] + desk + ⌘K", "width": "all", "flag": "off",
    "title": "\"Add to project\" and \"Open a project\" share a word, not a meaning",
    "observation": "FF&E's ledger act reads \"Add to project\" (adds a line/board/import to the current engagement); the Desk header act and ⌘K verb read \"Open a project\" (starts an entirely new engagement, no proposal needed) — both can appear together in ⌘K results.",
    "why_it_blocks": "obvious-what-to-do",
    "evidence": {"shots": [], "refs": ["apps/designer-portal/src/lib/document/registry.tsx:266-278", "apps/designer-portal/src/components/document/ffe-section.tsx:977-981"]},
    "severity": "low", "confidence": 0.55,
    "already_ruled": null,
    "suggested_fix": "Rename the FF&E act to something that doesn't restate \"project,\" e.g. \"Add to the schedule.\"",
    "hesitation_seconds_estimate": 8
  },
  {
    "id": "U4-18",
    "lens": "U4",
    "persona": null,
    "task_ids": ["T15"],
    "key": "doc|1440|off|team-ellipsis-unclear",
    "surface": "/doc/[id] colophon", "width": "1440", "flag": "off",
    "title": "Colophon's \"Team…\" is the one vague act among plain verbs",
    "observation": "Colophon actions read \"Brief a vendor,\" \"Hold,\" \"Archive,\" and \"Team…\" — the first three are plain imperatives naming their result; \"Team…\" is a noun with a trailing ellipsis and does not say it opens the Call Sheet picker.",
    "why_it_blocks": "obvious-what-to-do",
    "evidence": {"shots": [], "refs": ["apps/designer-portal/src/components/document/doc-colophon.tsx:153-165"]},
    "severity": "low", "confidence": 0.7,
    "already_ruled": null,
    "suggested_fix": "Rename to a verb matching its neighbors, e.g. \"Add to the team.\"",
    "hesitation_seconds_estimate": 5
  },
  {
    "id": "U4-19",
    "lens": "U4",
    "persona": null,
    "task_ids": ["T1"],
    "key": "desk|1440|off|contents-eyebrow-vs-canon-name",
    "surface": "/desk", "width": "1440", "flag": "off",
    "title": "Canon's \"Contents Page\" prints on screen as \"The Studio\"",
    "observation": "R95 names this block \"a typographic contents of rooms, ledgers, and begin-verbs\"; the actual on-screen eyebrow directly above it reads \"THE STUDIO,\" not \"Contents\" in any form.",
    "why_it_blocks": "obvious-what-to-do",
    "evidence": {"shots": ["w1440-desk.png"], "refs": ["apps/designer-portal/src/components/document/desk-contents.tsx:183", "docs/design/the-document/DECISIONS.md:2951"]},
    "severity": "low", "confidence": 0.7,
    "already_ruled": "R95/C15",
    "suggested_fix": "No UI change needed — the on-screen name is fine on its own; correct future canon references to call it \"The Studio\" so ledger and product stop drifting.",
    "hesitation_seconds_estimate": 0
  },
  {
    "id": "U4-20",
    "lens": "U4",
    "persona": null,
    "task_ids": ["T3", "T10"],
    "key": "doc|1440|both|two-phase-vocabularies-one-paper",
    "surface": "/doc/[id] project", "width": "1440", "flag": "both",
    "title": "Seven section names and \"The Patina Six\" both print on one paper",
    "observation": "The paper's own spine/section chrome uses the seven names Brief/Discovery/Direction/Proposal/Project/Install/Care, while the Schedule region's own \"Compose a schedule\" option i, on the same document, prints verbatim: \"Consultation · Schematic Design · Design Development · Procurement & Orders · Installation & Styling · Completion — the studio's standard six.\"",
    "why_it_blocks": "obvious-what-to-do",
    "evidence": {"shots": ["w1440-doc-project-rich.png"], "refs": ["apps/designer-portal/src/lib/document/section-derivation.ts:59-67", "apps/designer-portal/src/components/document/schedule/schedule-rule-region.tsx"]},
    "severity": "medium", "confidence": 0.85,
    "already_ruled": "I114 (known-open)",
    "suggested_fix": "Not a Lane A fix alone — flag for the I114 session; short of that, add one line at first mention reconciling the two vocabularies (e.g. \"Project covers Design Development through Procurement & Orders\").",
    "hesitation_seconds_estimate": 20
  },
  {
    "id": "U4-21",
    "lens": "U4",
    "persona": null,
    "task_ids": ["T13"],
    "key": "drawer|1440|off|no-acknowledgment-word-in-orders",
    "surface": "Orders ledger sheet", "width": "1440", "flag": "off",
    "title": "Orders ledger has no visible word for PO acknowledgment",
    "observation": "The Ledger tab's PO rows show only status chips \"RECEIVED / INSPECT,\" \"IN TRANSIT,\" and the line \"NOT SENT\" — no row anywhere in the captured sheet uses the word \"acknowledged,\" \"confirmed,\" or \"ack,\" though T13 is specifically framed as \"did they confirm the PO.\"",
    "why_it_blocks": "obvious-what-to-do",
    "evidence": {"shots": ["w1440-ledger-sheet-orders.png"], "refs": ["docs/design/the-document/the-document-schedule-package.md"]},
    "severity": "medium", "confidence": 0.6,
    "already_ruled": null,
    "suggested_fix": "Print an explicit acknowledgment state per PO row (\"Acknowledged\" / \"Awaiting ack, {n}d\") rather than requiring her to infer it from shipping status.",
    "hesitation_seconds_estimate": 30
  }
]
```

## Answers to the U4 brief questions

**(1) Label inventory (P3's guess vs. actual) — selected, full inventory is `10-code-anatomy.md §6`.**

| Label | What P3 would guess | What it actually is |
|---|---|---|
| `Design authority` | A permissions/access setting | The money region: authorized budget → plan → committed → moved |
| `Knowledge` | Some kind of help/wiki | A shelf that opens the cross-project library — and today opens onto nothing new (dead shelf) |
| `Call sheet` | Unclear on first sight, but the printed subLabel "who is on the job" resolves it immediately | The project's roster/crew list |
| `The Record` | Never seen — doesn't print anywhere | Canon's name for what's visibly labeled "Previous work" |
| `Plan room` | A literal room in the house | A shelf holding the drawing set/floor plans |
| `Spec book` | A binder of specifications — reasonably close | The FF&E items with their specification fields, "by room" |
| `In this document` | A section of body text | The running index heading (approvals/schedule/FF&E/money) |
| `The Post` | Mail, possibly a blog/announcements feed | The client-message inbox |
| `Moved` (money row) | Ambiguous — moved where? | The accounts' committed figure (ordered through installed), not disbursed funds |
| `Ledgers` (Desk column head) | An accounting/bookkeeping term, correct but unglossed | Orders / Accounts / Hours / The Post as a group |

**(2) Proposed pairings.**
- `Design authority` — keep the name (it's distinctive and provenance-flavored); pair the *running-index row* specifically with "· money" so the scent exists everywhere the name appears alone, not only at the region head's small eyebrow (U4-08).
- `Knowledge` — rename the shelf title to match its own eyebrow and destination, "Studio library," until a real Knowledge surface is ruled (U4-09).
- `Call sheet` — no change; already the model pairing ("Call sheet · who is on the job").
- `The Record` — stop using this name in canon going forward; the shipped label "Previous work" already does the job in Patina's voice (U4-03).
- `Plan room` — keep, but watch for the "room" collision with The Rooms/FF&E room groupings (U4-10); rename to "Plan set" only if a first-contact test confirms the confusion.
- `In this document` — keep as-is; plain, accurate, and it correctly disappears with the rest of the shelved spine below 1440 (structural, not lexical).

**(3) One stable name for the guide.** No — today's guide uses eight distinct eyebrow shapes (seven stage eyebrows, plus gate/needs-attention/proposal/paused/unavailable variants) and only the broken-state branch ever says "Next up." Recommend one small stable kicker printed above every guide instance regardless of state, the same way "IN THIS DOCUMENT" anchors the running index (U4-11).

**(4) The seven section names vs. the Patina Six.** Brief+Discovery both map to "Consultation" (a split where the Six has one phase); "Proposal" has no Patina Six analog at all; "Project" silently absorbs both "Design Development" and "Procurement & Orders." The concrete collision a designer trips on: the Project·FF&E paper's own Schedule region offers "The Patina Six" as a literal schedule template option, printing all six names on the same screen whose chrome is built from the seven — two vocabularies, unreconciled, on one document (U4-20).

**(5) Do visible labels speak Programa/Houzz, or only ⌘K?** Only ⌘K. Every alias checked (`catalog`, `pieces`, `crm`, `directory`, `purchase orders`, `timesheet`, etc.) exists solely inside `matchSurfaces`' search-alias arrays; none of them appear in the rendered label inventory. The visible product holds its own voice — worth stating under "What stays true."

**(6) Is it how she'd say it to herself?** Mostly, and where it isn't, it's traceable: the needs-attention reason ("operational signals available on the current document," U4-05) and the money explainer's leftover migration sentence ("Absorbs today's four separate bands," U4-06) are the two clearest places system/engineering language survived into her voice. Everything else spot-checked — "Name the phases for this project," "Wait for the client's signature," "You're on the call sheet as lead. Who else is on the job?" — reads as something she'd actually think.

**(7) Engine/AI drift.** One real instance, at two touch points of the same surface: ⌘K's placeholder ("or ask the Engine…") and its no-match fallback group/row ("Ask the Engine," "The Engine · '{query}'") — U4-01/U4-02. Nothing else in the label inventory names AI, ML, or "powered by" language.

## What stays true

- **"← Put down"** — a trade verb doing real work; do not replace with "Close" or "Exit."
- **"Call sheet · who is on the job"** — the model pairing for every other studio-word/trade-word label on the surface.
- **The seven stage eyebrows** ("Brief · decide the fit," "Care · close the loop," etc.) — plain, distinct, in-voice; keep them as the template for any new state copy.
- **⌘K's visible labels hold the Patina line even though its search aliases speak Programa/Houzz underneath** — the separation is working; don't let aliases leak into visible copy as the registry grows.
- **"Add a room" / "Add the first task" / "Add a maker"** — the scored-ink in-flow acts read as plain, first-person-adjacent instructions, not button labels; keep this register for any new in-flow act.
- **"Field quiet" / "4 moving · 3 reconnecting"** — Studio Pulse's laconic, trade-radio cadence is distinctive and worth protecting as new pulse rows are added.
