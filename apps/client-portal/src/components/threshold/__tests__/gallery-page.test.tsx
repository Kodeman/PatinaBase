import type { ComponentProps } from 'react';
import type { RoomBandModel } from '@/lib/threshold/derive';
import type { ClientSelection } from '@/lib/commercial-documents';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { EditorialAsset } from '@/lib/editorial/types';
import { galleryRendition } from '@/lib/editorial/gallery-picture';
import { galleryRoute } from '@/lib/threshold/gallery-route';
import { resetCheckoutReturn } from '@/lib/threshold/checkout-return';
import { GalleryPage, GalleryPieces } from '../gallery-page';
import { GalleryPhoto } from '../gallery-photo';
import { GalleryDrawer } from '../gallery-drawer';
import { resetScrollLock } from '../use-scroll-lock';

const asset: EditorialAsset = {
  id: 'photo', sha256: 'a'.repeat(64), sourceKind: 'installed', width: 2400, height: 1600,
  ground: 'scene', dominantHex: null, lqip: null, focal: [0.5, 0.5],
  subjectBox: [0.45, 0.45, 0.1, 0.1], crops: { wide: { rect: [0, 0, 1, 1], widths: [800, 1600] } },
  caption: { what: 'Living room', whose: 'Studio photograph', when: 'October 2026' }, alt: 'The living room',
};
const palette = [{ hex: '#B1A28A', brand: null, name: 'Oat' }];

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

function page(ready = true, overrides: Partial<ComponentProps<typeof GalleryPage>> = {}) {
  return <GalleryPage projectName="Elm House" studioName="Maren Studio" designerName="Maren" preparedFor="Ada"
    issue={null} ready={ready} heldTooLong={false} line="Maren has a question for you."
    asks={<div id="approvals"><button>Approve the room</button></div>}
    menuAsks={<li><a href="#approvals">Room approval</a></li>} plan={<p>Plan drawing</p>}
    documents={(dismiss) => <button onClick={dismiss}>Close documents</button>} otherHouses={[]}
    bands={[]} pieces={() => null} note={<p id="note">A note from Maren</p>}
    earlier={<p id="previously">Earlier correspondence</p>} footer={<p id="contact">Contact Maren</p>}
    roadSentence="Installation is next." {...overrides} />;
}

it('opens every ask from the arrival band in the same native drawer as Menu and documents', async () => {
  render(page());
  expect(screen.getByRole('heading', { level: 1, name: 'Elm House' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Approve the room' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('link', { name: /Maren has a question/ }));
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve the room' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Close', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await userEvent.click(screen.getByRole('link', { name: 'Menu' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'Room approval' })).toBeVisible();
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Documents' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Close documents' })).toBeVisible();
});

it('reveals a direct approval anchor after the ready asks mount', async () => {
  window.history.replaceState({}, '', '/#approvals');
  const { rerender } = render(page(false));
  await screen.findByRole('dialog');
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  rerender(page());
  await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'start' }));
  expect((Element.prototype.scrollIntoView as jest.Mock).mock.instances.at(-1)).toBe(document.getElementById('approvals'));
});

it.each(['doorstep', 'ledger', 'letterbox'])('keeps receipts and urgent asks first when delayed #%s content mounts', async (anchor) => {
  const { rerender } = render(<GalleryDrawer open title="Asks" anchor={anchor} onDismiss={() => undefined}>{null}</GalleryDrawer>);
  const drawer = screen.getByRole('dialog');
  drawer.scrollTop = 400;
  rerender(<GalleryDrawer open title="Asks" anchor={anchor} onDismiss={() => undefined}><div id="letterbox">Ready asks</div></GalleryDrawer>);
  await waitFor(() => expect(drawer.scrollTop).toBe(0));
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
});

