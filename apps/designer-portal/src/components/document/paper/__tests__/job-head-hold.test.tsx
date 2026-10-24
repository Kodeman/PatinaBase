import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { JobHead } from '../job-head';
import { UnfoldInstrument, UNFOLD_UNSAVED_MESSAGE } from '../unfold-instrument';
import { readPaperOrigin, rememberPaperOrigin, takeDeskReturn } from '@/lib/document/paper/paper-origin';
import { registerBoardOwnerAutosave, resetProposalAutosaveRegistryForTests } from '@/lib/proposal-autosave-registry';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, back: mockBack }) }));
const OWNER = { kind: 'project' as const, id: 'p1' };

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/desk');
  rememberPaperOrigin('p1', { path: '/desk', focusId: 'opener' });
  window.history.replaceState({}, '', '/doc/p1?unfold=pieces&lens=spec');
  resetProposalAutosaveRegistryForTests();
});
afterEach(() => resetProposalAutosaveRegistryForTests());

function paper() {
  return render(<>
    <JobHead returnTo={{ href: '/desk', label: 'Studio' }} origin={readPaperOrigin('p1')} jobName="Job" />
    <UnfoldInstrument label="FF&E schedule" canSeeMoney autosaveOwner={OWNER}>
      {() => <input aria-label="Finish" defaultValue="Kept finish" />}
    </UnfoldInstrument>
  </>);
}

it('holds Studio on a failed mounted write without recording Desk intent, then proceeds after retry', async () => {
  let failed = true;
  const flush = jest.fn(async () => {
    if (failed) {
      screen.getByRole('textbox', { name: 'Finish' }).focus();
      throw new Error('Not saved');
    }
  });
  const handle = registerBoardOwnerAutosave(OWNER, {
    getSnapshot: () => ({ dirty: failed, flushing: false, error: failed ? 'Not saved' : null }), flush,
  });
  paper();
  fireEvent.click(screen.getByRole('link', { name: 'Studio' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(UNFOLD_UNSAVED_MESSAGE));
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
  expect(takeDeskReturn()).toBeNull();
  expect(window.location.pathname).toBe('/doc/p1');
  expect(screen.getByRole('textbox')).toHaveValue('Kept finish');
  expect(screen.getByRole('textbox')).toHaveFocus();
  act(() => { failed = false; handle.notify(); });
  fireEvent.click(screen.getByRole('link', { name: 'Studio' }));
  expect(mockPush).toHaveBeenCalledWith('/desk');
  expect(takeDeskReturn()).toMatchObject({ docId: 'p1', anchor: 'opener' });
  expect(flush).toHaveBeenCalledTimes(1);
});

it('holds a pending Studio departure and records intent only after the mounted write lands', async () => {
  let pending = true;
  let resolve!: () => void;
  const settled = new Promise<void>((done) => { resolve = done; });
  registerBoardOwnerAutosave(OWNER, {
    getSnapshot: () => ({ dirty: pending, flushing: pending, error: null }),
    flush: async () => { await settled; pending = false; },
  });
  paper();
  fireEvent.click(screen.getByRole('link', { name: 'Studio' }));
  expect(mockPush).not.toHaveBeenCalled();
  expect(takeDeskReturn()).toBeNull();
  await act(async () => { resolve(); await settled; });
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/desk'));
  expect(takeDeskReturn()).toMatchObject({ docId: 'p1', anchor: 'opener' });
});

it('drops a pending Studio departure after the mounted sheet unmounts', async () => {
  let pending = true;
  let resolve!: () => void;
  const settled = new Promise<void>((done) => { resolve = done; });
  registerBoardOwnerAutosave(OWNER, {
    getSnapshot: () => ({ dirty: pending, flushing: pending, error: null }),
    flush: async () => { await settled; pending = false; },
  });
  const view = paper();
  fireEvent.click(screen.getByRole('link', { name: 'Studio' }));
  view.unmount();
  await act(async () => { resolve(); await settled; });
  expect(mockPush).not.toHaveBeenCalled();
  expect(takeDeskReturn()).toBeNull();
});
