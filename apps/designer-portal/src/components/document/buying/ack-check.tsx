'use client';

/**
 * C-27 (D1-06, d2 §M3): the acknowledgment check. The vendor's ack is read
 * against the PO line by line: WE ORDERED beside THEY CONFIRMED (and QUOTED
 * when a quote priced the line), every PO value pre-filled so the buyer types
 * only what differs. Each row reads "agrees" or "differs", the money ones with
 * the signed delta. It logs through log_po_acknowledgment_v2, which recomputes
 * every verdict, opens the PO's ack_discrepancy exception and drafts the reply
 * (awaiting review — a human sends it, C-28).
 *
 * The record resolves each difference: accept their value (an R8 refusal
 * routes to the C-21 change order), dispute it (the drafted reply is reviewed
 * in place), or log the vendor's corrected acknowledgment. Production is never
 * held (R9): nothing here gates the PO's status.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  isChangeOrderRequired,
  poAckBasisKey,
  useLogPoAcknowledgment,
  usePoAckBasis,
  usePoAcknowledgments,
  usePoCostLines,
  useResolveAckLine,
  useVendorQuotes,
  type PoAckLineRow,
} from '@patina/supabase';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { procurementEvents } from '@/lib/analytics/procurement-events';
import { fmtDay } from '@/lib/document/format';
import { DateTextInput } from '../date-text-input';
import { DocumentAction } from '../document-action';
import { LABEL_CLS } from '../line-unfold/cell';
import { Stamp } from '../stamp';
import { PurchaseOrderDrafts } from './draft-review';
import {
  ackPayload,
  ackRows,
  ackStampCopy,
  ackStateOf,
  changeOrderReason,
  fmtSignedCents,
  isInvalid,
  isOpenLine,
  moneyDelta,
  prefill,
  rowAgreement,
  rowDelta,
  rowLabel,
  storedDisplay,
  VERDICT_WORD,
  type AckBasis,
  type AckRow,
} from './ack-check-model';

const INPUT_CLS =
  'w-full min-w-0 rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-1.5 py-1 font-mono text-[11px] text-[var(--color-charcoal)] outline-none focus-visible:border-[var(--color-clay)] disabled:opacity-60';
const CELL_CLS = 'py-1 pr-2 align-top';
const DIFFERS_CLS = 'text-[var(--color-terracotta-ink)]';

/**
 * WE ORDERED: the PO's lines as po-send prints them, its requested ship date,
 * and its freight estimate (the sum of its freight cost lines, as v2 sums it).
 */
export function useAckBasis(purchaseOrderId: string | null | undefined) {
  const costLines = usePoCostLines(purchaseOrderId);
  const query = usePoAckBasis(purchaseOrderId);
  const freight = (costLines.data ?? []).filter(
    (l) => l.kind === 'freight' && l.estimate_cents != null,
  );
  const basis: AckBasis | undefined = query.data && {
    ...query.data,
    freightCents: freight.length
      ? freight.reduce((sum, l) => sum + (l.estimate_cents ?? 0), 0)
      : null,
  };
  return { basis, isLoading: query.isLoading, isError: query.isError };
}

/** The latest acknowledgment's state, open differences and the PO stamp's copy. */
export function usePoAckSummary(purchaseOrderId: string | null | undefined) {
  const { data } = usePoAcknowledgments(purchaseOrderId);
  const latest = data?.[0] ?? null;
  const lines = latest?.po_ack_lines ?? [];
  const state = latest ? ackStateOf(lines) : 'none';
  const open = lines.filter(isOpenLine).length;
  return { latest, state, open, copy: ackStampCopy(state, open) };
}

/** The PO stamp while a difference is open: "Acknowledged · 1 difference", terracotta. */
export function AckDifferenceStamp({ purchaseOrderId }: { purchaseOrderId: string }) {
  const { copy } = usePoAckSummary(purchaseOrderId);
  return (
    <Stamp
      label={copy?.label ?? 'Acknowledged · differences'}
      color="var(--color-terracotta)"
      ink="var(--color-terracotta-ink)"
      size="sm"
    />
  );
}