it.each(['cancel', 'cancelled', 'success'])('opens the cleaned return anchor when checkout=%s arrives without a hash', async (outcome) => {
  window.history.replaceState({}, '', `/?checkout=${outcome}&invoice=invoice-1`);
  render(page());
  expect(await screen.findByRole('dialog')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Approve the room' })).toBeVisible();
  expect(window.location.hash).toBe('#letterbox');
  expect(window.location.search).toBe('');
});

it('does not announce a ready ask line before the house reads settle', () => {
  render(page(false));
  expect(screen.getByRole('status')).toHaveTextContent('Reading your house');
  expect(screen.queryByRole('link', { name: /Maren has a question/ })).not.toBeInTheDocument();
  expect(screen.queryByText('Installation is next.')).not.toBeInTheDocument();
});

it('serves eligible stored renditions, then falls back to honest paint when the image fails', () => {
  render(<GalleryPhoto scope="edition" asset={asset} palette={palette} arrival />);
  const photo = screen.getByRole('img', { name: /living room/i });
  expect(photo).toHaveAttribute('loading', 'eager');
  expect(photo).toHaveAttribute('src', expect.stringContaining('/plates/edition/'));
  fireEvent.error(photo);
  expect(screen.getByRole('img', { name: /Paint for the house: Oat/ })).toBeVisible();
  expect(screen.getByText(/paint card is the authority/)).toBeVisible();
});

it('rejects a served crop that cannot contain the protected subject and selects the widest usable file', () => {
  expect(galleryRendition('edition', { ...asset, subjectBox: [0, 0, 1, 1] }, 0.5)).toBeNull();
  const rendition = galleryRendition('edition', asset, 0.5);
  expect(rendition?.pixels).toBe(1600);
  expect(rendition?.picture.src).toContain('1600');
  expect(galleryRendition('edition', { ...asset, crops: {} }, 1)).toBeNull();
});

it('resolves a room pieces link into the shared drawer instead of a page scroll', () => {
  expect(galleryRoute('#pieces-room-1')).toEqual({ kind: 'pieces', roomId: 'room-1' });
});

it('names the other house and its waiting sentence immediately after the asks in Menu', () => {
  window.history.replaceState({}, '', '/#menu');
  render(page(true, { otherHouses: [{ id: 'lake', name: 'Lake Cottage', approvalsPending: 1 }] }));
  const links = within(screen.getByRole('navigation', { name: 'Page index' })).getAllByRole('link');
  expect(links[0]).toHaveTextContent('Room approval');
  expect(links[1]).toHaveTextContent('Lake Cottage, a paper is waiting there.');
  expect(links[1]).toHaveAttribute('href', '/projects/lake');
});

it('gives a settled but unreadable ask state an honest link instead of all-clear', () => {
  render(page(true, { line: null }));
  expect(screen.getByRole('link', { name: /Your asks could not all be read/ })).toHaveAttribute('href', '#doorstep');
  expect(screen.queryByText(/All quiet/)).not.toBeInTheDocument();
});

it('keeps trade words, price, quantity, instrument and every record photograph without a stage bar', () => {
  const piece = { id: 'paint', name: 'The paintwork', kind: 'trade', tradeJourney: 'substantially_complete',
    quantity: 2, clientLineTotalCents: 720000, imageUrl: 'first.jpg', imageUrls: ['first.jpg', 'second.jpg'], docCode: 'TS-2',
    instrument: { name: 'Paintwork scope', executedAt: '2026-06-02' } } as ClientSelection;
  const band = { pieces: [piece], varianceLine: 'Above the room target.' } as RoomBandModel;
  const { container } = render(<GalleryPieces band={band} />);
  expect(screen.getByText('Complete')).toBeVisible();
  expect(screen.getByText('$7,200.00')).toBeVisible();
  expect(screen.getByText('2 of them')).toBeVisible();
  expect(screen.getByText(/Paintwork scope · agreed/)).toBeVisible();
  expect(screen.getByText('TS-2')).toBeVisible();
  expect(container.querySelectorAll('img')).toHaveLength(2);
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});

it('labels a concept chapter photograph as not installed', () => {
  render(<GalleryPhoto scope="edition" asset={{ ...asset, sourceKind: 'concept' }} palette={palette} />);
  expect(screen.getByText('Concept · not installed')).toBeVisible();
});
