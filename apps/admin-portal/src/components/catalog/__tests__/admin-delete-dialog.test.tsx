/**
 * AdminDeleteDialog Component Tests
 *
 * F22 (SQ-704 walk, QA.md:254-271): deleting a product a line uses answers
 * 409 with "A product on a line can't be deleted. Merge it into the one you
 * keep." This dialog must catch that refusal, keep itself open, and show
 * the server's sentence instead of letting it become an unhandled rejection.
 *
 * @module components/catalog/__tests__/admin-delete-dialog
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminDeleteDialog } from '../detail/admin-delete-dialog';

describe('AdminDeleteDialog', () => {
  it('deletes and lets the caller close the dialog on success', async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    const onOpenChange = jest.fn();
    const user = userEvent.setup();

    render(
      <AdminDeleteDialog
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        productName="Oak Console"
      />
    );

    await user.click(screen.getByRole('button', { name: /delete product/i }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the 409 refusal sentence and keeps the dialog open when onConfirm rejects', async () => {
    const refusal = "A product on a line can't be deleted. Merge it into the one you keep.";
    const onConfirm = jest.fn().mockRejectedValue(new Error(refusal));
    const onOpenChange = jest.fn();
    const user = userEvent.setup();

    render(
      <AdminDeleteDialog
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        productName="Oak Console"
      />
    );

    await user.click(screen.getByRole('button', { name: /delete product/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(refusal));
    // The dialog itself never closes on a failed delete; only the parent
    // decides that, and it never gets the chance because onConfirm rejected.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('clears the error when Cancel is clicked', async () => {
    const refusal = "A product on a line can't be deleted. Merge it into the one you keep.";
    const onConfirm = jest.fn().mockRejectedValue(new Error(refusal));
    const onOpenChange = jest.fn();
    const user = userEvent.setup();

    render(
      <AdminDeleteDialog
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        productName="Oak Console"
      />
    );

    await user.click(screen.getByRole('button', { name: /delete product/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(refusal));

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
