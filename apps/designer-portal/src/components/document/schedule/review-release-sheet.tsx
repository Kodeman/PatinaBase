'use client';

/**
 * Review & release (Authorized Schedule deck, slide 11).
 *
 * The last sheet before a client is asked to sign. Room-grouped, deposit
 * named, checkpoint stated on the same paper — and one sentence at the bottom
 * that tells the truth about what happens next.
 *
 * Four columns and no fifth: item, room, signed quantity, client price. Trade
 * cost never appears here, because this sheet becomes the client's document.
 *
 * The gate strip is inline and honest, and it mirrors what the release RPC
 * (create_furnishings_authorization_from_schedule, 00422) actually enforces —
 * a checkpoint that exists, covers every released room, AND carries status
 * 'acknowledged' or 'overridden'. Coverage — whether the client has seen a
 * budget checkpoint for the rooms they are being asked to sign for — holds
 * the send until a fresh checkpoint is published, which can be done from this
 * sheet without leaving it. A covering checkpoint that is still 'open'
 * (unacknowledged) holds the send too — publishing another one cannot help,
 * since the new one is 'open' as well — so the sheet says who it's waiting on
 * and offers an audited override inline, the same reasoned escape hatch the
 * working-budget panel uses. Drift is advisory: the schedule has moved since
 * the checkpoint, the designer may send anyway, and the instrument records
 * which checkpoint was current when it was signed.
 */

import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { FileSignature } from 'lucide-react';
import {
  checkpointCoverage,
  depositCents,
  furnishingsDepositPercent,
  releaseSummary,
  scheduleDrift,
  type ReleaseLine,
} from '@/lib/document/authorization-derivation';
import { fmtDay, fmtUsd } from '@/lib/document/format';
import { leadTimeLabel } from '@/lib/scope/lead-time';
import {
  formatCurrencyTotal,
  formatMoney,
  isMixed,
  rowCurrency,
  sumByCurrency,
} from '@/lib/currency-totals';
import {
  useOverrideBudgetCheckpoint,
  useProjectBillingAuthority,
  usePublishBudgetCheckpoint,
  useReleaseForAuthorization,
  useWorkingBudget,
} from '@/hooks/use-commercial-documents';
import { useProjectPurchasingAgreement } from '@/hooks/use-project-purchasing-agreement';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { DocSheet } from '../overlays/doc-sheet';
import { PurchasingAuthorizationPreviewSheet } from '../overlays/purchasing-authorization-preview-sheet';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { requestRegionUnfold } from '@/lib/document/document-index';

const CHIPS = [0, 25, 50, 100] as const;
const LEAD_TIME_TBC = 'Lead time to be confirmed';

/** The checkpoint's stamped schedule figure. `scheduled_cents` is frozen INTO
 *  the budget line by publish_budget_checkpoint (00422), so this is what the
 *  client last saw — not a live recompute. Read defensively: an older payload
 *  simply has nothing to say about drift. */
function stampedScheduledCents(version: unknown): number | null {
  const lines = (version as { lines?: unknown[] } | null | undefined)?.lines;
  if (!Array.isArray(lines) || lines.length === 0) return null;
  let total = 0;
  let seen = false;
  for (const line of lines) {
    const value = (line as { scheduledCents?: unknown })?.scheduledCents;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      total += Math.round(parsed);
      seen = true;
    }
  }
  return seen ? total : null;
}

/** The checkpoint row itself, read defensively — this sheet treats the whole
 *  working-budget payload as unknown so it stays testable against partial
 *  mocks (see stampedScheduledCents above). */
function checkpointRow(
  budget: unknown,
): { id?: string; state?: string; checkpointCode?: string } | null {
  const checkpoint = (budget as { checkpoint?: unknown } | null | undefined)
    ?.checkpoint;
  return checkpoint && typeof checkpoint === 'object'
    ? (checkpoint as { id?: string; state?: string; checkpointCode?: string })
    : null;
}

/** Which rooms the last checkpoint covered: the checkpoint's own list when the
 *  RPC carries one, otherwise the rooms its published version spoke for. */
