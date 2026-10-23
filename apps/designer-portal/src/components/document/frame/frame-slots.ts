import type {
  ComponentProps,
  ComponentPropsWithRef,
  ReactNode,
  Dispatch,
  SetStateAction,
} from 'react';
import type { DaySheet } from '@/components/document/day-sheet';
import type { DeskRoster } from '@/components/document/desk-roster';
import type { CapturedLead } from '@/components/document/overlays/capture-lead-sheet';

export interface DocumentFrameSlots {
  letterhead: ReactNode;
  band: ReactNode;
  approvals: ReactNode;
  schedule: ReactNode;
  activeSpread: ReactNode;
  accountBand: ReactNode;
  kickoff: ReactNode;
  record: ReactNode;
  colophon: ReactNode;
  margin: ReactNode;
  overlays: ReactNode;
  spine: ReactNode;
  arrival: ReactNode;
  ticketFacts: ReactNode;
  household: ReactNode;
  frontMatter: ReactNode;
  /** Preserves the shared schedule/ripple provider ancestry of both surfaces. */
  scheduleScope: (children: ReactNode) => ReactNode;
  chapters?: Partial<
    Record<
      | 'brief'
      | 'design'
      | 'cabinetry'
      | 'approvals'
      | 'schedule'
      | 'ffe'
      | 'site'
      | 'financials'
      | 'closeout'
      | 'record',
      ReactNode
    >
  >;
}

type TodaySlots = ComponentProps<typeof DaySheet>;
type LedgerSlots = ComponentProps<typeof DeskRoster>;

export interface DeskFrameSlots
  extends TodaySlots, Omit<LedgerSlots, 'belowHead'> {
  recorded: CapturedLead | null;
  deskLine: ReactNode;
  loading: boolean;
  loadingRegister: boolean;
  deskEmpty: boolean;
  arrivalHeld: boolean;
  arrivalRoot: boolean;
  arrivalReady: boolean;
  deskRead: boolean;
  deskRoot: ComponentPropsWithRef<'main'>['ref'];
  notePress: ComponentProps<'main'>['onClickCapture'];
  firstName: string | null;
  greetingWord: string;
  isError: boolean;
  refetch: () => unknown;
  captureOpen: boolean;
  setCaptureOpen: Dispatch<SetStateAction<boolean>>;
  openProjectOpen: boolean;
  setOpenProjectOpen: Dispatch<SetStateAction<boolean>>;
  setRecorded: Dispatch<SetStateAction<CapturedLead | null>>;
}
