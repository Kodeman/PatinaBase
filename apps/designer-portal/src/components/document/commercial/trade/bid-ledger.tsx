'use client';

/**
 * BidLedger — three numbers, one selected, the losers kept with their reason
 * (deck slide 15, mnote 3).
 *
 * The bid ledger is a studio instrument. It informs the client price and never
 * crosses to the client: no bundle carries it, no client document renders it,
 * and no email quotes it. Selecting a bid is the act that also stamps the
 * scope's party — one choice, not two.
 *
 * Phase 1 records numbers the designer already has. A response that lands from
 * a request sent out of the portal (Phase 2, ruling R3) writes the same row
 * with source 'party_response' — the ledger renders it here, marked as having
 * come back from the party, and nothing else about the screen changes.
 *
 * Phase 2 also adds the ask itself: "Ask for a number" sends a one-time link
 * a party opens with no Patina account (useSendTradeRfq → trade-rfq-send).
 * That link never carries the studio's price or another party's bid — only
 * the scope, so a party is never negotiating against a figure they should
 * not see. useTradeRfqs reads the dispatch log for the per-party status.
 */

import { useMemo, useState } from 'react';
import { useProjectParties } from '@patina/supabase';
import type { PartyKind } from '@patina/types';
import {
  useSendTradeRfq,
  useTradeRfqs,
  type TradeRfqView,
} from '@/hooks/use-commercial-documents';
import {
  money,
  when,
  type TradeScopeBidView,
} from '@/lib/document/project-commerce';
import { DocumentAction } from '../../document-action';
import { TRADE_PARTY_KINDS, type TradePartyOption } from './party-field';

/** "Requested {date}" while sent; "Responded {amount} · {date}" once
 *  answered (the matching source='party_response' bid supplies the amount —
 *  the RFQ row itself never carries money). Silent for draft/closed asks: a
 *  draft means send is still retryable, and a closed ask just goes back to
 *  offering "Send a request" again. */
function partyRfqBadge(
  rfq: TradeRfqView | undefined,
  respondedBid: TradeScopeBidView | undefined,
) {
  if (!rfq) return null;
  if (rfq.status === 'responded') {
    const date = when(rfq.respondedAt);
    return (
      <span className="font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--color-sage)]">
        Responded
        {respondedBid ? ` ${money(respondedBid.amountCents)}` : ''}
        {date ? ` · ${date}` : ''}
      </span>
    );
  }
  if (rfq.status === 'sent') {
    const date = when(rfq.sentAt);
    return (
      <span className="font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
        Requested{date ? ` ${date}` : ''}
      </span>
    );
  }
  return null;
}

const FIELD_LABEL =
  'mb-1 block font-mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]';
const UNDERLINE_INPUT =
  'min-h-11 w-full border-0 border-b border-[var(--color-pearl)] bg-transparent py-2 text-[0.85rem] text-[var(--color-charcoal)] outline-none transition-colors placeholder:italic placeholder:text-[var(--color-aged-oak)] focus:border-[var(--color-clay)]';

