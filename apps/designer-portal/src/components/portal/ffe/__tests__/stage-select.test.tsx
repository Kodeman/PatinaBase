/**
 * W1-T7 — StageSelect PO-sync indicator (00184 stage ratchet).
 *
 * Repo gotcha: stages.ts imports SurfaceKeys from the @patina/help-system
 * barrel, which transitively pulls untransformed ESM (@portabletext/react)
 * into jest. `jest.mock('@patina/help-system', ...)` does NOT work here:
 * tsconfig `paths` maps the package to ../../packages/help-system/src and
 * next/jest's SWC transform rewrites import specifiers using those paths, so
 * the runtime require key never matches the mock registration. Mocking the
 * un-mapped ESM offender directly does work — the rest of help-system's src
 * is plain TS that jest transforms fine.
 */
jest.mock('@portabletext/react', () => ({
  PortableText: () => null,
  toPlainText: () => '',
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StageSelect } from '../stage-select';

describe('StageSelect PO-sync indicator', () => {
  it('renders no sync badge or explainer when sync is absent', () => {
    render(<StageSelect currentStatus="ordered" onChangeStatus={jest.fn()} />);
    expect(screen.queryByTitle(/Synced from PO/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByText(/follows its purchase order/i)).not.toBeInTheDocument();
  });

  it('renders no sync badge when sync.systemSet is false', () => {
    render(
      <StageSelect
        currentStatus="approved"
        onChangeStatus={jest.fn()}
        sync={{ systemSet: false, poNumber: 'PO-1042' }}
      />
    );
    expect(screen.queryByTitle(/Synced from PO/)).not.toBeInTheDocument();
  });

  it('shows the Zap badge with the PO number when system-set', () => {
    render(
      <StageSelect
        currentStatus="ordered"
        onChangeStatus={jest.fn()}
        sync={{ systemSet: true, poNumber: 'PO-1042' }}
      />
    );
    expect(screen.getByTitle('Synced from PO PO-1042')).toBeInTheDocument();
    // The sync state is part of the trigger's accessible name.
    expect(
      screen.getByRole('button', { name: /Synced from PO PO-1042/ })
    ).toBeInTheDocument();
  });

  it('omits the PO number cleanly when poNumber is null', () => {
    render(
      <StageSelect
        currentStatus="shipped"
        onChangeStatus={jest.fn()}
        sync={{ systemSet: true, poNumber: null }}
      />
    );
    expect(screen.getByTitle('Synced from PO')).toBeInTheDocument();
  });

  it('shows the override explainer as a non-option header and still allows a manual pick', async () => {
    const onChangeStatus = jest.fn();
    render(
      <StageSelect
        currentStatus="ordered"
        onChangeStatus={onChangeStatus}
        sync={{ systemSet: true, poNumber: 'PO-7' }}
      />
    );

    fireEvent.click(screen.getByRole('button'));
    expect(
      screen.getByText(
        /follows its purchase order\. Picking a stage manually overrides the sync until the next PO update/i
      )
    ).toBeInTheDocument();

    // Explainer is informational — the listbox still has exactly the 8 stages.
    expect(screen.getAllByRole('option')).toHaveLength(8);

    // A manual pick (the override) still goes through to the parent.
    fireEvent.click(screen.getByRole('option', { name: /Delivered/ }));
    await waitFor(() => expect(onChangeStatus).toHaveBeenCalledWith('delivered'));
  });
});
