/**
 * Shaped placeholders for the rooms that already speak while they load
 * (US-34 F13d–f; US-33 D1 §2 and §5): the Library, Studio design boards, a
 * design board, the Drafting Room and the match ceremony.
 *
 * Each room keeps today's loader words, and the Library keeps its
 * StrataSweep, word for word and in the place the room prints them. Retiring
 * them is N10's, behind `loading-register` (PQ6, PQ7). What these add is the
 * room's geometry around the words and `aria-busy` on the region.
 *
 * The frame is drawn with the room's own classes and measure, so nothing
 * moves when it lands (D1.19). Data lines are filled pearl bars hidden from
 * assistive technology (H2); inputs, tabs and buttons are bars until the room
 * hydrates (H3). No count is printed as a number.
 */

import Link from "next/link";
import { StrataSweep } from "@/components/ui/strata-sweep";
import { Bar, LoadingRegion } from "./placeholder";
import { ActBar, Ornament, RoomFrameSkeleton } from "./room-skeletons";

/** A plate: a filled 3:2 block (never the hollow `.plate` frame) and its caption. */
function PlateSkeleton({ hideOnPhone }: { hideOnPhone: boolean }) {
  return (
    <li className={hideOnPhone ? "min-w-0 max-sm:hidden" : "min-w-0"}>
      <span className="ph-block block aspect-[3/2] w-full" />
      <p className="t-d4 mt-3">
        <Bar width="70%" height={10} />
      </p>
      <p className="t-meta mt-1">
        <Bar width="45%" height={7} />
      </p>
    </li>
  );
}

/** One row of plates: `count` at 1440, `phone` at 390. */
function PlatesSkeleton({
  count,
  phone,
  className = "plates",
}: {
  count: number;
  phone: number;
  className?: string;
}) {
  return (
    <div className="plates-wrap" aria-hidden="true">
      <ul className={className}>
        {Array.from({ length: count }, (_, i) => (
          <PlateSkeleton key={i} hideOnPhone={i >= phone} />
        ))}
      </ul>
    </div>
  );
}

// ── Library (F13d) ───────────────────────────────────────────────────────────

/**
 * library-room.tsx and library-shelf.tsx. The Room opens on the "all" lens,
 * so the shelf's name, meta and sweep label are known before any read.
 */
export function LibrarySkeleton() {
  return (
    <RoomFrameSkeleton
      label="Loading the library."
      title="Resource library"
      measure="mx-auto max-w-[1240px] px-4 sm:px-9"
      count
      action={104}
    >
      <div className="mx-auto max-w-[1240px] px-4 sm:px-9">
        <div className="library-filters-wrap" aria-hidden="true">
          <div className="filters library-filters">
            <div className="library-filter-run">
              <span className="library-flabel">Shelf</span>
              {[64, 72, 88, 80].map((width, i) => (
                <ActBar key={i} width={width} />
              ))}
            </div>
            <div className="library-filter-run">
              <span className="library-flabel">Type</span>
              {[40, 72, 64].map((width, i) => (
                <ActBar key={i} width={width} />
              ))}
            </div>
          </div>
        </div>

        <section className="section library-shelf">
          <div className="sec-head">
            <p className="eb">
              <Ornament />
              <span>All shelves</span>
            </p>
            <p className="t-body-sm library-shelf-meta">
              Your captures, the studio&apos;s products and the Patina catalog
            </p>
          </div>
          {/* Today's shelf loader, word for word (library-shelf.tsx). */}
          <div className="flex items-center gap-2 py-6">
            <StrataSweep size="sm" label="Reading All shelves" />
            <span className="t-meta library-shelf-meta">reading the shelf…</span>
          </div>
          <PlatesSkeleton
            count={8}
            phone={4}
            className="plates library-plates"
          />
        </section>
      </div>
    </RoomFrameSkeleton>
  );
}

// ── Studio design boards (F13e) ──────────────────────────────────────────────

/**
 * studio-boards-view.tsx while its overview is read: the real frame, its two
 * loader lines, then one job Section of plates (4 at 1440, 2 at 390).
 * "← Studio overview" is a plain link, so it may be pressed at once (H3).
 */
export function StudioBoardsSkeleton() {
  return (
    <LoadingRegion
      as="main"
      label="Loading the studio's design boards."
      className="min-h-screen bg-[var(--doc-paper)] text-[var(--text-primary)]"
    >
      <div className="mx-auto max-w-[1100px] px-4 pb-16 md:px-8">
        <header className="hline">
          <div className="hline-l">
            <Link
              href="/desk"
              className="inline-flex min-h-11 items-center t-meta uppercase text-[var(--text-muted)] hover:text-[var(--color-clay-ink)]"
            >
              ← Studio overview
            </Link>
            <h1 className="t-d2">Studio design boards</h1>
            <p className="t-meta uppercase text-[var(--text-subtle)]">
              Loading design boards…
            </p>
          </div>
        </header>
        <div className="rule-strong" />
        <p
          role="status"
          aria-live="polite"
          className="t-meta uppercase text-[var(--text-subtle)]"
        >
          Reading the boards…
        </p>
        <section className="section" aria-hidden="true">
          <div className="sec-head">
            <p className="eb">
              <Ornament />
              <Bar width={140} height={7} />
            </p>
          </div>
          <PlatesSkeleton count={4} phone={2} />
        </section>
      </div>
    </LoadingRegion>
  );
}

// ── A design board (F13e) ────────────────────────────────────────────────────

