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

  // P5 — a project paper's vitals already carry phase · target · money, so the
  // empty case prints nothing there, not even the act.
  it('prints nothing at all on an empty project paper — not even the act', () => {
    const { container } = renderSubject({ kind: 'project', id: 'project-1' });

    expect(container.querySelector('[data-letterhead-subject]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add a subject line' })).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('still prints a stored line on a project paper', () => {
    renderSubject({ kind: 'project', id: 'project-1', subject: 'Kitchen and bath' });
    expect(screen.getByText('Kitchen and bath')).toHaveAttribute('data-letterhead-subject');
  });

  // A real `<button>`, so Enter and Space are the platform's to translate into
  // a press — there is no hand-written key handler to assert.
  it('opens the editor from the printed line', () => {
    renderSubject({ subject: 'Whole-house refresh' });

    const line = screen.getByRole('button', { name: /edit the subject line$/ });
    fireEvent.click(line);
    expect(screen.getByRole('textbox', { name: 'Subject line' })).toHaveValue(
      'Whole-house refresh',
    );
  });

  // The whole point of the split: the assembly is printed, never edited.
  it('opens EMPTY over an assembled line, and offers it as the placeholder', () => {
    renderSubject({ assembled: 'Full house · 3 rooms' });

    fireEvent.click(screen.getByRole('button', { name: /edit the subject line$/ }));
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

    fireEvent.click(screen.getByRole('button', { name: /edit the subject line$/ }));
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

    fireEvent.click(screen.getByRole('button', { name: /edit the subject line$/ }));
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

    fireEvent.click(screen.getByRole('button', { name: /edit the subject line$/ }));
    fireEvent.blur(screen.getByRole('textbox', { name: 'Subject line' }));

    expect(mutateAsync).not.toHaveBeenCalled();
  });

  // An untouched editor over an assembled line must not persist the assembly.
  it('does not save the assembled line on a bare Enter', () => {
    renderSubject({ assembled: 'Full house · 3 rooms' });

    fireEvent.click(screen.getByRole('button', { name: /edit the subject line$/ }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Subject line' }), {
      key: 'Enter',
    });

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText('Full house · 3 rooms')).toBeInTheDocument();
  });

  // ── W3-F6 — the printed line is a real control, and names itself ────────
  it('is a real button whose accessible name carries the printed line', () => {
    renderSubject({ subject: 'Whole-house refresh · 4 rooms' });

    const line = screen.getByRole('button', {
      name: 'Whole-house refresh · 4 rooms — edit the subject line',
    });
    expect(line.tagName).toBe('BUTTON');
    expect(line).toHaveAttribute('type', 'button');
    expect(line).toHaveAttribute('data-letterhead-subject');
    // The label must never REPLACE the line: an `aria-label` here would make
    // the one line R4 exists to print unspeakable.
    expect(line).not.toHaveAttribute('aria-label');
  });

  it('wears the letterhead\u2019s own focus ring and a 44px hit box', () => {
    renderSubject({ subject: 'Whole-house refresh' });

    const line = screen.getByRole('button', { name: /edit the subject line$/ });
    expect(line).toHaveClass(
      'focus-visible:outline',
      'focus-visible:outline-2',
      'focus-visible:outline-offset-2',
      'focus-visible:outline-[var(--color-clay)]',
      'py-3',
      '-my-3',
    );
  });

  it('gives the editor the same ring and target, and no suppressed outline', () => {
    renderSubject({ subject: 'Whole-house refresh' });

    fireEvent.click(screen.getByRole('button', { name: /edit the subject line$/ }));
    const input = screen.getByRole('textbox', { name: 'Subject line' });
    expect(input).toHaveClass(
      'focus-visible:outline',
      'focus-visible:outline-[var(--color-clay)]',
      'min-h-[44px]',
      '-my-3',
    );
    expect(input.className).not.toMatch(/focus:outline-none/);
  });

  it('Escape restores and saves nothing', () => {
    renderSubject({ subject: 'Whole-house refresh' });

    fireEvent.click(screen.getByRole('button', { name: /edit the subject line$/ }));
    const input = screen.getByRole('textbox', { name: 'Subject line' });
    fireEvent.change(input, { target: { value: 'something else' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText('Whole-house refresh')).toBeInTheDocument();
  });
});
