import { fireEvent, render, screen } from '@testing-library/react';
import { Round8Desk, type Round8DeskProps } from '../round8-desk';
import { AttentionList, deriveAttentionItems } from '../attention-list';
import { CommissionSpread, CommissionPlateImage } from '../commission-spread';
import { NextConversation } from '../next-conversation';
import { JobsRegister } from '../jobs-register';
import type { RosterLine } from '@/lib/document/desk-roster-derivation';
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
    oneVoice: true, onScope: jest.fn(), holdPlace: jest.fn(), refetch: jest.fn(),
    captureOpen: false, openProjectOpen: false, setCaptureOpen, setOpenProjectOpen, setRecorded: jest.fn(),
  } as Round8DeskProps;
  const view = render(<Round8Desk {...props} />);
  expect(screen.getByRole('heading', { level: 1, name: 'The studio, in hand.' })).toBeInTheDocument();
  expect(screen.getByText('Your jobs, resources and next conversations, kept close to the work.')).toBeInTheDocument();
  expect(screen.queryByText(/Good morning/)).not.toBeInTheDocument();
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

it('silently replaces a denied featured image with the job name and retries a changed cover', () => {
  const job = { jobId: 'p1', name: 'Lake House', personLine: '', stage: 'Design', href: '/doc/p1', itemCount: 1 };
  const props = { job, plate: { url: 'https://cdn/denied.jpg', source: 'board' as const }, onLeave: jest.fn(), attention: null };
  const view = render(<CommissionSpread {...props} />);
  fireEvent.error(view.container.querySelector('img')!);
  expect(view.container.querySelector('img')).toBeNull();
  expect(view.container.querySelector('figcaption')).toBeNull();
  expect(screen.getAllByText('Lake House')).toHaveLength(2);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open the job paper — Lake House' })).toHaveAttribute('href', '/doc/p1');
  view.rerender(<CommissionSpread {...props} plate={{ url: 'https://cdn/new.jpg', source: 'proposal' }} />);
  expect(view.container.querySelector('img')).toHaveAttribute('src', 'https://cdn/new.jpg');
  expect(view.container.querySelector('figcaption')).toHaveTextContent('Lake House · proposal cover');
});

it('silently replaces a denied register thumbnail with the job initial', () => {
  const view = render(<CommissionPlateImage plate={{ url: 'https://cdn/denied.jpg', source: 'board' }} name="Lake House" className="size-14" />);
  fireEvent.error(view.container.querySelector('img')!);
  expect(view.container.querySelector('img')).toBeNull();
  expect(screen.getByText('L')).toHaveAttribute('aria-hidden', 'true');
});

it('records the just-captured inquiry opener before opening its exact brief', () => {
  const onLeave = jest.fn();
  render(<NextConversation inquiries={[]} holderOf={jest.fn()} recorded={{ id: 'lead-1', name: 'New Inquiry' }} onRecord={jest.fn()} onLeave={onLeave} />);
  const link = screen.getByRole('link', { name: 'Open the brief — New Inquiry' });
  expect(link).toHaveAttribute('id', 'studio-recorded-lead-1');
  expect(link).toHaveAttribute('href', '/doc/lead-1');
  fireEvent.click(link);
  expect(onLeave).toHaveBeenCalledWith('studio-inquiry-lead-1', 'lead-1');
});

it('keeps register and inquiry subjects and openers separate', () => {
  const onLeave = jest.fn();
  const line = { engagementId: 'q1', projectId: 'p1', name: 'Lake House', jobHref: '/doc/p1', personLine: 'Client', needText: 'Review drawings', custody: 'With you' } as RosterLine;
  render(<>
    <JobsRegister rows={[{ line, jobId: 'p1', stageLabel: 'Project delivery' }]} plates={new Map()} notChecked={null} onLeave={onLeave} onCreateProject={jest.fn()} />
    <NextConversation inquiries={[{ ...line, engagementId: 'lead-1', projectId: null, name: 'New Inquiry', jobHref: '/doc/lead-1' }]} holderOf={() => ({ userId: null, name: null, mine: true, lead: false })} recorded={null} onRecord={jest.fn()} onLeave={onLeave} />
  </>);
  fireEvent.click(screen.getByRole('link', { name: 'Lake House' }));
  expect(onLeave).toHaveBeenLastCalledWith('studio-job-q1', 'p1');
  fireEvent.click(screen.getByRole('link', { name: 'New Inquiry' }));
  expect(onLeave).toHaveBeenLastCalledWith('studio-inquiry-lead-1', 'lead-1');
});
