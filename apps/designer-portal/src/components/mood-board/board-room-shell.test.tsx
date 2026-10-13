import { useRef, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  reviewMediaBannerCopy,
  useBoardRoomBoundary,
  useTidyShortcuts,
  useToolsSheetModal,
} from './board-room-shell';

/**
 * The room's Tools markup as the shell lays it out: the head's act, the veil,
 * the aside whose heading (tabIndex -1) takes focus when the act opens it, and
 * the room's Tidy keys with a spacing session that can be open behind it.
 */
function ToolsRoom({
  initiallyOpen = true,
  tidySessionOpen = false,
  onTidy = () => {},
  onEndTidySession = () => {},
}: {
  initiallyOpen?: boolean;
  tidySessionOpen?: boolean;
  onTidy?: () => void;
  onEndTidySession?: () => void;
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  const actRef = useRef<HTMLButtonElement | null>(null);
  const headRef = useRef<HTMLParagraphElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(initiallyOpen);
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => actRef.current?.focus());
  };
  useBoardRoomBoundary(rootRef, true);
  const modalProps = useToolsSheetModal(rootRef, sheetRef, open, close);
  useTidyShortcuts({
    enabled: true,
    sessionOpen: tidySessionOpen,
    suppressed: 'aria-modal' in modalProps,
    onTidy,
    onEndSession: onEndTidySession,
  });
  return (
    <main ref={rootRef} tabIndex={-1}>
      <header>
        <button
          type="button"
          ref={actRef}
          onClick={() => {
            setOpen(true);
            requestAnimationFrame(() => headRef.current?.focus());
          }}
        >
          Tools
        </button>
        <button type="button">Present</button>
      </header>
      <div>
        {open && <div aria-hidden className="veil br-tools-veil" onClick={close} />}
        <aside ref={sheetRef} aria-labelledby="tools-head" {...modalProps} data-open={open ? 'true' : 'false'}>
          <p id="tools-head" ref={headRef} tabIndex={-1}>Tools</p>
          <button type="button">Add a note</button>
          <button type="button" onClick={close}>Put back</button>
        </aside>
        <div data-testid="workspace">
          {tidySessionOpen && <div role="group" aria-label="Tidy spacing" />}
          <button type="button">Zoom in</button>
        </div>
      </div>
    </main>
  );
}

/** Opens the sheet the way a designer does: the Tools act, then focus lands on its heading. */
async function openToolsFromAct() {
  fireEvent.click(screen.getByRole('button', { name: 'Tools' }));
  const head = await waitFor(() => {
    const element = document.getElementById('tools-head');
    expect(element).toHaveFocus();
    return element as HTMLElement;
  });
  return head;
}

