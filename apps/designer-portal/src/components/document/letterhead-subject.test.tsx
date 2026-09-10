/**
 * The subject line (R4) — what it prints, what it opens on, and what it saves.
 *
 * The load-bearing distinction is `subject` vs `assembled`: the assembled line
 * is a PRINT and never a value, so the editor must open on the stored subject
 * alone. An editor pre-filled with the assembly would persist a derivation the
 * discovery row is still moving, on nothing more than an Enter.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';

const mutateAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('@patina/supabase', () => ({
  useUpdateEngagementSubject: () => ({ mutateAsync }),
}));

import { LetterheadSubject } from './letterhead-subject';

beforeEach(() => {
  mutateAsync.mockClear();
});

const renderSubject = (
  props: Partial<React.ComponentProps<typeof LetterheadSubject>> = {},
) =>
  render(
    <LetterheadSubject
      kind="relationship"
      id="dc-1"
      subject={null}
      assembled={null}
      {...props}
    />,
  );

describe('LetterheadSubject', () => {
  it('prints the stored line at 15px, wrapping, with no clip', () => {
    renderSubject({ subject: 'Whole-house refresh · 4 rooms' });

    const line = screen.getByText('Whole-house refresh · 4 rooms');
    expect(line).toHaveAttribute('data-letterhead-subject');
    expect(line).toHaveClass('text-[15px]', 'leading-[1.35]', 'break-words');
    expect(line.className).not.toMatch(/text-ellipsis|whitespace-nowrap/);
  });

  it('prints the assembled line when nothing is stored', () => {
    renderSubject({ assembled: 'Full house · 3 rooms' });
    expect(screen.getByText('Full house · 3 rooms')).toBeInTheDocument();
  });

  // P5 — no empty line. The door stays open as one tertiary act.
  it('prints no line at all with neither, and keeps the door as a tertiary act', () => {
    const { container } = renderSubject();

    expect(container.querySelector('[data-letterhead-subject]')).toBeNull();
    const act = screen.getByRole('button', { name: 'Add a subject line' });
    expect(act).toHaveAttribute('data-action-variant', 'tertiary');
  });

  it('opens the editor from the printed line, by press and by key', () => {
    renderSubject({ subject: 'Whole-house refresh' });

    const line = screen.getByRole('button', { name: 'Edit the subject line' });
    fireEvent.keyDown(line, { key: 'Enter' });
    expect(screen.getByRole('textbox', { name: 'Subject line' })).toHaveValue(
      'Whole-house refresh',
    );
  });

  // The whole point of the split: the assembly is printed, never edited.
  it('opens EMPTY over an assembled line, and offers it as the placeholder', () => {
    renderSubject({ assembled: 'Full house · 3 rooms' });

    fireEvent.click(screen.getByRole('button', { name: 'Edit the subject line' }));
    const input = screen.getByRole('textbox', { name: 'Subject line' });
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', 'Full house · 3 rooms');
  });

  it('offers `Add a subject line` as the placeholder when there is no assembly', () => {
    renderSubject();

    fireEvent.click(screen.getByRole('button', { name: 'Add a subject line' }));
    expect(screen.getByRole('textbox', { name: 'Subject line' })).toHaveAttribute(
      'placeholder',
      'Add a subject line',
    );
  });

  it('saves the trimmed line on blur, against the engagement it was given', async () => {
    renderSubject({ kind: 'proposal', id: 'proposal-1', subject: 'Old line' });

    fireEvent.click(screen.getByRole('button', { name: 'Edit the subject line' }));
    const input = screen.getByRole('textbox', { name: 'Subject line' });
    fireEvent.change(input, { target: { value: '  Cedar Lane study  ' } });
    await act(async () => {
      fireEvent.blur(input);
    });

    expect(mutateAsync).toHaveBeenCalledWith({
      kind: 'proposal',
      id: 'proposal-1',
      subject: 'Cedar Lane study',
    });
  });

  it('saves null when the line is emptied', async () => {
    renderSubject({ subject: 'Whole-house refresh' });

    fireEvent.click(screen.getByRole('button', { name: 'Edit the subject line' }));
    const input = screen.getByRole('textbox', { name: 'Subject line' });
    fireEvent.change(input, { target: { value: '   ' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect(mutateAsync).toHaveBeenCalledWith({
      kind: 'relationship',
      id: 'dc-1',
      subject: null,
    });
  });

  it('does not save an unchanged line', () => {
    renderSubject({ subject: 'Whole-house refresh' });

    fireEvent.click(screen.getByRole('button', { name: 'Edit the subject line' }));
    fireEvent.blur(screen.getByRole('textbox', { name: 'Subject line' }));

    expect(mutateAsync).not.toHaveBeenCalled();
  });

  // An untouched editor over an assembled line must not persist the assembly.
  it('does not save the assembled line on a bare Enter', () => {
    renderSubject({ assembled: 'Full house · 3 rooms' });

    fireEvent.click(screen.getByRole('button', { name: 'Edit the subject line' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Subject line' }), {
      key: 'Enter',
    });

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText('Full house · 3 rooms')).toBeInTheDocument();
  });

  it('Escape restores and saves nothing', () => {
    renderSubject({ subject: 'Whole-house refresh' });

    fireEvent.click(screen.getByRole('button', { name: 'Edit the subject line' }));
    const input = screen.getByRole('textbox', { name: 'Subject line' });
    fireEvent.change(input, { target: { value: 'something else' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText('Whole-house refresh')).toBeInTheDocument();
  });
});
