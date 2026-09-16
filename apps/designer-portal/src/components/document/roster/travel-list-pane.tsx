"use client";

/**
 * THE TRAVEL LIST (SPEC §5.7 #5, CRM-24, PR-b).
 *
 * "Picking a repeat sub carries a name and a phone, and nothing says that
 *  consent, document expiries and contact rules travel while pricing and
 *  project notes must not."
 *
 * So the picker says it, in a fixed list, before the confirm. The list is
 * FIXED — it is the contract, not a reading of the rows in hand — because the
 * studio is being told what the act will do, not what these four people happen
 * to carry today.
 *
 * At 1440 it sits beside the list; at 390 it follows it (SPEC §5.7 #9). One
 * component, one order, `flex-wrap` deciding which.
 */

/** What follows a person onto the new job (crm-model CRM-24). */
export const TRAVELS: readonly string[] = [
  "identity",
  "typed channels",
  "contact rule",
  "consent by channel value",
  "document expiries",
  "one history line",
];

/** What is left on the job it came from — never carried, never inferred. */
export const STAYS_BEHIND: readonly string[] = [
  "prior pricing",
  "prior project notes",
  "show to client",
];

const HEAD =
  "font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-clay-ink)]";
const ITEM = "text-[0.74rem] leading-relaxed text-[var(--color-charcoal)]";

export function TravelListPane({ className }: { className?: string }) {
  return (
    <aside
      data-travel-list
      aria-label="What travels"
      className={`border-l-2 border-[var(--color-pearl)] bg-white/40 px-3 py-3 ${className ?? ""}`}
    >
      <p className={HEAD}>What travels</p>
      <ul data-travels className="mt-1.5 m-0 list-none p-0">
        {TRAVELS.map((item) => (
          <li key={item} className={ITEM}>
            {item}
          </li>
        ))}
      </ul>

      <p className={`${HEAD} mt-3`}>What stays behind</p>
      <ul data-stays-behind className="mt-1.5 m-0 list-none p-0">
        {STAYS_BEHIND.map((item) => (
          <li key={item} className={ITEM}>
            {item}
          </li>
        ))}
      </ul>
    </aside>
  );
}
