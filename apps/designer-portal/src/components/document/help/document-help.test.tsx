/**
 * DocumentHelpPanel (help-desk Wave 1) — open-with-key behavior:
 *
 *   · openHelp({ source, surfaceKey }) applies the explicit key via
 *     useSetSurfaceKey BEFORE the panel opens, and closing restores the key
 *     that was underneath;
 *   · the legacy openHelp() / openHelp('palette') forms keep working and
 *     never touch the surface key;
 *   · the panel intro renders the registry blurb for the current surface
 *     (ancestor-or-equal match, verbs excluded);
 *   · wayfinding.helpOpened fires once per closed→open with the right source.
 *
 * The provider mock targets the RESOLVED source path, not the
 * '@patina/help-system' specifier — the jest-paths-mock gotcha (see
 * use-sheet-surface-key.test.tsx): next/jest's SWC transform rewrites the
 * paths-mapped specifier at transform time, so mocking the package name
 * silently never applies. Mocking the resolved barrel also keeps its
 * @portabletext/react ESM from loading.
 */
import { render, screen, act, fireEvent } from '@testing-library/react';
import { DocumentHelpProvider } from './document-help';
import { openHelp } from '@/lib/help-system/open-help';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';

let mockSurfaceKey: string = DOCUMENT_SURFACE_KEYS.desk;
const mockSetSurfaceKey = jest.fn((key: string) => {
  mockSurfaceKey = key;
});

jest.mock('../../../../../../packages/help-system/src/index.ts', () => ({
  SurfaceKeyProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSurfaceKey: () => mockSurfaceKey,
  useSetSurfaceKey: () => mockSetSurfaceKey,
  ContextualHelpPanel: (props: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    surfaceKey?: string;
    intro?: React.ReactNode;
    footer?: React.ReactNode;
  }) => (
    <div
      data-testid="help-panel"
      data-open={props.open ? 'true' : 'false'}
      data-surface-key={props.surfaceKey ?? ''}
    >
      {props.intro}
      {props.footer}
      <button
        type="button"
        data-testid="panel-close"
        onClick={() => props.onOpenChange?.(false)}
      />
    </div>
  ),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/desk',
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockHelpOpened = jest.fn();
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    wayfinding: {
      helpOpened: (props: unknown) => mockHelpOpened(props),
    },
  },
}));

function renderPanel() {
  return render(
    <DocumentHelpProvider>
      <div />
    </DocumentHelpProvider>,
  );
}

function panel() {
  return screen.getByTestId('help-panel');
}

