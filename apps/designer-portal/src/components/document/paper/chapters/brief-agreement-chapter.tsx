'use client';

import { useId, type ReactNode } from 'react';

export interface BriefAgreementChapterProps {
  /** The caller supplies engagement-bound native readers, including their loading/error states. */
  brief: ReactNode;
  discovery: ReactNode;
  agreement: ReactNode;
}

/** Chapter body only: the paper frame owns chapter 01's heading and landmark. */
export function BriefAgreementChapter({ brief, discovery, agreement }: BriefAgreementChapterProps) {
  const id = useId();
  return (
    <div data-brief-agreement-chapter className="space-y-6">
      <section aria-labelledby={`${id}-brief`}>
        <h3 id={`${id}-brief`} className="t-body-sm mb-3 font-medium">Original brief</h3>
        {brief ?? <p className="t-body-sm text-[var(--text-muted)]">No original brief is linked to this document.</p>}
      </section>
      <section aria-labelledby={`${id}-discovery`}>
        <h3 id={`${id}-discovery`} className="t-body-sm mb-3 font-medium">Discovery notes</h3>
        {discovery ?? <p className="t-body-sm text-[var(--text-muted)]">No discovery notes are linked to this document.</p>}
      </section>
      <section aria-labelledby={`${id}-agreement`}>
        <h3 id={`${id}-agreement`} className="t-body-sm mb-3 font-medium">Agreement record</h3>
        {agreement ?? <p className="t-body-sm text-[var(--text-muted)]">No agreement is linked to this document.</p>}
      </section>
    </div>
  );
}
