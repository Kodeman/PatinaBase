'use client';

import { useEffect, useState } from 'react';
import type { AgentTask } from '@patina/agent-queue';
import { EmptyState, LoadingStrata } from '@/components/portal';
import { useToast } from '@/components/portal/toast-provider';
import { useAgentTasks, useReviewTask } from '@/hooks/use-agent-tasks';
import { useLeahSubstitutionReviews, useRuleLeahReview, type LeahSubstitutionReview } from '@/hooks/use-fulfillment-leah';

// Leah mode — /mission-control?assignee=leah. A swipe-sized, mobile-first deck:
// exactly one card per viewport (100dvh minus the 52px MobileTabBar), no
// scrolling. Two card KINDS, a discriminated union over the deck's sources:
//
//   • vendor_qualification (WP-1.1) — three images, evidence bullets, a maker
//     story, Leah's 0–250 brand score + a full-width Approve. Unchanged.
//   • substitution (BOH S7, R1.4/§9.4) — a vendor proposed a substitution that
//     needs Leah's eye. Two swatches/images side by side (specified vs
//     proposed), the one-line difference, a PRICE Δ · LEAD Δ · CLIENT mono
//     strip, and full-width ← Pass / Approve →. Her ruling writes back to the
//     exception (rule_leah_review) and drafts the client note. leah_reviews is
//     the cross-track contract; this is a SECOND card source over it, not a new
//     surface (the §9.4 "stub card" superseded by this existing deck, per I1).
//
// Substitution cards come first (a held order is more time-sensitive than a
// vendor-renewal score). The cursor traverses the merged list.

const RUBRIC_MAX = 250;

interface LeahCard {
  images?: string[];
  evidence?: string[];
  maker_story?: string;
}

function readCard(task: AgentTask): LeahCard {
  const payload = (task.payload ?? {}) as Record<string, unknown>;
  const card = payload.leah_card;
  return card && typeof card === 'object' ? (card as LeahCard) : {};
}

type DeckCard =
  | { kind: 'substitution'; id: string; review: LeahSubstitutionReview }
  | { kind: 'vendor_qualification'; id: string; task: AgentTask };

export function LeahReviewDeck() {
  const filters = { status: 'awaiting_review' as const, assignee: 'leah' as const, taskType: 'vendor_qualification' };
  const { data: tasks, isLoading: tasksLoading, isError, error } = useAgentTasks(filters);
  const { data: substitutions, isLoading: subsLoading } = useLeahSubstitutionReviews();
  const review = useReviewTask();
  const rule = useRuleLeahReview();
  const { toast } = useToast();

  const [cursor, setCursor] = useState(0);
  const [score, setScore] = useState('');

  const cards: DeckCard[] = [
    ...(substitutions ?? []).map((s): DeckCard => ({ kind: 'substitution', id: s.id, review: s })),
    ...(tasks ?? []).map((t): DeckCard => ({ kind: 'vendor_qualification', id: t.id, task: t })),
  ];

  useEffect(() => {
    setCursor((c) => (cards.length === 0 ? 0 : Math.min(c, cards.length - 1)));
  }, [cards.length]);

  const current: DeckCard | undefined = cards[cursor];

  useEffect(() => {
    setScore('');
  }, [current?.id]);

  const isLoading = tasksLoading || subsLoading;
  if (isLoading) return <LoadingStrata />;
  if (isError) {
    return <EmptyState label="Error" message={(error as Error)?.message ?? 'Failed to load'} />;
  }
  if (cards.length === 0 || !current) {
    return <EmptyState label="All clear" message="No maker cards or substitutions awaiting Leah." />;
  }

  const advance = () => setCursor((c) => Math.min(c + 1, cards.length - 1));

  // ─── vendor_qualification (unchanged behavior) ────────────────────────────
  const scoreNum = Number(score);
  const scoreValid = score !== '' && Number.isFinite(scoreNum) && scoreNum >= 0 && scoreNum <= RUBRIC_MAX;
  const approveTask = async (task: AgentTask) => {
    if (!scoreValid) return;
    try {
      await review.mutateAsync({
        id: task.id,
        decision: 'approved',
        reviewMeta: { brand_score: scoreNum, rubric_max: RUBRIC_MAX },
      });
      toast('Scored & approved', 'success');
    } catch (e) {
      toast((e as Error).message || 'Approve failed', 'error');
    }
  };

  // ─── substitution ─────────────────────────────────────────────────────────
  const ruleSubstitution = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await rule.mutateAsync({ id, status });
      toast(status === 'approved' ? 'Approved — client note drafted' : 'Passed — back to the operator', 'success');
      advance();
    } catch (e) {
      toast((e as Error).message || 'Ruling failed', 'error');
    }
  };

  return (
    <div
      data-testid="leah-review-deck"
      className="mx-auto flex min-h-[calc(100dvh-52px)] w-full max-w-md flex-col px-4 py-4"
    >
      <div className="type-meta-small mb-3 flex items-center justify-between">
        <span>Brand review — Leah</span>
        <span data-testid="leah-remaining">{cards.length} remaining</span>
      </div>

      {current.kind === 'substitution' ? (
        <SubstitutionCard
          card={current.review}
          pending={rule.isPending}
          onPass={() => void ruleSubstitution(current.review.id, 'rejected')}
          onApprove={() => void ruleSubstitution(current.review.id, 'approved')}
        />
      ) : (
        <VendorCard
          task={current.task}
          score={score}
          onScore={setScore}
          scoreValid={scoreValid}
          pending={review.isPending}
          canSkip={cards.length > 1}
          onSkip={advance}
          onApprove={() => void approveTask(current.task)}
        />
      )}
    </div>
  );
}

