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
 */

import {
  getFieldTradeLabel,
  getPartyKindLabel,
  getVendorSpecialtyLabel,
  type ReachState,
} from '@patina/types';
import { Avatar } from '../people/person-bits';
import { companyKindLabel } from '../people/directory/company-row';
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
          <span className="mt-[0.1rem] block truncate text-[0.68rem] text-[var(--color-quiet-ink)]">
            {subline}
          </span>
        )}
      </span>
      {reach && <ReachChip state={reach} />}
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
