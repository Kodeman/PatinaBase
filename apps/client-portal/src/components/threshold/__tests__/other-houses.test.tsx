import { render, screen, within } from '@testing-library/react';

import { Mat } from '../mat';
import { OtherHouses } from '../other-houses';

/* ── Your other houses ──────────────────────────────────────────────────────
   The mat is where a client with more than one project finds the other doors.
   A solo client is told nothing at all — the column is absent, not empty.
   ────────────────────────────────────────────────────────────────────────── */

const HOUSES = [
  { id: 'proj-linden', name: 'The Linden house', location: 'Des Moines' },
  { id: 'proj-ash', name: 'The Ash cottage' },
];

describe('OtherHouses', () => {
  it('names every other house and links to it', () => {
    render(<OtherHouses houses={HOUSES} />);

    const column = screen.getByTestId('mat-other-houses');
    expect(within(column).getByRole('link', { name: /The Linden house/ })).toHaveAttribute(
      'href',
      '/projects/proj-linden',
    );
    expect(within(column).getByRole('link', { name: /The Ash cottage/ })).toHaveAttribute(
      'href',
      '/projects/proj-ash',
    );
  });

  it('names where a house stands when it knows', () => {
    render(<OtherHouses houses={HOUSES} />);

    expect(screen.getByText('Des Moines')).toBeInTheDocument();
  });

  it('reads the name and the place as one name, separated', () => {
    render(<OtherHouses houses={HOUSES} />);

    expect(
      screen.getByRole('link', { name: 'The Linden house · Des Moines' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'The Ash cottage' })).toBeInTheDocument();
  });

  it('says nothing about a house whose place it does not know', () => {
    render(<OtherHouses houses={[{ id: 'proj-ash', name: 'The Ash cottage' }]} />);

    expect(screen.queryByText('Des Moines')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'The Ash cottage' })).toBeInTheDocument();
  });

  it('says what is waiting at another house, in prose', () => {
    render(
      <OtherHouses
        houses={[
          { id: 'proj-linden', name: 'The Linden house', approvalsPending: 1 },
          { id: 'proj-ash', name: 'The Ash cottage', unreadMessages: 2 },
        ]}
      />,
    );

    expect(screen.getByText('A paper is waiting there.')).toBeInTheDocument();
    expect(screen.getByText('Notes are waiting there.')).toBeInTheDocument();
  });

  it('says nothing about a house with nothing waiting', () => {
    render(
      <OtherHouses
        houses={[
          {
            id: 'proj-linden',
            name: 'The Linden house',
            approvalsPending: 0,
            unreadMessages: 0,
          },
        ]}
      />,
    );

    expect(screen.queryByText(/waiting there/)).not.toBeInTheDocument();
  });

  it('carries what is waiting into the accessible name of the link', () => {
    render(
      <OtherHouses
        houses={[
          {
            id: 'proj-linden',
            name: 'The Linden house',
            location: 'Des Moines',
            approvalsPending: 1,
          },
        ]}
      />,
    );

    expect(
      screen.getByRole('link', {
        name: 'The Linden house · Des Moines. A paper is waiting there.',
      }),
    ).toBeInTheDocument();
  });

  it('renders nothing at all when there is no other house', () => {
    const { container } = render(<OtherHouses houses={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('reads them as lines, never as acts', () => {
    render(<OtherHouses houses={HOUSES} />);

    const column = screen.getByTestId('mat-other-houses');
    expect(within(column).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('Mat — the other houses column', () => {
  function matProps(otherHouses?: typeof HOUSES) {
    return {
      people: [{ name: 'Nora Quist', role: 'on the letterhead', where: 'Quist Interiors' }],
      papers: [{ label: 'The design set' }],
      otherHouses,
      accountHref: '/account' as const,
      onSignOut: jest.fn(),
    };
  }

  it('stands the column beside the papers for a multi-house client', () => {
    render(<Mat {...matProps(HOUSES)} />);

    const column = screen.getByTestId('mat-other-houses');
    expect(within(column).getByText('Your other houses')).toBeInTheDocument();
    expect(within(column).getByRole('link', { name: /The Linden house/ })).toBeInTheDocument();
  });

  it('leaves the mat exactly as it was for a solo client', () => {
    render(<Mat {...matProps()} />);

    expect(screen.queryByTestId('mat-other-houses')).not.toBeInTheDocument();
    expect(screen.getByTestId('mat-papers')).toBeInTheDocument();
    expect(screen.getByTestId('mat-details')).toBeInTheDocument();
  });
});
