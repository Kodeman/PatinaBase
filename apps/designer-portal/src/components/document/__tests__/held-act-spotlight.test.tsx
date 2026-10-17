import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DocumentAction } from '../document-action';
import { DocSheet } from '../overlays/doc-sheet';
import { PaperFolioSheet } from '../overlays/paper-folio-sheet';
import type { SpotlightHold } from '@/lib/document/spotlight/use-hold-spotlight';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));

const REASON = 'Link a client with an email address.';

const layer = () => document.querySelector<HTMLElement>('[data-hold-spotlight]');
const windows = () =>
  Array.from(document.querySelectorAll('[data-hold-spotlight-window]')).map((el) =>
    el.getAttribute('data-hold-spotlight-window'),
  );
const bar = () => document.querySelector<HTMLElement>('[data-hold-spotlight-bar]')!;
const sendAct = () => screen.getByRole('button', { name: 'Send the agreement', hidden: true });

function Reason({ fixer = true }: { fixer?: boolean }) {
  return (
    <p id="why">
      {REASON}
      {fixer && <button type="button">Link a client</button>}
    </p>
  );
}

function Held({
  framed = true,
  fixer = true,
  onClick,
  onHeldActivate,
  holds,
}: {
  framed?: boolean;
  fixer?: boolean;
  onClick?: () => void;
  onHeldActivate?: () => void;
  holds?: SpotlightHold[];
}) {
  return (
    <div data-testid="frame" data-spotlight-frame={framed ? '' : undefined}>
      <h3>Agreement</h3>
      {holds?.map((hold) => (
        <div key={hold.id} id={`hold-${hold.id}`}>
          <input aria-label={`Field ${hold.id}`} />
        </div>
      ))}
      <Reason fixer={fixer} />
      <DocumentAction
        actionKey="send"
        variant="terminal"
        held
        disabled
        aria-describedby="why"
        onClick={onClick}
        onHeldActivate={onHeldActivate}
        holds={holds}
      >
        Send the agreement
      </DocumentAction>
    </div>
  );
}

const listed = (ids: string[]): SpotlightHold[] =>
  ids.map((id) => ({
    id,
    target: () => document.getElementById(`hold-${id}`),
    label: `No ${id}`,
    reason: `Set the ${id}.`,
  }));

