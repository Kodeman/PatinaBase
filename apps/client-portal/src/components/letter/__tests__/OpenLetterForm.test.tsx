import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { OpenLetterForm } from '../OpenLetterForm';

const assign = jest.fn();
const originalLocation = window.location;

beforeEach(() => {
  assign.mockReset();
  // jsdom's own `location` is only redefinable while it stays configurable —
  // the repo's standing pattern (letterbox.test.tsx) restores it afterwards.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { assign, replace: assign, href: '' },
  });
  global.fetch = jest.fn();
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

it('R6 — one button, no password field anywhere', () => {
  render(<OpenLetterForm token="tok1" label="Open the project" />);
  expect(screen.getByRole('button', { name: 'Open the project' })).toBeInTheDocument();
  expect(document.querySelector('input[type="password"]')).toBeNull();
});

it('mints on the POST and follows the link it is handed', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({ actionLink: 'https://x.supabase.co/auth/v1/verify?token=abc' }),
  });
  render(<OpenLetterForm token="tok1" label="Open the project" />);
  fireEvent.click(screen.getByRole('button', { name: 'Open the project' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe('/api/auth/invite/accept');
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body)).toEqual({ token: 'tok1' });
  await waitFor(() =>
    expect(assign).toHaveBeenCalledWith('https://x.supabase.co/auth/v1/verify?token=abc'),
  );
});

it('never fires twice, however many times the button is pressed', async () => {
  (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));
  render(<OpenLetterForm token="tok1" label="Open the project" />);
  const button = screen.getByRole('button', { name: 'Open the project' });
  fireEvent.click(button);
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
});

it('says what happened, plainly, when the link has already been used', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: false,
    status: 409,
    json: async () => ({ error: 'already_accepted' }),
  });
  render(<OpenLetterForm token="tok1" label="Open the project" />);
  fireEvent.click(screen.getByRole('button', { name: 'Open the project' }));
  expect(await screen.findByText('This letter has already been opened.')).toBeInTheDocument();
});

it('says something plain, and lets her try again, when the transport fails', async () => {
  (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
  render(<OpenLetterForm token="tok1" label="Open the page" />);
  fireEvent.click(screen.getByRole('button', { name: 'Open the page' }));
  expect(await screen.findByText('That link did not work just now.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open the page' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
});

it('an answer with no link is a failure, not a silent nothing', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({}),
  });
  render(<OpenLetterForm token="tok1" label="Open the project" />);
  fireEvent.click(screen.getByRole('button', { name: 'Open the project' }));
  expect(await screen.findByText('That link did not work just now.')).toBeInTheDocument();
  expect(assign).not.toHaveBeenCalled();
});
