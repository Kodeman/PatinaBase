/**
 * US-28 S10c (V20 U-Q20): a Library result is plate and caption, never a
 * card. The caption names the piece, the maker and the jobs it was used on,
 * each with its job's tick; state is an ink word, never a chip.
 */
import { render, screen } from '@testing-library/react';
import { LibraryCard } from '../library-card';
import type { PieceUse } from '../use-piece-usage';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@patina/supabase', () => ({
  useStyleArchetypes: () => ({ data: [], isLoading: false }),
  useAssignStyle: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useProductStyles: () => ({ data: [], isLoading: false }),
  useSubmitValidation: () => ({ mutateAsync: jest.fn(), isPending: false, variables: undefined }),
  createBrowserClient: jest.fn(),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

const arden = {
  id: 'p-arden',
  name: 'Arden lounge chair',
  brand: 'Calloway & Brandt Upholstery',
  images: ['https://example.test/arden.jpg'],
  source_url: null,
  category: 'seating',
  layer: 'studio' as const,
};

const holloway: PieceUse = {
  projectId: 'proj-holloway',
  title: 'Holloway Den',
  clientName: 'Nora and Sam Holloway',
  stage: 'project',
};

describe('LibraryCard — plate and caption', () => {
  it('draws the plate as a mat and no card box around the piece', () => {
    const { container } = render(
      <LibraryCard item={arden} needsTeaching={false} onDeep={jest.fn()} usedOn={[holloway]} />,
    );

    const article = container.querySelector('article') as HTMLElement;
    expect(article).toHaveClass('library-plate');
    expect(article).not.toHaveClass('card');
    expect(article.className).not.toMatch(/rounded-\[8px\]|bg-white|border-\[/);

    const plate = screen.getByRole('link', { name: 'Open Arden lounge chair' });
    expect(plate).toHaveClass('plate');
    expect(plate.querySelector('img')).toHaveAttribute('src', 'https://example.test/arden.jpg');
  });

  it('names the piece, the maker and "Used on Holloway Den" with its tick', () => {
    render(
      <LibraryCard item={arden} needsTeaching={false} onDeep={jest.fn()} usedOn={[holloway]} />,
    );

    const name = screen.getByRole('link', { name: 'Arden lounge chair' });
    expect(name).toHaveClass('name', 't-d4');
    expect(name.closest('.cap')).not.toBeNull();
    expect(screen.getByText('Calloway & Brandt Upholstery')).toBeInTheDocument();

    const used = screen.getByText('Used on Holloway Den');
    expect(used).toHaveClass('tick', 'st-project');
  });

  it('names two jobs and counts the rest', () => {
    const uses: PieceUse[] = [
      holloway,
      { projectId: 'proj-pell', title: 'Pell Court Dining', clientName: null, stage: 'install' },
      { projectId: 'proj-quay', title: 'Quay Street Loft', clientName: null, stage: 'proposal' },
    ];
    render(<LibraryCard item={arden} needsTeaching={false} onDeep={jest.fn()} usedOn={uses} />);

    expect(screen.getByText('Used on Pell Court Dining')).toHaveClass('tick', 'st-install');
    expect(screen.queryByText('Used on Quay Street Loft')).toBeNull();
    expect(screen.getByText('and 1 more job')).toBeInTheDocument();
  });

  it('says nothing about jobs for a piece on none', () => {
    render(<LibraryCard item={arden} needsTeaching={false} onDeep={jest.fn()} />);
    expect(screen.queryByText(/^Used on/)).toBeNull();
  });

  it('prints state as an ink word, never a chip on the plate', () => {
    render(<LibraryCard item={arden} needsTeaching onDeep={jest.fn()} />);

    const word = screen.getByText('Needs teaching');
    expect(word).toHaveClass('word');
    expect(word.closest('.plate')).toBeNull();
    expect(word.className).not.toMatch(/rounded|border/);
  });
});


describe('Round-8 reference captions', () => {
  it('adds a named reference entrance only for round8 and retains native teaching and shelf moves', () => {
    const { rerender } = render(<LibraryCard item={arden} needsTeaching onDeep={jest.fn()} onNominate={jest.fn()} />);
    expect(screen.queryByRole('link', { name: 'View reference: Arden lounge chair' })).not.toBeInTheDocument();
    rerender(<LibraryCard item={arden} round8 needsTeaching onDeep={jest.fn()} onNominate={jest.fn()} />);
    expect(screen.getByRole('link', { name: 'View reference: Arden lounge chair' })).toHaveAttribute('href', '/library/p-arden');
    expect(screen.getByRole('button', { name: 'Add style attribution' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recommend maker' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Arden lounge chair' }).querySelector('img')).toHaveAttribute('src', arden.images[0]);
  });
});
