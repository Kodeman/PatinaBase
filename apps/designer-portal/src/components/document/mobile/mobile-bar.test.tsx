import { fireEvent, render, screen, within } from '@testing-library/react';
import { MobileBar } from './mobile-bar';
import {
  MobileShellProvider,
  useMobileActiveDoc,
  useMobilePrimaryAction,
  type MobileActiveDoc,
  type MobilePrimaryAction,
} from './mobile-shell';

let mockPathname = '/doc/proj-1';
let mockCallSheetOn = true;

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

jest.mock('@patina/supabase', () => ({
  useUnreadInboxCount: () => ({ data: 0 }),
  useProcurementUnreadCount: () => ({ data: 0 }),
  useUnseenShipped: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-hydrated', () => ({
  useHydrated: () => true,
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: mockCallSheetOn }),
}));

jest.mock('@/hooks/document-time-provider', () => ({
  useDocumentTime: () => ({
    inHandToday: 0,
    running: false,
    paused: false,
    elapsedSeconds: 0,
    offer: null,
  }),
}));

jest.mock('../overlays/post-sheet', () => ({
  openPost: jest.fn(),
}));

jest.mock('../feedback/feedback-sheet', () => ({
  openFeedbackSheet: jest.fn(),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

const heldDocument: MobileActiveDoc = {
  projectId: 'proj-1',
  proposalId: null,
  clientName: 'Vandersteen',
  title: 'Vandersteen residence',
  sections: [
    { key: 'project', label: 'Project', state: 'active', sub: 'In the project' },
  ],
};

function HoldDocument({ doc }: { doc: MobileActiveDoc | null }) {
  useMobileActiveDoc(doc);
  return null;
}

function Registration({ action }: { action: MobilePrimaryAction | null }) {
  useMobilePrimaryAction(action);
  return null;
}

function mountBar({
  doc = heldDocument,
  action = null,
}: {
  doc?: MobileActiveDoc | null;
  action?: MobilePrimaryAction | null;
} = {}) {
  return render(
    <MobileShellProvider>
      <HoldDocument doc={doc} />
      <Registration action={action} />
      <MobileBar />
    </MobileShellProvider>,
  );
}

function openMore() {
  fireEvent.click(screen.getByRole('button', { name: 'More studio actions' }));
  return within(screen.getByRole('group', { name: 'More studio actions' }));
}

describe('the More menu · In this document (F49)', () => {
  beforeEach(() => {
    mockPathname = '/doc/proj-1';
    mockCallSheetOn = true;
  });

  it('leads with the document group, then the register', () => {
    mountBar();
    fireEvent.click(screen.getByRole('button', { name: 'More studio actions' }));
    const menu = screen.getByRole('group', { name: 'More studio actions' });

    const group = within(menu).getByRole('group', {
      name: 'In this document',
    });
    expect(
      Array.from(group.querySelectorAll('a, button')).map((row) =>
        row.textContent?.replace('→', ''),
      ),
    ).toEqual(['Plan room', 'Spec book', 'Boards', 'Call sheet']);

    const labels = Array.from(menu.querySelectorAll('a, button')).map((row) =>
      row.textContent?.replace('→', ''),
    );
    expect(labels.slice(0, 5)).toEqual([
      'Plan room',
      'Spec book',
      'Boards',
      'Call sheet',
      'Find anything⌘K',
    ]);
  });

  it('routes the plan room and the spec book at this project', () => {
    mountBar();
    const menu = openMore();

    expect(menu.getByRole('link', { name: 'Plan room' })).toHaveAttribute(
      'href',
      '/doc/proj-1/plans',
    );
    expect(menu.getByRole('link', { name: 'Spec book' })).toHaveAttribute(
      'href',
      '/doc/proj-1/spec-book',
    );
  });

  it('routes Boards at the destination B1-L4 built, under that one name', () => {
    mountBar();
    const menu = openMore();

    expect(menu.getByRole('link', { name: 'Boards' })).toHaveAttribute(
      'href',
      '/doc/proj-1/boards',
    );
    expect(menu.queryByText('Mood boards')).toBeNull();
  });

  it('opens the call sheet through the doorway the surface already listens on', () => {
    const opened = jest.fn();
    window.addEventListener('document:open-call-sheet', opened);
    mountBar();
    fireEvent.click(openMore().getByRole('button', { name: 'Call sheet' }));
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener('document:open-call-sheet', opened);
  });

  it('drops the call sheet row when its flag is off', () => {
    mockCallSheetOn = false;
    mountBar();
    const menu = openMore();
    expect(menu.queryByRole('button', { name: 'Call sheet' })).toBeNull();
    expect(menu.getByRole('link', { name: 'Plan room' })).toBeInTheDocument();
  });

  it('prints no document group off a document', () => {
    mockPathname = '/desk';
    mountBar({ doc: null });
    const menu = openMore();
    expect(menu.queryByRole('group', { name: 'In this document' })).toBeNull();
    expect(menu.getByText('Find anything')).toBeInTheDocument();
  });
});

describe('the More menu · Find anything ⌘K (F49 blocker)', () => {
  beforeEach(() => {
    mockPathname = '/doc/proj-1';
    mockCallSheetOn = true;
  });

  it('is a 44px menu row, not a fourth target on the bar', () => {
    mountBar();
    const bar = screen.getByTestId('mobile-bar');
    expect(within(bar).queryByText('Find anything')).toBeNull();

    const row = openMore()
      .getByText('Find anything')
      .closest('button') as HTMLButtonElement;
    expect(row).toHaveAttribute('data-mobile-find-anything');
    expect(row).toHaveClass('min-h-11');
    expect(row.textContent).toBe('Find anything⌘K');
  });

  it('opens the register and closes the menu', () => {
    const opened = jest.fn();
    window.addEventListener('document:open-command-bar', opened);
    mountBar();
    fireEvent.click(
      openMore().getByText('Find anything').closest('button') as HTMLElement,
    );
    expect(opened).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('group', { name: 'More studio actions' }),
    ).toBeNull();
    window.removeEventListener('document:open-command-bar', opened);
  });
});

describe('the More menu · Ledgers (C20)', () => {
  beforeEach(() => {
    mockPathname = '/doc/proj-1';
    mockCallSheetOn = true;
  });

  it('calls the books Ledgers, as the drawer and the Desk do', () => {
    mountBar();
    const menu = openMore();
    expect(menu.getByText('Ledgers')).toBeInTheDocument();
    expect(menu.queryByText('Studio books')).toBeNull();
  });
});

describe('the elected act at 390', () => {
  beforeEach(() => {
    mockPathname = '/doc/proj-1';
    mockCallSheetOn = true;
  });

  it('prints in full — the label wraps, it never truncates', () => {
    mountBar({
      action: {
        actionKey: 'pick-the-fabric',
        surfaceKey: 'open-document',
        regionKey: 'red-letter',
        label: 'Pick the fabric for the Okonkwo sofa',
        target: { kind: 'press', onPress: jest.fn() },
      },
    });

    const act = screen.getByRole('button', {
      name: 'Pick the fabric for the Okonkwo sofa',
    });
    expect(act.className).toContain('[&_.da-label]:whitespace-normal');
    expect(act.className).not.toContain('truncate');
    expect(act.className).not.toContain('max-w-[9rem]');
    expect(act.querySelector('.da-label')?.textContent).toBe(
      'Pick the fabric for the Okonkwo sofa',
    );
  });
});

describe('the left zone · household and the current stop (OD-11, A-08)', () => {
  beforeEach(() => {
    mockPathname = '/doc/proj-1';
    mockCallSheetOn = true;
  });

  it('prints the household, not the active section, on the second line', () => {
    mountBar();
    const doorway = screen.getByRole('button', { name: 'Open sections' });
    expect(within(doorway).getByText('Vandersteen')).toBeInTheDocument();
    expect(within(doorway).queryByText('Project')).toBeNull();
  });

  it('falls back to the document title when there is no household name', () => {
    mountBar({ doc: { ...heldDocument, clientName: '' } });
    const doorway = screen.getByRole('button', { name: 'Open sections' });
    expect(
      within(doorway).getByText('Vandersteen residence'),
    ).toBeInTheDocument();
  });

  it('omits the third line and reads "Open sections" with no reading index', () => {
    mountBar();
    const bar = screen.getByTestId('mobile-bar');
    expect(bar).toHaveAttribute('data-reading-index', '');
    expect(screen.queryByText(/^At /)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Open sections' }),
    ).toBeInTheDocument();
  });

  it('prints "At <stop>" and publishes data-reading-index once a stop is held', () => {
    mountBar({ doc: { ...heldDocument, readingIndex: 'ffe' } });
    const bar = screen.getByTestId('mobile-bar');
    expect(bar).toHaveAttribute('data-reading-index', 'ffe');
    expect(screen.getByText('At Pieces')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open sections, at Pieces' }),
    ).toBeInTheDocument();
  });

  it('names every stop with the running index labels', () => {
    (
      [
        ['approvals', 'At Client approvals', 'Open sections, at Client approvals'],
        ['schedule', 'At Schedule', 'Open sections, at Schedule'],
        ['money', 'At Money', 'Open sections, at Money'],
      ] as const
    ).forEach(([readingIndex, line, ariaLabel]) => {
      const { unmount } = mountBar({
        doc: { ...heldDocument, readingIndex },
      });
      expect(screen.getByText(line)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: ariaLabel }),
      ).toBeInTheDocument();
      unmount();
    });
  });
});
