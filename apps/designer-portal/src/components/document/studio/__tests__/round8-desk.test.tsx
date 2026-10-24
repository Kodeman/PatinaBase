import { fireEvent, render, screen } from '@testing-library/react';
import { Round8Desk, type Round8DeskProps } from '../round8-desk';
import { AttentionList, deriveAttentionItems } from '../attention-list';
import type { DaySheet } from '@/lib/document/day-sheet';
import type { NeedLine } from '@/lib/document/desk-derivation';

jest.mock('@/hooks/use-commission-plates', () => ({
  useCommissionPlates: () => ({ plates: new Map(), isPending: false }),
}));
jest.mock('@/components/document/command-bar', () => ({ openLedger: jest.fn() }));
jest.mock('../studio-masthead', () => ({ StudioMasthead: () => null }));
jest.mock('@/components/document/overlays/capture-lead-sheet', () => ({
  CaptureLeadSheet: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="Capture inquiry" /> : null,
}));
jest.mock('@/components/document/overlays/open-project-sheet', () => ({
  OpenProjectSheet: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="New project file" /> : null,
}));

const emptySheet: DaySheet = {
  lines: [], alsoYours: [], waitingOn: [], setAside: [], standing: new Map(), empty: true, unchecked: [],
};

it('keeps Record an inquiry and Create a project file operable in an empty studio', () => {
  const setCaptureOpen = jest.fn();
  const setOpenProjectOpen = jest.fn();
  const props = {
    sheet: emptySheet, cards: [], roster: { groups: [], notChecked: null }, live: [],
    loading: false, deskEmpty: true, arrivalHeld: false, arrivalRoot: false, arrivalReady: true,
    deskRead: true, deskRoot: null, deskLine: null, isError: false, firstName: 'Leah', greetingWord: 'Good morning',
    studioName: null, viewerName: null, dateLabel: '24 October', recorded: null, scope: 'mine',
    oneVoice: true, onScope: jest.fn(), holdPlace: jest.fn(), backAnchor: null, refetch: jest.fn(),
    captureOpen: false, openProjectOpen: false, setCaptureOpen, setOpenProjectOpen, setRecorded: jest.fn(),
  } as Round8DeskProps;
  const view = render(<Round8Desk {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Record an inquiry' }));
  expect(setCaptureOpen).toHaveBeenCalledWith(true);
  fireEvent.click(screen.getByRole('button', { name: 'Create a project file' }));
  expect(setOpenProjectOpen).toHaveBeenCalledWith(true);
  view.rerender(<Round8Desk {...props} captureOpen openProjectOpen />);
  expect(screen.getByRole('dialog', { name: 'Capture inquiry' })).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'New project file' })).toBeInTheDocument();
});

it.each([false, true])('attention names destinations, not release or payment acts (oneVoice=%s)', (oneVoice) => {
  const needs: NeedLine[] = [
    { key: 'po_unsent:held', kind: 'po_unsent', text: 'Release held for the buyer.', actionLabel: 'Approve release', releaseHeld: true, stamp: { label: 'Held', color: 'ink' }, urgent: false, owner: 'designer' },
    { key: 'payment_due:invoice', kind: 'payment_due', text: 'Payment is due.', actionLabel: 'Record payment', stamp: { label: 'Due', color: 'ink' }, urgent: false, owner: 'designer' },
  ];
  const lines = needs.map((need) => ({ key: need.key, projectId: 'p1', projectName: 'Holloway Den', need })) as DaySheet['lines'];
  const items = deriveAttentionItems({ lines }, [{ jobId: 'p1', name: 'Holloway Den' }], oneVoice);
  const onLeave = jest.fn();
  render(<AttentionList items={items} unchecked={[]} scope="mine" onScope={jest.fn()} onLeave={onLeave} />);
  const links = screen.getAllByRole('link');
  expect(links).toHaveLength(2);
  for (const link of links) {
    expect(link).not.toHaveAccessibleName(/^(approve|send|record|mark|pay|release)\b/i);
    expect(link).toHaveAttribute('href', '/doc/p1');
  }
  expect(links[0]).toHaveAccessibleName('Holloway Den — Release held — Open the job');
  expect(links[1]).toHaveAccessibleName('Holloway Den — Payment due — Open the job');
  fireEvent.click(links[0]);
  expect(onLeave).toHaveBeenCalledWith(items[0]);
});
