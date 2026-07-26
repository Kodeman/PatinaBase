import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MobileActionDock } from './mobile-action-dock';
import {
  MobileShellProvider,
  useMobilePrimaryAction,
  useMobileShell,
  type MobilePrimaryAction,
} from './mobile-shell';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

function Registration({
  action,
  priority = 0,
}: {
  action: MobilePrimaryAction | null;
  priority?: number;
}) {
  useMobilePrimaryAction(action, { priority });
  return null;
}

function SheetControl() {
  const { openDrawer, closeSheet } = useMobileShell();
  return (
    <>
      <button onClick={openDrawer}>Open sheet</button>
      <button onClick={closeSheet}>Close sheet</button>
    </>
  );
}

function StatefulRegistration() {
  const [ready, setReady] = useState(false);
  useMobilePrimaryAction({
    actionKey: ready ? 'send' : 'draft',
    surfaceKey: 'drafting',
    regionKey: 'room-head',
    label: ready ? 'Send proposal' : 'Continue drafting',
    target: { kind: 'press', onPress: () => undefined },
  });
  return <button onClick={() => setReady(true)}>Ready</button>;
}

describe('MobileActionDock', () => {
  it('registers a press action, updates it, and reserves safe-area clearance', () => {
    const press = jest.fn();
    const { rerender } = render(
      <MobileShellProvider>
        <Registration
          action={{
            actionKey: 'capture',
            surfaceKey: 'desk',
            regionKey: 'desk-head',
            label: 'Capture a lead',
            target: { kind: 'press', onPress: press },
          }}
        />
        <MobileActionDock />
      </MobileShellProvider>,
    );

    const dock = screen.getByTestId('mobile-action-dock');
    expect(dock).toHaveClass('min-[980px]:hidden');
    expect(
      screen.getByTestId('mobile-action-dock-clearance').className,
    ).toContain('safe-area-inset-bottom');
    fireEvent.click(screen.getByRole('button', { name: 'Capture a lead' }));
    expect(press).toHaveBeenCalledTimes(1);

    rerender(
      <MobileShellProvider>
        <Registration
          action={{
            actionKey: 'open',
            surfaceKey: 'desk',
            regionKey: 'desk-head',
            label: 'Open a project',
            target: { kind: 'press', onPress: press },
          }}
        />
        <MobileActionDock />
      </MobileShellProvider>,
    );
    expect(
      screen.getByRole('button', { name: 'Open a project' }),
    ).toBeInTheDocument();
  });

  it('uses the highest-priority active registration and falls back on cleanup', () => {
    const { rerender } = render(
      <MobileShellProvider>
        <Registration
          action={{
            actionKey: 'message',
            surfaceKey: 'document',
            regionKey: 'letterhead',
            label: 'Message the family',
            target: { kind: 'press', onPress: () => undefined },
          }}
        />
        <Registration
          priority={10}
          action={{
            actionKey: 'send',
            surfaceKey: 'document',
            regionKey: 'proposal',
            label: 'Send proposal',
            target: { kind: 'press', onPress: () => undefined },
          }}
        />
        <MobileActionDock />
      </MobileShellProvider>,
    );
    expect(
      screen.getByRole('button', { name: 'Send proposal' }),
    ).toBeInTheDocument();

    rerender(
      <MobileShellProvider>
        <Registration
          action={{
            actionKey: 'message',
            surfaceKey: 'document',
            regionKey: 'letterhead',
            label: 'Message the family',
            target: { kind: 'press', onPress: () => undefined },
          }}
        />
        <MobileActionDock />
      </MobileShellProvider>,
    );
    expect(
      screen.getByRole('button', { name: 'Message the family' }),
    ).toBeInTheDocument();
  });

  it('updates lifecycle state and suppresses the dock while a shell sheet is open', () => {
    render(
      <MobileShellProvider>
        <StatefulRegistration />
        <SheetControl />
        <MobileActionDock />
      </MobileShellProvider>,
    );

    expect(
      screen.getByRole('button', { name: 'Continue drafting' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ready' }));
    expect(
      screen.getByRole('button', { name: 'Send proposal' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open sheet' }));
    expect(screen.queryByTestId('mobile-action-dock')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close sheet' }));
    expect(screen.getByTestId('mobile-action-dock')).toBeInTheDocument();
  });

  it('renders href targets and hides when no action is registered', () => {
    const { rerender } = render(
      <MobileShellProvider>
        <Registration
          action={{
            actionKey: 'open-library',
            surfaceKey: 'library',
            regionKey: 'room-head',
            label: 'Open the Library',
            target: { kind: 'href', href: '/library' },
          }}
        />
        <MobileActionDock />
      </MobileShellProvider>,
    );
    expect(
      screen.getByRole('link', { name: 'Open the Library' }),
    ).toHaveAttribute('href', '/library');

    rerender(
      <MobileShellProvider>
        <Registration action={null} />
        <MobileActionDock />
      </MobileShellProvider>,
    );
    expect(screen.queryByTestId('mobile-action-dock')).not.toBeInTheDocument();
  });
});
