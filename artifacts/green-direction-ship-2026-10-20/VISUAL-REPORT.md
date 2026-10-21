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

## Findings summary
1. M: clay/ochre leftovers on client surfaces (strata mark, `--threshold-accent`, mono chips, PREPARED FOR, APPROVED stamp).
2. M: text inputs use the browser-default blue focus ring, not forest.
3. M (verify): "Nothing waits for your name." shown beside an open approval.
4. L: stray caret glyph while holding; sub-15px mono helper text (not measured); bare expired-invite page.
5. Gaps: designer Approved chip, `.da-terminal`, success notice and the US-46 captures are not done, and approval-amount R2 was not testable.
