import { fireEvent, render, screen } from '@testing-library/react';
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

it('keeps hours, account and help reachable without another menu', () => {
  render(<StudioMasthead studioName="Studio" viewerName="Leah" dateLabel="Today" />);
  fireEvent.click(screen.getByRole('button', { name: 'Hours' }));
  expect(openLedger).toHaveBeenCalledWith('hours');
  expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/help');
  expect(screen.getByRole('button', { name: 'Your account — Leah' })).toBeInTheDocument();
});