// ─── substitution card ───────────────────────────────────────────────────────
function Swatch({ label, hex, img }: { label: string; hex?: string; img?: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="aspect-square w-full overflow-hidden border border-[var(--border-subtle)]">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full" style={{ background: hex ?? 'var(--bg-hover)' }} />
        )}
      </div>
      <div className="type-meta-small mt-1 text-center text-[var(--text-muted)]">{label}</div>
    </div>
  );
}

function SubstitutionCard({
  card,
  pending,
  onPass,
  onApprove,
}: {
  card: LeahSubstitutionReview;
  pending: boolean;
  onPass: () => void;
  onApprove: () => void;
}) {
  const p = (card.payload?.comparison as Record<string, unknown>) ?? card.payload ?? {};
  const title = (p.title as string) ?? 'Substitution proposed';
  const difference = (p.difference as string) ?? '';
  const priceDelta = Number(p.price_delta_cents ?? 0);
  const leadDelta = Number(p.lead_delta_days ?? 0);
  const clientName = (p.client_name as string) ?? card.clientName ?? '';
  const fmtDelta = (c: number) => (c === 0 ? '$0' : `${c > 0 ? '+' : '−'}$${Math.abs(c / 100).toFixed(0)}`);

  return (
    <div
      data-testid="leah-card"
      data-card-kind="substitution"
      data-review-id={card.id}
      className="flex flex-1 flex-col border border-[var(--border-default)] bg-[var(--bg-surface)]"
    >
      <div className="p-4">
        <div className="type-meta-small text-[var(--accent-primary)]">
          Substitution · needs your eye {card.orderNo != null ? `· #${card.orderNo}` : ''}
        </div>
        <h2 className="type-item-name mt-1">{title}</h2>
        {difference && <p className="type-body-small mt-1 italic text-[var(--text-body)]">{difference}</p>}

        <div className="mt-4 flex gap-3">
          <Swatch label="specified" hex={p.specified_swatch as string} img={p.specified_image as string} />
          <Swatch label="proposed" hex={p.proposed_swatch as string} img={p.proposed_image as string} />
        </div>

        <div
          data-testid="leah-delta-strip"
          className="mt-4 border-y border-[var(--border-subtle)] py-2 text-center text-[0.72rem] tracking-[0.08em] text-[var(--text-body)]"
          style={{ fontFamily: 'var(--font-meta)' }}
        >
          PRICE Δ {fmtDelta(priceDelta)} · LEAD Δ {leadDelta === 0 ? '0' : `${leadDelta > 0 ? '+' : ''}${leadDelta}d`} · CLIENT: {clientName.toUpperCase()}
        </div>
      </div>

      <div className="mt-auto flex items-center gap-3 p-4">
        <button
          type="button"
          data-testid="leah-pass"
          onClick={onPass}
          disabled={pending}
          className="type-btn-text flex-1 border border-[var(--border-default)] py-3 text-[var(--text-muted)] disabled:opacity-40"
        >
          ← Pass
        </button>
        <button
          type="button"
          data-testid="leah-approve"
          onClick={onApprove}
          disabled={pending}
          className="type-btn-text flex-1 bg-[var(--accent-primary)] py-3 text-[var(--bg-surface)] transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Approve →
        </button>
      </div>
    </div>
  );
}

