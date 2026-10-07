'use client';

/**
 * C-30 (d2 §M7, D1-10): the exceptions overlay. One row per problem — type,
 * status, and the clock printed as a date with its basis in words — on the
 * line unfold and in the Receiving book. "Choose a path" opens the sheet:
 * each path resolves the exception (resolve_procurement_exception) with the
 * PO change it needs (start_purchase_order_change); a substitution walks the
 * client's re-approval on the existing decision rail. The rules live in
 * ./exceptions.ts; this file prints them and makes the calls.
 *
 * Nothing here sends: a claim notice is composed as a draft awaiting review
 * (C-28), and the client's question is a decision draft the studio releases.
 * The maker lane (Patina catalog) reads one line and no money (V1).
 */

import { useId, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import {
  invalidateProcurementExceptions,
  useCanSeeStudioMargin,
  useComposeProcurementDraft,
  useDecision,
  useOpenProcurementException,
  OPEN_PROCUREMENT_DRAFT_STATUSES,
  useProcurementDrafts,
  useProjectFFEItems,
  useProjectRecordedStudio,
  usePublishDraftDecision,
  useRecordVendorRefund,
  useRequestSubstitutionApproval,
  useResolveProcurementException,
  useStartPurchaseOrderChange,
  useTriageProjectFfeItems,
  useUnresolvedProcurementExceptions,
  useVendor,
  type OpenProcurementExceptionRequest,
  type ProcurementExceptionWithSubjects,
} from '@patina/supabase';
import { OrderPaper } from '@/components/portal/procurement/order-paper';
import type { LineAuthorization } from '@/lib/document/authorization-derivation';
import { parseDollarsToCents } from '@/lib/currency-ui';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { DocSheet } from '../overlays/doc-sheet';
import { FIELD_CLS, LABEL_CLS } from '../line-unfold/cell';
import { DraftReview } from './draft-review';
import {
  EXCEPTION_STATUS_LABEL,
  MIN_CHANGE_REASON,
  OPENABLE_TYPES,
  alternateCandidates,
  alternateReading,
  changeOrderMessage,
  exceptionClockSentence,
  exceptionTypeLabel,
  exceptionsForLine,
  isClaimType,
  makerLaneLine,
  pathGate,
  pathsFor,
  resolutionPlan,
  substitutionChangePlan,
  substitutionClose,
  substitutionStage,
  type MoneyBack,
  type PathOption,
  type SubstituteLine,
} from './exceptions';

type AnyRow = any;

const NO_AUTH: LineAuthorization = { track: 'none' };
const AREA_CLS = `mt-1 block w-full resize-y rounded-[3px] border border-[var(--color-pearl)] px-2 py-1.5 ${FIELD_CLS}`;

/** A refusal said plainly; R8's change_order_required reads as a change order. */
function failure(e: unknown, fallback: string): string {
  const message = (e as Error)?.message || '';
  if (message.includes('change_order_required')) return changeOrderMessage(message);
  return message || fallback;
}

export const poLabelOf = (po: ProcurementExceptionWithSubjects['purchase_order']) =>
  po ? (po.po_number ?? po.vendor_po_number ?? po.sidemark ?? 'PO') : null;

// ─── One row ────────────────────────────────────────────────────────────────

/**
 * One exception: "Damage · open", the clock sentence, and the act. On the
 * maker lane it is one read-only line, no clock about money, no act.
 */
export function ExceptionRow({
  exception,
  makerLane,
  subject,
  onChoose,
}: {
  exception: ProcurementExceptionWithSubjects;
  makerLane: boolean;
  /** "PO 1042 · Hale" in the Receiving book; the unfold already names it. */
  subject?: string | null;
  onChoose: () => void;
}) {
  if (makerLane) {
    return (
      <p data-testid="exception-maker-lane" className="py-0.5 text-[12px] text-[var(--color-charcoal)]">
        {makerLaneLine(exception.type)}
      </p>
    );
  }
  const clock = exceptionClockSentence(exception);
  const choosable = pathsFor(exception).length > 0 || Boolean(exception.client_decision_id);
  return (
    <div data-testid="exception-row" className="py-0.5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-terracotta-ink)]">
          {exceptionTypeLabel(exception.type)} ·{' '}
          {EXCEPTION_STATUS_LABEL[exception.status as keyof typeof EXCEPTION_STATUS_LABEL] ?? exception.status}
        </span>
        {subject && <span className="text-[11px] text-[var(--text-muted)]">{subject}</span>}
        {choosable && (
          <DocumentAction
            actionKey="choose-exception-path"
            surfaceKey="project"
            regionKey="procurement-exception"
            variant={exception.status === 'open' ? 'primary' : 'secondary'}
            onClick={onChoose}
          >
            Choose a path
          </DocumentAction>
        )}
      </div>
      <p
        data-testid="exception-clock"
        data-passed={clock.passed ? 'true' : undefined}
        className={`text-[11px] ${clock.passed ? 'text-[var(--color-golden-hour-ink)]' : 'text-[var(--color-charcoal)]'}`}
      >
        {clock.sentence}
      </p>
      {exception.note && <p className="text-[11px] text-[var(--text-muted)]">{exception.note}</p>}
    </div>
  );
}

// ─── "Something's wrong" ────────────────────────────────────────────────────

export type ExceptionSubject = Omit<OpenProcurementExceptionRequest, 'type' | 'note' | 'clockDueOn' | 'clockBasis'>;

/** Opens an exception on a line, PO, inspection or claim. */
export function SomethingWrongSheet({
  open,
  onClose,
  subject,
  title,
  defaultType = 'damage',
}: {
  open: boolean;
  onClose: () => void;
  subject: ExceptionSubject;
  title: string;
  defaultType?: OpenProcurementExceptionRequest['type'];
}) {
  const qc = useQueryClient();
  const openException = useOpenProcurementException({ errorSurface: 'inline' });
  const [type, setType] = useState<OpenProcurementExceptionRequest['type']>(defaultType);
  const [note, setNote] = useState('');
  const [orderBy, setOrderBy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const kindName = useId();

  const submit = async () => {
    if (openException.isPending) return;
    setError(null);
    try {
      await openException.mutateAsync({
        ...subject,
        type,
        note: note.trim() || null,
        // A backorder's clock is the date to order a substitute by, if any.
        ...(type === 'backorder' && orderBy
          ? { clockDueOn: orderBy, clockBasis: 'Order a substitute by this date to keep the install.' }
          : {}),
      });
      invalidateProcurementExceptions(qc);
      void qc.invalidateQueries({ queryKey: ['document-state'] });
      onClose();
    } catch (e) {
      setError(failure(e, 'The exception could not be opened.'));
    }
  };

  return (
    <DocSheet open={open} onClose={onClose} title={title} icon={AlertTriangle} kind="procurement-exception">
      <div data-testid="something-wrong-sheet" className="space-y-4">
        <fieldset>
          <legend className={LABEL_CLS}>What happened</legend>
          <div className="mt-1.5 space-y-1">
            {OPENABLE_TYPES.map((t) => (
              <label key={t.type} className="flex items-baseline gap-2 text-[12px]">
                <input
                  type="radio"
                  name={kindName}
                  value={t.type}
                  checked={type === t.type}
                  disabled={openException.isPending}
                  onChange={() => setType(t.type)}
                />
                <span className="text-[var(--color-charcoal)]">{exceptionTypeLabel(t.type)}</span>
                <span className="text-[11px] text-[var(--text-muted)]">{t.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {type === 'backorder' && (
          <label className="block">
            <span className={LABEL_CLS}>Order a substitute by (optional)</span>
            <input
              type="date"
              value={orderBy}
              onChange={(e) => setOrderBy(e.target.value)}
              className={`mt-1 block ${FIELD_CLS} text-[12px]`}
            />
          </label>
        )}
        <label className="block">
          <span className={LABEL_CLS}>What you found</span>
          <textarea
            rows={2}
            value={note}
            maxLength={2000}
            disabled={openException.isPending}
            onChange={(e) => setNote(e.target.value)}
            className={AREA_CLS}
          />
        </label>
        {error && (
          <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
            {error}
          </p>
        )}
        <DocumentActionGroup surfaceKey="project" regionKey="procurement-exception-open">
          <DocumentAction actionKey="put-back-exception" variant="tertiary" onClick={onClose}>
            Put back
          </DocumentAction>
          <DocumentAction
            actionKey="open-procurement-exception"
            variant="primary"
            disabled={openException.isPending}
            loading={openException.isPending}
            loadingLabel="Opening…"
            onClick={() => void submit()}
          >
            Open the exception
          </DocumentAction>
        </DocumentActionGroup>
      </div>
    </DocSheet>
  );
}

// ─── Money back ─────────────────────────────────────────────────────────────

function MoneyBackFields({
  vendorName,
  value,
  onChange,
  disabled,
}: {
  vendorName: string;
  value: { kind: MoneyBack['kind']; amount: string };
  onChange: (next: { kind: MoneyBack['kind']; amount: string }) => void;
  disabled: boolean;
}) {
  const name = useId();
  return (
    <fieldset data-testid="exception-money-back">
      <legend className={LABEL_CLS}>Money back from {vendorName} (optional)</legend>
      <div className="mt-1 flex flex-wrap items-baseline gap-3 text-[12px]">
        {(['refund', 'credit'] as const).map((k) => (
          <label key={k} className="flex items-baseline gap-1.5">
            <input
              type="radio"
              name={name}
              checked={value.kind === k}
              disabled={disabled}
              onChange={() => onChange({ ...value, kind: k })}
            />
            {k === 'refund' ? 'Refund' : 'Credit'}
          </label>
        ))}
        <label className="flex items-baseline gap-1.5">
          <span className={LABEL_CLS}>Amount $</span>
          <input
            inputMode="decimal"
            value={value.amount}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, amount: e.target.value })}
            aria-label="Amount back"
            className={`w-24 border-b border-[var(--color-pearl)] ${FIELD_CLS} text-[12px]`}
          />
        </label>
      </div>
    </fieldset>
  );
}

const moneyBackOf = (value: { kind: MoneyBack['kind']; amount: string }): MoneyBack | null => {
  const cents = value.amount.trim() ? parseDollarsToCents(value.amount) : null;
  return cents && cents > 0 ? { kind: value.kind, amountCents: cents } : null;
};

// ─── The path sheet ─────────────────────────────────────────────────────────

/** "Choose a path": the resolution paths per type, or the substitution. */
export function ExceptionPathSheet({
  open,
  onClose,
  exception,
  auth = NO_AUTH,
}: {
  open: boolean;
  onClose: () => void;
  exception: ProcurementExceptionWithSubjects;
  auth?: LineAuthorization;
}) {
  const qc = useQueryClient();
  const startChange = useStartPurchaseOrderChange({ errorSurface: 'inline' });
  const resolve = useResolveProcurementException({ errorSurface: 'inline' });
  const recordRefund = useRecordVendorRefund({ errorSurface: 'inline' });
  const compose = useComposeProcurementDraft({ errorSurface: 'inline' });
  const { data: drafts } = useProcurementDrafts(exception.project_id, OPEN_PROCUREMENT_DRAFT_STATUSES);
  const [declined, setDeclined] = useState(false);
  const paths = pathsFor(exception).filter((p) => !(declined && p.path === 'substitute'));
  const [chosen, setChosen] = useState<PathOption | null>(null);
  const [reason, setReason] = useState('');
  const [money, setMoney] = useState<{ kind: MoneyBack['kind']; amount: string }>({ kind: 'refund', amount: '' });
  // A retry after a partial failure never repeats a step that landed.
  const [changeId, setChangeId] = useState<string | null>(null);
  const [refunded, setRefunded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pathName = useId();
  const heldId = useId();

  const vendorName = exception.purchase_order?.vendor?.name ?? 'the maker';
  const label = exceptionTypeLabel(exception.type);
  const subject = exception.ffe_item?.name ?? poLabelOf(exception.purchase_order) ?? 'this order';
  const clock = exceptionClockSentence(exception);
  const claimDrafts = (drafts ?? []).filter((d) => d.exception_id === exception.id);
  const canDraftClaim =
    isClaimType(exception.type) && !!exception.purchase_order_id && claimDrafts.length === 0;
  const substituting = !declined && (!!exception.client_decision_id || chosen?.path === 'substitute');

  const gate = chosen ? pathGate(exception.type, chosen, auth) : { held: false as const };
  const needsReason = Boolean(chosen?.change && exception.purchase_order_id);
  const missing = !chosen || (needsReason && reason.trim().length < MIN_CHANGE_REASON);
  const pending = startChange.isPending || resolve.isPending || recordRefund.isPending;

  const record = async () => {
    if (!chosen || pending || missing || gate.held) return;
    setError(null);
    const plan = resolutionPlan({ exception, option: chosen, reason });
    try {
      let poChangeId = changeId;
      if (plan.change && !poChangeId) {
        poChangeId = (await startChange.mutateAsync(plan.change)).changeId;
        setChangeId(poChangeId);
      }
      const back = chosen.moneyBack ? moneyBackOf(money) : null;
      if (back && exception.purchase_order_id && !refunded) {
        await recordRefund.mutateAsync({ purchaseOrderId: exception.purchase_order_id, request: back });
        setRefunded(true);
      }
      await resolve.mutateAsync({
        exceptionId: exception.id,
        request: { ...plan.resolve, poChangeId },
      });
      invalidateProcurementExceptions(qc);
      void qc.invalidateQueries({ queryKey: ['document-state'] });
      onClose();
    } catch (e) {
      setError(failure(e, 'The path could not be recorded.'));
    }
  };

  const draftClaim = () => {
    setError(null);
    compose
      .mutateAsync({ kind: 'vendor_claim_notice', exceptionId: exception.id })
      .catch((e: Error) => setError(failure(e, 'The claim notice could not be drafted.')));
  };

  return (
    <DocSheet open={open} onClose={onClose} title={`${label} · ${subject}`} icon={AlertTriangle} kind="procurement-exception">
      <div data-testid="exception-path-sheet" className="space-y-4">
        <div>
          <p className={LABEL_CLS}>
            {label} · {EXCEPTION_STATUS_LABEL[exception.status as keyof typeof EXCEPTION_STATUS_LABEL] ?? exception.status}
          </p>
          <p className="text-[12px] text-[var(--color-charcoal)]">{clock.sentence}</p>
          {exception.note && <p className="text-[11px] text-[var(--text-muted)]">{exception.note}</p>}
        </div>

        {/* C-28: the claim notice is a draft awaiting review; nothing sends here. */}
        {canDraftClaim && (
          <DocumentAction
            actionKey="draft-vendor-claim-notice"
            surfaceKey="project"
            regionKey="procurement-exception"
            variant="secondary"
            disabled={compose.isPending}
            loading={compose.isPending}
            loadingLabel="Drafting…"
            onClick={draftClaim}
          >
            Draft the claim notice to {vendorName}
          </DocumentAction>
        )}
        {claimDrafts.map((d) => (
          <DraftReview key={d.id} draft={d} regionKey="procurement-exception" />
        ))}

        {substituting ? (
          <SubstitutionFlow exception={exception} onDecline={() => { setDeclined(true); setChosen(null); }} />
        ) : (
          <>
            <fieldset>
              <legend className={LABEL_CLS}>The path</legend>
              <div className="mt-1.5 space-y-1">
                {paths.map((p) => (
                  <label key={p.path} className="flex items-baseline gap-2 text-[12px]">
                    <input
                      type="radio"
                      name={pathName}
                      value={p.path}
                      checked={chosen?.path === p.path}
                      disabled={pending}
                      onChange={() => {
                        setChosen(p);
                        setError(null);
                      }}
                    />
                    <span className="text-[var(--color-charcoal)]">{p.label}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">{p.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {chosen && (
              <label className="block">
                <span className={LABEL_CLS}>{needsReason ? 'Reason (kept on the PO’s record)' : 'Note (optional)'}</span>
                <textarea
                  rows={2}
                  value={reason}
                  disabled={pending}
                  onChange={(e) => setReason(e.target.value)}
                  className={AREA_CLS}
                />
              </label>
            )}
            {chosen?.moneyBack && exception.purchase_order_id && (
              <MoneyBackFields vendorName={vendorName} value={money} onChange={setMoney} disabled={pending} />
            )}
            {gate.held && (
              <p id={heldId} data-testid="exception-path-held" className="text-[12px] text-[var(--color-terracotta-ink)]">
                {gate.reason}
              </p>
            )}
            {error && (
              <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
                {error}
              </p>
            )}
            <DocumentActionGroup surfaceKey="project" regionKey="procurement-exception-path">
              <DocumentAction actionKey="put-back-exception-path" variant="tertiary" onClick={onClose}>
                Put back
              </DocumentAction>
              <DocumentAction
                actionKey="record-exception-path"
                variant="primary"
                disabled={pending || missing || gate.held}
                held={gate.held}
                aria-describedby={gate.held ? heldId : undefined}
                loading={pending}
                loadingLabel="Recording…"
                onClick={() => void record()}
              >
                Record the path
              </DocumentAction>
            </DocumentActionGroup>
          </>
        )}
        {substituting && error && (
          <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
            {error}
          </p>
        )}
      </div>
    </DocSheet>
  );
}

// ─── Substitution ───────────────────────────────────────────────────────────

/**
 * d2 §M7 steps 1–4: pick alternates → the client's decision (a draft the
 * studio releases) → on the client's choice, the PO change, the swap and any
 * money back → the replacement PO on the order paper → closed against it.
 */
export function SubstitutionFlow({
  exception,
  onDecline,
}: {
  exception: ProcurementExceptionWithSubjects;
  onDecline: () => void;
}) {
  const qc = useQueryClient();
  const projectId = exception.project_id;
  const { data: lineRows } = useProjectFFEItems(projectId);
  const { data: decision } = useDecision(exception.client_decision_id ?? '');
  const { data: studioId } = useProjectRecordedStudio(projectId);
  const { data: canSeeMargin } = useCanSeeStudioMargin(studioId ?? null);
  const ask = useRequestSubstitutionApproval({ errorSurface: 'inline' });
  const release = usePublishDraftDecision();
  const startChange = useStartPurchaseOrderChange({ errorSurface: 'inline' });
  const triage = useTriageProjectFfeItems();
  const recordRefund = useRecordVendorRefund({ errorSurface: 'inline' });
  const resolve = useResolveProcurementException({ errorSurface: 'inline' });
  const [picked, setPicked] = useState<string[]>([]);
  const [money, setMoney] = useState<{ kind: MoneyBack['kind']; amount: string }>({ kind: 'refund', amount: '' });
  const [done, setDone] = useState<{ change?: string | null; triage?: boolean; refund?: boolean }>({});
  const [paperOpen, setPaperOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = (lineRows ?? []) as SubstituteLine[];
  const original = lines.find((l) => l.id === exception.ffe_item_id) ?? null;
  const stage = substitutionStage({ exception, decision: decision ?? null, lines });
  const vendorName = exception.purchase_order?.vendor?.name ?? 'the maker';
  const alternateVendorId =
    stage.stage === 'order' ? (stage.alternate.vendor_id ?? '') : '';
  const { data: alternateVendor } = useVendor(alternateVendorId) as { data: AnyRow };
  const refresh = () => {
    invalidateProcurementExceptions(qc);
    void qc.invalidateQueries({ queryKey: ['document-state'] });
  };
  const pending =
    ask.isPending || release.isPending || startChange.isPending || triage.isPending ||
    recordRefund.isPending || resolve.isPending;

  const run = async (step: () => Promise<unknown>, fallback: string) => {
    if (pending) return;
    setError(null);
    try {
      await step();
      refresh();
    } catch (e) {
      setError(failure(e, fallback));
    }
  };

  const makeTheChange = async (alternate: SubstituteLine) => {
    if (!original) return;
    const plan = substitutionChangePlan({ exception, original, alternate, moneyBack: moneyBackOf(money) });
    let changeId = done.change ?? null;
    if (plan.change && done.change === undefined) {
      changeId = (await startChange.mutateAsync(plan.change)).changeId;
      setDone((d) => ({ ...d, change: changeId }));
    }
    if (!done.triage) {
      for (const request of plan.triage) await triage.mutateAsync(request);
      setDone((d) => ({ ...d, triage: true }));
    }
    if (plan.refund && !done.refund) {
      await recordRefund.mutateAsync(plan.refund);
      setDone((d) => ({ ...d, refund: true }));
    }
    await resolve.mutateAsync({ exceptionId: exception.id, request: { ...plan.resolve, poChangeId: changeId } });
  };

  const sentence = (text: string) => <p className="text-[12px] text-[var(--color-charcoal)]">{text}</p>;
  const act = (key: string, label: string, onClick: () => void, variant: 'primary' | 'secondary' = 'primary') => (
    <DocumentAction
      actionKey={key}
      surfaceKey="project"
      regionKey="procurement-substitution"
      variant={variant}
      disabled={pending}
      loading={pending}
      loadingLabel="Working…"
      onClick={onClick}
    >
      {label}
    </DocumentAction>
  );

  let body: ReactNode;
  switch (stage.stage) {
    case 'pick': {
      const candidates = alternateCandidates(lines, exception.ffe_item_id ?? '');
      body = candidates.length === 0 ? (
        sentence('No alternates on this project yet. Add one from the schedule as an Alternate, then come back.')
      ) : (
        <>
          <fieldset>
            <legend className={LABEL_CLS}>Offer the client</legend>
            <ul className="mt-1.5 space-y-1.5">
              {candidates.map((alt) => {
                const reading = alternateReading(alt, Boolean(canSeeMargin));
                return (
                  <li key={alt.id} data-testid="substitution-alternate">
                    <label className="flex items-baseline gap-2 text-[12px]">
                      <input
                        type="checkbox"
                        checked={picked.includes(alt.id)}
                        disabled={pending}
                        onChange={(e) =>
                          setPicked((cur) => (e.target.checked ? [...cur, alt.id] : cur.filter((id) => id !== alt.id)))
                        }
                      />
                      <span className="text-[var(--color-charcoal)]">{alt.name}</span>
                      {reading.price && <span className="text-[11px] text-[var(--text-muted)]">{reading.price}</span>}
                      {reading.markup && <span className={LABEL_CLS}>{reading.markup}</span>}
                    </label>
                    {reading.warning && (
                      <p role="note" className="ml-5 text-[11px] text-[var(--color-clay-ink)]">
                        {reading.warning}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </fieldset>
          {/* R7 is open: the question names no dates. */}
          {sentence('The client is asked to choose a replacement. The question names no dates.')}
          {picked.length > 0 &&
            act('ask-client-substitution', 'Ask the client', () =>
              void run(
                () => ask.mutateAsync({ ffeItemId: exception.ffe_item_id as string, alternateIds: picked }),
                'The question could not be drafted.',
              ),
            )}
        </>
      );
      break;
    }
    case 'loading':
      body = sentence('Reading the client’s decision…');
      break;
    case 'release':
      body = (
        <>
          {sentence('The question is drafted. Release it to the client when you are ready.')}
          {act('release-substitution-decision', 'Release to the client', () =>
            void run(() => release.mutateAsync({ decisionId: stage.decisionId }), 'The question could not be released.'),
          )}
        </>
      );
      break;
    case 'with_client':
      body = sentence('With the client — waiting on their choice.');
      break;
    case 'expired':
    case 'kept':
      body = (
        <>
          {sentence(
            stage.stage === 'kept'
              ? `The client kept ${original?.name ?? 'the original'}.`
              : 'The client did not answer in time.',
          )}
          {act('choose-another-exception-path', 'Choose another path', onDecline, 'secondary')}
        </>
      );
      break;
    case 'unmatched':
      body = sentence(
        `The client chose ${stage.optionName}, but no line on the project matches it. Add it as an alternate, then come back.`,
      );
      break;
    case 'chosen':
      body = (
        <>
          {sentence(`The client chose ${stage.alternate.name}.`)}
          {sentence(
            exception.purchase_order_id
              ? `${original?.name ?? 'The original'} comes off its order: unsent and unpaid, the PO is rebuilt; otherwise the cancellation is kept on its record — tell ${vendorName} in writing.`
              : `${stage.alternate.name} becomes the selection.`,
          )}
          {exception.purchase_order_id && !exception.purchase_order?.is_patina_catalog && (
            <MoneyBackFields vendorName={vendorName} value={money} onChange={setMoney} disabled={pending} />
          )}
          {act('make-substitution-change', 'Make the change', () =>
            void run(() => makeTheChange(stage.alternate), 'The change could not be made.'),
          )}
        </>
      );
      break;
    case 'order':
      body = (
        <>
          {sentence(`Order ${stage.alternate.name} on a new purchase order.`)}
          {stage.alternate.vendor_id
            ? act('order-substitution', `Order ${stage.alternate.name}`, () => setPaperOpen(true))
            : sentence(`Name the maker for ${stage.alternate.name} on its line, then order it.`)}
          {alternateVendor && (
            <OrderPaper
              open={paperOpen}
              onClose={() => setPaperOpen(false)}
              vendor={alternateVendor}
              project={{ id: projectId, name: '' }}
              ffeItems={[(lineRows ?? []).find((l: AnyRow) => l.id === stage.alternate.id)]}
              onCreated={refresh}
            />
          )}
        </>
      );
      break;
    case 'close':
      body = (
        <>
          {sentence(`${stage.alternate.name} is ordered.`)}
          {act('close-substitution', 'Close the exception', () =>
            void run(
              () => resolve.mutateAsync({ exceptionId: exception.id, request: substitutionClose(stage.replacementPoId) }),
              'The exception could not be closed.',
            ),
          )}
        </>
      );
      break;
  }

  return (
    <section data-testid="substitution-flow" data-stage={stage.stage} className="space-y-2">
      <p className={LABEL_CLS}>Substitute</p>
      {body}
      {error && (
        <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}
    </section>
  );
}

// ─── The unfold band ────────────────────────────────────────────────────────

/**
 * The line unfold's exceptions: each open one with its clock and act, any
 * open claim not yet tracked as an exception, and "Something's wrong".
 */
export function LineExceptions({
  item,
  projectId,
  auth = NO_AUTH,
}: {
  item: AnyRow;
  projectId: string;
  auth?: LineAuthorization;
}) {
  const { data } = useUnresolvedProcurementExceptions(projectId);
  const [choosing, setChoosing] = useState<ProcurementExceptionWithSubjects | null>(null);
  const [reporting, setReporting] = useState(false);

  const exceptions = exceptionsForLine(data ?? [], item.id, item.purchase_order?.id);
  const tracked = new Set(exceptions.map((e) => e.damage_claim_id).filter(Boolean));
  // A damaged inspection drafts a claim; tracking it opens its exception.
  const untracked = (item.item_claims ?? []).filter(
    (c: { id: string; state: string }) =>
      (c.state === 'drafted' || c.state === 'vendor_notified') && !tracked.has(c.id),
  );
  // The maker lane is the PO's: any exception on it carries the flag.
  const makerLane = exceptions.some((e) => e.purchase_order?.is_patina_catalog);
  // SQ-448: a claim on a catalog line is Patina's to carry, so "Track it" never
  // shows there — the line's PO carries the lane before any exception does.
  const trackable = !makerLane && !item.purchase_order?.is_patina_catalog ? untracked : [];

  return (
    <div data-testid="line-exceptions" className="mb-2.5">
      {(exceptions.length > 0 || trackable.length > 0) && (
        <div className="mb-1 border-l-[2px] border-[var(--color-terracotta)] pl-2.5">
          {exceptions.map((e) => (
            <ExceptionRow
              key={e.id}
              exception={e}
              makerLane={Boolean(e.purchase_order?.is_patina_catalog)}
              onChoose={() => setChoosing(e)}
            />
          ))}
          {trackable.map((c: { id: string }) => (
            <TrackClaimAct key={c.id} claimId={c.id} ffeItemId={item.id} />
          ))}
        </div>
      )}
      {!makerLane && (
        <DocumentAction
          actionKey="open-something-wrong"
          surfaceKey="project"
          regionKey="procurement-exception"
          variant="tertiary"
          onClick={() => setReporting(true)}
        >
          Something’s wrong…
        </DocumentAction>
      )}
      {reporting && (
        <SomethingWrongSheet
          open
          onClose={() => setReporting(false)}
          subject={{ ffeItemId: item.id }}
          title={`Something’s wrong · ${item.name ?? 'this line'}`}
          defaultType={item.status === 'delivered' || item.status === 'received' ? 'damage' : 'backorder'}
        />
      )}
      {/* The live row, not the click-time snapshot: asking the client stamps
          client_decision_id, and the substitution flow reads its stage from it. */}
      {choosing && (
        <ExceptionPathSheet
          open
          onClose={() => setChoosing(null)}
          exception={exceptions.find((e) => e.id === choosing.id) ?? choosing}
          auth={auth}
        />
      )}
    </div>
  );
}

/**
 * An inspection outcome of `damaged` drafts a damage claim (the inspection
 * drawer); this opens the claim's exception, which carries the clock.
 */
export function TrackClaimAct({ claimId, ffeItemId }: { claimId: string; ffeItemId?: string | null }) {
  const qc = useQueryClient();
  const openException = useOpenProcurementException({ errorSurface: 'inline' });
  const [error, setError] = useState<string | null>(null);
  const track = () => {
    setError(null);
    openException
      .mutateAsync({ type: 'damage', damageClaimId: claimId, ...(ffeItemId ? { ffeItemId } : {}) })
      .then(() => {
        invalidateProcurementExceptions(qc);
        void qc.invalidateQueries({ queryKey: ['damage-claims'] });
      })
      .catch((e: Error) => setError(failure(e, 'The claim could not be tracked.')));
  };
  return (
    <div className="flex flex-wrap items-baseline gap-2 py-0.5">
      <span className="text-[11px] text-[var(--color-charcoal)]">A damage claim with no clock yet.</span>
      <DocumentAction
        actionKey="track-claim-as-exception"
        surfaceKey="project"
        regionKey="procurement-exception"
        variant="secondary"
        disabled={openException.isPending}
        loading={openException.isPending}
        loadingLabel="Tracking…"
        onClick={track}
      >
        Track it
      </DocumentAction>
      {error && (
        <p role="alert" className="w-full text-[11px] text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── The Receiving book ─────────────────────────────────────────────────────

/**
 * The Receiving book's exceptions group: every unresolved exception in the
 * lens (one project, or every project the member buys for), each with its
 * clock and "Choose a path". Renders nothing when there are none.
 */
export function ReceivingExceptions({ projectId }: { projectId: string | null }) {
  const { data } = useUnresolvedProcurementExceptions(projectId);
  const [choosing, setChoosing] = useState<ProcurementExceptionWithSubjects | null>(null);
  const rows = data ?? [];
  if (rows.length === 0) return null;
  return (
    <>
      <p className="doc-type-meta mb-1 font-semibold uppercase tracking-[0.08em] text-[var(--color-quiet-ink)]">
        Exceptions · {rows.length}
      </p>
      <ul data-testid="receiving-exceptions" className="mb-5">
        {rows.map((e) => (
          <li key={e.id} className="border-b border-dashed border-[var(--color-pearl)] px-1 py-2">
            <ExceptionRow
              exception={e}
              makerLane={Boolean(e.purchase_order?.is_patina_catalog)}
              subject={[e.ffe_item?.name, poLabelOf(e.purchase_order), e.purchase_order?.vendor?.name]
                .filter(Boolean)
                .join(' · ')}
              onChoose={() => setChoosing(e)}
            />
          </li>
        ))}
      </ul>
      {choosing && (
        <ExceptionPathSheet
          open
          onClose={() => setChoosing(null)}
          exception={rows.find((e) => e.id === choosing.id) ?? choosing}
        />
      )}
    </>
  );
}