function setWide(wide: boolean) {
  (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
    matches: wide,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

describe('narrow Tools sheet is a modal (R3)', () => {
  afterEach(() => setWide(false));

  it('below md wears dialog semantics and keeps Tab inside the sheet', () => {
    setWide(false);
    render(<ToolsRoom />);
    const sheet = screen.getByRole('dialog', { name: 'Tools' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');

    const first = screen.getByRole('button', { name: 'Add a note' });
    const last = screen.getByRole('button', { name: 'Put back' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    // Focus that strays outside is pulled back in, never onto the room behind.
    screen.getByRole('button', { name: 'Zoom in' }).focus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Tab' });
    expect(sheet).toContainElement(document.activeElement as HTMLElement);
  });

  it('closes on Escape from anywhere and returns focus to the Tools act', async () => {
    setWide(false);
    render(<ToolsRoom />);
    expect(screen.getByRole('dialog', { name: 'Tools' })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Tools' })),
    );
  });

  it('leaves an Escape a nested sheet already took', () => {
    setWide(false);
    render(<ToolsRoom />);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    event.preventDefault();
    document.body.dispatchEvent(event);
    expect(screen.getByRole('dialog', { name: 'Tools' })).toBeInTheDocument();
  });

  it('opened from the act, the first Shift+Tab from its heading stays inside the sheet', async () => {
    setWide(false);
    render(<ToolsRoom initiallyOpen={false} />);
    const head = await openToolsFromAct();
    const sheet = screen.getByRole('dialog', { name: 'Tools' });
    fireEvent.keyDown(head, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Put back' }));
    expect(sheet).toContainElement(document.activeElement as HTMLElement);
  });

  it('makes the rest of the room inert while open, and only while open', async () => {
    setWide(false);
    const { container } = render(<ToolsRoom initiallyOpen={false} />);
    const header = container.querySelector('header') as HTMLElement;
    const workspace = screen.getByTestId('workspace');
    expect(header).not.toHaveAttribute('inert');
    await openToolsFromAct();
    const sheet = screen.getByRole('dialog', { name: 'Tools' });
    expect(header).toHaveAttribute('inert');
    expect(workspace).toHaveAttribute('inert');
    expect(sheet).not.toHaveAttribute('inert');
    // The veil stays live: a tap on it is how the sheet is put back.
    expect(container.querySelector('.veil')).not.toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', { name: 'Put back' }));
    expect(header).not.toHaveAttribute('inert');
    expect(workspace).not.toHaveAttribute('inert');
  });

  it('Escape with a Tidy session open puts Tools back and leaves the session alone', async () => {
    setWide(false);
    const onEndTidySession = jest.fn();
    render(<ToolsRoom initiallyOpen={false} tidySessionOpen onEndTidySession={onEndTidySession} />);
    const head = await openToolsFromAct();
    fireEvent.keyDown(head, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onEndTidySession).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'Tidy spacing' })).toBeInTheDocument();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Tools' })),
    );
    // Back in the room, Escape ends the session as before.
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    expect(onEndTidySession).toHaveBeenCalledTimes(1);
  });

  it('Shift+T does nothing behind the open sheet', async () => {
    setWide(false);
    const onTidy = jest.fn();
    render(<ToolsRoom initiallyOpen={false} onTidy={onTidy} />);
    const head = await openToolsFromAct();
    const event = new KeyboardEvent('keydown', { key: 'T', shiftKey: true, bubbles: true, cancelable: true });
    head.dispatchEvent(event);
    expect(onTidy).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(screen.getByRole('dialog', { name: 'Tools' })).toBeInTheDocument();
    // With the sheet put back, Shift+T tidies again.
    fireEvent.click(screen.getByRole('button', { name: 'Put back' }));
    fireEvent.keyDown(document.body, { key: 'T', shiftKey: true });
    expect(onTidy).toHaveBeenCalledTimes(1);
  });

  it('at md and up stays the side column: no dialog, Escape and Tab untouched', () => {
    setWide(true);
    render(<ToolsRoom />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    const putBack = screen.getByRole('button', { name: 'Put back' });
    putBack.focus();
    fireEvent.keyDown(putBack, { key: 'Tab' });
    // The room's own trap still runs across the whole room; it does not wrap here.
    expect(document.activeElement).toBe(putBack);
    expect(screen.getByRole('complementary')).toHaveAttribute('data-open', 'true');
  });
});

function Harness({ active }: { active: boolean }) {
  const ref = useRef<HTMLElement | null>(null);
  useBoardRoomBoundary(ref, active);
  return <main ref={ref} tabIndex={-1} />;
}

function dropEvent(): DragEvent {
  const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', { value: {}, configurable: true });
  return event;
}

/** Dispatches a drop event that originates from `target` so it bubbles to window with that target. */
function dispatchDropFrom(target: HTMLElement): { event: DragEvent; preventDefault: jest.SpyInstance } {
  const event = dropEvent();
  const preventDefault = jest.spyOn(event, 'preventDefault');
  target.dispatchEvent(event);
  return { event, preventDefault };
}

describe('useBoardRoomBoundary window drag containment', () => {
  it('swallows a window drop the canvas did not accept, so it never navigates the tab', () => {
    render(<Harness active />);
    const event = dropEvent();
    const preventDefault = jest.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('still swallows a drop that bubbles from a plain element', () => {
    render(<Harness active />);
    const div = document.createElement('div');
    document.body.appendChild(div);
    const { preventDefault } = dispatchDropFrom(div);
    expect(preventDefault).toHaveBeenCalled();
    div.remove();
  });

  it('leaves a drop alone when it lands on an editable field, so native text-drag keeps working', () => {
    render(<Harness active />);
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const { preventDefault } = dispatchDropFrom(textarea);
    expect(preventDefault).not.toHaveBeenCalled();
    textarea.remove();
  });

  it('leaves a drop alone when it lands on a text input', () => {
    render(<Harness active />);
    const input = document.createElement('input');
    document.body.appendChild(input);
    const { preventDefault } = dispatchDropFrom(input);
    expect(preventDefault).not.toHaveBeenCalled();
    input.remove();
  });

  it('leaves a drop alone once the canvas has already called preventDefault', () => {
    render(<Harness active />);
    const event = dropEvent();
    event.preventDefault(); // simulates the canvas's own onDrop accepting it
    const preventDefault = jest.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('removes the window listeners on unmount', () => {
    const { unmount } = render(<Harness active />);
    unmount();
    const event = dropEvent();
    const preventDefault = jest.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});

describe('reviewMediaBannerCopy (VD3)', () => {
  it('speaks plainly instead of internal pipeline jargon', () => {
    expect(reviewMediaBannerCopy(2)).toBe(
      '2 pins still need a real photo before this board can be published.',
    );
    expect(reviewMediaBannerCopy(2)).not.toMatch(/review-media|preparation/i);
  });

  it('uses singular phrasing for exactly one pin', () => {
    expect(reviewMediaBannerCopy(1)).toBe(
      '1 pin still needs a real photo before this board can be published.',
    );
  });
});
