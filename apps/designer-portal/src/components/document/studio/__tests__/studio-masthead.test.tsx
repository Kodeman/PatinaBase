import { fireEvent, render, screen, within } from '@testing-library/react';
import { StudioMasthead, STUDIO_DOORS } from '../studio-masthead';
import { openCommandBar, openLedger } from '@/components/document/command-bar';

jest.mock('@/components/document/command-bar', () => ({
  openCommandBar: jest.fn(), openLedger: jest.fn(),
}));
jest.mock('@/components/document/overlays/post-sheet', () => ({ openPost: jest.fn() }));
jest.mock('@/components/document/account/account-sheet', () => ({ openAccount: jest.fn() }));

it('keeps command search and registry doors on their existing owners', () => {
  render(<StudioMasthead studioName="A growing design studio" viewerName="Leah Designer" dateLabel="24 October 2026" />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '  living room  ' } });
  fireEvent.submit(screen.getByRole('search'));
  expect(openCommandBar).toHaveBeenCalledWith('living room');
  for (const door of STUDIO_DOORS.filter((entry) => entry.key !== 'the-post')) {
    fireEvent.click(screen.getByRole('button', { name: door.word }));
    expect(openLedger).toHaveBeenCalledWith(door.key);
  }
  expect(screen.getByRole('button', { name: 'Your account — Leah Designer' })).toBeInTheDocument();
});

it('marks the canonical Studio host current and keeps phone primary doors mounted with touch targets', () => {
  render(<StudioMasthead studioName="Studio" viewerName="Leah" dateLabel="Today" />);
  const nav = screen.getByRole('navigation', { name: 'Studio' });
  const studio = within(nav).getByRole('link', { name: 'Studio' });
  expect(studio).toHaveAttribute('href', '/desk');
  expect(studio).toHaveAttribute('aria-current', 'page');
  expect(studio).toHaveAttribute('data-studio-door', 'desk-host');
  expect(nav).not.toHaveClass('hidden');
  expect(nav).toHaveClass('w-full');
  expect(nav.querySelector('ul')).toHaveClass('flex-wrap');
  for (const name of ['Library', 'People', 'Studio books', 'Correspondence']) {
    const door = within(nav).getByRole('button', { name });
    expect(door).toBeVisible();
    expect(door).toHaveClass('min-h-11', 'min-w-11');
    expect(door).not.toHaveAttribute('aria-current');
  }
});

it('keeps hours, account and help reachable without another menu', () => {
  render(<StudioMasthead studioName="Studio" viewerName="Leah" dateLabel="Today" />);
  fireEvent.click(screen.getByRole('button', { name: 'Hours' }));
  expect(openLedger).toHaveBeenCalledWith('hours');
  expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/help');
  expect(screen.getByRole('button', { name: 'Your account — Leah' })).toBeInTheDocument();
});
