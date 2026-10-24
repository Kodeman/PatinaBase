'use client';

/**
 * The commission spread (WP-01.8): the job at the top of the day, standing
 * behind its plate, beside what needs her attention. The plate is a board or
 * proposal cover only (useCommissionPlates); with none the job's name is set
 * in its place. Below 1180 the spread is one column, the picture first.
 */

import type { ReactNode } from 'react';
import type { CommissionPlate } from '@/hooks/use-commission-plates';
import { DocumentAction } from '@/components/document/document-action';

export interface FeaturedJob {
  jobId: string;
  name: string;
  personLine: string;
  stage: string;
  href: string;
  itemCount: number;
}

const PLATE_WORD: Record<CommissionPlate['source'], string> = {
  board: 'board cover',
  proposal: 'proposal cover',
};

export function CommissionPlateImage({
  plate,
  name,
  className,
}: {
  plate: CommissionPlate | undefined;
  name: string;
  className: string;
}) {
  if (plate) {
    return (
      <img
        src={plate.url}
        alt=""
        loading="lazy"
        decoding="async"
        className={`block bg-[var(--bg-warm)] object-cover ${className}`}
      />
    );
  }
  // Typographic fallback: the job's initial, set on the warm stock.
  return (
    <span
      aria-hidden="true"
      className={`grid place-items-center bg-[var(--bg-warm)] font-heading italic text-[var(--color-forest)] ${className}`}
    >
      {name.trim().charAt(0).toUpperCase() || '·'}
    </span>
  );
}

export function CommissionSpread({
  job,
  plate,
  onLeave,
  attention,
}: {
  job: FeaturedJob | null;
  plate: CommissionPlate | undefined;
  onLeave: (anchorId: string, docId: string) => void;
  attention: ReactNode;
}) {
  return (
    <div
      data-studio-spread
      className="grid grid-cols-1 items-start gap-10 min-[1180px]:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)] min-[1440px]:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]"
    >
      {job && (
        <section aria-labelledby="studio-featured-job" data-studio-featured={job.jobId}>
          <figure className="relative">
            {plate ? (
              <CommissionPlateImage
                plate={plate}
                name={job.name}
                className="aspect-[1.52] w-full max-[599px]:aspect-[1.2]"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex aspect-[1.52] w-full items-end bg-[var(--bg-warm)] p-6 font-heading text-[clamp(38px,4vw,58px)] leading-[1.15] text-[var(--ink)] max-[599px]:aspect-[1.2]"
              >
                {job.name}
              </span>
            )}
            {plate && (
              <figcaption className="r8-small absolute bottom-3 left-4 bg-[var(--paper)] px-2 py-1">
                {`${job.name} · ${PLATE_WORD[plate.source]}`}
              </figcaption>
            )}
          </figure>
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-[var(--hairline-strong)] pb-5 pt-6">
            <div className="min-w-0">
              <h2 id="studio-featured-job" className="t-d1 [overflow-wrap:anywhere]">
                {job.name}
              </h2>
              {job.personLine && (
                <p className="t-body-sm mt-2 text-[var(--ink-faint)]">{job.personLine}</p>
              )}
            </div>
            <DocumentAction
              id="studio-featured-open"
              actionKey="studio-open-job-paper"
              variant="secondary"
              href={job.href}
              onClick={() => onLeave('studio-featured-open', job.jobId)}
              aria-label={`Open the job paper — ${job.name}`}
            >
              Open the job paper
            </DocumentAction>
          </div>
          <p className="r8-small flex flex-wrap gap-x-6 gap-y-2 pt-4 text-[var(--ink-faint)]">
            <span>
              <b className="font-medium text-[var(--ink)]">{job.stage}</b>
            </span>
            {job.itemCount > 0 && (
              <span>
                <b className="font-medium text-[var(--ink)]">
                  {`${job.itemCount} ${job.itemCount === 1 ? 'line' : 'lines'}`}
                </b>{' '}
                on the furnishing schedule
              </span>
            )}
          </p>
        </section>
      )}
      <div className={job ? undefined : 'min-[1180px]:col-span-2'}>{attention}</div>
    </div>
  );
}
