'use client';

/**
 * The round-8 job paper (WP-01.5, R8-02). Loaded only through `next/dynamic`
 * once the renderer latch settles on `round8`, so the legacy route never
 * downloads this frame or `round8.css`.
 *
 * It takes the SAME slot elements the legacy frame does, built once by the
 * page (one data path), and keeps the shell DOM contract (dom-contract.md):
 * `data-document-shell`, `data-shell-regime`, `data-arrival*`,
 * `data-reading-index`, the `<main data-document-paper data-spotlight-frame>`
 * paper and LensBand's `#doc-ticket-sentinel`.
 *
 * A project job is one continuous paper: the frame places the page's pieces
 * (built once, every read made by the page) as chapters, and every chapter
 * with content mounts, in `ROUND8_PAPER_ORDER`. Lead and proposal documents
 * print their current pre-work regions inside the same frame. DocSpine is not rendered;
 * its section ladder is the contents margin, its stage doors are the chapter
 * sub-labels and its room-in-hand release stands under the job head.
 */

import '@/components/document/paper/round8.css';
import {
  Fragment,
  useEffect,
  useState,
  type ComponentProps,
  type ComponentType,
  type DragEvent,
  type ReactNode,
} from 'react';
import {
  ContentsMargin,
  type ContentsEntry,
} from '@/components/document/paper/contents-margin';
import { openUnfold } from '@/components/document/paper/unfold-instrument';
import { registerUnfoldOpener } from '@/components/document/paper/unfold-bridge';
import type { WorkRoom } from '@/components/document/paper/chapters/ffe-work-room';
import { BriefAgreementChapter, type BriefAgreementChapterProps } from '@/components/document/paper/chapters/brief-agreement-chapter';
import { FfeChapter } from '@/components/document/paper/chapters/ffe-chapter';
import { Round8MarginContext } from '@/components/document/paper/margin-layout';
import { JobHead } from '@/components/document/paper/job-head';
import { PaperChapter } from '@/components/document/paper/paper-chapter';
import type { DocumentIndexKey } from '@/lib/document/document-index';
import {
  ROUND8_PAPER_ORDER,
  type Round8ChapterKey,
} from '@/lib/document/round8-paper-order';
import {
  paperOriginHref,
  paperOriginLabel,
  readPaperOrigin,
  subscribePaperOrigin,
} from '@/lib/document/paper/paper-origin';
import type { DocumentFrameSlots } from './frame-slots';
import type { LegacyDocumentFrame } from './legacy-document-frame';

type LegacyFrameProps = ComponentProps<typeof LegacyDocumentFrame>;

export interface Round8Contents {
  /** DocSpine's stage readings, keyed by the legacy region a chapter carries. */
  subLabels: Partial<Record<DocumentIndexKey, string>>;
  /** A pre-work document's own regions (the non-continuous contents). */
  regions: readonly { key: string; label: string }[];
  mountedKeys: readonly string[];
  activeKey: string | null;
  onSelect: (key: string) => void;
}

/** The page's hoisted spread pieces — one data path, printed by one frame. */
export interface Round8Pieces {
  /** The spread the stage pieces belong to: 'install' | 'care' | the project. */
  section: string;
  /** The stage sub-label and live workflow tracks (SectionStageLineMount):
   *  the head of the Schedule chapter. */
  stageLine: ReactNode;
  /** The active section's file-drop host (R24), hung on the FF&E chapter
   *  whose install and care bodies print the folio strip it feeds. */
  fileDrop: {
    onDragOver: (event: DragEvent<HTMLElement>) => void;
    onDragLeave: () => void;
    onDrop: (event: DragEvent<HTMLElement>) => void;
  };
  brief: BriefAgreementChapterProps | null;
  roomFiles: ReactNode;
  design?: (workRoom: WorkRoom) => ReactNode;
  /** 03 Cabinetry (CP-01): the GC-bought cabinet packages, gated by the page. */
  cabinetry?: ReactNode;
  scheduleSpine: ReactNode;
  visits: ReactNode;
  projectFfe: ReactNode;
  projectMoney: ReactNode;
  projectCare: ReactNode;
  installFfe: ReactNode;
  installCeremony: ReactNode;
  installMoney: ReactNode;
  installCare: ReactNode;
  careSection: ReactNode;
  careFfe: ReactNode;
  careMoney: ReactNode;
}

