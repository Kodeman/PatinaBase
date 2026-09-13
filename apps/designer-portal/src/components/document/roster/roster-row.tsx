'use client';

/**
 * ONE CALL SHEET ROW, AND WHAT IS UNDER IT (direction §3.4, SPEC §5.4).
 *
 * Folded: a 34px avatar, the name, the kind and trade, the firm, the authority
 * phrase where there is one, the held clause where a firm's paper blocks the
 * work, an opted-out note where the studio may not text (R-T), then two words —
 * reach and stage — a `tel:` link as the row's SIBLING, and the chevron that
 * opens the person.
 *
 * Unfolded: phone and email, the consent sentence with its source and date
 * (R-Q), and four acts — Text, Copy field link, Show to client, Close this
 * seat. The unfold trigger carries `aria-expanded` AND `aria-controls` pointing
 * at the panel's real id (SPEC §7 #5).
 *
 * THE WORD "REMOVE" APPEARS NOWHERE (SPEC §5.4 #14). Closing a seat is
 * `Close this seat`: a dated `off_job_at` with a reason, and the consent, the
 * bid history and the paper all stay on the book. The hard delete survives for
 * one case only — a seat added by mistake that carries nothing — and the
 * predicate that decides it is `seatDeleteRefusal`, read before the act is
 * offered, never after it is pressed.
 *
 * An `<a>` never nests inside a `<button>`: the row's open control and the
 * phone are two sibling targets, each at least 44px (SPEC §7 #6).
 */

import { useState } from 'react';
import {
  fieldLinkUrl,
  seatDeleteRefusal,
  useChannelConsent,
  useCloseProjectPartySeat,
  useComplianceDocuments,
  useCreateFieldLink,
  useRemoveProjectParty,
  useSendPartySms,
  useUpdateProjectParty,
  AUTHORITY_SCOPE_LABELS,
  COMPLIANCE_DOC_TYPE_LABELS,
  SEAT_DELETE_REFUSAL_SENTENCES,
  type ProjectPartyAuthority,
  type StudioContactRule,
} from '@patina/supabase';
import { isFieldPartyKind } from '@patina/types';
import {
  authorityPhrase,
  fieldLinkExpirySentence,
  heldClause,
  rosterShortDate,
  seatWindowText,
  type CallSheetBand,
  type CallSheetRow,
} from '@/lib/document/roster-derivation';
import {
  contactRuleClause,
  contactRuleForbidsSms,
  contactRuleIsDoNotContact,
  contactRuleIsHardBlock,
} from '@/lib/document/contact-rule';
import { peopleEvents } from '@/lib/analytics/people-events';
import { Avatar } from '../people/person-bits';
import { consentSentence } from '../people/consent-sentence';
import {
  ContactRuleLine,
  type ContactRouteTarget,
} from '../people/contact-rule-line';
import { PlainFact, StateWord } from '../people/state-word';
import { TelLink } from '../people/tel-link';
import { DocumentAction, DocumentActionRow } from '../document-action';

const META =
  'font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';

/** The stages the studio asked a price on — a seat in one of them carries a bid
 *  whatever columns the row has (the bid columns are P2). */
const BID_STAGES: readonly string[] = [
  'prospect',
  'invited',
  'bidding',
  'declined',
  'no_response',
];

/** The window clause a row prints beside its stage: the day the crew arrives on
 *  a later seat, the day it closed on a done one. */
export function rosterWindowClause(row: CallSheetRow, band: CallSheetBand): string {
  if (band === 'done') {
    const when = rosterShortDate(row.offJobAt);
    const reason = (row.offJobReason ?? '').trim();
    if (!when && !reason) return '';
    return [when ? `Off the job ${when}.` : '', reason].filter(Boolean).join(' ');
  }
  if (band === 'later') {
    const from = rosterShortDate(row.onSiteFrom);
    return from ? `From ${from}` : '';
  }
  return seatWindowText(row.onSiteFrom, row.onSiteTo);
}

