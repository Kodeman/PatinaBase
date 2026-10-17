import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentAction } from '../document-action';
import { DocSheet } from '../overlays/doc-sheet';
import { PaperFolioSheet } from '../overlays/paper-folio-sheet';
import { RoomShell } from '../rooms/room-shell';
import { RoomSheet } from '../rooms/room-sheet';
import type { SpotlightHold } from '@/lib/document/spotlight/use-hold-spotlight';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

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

  it('moves focus to its reason when no frame holds the act, never silent (SQ-1211)', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const onClick = jest.fn();
    render(<Held framed={false} onClick={onClick} />);
    const action = sendAct();
    action.focus();
    fireEvent.click(action);

    expect(onClick).not.toHaveBeenCalled();
    expect(layer()).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('[inert]')).toBeNull();
    const reason = document.getElementById('why')!;
    expect(reason).toHaveFocus();
    expect(reason).toHaveAttribute('tabindex', '-1');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"Send the agreement"'));
    warn.mockRestore();
  });

  it('leaves focus on an unframed act that names no reason', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <DocumentAction actionKey="earlier" held disabled>
        Earlier
      </DocumentAction>,
    );
    const action = screen.getByRole('button', { name: 'Earlier', hidden: true });
    action.focus();
    fireEvent.click(action);

    expect(layer()).toBeNull();
    expect(action).toHaveFocus();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"Earlier"'));
    warn.mockRestore();
  });

  it('leaves an unframed onHeldActivate site to answer alone', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const onHeldActivate = jest.fn();
    render(<Held framed={false} onHeldActivate={onHeldActivate} />);
    const action = sendAct();
    action.focus();
    fireEvent.click(action);

    expect(onHeldActivate).toHaveBeenCalledTimes(1);
    expect(action).toHaveFocus();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('moves focus to its reason for an act in a fixed layer inside the frame', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
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
    expect(document.getElementById('why')).toHaveFocus();
    warn.mockRestore();
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

  function Chooser({
    named = true,
    outside = false,
    shown = true,
  }: {
    named?: boolean;
    outside?: boolean;
    shown?: boolean;
  }) {
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
          {!outside && shown && choices}
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

  it('keeps the spotlight on the reason while the fix region is away, and windows it again on its return', async () => {
    const { rerender } = render(<Chooser />);
    fireEvent.click(continueAct());
    expect(windows()).toEqual(['choices']);

    rerender(<Chooser shown={false} />);
    await waitFor(() => expect(document.getElementById('why')!.closest('[inert]')).toBeNull());
    expect(layer()).not.toBeNull();
    expect(screen.getByRole('status')).not.toHaveTextContent('All set.');
    expect(continueAct()).not.toHaveFocus();

    rerender(<Chooser />);
    await waitFor(() => expect(radio(/On the agreement/).closest('[inert]')).toBeNull());
    fireEvent.click(radio(/On the agreement/));
    await waitFor(() => expect(layer()).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent('All set.');
  });

  it('hands focus back to the act after a choice made from the keyboard-reachable radio', async () => {
    const user = userEvent.setup();
    render(<Chooser />);
    fireEvent.click(continueAct());
    await user.click(radio(/On the agreement/));

    await waitFor(() => expect(layer()).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent('All set.');
    expect(continueAct()).toHaveFocus();
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

describe('a hold that clears while its field is being typed in (SQ-1201 F4)', () => {
  const saveAct = () => screen.getByRole('button', { name: 'Save the delivery', hidden: true });
  const field = (id: string) => screen.getByRole('textbox', { name: id, hidden: true });
  // The spotlight re-reads its holds a frame after they change.
  const nextFrame = () =>
    act(() => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())));

  function Fields({
    ids,
    onClick,
    targetField = false,
  }: {
    ids: string[];
    onClick?: () => void;
    /** Each hold targets its input itself, not the input's wrapper. */
    targetField?: boolean;
  }) {
    const [values, setValues] = useState<Record<string, string>>({});
    const holds: SpotlightHold[] = ids
      .filter((id) => !values[id])
      .map((id) => ({
        id,
        target: () =>
          targetField
            ? document.getElementById(`input-${id}`)
            : document.getElementById(`field-${id}`),
        label: `No ${id}`,
        reason: `Set the ${id}.`,
      }));
    const fillAll = () => setValues(Object.fromEntries(ids.map((id) => [id, 'hello@example.com'])));
    return (
      <>
        {/* A stand-in for a dialog above the frame, such as HouseholdSheet. */}
        <button type="button" onClick={fillAll}>
          Save their email
        </button>
        <div data-testid="frame" data-spotlight-frame>
          <h3>Delivery</h3>
          {ids.map((id) => (
            <div key={id} id={`field-${id}`}>
              <label>
                {id}
                <input
                  id={`input-${id}`}
                  value={values[id] ?? ''}
                  onChange={(event) => setValues((prior) => ({ ...prior, [id]: event.target.value }))}
                />
              </label>
            </div>
          ))}
          <DocumentAction
            actionKey="save"
            held={holds.length > 0}
            disabled={holds.length > 0}
            holds={holds}
            onClick={onClick}
          >
            Save the delivery
          </DocumentAction>
        </div>
      </>
    );
  }

  async function typeKeyByKey(
    user: ReturnType<typeof userEvent.setup>,
    el: HTMLElement,
    text: string,
  ) {
    for (const key of text) {
      await user.type(el, key, { skipClick: true });
      await nextFrame();
      expect(el).toHaveFocus();
    }
  }

  it('keeps every key in the first of two fields, its window lingering until focus leaves it', async () => {
    const user = userEvent.setup();
    render(<Fields ids={['arrival', 'notes']} />);
    fireEvent.click(saveAct());
    const first = field('arrival');
    expect(first).toHaveFocus();
    expect(windows()).toEqual(['arrival', 'notes']);

    await typeKeyByKey(user, first, 'Arrival date');

    expect(first).toHaveValue('Arrival date');
    expect(windows().sort()).toEqual(['arrival', 'notes']);
    expect(first.closest('[inert]')).toBeNull();
    expect(layer()).not.toBeNull();

    await user.tab();
    expect(field('notes')).toHaveFocus();
    await waitFor(() => expect(windows()).toEqual(['notes']));
    expect(first.closest('[inert]')).not.toBeNull();
  });

  it('lifts on the last field’s first key, keeps focus in it and never presses the act', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(<Fields ids={['arrival']} onClick={onClick} />);
    fireEvent.click(saveAct());
    const only = field('arrival');
    expect(only).toHaveFocus();

    await typeKeyByKey(user, only, 'Arrival date');

    expect(only).toHaveValue('Arrival date');
    expect(layer()).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('All set.');
    expect(onClick).toHaveBeenCalledTimes(0);
  });

  it('focuses a hold’s target directly when the target is the field itself', () => {
    render(<Fields ids={['arrival', 'notes']} targetField />);
    fireEvent.click(saveAct());

    expect(field('arrival')).toHaveFocus();
  });

  it('leaves focus outside the frame when the last hold clears from a dialog above it', async () => {
    const user = userEvent.setup();
    render(<Fields ids={['arrival']} />);
    fireEvent.click(saveAct());
    const outside = screen.getByRole('button', { name: 'Save their email' });

    await user.click(outside);

    await waitFor(() => expect(layer()).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent('All set.');
    expect(outside).toHaveFocus();
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

  it('opens inside a Room’s paper column, not over its header line (SQ-1211)', () => {
    render(
      <RoomShell title="People">
        <Reason />
        <DocumentAction actionKey="send" held disabled aria-describedby="why">
          Send the agreement
        </DocumentAction>
      </RoomShell>,
    );
    fireEvent.click(sendAct());

    const paper = document.querySelector<HTMLElement>('[data-spotlight-frame]')!;
    expect(paper.contains(layer())).toBe(true);
    expect(paper.querySelector('[data-room-header-line]')).toBeNull();
    expect(windows()).toEqual(['why']);
  });

  it('opens inside a RoomSheet panel (SQ-1211)', () => {
    render(
      <RoomSheet open onClose={() => {}} title="Add a person">
        <Reason />
        <DocumentAction actionKey="send" held disabled aria-describedby="why">
          Send the agreement
        </DocumentAction>
      </RoomSheet>,
    );
    fireEvent.click(sendAct());

    const panel = screen.getByRole('dialog', { name: 'Add a person', hidden: true });
    expect(panel).toHaveAttribute('data-spotlight-frame');
    expect(panel.contains(layer())).toBe(true);
    expect(windows()).toEqual(['why']);
  });
});
