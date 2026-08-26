import { useEffect, useState } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { DocSpine } from '../doc-spine';
import { ResponsiveMarginRail } from '../margin-rail';
import { MobileBar } from '../mobile/mobile-bar';
import {
  MobileShellProvider,
  useMobileActiveDoc,
  useMobilePrimaryAction,
  type MobileActiveDoc,
} from '../mobile/mobile-shell';
import { DocSheet } from '../overlays/doc-sheet';
import type { SpineSection } from '@/lib/document/section-derivation';

jest.mock('next/navigation', () => ({
  usePathname: () => '/doc/proj-1',
}));

// Only the bar's three counters are stubbed; every other export stays real so
// the margin rail below still reads the hooks it actually uses.
jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  useUnreadInboxCount: () => ({ data: 0 }),
  useProcurementUnreadCount: () => ({ data: 0 }),
  useUnseenShipped: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => true }));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: true }),
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

jest.mock('../overlays/post-sheet', () => ({ openPost: jest.fn() }));
jest.mock('../feedback/feedback-sheet', () => ({
  openFeedbackSheet: jest.fn(),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('../strata-mark', () => ({
  StrataMark: ({ label }: { label?: string }) => (
    <span data-testid="strata-mark" aria-label={label} />
  ),
}));

jest.mock('../spine-timer', () => ({
  SpineTimer: () => <div data-testid="spine-timer">Timer</div>,
  CompactSpineTimerDoorway: () => (
    <button
      type="button"
      data-testid="compact-spine-timer"
      className="hidden min-[1180px]:flex min-[1440px]:hidden"
    >
      Compact timer
    </button>
  ),
}));

jest.mock('@/lib/document/fill-state', () => ({
  fillStateAtSection: () => ({ kind: 'empty' }),
}));

const sections: SpineSection[] = [
  { key: 'brief', label: 'Brief', state: 'settled', sub: 'Settled' },
  {
    key: 'discovery',
    label: 'Discovery',
    state: 'active',
    sub: 'In discovery',
  },
  { key: 'direction', label: 'Direction', state: 'future', sub: '—' },
];

function NestedSheetFixture() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open nested sheet
      </button>
      <DocSheet open={open} onClose={() => setOpen(false)} title="Nested sheet">
        <button type="button">Nested action</button>
      </DocSheet>
    </>
  );
}

type MediaListener = (event: MediaQueryListEvent) => void;

function installMatchMedia({
  compact,
  full,
}: {
  compact: boolean;
  full: boolean;
}) {
  const state = { compact, full };
  const listeners = new Set<MediaListener>();
  window.matchMedia = jest.fn((query: string) => {
    return {
      get matches() {
        return query.includes('1440px') ? state.full : state.compact;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: MediaListener) =>
        listeners.add(listener),
      removeEventListener: (_type: string, listener: MediaListener) =>
        listeners.delete(listener),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    } as unknown as MediaQueryList;
  });

  return {
    setMode(next: { compact: boolean; full: boolean }) {
      state.compact = next.compact;
      state.full = next.full;
      listeners.forEach((listener) =>
        listener({ matches: next.full } as MediaQueryListEvent),
      );
    },
  };
}

describe('quiet responsive document shell', () => {
  beforeEach(() => {
    installMatchMedia({ compact: true, full: false });
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  });

  it('exposes a compact index at 1180px and the full labelled spine at 1440px', () => {
    const onJump = jest.fn();
    render(<DocSpine sections={sections} others={[]} onJump={onJump} />);

    const spine = screen.getByRole('complementary', { name: 'Document spine' });
    expect(spine).toHaveAttribute(
      'data-spine-regime',
      'sheet-below-1180-compact-to-1439-full-from-1440',
    );
    expect(spine).toHaveClass(
      'min-[1180px]:block',
      'min-[1180px]:box-border',
      'min-[1180px]:overflow-x-hidden',
      'min-[1180px]:w-full',
      'min-[1440px]:w-auto',
    );

    expect(screen.getByRole('link', { name: 'Put down document' })).toHaveClass(
      'min-h-11',
      'min-w-11',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Jump to Brief: Settled' }),
    );
    expect(onJump).toHaveBeenCalledWith('brief');
    expect(
      screen.getByRole('button', { name: 'Jump to Discovery: In discovery' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Direction/ }),
    ).not.toBeInTheDocument();

    expect(screen.getByTestId('spine-timer').parentElement).toHaveClass(
      'hidden',
      'min-[1440px]:block',
    );
    expect(screen.getByTestId('compact-spine-timer')).toHaveClass(
      'hidden',
      'min-[1180px]:flex',
      'min-[1440px]:hidden',
    );
  });

  it('opens the laptop margin as a labelled, keyboard-contained sheet', async () => {
    render(
      <ResponsiveMarginRail>
        <button type="button">Last margin action</button>
      </ResponsiveMarginRail>,
    );

    const trigger = screen.getByRole('button', { name: 'Margin' });
    const panel = document.querySelector<HTMLElement>('[data-margin-panel]');
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute('data-margin-mode', 'sheet');
    expect(panel).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'In the margin' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(dialog).toHaveAttribute('aria-hidden', 'false');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Close margin' }),
      ).toHaveFocus(),
    );

    const close = screen.getByRole('button', { name: 'Close margin' });
    const last = screen.getByRole('button', { name: 'Last margin action' });
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(close).toHaveFocus();

    fireEvent.keyDown(close, { key: 'Escape' });
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('locks background scrolling until Escape, backdrop close, or unmount', async () => {
    document.body.style.overflow = 'scroll';
    const { container, unmount } = render(
      <ResponsiveMarginRail>
        <p>Margin content</p>
      </ResponsiveMarginRail>,
    );

    const trigger = screen.getByRole('button', { name: 'Margin' });
    fireEvent.click(trigger);
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'In the margin' }), {
      key: 'Escape',
    });
    await waitFor(() => expect(document.body.style.overflow).toBe('scroll'));

    fireEvent.click(trigger);
    const backdrop = container.querySelector<HTMLButtonElement>(
      'button[aria-hidden="true"]',
    );
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as HTMLButtonElement);
    await waitFor(() => expect(document.body.style.overflow).toBe('scroll'));

    fireEvent.click(trigger);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('restores background scrolling when the sheet settles into the full rail', async () => {
    document.body.style.overflow = 'scroll';
    const media = installMatchMedia({ compact: true, full: false });
    render(
      <ResponsiveMarginRail>
        <p>Margin content</p>
      </ResponsiveMarginRail>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Margin' }));
    expect(document.body.style.overflow).toBe('hidden');

    act(() => media.setMode({ compact: true, full: true }));

    await screen.findByRole('complementary', { name: 'Margin' });
    await waitFor(() => expect(document.body.style.overflow).toBe('scroll'));
  });

  it('settles the same margin content into a labelled rail on wide screens', async () => {
    installMatchMedia({ compact: true, full: true });
    render(
      <ResponsiveMarginRail>
        <p>Margin content</p>
      </ResponsiveMarginRail>,
    );

    const rail = await screen.findByRole('complementary', { name: 'Margin' });
    expect(rail).toHaveAttribute('data-margin-mode', 'rail');
    expect(rail).toHaveAttribute('aria-hidden', 'false');
    expect(rail).toHaveClass('min-[1440px]:sticky', 'min-[1440px]:col-start-3');
  });

  it('lets a nested document sheet own Escape before closing the margin', async () => {
    render(
      <ResponsiveMarginRail>
        <NestedSheetFixture />
      </ResponsiveMarginRail>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Margin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open nested sheet' }));
    const margin = document.querySelector<HTMLElement>('[data-margin-panel]')!;
    expect(margin).toHaveAttribute('role', 'dialog');
    expect(margin).toHaveAttribute('aria-hidden', 'true');
    expect(margin).not.toHaveAttribute('aria-modal');
    expect(
      screen.getByRole('dialog', { name: 'Nested sheet' }),
    ).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Nested action' }), {
      key: 'Escape',
    });
    expect(
      screen.queryByRole('dialog', { name: 'Nested sheet' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(margin).toHaveAttribute('aria-hidden', 'false'));
    expect(margin).toHaveAttribute('aria-modal', 'true');

    fireEvent.keyDown(margin, { key: 'Escape' });
    await waitFor(() => expect(margin).toHaveAttribute('aria-hidden', 'true'));
  });

  it('keeps scrolling locked when a nested sheet survives the full-rail transition', async () => {
    document.body.style.overflow = 'scroll';
    const media = installMatchMedia({ compact: true, full: false });
    render(
      <ResponsiveMarginRail>
        <NestedSheetFixture />
      </ResponsiveMarginRail>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Margin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open nested sheet' }));
    expect(document.body.style.overflow).toBe('hidden');
    expect(
      screen.getByRole('dialog', { name: 'Nested sheet' }),
    ).toBeInTheDocument();

    act(() => media.setMode({ compact: true, full: true }));

    await screen.findByRole('complementary', { name: 'Margin' });
    expect(
      screen.getByRole('dialog', { name: 'Nested sheet' }),
    ).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(screen.getByRole('button', { name: 'Nested action' }), {
      key: 'Escape',
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Nested sheet' }),
      ).not.toBeInTheDocument(),
    );
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('reopens the compact margin beneath a portalled sheet on the 1440→1439 transition', async () => {
    document.body.style.overflow = 'scroll';
    const media = installMatchMedia({ compact: true, full: true });
    render(
      <ResponsiveMarginRail>
        <NestedSheetFixture />
      </ResponsiveMarginRail>,
    );

    await screen.findByRole('complementary', { name: 'Margin' });
    fireEvent.click(screen.getByRole('button', { name: 'Open nested sheet' }));
    const nested = screen.getByRole('dialog', { name: 'Nested sheet' });
    await waitFor(() => expect(nested).toHaveFocus());
    expect(document.body.style.overflow).toBe('hidden');

    act(() => media.setMode({ compact: true, full: false }));

    const margin = document.querySelector<HTMLElement>('[data-margin-panel]')!;
    expect(margin).toHaveAttribute('data-margin-mode', 'sheet');
    expect(margin).toHaveAttribute('aria-hidden', 'true');
    expect(margin).toHaveAttribute('inert');
    expect(margin).not.toHaveAttribute('aria-modal');
    expect(nested).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(nested).not.toBeInTheDocument());
    await screen.findByRole('dialog', { name: 'In the margin' });
    expect(margin).toHaveAttribute('aria-hidden', 'false');
    expect(margin).toHaveAttribute('aria-modal', 'true');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(margin).toHaveAttribute('aria-hidden', 'true'));
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('keeps a portalled margin sheet reachable below 1180 without a stale lock', async () => {
    document.body.style.overflow = 'scroll';
    const media = installMatchMedia({ compact: true, full: false });
    render(
      <ResponsiveMarginRail>
        <NestedSheetFixture />
      </ResponsiveMarginRail>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Margin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open nested sheet' }));
    const nested = screen.getByRole('dialog', { name: 'Nested sheet' });
    const margin = document.querySelector<HTMLElement>('[data-margin-panel]');
    expect(margin).not.toBeNull();
    await waitFor(() => expect(nested).toHaveFocus());

    act(() => media.setMode({ compact: false, full: false }));

    expect(margin).toHaveAttribute('aria-hidden', 'true');
    expect(margin).toHaveAttribute('inert');
    expect(nested).toBeInTheDocument();
    expect(margin).not.toContainElement(nested);
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(nested).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe('scroll');
  });
});

/**
 * 390 — the thumb edge carries three things and no more: where she is, the one
 * elected act, and More. A fourth 44x44 target is what made the act truncate.
 */
describe('the 390 bar', () => {
  const held: MobileActiveDoc = {
    projectId: 'proj-1',
    proposalId: null,
    clientName: 'Vandersteen',
    title: 'Vandersteen residence',
    sections: [
      {
        key: 'project',
        label: 'Project',
        state: 'active',
        sub: 'In the project',
      },
    ],
  };

  function Bar() {
    useMobileActiveDoc(held);
    useMobilePrimaryAction({
      actionKey: 'pick-the-fabric',
      surfaceKey: 'open-document',
      regionKey: 'red-letter',
      label: 'Pick the fabric for the Okonkwo sofa',
      target: { kind: 'press', onPress: jest.fn() },
    });
    return <MobileBar />;
  }

  it('carries the context, the elected act and More — nothing else', () => {
    render(
      <MobileShellProvider>
        <Bar />
      </MobileShellProvider>,
    );

    const bar = screen.getByTestId('mobile-bar');
    expect(bar).toHaveClass('min-[1180px]:hidden');
    const controls = Array.from(bar.querySelectorAll('button, a'));
    expect(controls).toHaveLength(3);

    const [context, act, more] = controls;
    expect(context).toHaveAccessibleName(
      'Open sections, current section Project',
    );
    expect(act).toHaveAttribute('data-action-key', 'pick-the-fabric');
    expect(act.querySelector('.da-label')?.textContent).toBe(
      'Pick the fabric for the Okonkwo sofa',
    );
    expect(more).toHaveAccessibleName('More studio actions');
  });
});
