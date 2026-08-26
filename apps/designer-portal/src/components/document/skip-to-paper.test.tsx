/**
 * F55 — the skip link. The two acceptance facts: it is the first focusable
 * node in whatever it is mounted ahead of, and activating it moves focus
 * into the paper `<main>` (found by `data-document-paper` where present,
 * plain `<main>` otherwise — see skip-to-paper.tsx's own doc comment for why
 * it resolves by attribute rather than an id page.tsx does not carry).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { SkipToPaper } from './skip-to-paper';

describe('SkipToPaper', () => {
  it('is mounted ahead of every other node in the (document) layout', () => {
    // The claim this component exists to make can only be true or false in the
    // layout, and the layout itself is a server component this suite cannot
    // render (its provider tree reaches Supabase). Read the source instead.
    const layout = readFileSync(
      join(__dirname, '../../app/(document)/layout.tsx'),
      'utf8',
    );
    const body = layout.slice(layout.indexOf('export default function'));

    const skipAt = body.indexOf('<SkipToPaper />');
    expect(skipAt).toBeGreaterThan(-1);
    expect(skipAt).toBeLessThan(body.indexOf('<DocumentRouteBoundary'));
  });

  it('is the first focusable node in the tree it is mounted ahead of', () => {
    render(
      <>
        <SkipToPaper />
        <button type="button">Studio books</button>
        <main data-document-paper>The paper</main>
      </>,
    );

    const link = screen.getByRole('link', { name: 'Skip to the paper' });
    const button = screen.getByRole('button', { name: 'Studio books' });
    expect(
      link.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('moves focus into the paper via the data-document-paper attribute when present', () => {
    render(
      <>
        <SkipToPaper />
        <main data-document-paper>The paper</main>
      </>,
    );

    const link = screen.getByRole('link', { name: 'Skip to the paper' });
    fireEvent.click(link);

    const paper = screen.getByText('The paper');
    expect(paper).toHaveFocus();
    expect(paper).toHaveAttribute('tabindex', '-1');
  });

  it('prefers the paper attribute over an earlier <main> in document order', () => {
    render(
      <>
        <SkipToPaper />
        <main>An earlier main</main>
        <main data-document-paper>The paper</main>
      </>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Skip to the paper' }));

    expect(screen.getByText('The paper')).toHaveFocus();
  });

  it('falls back to a plain <main> on routes with no data-document-paper attribute', () => {
    render(
      <>
        <SkipToPaper />
        <main>The Desk</main>
      </>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Skip to the paper' }));

    expect(screen.getByText('The Desk')).toHaveFocus();
  });

  it('does nothing (and does not throw) when no paper target exists', () => {
    render(<SkipToPaper />);
    expect(() =>
      fireEvent.click(screen.getByRole('link', { name: 'Skip to the paper' })),
    ).not.toThrow();
  });
});
