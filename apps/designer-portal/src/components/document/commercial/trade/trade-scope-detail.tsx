'use client';

/**
 * TradeScopeDetail — a signed scope, live on the project (deck slide 17).
 *
 * After the signature a scope is a piece of work, not a document: it moves
 * through four states, sits in its rooms on the schedule, and ends in a
 * ceremony rather than a status change. Engagement is a second act — the
 * client authorizes, the studio then engages the trade. Two events, two dates.
 *
 * Every act here states its gate rather than hiding: an act that cannot run
 * yet stays visible and says what would change that, because a greyed word
 * with no reason is just a locked door.
 *
 * Acceptance itself is the client's (ruling R2) — it is asked for on their
 * copy, not taken here. What the studio can do is record the work reaching
 * substantial completion, and issue the draws the schedule allows.
 */

import { useState } from 'react';
import { Hammer } from 'lucide-react';
import {
  useEngageTradeScope,
  useIssueTradeDrawInvoice,
  useMarkTradeScopeInProgress,
  useRecordSubstantialCompletion,
  useTradeScopeWorkspace,
  useVoidTradeScope,
} from '@/hooks/use-commercial-documents';
import {
  drawIsLiveBilled,
  drawIsPaid,
  money,
  tradeDrawGate,
  tradeEngageGate,
  tradeJourneySteps,
  tradeProgressGate,
  when,
  type TradeScopeView,
} from '@/lib/document/project-commerce';
import { DocSheet } from '../../overlays/doc-sheet';
import { DocumentAction, DocumentActionGroup } from '../../document-action';
import { WorkOrderSheet } from './work-order-sheet';

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="block font-mono text-[8px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
        {label}
      </span>
      <strong className="text-[13px] text-[var(--color-charcoal)]">
        {value}
      </strong>
    </span>
  );
}

