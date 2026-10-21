# US-45 W3-V visual report (SQ-1531)

Local Supabase only (127.0.0.1:54321), synthetic households, base 837eae94c. Captures use a framing harness (iframe at 1440/640/390/360). A grey gutter of about 30px per side appears in 1440 shots, and the Next dev "N" badge is a dev artifact. No payment, signature or send was completed except the recorded approval on the synthetic `record` household.

Severity: H high, M medium, L low.

## Overall
Forest `#3E5145` is consistent on client terminals, choice buttons, links and the recorded block. Cards are framed. Clay/ochre leftovers (A2) and non-forest focus rings on text fields are the main defects.

## R2 pixel check (pay terminal "Continue to secure payment · $9,130.00", ACH fee included)
| Width | Terminal | Overflow |
|---|---|---|
| 1440 / 640 | 354x48 | none |
| 390 | 308x66, wraps to 2 lines | none (scrollWidth = clientWidth) |
| 360 | 278x66 | none |
| 320 | 238x66 | none |

PASS for the payment terminal. 200% zoom was not run separately (360 CSS px is its equivalent). The approval fixture has a $0 cost delta, so there was no amount label to test: UNVERIFIED for approval amounts.

## US-45 client portal
| File | Verdict | Issues |
|---|---|---|
| client-arrival-project-390 / 1440 | pass with defects | M: strata mark and "PREPARED FOR" in clay/ochre; `--threshold-accent #8A5F19`. M (verify): says "Nothing waits for your name." while an approval is open (may be a fixture artifact). |
| client-approval-ask-open-390, client-approval-ask-1440 | pass with defects | M: mono underlined chips (REMIND ME..., CHOOSE ANOTHER RESPONSE, WHAT CHANGED SINCE YESTERDAY) read clay. L: mono helper text looks under 15px (not measured). |
| client-approve-picked-390, client-approval-choice-picked-1440 | pass with defects | M: name input and change-request textarea show the browser-default blue outline (`rgb(0,95,204) auto 1px`) rather than forest `--focus-ring`. Picked choice is filled forest (good). |
| client-unavailable-reason-390 | pass | Unavailable terminal has a record-green fill and dashed border, with a visible 15px reason line linked by aria-describedby. |
| client-terminal-available-390 | pass | Forest filled terminal, 48px or taller. |
| client-hold-mid-press-390 | pass | `data-hold-state=holding`, 900ms. L: stray caret glyph at the left of the terminal. Hold cancelled, nothing recorded. |
| client-pause-confirm-390 | pass | "Confirm pause" forest terminal. Review-confirm interpreted as this confirm state, because an unconfirmed review decision could not be seeded ("every frozen required reviewer must confirm before publish"). |
| client-recorded-approval-390 / 1440 | pass with defect | M: brown double-ruled "APPROVED" stamp inside the green record block (clay). |
| client-invoices-390 / 1440 | pass | Cards framed; View invoice outline-green, 44px or taller. M: PRINT INVOICE and KEEP A COPY chips are clay mono. |
| client-paysheet-390 / 1440 | pass | Selected row uses a green note. |
| client-processing-390 / 1440 | pass | Reads "Confirmation is pending. You don't need to pay again." |
| client-r2-pay-terminal-360 / 640 | pass | See R2. |
| client-arrival-studio-390 / 1440, client-invoices-studio-390 / 1440 | pass with defects | Same clay leftovers as arrival. |
| client-progress-with-ask-390, client-progress-1440 | pass | Progress rows render. |
| client-progress-sourced-next-390 | pass | Now/Next/Target date from phases. |
| client-progress-no-stage-390, client-progress-empty-no-next-390 | pass | "No project stage" and "Your designer will share the next step here." |
| client-progress-error-studio-390 | pass | Empty/error state "project isn't connected" is calm. |
| client-invite-used-390, client-invite-open-390 | pass | Forest terminals. |
| client-invite-expired-390 | pass with defect | L: bare page, large empty space. |

## US-45 designer portal (partial)
| File | Verdict | Issues |
|---|---|---|
| designer-project-completed-1440 | pass | Completed status "CLOSED"; charcoal "Run the closeout checklist" button. |
| designer-desk-tour-modal-1440 | n/a | First-run tour overlay. |
| designer-project-cedar-1440 / -scrolled-1440 / -390 | observed | Charcoal "Check what's arriving" button; clay-brown underlined mono links in designer chrome (expected for designer tier). |
| designer-boards-empty-1440 | observed | Empty state only. |

NOT CAPTURED (UNVERIFIED): Approved verdict chip, `.da-terminal` forest act, success notice. `.da-terminal` is unconditional only in the procurement order paper, record-payment sheet and agreement composer. In the invoice folio, review-release sheet and record-payment it appears only under the `one-voice` flag, which is off locally, and no seeded fixture reached those surfaces in the time available. Code observation: `.da-terminal` is mono 12px uppercase.

