'use client';

/**
 * Jobs in the studio (WP-01.8): the Desk roster's live jobs, restyled as a
 * register with each job's plate. The lines, their stage order, their scope
 * and their words are the roster's own (deriveDeskRoster); the register only
 * sets them. A job's name opens its paper, as on the roster.
 */

import Link from 'next/link';
import type { RosterLine } from '@/lib/document/desk-roster-derivation';
import type { CommissionPlate } from '@/hooks/use-commission-plates';
import { DocumentAction } from '@/components/document/document-action';
import { CommissionPlateImage } from './commission-spread';

export interface RegisterRow {
  line: RosterLine;
  /** The roster group's word for the stage. */
  stageLabel: string;
  jobId: string;
}

export function registerAnchorId(engagementId: string): string {
  return `studio-job-${engagementId}`;
}

export function JobsRegister({
  rows,
  plates,
  notChecked,
  onLeave,
  onCreateProject,
}: {
  rows: readonly RegisterRow[];
  plates: ReadonlyMap<string, CommissionPlate>;
  notChecked: string | null;
  onLeave: (anchorId: string, docId: string) => void;
  onCreateProject: () => void;
}) {
  return (
    <section
      aria-labelledby="studio-jobs-head"
      data-studio-register
      className="mt-12 border-t border-[var(--ink)] pt-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2 pb-4">
        <h2 id="studio-jobs-head" className="t-d1">
          Jobs in the studio
        </h2>
        <DocumentAction
          actionKey="open-project"
          variant="tertiary"
          leading="＋"
          aria-label="Create a project file"
          onClick={onCreateProject}
        >
          Create a project file
        </DocumentAction>
      </div>
      {rows.length === 0 ? (
        <p className="t-body-sm border-t border-[var(--hairline-strong)] py-5 text-[var(--ink-faint)]">
          No live jobs in this view.
        </p>
      ) : (
        <ul>
          {rows.map(({ line, stageLabel, jobId }) => {
            const anchorId = registerAnchorId(line.engagementId);
            return (
              <li
                key={line.engagementId}
                data-studio-register-row={line.engagementId}
                className="grid grid-cols-[56px_minmax(0,1.2fr)_minmax(0,1.5fr)_150px] items-center gap-5 border-t border-[var(--hairline-strong)] py-5 max-[1179px]:grid-cols-[50px_minmax(0,1fr)_minmax(0,1.2fr)] max-[599px]:grid-cols-[44px_minmax(0,1fr)] max-[599px]:gap-x-3"
              >
                <CommissionPlateImage
                  plate={plates.get(jobId)}
                  name={line.name}
                  className="size-14 text-[24px] max-[1179px]:size-[50px] max-[599px]:size-11"
                />
                <div className="min-w-0">
                  <h3 className="t-d3 [overflow-wrap:anywhere]">
                    <Link
                      id={anchorId}
                      href={line.jobHref}
                      onClick={() => onLeave(anchorId, jobId)}
                      className="underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                    >
                      {line.name}
                    </Link>
                  </h3>
                  {line.personLine && (
                    <p className="r8-small mt-1 text-[var(--ink-faint)]">{line.personLine}</p>
                  )}
                </div>
                <p className="t-body-sm min-w-0 text-[var(--ink-faint)] [overflow-wrap:anywhere] max-[599px]:col-start-2">
                  {line.overdueText ? (
                    <span className="text-[var(--terracotta-ink)]">{line.overdueText}</span>
                  ) : (
                    (line.needText ?? line.custody)
                  )}
                </p>
                <p className="r8-small text-[var(--ink)] max-[1179px]:hidden">{stageLabel}</p>
              </li>
            );
          })}
        </ul>
      )}
      {notChecked && (
        <p className="r8-small border-t border-[var(--hairline-strong)] pt-3 text-[var(--ink-faint)]">
          {notChecked}
        </p>
      )}
    </section>
  );
}
