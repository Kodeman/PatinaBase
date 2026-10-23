import Link from 'next/link';
import type { ReactNode } from 'react';

export interface JobHeadProps {
  /** Where "←" goes, labelled by the origin the job was opened from. */
  returnTo: { href: string; label: string };
  jobName: string;
  /** One context line; hidden below 1180px. */
  context?: ReactNode;
}

/**
 * The round-8 job head: the sticky band over the paper. The job name is the
 * band's title, not a heading; the paper's cover carries the h1.
 */
export function JobHead({ returnTo, jobName, context }: JobHeadProps) {
  return (
    <header
      data-job-head=""
      className="sticky top-0 z-30 flex min-h-[var(--r8-head)] items-center gap-[12px] border-b border-[var(--hairline-strong)] bg-[var(--paper)] px-[18px] min-[600px]:gap-[24px] min-[600px]:px-[4%]"
    >
      <Link
        href={returnTo.href}
        data-job-head-return=""
        className="t-body-sm inline-flex min-h-[44px] shrink-0 items-center gap-[6px] text-[var(--text-primary)] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        <span aria-hidden="true">←</span>
        {returnTo.label}
      </Link>
      <span
        aria-hidden="true"
        className="h-[20px] shrink-0 border-l border-[var(--hairline-strong)]"
      />
      <p className="t-body-sm min-w-0 [overflow-wrap:anywhere] font-medium text-[var(--text-primary)]">
        {jobName}
      </p>
      {context ? (
        <p className="r8-small hidden min-w-0 [overflow-wrap:anywhere] text-[var(--text-muted)] min-[1180px]:block">
          {context}
        </p>
      ) : null}
    </header>
  );
}