function AgreementWord({
  differs,
  delta,
  oneVoice,
}: {
  differs: boolean;
  delta: number | null;
  oneVoice: boolean;
}) {
  return differs ? (
    <span className={`font-medium ${DIFFERS_CLS}`}>
      differs{delta != null ? ` · ${fmtSignedCents(delta)}` : ''}
    </span>
  ) : (
    // US-19 F6-9 (D17) — nobody has agreed yet; the row reads as ordered.
    <span className="text-[var(--text-muted)]">{oneVoice ? 'as ordered' : 'agrees'}</span>
  );
}

/**
 * The check itself — what the vendor confirmed, typed over the PO's own
 * values. Logs through v2; the server's verdicts are the record.
 */
export function AckCheckForm({
  purchaseOrderId,
  vendorPoNumber,
  confirmedEta,
  sentAt,
  onLogged,
  door = true,
}: {
  purchaseOrderId: string;
  vendorPoNumber?: string | null;
  confirmedEta?: string | null;
  sentAt?: string | null;
  onLogged?: () => void;
  /**
   * US-19 F7-8 (one door per surface): false where the host already is the
   * door (the Orders ledger's `log ack ↓`) — the form opens straight in.
   */
  door?: boolean;
}) {
  const qc = useQueryClient();
  const logAck = useLogPoAcknowledgment({ errorSurface: 'inline' });
  const { basis, isLoading, isError } = useAckBasis(purchaseOrderId);
  const { data: quotes } = useVendorQuotes(basis?.projectId);
  const rows = basis ? ackRows(basis, quotes ?? []) : [];
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const current = values ?? prefill(rows);
  const [poNo, setPoNo] = useState(vendorPoNumber ?? '');
  const [eta, setEta] = useState(confirmedEta ? confirmedEta.slice(0, 10) : '');
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const oneVoice = useFeatureFlag('one-voice').value === true;
  // US-19 F6-9 (D17, `one-voice`) — on a PO nobody has acknowledged, the form
  // stays behind a door until she opens it; a corrected ack opens straight in.
  const { latest } = usePoAckSummary(oneVoice ? purchaseOrderId : null);
  const behindDoor = oneVoice && !latest && door;
  const [doorOpen, setDoorOpen] = useState(false);
  const doorRef = useRef<HTMLDivElement | null>(null);
  const poNoRef = useRef<HTMLInputElement | null>(null);
  const landOn = useRef<'form' | 'door' | null>(null);
  useEffect(() => {
    const land = landOn.current;
    landOn.current = null;
    if (land === 'form') poNoRef.current?.focus();
    if (land === 'door') doorRef.current?.querySelector<HTMLElement>('button')?.focus();
  }, [doorOpen]);
  // F7-8: the host's own door was pressed to mount this form; land on its first field.
  useEffect(() => {
    if (oneVoice && !door) poNoRef.current?.focus();
  }, [oneVoice, door]);

  // Esc on the opened form is Cancel: it closes, focus goes back to the door.
  // The key is taken so the paper's put-down does not fire; mid-log it closes
  // nothing.
  const onFormKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!behindDoor || event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    if (logAck.isPending) return;
    landOn.current = 'door';
    setDoorOpen(false);
  };

  const showQuoted = rows.some((r) => r.quoted != null);
  const differences = rows.filter((r) => rowAgreement(r, current[r.key] ?? '') === 'differs').length;
  const invalid = rows.some((r) => isInvalid(r, current[r.key] ?? ''));
  const invalidId = `ack-invalid-${purchaseOrderId}`;

  const setValue = (key: string, value: string) => setValues({ ...current, [key]: value });

  const confirm = async () => {
    if (logAck.isPending || invalid) return;
    setError(null);
    try {
      const { ack, lines } = ackPayload(rows, current, { vendorOrderRef: poNo, confirmedEta: eta });
      await logAck.mutateAsync({
        purchaseOrderId,
        projectId: basis?.projectId ?? '',
        ack,
        lines,
      });
      procurementEvents.poAcknowledgmentLogged({
        days_since_sent: sentAt
          ? Math.max(0, Math.floor((Date.now() - new Date(sentAt).getTime()) / 86_400_000))
          : null,
      });
      // One act, many surfaces (§5): unfold PO cell, ledger row, Desk need.
      void qc.invalidateQueries({ queryKey: ['project-ffe-items'] });
      void qc.invalidateQueries({ queryKey: ['document-state'] });
      setDone(differences);
      onLogged?.();
    } catch (e) {
      setError((e as Error).message || 'The acknowledgment could not be logged.');
    }
  };

  if (done != null) {
    // R51: the quiet confirmation at the act site.
    return (
      <p role="status" className="text-[11px] text-[var(--color-charcoal)]">
        {done === 0
          ? 'Acknowledged — everything agreed.'
          : `Acknowledged — ${done} difference${done === 1 ? '' : 's'}. A reply to the maker is drafted for your review; nothing is sent until you send it.`}
      </p>
    );
  }

  if (behindDoor && !doorOpen) {
    return (
      <div
        ref={doorRef}
        data-testid="ack-check-door"
        className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1"
      >
        <p className="text-[11px] text-[var(--text-muted)]">
          {[sentAt ? `sent to the maker ${fmtDay(sentAt)}` : null, 'awaiting acknowledgment']
            .filter(Boolean)
            .join(' · ')}
        </p>
        <DocumentAction
          actionKey="open-po-acknowledgment"
          surfaceKey="orders"
          regionKey="po-acknowledgment"
          variant="secondary"
          onClick={() => {
            landOn.current = 'form';
            setDoorOpen(true);
          }}
        >
          Log what they confirmed
        </DocumentAction>
      </div>
    );
  }

  return (
    <div data-testid="ack-check" className="min-w-0" onKeyDown={onFormKeyDown}>
      <p className="mb-1.5 text-[11px] text-[var(--text-muted)]">
        What they confirmed. Every value starts as the PO&rsquo;s — change only what differs.
      </p>
      <div className="mb-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5">
          <span className={LABEL_CLS}>Their order №</span>
          <input
            ref={poNoRef}
            type="text"
            value={poNo}
            onChange={(e) => setPoNo(e.target.value)}
            placeholder="NA-2026-…"
            className={`w-[130px] ${INPUT_CLS}`}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className={LABEL_CLS}>Confirmed ETA</span>
          <DateTextInput
            value={eta || null}
            onChange={(value) => setEta(value ?? '')}
            ariaLabel="Confirmed ETA"
            className={INPUT_CLS}
          />
        </label>
      </div>

      {isLoading && <p className="text-[11px] italic text-[var(--text-muted)]">Reading the order…</p>}
      {isError && (
        <p className="text-[11px] text-[var(--text-muted)]">
          The order&rsquo;s lines could not be read; the acknowledgment logs without them.
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] border-collapse text-left text-[11px] text-[var(--color-charcoal)]">
            <thead>
              <tr className={LABEL_CLS}>
                <th scope="col" className={`${CELL_CLS} font-normal`}>What</th>
                {showQuoted && <th scope="col" className={`${CELL_CLS} font-normal`}>Quoted</th>}
                <th scope="col" className={`${CELL_CLS} font-normal`}>We ordered</th>
                <th scope="col" className={`${CELL_CLS} font-normal`}>They confirmed</th>
                <th scope="col" className={`${CELL_CLS} font-normal`}>
                  <span className="sr-only">Check</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <FormRow
                  key={row.key}
                  row={row}
                  value={current[row.key] ?? ''}
                  showQuoted={showQuoted}
                  disabled={logAck.isPending}
                  oneVoice={oneVoice}
                  onChange={(v) => setValue(row.key, v)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <p data-testid="ack-check-summary" className="mt-1.5 text-[11px] text-[var(--color-charcoal)]">
          {differences === 0
            ? oneVoice
              ? 'Nothing differs from the order.'
              : 'Everything agrees.'
            : `${differences} difference${differences === 1 ? '' : 's'}. Silence on a wrong acknowledgment counts as accepting it.`}
        </p>
      )}
      {invalid && (
        <p id={invalidId} className={`mt-1 text-[11px] ${DIFFERS_CLS}`}>
          Prices are dollars and cents; quantities are whole numbers.
        </p>
      )}

      <div className="mt-2">
        <DocumentAction
          actionKey="log-po-acknowledgment"
          surfaceKey="orders"
          regionKey="po-acknowledgment"
          variant="primary"
          disabled={logAck.isPending || isLoading || invalid}
          held={invalid}
          aria-describedby={invalid ? invalidId : undefined}
          loading={logAck.isPending}
          loadingLabel="Logging…"
          onClick={() => void confirm()}
        >
          {differences === 0
            ? oneVoice
              ? 'Log it — confirmed as ordered'
              : 'Everything agrees — log it'
            : `Log it with ${differences} difference${differences === 1 ? '' : 's'}`}
        </DocumentAction>
      </div>
      {error && (
        // R83: the failure renders as a quiet inline band at the act site.
        <div role="alert" className={`mt-1.5 text-[11px] ${DIFFERS_CLS}`}>
          <p>{error}</p>
          <DocumentAction
            actionKey="retry-po-acknowledgment"
            surfaceKey="orders"
            regionKey="po-acknowledgment-error"
            variant="primary"
            className="mt-2"
            onClick={() => void confirm()}
          >
            Try again
          </DocumentAction>
        </div>
      )}
    </div>
  );
}

