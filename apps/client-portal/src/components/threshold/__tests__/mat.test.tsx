import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Mat, type MatProps } from '../mat';

function mat(overrides: Partial<MatProps> = {}): MatProps {
  return {
    people: [
      { name: 'Nora Quist', role: 'on the letterhead', where: 'Quist Interiors' },
      { name: 'Prairie Coat Painting', role: 'on the stair-hall wall', where: 'Des Moines' },
    ],
    papers: [
      { label: 'Furnishings authorization No. 7', href: '/documents/fa-7' },
      { label: 'Invoice No. 4', onOpen: jest.fn() },
      { label: 'The design set' },
    ],
    accountHref: '/account',
    onSignOut: jest.fn(),
    ...overrides,
  };
}

describe('Mat — the people, the papers, and the way out', () => {
  it('carries the anchor, the unit, and opts into dimming', () => {
    render(<Mat {...mat()} />);

    const root = screen.getByTestId('mat');
    expect(root).toHaveAttribute('id', 'mat');
    expect(root).toHaveAttribute('data-threshold-unit', 'mat');
    expect(root).toHaveAttribute('data-dimmable');
  });

  it('gives the papers their own sub-anchor', () => {
    render(<Mat {...mat()} />);

    expect(screen.getByTestId('mat-papers')).toHaveAttribute('id', 'mat-papers');
  });

  it('names each person and where they work', () => {
    render(<Mat {...mat()} />);

    const people = screen.getByTestId('mat-people');
    expect(within(people).getByText(/Nora Quist/)).toBeInTheDocument();
    expect(within(people).getByText(/on the letterhead/)).toBeInTheDocument();
    expect(within(people).getByText('Quist Interiors')).toBeInTheDocument();
  });

  it('says nothing about a person whose place it does not know', () => {
    render(<Mat {...mat({ people: [{ name: 'Dan Okafor', role: 'on the site line', where: '' }] })} />);

    const people = screen.getByTestId('mat-people');
    expect(within(people).getByText('Dan Okafor · on the site line')).toBeInTheDocument();
    expect(within(people).getAllByText(/./)).toHaveLength(2); // the head and the one line
  });

  it('lists the papers — linked, openable, or simply named', async () => {
    const onOpen = jest.fn();
    render(<Mat {...mat({ papers: [
      { label: 'Furnishings authorization No. 7', href: '/documents/fa-7' },
      { label: 'Invoice No. 4', onOpen },
      { label: 'The design set' },
    ] })} />);

    const papers = screen.getByTestId('mat-papers');
    expect(within(papers).getByRole('link', { name: 'Furnishings authorization No. 7' })).toHaveAttribute(
      'href',
      '/documents/fa-7',
    );

    await userEvent.click(within(papers).getByRole('button', { name: 'Invoice No. 4' }));
    expect(onOpen).toHaveBeenCalledTimes(1);

    expect(within(papers).getByText('The design set')).toBeInTheDocument();
  });

  it('reads a paper that both links and opens as a link', () => {
    const onOpen = jest.fn();
    render(<Mat {...mat({ papers: [{ label: 'Invoice No. 4', href: '/invoices/4', onOpen }] })} />);

    const papers = screen.getByTestId('mat-papers');
    expect(within(papers).getByRole('link', { name: 'Invoice No. 4' })).toBeInTheDocument();
    expect(within(papers).queryByRole('button', { name: 'Invoice No. 4' })).not.toBeInTheDocument();
  });

  it('lists two papers of the same name without losing one', () => {
    render(
      <Mat {...mat({ papers: [{ label: 'Change order' }, { label: 'Change order' }] })} />,
    );

    expect(within(screen.getByTestId('mat-papers')).getAllByText('Change order')).toHaveLength(2);
  });

  it('keeps a way to her own details, named once', () => {
    render(<Mat {...mat()} />);

    expect(screen.getAllByText('Your details')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /your details/i })).toHaveAttribute(
      'href',
      '/account',
    );
  });

  it('offers the papers in full only when the page can lay them down', async () => {
    const onOpenPapers = jest.fn();
    const { rerender } = render(<Mat {...mat()} />);
    expect(
      screen.queryByRole('button', { name: /the papers, in full/i }),
    ).not.toBeInTheDocument();

    rerender(<Mat {...mat({ onOpenPapers })} />);
    await userEvent.click(screen.getByRole('button', { name: /the papers, in full/i }));
    expect(onOpenPapers).toHaveBeenCalledTimes(1);
  });

  it('says at the mat whether the papers are already down', () => {
    const onOpenPapers = jest.fn();
    const { rerender } = render(<Mat {...mat({ onOpenPapers })} />);

    const act = screen.getByRole('button', { name: /the papers, in full/i });
    expect(act).toHaveAttribute('aria-expanded', 'false');
    expect(act).toHaveAttribute('aria-controls', 'papers-sheet');

    rerender(<Mat {...mat({ onOpenPapers, papersOpen: true })} />);
    expect(screen.getByRole('button', { name: /the papers, in full/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('offers the way out, and takes it', async () => {
    const onSignOut = jest.fn();
    render(<Mat {...mat({ onSignOut })} />);

    const leave = screen.getByRole('button', { name: /leave the house/i });
    expect(leave).toBeInTheDocument();

    await userEvent.click(leave);
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  // L6 — `extraActs` is where scope-change-ask.tsx's `RequestChangeAct`
  // mounts ("Ask for a change"); optional so every caller that predates it is
  // unaffected (asserted by every test above, none of which pass it).
  it('renders extraActs, when the caller gives it one, after the two required acts', () => {
    render(
      <Mat {...mat({ extraActs: <p data-testid="mat-extra">Ask for a change</p> })} />,
    );

    expect(screen.getByTestId('mat-extra')).toBeInTheDocument();
  });

  it('renders nothing extra when the caller gives no extraActs', () => {
    render(<Mat {...mat()} />);

    expect(screen.queryByTestId('mat-extra')).not.toBeInTheDocument();
  });
});
