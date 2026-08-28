'use client';

/**
 * One call-sheet row, and what is under it (slide 12).
 *
 * Folded: a 34px avatar, the name with its consent DOT (the words wait for the
 * unfold), a mono second element that changes by group, the reach chip, and a
 * quiet chevron. Tapping the row — anywhere but the chevron — unfolds phone,
 * email, the full consent chip, and the four scored words. The chevron opens
 * the PartyProfileSheet that already exists (slide 11's mnote 5: "no new
 * detail screen is proposed"), via the `onOpenProfile` callback.
 *
 * Grammar: zero shadows, one primary per region, inline bands never toasts —
 * REMOVE swaps a confirm band into the row's own pixels rather than calling
 * window.confirm.
 *
 * Team rows are read-only here on purpose: SHOW TO CLIENT, REMOVE, TEXT and
 * COPY FIELD LINK all write `project_parties`, and a team row is a
 * `project_team_members` login. It has no party to write to. The synthetic
 * client row (Wave 5) is read-only for the same reason and one more: it isn't
 * a row at all, it's the project's `client_id` wearing a roster shape. It
 * carries a quiet mono THE CLIENT pill where a kind label would go.
 */

import { useState } from 'react';
import {
  fieldLinkUrl,
  useCreateFieldLink,
  useRemoveProjectParty,
  useSendPartySms,
  useUpdateProjectParty,
  type ProjectRosterRow,
} from '@patina/supabase';
import { getStaffRoleLabel, isFieldPartyKind } from '@patina/types';
import {
  isSyntheticClientRow,
  reachState,
  rosterProfileRole,
  type RosterGroup,
} from '@/lib/document/roster-derivation';
import { Avatar, ConsentChip } from '../people/person-bits';
import { DocumentAction, DocumentActionRow } from '../document-action';
import { ReachChip } from './reach-chip';
import { rosterMetaLine } from './party-mini-row';

const META =
  'font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';

/** The mono second element — a different sentence per group (slide 11). */
export function rosterSecondLine(row: ProjectRosterRow, group: RosterGroup): string {
  if (group === 'studioSide') {
    // Role and title are two different columns and often say the same thing
    // ("Designer" / "Designer"); show the second only when it adds something.
    const role = getStaffRoleLabel(row.staff_role);
    const title = (row.job_title ?? '').trim();
    return [role, title && title.toLowerCase() !== role.toLowerCase() ? title : '']
      .filter(Boolean)
      .join(' · ');
  }
  if (group === 'clientSide') {
    // There is no "relation" column — the honest relation is the kind plus the
    // household/company the row carries.
    return rosterMetaLine(row.kind, null);
  }
  return rosterMetaLine(row.kind, row.trade);
}

