import { render, screen } from '@testing-library/react';
import { DocumentRouteBoundary } from './document-route-boundary';

let pathname = '/desk';
jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

describe('DocumentRouteBoundary', () => {
  it('keeps the ordinary document world on Desk routes', () => {
    pathname = '/desk';
    render(
      <DocumentRouteBoundary bare={<div>bare room</div>}>
        <div>document chrome</div>
      </DocumentRouteBoundary>,
    );
    expect(screen.getByText('document chrome')).toBeInTheDocument();
    expect(screen.queryByText('bare room')).not.toBeInTheDocument();
  });

  it('removes every document-global sibling from a board room', () => {
    pathname = '/board/board-1';
    render(
      <DocumentRouteBoundary bare={<div>bare room</div>}>
        <div>document chrome</div>
      </DocumentRouteBoundary>,
    );
    expect(screen.getByText('bare room')).toBeInTheDocument();
    expect(screen.queryByText('document chrome')).not.toBeInTheDocument();
  });
});
