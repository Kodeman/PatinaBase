'use client';

/**
 * /library/judgments — side-by-side taste judgments (Aesthete design §8,
 * delivery Wave 3B), rehoused by the R21 dissolve from /portal/teaching/judgments.
 *
 * Teaching was a zone; the act it carried is not. Weighing two pieces against
 * each other IS library work — the pool is the library, the question is "which
 * is more you?" — so it becomes a nested Room off the Library (RoomShell with
 * backTo '/library', which overrides the stashed origin so leaving returns to
 * the shelves rather than wherever the Library itself was opened from).
 *
 * A STATIC segment beside the dynamic /library/[id]: Next.js always prefers the
 * static match, so `judgments` can never be read as a product id.
 *
 * Behaviour is unchanged from the portal page — same three hooks
 * (useDueTasteProbes / useJudgmentPool / useSubmitTasteJudgment), the same
 * frozen-deck rule, the same append-only optimistic advance. Writes go through
 * `submit_taste_judgment` (context 'self'), which owns the §8.3 probe mechanics
 * server-side; due probes are served FIRST and rendered exactly like any other
 * pair — no special copy, ever (de-gamified law R32/R37: no "consistency
 * check", no streaks, no scores, no goals). Zero shadows (D4).
 *
 * One behavioural change from the portal page: a failed write reports through a
 * quiet inline band above the pair, not a toast. R83 removed the toast layer from
 * (document) surfaces entirely, so the old `toast()` call here would have
 * no-oped in silence — a lost judgment with nothing said about it.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  useDueTasteProbes,
  useJudgmentPool,
  useSubmitTasteJudgment,
  buildJudgmentDeck,
  type JudgmentChoice,
  type JudgmentPair,
  type JudgmentProduct,
} from '@patina/supabase';
import { Button } from '@/components/ui/controls';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';
import { RoomShell } from '@/components/document/rooms/room-shell';

export default function JudgmentsPage() {
  const hydrated = useHydrated();
  const { data: probes, isLoading: probesLoading } = useDueTasteProbes();
  const { data: pool, isLoading: poolLoading } = useJudgmentPool();
  const submit = useSubmitTasteJudgment();
  // R83 — no toast layer on (document) surfaces. A write that fails says so
  // quietly, in place, above the pair the designer is looking at. Cleared on the
  // next pick so a stale complaint can't sit under a fresh question.
  const [writeError, setWriteError] = useState<string | null>(null);

  // The deck is FROZEN once built for the sitting — submitting answers
  // invalidates the probe query, and a live rebuild would reshuffle pairs
  // mid-sitting.
  const [deck, setDeck] = useState<JudgmentPair[] | null>(null);
  const [index, setIndex] = useState(0);
  const shownAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (deck !== null) return;
    if (probesLoading || poolLoading) return;
    setDeck(buildJudgmentDeck(probes ?? [], pool ?? []));
    setIndex(0);
    shownAtRef.current = Date.now();
  }, [deck, probes, pool, probesLoading, poolLoading]);

  const pair = deck?.[index] ?? null;

  const advance = () => {
    setIndex((i) => i + 1);
    shownAtRef.current = Date.now();
  };

  const choose = (choice: JudgmentChoice) => {
    if (!pair || submit.isPending) return;
    setWriteError(null);
    const latencyMs = Math.max(0, Math.round(Date.now() - shownAtRef.current));
    submit.mutate(
      {
        productA: pair.a.id,
        productB: pair.b.id,
        choice,
        context: 'self',
        latencyMs,
      },
      {
        onError: (err) =>
          setWriteError(
            err instanceof Error ? err.message : 'Could not record that.',
          ),
      },
    );
    // Advance immediately — the write is append-only and a sitting should
    // feel like leafing through pages, not waiting on saves.
    advance();
  };

  const anotherRound = () => {
    setWriteError(null);
    setDeck(buildJudgmentDeck(probes ?? [], pool ?? []));
    setIndex(0);
    shownAtRef.current = Date.now();
  };

  return (
    <RoomShell
      title="Side by side"
      backTo="/library"
      backLabel="the Library"
    >
      <div className="mx-auto max-w-[900px] px-5 pb-24 pt-2 sm:px-8">
        {!hydrated || deck === null ? (
          <LoadingStrata />
        ) : (
          <>
            {/* The Room's band already names the surface (RoomShell title), so
                the page opens on the question rather than repeating the name. */}
            <h1 className="sr-only">Side by side</h1>
            <p className="mb-8 max-w-[560px] font-heading text-[1.05rem] italic leading-relaxed text-[var(--color-mocha)]">
              Which is more you? Go on instinct — the Engine learns your eye
              from every pair.
            </p>

            {writeError && (
              <p
                role="alert"
                className="mb-4 max-w-[560px] text-[11px] leading-snug text-[var(--color-terracotta-ink)]"
              >
                {writeError}{' '}
                <span className="opacity-80">
                  That pair wasn&apos;t recorded. Keep going — it&apos;ll come
                  round again.
                </span>
              </p>
            )}

            {pair ? (
              <div className="max-w-[860px]">
                <div className="grid grid-cols-2 gap-6">
                  <JudgmentCard product={pair.a} onPick={() => choose('a')} />
                  <JudgmentCard product={pair.b} onPick={() => choose('b')} />
                </div>
                <div className="mt-5 flex items-center justify-center gap-6">
                  <button
                    type="button"
                    onClick={() => choose('neither')}
                    className="font-body text-[0.8rem] text-[var(--text-muted)] underline decoration-[var(--color-pearl)] underline-offset-2 hover:text-[var(--text-primary)]"
                  >
                    Neither of these
                  </button>
                  <button
                    type="button"
                    onClick={() => choose('both')}
                    className="font-body text-[0.8rem] text-[var(--text-muted)] underline decoration-[var(--color-pearl)] underline-offset-2 hover:text-[var(--text-primary)]"
                  >
                    Both, honestly
                  </button>
                </div>
              </div>
            ) : deck.length === 0 ? (
              <div className="py-16 text-center">
                <p className="mb-2 font-heading text-[1.3rem] italic text-[var(--text-muted)]">
                  Nothing to weigh yet
                </p>
                <p className="font-body text-[0.88rem] text-[var(--text-muted)]">
                  The Engine needs a few readable pieces in the library first.
                  Check back soon.
                </p>
              </div>
            ) : (
              <div className="py-16 text-center">
                <p className="mb-2 font-heading text-[1.3rem] italic text-[var(--text-muted)]">
                  That&apos;s plenty for now
                </p>
                <p className="mb-6 font-body text-[0.88rem] text-[var(--text-muted)]">
                  Every pair sharpens how the Engine sees through your eye.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <Button variant="secondary" onClick={anotherRound}>
                    Keep going
                  </Button>
                  <Button variant="ghost" asChild>
                    {/* R21 — "Your Eye" rehoused to the People Room's rail. */}
                    <Link href="/people?view=your-eye">See your eye</Link>
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </RoomShell>
  );
}

function JudgmentCard({
  product,
  onPick,
}: {
  product: JudgmentProduct;
  onPick: () => void;
}) {
  const image = product.images?.[0];
  return (
    <button
      type="button"
      onClick={onPick}
      className="group rounded-[4px] border border-[var(--color-pearl)] bg-[var(--bg-surface)] p-3 text-left transition-colors hover:border-[var(--accent-primary)]"
    >
      <div className="aspect-[4/3] w-full overflow-hidden rounded-[3px] bg-[rgba(196,165,123,0.08)]">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-heading text-[0.95rem] italic text-[var(--text-muted)]">
            {product.name}
          </div>
        )}
      </div>
      <div className="mt-2.5">
        <span className="type-item-name block">{product.name}</span>
        {product.brand && (
          <span className="type-label-secondary">{product.brand}</span>
        )}
      </div>
    </button>
  );
}
