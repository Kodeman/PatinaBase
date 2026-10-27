import type { ReactNode } from 'react';

export interface PaperChapterProps {
  /** Chapter key: the section's DOM id and its `data-index-region` root. */
  id: string;
  /** Printed folio, e.g. "01". */
  number: string;
  title: string;
  /** The chapter's reading line, printed opposite the title. */
  kicker?: ReactNode;
  /**
   * Defaults to `${id}-chapter-heading`. A chapter standing in for an existing
   * paper region passes that region's `regionHeadingId`, so `scrollToRegion`
   * lands focus on this heading.
   */
  headingId?: string;
  children?: ReactNode;
}

/**
 * One numbered chapter of the round-8 job paper. The root is the running
 * index's region root; the heading takes programmatic focus after a jump, and
 * the scroll margin clears the sticky job head.
 */
export function PaperChapter({
  id,
  number,
  title,
  kicker,
  headingId,
  children,
}: PaperChapterProps) {
  const titleId = headingId ?? `${id}-chapter-heading`;
  return (
    <section
      id={id}
      data-index-region={id}
      data-paper-chapter={id}
      aria-labelledby={titleId}
      className="mb-[48px] scroll-mt-[calc(var(--r8-head)+24px)]"
    >
      <div className="flex flex-wrap items-baseline gap-x-[24px] gap-y-[12px] border-b border-t border-b-[var(--hairline-strong)] border-t-[var(--ink)] py-[24px]">
        <div className="flex items-baseline gap-[12px]">
          <span
            aria-hidden="true"
            className="t-authorship text-[var(--text-muted)]"
          >
            {number}
          </span>
          <h2
            id={titleId}
            tabIndex={-1}
            className="t-d1 text-[var(--text-primary)] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            {title}
          </h2>
        </div>
        {kicker ? (
          <p className="r8-small w-full text-[var(--text-muted)] min-[600px]:ml-auto min-[600px]:w-auto min-[600px]:max-w-[240px]">
            {kicker}
          </p>
        ) : null}
      </div>
      <div className="pt-[24px]">{children}</div>
    </section>
  );
}
