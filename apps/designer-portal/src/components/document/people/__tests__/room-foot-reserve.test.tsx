import { render, screen } from '@testing-library/react';
import { RoomShell } from '../../rooms/room-shell';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

it('reserves the measured drawer height beneath the firm card instead of a fixed height', () => {
  const { container } = render(
    <RoomShell title="Studio contacts" topLevel>
      <button type="button">Open the door</button>
    </RoomShell>,
  );
  const act = screen.getByRole('button', { name: 'Open the door' });
  const frame = container.querySelector('[data-spotlight-frame]');
  expect(frame).toContainElement(act);
  // jsdom has no layout: the CSS reserve is the testable contract. It follows
  // the shell's measured inset at both widths, plus the existing 24px gap.
  expect(frame).toHaveClass('pb-[calc(var(--doc-shell-bottom-inset)+1.5rem)]');
});