function checkpointRoomIds(budget: unknown): string[] {
  const checkpoint = (budget as { checkpoint?: unknown } | null | undefined)
    ?.checkpoint;
  const declared = (checkpoint as { coveredRoomIds?: unknown } | null)
    ?.coveredRoomIds;
  if (Array.isArray(declared)) {
    return declared.filter((id): id is string => typeof id === 'string');
  }
  const lines = (
    budget as { version?: { lines?: unknown[] } } | null | undefined
  )?.version?.lines;
  if (!Array.isArray(lines)) return [];
  return lines
    .map((line) => (line as { roomId?: unknown })?.roomId)
    .filter((id): id is string => typeof id === 'string');
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[11px] lowercase tracking-[0.08em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="font-heading text-[15px] font-medium text-[var(--color-charcoal)]">
        {value}
      </p>
    </div>
  );
}

export function ReviewReleaseSheet(props: ComponentProps<typeof ReviewReleaseSheetContent>) {
  return <ReviewReleaseSheetContent key={props.projectId} {...props} />;
}

function ReviewReleaseSheetContent({
  open,
  projectId,
  projectName,
  clientName,
  instrumentNumber,
  lines,
  currentScheduledCents = null,
  onClose,
  onReleased,
  savedProposalId = null,
  onSaved,
}: {
  open: boolean;
  projectId: string;
  projectName: string;
  /** For the "Waiting on {client}…" gate copy. Falls back to "the client". */
  clientName?: string;
  /** The provisional № minted when the ceremony opened. */
  instrumentNumber: number;
  lines: readonly ReleaseLine[];
  /** The whole schedule's current figure — the other half of the drift read. */
  currentScheduledCents?: number | null;
  /** Leave the sheet with the ticks intact. */
  onClose: () => void;
  /** The release landed — put the ceremony back. */
  onReleased: () => void;
  savedProposalId?: string | null;
  onSaved?: (proposalId: string) => void;
}) {
  const authority = useProjectBillingAuthority(projectId);
  const purchasingAgreement = useProjectPurchasingAgreement(projectId);
  const budget = useWorkingBudget(projectId);
  const release = useReleaseForAuthorization(projectId);
  const publishCheckpoint = usePublishBudgetCheckpoint(projectId);
  const overrideCheckpoint = useOverrideBudgetCheckpoint(projectId);
  // US-19 D3 (one-voice, R162): a paper sent for signature is the filled tier,
  // beneath the consequence sentence the sheet already states (R141).
  const oneVoice = useFeatureFlag('one-voice').value === true;

  const active = useRef(true);
  const saving = useRef(false);
  const previewTrigger = useRef<HTMLButtonElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [identityUnavailable, setIdentityUnavailable] = useState(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const agreementPercent = furnishingsDepositPercent(authority.data);
  const [chosenPercent, setChosenPercent] = useState<number | null>(null);
  const [otherOpen, setOtherOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [localProposalId, setLocalProposalId] = useState<string | null>(null);
  const releasedProposalId = savedProposalId ?? localProposalId;

  const percent = chosenPercent ?? agreementPercent;
  const { lineCount, roomCount, total } = releaseSummary(lines);

  const rooms = useMemo(() => {
    const grouped = new Map<string, { name: string; lines: ReleaseLine[] }>();
    for (const line of lines) {
      const key = line.roomId ?? '__throughout__';
      const held = grouped.get(key);
      if (held) held.lines.push(line);
      else
        grouped.set(key, {
          name: line.roomName || 'Throughout',
          lines: [line],
        });
    }
    return Array.from(grouped.entries()).map(([key, group]) => ({
      key,
      ...group,
    }));
  }, [lines]);

  const coverage = checkpointCoverage({
    checkpointRoomIds: checkpointRoomIds(budget.data),
    releasedRoomIds: lines.map((line) => line.roomId),
  });
  const checkpoint = checkpointRow(budget.data);
  const hasCheckpoint = Boolean(checkpoint?.id);
  const coverageGap = hasCheckpoint && !coverage.covered;
  // project_budget_checkpoints.status is 'open' | 'acknowledged' |
  // 'overridden' (00412/00422) — a fresh checkpoint starts 'open' and stays
  // there until the client acknowledges it or the designer records an
  // audited override. The release RPC refuses anything else, so the sheet
  // must too: publishing a fresh checkpoint from the two branches below
  // cannot help here, because the fresh one is 'open' as well.
  const awaitingAcknowledgment =
    hasCheckpoint &&
    !coverageGap &&
    checkpoint?.state !== 'acknowledged' &&
    checkpoint?.state !== 'overridden';
  const agreementKnown = !authority.isPending && !authority.isError &&
    !purchasingAgreement.isPending && !purchasingAgreement.isError;
  const agreementId = authority.data?.agreementId ?? null;
  const canPublish = agreementKnown && (Boolean(agreementId) ||
    (!authority.data && purchasingAgreement.data?.state === 'external_recorded'));
  const blocked = !canPublish || budget.isLoading || Boolean(budget.error) ||
    !budget.data?.version?.id || !hasCheckpoint || coverageGap || awaitingAcknowledgment;
  const drift = scheduleDrift({
    stampedCents: stampedScheduledCents(budget.data?.version),
    currentCents: currentScheduledCents,
  });

  const uncoveredNames = coverage.uncoveredRoomIds
    .map((roomId) => rooms.find((room) => room.key === roomId)?.name ?? null)
    .filter((name): name is string => Boolean(name));

  const clientLabel = clientName?.trim() || 'the client';

  const versionId = budget.data?.version?.id ?? null;
  const busy = release.isPending;
  const name = `Furnishings authorization № ${instrumentNumber}`;

  const runRelease = async () => {
    setError(null);
    return release.mutateAsync({
      name,
      ffeItemIds: lines.map((line) => line.id),
      ...(percent === null ? {} : { depositPercent: percent }),
    });
  };

  const save = async (preview: boolean) => {
    if (saving.current || busy || identityUnavailable || (blocked && !releasedProposalId)) return;
    if (releasedProposalId) { setPreviewOpen(preview); return; }
    saving.current = true;
    try {
      const created = await runRelease();
      // The project owner outlives this dismissible sheet; deliver persistence
      // before checking whether the child may still render.
      if (created?.proposalId) onSaved?.(created.proposalId);
      if (!active.current) return;
      if (!created?.proposalId) {
        setIdentityUnavailable(true);
        throw new Error('The draft was saved but its identity is unavailable. Open it from the authorization ledger; do not save again.');
      }
      setLocalProposalId(created.proposalId);
      if (preview) setPreviewOpen(true);
      else onReleased();
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : 'The authorization could not be drafted.');
    } finally { saving.current = false; }
  };

  const submitOverride = async () => {
    if (!checkpoint?.id || overrideReason.trim().length < 5) return;
    setError(null);
    try {
      await overrideCheckpoint.mutateAsync({
        checkpointId: checkpoint.id,
        reason: overrideReason,
      });
      setOverrideOpen(false);
      setOverrideReason('');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The override was not recorded.',
      );
    }
  };

  const openWorkingBudget = () => {
    onClose();
    requestRegionUnfold('money');
    // Land after DocSheet restores its trigger and Money mounts its heading.
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const heading = document.getElementById('money-region-heading');
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    }));
  };

  const publishFresh = async () => {
    setError(null);
    setPublishMessage(null);
    if (!versionId || !canPublish || budget.isLoading || budget.error) {
      setError(
        'A budget version and an executed agreement are needed before a checkpoint can be published.',
      );
      return;
    }
    try {
      await publishCheckpoint.mutateAsync({ versionId, agreementId });
      if (!agreementId) setPublishMessage('Checkpoint published. No client notification sent.');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The checkpoint could not be published.',
      );
    }
  };

  if (releasedProposalId) return (
    <DocSheet open={open} onClose={onClose} wide icon={FileSignature} title="Purchasing authorization" pageLabel={`№ ${instrumentNumber}`}>
      <p role="status">Draft saved. Nothing has been sent to the client. The saved lines and deposit are frozen; closing leaves their reservations intact.</p>
      <p className="mt-3">To revise, use the existing Void action with a reason, then prepare a new draft.</p>
      <DocumentAction ref={previewTrigger} actionKey="reopen-saved-purchasing-preview" surfaceKey="project" regionKey="release-review" onClick={() => setPreviewOpen(true)}>Preview</DocumentAction>
      {previewOpen && <PurchasingAuthorizationPreviewSheet projectId={projectId} proposalId={releasedProposalId} clientName={clientName} fallbackFocusRef={previewTrigger} onClose={() => setPreviewOpen(false)} onOpenWorkingBudget={() => { setPreviewOpen(false); onClose(); }} onSent={() => { if (active.current) onReleased(); }} />}
    </DocSheet>
  );

  return (
    <DocSheet
      open={open}
      onClose={onClose}
      wide
      icon={FileSignature}
      title="Purchasing authorization"
      pageLabel={`№ ${instrumentNumber}`}
    >
      <div className="mb-4">
        <h3 className="font-heading text-[17px] font-medium text-[var(--color-charcoal)]">
          Authorization № {instrumentNumber} — {lineCount}{' '}
          {lineCount === 1 ? 'line' : 'lines'}, {roomCount}{' '}
          {roomCount === 1 ? 'room' : 'rooms'}.
        </h3>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
          {projectName} · drafted {fmtDay(new Date().toISOString())}
        </p>
      </div>

      {rooms.map((room) => (
        <div key={room.key} className="mb-4">
          <div className="flex items-baseline justify-between gap-3 border-b border-[var(--color-pearl)] pb-1">
            <h4 className="font-heading text-[13.5px] font-medium italic text-[var(--color-charcoal)]">
              {room.name}
            </h4>
            <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
              {room.lines.length} {room.lines.length === 1 ? 'line' : 'lines'} ·{' '}
              {formatCurrencyTotal(
                sumByCurrency(room.lines, (line) => line.clientLineTotalCents),
              )}
            </span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                <th scope="col" className="py-1 text-left font-normal">
                  Item
                </th>
                <th scope="col" className="py-1 text-left font-normal">
                  Room
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  Signed quantity
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  Client price
                </th>
              </tr>
            </thead>
            <tbody>
              {room.lines.map((line) => (
                <tr
                  key={line.id}
                  className="border-b border-[var(--color-pearl)]"
                >
                  <td className="py-1.5 pr-3 text-[12px] text-[var(--color-charcoal)]">
                    {line.name}
                    <span
                      data-testid="release-line-lead-time"
                      className="block text-[11px] text-[var(--text-muted)]"
                    >
                      {line.leadTimeWeeks == null
                        ? LEAD_TIME_TBC
                        : `Lead time · ${leadTimeLabel(line.leadTimeWeeks)}`}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-[11px] text-[var(--text-muted)]">
                    {room.name}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono text-[11px] text-[var(--color-charcoal)]">
                    {line.quantity}
                  </td>
                  <td className="whitespace-nowrap py-1.5 text-right font-heading text-[12.5px] font-medium text-[var(--color-charcoal)]">
                    {formatMoney(line.clientLineTotalCents, rowCurrency(line))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* Five figures, one band — money is stated, never boxed. */}
      <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 border-l-[3px] border-[var(--color-sage)] py-2 pl-3 sm:grid-cols-3">
        <Figure label="Authorization total" value={formatCurrencyTotal(total)} />
        {percent !== null && !isMixed(total) && (
          <>
            <Figure
              label={`deposit at ${percent}%`}
              value={formatMoney(depositCents(total.cents, percent), total.currency)}
            />
            <Figure
              label="Balance due on delivery"
              value={formatMoney(
                total.cents - depositCents(total.cents, percent),
                total.currency,
              )}
            />
          </>
        )}
      </div>

      {/* Deposit is chips, not a field — four common answers and an "other". */}
      <fieldset className="mb-4">
        <legend className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
          Deposit
        </legend>
        <div className="flex flex-wrap items-center gap-1.5">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              aria-pressed={percent === chip && !otherOpen}
              onClick={() => {
                setOtherOpen(false);
                setChosenPercent(chip);
              }}
              className={`min-h-11 rounded-[3px] border px-3 font-mono text-[11px] ${
                percent === chip && !otherOpen
                  ? 'border-[var(--color-clay)] text-[var(--color-charcoal)]'
                  : 'border-[var(--color-pearl)] text-[var(--text-muted)]'
              }`}
            >
              {chip}%
            </button>
          ))}
          <button
            type="button"
            aria-pressed={otherOpen}
            onClick={() => setOtherOpen(true)}
            className={`min-h-11 rounded-[3px] border px-3 font-mono text-[11px] ${
              otherOpen
                ? 'border-[var(--color-clay)] text-[var(--color-charcoal)]'
                : 'border-[var(--color-pearl)] text-[var(--text-muted)]'
            }`}
          >
            Custom percentage
          </button>
          {otherOpen && (
            <input
              type="number"
              min={0}
              max={100}
              autoFocus
              aria-label="Deposit percentage"
              value={percent ?? ''}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                setChosenPercent(
                  Number.isFinite(parsed)
                    ? Math.min(100, Math.max(0, Math.round(parsed)))
                    : null,
                );
              }}
              className="min-h-11 w-20 rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2 font-mono text-[11px] text-[var(--color-charcoal)] outline-none"
            />
          )}
        </div>
        {agreementPercent !== null && (
          <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
            Your agreement&rsquo;s default is {agreementPercent}%. Changing it
            here changes this authorization only.
          </p>
        )}
      </fieldset>

      {/* The gate strip — stated on the same paper, at the moment of release. */}
      <div
        data-testid="checkpoint-gate"
        data-gate-state={blocked ? 'blocked' : drift.drifted ? 'drifted' : 'current'}
        className={`mb-4 border-l-[3px] py-2 pl-3 ${
          blocked
            ? 'border-[var(--color-terracotta)] bg-[rgba(212,160,144,0.08)]'
            : drift.drifted
              ? 'border-[var(--color-golden-hour)] bg-[rgba(232,197,71,0.06)]'
              : 'border-[var(--color-sage)]'
        }`}
      >
        {budget.isLoading ? <p role="status">Loading budget checkpoint…</p>
        : budget.error ? <p role="alert">The budget checkpoint could not be loaded. No publication was attempted.</p>
        : !versionId ? <>
          <p>No budget checkpoint has been published yet. Set up a working budget in Money, then sync from the schedule and review it before publishing. A checkpoint is spending-plan alignment, not purchase approval or payment.</p>
          <DocumentAction actionKey="set-up-working-budget" surfaceKey="project" regionKey="release-gate" onClick={openWorkingBudget}>Set up a working budget</DocumentAction>
        </>
        : blocked && !awaitingAcknowledgment ? (
          <>
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-terracotta-ink)]">
              Budget checkpoint
            </p>
            <p className="mt-0.5 text-[11.5px] text-[var(--color-charcoal)]">
              {hasCheckpoint
                ? `The client has not seen a checkpoint covering ${
                    uncoveredNames.length > 0
                      ? uncoveredNames.join(', ')
                      : 'every room in this release'
                  }. Publish a fresh one before sending.`
                : 'No budget checkpoint has been published yet. The client should see the plan before they are asked to sign for it.'}
            </p>
            <DocumentAction
              actionKey="publish-fresh-checkpoint"
              surfaceKey="project"
              regionKey="release-gate"
              variant="primary"
              loading={publishCheckpoint.isPending}
              loadingLabel="Publishing…"
              disabled={publishCheckpoint.isPending || !canPublish || !versionId || Boolean(budget.error)}
              onClick={publishFresh}
            >
              {hasCheckpoint ? 'Issue updated budget checkpoint' : 'Publish first budget checkpoint'}
            </DocumentAction>
          </>
        ) : blocked && awaitingAcknowledgment ? (
          <>
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-terracotta-ink)]">
              Budget checkpoint
            </p>
            <p className="mt-0.5 text-[11.5px] text-[var(--color-charcoal)]">
              {checkpoint?.checkpointCode
                ? `Waiting on ${clientLabel} to acknowledge checkpoint ${checkpoint.checkpointCode}.`
                : `Waiting on ${clientLabel} to acknowledge the current checkpoint.`}
            </p>
            <p className="mt-1 text-[11.5px] text-[var(--color-charcoal)]">Ask {clientLabel} to review the published budget in their project&rsquo;s ledger and explicitly acknowledge the spending plan. Publishing another checkpoint will not acknowledge this one.</p>
            {!overrideOpen ? (
              <DocumentAction
                actionKey="open-checkpoint-override"
                surfaceKey="project"
                regionKey="release-gate"
                variant="secondary"
                onClick={() => setOverrideOpen(true)}
              >
                Record audited override
              </DocumentAction>
            ) : (
              <div className="mt-2 max-w-md">
                <label className="block text-[11px] text-[var(--text-muted)]">
                  Override reason
                  <textarea
                    className="mt-1 w-full rounded-[3px] border border-[var(--color-pearl)] bg-white px-3 py-2 text-[11.5px] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
                    rows={2}
                    value={overrideReason}
                    onChange={(event) => setOverrideReason(event.target.value)}
                    placeholder="Client confirmed by recorded phone call…"
                  />
                </label>
                <div className="mt-2 flex gap-2">
                  <DocumentAction
                    actionKey="cancel-checkpoint-override"
                    surfaceKey="project"
                    regionKey="release-gate"
                    variant="secondary"
                    onClick={() => {
                      setOverrideOpen(false);
                      setOverrideReason('');
                    }}
                  >
                    Cancel
                  </DocumentAction>
                  <DocumentAction
                    actionKey="record-checkpoint-override"
                    surfaceKey="project"
                    regionKey="release-gate"
                    variant="primary"
                    loading={overrideCheckpoint.isPending}
                    disabled={
                      overrideCheckpoint.isPending ||
                      overrideReason.trim().length < 5
                    }
                    onClick={submitOverride}
                  >
                    Record override
                  </DocumentAction>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
              Budget checkpoint
              {budget.data?.checkpoint?.checkpointCode
                ? ` · ${budget.data.checkpoint.checkpointCode}`
                : ''}
            </p>
            <p className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">
              {budget.data?.checkpoint?.publishedAt
                ? `Published ${fmtDay(budget.data.checkpoint.publishedAt)}`
                : 'Published'}
              {' · covers every room in this release'}
            </p>
            {drift.drifted && (
              <p className="mt-0.5 text-[11px] text-[var(--color-charcoal)]">
                The schedule has moved {fmtUsd(Math.abs(drift.deltaCents))}{' '}
                since it was published. You may send anyway — the instrument
                records which checkpoint was current when it was signed.
              </p>
            )}
          </>
        )}
      </div>

      {publishMessage && <p role="status" className="mb-2 text-[11px]">{publishMessage}</p>}
      {error && (
        <p role="alert" className="mb-1 text-[11px] text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}

      <p className="mb-2 text-[11px] text-[var(--text-muted)]">
        Saving creates a draft and reserves these items. Nothing is sent to the client.
      </p>

      <DocumentActionGroup
        surfaceKey="project"
        regionKey="release-review"
        aria-label="Release acts"
      >
        <DocumentAction
          actionKey="save-authorization-draft"
          variant="secondary"
          disabled={busy || blocked || identityUnavailable || lineCount === 0 || Boolean(releasedProposalId)}
          loading={release.isPending}
          loadingLabel="Drafting…"
          onClick={() => save(false)}
        >
          Save authorization draft
        </DocumentAction>
        <DocumentAction
          actionKey="send-authorization-for-signature"
          variant={oneVoice ? 'terminal' : 'primary'}
          disabled={busy || blocked || identityUnavailable || lineCount === 0}
          loading={release.isPending}
          loadingLabel="Saving…"
          title={
            blocked
              ? awaitingAcknowledgment
                ? `Waiting on ${clientLabel} to acknowledge the checkpoint before sending.`
                : 'Publish a checkpoint covering these rooms before sending.'
              : undefined
          }
          onClick={() => save(true)}
        >
          Save draft &amp; preview
        </DocumentAction>
      </DocumentActionGroup>
    </DocSheet>
  );
}
