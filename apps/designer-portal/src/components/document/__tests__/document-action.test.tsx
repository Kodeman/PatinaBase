import { createRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  DocumentAction,
  DocumentActionGroup,
  DocumentActionRow,
} from '../document-action';
import { documentEvents } from '@/lib/analytics/document-events';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

// jsdom (jest-environment-jsdom 29 → jsdom 20) ships no PointerEvent
// constructor, so fireEvent.pointerDown silently falls back to a bare Event and
// drops clientX/clientY. MouseEvent carries exactly the coordinates the ink
// script reads, so stand it in when the real constructor is absent.
if (typeof window !== 'undefined' && !('PointerEvent' in window)) {
  Object.defineProperty(window, 'PointerEvent', {
    configurable: true,
    writable: true,
    value: window.MouseEvent,
  });
}

const events = documentEvents as jest.Mocked<typeof documentEvents>;

/**
 * The Scored Ink (I107): the visible control is a scored word, not a box. Each
 * variant keeps the 12px floor (I91) and differentiates by weight and ink; the
 * retired chrome column is the box grammar that must no longer appear.
 */
const VARIANTS = [
  {
    variant: 'primary',
    retiredChrome: 'bg-[var(--color-charcoal)]',
    tracking: 'tracking-[0.12em]',
    weight: 'font-medium',
    hasPool: true,
  },
  {
    variant: 'secondary',
    retiredChrome: 'border-[var(--color-aged-oak)]',
    tracking: 'tracking-[0.1em]',
    weight: 'font-normal',
    hasPool: true,
  },
  {
    variant: 'tertiary',
    retiredChrome: 'underline',
    tracking: 'tracking-[0.1em]',
    weight: 'font-light',
    hasPool: false,
  },
  {
    variant: 'danger',
    retiredChrome: 'bg-[var(--color-terracotta)]',
    tracking: 'tracking-[0.12em]',
    weight: 'font-medium',
    hasPool: true,
  },
] as const;

