'use client';

/**
 * PartyField — "Who does it" on a trade scope (deck slide 15, mnote 2).
 *
 * The party comes from the call sheet: subs and installers already on the
 * project. No separate vendor record, no second directory — a trade scope
 * points at the same person the coordination rails already text.
 *
 * Chosen reads as one settled line (PartyMiniRow) with a quiet CHANGE beside
 * it. Choosing is the picker recipe the rest of the portal uses: a radio list
 * of the project's own subs and installers, with the rolodex underneath for
 * someone the job has not met yet.
 */

import { useEffect, useMemo, useState } from 'react';
import { useProjectParties } from '@patina/supabase';
import type { PartyKind } from '@patina/types';
import { PartyMiniRow } from '../../roster/party-mini-row';
import { RolodexPicker } from '../../roster/rolodex-picker';

/** A trade scope is worked by a sub or an installer — never a vendor. */
export const TRADE_PARTY_KINDS: PartyKind[] = ['sub', 'installer'];

const SCORED_WORD =
  'da-score-hover min-h-11 inline-flex items-center font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)] transition-colors hover:text-[var(--color-mocha)]';

export interface TradePartyOption {
  id: string;
  display_name: string;
  party_kind: string | null;
  trade: string | null;
  company_name: string | null;
  profile_id: string | null;
}

export function PartyField({
  projectId,
  partyId,
  onSelect,
  disabled = false,
}: {
  projectId: string;
  partyId: string | null;
  onSelect: (partyId: string) => void;
  disabled?: boolean;
}) {
  const { data: parties } = useProjectParties(projectId);
  const [picking, setPicking] = useState(false);
  const [rolodexOpen, setRolodexOpen] = useState(false);
  const [pendingName, setPendingName] = useState<string | null>(null);

  const eligible = useMemo(
    () =>
      ((parties ?? []) as TradePartyOption[]).filter((party) =>
        TRADE_PARTY_KINDS.includes(party.party_kind as PartyKind),
      ),
    [parties],
  );

  const chosen = eligible.find((party) => party.id === partyId) ?? null;

  // Someone added from the rolodex lands as a project party a beat later; when
  // they do, they are the one we came for.
  useEffect(() => {
    if (!pendingName) return;
    const landed = eligible.find((party) => party.display_name === pendingName);
    if (!landed) return;
    onSelect(landed.id);
    setPendingName(null);
    setPicking(false);
  }, [pendingName, eligible, onSelect]);

  if (chosen && !picking) {
    return (
      <div data-testid="trade-party-chosen">
        <PartyMiniRow
          name={chosen.display_name}
          kind={chosen.party_kind}
          trade={chosen.trade}
          reach={chosen.profile_id ? 'account' : 'on_paper'}
          subline={chosen.company_name}
          trailing={
            disabled ? null : (
              <button
                type="button"
                onClick={() => setPicking(true)}
                className={SCORED_WORD}
              >
                Change
              </button>
            )
          }
        />
      </div>
    );
  }

  return (
    <div data-testid="trade-party-picker">
      {eligible.length === 0 ? (
        <p className="text-[0.72rem] italic text-[var(--color-aged-oak)]">
          No subs or installers on this job yet.
        </p>
      ) : (
        <div role="radiogroup" aria-label="Who does this work">
          {eligible.map((party) => (
            <PartyMiniRow
              key={party.id}
              name={party.display_name}
              kind={party.party_kind}
              trade={party.trade}
              reach={party.profile_id ? 'account' : 'on_paper'}
              subline={party.company_name}
              selectable
              selected={party.id === partyId}
              disabled={disabled}
              onSelect={() => {
                onSelect(party.id);
                setPicking(false);
              }}
            />
          ))}
        </div>
      )}

      {!disabled && (
        <button
          type="button"
          onClick={() => setRolodexOpen(true)}
          className={SCORED_WORD}
        >
          Someone new
        </button>
      )}

      {rolodexOpen && (
        <RolodexPicker
          open
          onClose={() => setRolodexOpen(false)}
          projectId={projectId}
          scopeKinds={TRADE_PARTY_KINDS}
          onAdded={(name) => {
            setPendingName(name);
            setRolodexOpen(false);
          }}
        />
      )}
    </div>
  );
}
