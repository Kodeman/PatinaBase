'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  resolutionPathsForType,
  EXCEPTION_CAUSE_CODES,
  type ExceptionCaseFileDTO,
  type ConsequencePreview,
  type ResolutionPathMeta,
} from '@patina/fulfillment';
import { usePreviewResolution, useResolveException } from '@/hooks/use-fulfillment-exceptions';
import { useToast } from '@/components/portal/toast-provider';
import { MonoConsequence } from './mono-consequence';

// The resolution paths (S7, spec §5.5) — each rendered as a complete SENTENCE
// built from server facts, each followed by its ledger consequence in mono BEFORE
// commit (fed by resolve(preview:=true)). Selecting a path reveals its params +
// the required cause code + an outcome memo; commit calls the SAME RPC with
// preview:=false, so what posts equals what was shown.

const inputCls =
  'w-full border-b border-[var(--border-default)] bg-transparent py-1 text-[0.85rem] outline-none focus:border-[var(--accent-primary)]';
const labelCls = 'text-[0.53rem] uppercase tracking-[0.13em] text-[var(--text-muted)]';

function dollarsToCents(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function ResolutionPaths({ caseFile }: { caseFile: ExceptionCaseFileDTO }) {
  const router = useRouter();
  const { toast } = useToast();
  const paths = useMemo(() => resolutionPathsForType(caseFile.type), [caseFile.type]);

  const [selected, setSelected] = useState<ResolutionPathMeta | null>(null);
  const [amount, setAmount] = useState('');
  const [refund, setRefund] = useState('');
  const [tax, setTax] = useState('');
  const [causeCode, setCauseCode] = useState('');
  const [memo, setMemo] = useState('');
  const [newEta, setNewEta] = useState('');
  const [committedShip, setCommittedShip] = useState('');
  const [specified, setSpecified] = useState('');
  const [proposed, setProposed] = useState('');
  const [difference, setDifference] = useState('');
  const [preview, setPreview] = useState<ConsequencePreview | null>(null);

  const previewMut = usePreviewResolution(caseFile.id);
  const resolveMut = useResolveException(caseFile.id);

  // Build the RPC params from the current form.
  const buildParams = (path: ResolutionPathMeta): Record<string, unknown> => {
    const p: Record<string, unknown> = { cause_code: causeCode, outcome_memo: memo };
    if (path.path === 'backorder_cancel' || path.path === 'refund') {
      p.refund_cents = dollarsToCents(refund);
      p.tax_reversal_cents = dollarsToCents(tax);
    } else if (path.requiresAmount) {
      p.amount_cents = dollarsToCents(amount);
    }
    if (path.needsNewEta) p.new_eta = newEta || null;
    if (path.needsCommittedShip) p.committed_ship = committedShip || null;
    if (path.requiresLeah) {
      p.comparison = {
        specified,
        proposed,
        difference,
        price_delta_cents: 0,
        lead_delta_days: 0,
        client_name: caseFile.clientName,
      };
    }
    return p;
  };

  // Live preview whenever the selected path or a money/date param changes.
  useEffect(() => {
    if (!selected) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      previewMut
        .mutateAsync({ path: selected.path, params: buildParams(selected) })
        .then((res) => {
          if (!cancelled) setPreview(res);
        })
        .catch(() => {
          if (!cancelled) setPreview(null);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.path, amount, refund, tax, newEta, committedShip]);

  const resolved = caseFile.status === 'resolved';

  const commit = async () => {
    if (!selected) return;
    if (!causeCode) {
      toast('A cause code is required to close', 'error');
      return;
    }
    try {
      const res = await resolveMut.mutateAsync({ path: selected.path, params: buildParams(selected) });
      if ((res as { routedToLeah?: boolean }).routedToLeah) {
        toast('Routed to Leah for review', 'success');
      } else {
        toast('Exception resolved', 'success');
      }
      router.push('/fulfillment/exceptions');
    } catch (e) {
      toast((e as Error).message || 'Failed to resolve', 'error');
    }
  };

  if (resolved) {
    return (
      <div className="mt-6" data-testid="resolution-closed">
        <div className={labelCls}>Resolved</div>
        <p className="mt-1 text-[0.9rem] text-[var(--text-body)]">
          {caseFile.resolutionPath} · cause {caseFile.causeCode}
        </p>
        {caseFile.outcomeMemo && (
          <p className="mt-1 text-[0.85rem] italic text-[var(--text-muted)]">{caseFile.outcomeMemo}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-2" data-testid="resolution-paths">
      <div className={labelCls}>Resolution paths</div>
      {paths.map((path) => {
        const isSel = selected?.path === path.path;
        return (
          <div
            key={path.path}
            data-testid={`respath-${path.path}`}
            data-selected={isSel}
            className="border p-3 transition-colors"
            style={{
              borderColor: isSel ? 'var(--accent-primary)' : 'var(--border-default)',
              background: isSel ? 'var(--bg-surface)' : 'transparent',
            }}
          >
            <button
              type="button"
              className="w-full text-left"
              onClick={() => setSelected(isSel ? null : path)}
            >
              <span className="text-[0.9rem] font-medium text-[var(--text-primary)]">{path.label}.</span>{' '}
              <span className="text-[0.9rem] text-[var(--text-body)]">{path.sentence}</span>
            </button>

            {isSel && (
              <div className="mt-3 flex flex-col gap-3" data-testid={`respath-form-${path.path}`}>
                {path.requiresAmount && path.path !== 'backorder_cancel' && path.path !== 'refund' && (
                  <label className="flex flex-col gap-1">
                    <span className={labelCls}>Amount (USD)</span>
                    <input
                      className={inputCls}
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      data-testid="respath-amount"
                    />
                  </label>
                )}
                {(path.path === 'backorder_cancel' || path.path === 'refund') && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1">
                      <span className={labelCls}>Refund (USD)</span>
                      <input className={inputCls} inputMode="decimal" value={refund} onChange={(e) => setRefund(e.target.value)} placeholder="0.00" data-testid="respath-refund" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={labelCls}>Tax reversal (USD)</span>
                      <input className={inputCls} inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="0.00" />
                    </label>
                  </div>
                )}
                {path.needsNewEta && (
                  <label className="flex flex-col gap-1">
                    <span className={labelCls}>New ETA</span>
                    <input className={inputCls} type="date" value={newEta} onChange={(e) => setNewEta(e.target.value)} data-testid="respath-new-eta" />
                  </label>
                )}
                {path.needsCommittedShip && (
                  <label className="flex flex-col gap-1">
                    <span className={labelCls}>New committed ship date</span>
                    <input className={inputCls} type="date" value={committedShip} onChange={(e) => setCommittedShip(e.target.value)} />
                  </label>
                )}
                {path.requiresLeah && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="flex flex-col gap-1">
                      <span className={labelCls}>Specified</span>
                      <input className={inputCls} value={specified} onChange={(e) => setSpecified(e.target.value)} placeholder="Bouclé lot 44" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={labelCls}>Proposed</span>
                      <input className={inputCls} value={proposed} onChange={(e) => setProposed(e.target.value)} placeholder="Bouclé lot 47" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={labelCls}>Difference</span>
                      <input className={inputCls} value={difference} onChange={(e) => setDifference(e.target.value)} placeholder="warmer undertone" />
                    </label>
                  </div>
                )}

                {/* the ledger consequence, in mono, BEFORE commit */}
                <MonoConsequence cons={preview} />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className={labelCls}>Cause code · required</span>
                    <select
                      className={inputCls}
                      value={causeCode}
                      onChange={(e) => setCauseCode(e.target.value)}
                      data-testid="respath-cause-code"
                    >
                      <option value="">Select a cause…</option>
                      {EXCEPTION_CAUSE_CODES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={labelCls}>Outcome memo</span>
                    <input className={inputCls} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="even &quot;$0 — vendor absorbed&quot;" data-testid="respath-memo" />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => void commit()}
                  disabled={resolveMut.isPending || !causeCode}
                  data-testid="respath-commit"
                  className="type-btn-text mt-1 self-start bg-[var(--accent-primary)] px-4 py-2 text-[var(--bg-surface)] transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {path.requiresLeah ? 'Route to Leah' : 'Commit resolution'}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
