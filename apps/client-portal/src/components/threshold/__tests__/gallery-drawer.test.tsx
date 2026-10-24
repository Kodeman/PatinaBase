import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetCheckoutReturn } from '@/lib/threshold/checkout-return';
import { GalleryDrawer, useGalleryRoute } from '../gallery-drawer';
import { resetScrollLock } from '../use-scroll-lock';

function Harness() {
  const { route, active, navigate, dismiss } = useGalleryRoute();
  return <>
    <button onClick={() => navigate('#letterbox')}>Open asks</button>
    <a href="#menu">Menu</a>
    <div id="note">Maren’s note</div>
    <GalleryDrawer open={active} title={route.kind} onDismiss={dismiss}
      anchor={route.kind === 'asks' ? route.anchor : undefined}>
      <div id="letterbox">Invoices</div>
      <div id="approvals">Every approval</div>
      <a href="#approvals">Go to approval</a>
      <a href="#note">Read Maren’s note</a>
    </GalleryDrawer>
  </>;
}

beforeEach(() => {
  resetCheckoutReturn();
  resetScrollLock();
  window.history.replaceState({}, '', '/');
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) {
    this.removeAttribute('open');
  } });
  Element.prototype.scrollIntoView = jest.fn();
});

it('opens the asks over the page, locks scroll, and Back restores the opener', async () => {
  render(<Harness />);
  const opener = screen.getByRole('button', { name: 'Open asks' });
  await userEvent.click(opener);
  expect(screen.getByRole('dialog')).toHaveAttribute('open');
  expect(document.body.style.overflow).toBe('hidden');
  expect(window.location.hash).toBe('#letterbox');
  act(() => window.history.back());
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(document.body.style.overflow).not.toBe('hidden');
  await waitFor(() => expect(opener).toHaveFocus());
});

it('Escape closes the same drawer after Menu navigates to approvals, with one Back entry', async () => {
  render(<Harness />);
  const opener = screen.getByRole('link', { name: 'Menu' });
  await userEvent.click(opener);
  await userEvent.click(screen.getByRole('link', { name: 'Go to approval' }));
  expect(window.location.hash).toBe('#approvals');
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(window.location.hash).toBe('');
  await waitFor(() => expect(opener).toHaveFocus());
});

it('a direct permanent approval address opens at the approval and Close does not leave the house', async () => {
  window.history.replaceState({}, '', '/#approvals');
  render(<Harness />);
  expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby');
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  await userEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(window.location.pathname).toBe('/');
  expect(window.location.hash).toBe('');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('the Stripe road return opens asks while an ordinary road address remains a scroll target', () => {
  window.history.replaceState({}, '', '/?checkout=success&order=order-1#road');
  render(<Harness />);
  expect(screen.getByRole('heading', { name: 'asks' })).toBeInTheDocument();
  expect(window.location.search).toBe('');
});

it('a note link closes the overlay and scrolls to the existing note anchor', async () => {
  render(<Harness />);
  await userEvent.click(screen.getByRole('link', { name: 'Menu' }));
  await userEvent.click(screen.getByRole('link', { name: 'Read Maren’s note' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(window.location.hash).toBe('#note');
  await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
});

it('replacing a deep-linked overlay does not acquire ownership of its history entry', async () => {
  window.history.replaceState({}, '', '/#letterbox');
  render(<Harness />);
  await userEvent.click(screen.getByRole('link', { name: 'Go to approval' }));
  expect(window.location.hash).toBe('#approvals');
  const back = jest.spyOn(window.history, 'back');
  await userEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(back).not.toHaveBeenCalled();
  expect(window.location.pathname).toBe('/');
  expect(window.location.hash).toBe('');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  back.mockRestore();
});