/** A page-owned gate: mounts its chapter only when the piece has content. */
export type Round8Gate = ComponentType<{ projectId: string; children: ReactNode }>;

export interface Round8PaperFrameProps {
  slots: DocumentFrameSlots;
  shellProps: LegacyFrameProps['shellProps'];
  paperProps: LegacyFrameProps['paperProps'];
  docId: string;
  /** Told once this frame has committed: the page's one-shot landings (the
   *  Desk act token) wait for it, not for the lazy chunk's request. */
  onCommitted: (committed: boolean) => void;
  jobName: string;
  /** One context line for the job head (hidden below 1180px). */
  context?: ReactNode;
  /** A project job's pieces: one continuous paper of chapters (R8-02). Null
   *  prints the pre-work regions. */
  pieces: Round8Pieces | null;
  gates: Partial<Record<Round8ChapterKey, Round8Gate>>;
  projectId: string | null;
  contents: Round8Contents;
  roomInHand: { name: string; onRelease: () => void } | null;
}

/*
 * Each chapter wraps existing pieces only. A chapter with nothing to carry is
 * not given a body, so it does not mount (03 Cabinetry mounts behind the
 * page's cabinetry gate). The stage pieces follow the spread the legacy paper
 * would print.
 */
function chapterBodies(
  slots: DocumentFrameSlots,
  pieces: Round8Pieces,
  workRoom: WorkRoom,
): Partial<Record<Round8ChapterKey, ReactNode>> {
  const stage = <T,>(project: T, install: T, care: T) =>
    pieces.section === 'install' ? install : pieces.section === 'care' ? care : project;
  return {
    brief: pieces.brief ? <BriefAgreementChapter {...pieces.brief} /> : null,
    design: pieces.design ? pieces.design(workRoom) : pieces.roomFiles,
    cabinetry: pieces.cabinetry,
    approvals: slots.approvals,
    schedule: (
      <>
        {pieces.stageLine}
        {slots.schedule}
        {stage(pieces.scheduleSpine, null, null)}
      </>
    ),
    ffe: stage(pieces.projectFfe, pieces.installFfe, pieces.careFfe),
    site: pieces.visits,
    financials: (
      <>
        {stage(pieces.projectMoney, pieces.installMoney, pieces.careMoney)}
        {slots.accountBand}
      </>
    ),
    closeout: stage(
      pieces.projectCare,
      <>
        {pieces.installCeremony}
        {pieces.installCare}
      </>,
      pieces.careSection,
    ),
    record: slots.record,
  };
}

