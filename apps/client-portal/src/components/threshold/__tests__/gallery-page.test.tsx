import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { EditorialAsset } from '@/lib/editorial/types';
import { galleryRendition } from '@/lib/editorial/gallery-picture';
import { galleryRoute } from '@/lib/threshold/gallery-route';
import { resetCheckoutReturn } from '@/lib/threshold/checkout-return';
import { GalleryPage } from '../gallery-page';
import { GalleryPhoto } from '../gallery-photo';
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

function page(ready = true) {
  return <GalleryPage projectName="Elm House" studioName="Maren Studio" designerName="Maren" preparedFor="Ada"
    issue={null} ready={ready} heldTooLong={false} line="Maren has a question for you."
    asks={<div id="approvals"><button>Approve the room</button></div>}
    menuAsks={<li><a href="#approvals">Room approval</a></li>} plan={<p>Plan drawing</p>}
    documents={(dismiss) => <button onClick={dismiss}>Close documents</button>} otherHouses={[]}
    bands={[]} pieces={() => null} note={<p id="note">A note from Maren</p>}
    earlier={<p id="previously">Earlier correspondence</p>} footer={<p id="contact">Contact Maren</p>}
    roadSentence="Installation is next." />;
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
