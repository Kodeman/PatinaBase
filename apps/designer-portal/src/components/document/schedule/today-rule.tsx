'use client';

/**
 * Today rule — the Schedule Spine's "you are here" line (C6, Slice 01 read).
 * Prototype: `.mb-today` in the-document-schedule-master-direction.html.
 *
 * A 1.5px solid charcoal rule that spans BOTH grid columns — it must visibly
 * cross the 30px spine column so today reads as a cut through the ledger, not
 * a decoration beside it. The label sits above-right in DM Mono. Spliced into
 * the main-lane phase list at `todayIndex` by the orchestrator. Zero shadows
 * (D4): the rule IS the depth cue.
 */

import { fmtDay } from '@/lib/document/format';

export interface TodayRuleProps {
  /** 'YYYY-MM-DD' — the same injected today the resolver read. */
  today: string;
}

export function TodayRule({ today }: TodayRuleProps) {
  return (
    <div
      role="separator"
      aria-label={`Today · ${fmtDay(today)}`}
      className="mb-[1.4rem] mt-[0.2rem] grid grid-cols-[30px_minmax(0,1fr)] gap-x-[1.1rem]"
    >
      <div className="relative col-span-2 h-[1.5px] bg-[var(--color-charcoal)]">
        <span className="absolute right-0 top-[-17px] whitespace-nowrap font-mono text-[0.58rem] font-medium uppercase tracking-[0.09em] text-[var(--color-charcoal)]">
          Today · {fmtDay(today)}
        </span>
      </div>
    </div>
  );
}
