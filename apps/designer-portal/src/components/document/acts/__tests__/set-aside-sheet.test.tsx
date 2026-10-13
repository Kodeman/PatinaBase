/**
 * US-28 S4 (U-Q5) — SetAsideSheet: a day and a reason, both required, handed
 * to the line's own writer. The real DocSheet and DocumentAction render; the
 * calendar is a plain field so the day can be typed.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('../../date-text-input', () => ({
  DateTextInput: ({ value, onChange, ariaLabel }: { value: string | null; onChange: (v: string | null) => void; ariaLabel?: string }) => (
    <input aria-label={ariaLabel} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />
  ),
}));

import { SetAsideSheet } from '../set-aside-sheet';

// Monday 12 October 2026, 9am local.
const NOW = new Date(2026, 9, 12, 9, 0, 0);

function renderSheet(onSave = jest.fn().mockResolvedValue(undefined)) {
  const onClose = jest.fn();
  render(
    <SetAsideSheet
      open
      onClose={onClose}
      jobName="Chen Residence"
      line="Balance to Calloway & Brandt ($3,400) due Friday 16 October"
      onSave={onSave}
      now={NOW}
    />,
  );
  return { onSave, onClose };
}

const saveButton = () => screen.getByRole('button', { name: /^Set aside/ });
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('SetAsideSheet (U-Q5)', () => {
  it('names the job and the line it puts down, and sends nothing', () => {
    renderSheet();
    expect(screen.getByRole('dialog')).toHaveTextContent('Chen Residence · Balance to Calloway & Brandt ($3,400)');
    expect(screen.getByRole('dialog')).toHaveTextContent('It sends nothing to anyone.');
  });

  it('holds the act until both a day and a reason are given, and says what is missing', async () => {
    const { onSave } = renderSheet();
    const user = userEvent.setup();
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
    await user.click(saveButton());
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Choose a day after today.')).toBeInTheDocument();
    expect(screen.getByText('Say what the line waits on.')).toBeInTheDocument();

    // A day alone is not enough: the reason is required too.
    fill('Back on', '2026-10-16');
    await user.click(saveButton());
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByText('Choose a day after today.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Waiting on')).toHaveAttribute('aria-invalid', 'true');
  });

  it('refuses today as the day it comes back', async () => {
    const { onSave } = renderSheet();
    const user = userEvent.setup();
    fill('Back on', '2026-10-12');
    fill('Waiting on', 'the Chens’ bench decision');
    await user.click(saveButton());
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Choose a day after today.')).toBeInTheDocument();
  });

  it('hands the day and the trimmed reason to the line’s writer, then puts the sheet back', async () => {
    const { onSave, onClose } = renderSheet();
    const user = userEvent.setup();
    fill('Back on', '2026-10-16');
    fill('Waiting on', '  the Chens’ bench decision ');
    expect(saveButton()).toHaveTextContent('Set aside until Friday 16 October');
    expect(screen.getByRole('dialog')).toHaveTextContent('The line comes back under Coming back on Friday 16 October.');
    await user.click(saveButton());
    expect(onSave).toHaveBeenCalledWith({ until: '2026-10-16', reason: 'the Chens’ bench decision' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('stays open and says so when the set-aside did not save', async () => {
    const { onClose } = renderSheet(jest.fn().mockRejectedValue(new Error('not permitted')));
    const user = userEvent.setup();
    fill('Back on', '2026-10-16');
    fill('Waiting on', 'the bench decision');
    await user.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Set aside did not save. Try again.');
    expect(onClose).not.toHaveBeenCalled();
  });
});