## US-46 (partial, UNVERIFIED)
Paper band, `.da-plate` "Next" and region head were not captured in the lens-band surface. Only the closest observed charcoal action ("Complete the installation / Check what's arriving", in a ruled strip at 1440 and 390) is in `designer-project-cedar-*`. It is a flat charcoal button with sentence-case body font and a distinct ruled strip. No forest terminal was on the same screen, so the plate-versus-terminal tier question stays open. Follow-up: seed a lens-band project and an order paper, then re-shoot.

## Designer + US-46 (W3-V2)
Ticket SQ-1551. Local only (127.0.0.1:54321), designer portal on :3000 run from this worktree with `one-voice` and `the-document-pilot` set through `NEXT_PUBLIC_FLAG_OVERRIDES` (no PostHog change). Captured with real Chromium viewports of 1440x900 and 390x844 (no framing gutter, but the Next dev "N" badge is a dev artifact). Fixtures are synthetic: three client verdicts on a new draft proposal (W3V synthetic draft), and one W3V invoice recorded paid on each of two synthetic houses ($9,125 recorded at 1440, $500 at 390; nothing was sent). The Aspen Loft project was only opened, nothing there was changed.

| File | Verdict | Issues |
|---|---|---|
| designer-terminal-record-payment-1440 / 390 | pass | Forest `.da-terminal` "Record the payment · $4,250.00" measured rgb(62,81,69) fill, rgb(255,253,249) ink, 48px high, 3px radius, label 16px sentence-case body font (the mono 12px uppercase rule applies to the button's wrapper but the visible label is Inter). No overflow at 390. L: the form fields above it use browser-default select and tiny 12px mono labels. |
| designer-paid-success-notice-1440 / 390 | pass with defect | After recording, the folio shows PAID, balance $0.00 in green, a "SUCCEEDED" payment row and the notice "PAYMENT OF $9,125.00 RECORDED". M: the notice is a quiet grey mono line at the foot of a long sheet, so it can sit below the fold on a short screen (390). L: the PAID header line itself is plain ink, only the balance figure is green. |
| designer-approved-chip-line-1440 / 390 | pass | "APPROVED" chip is outlined with a forest dot and forest edge. Flagged shows a clay dot and Noted a muted dot on the same row group, so the green record reads as the settled state. L: at 390 the line card is stacked tall; chip sits under the card, not beside it. |
| designer-us46-band-plate-1440 | pass | Paper band: "PROJECT · ASPEN LOFT REFRESH / NEXT — Awaiting the client: 2 decisions overdue" with the charcoal square `.da-plate` "Contact the client" (44px, 15px Inter semibold, no radius) in the same ruled strip. |
| designer-us46-band-plate-390 | pass with defect | At 390 the band is text only ("NEXT OVERDUE 5D · DECISIONS") and the plate moves to the fixed bottom bar next to "MORE". L: the plate label wraps to two lines ("Contact the client") in the bar at 390, and "Open the pieces" does the same. |
| designer-us46-region-head-1440 / 390 | pass | Left-stacked head for FF&E selections: name with "Collapse" (Fold) beside it, lead "No selections yet. · nothing released" under, tools row (Add items, Edit selections, Prepare purchasing authorization, More) beneath. 390 keeps the same stack with the tools row wrapping. |
| designer-us46-region-head-financials-1440 / 390 | pass | Project financials head follows the same order: eyebrow, name + Collapse, lead line, tools row (Record the payment, Draft an invoice, Details). |

Plate versus terminal tiers: the plate and a forest terminal were NOT captured on one screen. The invoice folio that holds the terminal is modal and covers the band, and the order paper and agreement composer were not reachable with the seeded data in this pass (UNVERIFIED). Judged from the two separate screens plus measured values, they read as different tiers: the plate is charcoal, square, 44px and sits in the ruled band or mobile bar as a pointer to the next move, while the terminal is forest, rounded 3px, 48px and appears only inside a sheet to commit an act. M (open): because they were not seen together, whether a designer confuses "Contact the client" with a commit act is unproven.

Still not captured: agreement composer and procurement order paper terminals, and a green completed status in the designer portal beyond the earlier "CLOSED" shot.

## Findings summary
1. M: clay/ochre leftovers on client surfaces (strata mark, `--threshold-accent`, mono chips, PREPARED FOR, APPROVED stamp).
2. M: text inputs use the browser-default blue focus ring, not forest.
3. M (verify): "Nothing waits for your name." shown beside an open approval.
4. L: stray caret glyph while holding; sub-15px mono helper text (not measured); bare expired-invite page.
5. Gaps: designer Approved chip, `.da-terminal`, success notice and the US-46 captures are not done, and approval-amount R2 was not testable.