function FormRow({
  row,
  value,
  showQuoted,
  disabled,
  oneVoice,
  onChange,
}: {
  row: AckRow;
  value: string;
  showQuoted: boolean;
  disabled: boolean;
  oneVoice: boolean;
  onChange: (value: string) => void;
}) {
  const label = rowLabel(row.piece, row.field);
  const differs = rowAgreement(row, value) === 'differs';
  const shown = (v: string) => (row.kind === 'money' ? `$${v}` : v);
  return (
    <tr data-testid={`ack-row-${row.key}`} className="border-t border-[var(--color-pearl)]">
      <th scope="row" className={`${CELL_CLS} font-normal`}>{label}</th>
      {showQuoted && (
        <td className={`${CELL_CLS} font-mono`}>{row.quoted != null ? shown(row.quoted) : '—'}</td>
      )}
      <td className={`${CELL_CLS} font-mono`}>{shown(row.ordered)}</td>
      <td className={CELL_CLS}>
        {row.kind === 'date' ? (
          <DateTextInput
            value={value || null}
            onChange={(v) => onChange(v ?? '')}
            ariaLabel={`${label}, they confirmed`}
            className={INPUT_CLS}
          />
        ) : (
          <input
            type="text"
            inputMode={row.kind === 'text' ? undefined : 'decimal'}
            aria-label={`${label}, they confirmed`}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className={`${INPUT_CLS} ${differs ? DIFFERS_CLS : ''}`}
          />
        )}
      </td>
      <td data-testid="ack-row-word" className={`${CELL_CLS} whitespace-nowrap`}>
        <AgreementWord
          differs={differs}
          delta={differs ? rowDelta(row, value) : null}
          oneVoice={oneVoice}
        />
      </td>
    </tr>
  );
}

