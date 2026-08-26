/**
 * The leaf, and the route it becomes below 1440 (B1). The shelves are the
 * ticket's rows now, so their contents have to be reachable at every width:
 * from 1440 the leaf is the 320px aside beside the spine; below that a shelf
 * with a page of its own resolves to that page instead.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { ShelfPanel, shelfRouteFor } from './shelf-panel';
import { requestShelfClose } from '@/lib/document/shelves';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  __esModule: true,
  useRouter: () => ({ push: mockPush }),
}));

/** The tier the panel asks about, answered as the test wants it. */
function atWidth(fullTier: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query === '(min-width: 1440px)' ? fullTier : false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }),
  });
}

beforeEach(() => {
  mockPush.mockClear();
  atWidth(true);
});

describe('shelfRouteFor — where a shelf goes when there is no leaf', () => {
  it('gives every project shelf that has a page its page', () => {
    expect(shelfRouteFor('planroom', 'proj-1')).toBe('/doc/proj-1/plans');
    expect(shelfRouteFor('specbook', 'proj-1')).toBe('/doc/proj-1/spec-book');
    expect(shelfRouteFor('moodboards', 'proj-1')).toBe('/doc/proj-1/boards');
  });

  it('gives no page to the two that have none — the overlay and the copy', () => {
    // The call sheet opens the roster sheet; the client's copy is reached
    // below 1440 by the Preview act that has always carried it (Q7/A4).
    expect(shelfRouteFor('callsheet', 'proj-1')).toBeNull();
    expect(shelfRouteFor('clientcopy', 'proj-1')).toBeNull();
  });
});

describe('the leaf below 1440 — a route, not an aside', () => {
  it('resolves a carried shelf to its own page and renders no aside', () => {
    atWidth(false);
    const onClose = jest.fn();
    render(
      <ShelfPanel openShelf="specbook" onClose={onClose} projectId="proj-1">
        <p>leaf body</p>
      </ShelfPanel>,
    );
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.queryByText('leaf body')).not.toBeInTheDocument();
    expect(mockPush).toHaveBeenCalledWith('/doc/proj-1/spec-book');
    expect(onClose).toHaveBeenCalled();
  });

  it('puts a routing shelf away even with no document to route to', () => {
    atWidth(false);
    const onClose = jest.fn();
    render(
      <ShelfPanel openShelf="planroom" onClose={onClose}>
        <p>leaf body</p>
      </ShelfPanel>,
    );
    expect(screen.queryByText('leaf body')).not.toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the client’s copy as a leaf, because it has no page of its own', () => {
    atWidth(false);
    const onClose = jest.fn();
    render(
      <ShelfPanel openShelf="clientcopy" onClose={onClose} projectId="proj-1">
        <p>leaf body</p>
      </ShelfPanel>,
    );
    expect(
      screen.getByRole('region', { name: 'The client’s copy shelf' }),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('the shelf leaf at the full tier', () => {
  function Harness({ open }: { open: boolean }) {
    return (
      <>
        <button type="button" data-shelf-trigger="specbook">
          Spec book
        </button>
        <ShelfPanel openShelf={open ? 'specbook' : null} onClose={jest.fn()}>
          <p>leaf body</p>
        </ShelfPanel>
      </>
    );
  }

  it('renders nothing while no shelf is pulled out', () => {
    render(<Harness open={false} />);
    expect(screen.queryByText('leaf body')).not.toBeInTheDocument();
  });

  it('is the 320px aside beside the spine', () => {
    render(<Harness open />);
    const leaf = screen.getByRole('region', { name: 'Spec book shelf' });
    expect(leaf.tagName).toBe('ASIDE');
    expect(leaf).toHaveClass('w-[320px]', 'min-[1440px]:left-[200px]');
  });

  it('is a region, not a dialog — the paper behind stays live', () => {
    render(<Harness open />);
    expect(
      screen.getByRole('region', { name: 'Spec book shelf' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('takes focus to its close word on open', () => {
    render(<Harness open />);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /Close/ }),
    );
  });

  it('closes on Escape', () => {
    const onClose = jest.fn();
    render(
      <ShelfPanel openShelf="planroom" onClose={onClose}>
        <p>leaf body</p>
      </ShelfPanel>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('stands down from Escape while a sheet is open over it', () => {
    const onClose = jest.fn();
    render(
      <>
        <div role="dialog" aria-label="A sheet" />
        <ShelfPanel openShelf="planroom" onClose={onClose}>
          <p>leaf body</p>
        </ShelfPanel>
      </>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes when a leaf asks to be put away', () => {
    const onClose = jest.fn();
    render(
      <ShelfPanel openShelf="moodboards" onClose={onClose}>
        <p>leaf body</p>
      </ShelfPanel>,
    );
    act(() => {
      requestShelfClose();
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('hands focus back to the shelf row it came from', () => {
    const { rerender } = render(<Harness open />);
    rerender(<Harness open={false} />);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Spec book' }),
    );
  });
});
