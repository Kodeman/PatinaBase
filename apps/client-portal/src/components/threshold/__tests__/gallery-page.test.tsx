import type { ComponentProps } from 'react';
import type { RoomBandModel } from '@/lib/threshold/derive';
import type { ClientSelection } from '@/lib/commercial-documents';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { houseIssue } from '../editorial/house-issue';
import type { ClientProjectEditorial, EditorialAsset } from '@/lib/editorial/types';
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

it.each([
  [{ approvalsPending: 0, unreadMessages: 0 }, 'Lake Cottage, Nothing waiting there.'],
  [{ approvalsPending: 1, unreadMessages: 0 }, 'Lake Cottage, a paper is waiting there.'],
  [{}, 'Lake Cottage'],
  [{ approvalsPending: 0 }, 'Lake Cottage'],
])('keeps loaded, waiting, and unknown other-house facts honest in one Menu link', (counts, name) => {
  window.history.replaceState({}, '', '/#menu');
  render(page(true, { otherHouses: [{ id: 'lake', name: 'Lake Cottage', ...counts }] }));
  const link = within(screen.getByRole('navigation', { name: 'Page index' })).getByRole('link', { name, exact: true });
  expect(link).toHaveTextContent(name);
  expect(link).toHaveAttribute('href', '/projects/lake');
});

it('keeps existing editorial room items in Every piece when the commercial projection is empty', async () => {
  const band = { roomId: 'living', anchor: 'room-living', name: 'Living room', pieces: [] } as unknown as RoomBandModel;
  const editorial = {
    project: { id: 'elm', name: 'Elm', showMakers: false },
    rooms: [{ id: 'living', name: 'Living room', anchor: 'room-living', conceptAssetId: null, scanAssetIds: [], items: [
      { id: 'sideboard', nameAsSigned: 'Walnut sideboard', status: 'production', category: 'furniture', assetIds: [] },
      { id: 'sofa', nameAsSigned: 'Linen sofa', status: 'ordered', category: 'furniture', assetIds: [] },
    ] }], assets: [], images: [], palette: [], boards: [], sheets: [],
  } as unknown as ClientProjectEditorial;
  const issue = houseIssue(editorial);
  render(page(true, { issue, bands: [band], pieces: (room) => <GalleryPieces band={room} issue={issue} /> }));
  await userEvent.click(screen.getByRole('link', { name: 'Every piece in the Living room' }));
  const drawer = within(screen.getByRole('dialog', { name: 'Every piece in the Living room' }));
  expect(drawer.getAllByText('Walnut sideboard', { exact: true })[0]).toBeVisible();
  expect(drawer.getAllByText('Linen sofa', { exact: true })[0]).toBeVisible();
  expect(drawer.getByText('Released to maker', { exact: true })).toBeVisible();
  expect(drawer.queryByText(/\$/)).not.toBeInTheDocument();
});

it('replaces a failed arrival picture source with paint', () => {
  const { container } = render(<GalleryPhoto scope="edition" asset={asset} palette={palette} arrival />);
  fireEvent.error(container.querySelector('source')!);
  expect(screen.getByRole('img', { name: /Paint for the house: Oat/ })).toBeVisible();
  expect(container.querySelector('picture')).toBeNull();
});

it('replaces an arrival image that already failed before hydration with paint', () => {
  const complete = jest.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
  const naturalWidth = jest.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(0);
  const { container } = render(<GalleryPhoto scope="edition" asset={asset} palette={palette} arrival />);
  expect(screen.getByRole('img', { name: /Paint for the house: Oat/ })).toBeVisible();
  expect(container.querySelector('img')).toBeNull();
  complete.mockRestore(); naturalWidth.mockRestore();
});

it.each(['note', 'road', 'previously', 'mat'])('Gallery review F2 scrolls delayed #%s exactly once without moving focus', async (anchor) => {
  window.history.replaceState({}, '', '/#' + anchor);
  const { rerender } = render(page(false, { openApprovalIds: null }));
  const menu = screen.getByRole('link', { name: 'Menu' });
  menu.focus();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  rerender(page(true, { openApprovalIds: [] }));
  await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1));
  expect((Element.prototype.scrollIntoView as jest.Mock).mock.instances[0]).toBe(document.getElementById(anchor));
  expect(menu).toHaveFocus();
  rerender(page(true, { roadSentence: 'A later update.' }));
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
});

it.each(['wheel', 'touchstart', 'keydown'])('Gallery review F2 stops waiting for a late page anchor after %s input', async (event) => {
  window.history.replaceState({}, '', '/#note');
  const { rerender } = render(page(false, { openApprovalIds: null }));
  fireEvent(window, event === 'keydown' ? new KeyboardEvent(event, { key: 'PageDown' }) : new Event(event));
  rerender(page(true, { openApprovalIds: [] }));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
});

it('Gallery review F3 waits for open approval IDs before opening the matching ask', async () => {
  window.history.replaceState({}, '', '/?decision=open#approval-open');
  const asks = <div id="approval-open">Open approval</div>;
  const { rerender } = render(page(false, { asks, openApprovalIds: null }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  rerender(page(true, { asks, openApprovalIds: ['open'] }));
  expect(await screen.findByRole('dialog')).toHaveTextContent('Open approval');
  await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'start' }));
  expect((Element.prototype.scrollIntoView as jest.Mock).mock.instances.at(-1)).toBe(document.getElementById('approval-open'));
});

it('Gallery review F3 keeps an unknown approval on the page instead of opening an empty drawer', () => {
  window.history.replaceState({}, '', '/?decision=unknown#approval-unknown');
  render(page(true, { openApprovalIds: [] }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(document.body.style.overflow).not.toBe('hidden');
});


it.each([null, 0, 720000])('keeps ordinary gallery price behavior for %s cents', (price) => {
  const piece = { id: 'ordinary', kind: 'furnishings', name: 'Ordinary chair', quantity: 1,
    clientLineTotalCents: price, logisticsStatus: 'specified', instrument: null } as ClientSelection;
  const { container } = render(<GalleryPieces band={{ pieces: [piece], varianceLine: null } as RoomBandModel} />);
  expect(container).toHaveTextContent('Ordinary chair');
  if (price === 720000) expect(container).toHaveTextContent('$7,200.00');
  else expect(container).not.toHaveTextContent(/\$/);
});