const dollarsToCents = (value: string): number => {
  const parsed = Number(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};

export function BidLedger({
  projectId,
  proposalId,
  bids,
  editable,
  onRecord,
  onSelect,
  recording = false,
  selecting = false,
}: {
  projectId: string;
  /** The trade scope this ledger belongs to — asks are dispatched per scope. */
  proposalId: string;
  bids: readonly TradeScopeBidView[];
  /** Bids are recorded and selected while the scope is a draft. */
  editable: boolean;
  onRecord: (input: {
    partyId: string;
    partyDisplayName: string;
    amountCents: number;
    note: string | null;
  }) => Promise<void>;
  onSelect: (bidId: string) => Promise<void>;
  recording?: boolean;
  selecting?: boolean;
}) {
  const { data: parties } = useProjectParties(projectId);
  const [adding, setAdding] = useState(false);
  const [partyId, setPartyId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const rfqsQuery = useTradeRfqs(proposalId);
  const rfqs = rfqsQuery.data ?? [];
  const sendRfq = useSendTradeRfq(proposalId);
  const [rfqError, setRfqError] = useState<{ partyId: string; message: string } | null>(
    null,
  );

  const eligible = useMemo(
    () =>
      ((parties ?? []) as TradePartyOption[]).filter((party) =>
        TRADE_PARTY_KINDS.includes(party.party_kind as PartyKind),
      ),
    [parties],
  );

  const sendRequest = async (party: TradePartyOption, existingRfqId?: string) => {
    setRfqError(null);
    try {
      await sendRfq.mutateAsync({ partyId: party.id, existingRfqId });
    } catch (cause) {
      setRfqError({
        partyId: party.id,
        message:
          cause instanceof Error ? cause.message : 'That request could not be sent.',
      });
    }
  };

  const record = async () => {
    const party = eligible.find((option) => option.id === partyId);
    if (!party) {
      setError('Whose number is this?');
      return;
    }
    const amountCents = dollarsToCents(amount);
    if (amountCents <= 0) {
      setError('Record what they quoted.');
      return;
    }
    setError(null);
    try {
      await onRecord({
        partyId: party.id,
        partyDisplayName: party.display_name,
        amountCents,
        note: note.trim() || null,
      });
      setPartyId('');
      setAmount('');
      setNote('');
      setAdding(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'That bid was not recorded.',
      );
    }
  };

  const choose = async (bidId: string) => {
    setError(null);
    try {
      await onSelect(bidId);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'That bid could not be selected.',
      );
    }
  };

  return (
    <section aria-label="Bids">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
          Bids
        </p>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
          Recorded by the studio · never leaves the drawer
        </span>
      </div>

      {bids.length === 0 && (
        <p className="mt-2 text-[11px] italic text-[var(--text-muted)]">
          No bids recorded yet.
        </p>
      )}

      {bids.length > 0 && (
        <ul className="mt-2" role="radiogroup" aria-label="Bids">
          {bids.map((bid) => {
            const chosen = bid.status === 'selected';
            return (
              <li
                key={bid.id}
                className="border-b border-[var(--color-pearl)] last:border-b-0"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  disabled={!editable || selecting || bid.status === 'withdrawn'}
                  onClick={() => void choose(bid.id)}
                  className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-1 py-2 text-left disabled:cursor-default disabled:opacity-60"
                >
                  <span
                    aria-hidden
                    className="inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full border"
                    style={{
                      borderColor: chosen
                        ? 'var(--color-clay)'
                        : 'var(--color-pearl)',
                    }}
                  >
                    {chosen && (
                      <span
                        className="block h-[7px] w-[7px] rounded-full"
                        style={{ background: 'var(--color-clay)' }}
                      />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] text-[var(--color-charcoal)]">
                      {bid.partyDisplayName}
                      {bid.source === 'party_response' && (
                        <span className="ml-2 font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--color-sage)]">
                          Answered
                        </span>
                      )}
                    </span>
                    <span className="mt-px block truncate text-[10.5px] text-[var(--text-muted)]">
                      {[
                        chosen ? 'Selected' : null,
                        bid.status === 'withdrawn' ? 'Withdrawn' : null,
                        bid.note,
                        when(bid.respondedAt ?? bid.notedAt),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-right font-heading text-[13px] font-medium text-[var(--color-charcoal)]">
                    {money(bid.amountCents)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-2 text-[10px] italic text-[var(--text-muted)]">
        Their numbers never appear on client documents.
      </p>

      {eligible.length > 0 && (
        <div className="mt-4 border-t border-[var(--color-pearl)] pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
              Ask for a number
            </p>
            <span className="font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
              A private link · no price, no other bids
            </span>
          </div>
          <ul className="mt-2">
            {eligible.map((party) => {
              const rfq = rfqs.find((candidate) => candidate.partyId === party.id);
              const respondedBid = bids.find(
                (candidate) =>
                  candidate.partyId === party.id &&
                  candidate.source === 'party_response',
              );
              const sending =
                sendRfq.isPending && sendRfq.variables?.partyId === party.id;
              const badge = partyRfqBadge(rfq, respondedBid);
              return (
                <li
                  key={party.id}
                  className="border-b border-[var(--color-pearl)] py-1.5 last:border-b-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-[11.5px] text-[var(--color-charcoal)]">
                      {party.display_name}
                    </span>
                    <span className="flex items-center gap-1">
                      {badge}
                      {!badge && editable && (
                        <DocumentAction
                          actionKey="send-trade-rfq"
                          surfaceKey="trade-scope"
                          regionKey="bid-ledger"
                          variant="tertiary"
                          loading={sending}
                          loadingLabel="Sending…"
                          onClick={() => void sendRequest(party)}
                        >
                          Send a request
                        </DocumentAction>
                      )}
                      {rfq?.status === 'sent' && editable && (
                        <DocumentAction
                          actionKey="resend-trade-rfq"
                          surfaceKey="trade-scope"
                          regionKey="bid-ledger"
                          variant="tertiary"
                          loading={sending}
                          loadingLabel="Sending…"
                          title="Mints a fresh link — the old one stops working"
                          onClick={() => void sendRequest(party, rfq.id)}
                        >
                          Resend
                        </DocumentAction>
                      )}
                    </span>
                  </div>
                  {rfqError?.partyId === party.id && (
                    <p
                      role="alert"
                      className="mt-1 text-[10.5px] text-[var(--color-terracotta-ink)]"
                    >
                      {rfqError.message}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {editable && !adding && (
        <DocumentAction
          actionKey="open-record-trade-bid"
          surfaceKey="trade-scope"
          regionKey="bid-ledger"
          variant="tertiary"
          onClick={() => setAdding(true)}
        >
          Record a bid
        </DocumentAction>
      )}

      {editable && adding && (
        <div className="mt-3 border-l-2 border-[var(--color-pearl)] pl-3">
          <div>
            <label className={FIELD_LABEL} htmlFor="trade-bid-party">
              Whose number
            </label>
            <select
              id="trade-bid-party"
              value={partyId}
              onChange={(event) => setPartyId(event.target.value)}
              className={UNDERLINE_INPUT}
            >
              <option value="">Choose a sub or installer</option>
              {eligible.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.display_name}
                  {party.company_name ? ` · ${party.company_name}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3">
            <label className={FIELD_LABEL} htmlFor="trade-bid-amount">
              What they quoted
            </label>
            <input
              id="trade-bid-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="4,150"
              className={UNDERLINE_INPUT}
            />
          </div>

          <div className="mt-3">
            <label className={FIELD_LABEL} htmlFor="trade-bid-note">
              Note
            </label>
            <input
              id="trade-bid-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="No install date"
              className={UNDERLINE_INPUT}
            />
          </div>

          <div className="mt-2 flex items-center gap-3">
            <DocumentAction
              actionKey="record-trade-bid"
              surfaceKey="trade-scope"
              regionKey="bid-ledger"
              variant="primary"
              loading={recording}
              loadingLabel="Recording…"
              onClick={() => void record()}
            >
              Record the bid
            </DocumentAction>
            <DocumentAction
              actionKey="cancel-record-trade-bid"
              surfaceKey="trade-scope"
              regionKey="bid-ledger"
              variant="tertiary"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
            >
              Never mind
            </DocumentAction>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[11px] text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}
    </section>
  );
}
