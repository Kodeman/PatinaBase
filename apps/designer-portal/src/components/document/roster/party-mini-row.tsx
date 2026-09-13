'use client';

/**
 * PartyMiniRow — the shared picker recipe (slide 16, "every picker in the
 * portal gets better for free"). One compact line: the entity's avatar
 * (a person is a circle, a company a rounded square — slide 9's ONE visual
 * difference), the name, a mono KIND · TRADE meta line, and the reach chip.
 *
 * `selectable` turns the row into a radio: a hairline ring on the left that
 * fills clay when chosen, `role="radio"` + `aria-checked` for the reader. That
 * is the whole difference between "pick one of these" (the coordination
 * composer's court select) and "tap to add" (the rolodex picker) — the row
 * itself is identical, which is the point of exporting it.
 *
 * Deliberately dumb: every field is a prop. It never reads a hook, never knows
 * about project_parties vs studio_contacts, and therefore serves both.
 *
 * At the PICK it carries the words the travel list is about (SPEC §5.7 #4):
 * reach, consent and paper, plus the contact rule as a sentence and one history
 * line. PR-i: repeat count and dates only — NEVER a verdict at the pick.
 */

import {
  getFieldTradeLabel,
  getPartyKindLabel,
  getVendorSpecialtyLabel,
  partyKindOwesPaper,
  type ReachState,
} from '@patina/types';
import { Avatar } from '../people/person-bits';
import { companyKindLabel } from '../people/directory/company-row';
import { StateWord } from '../people/state-word';
import { ReachChip } from './reach-chip';

/**
 * The trade/specialty label for a roster or rolodex row. A vendor's second
 * axis is a VendorSpecialty; everyone else's is a FieldTrade. Both label
 * helpers fall back to the raw token rather than rendering nothing, so a
 * legacy free-text trade still reads.
 */
export function rosterTradeLabel(
  kind: string | null | undefined,
  trade: string | null | undefined,
): string {
  if (!trade) return '';
  return kind === 'vendor'
    ? getVendorSpecialtyLabel(trade)
    : getFieldTradeLabel(trade);
}

/** KIND · TRADE — the mono meta line every mini row wears. */
export function rosterMetaLine(
  kind: string | null | undefined,
  trade: string | null | undefined,
  entity: 'person' | 'company' = 'person',
): string {
  const kindLabel =
    entity === 'company'
      ? companyKindLabel(kind)
      : getPartyKindLabel(kind) || (kind ?? '');
  const tradeLabel = rosterTradeLabel(kind, trade);
  return [kindLabel, tradeLabel].filter(Boolean).join(' · ');
}

export interface PartyMiniRowProps {
  name: string;
  /** party_kind (person) or studio_contacts.contact_kind (either). */
  kind: string | null | undefined;
  entity?: 'person' | 'company';
  /** FieldTrade for most kinds, VendorSpecialty for a vendor. */
  trade?: string | null;
  reach?: ReachState | null;
  /** The studio's consent record for this identity, as a word. */
  consent?: string | null;
  /**
   * The worst paper the identity or its firm holds, as a word. Printed only
   * where the kind OWED paper: R-A / R-N / SPEC §3.8 — a lender, an inspector
   * or an authority never filed anything with the studio, so no surface prints
   * a paper word for one, and "Not on file" is the forbidden word above all.
   * The row applies the rule itself rather than trusting each caller, because
   * the value handed in is the view's raw `paper_state` fact.
   */
  paper?: string | null;
  /** The contact rule, as a sentence beside the words (PR-e). Compose it with
   *  `contactRuleClause()` — this row renders what it is handed. */
  rule?: string | null;
  /**
   * CR-4: whether that rule is a hard block, decided by the caller with
   * `contactRuleIsHardBlock()`. The row used to run its own regex over the
   * rendered prose — the fourth answer to one question, and the same shape
   * CR-22 deleted from the two row files.
   */
  ruleBlocked?: boolean;
  /** The quiet second line under the meta — the picker's history line. */
  subline?: React.ReactNode;
  /** Renders the radio ring and radio semantics. */
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
  /** Anything the caller wants at the right edge (a scored ADD word, etc.). */
  trailing?: React.ReactNode;
}

export function PartyMiniRow({
  name,
  kind,
  entity = 'person',
  trade,
  reach,
  consent,
  paper,
  rule,
  ruleBlocked = false,
  subline,
  selectable = false,
  selected = false,
  onSelect,
  disabled = false,
  trailing,
}: PartyMiniRowProps) {
  const meta = rosterMetaLine(kind, trade, entity);

  const body = (
    <>
      {selectable && (
        <span
          aria-hidden
          className="inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full border"
          style={{
            borderColor: selected ? 'var(--color-clay)' : 'var(--color-pearl)',
          }}
        >
          {selected && (
            <span
              className="block h-[7px] w-[7px] rounded-full"
              style={{ background: 'var(--color-clay)' }}
            />
          )}
        </span>
      )}
      <Avatar
        name={name}
        role={kind ?? 'other'}
        shape={entity === 'company' ? 'square' : 'circle'}
        size={30}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.84rem] text-[var(--color-charcoal)]">
          {name}
        </span>
        {meta && (
          <span className="mt-[0.1rem] block truncate font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
            {meta}
          </span>
        )}
        {subline && (
          <span className="mt-[0.1rem] block text-[0.68rem] text-[var(--color-quiet-ink)]">
            {subline}
          </span>
        )}
        {/* The rule prints as a SENTENCE beside the words (PR-e), and as a
            span rather than ContactRuleLine's paragraph: a selectable mini row
            is a <button>, which takes phrasing content only. */}
        {rule && (
          <span
            data-contact-rule
            data-contact-rule-blocked={ruleBlocked ? 'true' : undefined}
            className={`mt-[0.15rem] block text-[0.7rem] text-[var(--color-charcoal)] ${
              ruleBlocked
                ? 'border-l-2 border-[var(--color-terracotta-ink)] py-[3px] pl-[8px]'
                : ''
            }`}
          >
            {rule}
          </span>
        )}
      </span>
      {reach && <ReachChip state={reach} />}
      {consent && <StateWord family="consent" value={consent} />}
      {paper && partyKindOwesPaper(kind) && (
        <StateWord family="paper" value={paper} />
      )}
      {trailing}
    </>
  );

  const shared =
    'flex w-full items-center gap-2.5 rounded-[8px] border border-transparent px-2 py-2 text-left';

  if (!onSelect) {
    return <div className={shared}>{body}</div>;
  }

  return (
    <button
      type="button"
      role={selectable ? 'radio' : undefined}
      aria-checked={selectable ? selected : undefined}
      disabled={disabled}
      onClick={onSelect}
      className={`${shared} min-h-11 transition-[border-color,background-color] duration-200 hover:border-[var(--color-clay)] hover:bg-[rgba(196,165,123,0.05)] disabled:opacity-50 ${
        selected ? 'border-[var(--color-clay)] bg-[rgba(196,165,123,0.07)]' : ''
      }`}
    >
      {body}
    </button>
  );
}
