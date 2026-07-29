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

const events = documentEvents as jest.Mocked<typeof documentEvents>;

describe('DocumentAction', () => {
  it.each([
    ['primary', 'bg-[var(--color-charcoal)]'],
    ['secondary', 'border-[var(--color-aged-oak)]'],
    ['tertiary', 'underline'],
    ['danger', 'bg-[var(--color-terracotta)]'],
  ] as const)(
    'renders the %s variant with the shared target and focus grammar',
    (variant, cls) => {
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
      expect(action).toHaveClass('min-h-11', 'min-w-11', 'text-[12px]', cls);
      expect(action.className).toContain('focus-visible:outline');
      expect(action).toHaveAttribute('data-action-key', `${variant}-action`);
      expect(action).toHaveAttribute('data-action-variant', variant);
      expect(action).toHaveAttribute('data-action-region', 'test-region');
      expect(action).toHaveAttribute('type', 'button');
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

  it('renders leading and trailing marks', () => {
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
    expect(screen.getByText('+')).toHaveAttribute('aria-hidden');
    expect(screen.getByText('→')).toHaveAttribute('aria-hidden');
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