/**
 * board-room-shell.tsx's chrome-less room: the Header line (the way back, the
 * board's name, its acts) over the open canvas. No words today, none added.
 * Shared by `board/[boardId]/loading.tsx` and the page's pending branch.
 */
export function MoodBoardSkeleton() {
  return (
    <LoadingRegion
      as="main"
      aria-label="Loading mood board"
      label="Loading the design board."
      className="fixed inset-0 flex h-[100dvh] flex-col overflow-hidden overscroll-contain bg-[var(--bg-primary)]"
    >
      <header className="br-head relative shrink-0" aria-hidden="true">
        <div className="hline br-hline">
          <div className="hline-l br-hline-l">
            <ActBar width={112} />
            <span className="br-name-wrap inline-flex min-h-11 items-center">
              <Bar width={220} height={14} />
            </span>
          </div>
          <div className="hline-r br-hline-r">
            <ActBar width={48} />
            <ActBar width={64} />
            <ActBar width={104} />
          </div>
        </div>
        <div className="rule-strong br-rule" role="presentation" />
      </header>
      <div className="min-h-0 flex-1 bg-[var(--bg-muted)]" />
    </LoadingRegion>
  );
}

// ── Drafting Room (F13f) ─────────────────────────────────────────────────────

/**
 * drafting-room.tsx: RoomShell with the proposal's title block as its head,
 * the drafted-words line, and the papers grid (facets, and at 1440 the
 * client's copy). The gate's words sit on the drafted-words line.
 */
export function DraftingSkeleton() {
  return (
    <RoomFrameSkeleton
      label="Loading the draft."
      title="Proposal drafting"
      heading={
        <div className="title-rule st-proposal papers-tblock">
          <p className="t-meta">
            <Bar width={112} height={7} />
          </p>
          <p className="t-d2">
            <Bar width={280} height={20} />
          </p>
        </div>
      }
      measure="mx-auto max-w-[1240px] px-4 sm:px-8"
      back
      action={88}
      actionAtEveryWidth
    >
      <div className="papers-ground">
        <div className="mx-auto max-w-[1240px] px-4 sm:px-8">
          <div className="papers-drafted">
            {/* Today's gate words, word for word (drafting-room.tsx). */}
            <p className="doc-type-body text-[var(--color-quiet-ink)]">
              Opening the draft…
            </p>
          </div>
          <div className="papers-grid" aria-hidden="true">
            <div className="min-w-0">
              {[0, 1].map((movement) => (
                <section key={movement} className="section">
                  <div className="sec-head">
                    <p className="eb">
                      <Ornament />
                      <Bar width={120} height={7} />
                    </p>
                  </div>
                  {[0, 1, 2, 3].map((facet) => (
                    <div
                      key={facet}
                      className="flex min-h-11 items-center justify-between gap-4 border-b border-[var(--color-pearl)] py-3"
                    >
                      <Bar width={facet % 2 ? 148 : 112} height={10} />
                      <Bar width={facet % 2 ? 96 : 120} height={7} />
                    </div>
                  ))}
                </section>
              ))}
            </div>
            <aside className="hidden min-[1440px]:block">
              <p className="papers-copy-eb">
                <Bar width={128} height={7} />
              </p>
              <span className="ph-block block h-[420px] w-full" />
            </aside>
          </div>
        </div>
      </div>
    </RoomFrameSkeleton>
  );
}

// ── The match ceremony (F13f) ────────────────────────────────────────────────

/**
 * ceremony-surface.tsx: the claimed line, the brief's title block, then the
 * arrival beside the designer's hand. The introduction is a field, so it is
 * drawn as a filled block until the surface hydrates (H3). "Arriving…" stands
 * in the claimed line's place.
 */
export function CeremonySkeleton() {
  return (
    <LoadingRegion
      label="Loading the match ceremony."
      className="min-h-screen bg-[var(--doc-paper)]"
    >
      <div className="mx-auto max-w-[1120px] px-6 pb-24 pt-10 sm:px-9 sm:pt-14">
        {/* Today's words, word for word (ceremony-surface.tsx). */}
        <p className="mb-9 font-heading text-[14px] italic text-[var(--text-muted)]">
          Arriving…
        </p>
        <header className="mb-10 title-rule st-brief">
          <p className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-primary)]">
            Brief · the match ceremony
          </p>
          <p className="font-heading text-[34px] leading-[1.12] sm:text-[44px]">
            <Bar width={260} height={24} />
          </p>
          <p className="mt-2.5 font-heading text-[17px] italic text-[var(--color-mocha)]">
            One send: your introduction and two or three times. Then the
            Document begins.
          </p>
        </header>
        <div
          className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14"
          aria-hidden="true"
        >
          <div>
            <span className="ph-block block aspect-[4/3] w-full" />
            <p className="mt-4">
              <Bar width="60%" height={10} />
            </p>
            <p className="mt-2">
              <Bar width="40%" height={7} />
            </p>
          </div>
          <div>
            <p className="border-b border-[var(--color-pearl)] pb-2.5">
              <Bar width="70%" height={7} />
            </p>
            <span className="ph-block mt-4 block min-h-[190px] w-full" />
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}

// ── Leaves under a shaped room ───────────────────────────────────────────────

/**
 * A quiet busy sheet for a leaf route whose parent has its own fallback
 * (`library/[id]`, `library/judgments`, `room/[id]/file`, the finishes print).
 * Without it the leaf would wear its parent's skeleton, the wrong shape.
 */
export function QuietLoading({ label }: { label: string }) {
  return <LoadingRegion as="main" label={label} />;
}