/**
 * The latest acknowledgment, line by line, with each open difference's three
 * answers. Hosts: the unfold Order cell, the Ledger row, the resend paper.
 */
export function AckRecord({
  purchaseOrderId,
  projectId,
  vendorPoNumber,
  confirmedEta,
  onStartChange,
  drafts = true,
  inCell = false,
}: {
  purchaseOrderId: string;
  projectId?: string | null;
  vendorPoNumber?: string | null;
  confirmedEta?: string | null;
  /** R8: opens the C-21 change order. Without it, the refusal says where to go. */
  onStartChange?: () => void;
  /** Render the drafted reply's review here (the Order cell already lists it). */
  drafts?: boolean;
  /**
   * F9-2: hosted in the unfold Order cell, which is narrower than the ledger
   * at 390. The table drops its 22rem floor and the verdict, row label and
   * door wrap instead of running past the viewport.
   */
  inCell?: boolean;
}) {
  const qc = useQueryClient();
  const resolve = useResolveAckLine({ errorSurface: 'inline' });
  const { latest } = usePoAckSummary(purchaseOrderId);
  const { basis } = useAckBasis(purchaseOrderId);
  const [notes, setNotes] = useState<Record<string, { changeOrder?: string; error?: string; done?: string }>>({});
  const [newAck, setNewAck] = useState(false);
  const project = projectId ?? basis?.projectId ?? null;

  const lines = latest?.po_ack_lines ?? [];
  if (!latest || lines.length === 0) return null;
  const items = new Map((basis?.lines ?? []).map((l) => [l.id, l]));

  const answer = async (line: PoAckLineRow, verdict: 'accepted' | 'disputed') => {
    if (resolve.isPending) return;
    setNotes((n) => ({ ...n, [line.id]: {} }));
    try {
      await resolve.mutateAsync({
        lineId: line.id,
        verdict,
        purchaseOrderId,
        projectId: project ?? '',
      });
      // An accepted price or spec rewrites WE ORDERED.
      void qc.invalidateQueries({ queryKey: poAckBasisKey(purchaseOrderId) });
      void qc.invalidateQueries({ queryKey: ['document-state'] });
      setNotes((n) => ({
        ...n,
        [line.id]: {
          done:
            verdict === 'accepted'
              ? 'Accepted their value.'
              : 'Disputed. The reply to the maker is drafted for your review; nothing is sent until you send it.',
        },
      }));
    } catch (e) {
      setNotes((n) => ({
        ...n,
        [line.id]: isChangeOrderRequired(e)
          ? { changeOrder: changeOrderReason(e) }
          : { error: (e as Error).message || 'The difference could not be answered.' },
      }));
    }
  };

  return (
    <div data-testid="ack-record" className="min-w-0">
      <div className="overflow-x-auto">
        <table
          className={`w-full ${inCell ? 'min-w-0' : 'min-w-[22rem]'} border-collapse text-left text-[11px] text-[var(--color-charcoal)]`}
        >
          <thead>
            <tr className={LABEL_CLS}>
              <th scope="col" className={`${CELL_CLS} font-normal`}>What</th>
              <th scope="col" className={`${CELL_CLS} font-normal`}>We ordered</th>
              <th scope="col" className={`${CELL_CLS} font-normal`}>They confirmed</th>
              <th scope="col" className={`${CELL_CLS} font-normal`}>
                <span className="sr-only">Check</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const item = line.ffe_item_id ? items.get(line.ffe_item_id) : undefined;
              const delta = moneyDelta(
                line.field,
                line.po_value,
                line.ack_value,
                {
                  qty: item?.quantity ?? 1,
                  unitCents: item ? (item.trade_price_cents ?? item.unit_price_cents) : null,
                },
                'stored',
              );
              const open = isOpenLine(line);
              const note = notes[line.id];
              const word = VERDICT_WORD[line.verdict] ?? line.verdict;
              return (
                <tr key={line.id} data-testid={`ack-line-${line.id}`} className="border-t border-[var(--color-pearl)]">
                  <th scope="row" className={`${CELL_CLS} font-normal${inCell ? ' min-w-0 break-words' : ''}`}>
                    {rowLabel(item ? item.name?.trim() || 'Line' : null, line.field)}
                  </th>
                  <td className={`${CELL_CLS} font-mono`}>{storedDisplay(line.field, line.po_value)}</td>
                  <td className={`${CELL_CLS} font-mono ${open ? DIFFERS_CLS : ''}`}>
                    {storedDisplay(line.field, line.ack_value)}
                  </td>
                  <td className={CELL_CLS}>
                    <p className={`${inCell ? '' : 'whitespace-nowrap '}${open ? `font-medium ${DIFFERS_CLS}` : 'text-[var(--text-muted)]'}`}>
                      {word}
                      {delta != null && line.verdict !== 'match' ? ` · ${fmtSignedCents(delta)}` : ''}
                    </p>
                    {open && !note?.done && (
                      <div className="flex flex-wrap gap-x-2">
                        <DocumentAction
                          actionKey="accept-ack-difference"
                          surfaceKey="orders"
                          regionKey="po-ack-record"
                          variant="tertiary"
                          disabled={resolve.isPending}
                          onClick={() => void answer(line, 'accepted')}
                        >
                          Accept theirs
                        </DocumentAction>
                        {line.verdict === 'mismatch' && (
                          <DocumentAction
                            actionKey="dispute-ack-difference"
                            surfaceKey="orders"
                            regionKey="po-ack-record"
                            variant="tertiary"
                            disabled={resolve.isPending}
                            onClick={() => void answer(line, 'disputed')}
                          >
                            Dispute
                          </DocumentAction>
                        )}
                      </div>
                    )}
                    {note?.done && (
                      <p role="status" className="text-[11px] text-[var(--text-muted)]">{note.done}</p>
                    )}
                    {note?.changeOrder != null && (
                      <div data-testid="ack-change-order" className={`text-[11px] ${DIFFERS_CLS}`}>
                        <p>
                          Accepting it changes the order, so it goes through a change order
                          {note.changeOrder ? `: ${note.changeOrder}.` : '.'}
                        </p>
                        {onStartChange ? (
                          <DocumentAction
                            actionKey="ack-start-change-order"
                            surfaceKey="orders"
                            regionKey="po-ack-record"
                            variant="secondary"
                            onClick={onStartChange}
                          >
                            Start a change →
                          </DocumentAction>
                        ) : (
                          <p>Open the line in the document to start the change.</p>
                        )}
                      </div>
                    )}
                    {note?.error && (
                      <p role="alert" className={`text-[11px] ${DIFFERS_CLS}`}>{note.error}</p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
        Silence on a wrong acknowledgment counts as accepting it. Production is not held while you answer.
      </p>

      {newAck ? (
        <div className="mt-2 border-t border-[var(--color-pearl)] pt-2">
          <p className={`${LABEL_CLS} mb-1`}>Their corrected acknowledgment</p>
          <AckCheckForm
            purchaseOrderId={purchaseOrderId}
            vendorPoNumber={vendorPoNumber ?? latest.vendor_order_ref}
            confirmedEta={confirmedEta}
            onLogged={() => setNewAck(false)}
          />
        </div>
      ) : (
        <DocumentAction
          actionKey="log-corrected-acknowledgment"
          surfaceKey="orders"
          regionKey="po-ack-record"
          variant="tertiary"
          className="mt-1"
          wrap={inCell}
          onClick={() => setNewAck(true)}
        >
          They corrected it — log the new acknowledgment
        </DocumentAction>
      )}

      {drafts && project && (
        <PurchaseOrderDrafts
          projectId={project}
          purchaseOrderId={purchaseOrderId}
          kinds={['ack_discrepancy_reply']}
        />
      )}
    </div>
  );
}
