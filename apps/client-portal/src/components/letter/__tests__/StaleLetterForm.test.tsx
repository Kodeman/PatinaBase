import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { StaleLetterForm } from '../StaleLetterForm';

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
});

it('R10 — the page says it plainly and offers one tap', () => {
  render(<StaleLetterForm token="tok1" />);
  expect(screen.getByText("This letter’s gone stale.")).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Send a fresh letter' })).toBeInTheDocument();
});

it('nothing lands in the designer’s queue for a thing she did not do wrong', async () => {
  render(<StaleLetterForm token="tok1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Send a fresh letter' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe('/api/auth/invite/refresh');
  expect(JSON.parse(init.body)).toEqual({ token: 'tok1' });
  expect(await screen.findByText('A fresh letter is on its way.')).toBeInTheDocument();
});

it('one tap only', async () => {
  (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));
  render(<StaleLetterForm token="tok1" />);
  const button = screen.getByRole('button', { name: 'Send a fresh letter' });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
});

it('says the same thing when the tap could not be delivered — never an error she cannot act on', async () => {
  (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
  render(<StaleLetterForm token="tok1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Send a fresh letter' }));
  expect(await screen.findByText('A fresh letter is on its way.')).toBeInTheDocument();
});
