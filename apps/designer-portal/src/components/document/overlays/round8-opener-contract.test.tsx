import { useState, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { RoomScanPhoto } from '@patina/supabase';
import { DocSheet } from './doc-sheet';
import { DocPaperSheet } from './doc-paper-sheet';
import { PaperFolioSheet } from './paper-folio-sheet';
import { FullScreenViewerShell } from './full-screen-viewer-shell';
import { RoomSheet } from '../rooms/room-sheet';
import { PhotoViewer } from '../rooms/room-view/photo-viewer';
import { ClientMirror } from '../client-mirror';

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('@tanstack/react-query', () => ({ useQuery: () => ({}) }));
jest.mock('@patina/supabase', () => ({
  useClientEditions: () => ({}),
  useStudioIdentity: () => ({}),
  useClientEditionSourceUrls: () => ({}),
}));
jest.mock('@/hooks/use-feature-flag', () => ({ useFeatureFlag: () => ({ value: true }) }));
jest.mock('@/lib/document/client-editions', () => ({
  currentEdition: () => null,
  pendingEdition: () => null,
  editionsFrozen: () => false,
  useProjectMakerNames: () => ({}),
}));
jest.mock('../press-band-preview', () => ({ ProjectGalleryPreview: () => null }));

type BoundaryProps = { returnFocusTo?: HTMLElement | null; onClose: () => void };
const photos = [{ signedImageUrl: '/photo.jpg', signedThumbUrl: null, caption: 'Room photo' }] as RoomScanPhoto[];
const families: [string, (props: BoundaryProps) => ReactNode][] = [
  ['DocSheet', (props) => <DocSheet open title="Review" {...props}><input aria-label="Note" /></DocSheet>],
  ['DocPaperSheet', (props) => <DocPaperSheet open title="Review" {...props}><input aria-label="Note" /></DocPaperSheet>],
  ['PaperFolioSheet', (props) => <PaperFolioSheet open title="Review" {...props}><input aria-label="Note" /></PaperFolioSheet>],
  ['RoomSheet', (props) => <RoomSheet open title="Review" {...props}><input aria-label="Note" /></RoomSheet>],
  ['PhotoViewer', (props) => <PhotoViewer photos={photos} index={0} onIndexChange={jest.fn()} {...props} />],
  ['ClientMirror', (props) => <ClientMirror projectId="job" clientName="Household" {...props} />],
  ['FullScreenViewerShell', (props) => <FullScreenViewerShell title="Review" {...props}><input aria-label="Note" /></FullScreenViewerShell>],
];

function Harness({ boundary, explicit = true, detach = false }: {
  boundary: (props: BoundaryProps) => ReactNode;
  explicit?: boolean;
  detach?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const [, rerender] = useState(0);
  return <>
    <button onClick={() => rerender((n) => n + 1)}>Refresh caller</button>
    {(!detach || !open) && <button onClick={(event) => { setOpener(event.currentTarget); setOpen(true); }}>Open overlay</button>}
    {open && boundary({ returnFocusTo: explicit ? opener : null, onClose: () => setOpen(false) })}
  </>;
}

describe.each(families)('%s actual-trigger return contract', (_name, boundary) => {
  it.each(['Escape', 'close control'])('returns to the clicked actual trigger without prefocus after %s', async (method) => {
    render(<Harness boundary={boundary} />);
    const opener = screen.getByRole('button', { name: 'Open overlay' });
    expect(document.body).toHaveFocus();
    fireEvent.click(opener); // jsdom, like WebKit, does not focus on click.
    const dialog = screen.getByRole('dialog');
    const control = dialog.querySelector<HTMLElement>('input, button')!;
    control.focus();
    if (method === 'Escape') fireEvent.keyDown(control, { key: 'Escape' });
    else fireEvent.click(screen.getAllByRole('button').find((button) => /Close sheet|Back to/.test(button.getAttribute('aria-label') ?? button.textContent ?? ''))!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it.each(['detached', 'hidden', 'inert'])('uses captured focus when the explicit trigger is %s at close', async (state) => {
    render(<Harness boundary={boundary} detach={state === 'detached'} />);
    const fallback = screen.getByRole('button', { name: 'Refresh caller' });
    const opener = screen.getByRole('button', { name: 'Open overlay' });
    fallback.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog');
    if (state === 'hidden') opener.style.display = 'none';
    else if (state === 'inert') opener.setAttribute('inert', '');
    dialog.querySelector<HTMLElement>('input, button')!.focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(fallback).toHaveFocus());
  });

  it('keeps the shortcut-null/programmatic captured-focus fallback', async () => {
    render(<Harness boundary={boundary} explicit={false} />);
    const fallback = screen.getByRole('button', { name: 'Refresh caller' });
    fallback.focus();
    fireEvent.click(screen.getByRole('button', { name: 'Open overlay' }));
    screen.getByRole('dialog').querySelector<HTMLElement>('input, button')!.focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(fallback).toHaveFocus());
  });

  it('does not recapture focus on caller rerenders', async () => {
    render(<Harness boundary={boundary} />);
    const opener = screen.getByRole('button', { name: 'Open overlay' });
    fireEvent.click(opener);
    const control = screen.getByRole('dialog').querySelector<HTMLElement>('input, button')!;
    control.focus();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh caller' }));
    expect(control).toHaveFocus();
    fireEvent.keyDown(control, { key: 'Escape' });
    await waitFor(() => expect(opener).toHaveFocus());
  });
});

it('returns from a nested RoomSheet to its actual trigger after the outer sheet becomes active', async () => {
  function Nested() {
    const [open, setOpen] = useState(false);
    const [opener, setOpener] = useState<HTMLElement | null>(null);
    return <>
      <DocSheet open title="Outer" onClose={jest.fn()}>
        <button onClick={(event) => { setOpener(event.currentTarget); setOpen(true); }}>Open room sheet</button>
      </DocSheet>
      <RoomSheet open={open} title="Inner" returnFocusTo={opener} onClose={() => setOpen(false)}>
        <input aria-label="Inner note" />
      </RoomSheet>
    </>;
  }
  render(<Nested />);
  const opener = screen.getByRole('button', { name: 'Open room sheet' });
  fireEvent.click(opener);
  screen.getByRole('textbox', { name: 'Inner note' }).focus();
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(opener).toHaveFocus());
  expect(screen.getByRole('dialog', { name: 'Outer' })).toHaveAttribute('aria-modal', 'true');
});
