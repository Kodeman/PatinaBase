"use client";

/**
 * Supervision — what the studio charges for running the job, and the one rule
 * that has to be enforced by the template rather than left to drafting.
 *
 * THE NO-DOUBLE-COUNT RULE (research 02 §3, §9 item 6, build sheet §4.3).
 * A studio that bills a supervision fee AND takes a markup on the trades is
 * paid twice for one oversight. Three layers hold it, one sentence:
 *
 *   · here, the moment both figures are non-zero;
 *   · `upsert_agreement_parts`, which refuses the save;
 *   · `send_commercial_document`, which refuses the send.
 *
 * The sentence is the database's own, read from `@patina/types` — this is the
 * one place it is safe to render a validator's message verbatim, because we
 * authored the message.
 */

import { Input, Textarea } from "@/components/ui/controls";
import { DESIGN_BUILD_COPY } from "@patina/types";
import {
  readSubMarkupBps,
  readSupervision,
  validateNoDoubleCount,
} from "@/lib/document/design-build";
import { dollars, toCentsOrNull } from "../part-kinds";
import { payloadOf, TURNKEY_PART_KEYS, type TurnkeyContext } from "./context";
import { bpsToPercent, percentToBps } from "./money";
import type { TurnkeyEditorProps } from "./pricing-basis-editor";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-subtle)]";

export function SupervisionClause({
  payload,
  onChange,
  readOnly,
  turnkey,
}: TurnkeyEditorProps) {
  const supervision = readSupervision(payload);
  const subMarkupBps = readSubMarkupBps(
    payloadOf(turnkey, TURNKEY_PART_KEYS.pricingBasis),
  );
  const refusal = validateNoDoubleCount({ supervision, subMarkupBps });

  const write = (next: Record<string, unknown>) =>
    onChange({ ...payload, ...next });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={LABEL}>
          Supervision fee · dollars
          <Input
            className="mt-2"
            inputMode="decimal"
            aria-label="Supervision fee dollars"
            aria-invalid={refusal !== null}
            disabled={readOnly}
            value={dollars(supervision.supervisionFeeCents)}
            onChange={(event) =>
              write({ supervisionFeeCents: toCentsOrNull(event.target.value) })
            }
          />
        </label>
        <label className={LABEL}>
          Supervision fee · percent
          <Input
            className="mt-2"
            inputMode="decimal"
            aria-label="Supervision fee percent"
            aria-invalid={refusal !== null}
            disabled={readOnly}
            value={bpsToPercent(supervision.supervisionFeeBps)}
            onChange={(event) =>
              write({ supervisionFeeBps: percentToBps(event.target.value) })
            }
          />
        </label>
      </div>

      <label className={LABEL}>
        Body
        <Textarea
          className="mt-2 min-h-32 normal-case tracking-normal"
          disabled={readOnly}
          value={supervision.body}
          onChange={(event) => write({ body: event.target.value })}
          placeholder="The language the client reads and signs."
        />
      </label>

      {refusal && (
        <div
          data-no-double-count="true"
          className="border-l-2 border-[var(--color-clay-ink)] pl-3"
        >
          <p
            role="alert"
            className="text-[12px] leading-relaxed text-[var(--color-charcoal)]"
          >
            {refusal}
          </p>
          <p className="mt-1 text-[11px] italic leading-relaxed text-[var(--text-muted)]">
            {DESIGN_BUILD_COPY.noDoubleCountAside}
          </p>
        </div>
      )}
    </div>
  );
}
