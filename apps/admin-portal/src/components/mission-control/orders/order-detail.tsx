'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { StatusDot } from '@/components/portal';
import {
  advanceGate,
  CONCIERGE_STAGES,
  CONCIERGE_STAGE_LABELS,
  formatCountdown,
  isDeadlineUrgent,
  isTerminalStage,
  paymentFlagVariant,
  PAYMENT_FLAG_LABELS,
  type ChecklistItem,
  type ConciergeStage,
} from '@/lib/concierge-stages';
import {
  useAdvanceConciergeOrder,
  useConciergeOrder,
  useEnterConciergeDamageMode,
  useToggleConciergeChecklistItem,
} from '@/hooks/use-concierge-orders';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="type-label-secondary mb-2 uppercase tracking-wide text-[var(--text-subtle)]">
      {children}
    </div>
  );
}

export function OrderDetail({ id }: { id: string }) {
  const { toast } = useToast();
  const { data: order, isLoading } = useConciergeOrder(id);
  const toggleItem = useToggleConciergeChecklistItem(id);
  const advance = useAdvanceConciergeOrder(id);
  const enterDamage = useEnterConciergeDamageMode(id);

  const [showForce, setShowForce] = useState(false);
  const [forceNote, setForceNote] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [cancelNote, setCancelNote] = useState('');
  const [damageDeadline, setDamageDeadline] = useState('');

  if (isLoading || !order) {
    return <div className="py-4 type-meta-small text-[var(--text-subtle)]">Loading detail…</div>;
  }

  const stage = order.stage;
  const gate = advanceGate(stage, order.checklists);
  const terminal = isTerminalStage(stage);

  const handleToggle = (s: ConciergeStage, item: ChecklistItem) => {
    toggleItem.mutate(
      { stage: s, key: item.key, done: !item.done },
      { onError: (e) => toast({ title: 'Toggle failed', description: (e as Error).message, variant: 'destructive' }) },
    );
  };

  const doAdvance = (opts?: { force?: boolean; note?: string }) => {
    if (!gate.to) return;
    advance.mutate(
      { toStage: gate.to, force: opts?.force, note: opts?.note },
      {
        onSuccess: (r) => {
          toast({ title: `Advanced to ${CONCIERGE_STAGE_LABELS[r.to_stage as ConciergeStage] ?? r.to_stage}` });
          setShowForce(false);
          setForceNote('');
        },
        onError: (e) => toast({ title: 'Advance failed', description: (e as Error).message, variant: 'destructive' }),
      },
    );
  };

  const doCancel = () => {
    if (!cancelNote.trim()) {
      toast({ title: 'A cancellation note is required', variant: 'destructive' });
      return;
    }
    advance.mutate(
      { toStage: 'cancelled', note: cancelNote.trim() },
      {
        onSuccess: () => {
          toast({ title: 'Order cancelled' });
          setShowCancel(false);
          setCancelNote('');
        },
        onError: (e) => toast({ title: 'Cancel failed', description: (e as Error).message, variant: 'destructive' }),
      },
    );
  };

  const doEnterDamage = () => {
    enterDamage.mutate(
      { carrierDeadline: damageDeadline || null },
      {
        onSuccess: () => toast({ title: 'Damage mode entered' }),
        onError: (e) => toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }),
      },
    );
  };

  // Stages that actually have a seeded checklist, in lifecycle order.
  const stagesWithChecklists = CONCIERGE_STAGES.filter((s) => Array.isArray(order.checklists?.[s]));

  return (
    <div className="grid grid-cols-1 gap-8 pt-4 lg:grid-cols-[1.4fr_1fr]">
      {/* ── Left: checklists + advance ─────────────────────────────────── */}
      <div className="space-y-6">
        {stagesWithChecklists.map((s) => {
          const items = order.checklists[s] ?? [];
          const isCurrent = s === stage;
          return (
            <div key={s}>
              <SectionLabel>
                {CONCIERGE_STAGE_LABELS[s]} checklist{isCurrent ? ' · current' : ''}
              </SectionLabel>
              <div className="space-y-1.5">
                {items.map((item) => (
                  <label
                    key={item.key}
                    className="flex cursor-pointer items-start gap-2.5 py-0.5"
                  >
                    <Checkbox
                      checked={item.done}
                      onCheckedChange={() => handleToggle(s, item)}
                      disabled={toggleItem.isPending}
                      className="mt-0.5"
                    />
                    <span
                      className={`type-body text-sm ${item.done ? 'text-[var(--text-subtle)] line-through' : 'text-[var(--text-primary)]'}`}
                    >
                      {item.label}
                      {item.required && (
                        <span className="ml-1 text-[var(--color-terracotta,var(--color-error))]">*</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}

        {/* Advance controls */}
        {!terminal && gate.to && (
          <div className="border-t border-[var(--border-subtle)] pt-4">
            {gate.allowed ? (
              <Button onClick={() => doAdvance()} disabled={advance.isPending}>
                {advance.isPending ? 'Advancing…' : `Advance to ${CONCIERGE_STAGE_LABELS[gate.to]}`}
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="type-meta-small text-[var(--text-muted)]">
                  Blocked · complete “{gate.blocking?.label}” to advance to {CONCIERGE_STAGE_LABELS[gate.to]}.
                </p>
                {!showForce ? (
                  <Button variant="secondary" onClick={() => setShowForce(true)}>
                    Force advance…
                  </Button>
                ) : (
                  <div className="space-y-2 rounded border border-[var(--border-default)] p-3">
                    <Input
                      placeholder="Reason for the override (required)"
                      value={forceNote}
                      onChange={(e) => setForceNote(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        disabled={!forceNote.trim() || advance.isPending}
                        onClick={() => doAdvance({ force: true, note: forceNote.trim() })}
                      >
                        Force to {CONCIERGE_STAGE_LABELS[gate.to]}
                      </Button>
                      <Button variant="ghost" onClick={() => setShowForce(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-3">
              {!showCancel ? (
                <button
                  type="button"
                  className="type-meta-small text-[var(--text-subtle)] underline hover:text-[var(--color-error)]"
                  onClick={() => setShowCancel(true)}
                >
                  Cancel order
                </button>
              ) : (
                <div className="space-y-2 rounded border border-[var(--border-default)] p-3">
                  <Input
                    placeholder="Cancellation reason (required)"
                    value={cancelNote}
                    onChange={(e) => setCancelNote(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button variant="destructive" disabled={advance.isPending} onClick={doCancel}>
                      Confirm cancel
                    </Button>
                    <Button variant="ghost" onClick={() => setShowCancel(false)}>
                      Keep
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Right: payment, linked docs, freight, damage ────────────────── */}
      <div className="space-y-6">
        {/* Payment flag */}
        <div>
          <SectionLabel>Payment vs ledger</SectionLabel>
          <StatusDot
            variant={paymentFlagVariant(order.payment_flag)}
            label={PAYMENT_FLAG_LABELS[order.payment_flag]}
          />
          {order.payment_flag_detail?.verdict && (
            <p className="type-meta-small mt-2 text-[var(--color-terracotta,var(--color-error))]">
              {order.payment_flag_detail.verdict}
            </p>
          )}
          {order.payment_flag_detail?.checks?.map((c, i) => (
            <p key={i} className="type-meta-small mt-1 font-mono text-[var(--text-muted)]">
              {c.name}: expected {String(c.expected)} · actual {String(c.actual)}
            </p>
          ))}
        </div>

        {/* Linked docs (agent_tasks artifacts) */}
        <div>
          <SectionLabel>Linked tasks &amp; docs</SectionLabel>
          {order.linked_tasks.length === 0 ? (
            <p className="type-meta-small text-[var(--text-subtle)]">None yet.</p>
          ) : (
            <div className="space-y-2">
              {order.linked_tasks.map((t) => (
                <div key={t.id} className="rounded border border-[var(--border-subtle)] p-2">
                  <div className="type-meta-small font-mono text-[var(--text-muted)]">
                    {t.task_type} · {t.status}
                  </div>
                  <div className="type-body text-sm">{t.summary || '—'}</div>
                  {typeof (t.artifacts as any)?.evidence?.verdict === 'string' && (
                    <p className="type-meta-small mt-1 text-[var(--text-muted)]">
                      {(t.artifacts as any).evidence.verdict}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Freight */}
        {order.freight != null && (
          <div>
            <SectionLabel>Freight</SectionLabel>
            <pre className="overflow-x-auto rounded bg-[var(--bg-hover)] p-2 type-meta-small">
              {JSON.stringify(order.freight, null, 2)}
            </pre>
          </div>
        )}

        {/* Damage subflow */}
        <div>
          <SectionLabel>Damage claim</SectionLabel>
          {!order.damage ? (
            <div className="space-y-2">
              <p className="type-meta-small text-[var(--text-subtle)]">
                No damage reported. Entering damage mode seeds the photo checklist and a
                carrier-claim countdown; the daily job escalates when the deadline is within 7 days.
              </p>
              <Input
                type="date"
                value={damageDeadline}
                onChange={(e) => setDamageDeadline(e.target.value)}
                className="max-w-[12rem]"
              />
              <Button variant="secondary" disabled={enterDamage.isPending} onClick={doEnterDamage}>
                {enterDamage.isPending ? 'Entering…' : 'Enter damage mode'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-medium"
                  style={{
                    color: isDeadlineUrgent(order.damage.carrier_deadline)
                      ? 'var(--color-terracotta,var(--color-error))'
                      : 'var(--text-muted)',
                    border: `1px solid ${isDeadlineUrgent(order.damage.carrier_deadline) ? 'var(--color-terracotta,var(--color-error))' : 'var(--border-default)'}`,
                  }}
                >
                  Carrier deadline {order.damage.carrier_deadline} · {formatCountdown(order.damage.carrier_deadline)}
                </span>
                {isDeadlineUrgent(order.damage.carrier_deadline) && (
                  <span className="type-meta-small text-[var(--color-terracotta,var(--color-error))]">
                    Escalates via daily job
                  </span>
                )}
              </div>
              <div>
                <div className="type-meta-small mb-1 text-[var(--text-subtle)]">Photo checklist</div>
                <ul className="space-y-1">
                  {order.damage.photo_checklist.map((p) => (
                    <li key={p.key} className="type-body flex items-center gap-2 text-sm">
                      <span className="text-[var(--text-subtle)]">{p.done ? '☑' : '☐'}</span>
                      {p.label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
