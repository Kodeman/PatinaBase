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
  it('carries the anchor and the threshold unit', () => {
    render(<Mat {...mat()} />);

    const root = screen.getByTestId('mat');
    expect(root).toHaveAttribute('id', 'mat');
    expect(root).toHaveAttribute('data-threshold-unit', 'mat');
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

  it('keeps a way to her own details', () => {
    render(<Mat {...mat()} />);

    expect(screen.getByRole('link', { name: /your details/i })).toHaveAttribute(
      'href',
      '/account',
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
});
