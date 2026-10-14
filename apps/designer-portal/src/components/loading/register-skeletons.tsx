/**
 * The Desk and the Document under the loading register (US-34 N10; US-33 D1
 * §5, Q "Quiet paper", arrival C). Shared by their `loading.tsx` and by the
 * pages' own pending branches, so the route fallback, the held state and the
 * data land in one shape: no word, then shape, then content.
 *
 * Frame text and plain links are real; every data line is a filled pearl bar
 * (H2), and acts are bars until the page hydrates (H3). No loader words: the
 * only words are the slow and stall line (PQ7). Under arrival C this skeleton
 * IS the arrival: the paper is never hidden while it waits (PQ3).
 */

import Link from 'next/link';
import { Bar, LoadingRegion } from './placeholder';
import { SlowLine } from './register';
import { ActBar, Ornament } from './room-skeletons';

// ── The Desk ─────────────────────────────────────────────────────────────────

/** One Today card: slug, the job's act at display height, two body lines, the holder. */
function TodayCardSkeleton({ hideOnPhone }: { hideOnPhone: boolean }) {
  return (
    <div className={hideOnPhone ? 'card max-sm:hidden' : 'card'}>
      <p className="t-meta">
        <Bar width="40%" height={7} />
      </p>
      <p className="mt-3 font-heading text-[20px] leading-[26px]">
        <Bar width="80%" height={14} />
      </p>
      <p className="mt-3 t-body-sm">
        <Bar width="92%" height={8} />
      </p>
      <p className="mt-1 t-body-sm">
        <Bar width="64%" height={8} />
      </p>
      <p className="mt-4 mb-3 t-meta">
        <Bar width="36%" height={7} />
      </p>
    </div>
  );
}

/**
 * The Desk's roster while it reads: Today's eyebrow over three filled cards
 * (two at 390), then the ledger's eyebrow and five rows (three at 390). The
 * hollow `.desk-loading-frame`s this replaces read as three empty boards.
 */
export function DeskTodaySkeleton({ dateLabel }: { dateLabel?: string | null }) {
  return (
    // The busy region is the block the roster replaces, as today's frames were:
    // the walkthrough's anchor and the arrival's held mark stay on the same node.
    <section
      className="section"
      aria-busy="true"
      data-loading-region
      data-tour-anchor="desk-needs-your-hand"
    >
      <span className="sr-only">Loading today’s lines.</span>
      <div>
        <div className="sec-head">
          <p className="eb">
            <Ornament />
            <span>{dateLabel ? `${dateLabel} · Today` : 'Today'}</span>
          </p>
        </div>
        <div className="cards-wrap" aria-hidden="true">
          <div className="cards">
            {[0, 1, 2].map((i) => (
              <TodayCardSkeleton key={i} hideOnPhone={i >= 2} />
            ))}
          </div>
        </div>
      </div>
      <div className="mt-[72px] max-sm:mt-12" aria-hidden="true">
        <div className="sec-head">
          <p className="eb">
            <Ornament />
            <Bar width={120} height={7} />
          </p>
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`flex min-h-11 items-center justify-between gap-4 border-b border-[var(--color-pearl)] py-3${i >= 3 ? ' max-sm:hidden' : ''}`}
          >
            <Bar width={i % 2 ? 168 : 136} height={10} />
            <span className="hidden sm:inline">
              <Bar width={96} height={7} />
            </span>
            <Bar width={i % 2 ? 72 : 88} height={7} />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The whole Desk before its chunk lands (`desk/loading.tsx`): the page's own
 * measure, the greeting and its acts as bars, then the roster.
 */
export function DeskSkeleton() {
  return (
    <main className="relative mx-auto w-full max-w-[1120px] px-[clamp(1.5rem,5vw,4rem)] pb-28 pt-14">
      <header
        className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 pb-3"
        aria-hidden="true"
      >
        <p className="font-heading text-[1.7rem] font-normal">
          <Bar width={220} height={18} />
        </p>
        <span className="flex gap-4">
          <ActBar width={140} />
          <ActBar width={160} />
        </span>
      </header>
      <SlowLine />
      <DeskTodaySkeleton />
    </main>
  );
}

// ── The Document ─────────────────────────────────────────────────────────────

/** A region of the paper: ornament, head, count, and its quiet reserve. */
function RegionSkeleton({ head, exc }: { head: string; exc?: boolean }) {
  return (
    <section className="section">
      <div className="sec-head">
        <p className="eb">
          <Ornament />
          <Bar width={head} height={7} />
        </p>
        <p className="t-meta">
          <Bar width="34%" height={7} />
        </p>
      </div>
      <div
        style={{
          minHeight: exc
            ? 'var(--doc-quiet-reserve-exc, 112px)'
            : 'var(--doc-quiet-reserve-min, 68px)',
        }}
      />
    </section>
  );
}

/**
 * The Document's paper while it is picked up (`doc/[id]/loading.tsx`, the
 * page's `!hydrated` guard and its held state). The shell's own grid: the rail
 * from 1180, the margin from 1440. "← Back to studio overview" is a plain
 * link, so it may be pressed at once.
 */
export function DocumentSkeleton() {
  return (
    <LoadingRegion
      label="Loading the document."
      className="relative grid min-h-screen grid-cols-1 overflow-x-clip bg-[var(--doc-paper)] min-[1180px]:grid-cols-[136px_minmax(0,1fr)] min-[1440px]:grid-cols-[200px_minmax(0,1fr)_232px]"
    >
      <aside className="hidden min-[1180px]:block border-r border-[var(--color-pearl)] px-4 py-8">
        <Link
          href="/desk"
          className="inline-flex min-h-11 items-center t-meta uppercase text-[var(--text-muted)] hover:text-[var(--color-clay-ink)]"
        >
          ← Back to studio overview
        </Link>
        <div className="mt-6" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex min-h-11 flex-col justify-center gap-1.5">
              <Bar width={i === 0 ? '82%' : '70%'} height={8} />
              <Bar width="44%" height={6} />
            </div>
          ))}
        </div>
      </aside>

      <div className="relative min-w-0 px-4 pb-24 pt-8 sm:px-10 sm:pt-12" data-paper-skeleton>
        <SlowLine />
        <div aria-hidden="true">
          <p className="t-meta flex items-center gap-2">
            <span className="uppercase text-[var(--text-subtle)]">Next —</span>
            <Bar width="52%" height={7} />
          </p>
          <p className="mt-6 t-meta">
            <Bar width="30%" height={7} />
          </p>
          <p className="mt-2 t-d2">
            <Bar width="58%" height={20} />
          </p>
          <div className="mt-4 flex flex-wrap gap-4">
            <ActBar width={180} />
            <ActBar width={140} />
          </div>
          <div className="flex flex-wrap gap-4">
            <ActBar width={120} />
            <ActBar width={96} />
          </div>
          <RegionSkeleton head="28%" />
          <RegionSkeleton head="22%" exc />
          <RegionSkeleton head="25%" />
        </div>
      </div>

      <aside className="hidden min-[1440px]:block px-5 py-12" aria-hidden="true">
        <p className="t-meta uppercase text-[var(--text-subtle)]">In the margin</p>
        {[0, 1].map((i) => (
          <div key={i} className="mt-4 border-t border-[var(--color-pearl)] pt-3">
            <Bar width="70%" height={8} />
            <Bar width="48%" height={7} style={{ display: 'block', marginTop: 8 }} />
          </div>
        ))}
      </aside>
    </LoadingRegion>
  );
}
