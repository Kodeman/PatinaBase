import { createContext, createRef, useContext, type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { LegacyDocumentFrame } from '../legacy-document-frame';
import { LegacyDeskBody } from '../legacy-desk-body';
import type { DeskFrameSlots, DocumentFrameSlots } from '../frame-slots';

jest.mock('@/components/document/day-sheet', () => ({
  DaySheet: (props: Record<string, unknown>) => {
    mockToday(props);
    return <section data-slot="today" />;
  },
}));
jest.mock('@/components/document/desk-roster', () => ({
  DeskRoster: (props: { belowHead: ReactNode }) => {
    mockRoster(props);
    return <section data-slot="ledger">{props.belowHead}</section>;
  },
}));
jest.mock('@/components/loading', () => ({
  DeskTodaySkeleton: () => <div data-slot="loading" />,
}));
jest.mock('@/components/document/desk-contents', () => ({
  DeskContents: () => <div data-slot="contents" />,
}));
jest.mock('@/components/document/recent-boards-strip', () => ({
  RecentBoardsStrip: () => <div data-slot="boards" />,
}));
jest.mock('@/components/document/desk-boards-reaction-rollup', () => ({
  DeskBoardsReactionRollup: () => <div data-slot="reactions" />,
}));
jest.mock('@/components/document/overlays/capture-lead-sheet', () => ({
  CaptureLeadSheet: () => <div data-slot="capture" />,
}));
jest.mock('@/components/document/overlays/open-project-sheet', () => ({
  OpenProjectSheet: () => <div data-slot="project" />,
}));
jest.mock('@/components/document/command-bar', () => ({
  openCommandBar: jest.fn(),
}));

const mockToday = jest.fn();
const mockRoster = jest.fn();
const names = [
  'arrival',
  'spine',
  'letterhead',
  'ticketFacts',
  'band',
  'household',
  'frontMatter',
  'approvals',
  'schedule',
  'activeSpread',
  'accountBand',
  'kickoff',
  'record',
  'colophon',
  'margin',
  'overlays',
] as const;
const ScheduleContext = createContext(false);
function ScheduleProbe({ name }: { name: string }) {
  const shared = useContext(ScheduleContext);
  return (
    <section
      data-slot={name}
      data-shared={String(shared)}
      data-index-region={name}
    />
  );
}
function documentSlots(): DocumentFrameSlots {
  return {
    ...Object.fromEntries(
      names.map((name) => [name, <div key={name} data-slot={name} />]),
    ),
    band: <div data-slot="band" id="doc-ticket-sentinel" />,
    schedule: <ScheduleProbe name="schedule" />,
    activeSpread: <ScheduleProbe name="activeSpread" />,
    scheduleScope: (children) => (
      <ScheduleContext.Provider value>{children}</ScheduleContext.Provider>
    ),
    projectSupportScope: (children) => <>{children}</>,
    chapters: { design: <div data-slot="reserved" /> },
  } as DocumentFrameSlots;
}
const order = (root: HTMLElement) =>
  Array.from(root.querySelectorAll('[data-slot]'), (node) =>
    node.getAttribute('data-slot'),
  );

it('keeps legacy document slot order, provider ancestry, shell attributes and refs', () => {
  const shell = createRef<HTMLDivElement>();
  const paper = createRef<HTMLElement>();
  const shellProps = {
    ref: shell,
    'data-arrival': 'document',
    'data-arrival-ready': '',
    'data-arr-engagement': 'project-1',
    'data-reading-index': 'schedule',
  };
  const { container, rerender } = render(
    <LegacyDocumentFrame
      slots={documentSlots()}
      shellProps={shellProps}
      paperProps={{ ref: paper, 'data-shelf-open': 'true' }}
    />,
  );
  expect(order(container)).toEqual(names);
  const originalShell = shell.current;
  const originalPaper = paper.current;
  expect(originalShell).toHaveAttribute('data-document-shell');
  expect(originalShell).toHaveAttribute(
    'data-shell-regime',
    'single-below-1180-narrow-to-1439-full-from-1440',
  );
  expect(originalShell).toHaveAttribute('data-arrival', 'document');
  expect(originalShell).toHaveAttribute('data-arrival-ready', '');
  expect(originalShell).toHaveAttribute('data-arr-engagement', 'project-1');
  expect(originalShell).toHaveAttribute('data-reading-index', 'schedule');
  expect(originalPaper?.tagName).toBe('MAIN');
  expect(originalPaper).toHaveAttribute('data-document-paper');
  expect(originalPaper).toHaveAttribute('data-spotlight-frame');
  expect(originalPaper).toHaveAttribute('data-shelf-open', 'true');
  expect(container.querySelectorAll('#doc-ticket-sentinel')).toHaveLength(1);
  expect(container.querySelectorAll('[data-shared="true"]')).toHaveLength(2);
  expect(container.querySelector('[data-slot="reserved"]')).toBeNull();
  rerender(
    <LegacyDocumentFrame
      slots={documentSlots()}
      shellProps={{
        ...shellProps,
        'data-arrival': undefined,
        'data-arrival-held': 'document',
        style: { visibility: 'hidden' },
      }}
      paperProps={{ ref: paper }}
    />,
  );
  expect(shell.current).toBe(originalShell);
  expect(paper.current).toBe(originalPaper);
  expect(shell.current).toHaveAttribute('data-arrival-held', 'document');
  expect(shell.current).toHaveStyle({ visibility: 'hidden' });
  expect(paper.current).not.toHaveAttribute('data-shelf-open');
});

function deskSlots(): DeskFrameSlots {
  return {
    sheet: { unchecked: [] } as unknown as DeskFrameSlots['sheet'],
    cards: [],
    ledger: { sections: [] } as unknown as DeskFrameSlots['ledger'],
    recorded: {
      id: 'lead-1',
      name: 'River house',
    } as DeskFrameSlots['recorded'],
    scope: 'mine',
    onScope: jest.fn(),
    oneVoice: true,
    now: new Date('2026-10-23T12:00:00Z'),
    dateLabel: 'Friday',
    teammateActed: [],
    names: new Map(),
    deskLine: <span data-slot="desk-line" />,
    loading: false,
    loadingRegister: true,
    deskEmpty: false,
    arrivalHeld: false,
    arrivalRoot: true,
    arrivalReady: true,
    deskRead: true,
    deskRoot: createRef<HTMLElement>(),
    notePress: jest.fn(),
    firstName: 'Leah',
    greetingWord: 'Morning',
    isError: false,
    refetch: jest.fn(),
    captureOpen: false,
    setCaptureOpen: jest.fn(),
    openProjectOpen: false,
    setOpenProjectOpen: jest.fn(),
    setRecorded: jest.fn(),
  };
}

it('keeps the desk data, visit line, arrival markers and overlay order', () => {
  const slots = deskSlots();
  const { container, rerender } = render(<LegacyDeskBody {...slots} />);
  expect(order(container)).toEqual([
    'today',
    'ledger',
    'desk-line',
    'boards',
    'reactions',
    'contents',
    'capture',
    'project',
  ]);
  expect(mockToday).toHaveBeenLastCalledWith(
    expect.objectContaining({
      sheet: slots.sheet,
      cards: slots.cards,
      scope: slots.scope,
      onScope: slots.onScope,
    }),
  );
  expect(mockRoster).toHaveBeenLastCalledWith(
    expect.objectContaining({ ledger: slots.ledger }),
  );
  expect(container.querySelector('[data-desk-visit]')).toHaveTextContent(
    'River house recorded',
  );
  expect(
    screen.getByRole('link', { name: 'Open the brief — River house' }),
  ).toHaveAttribute('href', '/doc/lead-1');
  const main = container.querySelector('main');
  expect(main).toBe(
    slots.deskRoot && 'current' in slots.deskRoot
      ? slots.deskRoot.current
      : null,
  );
  expect(main).toHaveAttribute('data-arrival', 'desk');
  expect(main).toHaveAttribute('data-arrival-ready');
  expect(
    container.querySelector('[data-tour-anchor="desk-greeting"]'),
  ).toHaveTextContent('Morning, Leah');
  rerender(<LegacyDeskBody {...slots} arrivalHeld loading />);
  expect(container.querySelector('main')).toBe(main);
  expect(container.querySelector('[data-arrival-held="desk"]')).not.toBeNull();
  expect(order(container)).toEqual([
    'loading',
    'boards',
    'reactions',
    'contents',
    'capture',
    'project',
  ]);
});

it('keeps a failed desk coherent and retries without mounting its populations', () => {
  const slots = deskSlots();
  const { container } = render(<LegacyDeskBody {...slots} isError />);
  expect(screen.getByTestId('desk-error-state')).toHaveAttribute(
    'role',
    'alert',
  );
  expect(order(container)).toEqual(['capture', 'project']);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(slots.refetch).toHaveBeenCalledTimes(1);
});
