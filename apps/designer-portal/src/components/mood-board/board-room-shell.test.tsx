import { useRef } from 'react';
import { render } from '@testing-library/react';
import { reviewMediaBannerCopy, useBoardRoomBoundary } from './board-room-shell';

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
