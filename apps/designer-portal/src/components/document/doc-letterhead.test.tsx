/**
 * The letterhead's room line (I136 / F25). It names the room in hand at every
 * width — there is no media query here, and there must not be one: B1 lets a
 * hold travel below 1440, so the sentence that explains the lift has to travel
 * with it. With a release handler the line is one act: scored ink, no plate,
 * and the belt to the ticket's own chip.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { DocLetterhead } from './doc-letterhead';

describe('the letterhead, with a room in hand', () => {
  it('names the room, and prints nothing when no room is held', () => {
    const { rerender } = render(
      <DocLetterhead title="Vandersteen residence" vitals="Procurement" />,
    );
    expect(document.querySelector('[data-in-hand-room]')).toBeNull();

    rerender(
      <DocLetterhead
        title="Vandersteen residence"
        vitals="Procurement"
        inHandRoomName="Living room"
      />,
    );
    expect(document.querySelector('[data-in-hand-room]')).toHaveTextContent(
      'In hand · Living room',
    );
  });

  it('stays a plain statement with no release handler', () => {
    render(
      <DocLetterhead
        title="Vandersteen residence"
        vitals="Procurement"
        inHandRoomName="Living room"
      />,
    );
    const line = document.querySelector('[data-in-hand-room]')!;
    expect(line.tagName).toBe('P');
    expect(line).not.toHaveAttribute('data-release-room');
  });

  it('becomes one act that puts the room down when a release is offered', () => {
    const onReleaseRoom = jest.fn();
    render(
      <DocLetterhead
        title="Vandersteen residence"
        vitals="Procurement"
        inHandRoomName="Living room"
        onReleaseRoom={onReleaseRoom}
      />,
    );

    const release = screen.getByRole('button', {
      name: 'Put down Living room',
    });
    expect(release).toHaveAttribute('data-in-hand-room');
    expect(release).toHaveAttribute('data-release-room');
    // One control, not a statement plus a button beside it.
    expect(document.querySelectorAll('[data-in-hand-room]')).toHaveLength(1);
    expect(release).toHaveTextContent('In hand · Living room');
    expect(release).toHaveTextContent('Put down');

    fireEvent.click(release);
    expect(onReleaseRoom).toHaveBeenCalledTimes(1);
  });

  it('prints the title at the Life Review’s 40px and closes on the mid rule', () => {
    const { container } = render(
      <DocLetterhead title="Vandersteen residence" vitals="Procurement" />,
    );
    const title = screen.getByRole('heading', { name: 'Vandersteen residence' });
    expect(title).toHaveClass(
      'font-heading',
      'text-[40px]',
      'tracking-[-0.015em]',
      'text-[var(--text-primary)]',
    );
    const header = container.querySelector('header')!;
    expect(header).toHaveClass('doc-rule-mid');
    expect(header.className).not.toMatch(/border-b\b/);
  });

  it('carries no shadow (D4)', () => {
    render(
      <DocLetterhead
        title="Vandersteen residence"
        vitals="Procurement"
        inHandRoomName="Living room"
        onReleaseRoom={jest.fn()}
      />,
    );
    document.querySelectorAll('*').forEach((el) => {
      expect(el.className.toString()).not.toMatch(/shadow/);
    });
  });
});
