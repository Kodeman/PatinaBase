# RC-6 R2 (Codex Astra) — lenses 2 money + 3 C4/C6 — verdict NOT-READY (fix-then-ship; money holds)
1 HIGH/high  client-portal service-acceptance.tsx:170 + iOS ServiceAcceptanceDetailView.swift:130 — accept without seeing scope/evidence (useMyServiceAcceptanceEvidence never wired); hold controls until evidence loads.
2 HIGH/high  00894:86 household profile_id relink transfers signer authority w/o consent (ALREADY KNOWN — Kody ruling).
3 HIGH/high  00888:383 + 00886:1340 edition creation copies predecessor phase bindings; excluded package's open phase still blocks completion (agreed_phase_open). Evaluate against active edition included obligations + regression test.
4 MED/high   00891:115 + 00886:889 all-paper-only unlinked household signers: no address -> request never 'sent' -> paper intake (requires sent) impossible. Need attributed offline-presentation transition.
5 MED/high   _shared/outbound-kinds/service_acceptance_request.ts:47 relink between compose and Send delivers to stale account; detect identity change, invalidate/recompose for review.
6 LOW/high   purchase-lens.tsx:269 schedule/room read errors discarded (endless "Reading the schedule…", false "Not in a room yet").
7 LOW/high   service-acceptance-paper-hash/handler.ts:61 stops after 20x100 pages -> false paper_document_not_found.
8 INFO       00892 independent of redesign; separate hotfix decision (already known).
Confirmed: Stripe/orders untouched; close_project + apply_invoice_payment_effects bodies match baseline; 00882 redefines invoice issuance (locking only, math unchanged); external conversion zeroes studio prices; C4/C6 separate records, no closure-field writes; grants withheld; drafts awaiting_review.
Edge deploy set: send-authority change is type-only but policy => redeploy ALL importers (~43 fns incl stripe-webhook) + service-acceptance-paper-hash.
