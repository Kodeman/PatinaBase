import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { StaleLetterForm } from '../StaleLetterForm';

const ACKNOWLEDGED = 'If a new invitation can be sent, you’ll receive an email.';
const FAILED = 'We couldn’t request a new link. Try again or contact your designer.';

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
});

it('CPUX-05 — an expired link says so in plain words and offers one tap', () => {
  render(<StaleLetterForm token="tok1" />);
  expect(screen.getByText('This invitation link has expired.')).toBeInTheDocument();
  const button = screen.getByRole('button', { name: 'Send a new invitation link' });
  expect(button).toHaveClass('da-terminal');
});

it('asks the existing refresh route and acknowledges without promising delivery', async () => {
  render(<StaleLetterForm token="tok1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Send a new invitation link' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe('/api/auth/invite/refresh');
  expect(JSON.parse(init.body)).toEqual({ token: 'tok1' });
  expect(await screen.findByText(ACKNOWLEDGED)).toBeInTheDocument();
  // `{ ok: true }` is not proof of delivery: no certainty is printed.
  expect(screen.queryByText(/email sent/i)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Send a new invitation link' })).toBeNull();
});

it('one tap only', async () => {
  (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));
  render(<StaleLetterForm token="tok1" />);
  const button = screen.getByRole('button', { name: 'Send a new invitation link' });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
});

it('a transport failure says the request did not go through, and Try again really asks again', async () => {
  (global.fetch as jest.Mock)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
  render(<StaleLetterForm token="tok1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Send a new invitation link' }));
  expect(await screen.findByText(FAILED)).toBeInTheDocument();
  expect(screen.queryByText(ACKNOWLEDGED)).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  expect(await screen.findByText(ACKNOWLEDGED)).toBeInTheDocument();
  expect(screen.queryByText(FAILED)).toBeNull();
});

it('an unexpected non-success status never claims delivery', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
  render(<StaleLetterForm token="tok1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Send a new invitation link' }));
  expect(await screen.findByText(FAILED)).toBeInTheDocument();
  expect(screen.queryByText(ACKNOWLEDGED)).toBeNull();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
});
