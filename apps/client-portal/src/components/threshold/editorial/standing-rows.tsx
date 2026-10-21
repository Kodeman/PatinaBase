/* Three standing rows under the hero, in a fixed order at every width and in
   every phase (R-v2-13). Status in words: no counts against a total, no
   denominators, no percentages (V9). */

export type StandingRole = 'letterbox' | 'approvals' | 'ledger';

export const STANDING_ORDER: readonly StandingRole[] = ['letterbox', 'approvals', 'ledger'];

/** PLAN R-v2-13 zero states, in the same role order. */
export const STANDING_ZERO: Readonly<Record<StandingRole, string>> = {
  letterbox: 'Nothing new since your last visit',
  approvals: 'Nothing waiting on you',
  ledger: 'No invoices open',
};

const MEASURES: readonly RegExp[] = [/\d\s*\/\s*\d/, /%/, /\bper\s*cent\b/i, /\bpercent\b/i];

/** A sentence that measures her (a fraction, a percentage) is refused. */
export function isStandingSentence(text: string): boolean {
  return text.trim().length > 0 && !MEASURES.some((re) => re.test(text));
}

export interface StandingRow {
  sentence: string | null;
  /** True only when the row's act carries an amount: the forest fill. */
  amountAct?: boolean;
}

export type StandingRowsProps = Record<StandingRole, StandingRow> & { label?: string };

export function StandingRows({ label = 'Where things stand', ...rows }: StandingRowsProps) {
  return (
    <ul aria-label={label} className="ed-standing">
      {STANDING_ORDER.map((role, i) => {
        const row = rows[role];
        const sentence = row.sentence && isStandingSentence(row.sentence) ? row.sentence : STANDING_ZERO[role];
        return (
          <li key={role}>
            <a
              className="ed-standing__row"
              href={`#${role}`}
              data-standing-row={i + 1}
              data-act={row.amountAct ? 'amount' : undefined}
            >
              {sentence}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