export function RosterRow({
  row,
  band,
  expanded,
  onToggle,
  onOpenSeat,
  authority = [],
  consentOrg,
  projectName,
  rule,
  routeTo,
}: {
  row: CallSheetRow;
  band: CallSheetBand;
  expanded: boolean;
  onToggle: () => void;
  onOpenSeat?: (row: CallSheetRow) => void;
  authority?: ProjectPartyAuthority[];
  /** The studio whose consent record this row's number is read against. */
  consentOrg?: string | null;
  /** The job this sheet is, for R-Q's "on the <project>" clause. */
  projectName?: string | null;
  /**
   * The rule ROW governing this seat — the engagement's own, else the
   * person's card rule. CR-5 / CR-6 / CR-22: the clause, the hard block and
   * the route all come off the columns, not off a regex over prose.
   */
  rule?: StudioContactRule | null;
  /** How to reach the person the rule routes to (R-L / CR-15). */
  routeTo?: ContactRouteTarget | null;
}) {
  const isSeat = row.source === 'seat';
  // One predicate, one clause, wherever a rule is shown (R-S).
  // CR3-2: and NEVER `contact_rule_summary` (`row.ruleSummary`) behind it —
  // that column prints raw `channel_kind` tokens (`after_hours`, `ap_email`,
  // `portal_311`, `dispatch`), which SPEC §8 #3 bars from any face, and it
  // drops the studio's own typed reason. The rules are a separate query from
  // the roster, so the fallback painted on every cold load. A row whose rule
  // has not arrived prints no clause rather than a schema-worded one.
  const ruleClause = contactRuleClause(rule);
  // CR-4 / CR-16: the SAME pair of predicates the Directory row uses, over the
  // same column. The leading rule prints for ANY forbidden channel (SPEC §5.1
  // #11); only a rule that leaves no direct channel open takes the number off
  // the row (§5.4).
  const ruleBlocks = contactRuleIsHardBlock(rule);
  const ruleSilencesPhone = contactRuleIsDoNotContact(rule);
  const seatId = row.seatId ?? '';
  const projectId = row.projectId ?? '';

  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState('');
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const updateParty = useUpdateProjectParty();
  const closeSeat = useCloseProjectPartySeat();
  const removeParty = useRemoveProjectParty();
  const createLink = useCreateFieldLink();
  const sendSms = useSendPartySms();

  // The consent SENTENCE needs the record behind the word: its source and its
  // date. Read only where the sentence prints — the unfold, and a refusal,
  // which R-T puts on the collapsed row as well.
  const wantsRecord = isSeat && (expanded || row.consent === 'opted_out');
  const { data: consentRecord } = useChannelConsent(
    wantsRecord ? consentOrg : null,
    'sms',
    wantsRecord ? row.phoneE164 : null,
  );

  // The held clause needs the paper itself — which document lapsed, and when.
  // Only a LAPSED firm is read; every other row costs no query.
  const { data: heldPaper } = useComplianceDocuments(
    row.paper === 'lapsed' && row.companyId ? { holderId: row.companyId } : undefined,
  );
  const blocking = (heldPaper ?? []).find(
    (doc) =>
      doc.blocks.length > 0 &&
      !!doc.expires_on &&
      doc.expires_on < new Date().toISOString().slice(0, 10),
  );
  const held = blocking
    ? heldClause(row.companyName, {
        docLabel:
          COMPLIANCE_DOC_TYPE_LABELS[
            blocking.doc_type as keyof typeof COMPLIANCE_DOC_TYPE_LABELS
          ] ??
          blocking.doc_label ??
          blocking.doc_type,
        expiresOn: blocking.expires_on,
        blocks: blocking.blocks,
      })
    : '';

  // PR-t (STAND): the yes-or-no everywhere, the FIGURE only on the desk. "A
  // phone in a hallway is read over a shoulder", and "$2,500" read over a
  // shoulder is the client's money on a stranger's screen. The Call Sheet
  // renders one DocSheet at every width, so both phrases are rendered and CSS
  // chooses (CR-24) — a JS width branch would hydrate wrong on the first paint.
  const grantFacts = authority.map((grant) => ({
    scope: grant.scope,
    threshold_cents: grant.threshold_cents,
    prepares_only: grant.prepares_only,
  }));
  const phrase = authorityPhrase(grantFacts, AUTHORITY_SCOPE_LABELS);
  const phraseWithoutFigure = authorityPhrase(
    grantFacts.map((grant) => ({ ...grant, threshold_cents: null })),
    AUTHORITY_SCOPE_LABELS,
  );

  const consentLine = consentSentence({
    status: consentRecord?.verdict ?? row.consent,
    source: consentRecord?.record?.source,
    consentedAt: consentRecord?.record?.consented_at,
    optOutSource: consentRecord?.record?.opt_out_source,
    optOutAt: consentRecord?.record?.opt_out_at,
    projectName,
  });

  /**
   * CR3-9 — THE RULE OUTRANKS THE GRANT (C7). A recorded grant is not
   * permission when the studio has written down that this person is never
   * texted; the act was live for exactly that pair until now, and there is no
   * server backstop behind it on the rule.
   */
  const ruleForbidsText = contactRuleForbidsSms(rule);
  const canText =
    isSeat && row.consent === 'granted' && !!row.phone && !ruleForbidsText;
  const textHeldSentence = ruleForbidsText
    ? `The studio’s rule for ${row.name} says never text. Change the rule on their card first.`
    : 'Texting opens once they have said yes on the record and a number is on file.';
  const showFieldActs = isSeat && isFieldPartyKind(row.partyKind ?? '');
  const windowClause = rosterWindowClause(row, band);

  // THE MISTAKEN-ADD PREDICATE, read BEFORE the act is offered. A seat that
  // carries a consent record, a bid or paper the studio holds can only be
  // closed; the sentence beside the held act says which fact is in the way.
  const refusal = seatDeleteRefusal({
    hasConsentRecord: !!row.consent && row.consent !== 'not_asked',
    hasBid: BID_STAGES.includes(row.stage ?? ''),
    hasComplianceDocument: !!row.paper && row.paper !== 'not_on_file',
  });

  const panelId = `roster-row-${row.key.replace(/[^A-Za-z0-9_-]/g, '')}`;
  const refusalId = `${panelId}-refusal`;

  const copyLink = async () => {
    setNote(null);
    try {
      const { token } = await createLink.mutateAsync({
        partyId: seatId,
        projectId,
        expiresAt: row.onSiteTo ?? undefined,
      });
      const url = fieldLinkUrl(token);
      await navigator.clipboard?.writeText(url);
      peopleEvents.grantMinted({
        tier: 'field_link',
        expiry_source: row.onSiteTo ? 'engagement_window' : 'fallback_90_day',
      });
      setNote(`Field link copied — shown once. ${fieldLinkExpirySentence(row.onSiteTo)}`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not open a field link just now.');
    }
  };

  return (
    <li className="border-b border-[var(--color-pearl)] last:border-b-0">
      <div className="flex items-center gap-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-[8px] px-1 text-left transition-colors hover:bg-[rgba(196,165,123,0.05)]"
        >
          <Avatar name={row.name} role={row.partyKind ?? 'other'} size={34} />
          <span className="min-w-0 flex-1">
            <span className="block text-[0.88rem] text-[var(--color-charcoal)]">
              {row.name}
            </span>
            <span className={`mt-[0.1rem] flex flex-wrap items-baseline gap-x-1.5 ${META}`}>
              {row.meta && <span>{row.meta}</span>}
              {row.companyName && (
                <span className="normal-case tracking-normal text-[0.68rem] text-[var(--color-aged-oak)]">
                  <span aria-hidden>■</span> {row.companyName}
                </span>
              )}
              {windowClause && (
                <span className="normal-case tracking-normal text-[0.68rem] text-[var(--color-aged-oak)]">
                  {windowClause}
                </span>
              )}
            </span>
            {phrase && (
              <span className="mt-[0.15rem] block">
                <span className="hidden sm:inline">
                  <PlainFact>{phrase}</PlainFact>
                </span>
                <span data-authority-no-figure className="sm:hidden">
                  <PlainFact>{phraseWithoutFigure}</PlainFact>
                </span>
              </span>
            )}
          </span>
        </button>
        <StateWord family="reach" value={row.reach} />
        <StateWord family="stage" value={row.stage} />
        {onOpenSeat && row.personId && (
          <button
            type="button"
            onClick={() => {
              peopleEvents.personCardOpened({ source: 'roster_row' });
              onOpenSeat(row);
            }}
            aria-label={`Open ${row.name}`}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-[0.8rem] text-[var(--color-aged-oak)] transition-colors hover:text-[var(--color-charcoal)]"
          >
            ›
          </button>
        )}
      </div>

      {/* The phone is the row's SIBLING target, never inside its button.
          A do-not-contact rule takes the number off the row (SPEC §5.1 #10,
          §5.4) — the superintendent standing on site must not have the
          forbidden call one tap away. Channels are hidden, never deleted. */}
      {row.phone && !ruleSilencesPhone && (
        <div className="-mt-1 pb-1 pl-[46px]">
          <TelLink phone={row.phone} personName={row.name} />
        </div>
      )}

      {/* R-S — a rule clause prints wherever a rule is shown, folded or not,
          in the SAME wording, from the SAME predicate, with the SAME routed
          channels the Directory row carries (CR-15 / CR-22). */}
      {ruleClause && (
        <div className="pb-1.5 pl-[46px]">
          <ContactRuleLine
            summary={ruleClause}
            blocked={ruleBlocks}
            routeTo={routeTo ?? null}
          />
        </div>
      )}

      {/* PR-h — the held clause, in words, with a terracotta leading rule. */}
      {held && (
        <p
          data-held-clause
          className="mb-1.5 ml-[46px] border-l-2 border-[var(--color-terracotta-ink)] bg-[rgba(196,131,111,0.07)] px-3 py-2 text-[0.74rem] text-[var(--color-charcoal)]"
        >
          {held}
        </p>
      )}

      {/* R-T — an opted-out note prints on the COLLAPSED row, not only inside
          its unfold: a sub the studio may not text must be visible at a glance. */}
      {!expanded && row.consent === 'opted_out' && (
        <p
          data-opted-out-note
          className="mb-1.5 ml-[46px] text-[0.74rem] text-[var(--color-charcoal)]"
        >
          {consentLine || 'Opted out of texts.'}
        </p>
      )}

      <div id={panelId} hidden={!expanded}>
        {expanded && (
          <div className="border-t border-[var(--color-pearl)] px-1 pb-3 pt-2.5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
              {row.phone && (
                <span className="text-[0.78rem] text-[var(--color-charcoal)]">
                  {row.phone}
                </span>
              )}
              {row.email && (
                <span className="text-[0.78rem] text-[var(--color-charcoal)]">
                  {row.email}
                </span>
              )}
              {!row.phone && !row.email && (
                <span className="text-[0.74rem] text-[var(--color-aged-oak)]">
                  – No phone or email on file.
                </span>
              )}
              <StateWord family="consent" value={row.consent} />
              <StateWord family="paper" value={row.paper} />
            </div>

            {consentLine && (
              <p
                data-consent-sentence
                className="mt-1.5 text-[0.74rem] text-[var(--color-aged-oak)]"
              >
                {consentLine}
              </p>
            )}

            {closing ? (
              <div className="mt-3 border-l-2 border-[var(--color-terracotta-ink)] bg-[rgba(196,131,111,0.07)] px-3 py-2.5">
                <p className="text-[0.74rem] text-[var(--color-charcoal)]">
                  – Close {row.name}&rsquo;s seat? The seat stays on the job with the
                  day it closed, and everything it carries stays with it.
                </p>
                <label
                  className="mt-2 block font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]"
                  htmlFor={`${panelId}-reason`}
                >
                  Why it closed
                </label>
                <input
                  id={`${panelId}-reason`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="min-h-11 w-full border-0 border-b border-[var(--color-pearl)] bg-transparent py-2 text-[0.8rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
                />
                <DocumentActionRow
                  surfaceKey="call-sheet"
                  regionKey="roster-row-close-confirm"
                  className="mt-2"
                  aria-label={`Close ${row.name}'s seat`}
                >
                  <DocumentAction
                    actionKey="confirm-close-seat"
                    variant="danger"
                    onClick={() =>
                      void closeSeat
                        .mutateAsync({ id: seatId, projectId, reason })
                        .then(() => {
                          peopleEvents.seatClosed({
                            from_stage: row.stage,
                            with_reason: !!reason.trim(),
                          });
                          setClosing(false);
                          setNote(`${row.name}'s seat is closed.`);
                        })
                        .catch((e: unknown) =>
                          setNote(
                            e instanceof Error ? e.message : 'Could not close the seat.',
                          ),
                        )
                    }
                    loading={closeSeat.isPending}
                    loadingLabel="Closing…"
                  >
                    Close the seat
                  </DocumentAction>
                  <DocumentAction
                    actionKey="cancel-close-seat"
                    variant="tertiary"
                    onClick={() => setClosing(false)}
                  >
                    Keep it open
                  </DocumentAction>
                  {/* The surviving hard delete: a seat added by mistake that
                      carries nothing. Held, never hidden, so the reason is
                      readable where the act would be. */}
                  <DocumentAction
                    actionKey="remove-mistaken-seat"
                    variant="tertiary"
                    className="ml-auto"
                    disabled={!!refusal}
                    held={!!refusal}
                    aria-describedby={refusal ? refusalId : undefined}
                    onHeldActivate={() =>
                      setNote(refusal ? SEAT_DELETE_REFUSAL_SENTENCES[refusal] : null)
                    }
                    onClick={() =>
                      void removeParty
                        .mutateAsync({ id: seatId, projectId })
                        .then(() => {
                          peopleEvents.seatClosed({
                            from_stage: row.stage,
                            with_reason: false,
                            hard_deleted: true,
                          });
                        })
                        .catch((e: unknown) =>
                          setNote(
                            e instanceof Error ? e.message : 'Could not take it back.',
                          ),
                        )
                    }
                  >
                    Added by mistake
                  </DocumentAction>
                </DocumentActionRow>
                {refusal && (
                  <p id={refusalId} className="mt-1.5 text-[0.72rem] text-[var(--color-aged-oak)]">
                    {SEAT_DELETE_REFUSAL_SENTENCES[refusal]}
                  </p>
                )}
              </div>
            ) : (
              <DocumentActionRow
                surfaceKey="call-sheet"
                regionKey="roster-row"
                className="mt-3"
                aria-label={`Actions for ${row.name}`}
              >
                {showFieldActs && (
                  <DocumentAction
                    actionKey="text-party"
                    variant="primary"
                    onClick={() => setComposing((c) => !c)}
                    disabled={!canText}
                    held={!canText}
                    aria-describedby={!canText ? `${panelId}-text-held` : undefined}
                    onHeldActivate={() => setNote(textHeldSentence)}
                  >
                    Text
                  </DocumentAction>
                )}
                {showFieldActs && (
                  <DocumentAction
                    actionKey="copy-field-link"
                    variant="secondary"
                    onClick={() => void copyLink()}
                    loading={createLink.isPending}
                    loadingLabel="Opening…"
                  >
                    Copy field link
                  </DocumentAction>
                )}
                {isSeat && (
                  <button
                    type="button"
                    onClick={() =>
                      void updateParty.mutateAsync({
                        id: seatId,
                        projectId,
                        patch: { showToClient: !row.showToClient },
                      })
                    }
                    aria-pressed={!!row.showToClient}
                    className={`da-score-hover inline-flex min-h-11 items-center font-mono text-[12px] uppercase tracking-[0.1em] transition-colors ${
                      row.showToClient
                        ? 'da-score-on text-[var(--color-charcoal)]'
                        : 'text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]'
                    }`}
                  >
                    Show to client
                  </button>
                )}
                {isSeat && (
                  <DocumentAction
                    actionKey="close-seat"
                    variant="danger"
                    onClick={() => setClosing(true)}
                    className="ml-auto"
                  >
                    Close this seat
                  </DocumentAction>
                )}
              </DocumentActionRow>
            )}

            {/* CR-7: direction §5.5 and SPEC §7 #4 ask a gated act for
                `aria-disabled` + `aria-describedby` + a VISIBLE consequence
                sentence. This one was `sr-only` — position:absolute,
                clip-path:inset(50%) — so a sighted designer saw a dead Text
                button with nothing beside it, while SPEC §5.4's own string
                list names the sentence as a FACE string. Printed the way the
                Send act three regions down prints its own. */}
            {!canText && showFieldActs && (
              <p
                id={`${panelId}-text-held`}
                className="mt-1 text-[0.7rem] text-[var(--color-aged-oak)]"
              >
                {textHeldSentence}
              </p>
            )}

            {composing && canText && (
              <div className="mt-2.5">
                <textarea
                  rows={2}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  aria-label={`Send a text to ${row.name}`}
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
                        .mutateAsync({ partyId: seatId, body })
                        .then(() => {
                          setBody('');
                          setComposing(false);
                          setNote('Sent.');
                        })
                        .catch((e: unknown) =>
                          setNote(e instanceof Error ? e.message : 'Send failed.'),
                        )
                    }
                    held={!body.trim()}
                    disabled={!body.trim() || sendSms.isPending}
                    aria-describedby={`${panelId}-send-held`}
                    loading={sendSms.isPending}
                    loadingLabel="Sending…"
                  >
                    Send
                  </DocumentAction>
                </DocumentActionRow>
                {/* Direction §5.5: a gated act is `aria-disabled` with a
                    VISIBLE consequence sentence beside it — never `disabled`.
                    The party sheet's identical Send act already reads this
                    way; this one was a regression against the sheet beside
                    it (CR-26). */}
                {!body.trim() && (
                  <p
                    id={`${panelId}-send-held`}
                    className="mt-1 text-[0.7rem] text-[var(--color-aged-oak)]"
                  >
                    Write the message first — a text with no words is not a text.
                  </p>
                )}
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
      </div>
    </li>
  );
}
