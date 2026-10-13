/**
 * US-28 S10c: the Library's one filter grammar and its search.
 * - shelf and type are one row of underline words in the S1 `.filters`
 *   grammar; no pills;
 * - the 390 search fix: the field holds at least 240px and the act beside it
 *   wraps rather than squeezing it (the walk saw it shrink to "P").
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen } from '@testing-library/react';
import { LibrarianBar } from '../librarian-bar';
import { LibraryToolbar } from '../library-toolbar';

jest.mock('@patina/supabase', () => ({
  useCrossLayerSearch: () => ({ data: null, isLoading: false, isError: false }),
}));

jest.mock('@/components/document/engine/engine-results', () => ({
  EngineResults: () => null,
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

const globals = readFileSync(
  join(__dirname, '..', '..', '..', '..', '..', 'app', 'globals.css'),
  'utf8',
);

function libraryBlock(): string {
  const start = globals.indexOf('/* ═══ US-28 S10 library');
  const end = globals.indexOf('/* ═══ end US-28 S10 library');
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return globals.slice(start, end);
}

function rule(block: string, selector: string): string {
  const at = block.indexOf(`${selector} {`);
  expect(at).toBeGreaterThanOrEqual(0);
  return block.slice(at, block.indexOf('}', at));
}

describe('LibraryToolbar — one filter grammar', () => {
  it('puts shelf and type in one row of underline words, with no pills', () => {
    const { container } = render(
      <LibraryToolbar
        activeLayer="studio"
        counts={{ personal: 0, studio: 4, catalog: 25 }}
        onLayerChange={jest.fn()}
        onCompose={jest.fn()}
        onImport={jest.fn()}
        activeCapability="all"
        onCapabilityChange={jest.fn()}
      />,
    );

    const row = container.querySelector('.filters') as HTMLElement;
    expect(row).not.toBeNull();
    expect(container.querySelectorAll('.filters')).toHaveLength(1);

    const shelf = screen.getByRole('tablist', { name: 'Library shelf lens' });
    const type = screen.getByRole('group', { name: 'Filter by configuration capability' });
    expect(row).toContainElement(shelf);
    expect(row).toContainElement(type);

    const studio = screen.getByRole('tab', { name: 'Studio, 4 products' });
    expect(studio).toHaveAttribute('aria-selected', 'true');
    expect(studio.tagName).toBe('BUTTON');

    const words = [
      ...screen.getAllByRole('tab'),
      ...type.querySelectorAll('button'),
    ];
    // library-p1's shelf words: All shelves, Personal, Studio, Patina catalog.
    expect(screen.getAllByRole('tab').map((tab) => tab.firstChild?.textContent)).toEqual([
      'All shelves',
      'Personal',
      'Studio',
      'Patina catalog',
    ]);
    expect(screen.getByRole('tab', { name: 'All shelves, 29 products' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(words).toHaveLength(4 + 6);
    words.forEach((word) => {
      expect(word.className).not.toMatch(/rounded|pill|border/);
      expect(word.closest('.filters')).toBe(row);
    });
    expect(screen.getByRole('button', { name: 'All products' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('LibrarianBar — the 390 search width', () => {
  it('gives the field its own class and lets the act sit beside it, not inside it', () => {
    render(<LibrarianBar />);
    const field = screen.getByRole('searchbox');
    expect(field).toHaveClass('library-search-field');
    const row = field.parentElement as HTMLElement;
    expect(row).toHaveClass('library-search-row');
    expect(row).toContainElement(screen.getByRole('button', { name: 'Ask a sourcing question' }));
  });

  it('holds the field at 240px or wider and lets the row wrap', () => {
    const block = libraryBlock();
    expect(rule(block, '.library-search-field')).toMatch(/min-width:\s*240px/);
    expect(rule(block, '.library-search-row')).toMatch(/flex-wrap:\s*wrap/);
  });
});