describe('DocumentAction', () => {
  it.each(VARIANTS)(
    'renders the $variant variant in the scored-ink grammar',
    ({ variant, retiredChrome, tracking, weight }) => {
      render(
        <DocumentAction
          actionKey={`${variant}-action`}
          surfaceKey="test-surface"
          regionKey="test-region"
          variant={variant}
        >
          Act
        </DocumentAction>,
      );

      const action = screen.getByRole('button', { name: 'Act' });
      expect(action).toHaveClass(
        'da-act',
        `da-${variant}`,
        'text-[12px]',
        tracking,
        weight,
      );

      // The box is gone: the 44px floor now lives on the hit halo, not the ink.
      expect(action).not.toHaveClass('min-h-11');
      expect(action).not.toHaveClass('min-w-11');
      expect(action).not.toHaveClass('rounded-[4px]');
      expect(action).not.toHaveClass(retiredChrome);
      expect(action.className).not.toContain('focus-visible:outline');

      expect(action).toHaveAttribute('data-action-key', `${variant}-action`);
      expect(action).toHaveAttribute('data-action-variant', variant);
      expect(action).toHaveAttribute('data-action-region', 'test-region');
      expect(action).toHaveAttribute('type', 'button');
    },
  );

  it.each(VARIANTS)(
    'gives the $variant variant one hit halo, a scored label, and its pool',
    ({ variant, hasPool }) => {
      render(
        <DocumentAction
          actionKey={`${variant}-anatomy`}
          surfaceKey="test-surface"
          regionKey="test-region"
          variant={variant}
        >
          Act
        </DocumentAction>,
      );

      const action = screen.getByRole('button', { name: 'Act' });

      const halos = action.querySelectorAll('[data-action-hit]');
      expect(halos).toHaveLength(1);
      expect(halos[0]).toHaveAttribute('aria-hidden', 'true');
      expect(halos[0]).toHaveClass('da-hit');
      expect(action.lastElementChild).toBe(halos[0]);

      const label = action.querySelector('.da-label');
      expect(label).not.toBeNull();
      expect(label).toHaveTextContent('Act');

      const pool = action.querySelector('.da-pool');
      if (hasPool) {
        expect(pool).not.toBeNull();
        expect(pool).toHaveAttribute('aria-hidden');
        expect(action.firstElementChild).toBe(pool);
      } else {
        // Tertiary takes no ink: the pool is absent from the DOM, not hidden.
        expect(pool).toBeNull();
      }
    },
  );

  it('renders a link target and emits guarded impression and selection analytics', () => {
    render(
      <DocumentActionGroup surfaceKey="library" regionKey="room-head">
        <DocumentAction
          actionKey="capture"
          variant="primary"
          href="/library?capture=1"
          onClick={(event) => event.preventDefault()}
        >
          Capture
        </DocumentAction>
      </DocumentActionGroup>,
    );

    const action = screen.getByRole('link', { name: 'Capture' });
    expect(action).toHaveAttribute('href', '/library?capture=1');
    expect(action).toHaveClass('da-act', 'da-primary');
    expect(action.querySelectorAll('[data-action-hit]')).toHaveLength(1);
    expect(events.actionShown).toHaveBeenCalledTimes(1);
    expect(events.actionShown).toHaveBeenCalledWith({
      surface_key: 'library',
      region_key: 'room-head',
      action_key: 'capture',
      variant: 'primary',
      presentation: 'inline',
    });

    fireEvent.click(action);
    expect(events.actionSelected).toHaveBeenCalledWith({
      surface_key: 'library',
      region_key: 'room-head',
      action_key: 'capture',
      variant: 'primary',
      presentation: 'inline',
    });
  });

  it('records the pointer origin as the ink coordinates', () => {
    render(
      <DocumentAction actionKey="ink" surfaceKey="test" regionKey="ink">
        Ink
      </DocumentAction>,
    );

    const action = screen.getByRole('button', { name: 'Ink' });

    // jsdom reports a zeroed bounding rect, so the client coordinates land
    // unchanged on the custom properties the pool clips from.
    fireEvent.pointerDown(action, { clientX: 120, clientY: 18 });
    expect(action.style.getPropertyValue('--ink-x')).toBe('120px');
    expect(action.style.getPropertyValue('--ink-y')).toBe('18px');

    fireEvent.pointerMove(action, { clientX: 42, clientY: 7 });
    expect(action.style.getPropertyValue('--ink-x')).toBe('42px');
    expect(action.style.getPropertyValue('--ink-y')).toBe('7px');
  });

  it('records the pointer origin on link renders too', () => {
    render(
      <DocumentAction
        actionKey="ink-link"
        surfaceKey="test"
        regionKey="ink"
        href="/library?capture=1"
        onClick={(event) => event.preventDefault()}
      >
        Ink
      </DocumentAction>,
    );

    const action = screen.getByRole('link', { name: 'Ink' });
    fireEvent.pointerDown(action, { clientX: 64, clientY: 12 });
    expect(action.style.getPropertyValue('--ink-x')).toBe('64px');
    expect(action.style.getPropertyValue('--ink-y')).toBe('12px');
  });

  it('exposes loading and disabled states without selecting', () => {
    const { rerender } = render(
      <DocumentAction
        actionKey="save"
        surfaceKey="compose"
        regionKey="room-head"
        loading
        loadingLabel="Saving…"
      >
        Save draft
      </DocumentAction>,
    );

    const loading = screen.getByRole('button', { name: 'Saving…' });
    expect(loading).toBeDisabled();
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(loading.querySelector('.da-label')).toHaveTextContent('Saving…');
    fireEvent.click(loading);
    expect(events.actionSelected).not.toHaveBeenCalled();

    rerender(
      <DocumentAction
        actionKey="save"
        surfaceKey="compose"
        regionKey="room-head"
        disabled
      >
        Save draft
      </DocumentAction>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(events.actionSelected).not.toHaveBeenCalled();
  });

  it('deduplicates impressions for a mounted action and presentation', () => {
    const { rerender } = render(
      <DocumentAction
        actionKey="save"
        surfaceKey="compose"
        regionKey="room-head"
        variant="primary"
      >
        Save draft
      </DocumentAction>,
    );

    rerender(
      <DocumentAction
        actionKey="save"
        surfaceKey="compose"
        regionKey="composer-footer"
        variant="secondary"
      >
        Save draft
      </DocumentAction>,
    );

    expect(events.actionShown).toHaveBeenCalledTimes(1);
  });

  it('restores focus after an action completes', async () => {
    const restoreFocusRef = createRef<HTMLButtonElement>();
    let finish: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });

    render(
      <>
        <button ref={restoreFocusRef}>Opener</button>
        <DocumentAction
          actionKey="complete"
          surfaceKey="sheet"
          regionKey="footer"
          restoreFocusRef={restoreFocusRef}
          onClick={() => pending}
        >
          Complete
        </DocumentAction>
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));
    finish?.();

    await waitFor(() => expect(restoreFocusRef.current).toHaveFocus());
  });

  it('renders leading and trailing marks in the scored-ink order', () => {
    render(
      <DocumentAction
        actionKey="marked"
        surfaceKey="test"
        regionKey="marks"
        leading="+"
        trailing="→"
      >
        Marked
      </DocumentAction>,
    );

    const action = screen.getByRole('button', { name: 'Marked' });
    const leading = screen.getByText('+');
    const trailing = screen.getByText('→');

    expect(leading).toHaveAttribute('aria-hidden');
    expect(leading).toHaveClass('da-leading');
    expect(trailing).toHaveAttribute('aria-hidden');
    expect(trailing).toHaveClass('da-trailing');
    // Glyph value comes from CSS now, not a blanket opacity.
    expect(trailing).not.toHaveClass('opacity-75');

    const hooks = ['da-pool', 'da-leading', 'da-label', 'da-trailing', 'da-hit'];
    const anatomy = Array.from(action.children).map(
      (child) =>
        hooks.find((hook) => child.classList.contains(hook)) ?? child.className,
    );
    expect(anatomy).toEqual(hooks);
  });
});

describe('DocumentActionGroup', () => {
  it('accepts zero or one primary action', () => {
    const spy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { rerender } = render(
      <DocumentActionGroup surfaceKey="test" regionKey="one">
        <DocumentAction actionKey="secondary">Secondary</DocumentAction>
      </DocumentActionGroup>,
    );
    expect(spy).not.toHaveBeenCalled();

    rerender(
      <DocumentActionRow surfaceKey="test" regionKey="one">
        <DocumentAction actionKey="primary" variant="primary">
          Primary
        </DocumentAction>
        <DocumentAction actionKey="secondary">Secondary</DocumentAction>
      </DocumentActionRow>,
    );
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('reports multiple primaries in development', async () => {
    const spy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const WrappedPrimary = () => (
      <DocumentAction actionKey="one" variant="primary">
        One
      </DocumentAction>
    );
    render(
      <DocumentActionGroup surfaceKey="test" regionKey="too-many">
        <WrappedPrimary />
        <DocumentAction actionKey="two" variant="primary">
          Two
        </DocumentAction>
      </DocumentActionGroup>,
    );

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0]?.[0]).toContain('received 2 primary actions');
    spy.mockRestore();
  });
});
