'use client';

import type { ComponentPropsWithRef } from 'react';
import type { DocumentFrameSlots } from './frame-slots';

type ShellProps = ComponentPropsWithRef<'div'> & {
  'data-arrival'?: string;
  'data-arrival-held'?: string;
  'data-arrival-ready'?: string;
  'data-arr-engagement'?: string;
  'data-reading-index'?: string;
};
type PaperProps = ComponentPropsWithRef<'main'> & {
  'data-shelf-open'?: string;
};

export function LegacyDocumentFrame({
  slots,
  shellProps,
  paperProps,
}: {
  slots: DocumentFrameSlots;
  shellProps: ShellProps;
  paperProps: PaperProps;
}) {
  return (
    <>
      {slots.arrival}
      <div
        {...shellProps}
        data-document-shell
        data-shell-regime="single-below-1180-narrow-to-1439-full-from-1440"
        className="relative grid min-h-screen grid-cols-1 overflow-x-clip bg-[var(--doc-paper)] [grid-template-rows:auto_1fr] min-[1180px]:grid-cols-[136px_minmax(0,1fr)] min-[1180px]:[grid-template-rows:none] min-[1440px]:grid-cols-[200px_minmax(0,1fr)_232px] motion-safe:animate-[doc-raise_270ms_ease-out] motion-reduce:animate-[doc-fade_200ms_ease-out]"
      >
        {/* Paper grain at the threshold of perception */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(139,115,85,0.01) 3px, rgba(139,115,85,0.01) 4px)',
          }}
        />

        {slots.spine}
        {/* No stacking context: fixed procurement panels must escape the paper. */}
        <main
          {...paperProps}
          data-document-paper
          data-spotlight-frame
          className="w-full min-w-0 max-w-[1040px] justify-self-center px-7 pb-32 pt-8 min-[1180px]:px-10 min-[1440px]:px-12"
        >
          {slots.letterhead}
          {slots.ticketFacts}
          {slots.band}
          {slots.household}
          {slots.frontMatter}
          {slots.approvals}
          {slots.scheduleScope(
            <>
              {slots.schedule}
              {slots.activeSpread}
            </>,
          )}
          {slots.accountBand}
          {slots.kickoff}
          {slots.record}
          {slots.colophon}
        </main>
        {slots.margin}
        {slots.overlays}
      </div>
    </>
  );
}
