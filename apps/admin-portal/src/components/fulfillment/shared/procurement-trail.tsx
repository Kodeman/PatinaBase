"use client";

/**
 * The procurement stamp trail (ruling R7, deck mockup M7), ported for the
 * admin portal's Back-of-House line detail (WP4 Track 3 — Rail A adoption).
 *
 * This is a LOCAL duplicate of
 * `apps/designer-portal/src/components/document/procurement-trail.tsx`. The
 * two portals share no components package, and the piece is small enough
 * that duplicating it beats a new cross-portal dependency — noted in
 * DECISIONS.md. Keep the two in sync by hand if the contract's rendering
 * grammar (`@patina/types` `procurement-lifecycle.ts`) changes.
 *
 * Same grammar as the Document's trail: settled steps stamp in mocha, the
 * live step stamps in clay, future steps stand dashed and empty (visible so
 * the operator knows what's coming, unstamped so nothing reads as having
 * happened), and a step the book has no fact for reads "no record" — a
 * different claim than "not yet". Type floor 12px, zero shadows (D4).
 *
 * Admin-portal's token set has no `--color-quiet-ink` equivalent to the
 * Document's; `--text-muted` (aged oak) stands in for it throughout.
 */

import { Fragment } from "react";
import {
  PROCUREMENT_LIFECYCLE_GATES,
  PROCUREMENT_LIFECYCLE_STEPS,
  type ProcurementGateReading,
  type ProcurementLifecycleReading,
  type ProcurementStepReading,
} from "@patina/types";

/** DATE columns can arrive as bare `YYYY-MM-DD` or a full timestamp; the bare
 *  form is parsed as LOCAL midnight so the rendered day never slips
 *  backwards in negative-offset timezones. Mirrors the Document's fmtDay. */
function fmtDay(iso: string): string {
  const asDate = /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T00:00:00`)
    : new Date(iso);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(asDate);
}

/** M7's stamp grammar at the 12px floor — border + ink color, −1.5° rotation,
 *  transparent fill. Matches the Document trail's TrailStamp exactly. */
function TrailStamp({
  label,
  color,
  ink,
}: {
  label: string;
  color: string;
  ink?: string;
}) {
  return (
    <span
      className="inline-block -rotate-[1.5deg] whitespace-nowrap rounded-[3px] border-[1.5px] bg-transparent px-[9px] py-[3px] text-[12px] font-semibold uppercase tracking-[0.08em]"
      style={{
        fontFamily: "var(--font-meta)",
        borderColor: color,
        color: ink ?? color,
      }}
    >
      {label}
    </span>
  );
}

function StepRow({
  step,
  label,
}: {
  step: ProcurementStepReading;
  label: string;
}) {
  const ordinal = String(step.ordinal).padStart(2, "0");
  // Absent dates stay absent — an evidence row with no date is still evidence.
  const on = step.evidence?.at ? fmtDay(step.evidence.at) : null;

  return (
    <li
      data-trail-step={step.key}
      data-trail-state={step.state}
      className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-baseline gap-x-2 py-[3px]"
    >
      <span
        aria-hidden
        className="text-[12px] tracking-[0.04em]"
        style={{
          fontFamily: "var(--font-meta)",
          color:
            step.state === "settled" || step.state === "live"
              ? "var(--color-charcoal)"
              : "var(--text-muted)",
        }}
      >
        {ordinal}
      </span>
      <span className="min-w-0">
        {step.state === "settled" && (
          <TrailStamp
            label={on ? `${label} · ${on}` : label}
            color="var(--color-mocha)"
          />
        )}
        {step.state === "live" && (
          <TrailStamp
            label={on ? `${label} · ${on}` : label}
            color="var(--color-clay)"
            ink="var(--color-charcoal)"
          />
        )}
        {step.state === "future" && (
          <span
            className="inline-block whitespace-nowrap rounded-[3px] border border-dashed bg-transparent px-[9px] py-[3px] text-[12px] uppercase tracking-[0.08em]"
            style={{
              fontFamily: "var(--font-meta)",
              borderColor: "var(--color-pearl)",
              color: "var(--text-muted)",
            }}
          >
            {label}
          </span>
        )}
        {step.state === "no-record" && (
          <span className="inline-flex flex-wrap items-baseline gap-x-2 py-[3px]">
            <span
              className="text-[12px] uppercase tracking-[0.08em]"
              style={{
                fontFamily: "var(--font-meta)",
                color: "var(--text-muted)",
              }}
            >
              {label}
            </span>
            <span
              className="text-[12px] italic"
              style={{
                fontFamily: "var(--font-display)",
                color: "var(--text-muted)",
              }}
            >
              no record
            </span>
          </span>
        )}
      </span>
    </li>
  );
}

/** A gate is a stop, so it is drawn across the run rather than beside it. */
function GateBar({
  gate,
  label,
}: {
  gate: ProcurementGateReading;
  label: string;
}) {
  // The oak stop bar marks a gate the work is standing at or was sealed by. A
  // gate the work has already gone past unsealed gets NO stop: finished work
  // must never be drawn as blocked, and an unrecorded seal must never be
  // drawn as given — it stays on the page, quiet, as the honest report that
  // nothing was written down here.
  const reached = gate.state === "settled" || gate.state === "open";
  return (
    <li
      data-trail-gate={gate.key}
      data-trail-state={gate.state}
      className="my-1 border-l-[3px] py-1.5 pl-2.5"
      style={{
        borderColor: reached ? "var(--color-aged-oak)" : "var(--color-pearl)",
      }}
    >
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span
          className="text-[12px] uppercase tracking-[0.1em]"
          style={{
            fontFamily: "var(--font-meta)",
            color: reached ? "var(--color-aged-oak)" : "var(--text-muted)",
          }}
        >
          Gate
        </span>
        <span
          className="text-[13px]"
          style={{
            fontFamily: "var(--font-display)",
            color: reached ? "var(--color-charcoal)" : "var(--text-muted)",
          }}
        >
          {label}
        </span>
        {gate.state === "settled" && (
          <TrailStamp label="Settled" color="var(--color-sage)" />
        )}
        {gate.state === "open" && gate.qualifier && (
          <span
            className="text-[12px] italic"
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--text-muted)",
            }}
          >
            {gate.qualifier}
          </span>
        )}
        {(gate.state === "no-record" || gate.state === "passed-unsealed") && (
          <span
            className="text-[12px] italic"
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--text-muted)",
            }}
          >
            no record
          </span>
        )}
      </span>
    </li>
  );
}

export function ProcurementTrail({
  reading,
}: {
  reading: ProcurementLifecycleReading;
}) {
  return (
    <div data-procurement-trail className="mb-3">
      <p
        className="mb-1.5 text-[12px] uppercase tracking-[0.08em]"
        style={{ fontFamily: "var(--font-meta)", color: "var(--text-muted)" }}
      >
        Lifecycle
      </p>
      {/* One flat run, gates interrupting it — M7's `ol.trail`. */}
      <ol className="list-none">
        {PROCUREMENT_LIFECYCLE_STEPS.map((step, index) => {
          const gate = PROCUREMENT_LIFECYCLE_GATES.find(
            (g) => g.afterStep === step.ordinal,
          );
          const gateReading = gate
            ? reading.gates.find((g) => g.key === gate.key)
            : undefined;
          return (
            <Fragment key={step.key}>
              <StepRow step={reading.steps[index]} label={step.label} />
              {gate && gateReading && (
                <GateBar gate={gateReading} label={gate.label} />
              )}
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}
