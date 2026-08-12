"use client";

/**
 * The queue/list row's ADDITIVE lifecycle glance (ruling R7, WP4 Track 3 —
 * Rail A adoption). A 12px current-position stamp plus the contract's next
 * gate (`nextGate`, respecting `sealable`), rendered ALONGSIDE a row's
 * existing operational vocabulary (`derived_status` / PoState words) —
 * never replacing it. BOH operators keep their working vocabulary; the
 * fifteen-step grammar is additive presentation, per the checkpoint's
 * unified-contract ruling. Ledger density: one current stamp + next gate,
 * M7 (folio 12).
 *
 * No live step (an unrecognized or not-yet-derivable position) renders a
 * quiet dashed placeholder rather than fabricating a position — the same
 * honesty rule the trail itself follows for `future`.
 */

import {
  PROCUREMENT_LIFECYCLE_GATES,
  liveStep,
  nextGate,
  procurementStepLabel,
  type ProcurementLifecycleReading,
} from "@patina/types";

function gateLabel(key: string): string {
  return PROCUREMENT_LIFECYCLE_GATES.find((g) => g.key === key)?.label ?? key;
}

export function LineLifecycleGlance({
  reading,
}: {
  reading: ProcurementLifecycleReading;
}) {
  const live = liveStep(reading);
  const gate = nextGate(reading);

  return (
    <span
      data-testid="lifecycle-glance"
      className="inline-flex items-baseline gap-2"
    >
      <span
        data-testid="lifecycle-glance-stamp"
        className="inline-block -rotate-[1.5deg] whitespace-nowrap rounded-[3px] border-[1.5px] bg-transparent px-[9px] py-[3px] text-[12px] font-semibold uppercase tracking-[0.08em]"
        style={
          live
            ? {
                fontFamily: "var(--font-meta)",
                borderColor: "var(--color-clay)",
                color: "var(--color-charcoal)",
              }
            : {
                fontFamily: "var(--font-meta)",
                borderColor: "var(--color-pearl)",
                color: "var(--text-muted)",
              }
        }
      >
        {live
          ? `${String(live.ordinal).padStart(2, "0")} · ${procurementStepLabel(live.key)}`
          : "—"}
      </span>
      <span
        data-testid="lifecycle-glance-next-gate"
        className="whitespace-nowrap text-[12px] uppercase tracking-[0.04em]"
        style={{ fontFamily: "var(--font-meta)", color: "var(--text-muted)" }}
      >
        Next gate:{" "}
        {gate
          ? `${gateLabel(gate.key)}${gate.state === "open" && gate.qualifier ? ` · ${gate.qualifier}` : ""}`
          : "—"}
      </span>
    </span>
  );
}
