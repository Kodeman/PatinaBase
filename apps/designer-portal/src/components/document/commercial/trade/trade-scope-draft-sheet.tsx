'use client';

/**
 * TradeScopeDraftSheet — drafting a trade scope (deck slide 15).
 *
 * Plain-language work, in named rooms, against a party the project already
 * knows. A scope is not a parts list: it is a sentence a tradesperson can
 * price and a client can understand, filed under the room it happens in.
 *
 * The sheet is written top to bottom the way the work is thought about —
 * the rooms, then who does them, then what they bid, then what the client is
 * asked to authorize, then when they pay. It ends on the same verb the
 * furnishings ceremony ends on: one grammar, two kinds of work.
 *
 * A scope is named before it can hold anything, because every row underneath
 * hangs off the document that naming creates.
 */

import { useEffect, useMemo, useState } from 'react';
import { Hammer } from 'lucide-react';
import {
  useCreateTradeScope,
  useRecordTradeBid,
  useSaveTradeScopeDraft,
  useSelectTradeBid,
  useSendTradeScope,
  useSetTradeScopeParty,
  useTradeScopeWorkspace,
} from '@/hooks/use-commercial-documents';
import { useDocumentRooms } from '@/hooks/use-document-rooms';
import {
  computeDrawAmounts,
  money,
  validateTradeScopeDraft,
  type TradeDrawDraft,
} from '@/lib/document/project-commerce';
import { DocSheet } from '../../overlays/doc-sheet';
import { DocumentAction, DocumentActionGroup } from '../../document-action';
import { BidLedger } from './bid-ledger';
import { DrawScheduleEditor, defaultDrawSchedule } from './draw-schedule-editor';
import { PartyField } from './party-field';

const FIELD_LABEL =
  'mb-1 block font-mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]';
const UNDERLINE_INPUT =
  'min-h-11 w-full border-0 border-b border-[var(--color-pearl)] bg-transparent py-2 text-[0.85rem] text-[var(--color-charcoal)] outline-none transition-colors placeholder:italic placeholder:text-[var(--color-aged-oak)] focus:border-[var(--color-clay)]';

interface SectionDraft {
  key: string;
  projectRoomId: string | null;
  roomName: string;
  prose: string;
  allocation: string;
}