/** The journey band: done reads settled, now reads clay, ahead stays quiet. */
function JourneyBand({ scope }: { scope: TradeScopeView }) {
  const steps = tradeJourneySteps(scope);
  return (
    <ol
      aria-label="Trade scope journey"
      className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1"
    >
      {steps.map((step, index) => (
        <li key={step.key} className="flex items-center gap-2">
          <span
            data-journey-state={step.state}
            className="font-mono text-[9px] uppercase tracking-[0.06em]"
            style={{
              color:
                step.state === 'done'
                  ? 'var(--color-sage)'
                  : step.state === 'now'
                    ? 'var(--color-clay)'
                    : 'var(--text-muted)',
            }}
          >
            {step.label}
          </span>
          {index < steps.length - 1 && (
            <span aria-hidden className="text-[9px] text-[var(--text-muted)]">
              ·
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** A gated act, with its reason said out loud beside it. */
function GatedAct({
  actionKey,
  label,
  gate,
  pending,
  onRun,
}: {
  actionKey: string;
  label: string;
  gate: { allowed: true } | { allowed: false; reason: string };
  pending: boolean;
  onRun: () => void;
}) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <DocumentAction
        actionKey={actionKey}
        surfaceKey="trade-scope"
        regionKey="progress-acts"
        variant="secondary"
        disabled={!gate.allowed || pending}
        loading={pending}
        loadingLabel="Recording…"
        onClick={onRun}
      >
        {label}
      </DocumentAction>
      {!gate.allowed && (
        <span className="font-mono text-[8.5px] lowercase tracking-[0.04em] text-[var(--text-muted)]">
          {gate.reason}
        </span>
      )}
    </span>
  );
}

function TradeVoidAct({
  projectId,
  scope,
  onVoided,
}: {
  projectId: string;
  scope: TradeScopeView;
  onVoided?: () => void;
}) {
  const voidScope = useVoidTradeScope(projectId);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const expectedConfirm = `VOID TS${scope.number}`;
  const canVoid =
    reason.trim().length >= 5 && confirmText.trim() === expectedConfirm;

  if (!open) {
    return (
      <DocumentAction
        actionKey="open-void-trade-scope"
        surfaceKey="trade-scope"
        regionKey="void"
        variant="danger"
        onClick={() => setOpen(true)}
      >
        Void &amp; supersede
      </DocumentAction>
    );
  }

  return (
    <div className="border-l-2 border-[var(--color-terracotta)] pl-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-terracotta)]">
        Void trade scope № {scope.number}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-mocha)]">
        This retires the scope and marks it superseded. It cannot be undone.
      </p>

      <label className="mt-3 block text-[10px] text-[var(--text-muted)]">
        Reason for the void
        <textarea
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="The client moved the drapery out of this phase…"
          className="mt-1 w-full rounded-[3px] border border-[var(--doc-ink-border)] bg-white px-3 py-2 text-[12px] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-terracotta)]"
        />
      </label>

      <label className="mt-3 block text-[10px] text-[var(--text-muted)]">
        Type{' '}
        <strong className="font-mono text-[var(--color-charcoal)]">
          {expectedConfirm}
        </strong>{' '}
        to confirm
        <input
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          aria-label={`Type ${expectedConfirm} to confirm the void`}
          autoComplete="off"
          className="mt-1 w-full rounded-[3px] border border-[var(--doc-ink-border)] bg-white px-3 py-2 font-mono text-[12px] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-terracotta)]"
        />
      </label>

      {error && (
        <p role="alert" className="mt-2 text-[11px] text-[var(--color-terracotta)]">
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <DocumentAction
          actionKey="cancel-void-trade-scope"
          surfaceKey="trade-scope"
          regionKey="void"
          variant="tertiary"
          onClick={() => {
            setOpen(false);
            setReason('');
            setConfirmText('');
            setError(null);
          }}
        >
          Never mind
        </DocumentAction>
        <DocumentAction
          actionKey="void-trade-scope"
          surfaceKey="trade-scope"
          regionKey="void"
          variant="danger"
          disabled={!canVoid}
          loading={voidScope.isPending}
          loadingLabel="Voiding…"
          onClick={async () => {
            if (!canVoid) return;
            setError(null);
            try {
              await voidScope.mutateAsync({
                proposalId: scope.proposalId,
                reason,
              });
              onVoided?.();
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : 'This scope could not be voided.',
              );
            }
          }}
        >
          Void TS{scope.number}
        </DocumentAction>
      </div>
    </div>
  );
}

export function TradeScopeDetail({
  projectId,
  projectName = '',
  scope,
  open,
  onClose,
}: {
  projectId: string;
  projectName?: string;
  scope: TradeScopeView | null;
  open: boolean;
  onClose: () => void;
}) {
  const workspace = useTradeScopeWorkspace(scope?.proposalId ?? null, open);
  const engage = useEngageTradeScope(projectId);
  const markInProgress = useMarkTradeScopeInProgress(projectId);
  const recordCompletion = useRecordSubstantialCompletion(projectId);
  const issueDraw = useIssueTradeDrawInvoice(projectId);
  const [error, setError] = useState<string | null>(null);
  const [workOrderOpen, setWorkOrderOpen] = useState(false);

  if (!scope) return null;

  const terms = workspace.data?.terms ?? null;
  const sections = workspace.data?.sections ?? [];
  const partyName =
    scope.partyDisplayName ?? terms?.partyDisplayName ?? 'the trade';
  const engageGate = tradeEngageGate(scope);
  const inProgressGate = tradeProgressGate(scope, 'in_progress');
  const completionGate = tradeProgressGate(scope, 'substantially_complete');

  const run = async (act: () => Promise<unknown>, failure: string) => {
    setError(null);
    try {
      await act();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : failure);
    }
  };

  return (
    <DocSheet
      open={open}
      onClose={onClose}
      wide
      icon={Hammer}
      title="Trade scope"
      pageLabel={`№ ${scope.number}`}
    >
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-clay)]">
          Trade scope № {scope.number}
        </p>
        <h2 className="mt-1 font-heading text-xl text-[var(--color-charcoal)]">
          {scope.title}
        </h2>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
          {[
            partyName,
            terms?.engagedAt ? `engaged ${when(terms.engagedAt)}` : null,
            terms?.acceptedAt ? `accepted ${when(terms.acceptedAt)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>

        <JourneyBand scope={scope} />

        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-[var(--doc-ink-border)] py-4 sm:grid-cols-4">
          <Figure label="client price" value={money(scope.clientPriceCents)} />
          <Figure
            label="deposit"
            value={
              scope.depositPaid
                ? 'Paid'
                : scope.depositInvoiceId
                  ? 'Invoiced'
                  : 'Not raised'
            }
          />
          <Figure
            label="draws issued"
            value={`${scope.drawsIssued} of ${scope.drawCount}`}
          />
          <Figure label="draws paid" value={String(scope.drawsPaid)} />
        </div>

        <DocumentActionGroup
          surfaceKey="trade-scope"
          regionKey="progress-acts"
          className="mt-4 flex-wrap gap-x-4 gap-y-2"
          aria-label="Trade scope acts"
        >
          <GatedAct
            actionKey="engage-trade-scope"
            label={`Engage ${partyName}`}
            gate={engageGate}
            pending={engage.isPending}
            onRun={() =>
              void run(
                () => engage.mutateAsync(scope.proposalId),
                'The trade could not be engaged.',
              )
            }
          />
          <GatedAct
            actionKey="mark-trade-in-progress"
            label="Mark in progress"
            gate={inProgressGate}
            pending={markInProgress.isPending}
            onRun={() =>
              void run(
                () => markInProgress.mutateAsync(scope.proposalId),
                'That could not be recorded.',
              )
            }
          />
          <GatedAct
            actionKey="record-trade-substantial-completion"
            label="Record substantial completion"
            gate={completionGate}
            pending={recordCompletion.isPending}
            onRun={() =>
              void run(
                () => recordCompletion.mutateAsync(scope.proposalId),
                'That could not be recorded.',
              )
            }
          />
          <DocumentAction
            actionKey="open-trade-work-order"
            variant="tertiary"
            onClick={() => setWorkOrderOpen(true)}
          >
            Work order
          </DocumentAction>
        </DocumentActionGroup>

        {scope.progressState !== 'accepted' && scope.state === 'executed' && (
          <p className="mt-2 text-[10.5px] italic text-[var(--text-muted)]">
            Acceptance is the client&rsquo;s — they close the scope from their
            copy, and the final draw follows.
          </p>
        )}

        {error && (
          <p role="alert" className="mt-3 text-[11px] text-[var(--color-terracotta)]">
            {error}
          </p>
        )}

        {/* ── The draws ── */}
        <div className="mt-6">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
            Draws
          </p>
          {scope.draws.length === 0 ? (
            <p className="mt-2 text-[11px] italic text-[var(--text-muted)]">
              No draw schedule on this scope.
            </p>
          ) : (
            <table className="mt-2 w-full text-left text-[11px]">
              <thead className="font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                <tr>
                  <th scope="col" className="py-1 font-normal">
                    Draw
                  </th>
                  <th scope="col" className="py-1 text-right font-normal">
                    Amount
                  </th>
                  <th scope="col" className="py-1 text-right font-normal">
                    State
                  </th>
                  <th scope="col" className="py-1 text-right font-normal">
                    <span className="sr-only">Issue</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {scope.draws.map((draw) => {
                  const gate = tradeDrawGate(scope, draw);
                  const state = drawIsPaid(draw)
                    ? 'Paid'
                    : drawIsLiveBilled(draw)
                      ? 'Invoiced'
                      : 'Not yet issued';
                  return (
                    <tr
                      key={draw.id}
                      className="border-t border-[var(--doc-ink-border)]/60"
                    >
                      <td className="py-2 pr-2 text-[var(--color-charcoal)]">
                        {draw.label}
                        {draw.percentage !== null && (
                          <span className="ml-1 font-mono text-[9px] text-[var(--text-muted)]">
                            {draw.percentage}%
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-2 text-right font-heading text-[12px] font-medium text-[var(--color-charcoal)]">
                        {money(draw.amountCents)}
                      </td>
                      <td className="py-2 pr-2 text-right font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                        {state}
                      </td>
                      <td className="py-2 text-right">
                        {!drawIsLiveBilled(draw) && (
                          <GatedAct
                            actionKey="issue-trade-draw"
                            label="Issue draw"
                            gate={gate}
                            pending={issueDraw.isPending}
                            onRun={() =>
                              void run(
                                () =>
                                  issueDraw.mutateAsync({
                                    proposalId: scope.proposalId,
                                    drawId: draw.id,
                                  }),
                                'That draw could not be invoiced.',
                              )
                            }
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── On the schedule ── */}
        <div className="mt-6">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
            On the schedule
          </p>
          <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
            One line per room, in the rooms the work happens in.
          </p>
          {sections.length === 0 ? (
            <p className="mt-2 text-[11px] italic text-[var(--text-muted)]">
              No rooms written on this scope.
            </p>
          ) : (
            sections.map((section) => (
              <div
                key={section.id || section.roomName}
                className="mt-3 border-t border-[var(--doc-ink-border)]/60 pt-2"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h4 className="font-heading text-[12.5px] font-medium italic text-[var(--color-charcoal)]">
                    {section.roomName || 'Throughout'}
                  </h4>
                  {section.allocationCents !== null && (
                    <span className="font-mono text-[9px] text-[var(--text-muted)]">
                      {money(section.allocationCents)}
                    </span>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-line text-[11.5px] leading-relaxed text-[var(--color-mocha)]">
                  {section.prose}
                </p>
              </div>
            ))
          )}
        </div>

        {(scope.state === 'draft' || scope.state === 'sent') && (
          <div className="mt-6 border-t border-[var(--doc-ink-border)] pt-4">
            <TradeVoidAct
              projectId={projectId}
              scope={scope}
              onVoided={onClose}
            />
          </div>
        )}
      </div>

      <WorkOrderSheet
        open={workOrderOpen}
        onClose={() => setWorkOrderOpen(false)}
        projectName={projectName}
        scopeNumber={scope.number}
        title={scope.title}
        terms={terms}
        sections={sections}
      />
    </DocSheet>
  );
}