// ─── vendor_qualification card (WP-1.1 behavior, unchanged) ──────────────────
function VendorCard({
  task,
  score,
  onScore,
  scoreValid,
  pending,
  canSkip,
  onSkip,
  onApprove,
}: {
  task: AgentTask;
  score: string;
  onScore: (v: string) => void;
  scoreValid: boolean;
  pending: boolean;
  canSkip: boolean;
  onSkip: () => void;
  onApprove: () => void;
}) {
  const card = readCard(task);
  const images = (card.images ?? []).slice(0, 3);
  const evidence = (card.evidence ?? []).slice(0, 3);

  return (
    <>
      <div
        data-testid="leah-card"
        data-card-kind="vendor_qualification"
        data-task-id={task.id}
        className="flex flex-1 flex-col border border-[var(--border-default)] bg-[var(--bg-surface)]"
      >
        <div className="grid grid-cols-3 gap-0.5 bg-[var(--border-subtle)]">
          {Array.from({ length: 3 }).map((_, i) => {
            const src = images[i];
            return (
              <div key={i} className="aspect-square overflow-hidden bg-[var(--bg-hover)]">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={`Maker sample ${i + 1}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center type-meta-small text-[var(--text-subtle)]">
                    —
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-1 flex-col gap-4 p-4">
          <h2 className="type-item-name">{task.summary || task.task_type}</h2>

          {card.maker_story && (
            <p className="type-body-small italic text-[var(--text-body)]">{card.maker_story}</p>
          )}

          {evidence.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {evidence.map((e, i) => (
                <li key={i} className="type-body-small flex items-baseline gap-2">
                  <span className="text-[var(--accent-primary)]" aria-hidden>
                    •
                  </span>
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-auto">
            <label className="type-meta-small mb-1.5 block" htmlFor="leah-brand-score">
              Brand score — 0 to {RUBRIC_MAX}
            </label>
            <input
              id="leah-brand-score"
              data-testid="leah-brand-score"
              type="number"
              min={0}
              max={RUBRIC_MAX}
              inputMode="numeric"
              value={score}
              onChange={(e) => onScore(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && scoreValid) {
                  e.preventDefault();
                  onApprove();
                }
              }}
              className="type-data-large w-full border-b-2 border-[var(--border-default)] bg-transparent py-1 tabular-nums outline-none focus:border-[var(--accent-primary)]"
              style={{ fontFamily: 'var(--font-display)' }}
              placeholder="0"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          data-testid="leah-skip"
          onClick={onSkip}
          disabled={pending || !canSkip}
          className="type-btn-text px-3 py-3 text-[var(--text-muted)] disabled:opacity-40"
        >
          Skip
        </button>
        <button
          type="button"
          data-testid="leah-approve"
          onClick={onApprove}
          disabled={!scoreValid || pending}
          className="type-btn-text flex-1 bg-[var(--accent-primary)] py-3 text-[var(--bg-surface)] transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Approve
        </button>
      </div>
    </>
  );
}
