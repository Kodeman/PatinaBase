'use client';

/**
 * The standing sheet (OD-6, L-11).
 *
 * Every standing exception the document is carrying, ranked worst first, each
 * with its own act — the `NEEDS ATTENTION · IN ONE PLACE` block's content moved
 * into an overlay rather than deleted, and strictly more than the two
 * `deriveTicketSeam` used to print before dropping the third whole (F50).
 *
 * It is the shipped `DocSheet` at every width: `fixed inset-0`, Esc and the
 * put-back word close it, and focus returns to the band's door it was opened
 * from (`+N MORE`, or `Standing · N` under `one-voice`).
 */

import { AlertCircle } from 'lucide-react';
import { useId, type ReactNode, type RefObject } from 'react';
import type {
  LensAct,
  LensInputItem,
  LensSetupItem,
  LensStandingItem,
} from '@/lib/document/lens-band-derivation';
import { classOfStandingRow, compareForNext } from '@/lib/document/need-class';
import { DocumentAction, DocumentActionGroup } from './document-action';
import { DocSheet } from './overlays/doc-sheet';

const ROW =
  'grid grid-cols-[1fr_auto] items-center gap-x-3 border-b border-dashed border-[rgba(139,115,85,0.14)] py-2.5 last:border-b-0';
const EYEBROW_BASE = 'font-mono text-[11px] uppercase tracking-[0.08em]';
/** Standing exceptions — something is wrong. */
const EYEBROW = `${EYEBROW_BASE} text-[var(--color-terracotta-ink)]`;
/** D1 — an open input is not an exception. Clay-ink is the register for work
 *  still to be done; terracotta is reserved for what has gone wrong. */
const INPUT_EYEBROW = `${EYEBROW_BASE} text-[var(--color-clay-ink)]`;
/** D2 — a group's eyebrow names a kind of work, not an alarm. */
const GROUP_EYEBROW = `${EYEBROW_BASE} text-[var(--text-muted)]`;
const SENTENCE = 'mt-0.5 font-heading text-[14px] text-[var(--color-charcoal)]';
/** D10 — a setup row is work not yet begun, so it reads in clay ink too. */
const SETUP_SENTENCE = 'min-w-0 font-heading text-[14px] text-[var(--color-clay-ink)]';
/** A heading under a list stands under its own rule.
 *
 *  N-06 — a COLOUR token, not `--rule-mid`: that one is the shorthand
 *  `1.5px solid #2C2926`, and `border-<arbitrary>` sets `border-color` only,
 *  so the declaration was invalid and the rule fell back to `currentColor` — a
 *  terracotta hairline inherited from the eyebrow class on the same element. */
const RULED = 'mt-4 border-t border-[var(--doc-ink-border)] pt-3';

/**
 * A row's own act. D3's gated form: the act stays in the tab order,
 * `aria-disabled`, with its reason as one muted sentence directly beneath and
 * linked by `aria-describedby`, and the repair act beside it as a plain act.
 * Never native `disabled`, never terracotta.
 */
function SheetAct({
  actionKey,
  act,
  onPress,
}: {
  actionKey: string;
  act: LensAct;
  onPress: () => void;
}) {
  const reasonId = useId();
  if (!act.held) {
    return (
      <DocumentAction actionKey={actionKey} variant="secondary" onClick={onPress}>
        {act.label}
      </DocumentAction>
    );
  }
  const { reason, repair } = act.held;
  return (
    <div data-standing-held className="flex max-w-[16rem] flex-col items-end">
      <div className="flex items-center gap-1">
        <DocumentAction
          actionKey={actionKey}
          variant="secondary"
          held
          disabled
          aria-describedby={reasonId}
        >
          {act.label}
        </DocumentAction>
        {repair && (
          <DocumentAction
            actionKey={`${actionKey}-repair`}
            variant="tertiary"
            onClick={repair.onAct}
          >
            {repair.label}
          </DocumentAction>
        )}
      </div>
      <p id={reasonId} className="text-right text-[12px] text-[var(--text-muted)]">
        {reason}
      </p>
    </div>
  );
}