describe('DocumentHelpPanel (open with an explicit surface key)', () => {
  beforeEach(() => {
    mockSurfaceKey = DOCUMENT_SURFACE_KEYS.desk;
  });

  it('openHelp({ surfaceKey }) applies the key before opening, and fires helpOpened with the source', () => {
    renderPanel();
    expect(panel()).toHaveAttribute('data-open', 'false');

    act(() => {
      openHelp({ source: 'sheet-head', surfaceKey: DOCUMENT_SURFACE_KEYS.orders });
    });

    expect(mockSetSurfaceKey).toHaveBeenCalledWith(DOCUMENT_SURFACE_KEYS.orders);
    expect(panel()).toHaveAttribute('data-open', 'true');
    expect(panel()).toHaveAttribute('data-surface-key', DOCUMENT_SURFACE_KEYS.orders);
    expect(mockHelpOpened).toHaveBeenCalledTimes(1);
    expect(mockHelpOpened).toHaveBeenCalledWith({
      surface_key: DOCUMENT_SURFACE_KEYS.orders,
      source: 'sheet-head',
    });
  });

  it('closing after an explicit-key open restores the key that was underneath', () => {
    renderPanel();
    act(() => {
      openHelp({ source: 'court-bar', surfaceKey: DOCUMENT_SURFACE_KEYS.coordination });
    });
    expect(panel()).toHaveAttribute('data-surface-key', DOCUMENT_SURFACE_KEYS.coordination);

    fireEvent.click(screen.getByTestId('panel-close'));

    expect(panel()).toHaveAttribute('data-open', 'false');
    expect(mockSetSurfaceKey).toHaveBeenLastCalledWith(DOCUMENT_SURFACE_KEYS.desk);
  });

  it('the legacy openHelp() form opens without touching the surface key (source palette)', () => {
    renderPanel();
    act(() => {
      openHelp();
    });

    expect(mockSetSurfaceKey).not.toHaveBeenCalled();
    expect(panel()).toHaveAttribute('data-open', 'true');
    expect(panel()).toHaveAttribute('data-surface-key', DOCUMENT_SURFACE_KEYS.desk);
    expect(mockHelpOpened).toHaveBeenCalledWith({
      surface_key: DOCUMENT_SURFACE_KEYS.desk,
      source: 'palette',
    });
  });

  it("the legacy string form openHelp('palette') still works", () => {
    renderPanel();
    act(() => {
      openHelp('palette');
    });
    expect(panel()).toHaveAttribute('data-open', 'true');
    expect(mockHelpOpened).toHaveBeenCalledWith({
      surface_key: DOCUMENT_SURFACE_KEYS.desk,
      source: 'palette',
    });
  });

  it('renders the registry blurb as the panel intro for the current surface', () => {
    mockSurfaceKey = DOCUMENT_SURFACE_KEYS.orders;
    renderPanel();
    act(() => {
      openHelp({ source: 'sheet-head', surfaceKey: DOCUMENT_SURFACE_KEYS.orders });
    });
    expect(
      screen.getByText('Every purchase order, from drawn to delivered.'),
    ).toBeInTheDocument();
  });

  it('an orders sub-page key still frames itself with the Orders blurb (ancestor match)', () => {
    renderPanel();
    act(() => {
      openHelp({ source: 'sheet-head', surfaceKey: DOCUMENT_SURFACE_KEYS.ordersReceiving });
    });
    expect(
      screen.getByText('Every purchase order, from drawn to delivered.'),
    ).toBeInTheDocument();
  });

  it("the Desk key renders no verb blurb as intro (verbs share the Desk key as scope, not identity)", () => {
    renderPanel();
    act(() => {
      openHelp();
    });
    expect(
      screen.queryByText('A name and a note — the Desk takes it from there.'),
    ).not.toBeInTheDocument();
  });
});

describe('DocumentHelpPanel (host surfaces answer, and the KEYS block)', () => {
  beforeEach(() => {
    mockSurfaceKey = DOCUMENT_SURFACE_KEYS.desk;
  });

  it('the Desk answers with its own host blurb', () => {
    renderPanel();
    act(() => {
      openHelp();
    });
    expect(
      screen.getByText('Every live job, one line each — the quiet ones are in motion.'),
    ).toBeInTheDocument();
  });

  it('a document answers with its own host blurb', () => {
    renderPanel();
    act(() => {
      openHelp({ source: 'sheet-head', surfaceKey: DOCUMENT_SURFACE_KEYS.doc });
    });
    expect(
      screen.getByText(
        'One client, one paper — Brief through Care. The rail says where it stands.',
      ),
    ).toBeInTheDocument();
  });

  it('the footer prints the KEYS block and both reference doorways', () => {
    renderPanel();
    act(() => {
      openHelp();
    });
    expect(screen.getByText('KEYS')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /The keys/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /The words/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Browse all help/ })).toBeInTheDocument();
  });

  it('the KEYS block prints the chord for the surface in hand', () => {
    renderPanel();
    act(() => {
      openHelp({ source: 'sheet-head', surfaceKey: DOCUMENT_SURFACE_KEYS.orders });
    });
    const keys = screen.getByTestId('panel-keys');
    expect(keys).toHaveTextContent('Orders');
    expect(keys).toHaveTextContent('G');
    expect(keys).toHaveTextContent('O');
  });
});