export function RosterRow({
  row,
  group,
  expanded,
  onToggle,
  onOpenProfile,
}: {
  row: ProjectRosterRow;
  group: RosterGroup;
  expanded: boolean;
  onToggle: () => void;
  onOpenProfile?: (row: ProjectRosterRow) => void;
}) {
  const isParty = row.source === 'party';
  // The project's own client (Wave 5) — a synthetic row, not a party row.
  // Nothing writes to it: no SHOW TO CLIENT (they ARE the client), no REMOVE
  // (you'd be removing the project's client from the project), no consent dot
  // and no chevron. It states who they are and how they're reachable.
  const isClient = isSyntheticClientRow(row);
  // A chevron only where PartyProfileSheet has something to show — the
  // people_directory party branch (00420) excludes vendor / client_rep /
  // other, so those rows would open an empty sheet.
  const canOpenProfile = !!rosterProfileRole(row);
  const partyId = row.roster_id ?? '';
  const projectId = row.project_id ?? '';
  const name = row.display_name ?? row.company_name ?? 'Unnamed';
  const reach = reachState(row);
  const consent = row.sms_consent_status ?? 'not_asked';
  // No Twilio-availability probe exists in the client (the rails are dormant
  // until 10DLC clears), so "can text" is exactly what the party sheet already
  // gates its composer on: a party row, an opted-in consent, and a number.
  const canText = isParty && consent === 'granted' && !!row.phone;
  const showTextWord = isParty && isFieldPartyKind(row.kind);

  const updateParty = useUpdateProjectParty();
  const removeParty = useRemoveProjectParty();
  const createLink = useCreateFieldLink();
  const sendSms = useSendPartySms();

  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const copyLink = async () => {
    setNote(null);
    try {
      const { token } = await createLink.mutateAsync({ partyId });
      const url = fieldLinkUrl(token);
      await navigator.clipboard?.writeText(url);
      setNote(`Field link copied — shown once. ${url}`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not mint a field link just now.');
    }
  };

  return (
    <li className="border-b border-[var(--color-pearl)] last:border-b-0">
      <div className="flex items-center gap-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-[8px] px-1 text-left transition-colors hover:bg-[rgba(196,165,123,0.05)]"
        >
          <Avatar name={name} role={row.kind ?? 'other'} size={34} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-[0.88rem] text-[var(--color-charcoal)]">
                {name}
              </span>
              {isParty && <ConsentChip status={consent} dotOnly />}
            </span>
            <span className={`mt-[0.1rem] flex items-baseline gap-1.5 ${META}`}>
              {isClient ? (
                <span className="inline-flex items-center rounded-[3px] border border-[var(--color-pearl)] px-1.5 py-[0.1rem] tracking-[0.12em] text-[var(--color-mocha)]">
                  The client
                </span>
              ) : (
                <span className="truncate">{rosterSecondLine(row, group)}</span>
              )}
              {row.company_name && (
                <span className="truncate normal-case tracking-normal text-[0.68rem] text-[var(--color-aged-oak)]">
                  <span aria-hidden>■</span> {row.company_name}
                </span>
              )}
            </span>
          </span>
        </button>
        <ReachChip state={reach} />
        {canOpenProfile && onOpenProfile && (
          <button
            type="button"
            onClick={() => onOpenProfile(row)}
            aria-label={`Open ${name}'s profile`}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-[0.8rem] text-[var(--color-aged-oak)] transition-colors hover:text-[var(--color-charcoal)]"
          >
            ›
          </button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-[var(--color-pearl)] px-1 pb-3 pt-2.5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
            {row.phone && (
              <span className="text-[0.78rem] text-[var(--color-charcoal)]">{row.phone}</span>
            )}
            {row.email && (
              <span className="text-[0.78rem] text-[var(--color-charcoal)]">{row.email}</span>
            )}
            {!row.phone && !row.email && (
              <span className="text-[0.74rem] text-[var(--color-aged-oak)]">
                – No phone or email on file.
              </span>
            )}
            {isParty && <ConsentChip status={consent} />}
          </div>

          {confirmRemove ? (
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5 border-l-2 border-[var(--color-terracotta)] bg-[rgba(196,131,111,0.07)] px-3 py-2.5">
              <p className="text-[0.74rem] text-[var(--color-charcoal)]">
                – Take {name} off the call sheet?
              </p>
              <DocumentActionRow
                surfaceKey="call-sheet"
                regionKey="roster-row-remove-confirm"
                aria-label="Confirm removal"
              >
                <DocumentAction
                  actionKey="confirm-remove-party"
                  variant="danger"
                  onClick={() =>
                    void removeParty
                      .mutateAsync({ id: partyId, projectId })
                      .catch((e: unknown) =>
                        setNote(e instanceof Error ? e.message : 'Could not remove them.'),
                      )
                  }
                  disabled={removeParty.isPending}
                  loading={removeParty.isPending}
                  loadingLabel="Removing…"
                >
                  Remove
                </DocumentAction>
                <DocumentAction
                  actionKey="cancel-remove-party"
                  variant="tertiary"
                  onClick={() => setConfirmRemove(false)}
                >
                  Keep
                </DocumentAction>
              </DocumentActionRow>
            </div>
          ) : (
            <DocumentActionRow
              surfaceKey="call-sheet"
              regionKey="roster-row"
              className="mt-3"
              aria-label={`Actions for ${name}`}
            >
              {showTextWord && (
                <DocumentAction
                  actionKey="text-party"
                  variant="primary"
                  onClick={() => setComposing((c) => !c)}
                  disabled={!canText}
                  title={
                    canText
                      ? undefined
                      : 'Texting opens once they opt in and a number is on file.'
                  }
                >
                  Text
                </DocumentAction>
              )}
              {showTextWord && (
                <DocumentAction
                  actionKey="copy-field-link"
                  variant="secondary"
                  onClick={() => void copyLink()}
                  disabled={createLink.isPending}
                  loading={createLink.isPending}
                  loadingLabel="Minting…"
                >
                  Copy field link
                </DocumentAction>
              )}
              {isParty && (
                <button
                  type="button"
                  onClick={() =>
                    void updateParty.mutateAsync({
                      id: partyId,
                      projectId,
                      patch: { showToClient: !row.show_to_client },
                    })
                  }
                  aria-pressed={!!row.show_to_client}
                  className={`da-score-hover inline-flex min-h-11 items-center font-mono text-[12px] uppercase tracking-[0.1em] transition-colors ${
                    row.show_to_client
                      ? 'da-score-on text-[var(--color-charcoal)]'
                      : 'text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]'
                  }`}
                >
                  Show to client
                </button>
              )}
              {isParty && (
                <DocumentAction
                  actionKey="remove-party"
                  variant="danger"
                  onClick={() => setConfirmRemove(true)}
                  className="ml-auto"
                >
                  Remove
                </DocumentAction>
              )}
            </DocumentActionRow>
          )}

          {composing && canText && (
            <div className="mt-2.5">
              <textarea
                rows={2}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                aria-label={`Send a text to ${name}`}
                placeholder="Send a text…"
                className="w-full resize-none rounded-[7px] border border-[var(--color-pearl)] bg-white px-3 py-2 text-[0.8rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
              />
              <DocumentActionRow
                surfaceKey="call-sheet"
                regionKey="roster-row-composer"
                className="mt-1.5"
                aria-label="Send a text"
              >
                <DocumentAction
                  actionKey="send-roster-text"
                  variant="primary"
                  onClick={() =>
                    void sendSms
                      .mutateAsync({ partyId, body })
                      .then(() => {
                        setBody('');
                        setComposing(false);
                        setNote('Sent.');
                      })
                      .catch((e: unknown) =>
                        setNote(e instanceof Error ? e.message : 'Send failed.'),
                      )
                  }
                  disabled={!body.trim() || sendSms.isPending}
                  loading={sendSms.isPending}
                  loadingLabel="Sending…"
                >
                  Send
                </DocumentAction>
              </DocumentActionRow>
            </div>
          )}

          {note && (
            <p
              role="status"
              className="mt-2 break-all border-l-2 border-[var(--color-sage)] bg-[rgba(133,148,124,0.07)] px-3 py-2 text-[0.7rem] text-[var(--color-charcoal)]"
            >
              {note}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