export function StandingSheet({
  open,
  onClose,
  items,
  inputs = [],
  setup = [],
  grouped = false,
  triggerRef,
}: {
  open: boolean;
  onClose: () => void;
  items: readonly LensStandingItem[];
  /** W3-R2 — the stage's open inputs, their own section under the exceptions. */
  inputs?: readonly LensInputItem[];
  /** D10 — the `SETUP` group, at the sheet's foot, in clay ink at the plain
   *  tier: never terracotta. */
  setup?: readonly LensSetupItem[];
  /** D2 (`one-voice`) — the rows under `BLOCKS MONEY OR A SIGNATURE` ·
   *  `NEEDS YOU` · `SETUP`, deadline order inside each; the open inputs fold
   *  into `NEEDS YOU`. Off, the sheet is the 0b sheet. */
  grouped?: boolean;
  /** Where focus goes when the sheet is put back and the door it was opened
   *  from is gone. The band hands over a CHAIN resolved at close time (C-12):
   *  the door, else the act line 2 is printing, else the band. */
  triggerRef?: RefObject<HTMLElement | null>;
}) {
  // A setup act that lands on the paper (the vitals editor, the schedule)
  // puts the sheet back first. The sheet unlocks the page's scroll as it
  // closes and hands focus to its door one frame later, so the act runs a
  // frame after that, or the door would take focus back from it.
  const pressSetup = (item: LensSetupItem) => {
    if (!item.act) return;
    if (item.opensSheet) {
      item.act.onAct();
      return;
    }
    const run = item.act.onAct;
    onClose();
    window.requestAnimationFrame(() => window.requestAnimationFrame(run));
  };

  const itemRow = (item: LensStandingItem) => (
    <li
      key={item.key}
      data-standing-row
      data-standing-tier={item.tier}
      className={ROW}
    >
      <div className="min-w-0">
        <p className={EYEBROW}>{item.eyebrow}</p>
        <p className={SENTENCE}>{item.sentence}</p>
      </div>
      {item.act && (
        <SheetAct actionKey={`standing-${item.key}`} act={item.act} onPress={item.act.onAct} />
      )}
    </li>
  );
  const inputRow = (item: LensInputItem) => (
    <li key={item.key} data-standing-input-row className={ROW}>
      <div className="min-w-0">
        <p className={INPUT_EYEBROW}>{item.eyebrow}</p>
        <p className={SENTENCE}>{item.sentence}</p>
      </div>
      {item.act && (
        <SheetAct
          actionKey={`standing-input-${item.key}`}
          act={item.act}
          onPress={item.act.onAct}
        />
      )}
    </li>
  );
  const setupRow = (item: LensSetupItem) => (
    <li key={item.key} data-standing-setup-row className={ROW}>
      <p className={SETUP_SENTENCE}>{item.sentence}</p>
      {item.act && (
        <SheetAct
          actionKey={`standing-setup-${item.key}`}
          act={item.act}
          onPress={() => pressSetup(item)}
        />
      )}
    </li>
  );

  let content: ReactNode;
  if (grouped) {
    // D2 — the class table, then W3-R1's deadline order inside each class.
    const ranked = [...items].sort(compareForNext);
    const groups = [
      {
        key: 'money',
        title: 'BLOCKS MONEY OR A SIGNATURE',
        rows: ranked.filter((item) => classOfStandingRow(item) === 1).map(itemRow),
      },
      {
        key: 'needs-you',
        title: 'NEEDS YOU',
        rows: [
          ...ranked.filter((item) => classOfStandingRow(item) !== 1).map(itemRow),
          ...inputs.map(inputRow),
        ],
      },
      { key: 'setup', title: 'SETUP', rows: setup.map(setupRow) },
    ].filter((group) => group.rows.length > 0);
    content = groups.map((group, index) => (
      <div key={group.key} data-standing-group={group.key}>
        <p
          data-standing-group-heading
          data-standing-setup-heading={group.key === 'setup' ? '' : undefined}
          className={`${index > 0 ? RULED : ''} ${
            group.key === 'setup' ? INPUT_EYEBROW : GROUP_EYEBROW
          }`}
        >
          {group.title}
        </p>
        <ul className="w-full">{group.rows}</ul>
      </div>
    ));
  } else {
    content = (
      <>
        {/* W3-F8 — with nothing standing there is no list, so there is no list
            to rule off: an empty `<ul>` under a hairline read as a section
            whose contents had been withheld. */}
        {items.length > 0 && <ul className="w-full">{items.map(itemRow)}</ul>}
        {inputs.length > 0 && (
          <>
            {/* W3-R2 — the inputs are facts about the next stage, not standing
                exceptions, so they stand under their own rule and heading in
                the same register rather than mixing into the list above. */}
            <p
              data-standing-input-heading
              className={`${items.length > 0 ? RULED : ''} ${INPUT_EYEBROW}`}
            >
              INPUT NEEDED · {inputs.length}
            </p>
            <ul className="w-full">{inputs.map(inputRow)}</ul>
          </>
        )}
        {setup.length > 0 && (
          <>
            {/* D10 — setup is something the job has not been given yet, not
                something gone wrong: clay ink, the plain tier, at the foot. */}
            <p
              data-standing-setup-heading
              className={`${items.length + inputs.length > 0 ? RULED : ''} ${INPUT_EYEBROW}`}
            >
              SETUP
            </p>
            <ul className="w-full">{setup.map(setupRow)}</ul>
          </>
        )}
      </>
    );
  }

  return (
    <DocSheet
      open={open}
      onClose={onClose}
      title={`Standing · ${items.length + inputs.length + setup.length}`}
      icon={AlertCircle}
      kind="standing"
      fallbackFocusRef={triggerRef}
    >
      <DocumentActionGroup
        surfaceKey="document"
        regionKey="standing-sheet"
        aria-label="Standing actions"
      >
        {content}
      </DocumentActionGroup>
    </DocSheet>
  );
}