const dollarsToCents = (value: string): number => {
  const parsed = Number(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};

const centsToDollars = (cents: number): string =>
  cents > 0 ? String(Math.round(cents) / 100) : '';

let sectionSeq = 0;
const nextSectionKey = () => `section-${(sectionSeq += 1)}`;

export function TradeScopeDraftSheet({
  open,
  projectId,
  proposalId,
  scopeNumber,
  onClose,
  onCreated,
}: {
  open: boolean;
  projectId: string;
  /** Null while the scope is being named for the first time. */
  proposalId: string | null;
  /** The ordinal for the head, when the scope already has one. */
  scopeNumber?: number | null;
  onClose: () => void;
  onCreated?: (proposalId: string) => void;
}) {
  const [liveProposalId, setLiveProposalId] = useState<string | null>(proposalId);
  const [title, setTitle] = useState('');
  const [sections, setSections] = useState<SectionDraft[]>([]);
  const [price, setPrice] = useState('');
  const [terms, setTerms] = useState('');
  const [draws, setDraws] = useState<TradeDrawDraft[]>(defaultDrawSchedule());
  const [error, setError] = useState<string | null>(null);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  const { data: rooms } = useDocumentRooms(projectId);
  const workspace = useTradeScopeWorkspace(liveProposalId, open);
  const createScope = useCreateTradeScope(projectId);
  const saveDraft = useSaveTradeScopeDraft(projectId);
  const setParty = useSetTradeScopeParty(projectId);
  const recordBid = useRecordTradeBid(projectId);
  const selectBid = useSelectTradeBid(projectId);
  const sendScope = useSendTradeScope(projectId);

  useEffect(() => {
    setLiveProposalId(proposalId);
  }, [proposalId]);

  // Hydrate once per scope: the sheet is the editor from that point on, so a
  // background refetch must never overwrite what is being typed.
  useEffect(() => {
    const data = workspace.data;
    if (!liveProposalId || !data || hydratedFor === liveProposalId) return;
    setHydratedFor(liveProposalId);
    setPrice(centsToDollars(data.terms?.clientPriceCents ?? 0));
    setTerms(data.terms?.terms ?? '');
    setSections(
      data.sections.map((section) => ({
        key: nextSectionKey(),
        projectRoomId: section.projectRoomId,
        roomName: section.roomName,
        prose: section.prose,
        allocation: centsToDollars(section.allocationCents ?? 0),
      })),
    );
    if (data.draws.length > 0) {
      setDraws(
        data.draws.map((draw) => ({
          id: draw.id,
          label: draw.label,
          percentage: draw.percentage,
          gatesOnAcceptance: draw.gatesOnAcceptance,
        })),
      );
    }
  }, [workspace.data, liveProposalId, hydratedFor]);

  const clientPriceCents = dollarsToCents(price);
  const partyId = workspace.data?.terms?.partyId ?? null;
  const bids = workspace.data?.bids ?? [];

  const sectionInputs = useMemo(
    () =>
      sections.map((section) => ({
        roomName: section.roomName,
        prose: section.prose,
        allocationCents: section.allocation
          ? dollarsToCents(section.allocation)
          : null,
      })),
    [sections],
  );

  const start = async () => {
    setError(null);
    try {
      const created = await createScope.mutateAsync(title);
      setLiveProposalId(created.proposalId);
      onCreated?.(created.proposalId);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'That scope could not be started.',
      );
    }
  };

  // The draw amounts the DB stores are the canonical ones (percentage is
  // display-only), so they are computed here from the percentages exactly as
  // the editor renders them.
  const persist = async () => {
    if (!liveProposalId) throw new Error('Name this scope first.');
    const amounts = computeDrawAmounts(clientPriceCents, draws);
    await saveDraft.mutateAsync({
      proposalId: liveProposalId,
      clientPriceCents,
      terms,
      sections: sections.map((section) => ({
        projectRoomId: section.projectRoomId,
        roomName: section.roomName,
        prose: section.prose,
        allocationCents: section.allocation
          ? dollarsToCents(section.allocation)
          : null,
      })),
      draws: draws.map((draw, index) => ({
        label: draw.label,
        percentage: draw.percentage,
        amountCents: amounts[index] ?? 0,
        gatesOnAcceptance: draw.gatesOnAcceptance,
      })),
    });
  };

  const saveAsDraft = async () => {
    setError(null);
    try {
      await persist();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'The draft was not saved.',
      );
    }
  };

  const release = async () => {
    setError(null);
    const problem = validateTradeScopeDraft({
      partyId,
      clientPriceCents,
      sections: sectionInputs,
      draws,
    });
    if (problem) {
      setError(problem);
      return;
    }
    if (!liveProposalId) {
      setError('Name this scope first.');
      return;
    }
    try {
      await persist();
      await sendScope.mutateAsync(liveProposalId);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The scope could not be released.',
      );
    }
  };

  const addSection = () => {
    setSections((current) => [
      ...current,
      {
        key: nextSectionKey(),
        projectRoomId: null,
        roomName: 'Throughout',
        prose: '',
        allocation: '',
      },
    ]);
  };

  const updateSection = (key: string, patch: Partial<SectionDraft>) => {
    setSections((current) =>
      current.map((section) =>
        section.key === key ? { ...section, ...patch } : section,
      ),
    );
  };

  const busy = saveDraft.isPending || sendScope.isPending;

  return (
    <DocSheet
      open={open}
      onClose={onClose}
      wide
      icon={Hammer}
      title="Trade scope"
      pageLabel={scopeNumber ? `№ ${scopeNumber}` : 'New'}
    >
      {!liveProposalId ? (
        <div>
          <h3 className="font-heading text-[17px] font-medium text-[var(--color-charcoal)]">
            What is the work?
          </h3>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            Name it the way you would say it to the trade — drapery fabrication
            &amp; install, tile setting, millwork.
          </p>
          <div className="mt-4">
            <label className={FIELD_LABEL} htmlFor="trade-scope-title">
              Scope
            </label>
            <input
              id="trade-scope-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Drapery fabrication &amp; install"
              className={UNDERLINE_INPUT}
            />
          </div>
          <DocumentActionGroup
            surfaceKey="trade-scope"
            regionKey="scope-birth"
            className="mt-4 justify-end"
            aria-label="Start this scope"
          >
            <DocumentAction
              actionKey="start-trade-scope"
              variant="primary"
              loading={createScope.isPending}
              loadingLabel="Starting…"
              disabled={title.trim().length < 2}
              onClick={() => void start()}
            >
              Start this scope
            </DocumentAction>
          </DocumentActionGroup>
          {error && (
            <p role="alert" className="mt-3 text-[11px] text-[var(--color-terracotta-ink)]">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div>
          {/* ── The work ── */}
          <section aria-label="The work">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
                The work
              </p>
              <span className="font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                Written the way you would say it standing in the room
              </span>
            </div>

            {sections.length === 0 && (
              <p className="mt-2 text-[11px] italic text-[var(--text-muted)]">
                No rooms on this scope yet.
              </p>
            )}

            {sections.map((section, index) => (
              <div
                key={section.key}
                className="mt-3 border-b border-[var(--color-pearl)] pb-3"
              >
                <div className="flex flex-wrap items-baseline gap-3">
                  <label className="flex-1">
                    <span className={FIELD_LABEL}>Room</span>
                    <select
                      value={section.projectRoomId ?? ''}
                      aria-label={`Room for scope line ${index + 1}`}
                      onChange={(event) => {
                        const roomId = event.target.value || null;
                        const room = (rooms ?? []).find(
                          (candidate) => candidate.id === roomId,
                        );
                        updateSection(section.key, {
                          projectRoomId: roomId,
                          roomName: room?.name ?? 'Throughout',
                        });
                      }}
                      className={UNDERLINE_INPUT}
                    >
                      <option value="">Throughout</option>
                      {(rooms ?? []).map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="w-32">
                    <span className={FIELD_LABEL}>Allocation</span>
                    <input
                      inputMode="decimal"
                      value={section.allocation}
                      aria-label={`Allocation for scope line ${index + 1}`}
                      placeholder="optional"
                      onChange={(event) =>
                        updateSection(section.key, {
                          allocation: event.target.value,
                        })
                      }
                      className={`${UNDERLINE_INPUT} text-right font-mono`}
                    />
                  </label>
                </div>
                <label className="mt-2 block">
                  <span className={FIELD_LABEL}>Scope</span>
                  <textarea
                    rows={3}
                    value={section.prose}
                    aria-label={`Scope for line ${index + 1}`}
                    placeholder="Fabricate and hang pinch-pleat drapery to five windows, client's linen, blackout lined."
                    onChange={(event) =>
                      updateSection(section.key, { prose: event.target.value })
                    }
                    className={`${UNDERLINE_INPUT} resize-y`}
                  />
                </label>
                <DocumentAction
                  actionKey="remove-trade-scope-room"
                  surfaceKey="trade-scope"
                  regionKey="the-work"
                  variant="tertiary"
                  onClick={() =>
                    setSections((current) =>
                      current.filter((row) => row.key !== section.key),
                    )
                  }
                >
                  Remove this room
                </DocumentAction>
              </div>
            ))}

            <DocumentAction
              actionKey="add-trade-scope-room"
              surfaceKey="trade-scope"
              regionKey="the-work"
              variant="tertiary"
              onClick={addSection}
            >
              Add a room to the scope
            </DocumentAction>
          </section>

          {/* ── Who does it ── */}
          <section className="mt-6" aria-label="Who does it">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
                Who does it
              </p>
              <span className="font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                From the project&rsquo;s parties — subs and installers
              </span>
            </div>
            <div className="mt-2">
              <PartyField
                projectId={projectId}
                partyId={partyId}
                disabled={setParty.isPending}
                onSelect={(nextPartyId) => {
                  setError(null);
                  setParty
                    .mutateAsync({
                      proposalId: liveProposalId,
                      partyId: nextPartyId,
                    })
                    .catch((cause: unknown) =>
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : 'That party could not be set on the scope.',
                      ),
                    );
                }}
              />
            </div>
          </section>

          {/* ── Bids ── */}
          <section className="mt-6">
            <BidLedger
              projectId={projectId}
              proposalId={liveProposalId}
              bids={bids}
              editable
              recording={recordBid.isPending}
              selecting={selectBid.isPending}
              onRecord={async (input) => {
                await recordBid.mutateAsync({
                  proposalId: liveProposalId,
                  ...input,
                });
              }}
              onSelect={async (bidId) => {
                await selectBid.mutateAsync({
                  proposalId: liveProposalId,
                  bidId,
                });
              }}
            />
          </section>

          {/* ── Client price ── */}
          <section className="mt-6" aria-label="Client price">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
                Client price
              </p>
              <span className="font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                What the client is asked to authorize
              </span>
            </div>
            <div className="mt-2 max-w-[220px]">
              <label className={FIELD_LABEL} htmlFor="trade-scope-price">
                Scope total
              </label>
              <input
                id="trade-scope-price"
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="6,800"
                className={`${UNDERLINE_INPUT} font-heading text-[15px]`}
              />
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                {money(clientPriceCents)}
              </p>
            </div>
          </section>

          {/* ── Terms ── */}
          <section className="mt-6" aria-label="Terms">
            <label className={FIELD_LABEL} htmlFor="trade-scope-terms">
              Terms
            </label>
            <textarea
              id="trade-scope-terms"
              rows={2}
              value={terms}
              onChange={(event) => setTerms(event.target.value)}
              placeholder="Prices on this scope are fixed. Anything added later comes as its own document."
              className={`${UNDERLINE_INPUT} resize-y`}
            />
          </section>

          {/* ── Draws ── */}
          <section className="mt-6">
            <DrawScheduleEditor
              clientPriceCents={clientPriceCents}
              draws={draws}
              onChange={setDraws}
            />
          </section>

          {error && (
            <p role="alert" className="mt-4 text-[11px] text-[var(--color-terracotta-ink)]">
              {error}
            </p>
          )}

          <DocumentActionGroup
            surfaceKey="trade-scope"
            regionKey="draft-acts"
            className="mt-6 justify-between"
            aria-label="Trade scope acts"
          >
            <DocumentAction
              actionKey="save-trade-scope-draft"
              variant="secondary"
              loading={saveDraft.isPending && !sendScope.isPending}
              loadingLabel="Saving…"
              disabled={busy}
              onClick={() => void saveAsDraft()}
            >
              Save as draft
            </DocumentAction>
            <DocumentAction
              actionKey="release-trade-scope"
              variant="primary"
              loading={sendScope.isPending}
              loadingLabel="Releasing…"
              disabled={busy}
              onClick={() => void release()}
            >
              Release the trade scope
            </DocumentAction>
          </DocumentActionGroup>
          <p className="mt-1 text-right text-[10px] italic text-[var(--text-muted)]">
            Prices lock on release.
          </p>
        </div>
      )}
    </DocSheet>
  );
}
