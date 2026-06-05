import { render, screen } from '@testing-library/react';
import Link from 'next/link';

import { PageActionBar } from './page-action-bar';
import { ListPageHeader } from './list-page-header';
import { Button } from '@/components/ui/controls';

describe('PageActionBar', () => {
  it('renders the status badge and the action group', () => {
    render(
      <PageActionBar
        status={{ tone: 'success', label: 'Approved', dot: true }}
        actions={<Button>Edit</Button>}
      />,
    );
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('renders meta content in the left cluster', () => {
    render(<PageActionBar meta={<span>v3 · Sage Loft</span>} />);
    expect(screen.getByText('v3 · Sage Loft')).toBeInTheDocument();
  });

  it('returns null when every slot is empty', () => {
    const { container } = render(<PageActionBar />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ListPageHeader', () => {
  it('renders an h1 with the title', () => {
    render(<ListPageHeader title="Proposals" />);
    const heading = screen.getByRole('heading', { level: 1, name: 'Proposals' });
    expect(heading).toBeInTheDocument();
  });

  it('renders a link action with the verbatim accessible name', () => {
    render(
      <ListPageHeader
        title="Proposals"
        actions={
          <Button asChild>
            <Link href="/portal/proposals/new">+ New Proposal</Link>
          </Button>
        }
      />,
    );
    const link = screen.getByRole('link', { name: '+ New Proposal' });
    expect(link).toHaveAttribute('href', '/portal/proposals/new');
  });

  it('renders multiple actions including button handlers', () => {
    const onClick = jest.fn();
    render(
      <ListPageHeader
        title="Clients"
        actions={
          <>
            <Button variant="secondary" onClick={onClick}>
              Add Client
            </Button>
            <Button>Import</Button>
          </>
        }
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Add Client' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
  });

  it('renders subtitle and children rows', () => {
    render(
      <ListPageHeader title="Vendors" subtitle="Your saved suppliers">
        <div>filters</div>
      </ListPageHeader>,
    );
    expect(screen.getByText('Your saved suppliers')).toBeInTheDocument();
    expect(screen.getByText('filters')).toBeInTheDocument();
  });
});
