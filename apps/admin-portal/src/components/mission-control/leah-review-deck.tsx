'use client';

import { useEffect, useState } from 'react';
import type { AgentTask } from '@patina/agent-queue';
import { EmptyState, LoadingStrata } from '@/components/portal';
import { useToast } from '@/components/portal/toast-provider';
import { useAgentTasks, useReviewTask } from '@/hooks/use-agent-tasks';

// Leah mode — /mission-control?assignee=leah. A swipe-sized, mobile-first deck:
// exactly one maker card per viewport (100dvh minus the 52px MobileTabBar), no
// scrolling. Three images, three evidence bullets, a one-line maker story, and
// Leah's half of the 500-point rubric (0–250 brand score) + a full-width
// Approve. Target interaction ~5s. Score submits as review meta
// { brand_score, rubric_max: 250 }; approving advances to the next card.

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

export function LeahReviewDeck() {
  const filters = { status: 'awaiting_review' as const, assignee: 'leah' as const, taskType: 'vendor_qualification' };
  const { data: tasks, isLoading, isError, error } = useAgentTasks(filters);
  const review = useReviewTask();
  const { toast } = useToast();

  const [cursor, setCursor] = useState(0);
  const [score, setScore] = useState('');

  const list = tasks ?? [];

  useEffect(() => {
    setCursor((c) => (list.length === 0 ? 0 : Math.min(c, list.length - 1)));
  }, [list.length]);

  const current: AgentTask | undefined = list[cursor];

  // Reset the score input whenever the visible card changes.
  useEffect(() => {
    setScore('');
  }, [current?.id]);

  if (isLoading) return <LoadingStrata />;
  if (isError) {
    return <EmptyState label="Error" message={(error as Error)?.message ?? 'Failed to load'} />;
  }
  if (list.length === 0 || !current) {
    return (
      <EmptyState label="All clear" message="No maker cards awaiting Leah's brand score." />
    );
  }

  const card = readCard(current);
  const images = (card.images ?? []).slice(0, 3);
  const evidence = (card.evidence ?? []).slice(0, 3);
  const scoreNum = Number(score);
  const scoreValid = score !== '' && Number.isFinite(scoreNum) && scoreNum >= 0 && scoreNum <= RUBRIC_MAX;

  const approve = async () => {
    if (!scoreValid) return;
    try {
      await review.mutateAsync({
        id: current.id,
        decision: 'approved',
        reviewMeta: { brand_score: scoreNum, rubric_max: RUBRIC_MAX },
      });
      toast('Scored & approved', 'success');
    } catch (e) {
      toast((e as Error).message || 'Approve failed', 'error');
    }
  };

  return (
    <div
      data-testid="leah-review-deck"
      className="mx-auto flex min-h-[calc(100dvh-52px)] w-full max-w-md flex-col px-4 py-4"
    >
      <div className="type-meta-small mb-3 flex items-center justify-between">
        <span>Brand review — Leah</span>
        <span data-testid="leah-remaining">{list.length} remaining</span>
      </div>

      <div
        data-testid="leah-card"
        data-task-id={current.id}
        className="flex flex-1 flex-col border border-[var(--border-default)] bg-[var(--bg-surface)]"
      >
        {/* 3 images */}
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
          <h2 className="type-item-name">{current.summary || current.task_type}</h2>

          {/* 1-line maker story */}
          {card.maker_story && (
            <p className="type-body-small italic text-[var(--text-body)]">{card.maker_story}</p>
          )}

          {/* 3 evidence bullets */}
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
              onChange={(e) => setScore(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && scoreValid) {
                  e.preventDefault();
                  void approve();
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
          onClick={() => setCursor((c) => Math.min(c + 1, list.length - 1))}
          disabled={review.isPending || list.length <= 1}
          className="type-btn-text px-3 py-3 text-[var(--text-muted)] disabled:opacity-40"
        >
          Skip
        </button>
        <button
          type="button"
          data-testid="leah-approve"
          onClick={() => void approve()}
          disabled={!scoreValid || review.isPending}
          className="type-btn-text flex-1 bg-[var(--accent-primary)] py-3 text-[var(--bg-surface)] transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Approve
        </button>
      </div>
    </div>
  );
}