describe('a held act with nothing of its own to say (US-36 K4)', () => {
  it('opens one window on its aria-describedby reason, with the fixer inside it as the fix', () => {
    const onClick = jest.fn();
    render(<Held onClick={onClick} />);
    fireEvent.click(sendAct());

    expect(onClick).not.toHaveBeenCalled();
    expect(windows()).toEqual(['why']);
    expect(screen.getByTestId('frame').contains(layer())).toBe(true);
    const fixer = screen.getByRole('button', { name: 'Link a client' });
    expect(fixer.closest('[inert]')).toBeNull();
    expect(document.activeElement).toBe(fixer);
    expect(screen.getByRole('heading', { name: 'Agreement', hidden: true }).closest('[inert]')).not.toBeNull();
    // The bar says the reason once, without repeating the fixer's label.
    expect(bar().querySelector('.hold-spotlight__reason')!.textContent).toBe(REASON);
    expect(screen.getByRole('status')).toHaveTextContent(`1 thing needs attention: ${REASON}`);
  });

  it('shows the reason alone in the bar when the reason holds no fixer', () => {
    render(<Held fixer={false} />);
    fireEvent.click(sendAct());

    expect(windows()).toEqual(['why']);
    expect(bar().querySelector('.hold-spotlight__reason')!.textContent).toBe(REASON);
    expect(within(bar()).getAllByRole('button').map((el) => el.textContent)).toEqual(['Close']);
    expect(document.activeElement).toBe(within(bar()).getByRole('button', { name: 'Close' }));
  });

  it('keeps today’s behaviour when no frame holds the act', () => {
    const onClick = jest.fn();
    render(<Held framed={false} onClick={onClick} />);
    const action = sendAct();
    action.focus();
    fireEvent.click(action);

    expect(onClick).not.toHaveBeenCalled();
    expect(layer()).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('[inert]')).toBeNull();
    expect(action).toHaveFocus();
  });

  it('keeps today’s behaviour for an act in a fixed layer inside the frame', () => {
    render(
      <div data-spotlight-frame>
        <div style={{ position: 'fixed' }}>
          <Reason />
          <DocumentAction actionKey="send" held disabled aria-describedby="why">
            Send the agreement
          </DocumentAction>
        </div>
      </div>,
    );
    fireEvent.click(sendAct());
    expect(layer()).toBeNull();
  });

  it('opens on a held link the same way', () => {
    render(
      <div data-spotlight-frame>
        <Reason />
        <DocumentAction actionKey="open" href="/doc/1" held disabled aria-describedby="why">
          Open the paper
        </DocumentAction>
      </div>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Open the paper' }));
    expect(windows()).toEqual(['why']);
  });

  it('closes once the act is no longer held and hands focus back to it', async () => {
    function Fixable() {
      const [linked, setLinked] = useState(false);
      return (
        <div data-spotlight-frame>
          {!linked && (
            <p id="why">
              {REASON}
              <button type="button" onClick={() => setLinked(true)}>
                Link a client
              </button>
            </p>
          )}
          <DocumentAction
            actionKey="send"
            held={!linked}
            disabled={!linked}
            aria-describedby={linked ? undefined : 'why'}
          >
            Send the agreement
          </DocumentAction>
        </div>
      );
    }
    render(<Fixable />);
    fireEvent.click(sendAct());
    fireEvent.click(screen.getByRole('button', { name: 'Link a client' }));

    await waitFor(() => expect(layer()).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent('All set.');
    expect(sendAct()).toHaveFocus();
  });
});

describe('a held act that names its fix region (R186)', () => {
  const CHOOSE = 'Choose one to continue.';
  const continueAct = () => screen.getByRole('button', { name: 'Continue', hidden: true });

  function Chooser({ named = true, outside = false }: { named?: boolean; outside?: boolean }) {
    const [choice, setChoice] = useState<string | null>(null);
    const choices = (
      <fieldset id="choices">
        <legend>What changed?</legend>
        {['On a piece', 'On the agreement'].map((label) => (
          <label key={label}>
            <input
              type="radio"
              name="change"
              checked={choice === label}
              onChange={() => setChoice(label)}
            />
            {label}
          </label>
        ))}
      </fieldset>
    );
    return (
      <>
        {outside && choices}
        <div data-testid="frame" data-spotlight-frame>
          <h3>Record a change</h3>
          {!outside && choices}
          {/* The reason stays put: the act's own release lifts the hold. */}
          <p id="why">{CHOOSE}</p>
          <DocumentAction
            actionKey="continue"
            held={!choice}
            disabled={!choice}
            aria-describedby="why"
            holdFix={named ? 'choices' : undefined}
          >
            Continue
          </DocumentAction>
        </div>
      </>
    );
  }

  const radio = (name: RegExp) => screen.getByRole('radio', { name, hidden: true });

  it('windows the fix region, live, with focus on its first control and the reason said once', () => {
    render(<Chooser />);
    fireEvent.click(continueAct());

    expect(windows()).toEqual(['choices']);
    expect(document.getElementById('choices')!.closest('[inert]')).toBeNull();
    expect(radio(/On the agreement/).closest('[inert]')).toBeNull();
    expect(document.activeElement).toBe(radio(/On a piece/));
    expect(screen.getByRole('heading', { name: 'Record a change', hidden: true }).closest('[inert]')).not.toBeNull();
    expect(bar().querySelector('.hold-spotlight__reason')!.textContent).toBe(CHOOSE);
    expect(screen.getByRole('status').textContent).toBe(`1 thing needs attention: ${CHOOSE}`);
  });

  it('lifts on its own once fixed and hands focus back to the act', async () => {
    render(<Chooser />);
    fireEvent.click(continueAct());
    fireEvent.click(radio(/On the agreement/));

    await waitFor(() => expect(layer()).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent('All set.');
    expect(continueAct()).toHaveFocus();
    expect(document.querySelector('[inert]')).toBeNull();
  });

  it('keeps the reason window and Close when the site names no fix region', () => {
    render(<Chooser named={false} />);
    fireEvent.click(continueAct());

    expect(windows()).toEqual(['why']);
    expect(document.getElementById('choices')!.closest('[inert]')).not.toBeNull();
    expect(document.activeElement).toBe(within(bar()).getByRole('button', { name: 'Close' }));
  });

  it('falls back to the reason window when the named region is outside the frame', () => {
    render(<Chooser outside />);
    fireEvent.click(continueAct());

    expect(windows()).toEqual(['why']);
    expect(screen.getByTestId('frame').contains(layer())).toBe(true);
    expect(document.activeElement).toBe(within(bar()).getByRole('button', { name: 'Close' }));
  });
});

describe('a held act with its own holds or its own answer', () => {
  it('opens one window per hold when the site passes holds', () => {
    render(<Held holds={listed(['client', 'price', 'studio'])} />);
    fireEvent.click(sendAct());

    expect(windows()).toEqual(['client', 'price', 'studio']);
    expect(screen.getByRole('status')).toHaveTextContent(
      '3 things need attention. First: Set the client.',
    );
  });

  it('leaves an onHeldActivate site exactly as it was', () => {
    const onClick = jest.fn();
    const say = jest.fn();
    render(<Held onClick={onClick} onHeldActivate={say} />);
    fireEvent.click(sendAct());

    expect(say).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
    expect(layer()).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('[inert]')).toBeNull();
  });

  it('runs onHeldActivate and still opens the listed holds when both are given', () => {
    const say = jest.fn();
    render(<Held onHeldActivate={say} holds={listed(['client', 'price'])} />);
    fireEvent.click(sendAct());

    expect(say).toHaveBeenCalledTimes(1);
    expect(windows()).toEqual(['client', 'price']);
  });
});

describe('the frames a held act opens in', () => {
  it('opens inside a DocSheet panel', () => {
    render(
      <DocSheet open onClose={() => {}} title="Send the agreement">
        <Reason />
        <DocumentAction actionKey="send" held disabled aria-describedby="why">
          Send the agreement
        </DocumentAction>
      </DocSheet>,
    );
    fireEvent.click(sendAct());

    const panel = document.querySelector('[data-doc-sheet-panel]')!;
    expect(panel).toHaveAttribute('data-spotlight-frame');
    expect(panel.contains(layer())).toBe(true);
    expect(windows()).toEqual(['why']);
  });

  it('opens inside a PaperFolioSheet panel', () => {
    render(
      <PaperFolioSheet open onClose={() => {}} title="Invoice">
        <Reason />
        <DocumentAction actionKey="send" held disabled aria-describedby="why">
          Send the agreement
        </DocumentAction>
      </PaperFolioSheet>,
    );
    fireEvent.click(sendAct());

    const panel = document.querySelector('.paper-folio-panel')!;
    expect(panel).toHaveAttribute('data-spotlight-frame');
    expect(panel.contains(layer())).toBe(true);
    expect(windows()).toEqual(['why']);
  });
});