export default function Round8PaperFrame({
  slots,
  shellProps,
  paperProps,
  docId,
  onCommitted,
  jobName,
  context,
  pieces,
  gates,
  projectId,
  contents,
  roomInHand,
}: Round8PaperFrameProps) {
  // Mounted after hydration only (the page holds the first paint), so the
  // tab's remembered origin can be read here.
  const [origin, setOrigin] = useState(() => readPaperOrigin(docId));
  useEffect(() => {
    const refresh = () => setOrigin(readPaperOrigin(docId));
    const unsubscribe = subscribePaperOrigin(docId, refresh);
    refresh();
    return unsubscribe;
  }, [docId]);
  useEffect(() => {
    onCommitted(true);
  }, [onCommitted]);
  // Shared legacy-path code (the margin) unfolds this paper through the bridge.
  useEffect(() => registerUnfoldOpener(docId, openUnfold), [docId]);
  const workRoom: WorkRoom = (room, lens = 'spec', opener = document.activeElement) => {
    openUnfold(
      { kind: 'pieces', lens, room, line: null },
      { documentId: docId, chapter: 'design', room, lens },
      opener,
    );
  };
  const chapters = pieces ? chapterBodies(slots, pieces, workRoom) : {};
  // Contents: the ten chapters (the margin filters them to the mounted ones),
  // each sub-labelled with the stage reading DocSpine's ladder printed; a
  // pre-work document lists its own regions.
  const entries: readonly ContentsEntry[] = pieces
    ? ROUND8_PAPER_ORDER.map(({ key, number, label, region }) => ({
        key,
        number,
        label,
        subLabel: region ? contents.subLabels[region] : undefined,
      }))
    : contents.regions;

  const paperBody = pieces ? (
    <>
      {slots.kickoff}
      {slots.scheduleScope(
        <>
          {ROUND8_PAPER_ORDER.map((chapter) => {
            const body = chapters[chapter.key];
            if (body == null || body === false) return null;
            const printed = (
              <PaperChapter
                key={chapter.key}
                id={chapter.key}
                number={chapter.number}
                title={chapter.label}
              >
                {chapter.key === 'ffe' ? <FfeChapter docId={docId}>{body}</FfeChapter> : body}
              </PaperChapter>
            );
            const hosted =
              chapter.key === 'ffe' ? (
                <div data-section-file-drop="" {...pieces.fileDrop}>
                  {printed}
                </div>
              ) : (
                printed
              );
            const Gate = gates[chapter.key];
            return Gate && projectId ? (
              <Gate key={chapter.key} projectId={projectId}>
                {hosted}
              </Gate>
            ) : (
              <Fragment key={chapter.key}>{hosted}</Fragment>
            );
          })}
        </>,
      )}
    </>
  ) : (
    <>
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
    </>
  );

  return (
    <>
      {slots.arrival}
      <Round8MarginContext.Provider value={true}>
      <div
        {...shellProps}
        data-document-shell
        data-shell-regime="single-below-1180-narrow-to-1439-full-from-1440"
        data-paper-renderer="round8"
        className="relative min-h-screen overflow-x-clip bg-[var(--paper)] motion-safe:animate-[doc-raise_270ms_ease-out] motion-reduce:animate-[doc-fade_200ms_ease-out]"
      >
        <JobHead
          returnTo={{ href: paperOriginHref(origin), label: paperOriginLabel(origin) }}
          origin={origin}
          jobName={jobName}
          context={context}
        />
        {roomInHand ? (
          <p
            data-job-room-in-hand=""
            className="t-body-sm sticky top-[var(--r8-head)] z-20 flex min-h-[44px] items-center gap-[12px] border-b border-[var(--hairline-strong)] bg-[var(--paper)] px-[18px] text-[var(--text-primary)] min-[600px]:px-[4%]"
          >
            <span className="min-w-0 [overflow-wrap:anywhere]">
              Room in hand: {roomInHand.name}
            </span>
            <button
              type="button"
              data-job-release-room=""
              onClick={roomInHand.onRelease}
              className="min-h-[44px] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              Release the room
            </button>
          </p>
        ) : null}
        <div data-paper-grid="" className="mx-auto grid w-full max-w-[var(--r8-paper-measure)] grid-cols-1 gap-[var(--r8-paper-gap)] px-[18px] pt-[24px] min-[600px]:px-[4%] min-[1180px]:grid-cols-[minmax(0,1fr)_var(--r8-contents)] ">
          {/* No stacking context: fixed procurement panels must escape the paper. */}
          <main
            {...paperProps}
            data-document-paper
            data-spotlight-frame
            className="w-full min-w-0 pb-32"
          >
            <div data-paper-cover="">
              {slots.letterhead}
              {slots.ticketFacts}
              {slots.band}
              {slots.household}
              {slots.frontMatter}
            </div>
            {paperBody}
            {slots.colophon}
          </main>
          <ContentsMargin
            entries={entries}
            mountedKeys={contents.mountedKeys}
            activeKey={contents.activeKey}
            onSelect={contents.onSelect}
          >
            {slots.margin}
          </ContentsMargin>
        </div>
        {slots.overlays}
      </div>
      </Round8MarginContext.Provider>
    </>
  );
}
