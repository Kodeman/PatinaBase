import { render, screen } from '@testing-library/react';
import { AppChrome } from '../app-chrome';

let mockPathname = '/projects';

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

// ClientHeader pulls in useAuth/useProfile/help-system queries — the whole
// point of PUBLIC_PREFIXES is that a login-less guest page never mounts it
// (and never fires those queries), so it's stubbed here to a visible witness
// rather than a real render.
jest.mock('../client-header', () => ({
  ClientHeader: () => <div data-testid="client-header">client-header</div>,
}));

describe('AppChrome', () => {
  afterEach(() => {
    mockPathname = '/projects';
  });

  it.each(['/field/abc123', '/share/abc123', '/rfq/abc123'])(
    'renders no header (and never mounts ClientHeader) on the login-less guest path %s',
    (pathname) => {
      mockPathname = pathname;
      render(
        <AppChrome projects={[]}>
          <div>guest content</div>
        </AppChrome>,
      );
      expect(screen.queryByTestId('client-header')).not.toBeInTheDocument();
      expect(screen.getByText('guest content')).toBeInTheDocument();
    },
  );

  it('renders the authenticated header on a normal app route', () => {
    mockPathname = '/projects/proj-1';
    render(
      <AppChrome projects={[]}>
        <div>app content</div>
      </AppChrome>,
    );
    expect(screen.getByTestId('client-header')).toBeInTheDocument();
    expect(screen.getByText('app content')).toBeInTheDocument();
  });
});
