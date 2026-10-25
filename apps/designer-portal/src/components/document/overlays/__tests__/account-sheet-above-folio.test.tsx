import React from 'react';
/**
 * SQ-1113 (R1 walk, finding 1) — the composer's "Set <name>'s rate" opens the
 * Account sheet ABOVE the composer folio (PaperFolioSheet, z-[60]), the same
 * stack as household-sheet-above-folio.test.tsx: it is the top modal, its rate
 * field is inside it, its Esc closes only itself and hands focus back to Set,
 * and the folio's Esc is its own again afterwards. The composer's own call
 * (`openAccountPage("studio", { rateFor, aboveFolio: true })`) is asserted in
 * accounts/__tests__/invoice-composer-held.test.tsx.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AccountSheet, openAccountPage } from '../../account/account-sheet';
import { PaperFolioSheet } from '../paper-folio-sheet';
import { topActiveModalDialog } from '../active-dialog';

jest.mock('@patina/supabase', () => ({
  AVAILABILITY_STATUSES: ['online', 'away', 'busy', 'offline'],
  useAvailability: () => ({ data: 'online' }),
  useSetAvailability: () => ({ mutate: jest.fn(), error: null }),
  useAvailabilityRealtime: () => undefined,
  useProfile: () => ({ data: { display_name: 'Leah Hartwell' } }),
  useOrganizations: () => ({ data: [] }),
}));
jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { email: 'leah@example.com' }, signOut: jest.fn() }),
}));
jest.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => true }));
jest.mock('@/hooks/use-viewer-studio', () => ({
  useAccountStudio: () => ({ studio: null }),
}));
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: true, isLoading: false }),
}));
jest.mock('@/lib/analytics/events', () => ({ authEvents: { logout: jest.fn() } }));
jest.mock('../../account/account-profile-page', () => ({ AccountProfilePage: () => null }));
jest.mock('../../account/account-notifications-page', () => ({
  AccountNotificationsPage: () => null,
}));
jest.mock('../../account/account-security-page', () => ({ AccountSecurityPage: () => null }));
jest.mock('../../account/account-devices-page', () => ({ AccountDevicesPage: () => null }));
jest.mock('../../account/account-extension-page', () => ({ AccountExtensionPage: () => null }));
// The Studio page's rate field, standing in for StudioRateRows.
jest.mock('../../account/account-studio-page', () => ({
  AccountStudioPage: ({ focusRateFor }: { focusRateFor: string | null }) => (
    <input aria-label={`Hourly rate for ${focusRateFor}`} />
  ),
}));

function ComposerStack({
  onFolioClose,
  aboveFolio,
}: {
  onFolioClose: () => void;
  aboveFolio?: boolean;
}) {
  return (
    <>
      <PaperFolioSheet open onClose={onFolioClose} title="Draw an invoice" wide>
        <textarea aria-label="memo · shown to the client" defaultValue="" />
        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.focus();
            openAccountPage('studio', { rateFor: 'maria', aboveFolio });
          }}
        >
          Set Maria Obi’s rate
        </button>
      </PaperFolioSheet>
      <AccountSheet />
    </>
  );
}

const accountLayer = () =>
  document.querySelector<HTMLElement>('[data-doc-sheet-layer]');

describe('Account sheet above the composer folio (SQ-1113)', () => {
  it('lays above the folio with the rate field in it, and puts back only itself on Esc', async () => {
    const onFolioClose = jest.fn();
    render(<ComposerStack onFolioClose={onFolioClose} aboveFolio />);
    fireEvent.change(screen.getByLabelText('memo · shown to the client'), {
      target: { value: 'Thank you' },
    });
    const setRate = screen.getByRole('button', { name: 'Set Maria Obi’s rate' });
    act(() => {
      fireEvent.click(setRate);
    });

    // Stacked above the folio's z-[60], not under its backdrop at z-50.
    const layer = accountLayer();
    expect(layer).toHaveClass('z-[65]');
    expect(layer).not.toHaveClass('z-50');

    // The sheet is the top modal, and the rate field is inside it.
    const panel = screen.getByRole('dialog', { name: 'Account settings' });
    expect(topActiveModalDialog()).toBe(panel);
    expect(panel).toContainElement(await screen.findByLabelText('Hourly rate for maria'));

    // Esc puts back the sheet alone; focus returns to Set.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(accountLayer()).toBeNull();
    expect(onFolioClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Draw an invoice' })).toBeInTheDocument();
    await waitFor(() => expect(setRate).toHaveFocus());
    expect(screen.getByLabelText('memo · shown to the client')).toHaveValue('Thank you');

    // With the sheet gone, Esc is the folio's again.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onFolioClose).toHaveBeenCalledTimes(1);
  });

  it('keeps every other opener on the z-50 layer', () => {
    render(<ComposerStack onFolioClose={jest.fn()} />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Set Maria Obi’s rate' }));
    });
    const layer = accountLayer();
    expect(layer).toHaveClass('z-50');
    expect(layer).not.toHaveClass('z-[65]');
  });
});


describe('Account settings lazy body', () => {
  const nativeLazy = React.lazy;
  afterEach(() => jest.restoreAllMocks());

  it('keeps the shell and opening focus through loading to loaded, then returns to its opener', async () => {
    let resolve!: () => void;
    const gate = new Promise<void>((done) => { resolve = done; });
    const loads = jest.fn();
    jest.spyOn(React, 'lazy').mockImplementation((load) => nativeLazy(() => {
      loads();
      return gate.then(load);
    }));
    render(<ComposerStack onFolioClose={jest.fn()} aboveFolio />);
    expect(loads).not.toHaveBeenCalled();
    const opener = screen.getByRole('button', { name: 'Set Maria Obi’s rate' });
    opener.focus();
    fireEvent.click(opener);

    const panel = screen.getByRole('dialog', { name: 'Account settings' });
    expect(screen.getByRole('status')).toHaveTextContent('Loading studio settings');
    await waitFor(() => expect(panel).toHaveFocus());
    await act(async () => resolve());
    expect(panel).toContainElement(await screen.findByLabelText('Hourly rate for maria'));
    expect(panel).toHaveFocus();
    fireEvent.keyDown(panel, { key: 'Escape' });
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('contains a rejected chunk in the same shell and retries with a fresh loader', async () => {
    let reject!: (error: Error) => void;
    let resolveRetry!: () => void;
    const first = new Promise<void>((_resolve, fail) => { reject = fail; });
    const retry = new Promise<void>((done) => { resolveRetry = done; });
    let attempt = 0;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(React, 'lazy').mockImplementation((load) => nativeLazy(() => {
      const gate = attempt++ === 0 ? first : retry;
      return gate.then(load);
    }));
    render(<ComposerStack onFolioClose={jest.fn()} aboveFolio />);
    const opener = screen.getByRole('button', { name: 'Set Maria Obi’s rate' });
    fireEvent.click(opener);
    const panel = screen.getByRole('dialog', { name: 'Account settings' });
    await act(async () => reject(new Error('ChunkLoadError')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Studio settings could not be loaded.');
    expect(screen.getByRole('dialog', { name: 'Account settings' })).toBe(panel);
    const retryButton = screen.getByRole('button', { name: 'Try again' });
    retryButton.focus();
    fireEvent.click(retryButton);
    expect(screen.getByRole('status')).toHaveTextContent('Loading studio settings');
    expect(panel).toContainElement(document.activeElement as HTMLElement);
    await act(async () => resolveRetry());
    expect(panel).toContainElement(await screen.findByLabelText('Hourly rate for maria'));
    expect(attempt).toBe(2);
    fireEvent.keyDown(panel, { key: 'Escape' });
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
