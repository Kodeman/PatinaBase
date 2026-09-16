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

/**
 * KIND · FIRM · TRADE — the mono meta line every mini row wears.
 *
 * F1: the firm segment is optional and new. SPEC §5.7 #4 asks each pick row to
 * carry "name, firm and trade" — "Dana Kowalski · Northgate Electric ·
 * electrical" — and the line printed KIND · TRADE alone, so every seeded sub's
 * row was missing its firm entirely. Callers that hand no firm are unchanged,
 * which is every caller but the rolodex picker.
 */
export function rosterMetaLine(
  kind: string | null | undefined,
  trade: string | null | undefined,
  entity: 'person' | 'company' = 'person',
  company?: string | null,
): string {
  const kindLabel =
    entity === 'company'
      ? companyKindLabel(kind)
      : getPartyKindLabel(kind) || (kind ?? '');
  const tradeLabel = rosterTradeLabel(kind, trade);
  // A firm card's own name is already the row's NAME; only a person's row
  // gains a firm segment.
  const firmLabel = entity === 'company' ? '' : (company?.trim() ?? '');
  return [kindLabel, firmLabel, tradeLabel].filter(Boolean).join(' · ');
}

export interface PartyMiniRowProps {
  name: string;
  /** party_kind (person) or studio_contacts.contact_kind (either). */
  kind: string | null | undefined;
  entity?: 'person' | 'company';
  /**
   * The FIRM this person works for, resolved (F1) — never
   * `studio_contacts.company_name` read raw, which the affiliation model
   * leaves null on every carded human. Printed between the kind and the trade
   * on a person's meta line; ignored on a firm's own row.
   */
  company?: string | null;
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
  /** Renders the pick control and its semantics. */
  selectable?: boolean;
  /**
   * SPEC §5.7 #4 — the travel-list pick takes SEVERAL rows before one confirm,
   * so the control is a checkbox, not a radio: a square mark with no tick
   * glyph (§8 #5). `selectable` alone stays the single-pick radio the
   * coordination composer's court select uses.
   */
  multi?: boolean;
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
  company,
  trade,
  reach,
  consent,
  paper,
  rule,
  ruleBlocked = false,
  subline,
  selectable = false,
  multi = false,
  selected = false,
  onSelect,
  disabled = false,
  trailing,
}: PartyMiniRowProps) {
  const meta = rosterMetaLine(kind, trade, entity, company);

  const body = (
    <>
      {selectable && (
        <span
          aria-hidden
          data-pick-mark={multi ? 'checkbox' : 'radio'}
          className={`inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center border ${
            multi ? 'rounded-[2px]' : 'rounded-full'
          }`}
          style={{
            borderColor: selected ? 'var(--color-clay)' : 'var(--color-pearl)',
          }}
        >
          {selected && (
            <span
              className={`block h-[7px] w-[7px] ${multi ? 'rounded-[1px]' : 'rounded-full'}`}
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
      {/* QA r3 finding 2 — THE NAME KEEPS ITS OWN ROOM AT 390.
          `min-w-0 flex-1` beside up to three word chips on one nowrap line let
          flexbox take the name's box to ZERO width at 390 (measured:
          getBoundingClientRect w:0), and `truncate` on a zero-width box paints
          nothing at all — not even an ellipsis. The text stayed in the DOM, so
          a reader still announced it and a screenshot showed a nameless row:
          who you are picking was unreadable on a phone. SPEC §6.2's row rule
          is name on its own line with the words beneath, so the floor is
          stated here (`min-w-[8rem]`) and the container wraps the chips onto
          the next line; at 1440 (`sm:`) nothing moves. */}
      <span className="min-w-[8rem] flex-1 sm:min-w-0">
        <span className="block break-words text-[0.84rem] text-[var(--color-charcoal)] sm:truncate">
          {name}
        </span>
        {meta && (
          <span
            data-party-mini-meta
            className="mt-[0.1rem] block break-words font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)] sm:truncate"
          >
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

  // `flex-wrap` is the other half of finding 2: with the name's floor stated,
  // the reach / consent / paper words leave the first line rather than
  // squeezing it away. `sm:flex-nowrap` keeps the 1440 row exactly as shipped.
  const shared =
    'flex w-full flex-wrap items-center gap-2.5 rounded-[8px] border border-transparent px-2 py-2 text-left sm:flex-nowrap';

  if (!onSelect) {
    return <div className={shared}>{body}</div>;
  }

  return (
    <button
      type="button"
      role={selectable ? (multi ? 'checkbox' : 'radio') : undefined}
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
