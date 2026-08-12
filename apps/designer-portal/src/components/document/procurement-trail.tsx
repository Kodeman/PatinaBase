'use client';

/**
 * The procurement stamp trail (ruling R7, deck mockup M7).
 *
 * Fifteen numbered steps and three gates, drawn as marks on the line rather
 * than a status field on a row. Settled steps carry a stamp; the live step
 * carries one in clay; future steps stand outlined and unstamped — visible, so
 * the designer knows what is coming, and empty, so she knows it has not
 * happened. A step the book has no fact for is quiet and says "no record",
 * which is not the same claim as "not yet".
 *
 * Type floor: the trail's own stamps are 12px, NOT the 10px `Stamp` component.
 * M7's miniatures are a plate device and do not ship (WP3 gate, I114–I120).
 * Depth is border and value contrast only — D4, zero shadows.
 *
 * Exceptions keep the existing stamp kinds (damaged, partial) on the line's
 * own stamp; the trail adds no badge genre, and nothing about overdue appears
 * here — R4's device belongs to the margin and the Desk.
 */

import { Fragment } from 'react';
import {
  PROCUREMENT_LIFECYCLE_GATES,
  PROCUREMENT_LIFECYCLE_STEPS,
  type ProcurementGateReading,
  type ProcurementLifecycleReading,
  type ProcurementStepReading,
} from '@patina/types';
import { fmtDay } from '@/lib/document/format';
import { Stamp } from './stamp';

/** M7's stamp grammar at the 12px floor — the shared mark, one size up. */
function TrailStamp(props: { label: string; color: string; ink?: string }) {
  return <Stamp {...props} size="sm" />;
}

function StepRow({
  step,
  label,
}: {
  step: ProcurementStepReading;
  label: string;
}) {
  const ordinal = String(step.ordinal).padStart(2, '0');
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
        className={`font-mono text-[12px] tracking-[0.04em] ${
          step.state === 'settled' || step.state === 'live'
            ? 'text-[var(--color-quiet-ink)]'
            : 'text-[var(--color-pearl)]'
        }`}
      >
        {ordinal}
      </span>
      <span className="min-w-0">
        {step.state === 'settled' && (
          <TrailStamp
            label={on ? `${label} · ${on}` : label}
            color="var(--color-mocha)"
          />
        )}
        {step.state === 'live' && (
          <TrailStamp
            label={on ? `${label} · ${on}` : label}
            color="var(--color-clay)"
            ink="var(--color-charcoal)"
          />
        )}
        {step.state === 'future' && (
          <span className="inline-block whitespace-nowrap rounded-[3px] border border-dashed border-[var(--color-pearl)] bg-transparent px-[9px] py-[3px] font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-quiet-ink)]">
            {label}
          </span>
        )}
        {step.state === 'no-record' && (
          <span className="inline-flex flex-wrap items-baseline gap-x-2 py-[3px]">
            <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-quiet-ink)]">
              {label}
            </span>
            <span className="font-heading text-[12px] italic text-[var(--color-quiet-ink)]">
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
  // The oak stop bar marks a gate the work is standing at or was sealed by.
  // A gate the work has already gone past unsealed gets NO stop: finished work
  // must never be drawn as blocked, and an unrecorded seal must never be drawn
  // as given. It stays on the page, quiet, as the honest report that nothing
  // was written down here.
  const reached = gate.state === 'settled' || gate.state === 'open';
  return (
    <li
      data-trail-gate={gate.key}
      data-trail-state={gate.state}
      className={`my-1 border-l-[3px] py-1.5 pl-2.5 ${
        reached
          ? 'border-[var(--color-aged-oak)]'
          : 'border-[var(--color-pearl)]'
      }`}
    >
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span
          className={`font-mono text-[12px] uppercase tracking-[0.1em] ${
            reached
              ? 'text-[var(--color-aged-oak)]'
              : 'text-[var(--color-quiet-ink)]'
          }`}
        >
          Gate
        </span>
        <span
          className={`font-heading text-[13px] ${
            reached
              ? 'text-[var(--color-charcoal)]'
              : 'text-[var(--color-quiet-ink)]'
          }`}
        >
          {label}
        </span>
        {gate.state === 'settled' && (
          <TrailStamp label="Settled" color="var(--color-sage)" />
        )}
        {gate.state === 'open' && gate.qualifier && (
          <span className="font-heading text-[12px] italic text-[var(--color-quiet-ink)]">
            {gate.qualifier}
          </span>
        )}
        {(gate.state === 'no-record' || gate.state === 'passed-unsealed') && (
          <span className="font-heading text-[12px] italic text-[var(--color-quiet-ink)]">
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
      <p className="doc-type-meta mb-1.5 uppercase tracking-[0.08em] text-[var(--color-quiet-ink)]">
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
