import { render, screen } from '@testing-library/react';
import { AppChrome } from '../app-chrome';

let mockPathname = '/';

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

/* The header, the drawer, the switcher and the bell are gone: the client
   portal's one authenticated surface is the house, and it carries its own
   doorplate, details, way out and other houses. What is left of the shell is
   the record of which routes a visitor reaches with no session — and the
   promise that it renders every page's children either way. */

describe('AppChrome', () => {
  afterEach(() => {
    mockPathname = '/';
  });

  it.each([
    '/auth/signin',
    '/field/abc123',
    '/share/abc123',
    '/rfq/abc123',
    `/plans/${'a'.repeat(64)}`,
    // SP-03 / review M-D3: the shared piece page is opened from a text message
    // by someone with no session.
    '/piece/9c1f0a24-1f2b-4b7e-9a3e-0f2d8a6c5b41',
    '/wrong-portal',
    '/unauthorized',
  ])('marks the login-less guest path %s public', (pathname) => {
    mockPathname = pathname;
    const { container } = render(
      <AppChrome projects={[]}>
        <div>guest content</div>
      </AppChrome>,
    );
    expect(container.firstChild).toHaveAttribute('data-portal-shell', 'public');
    expect(screen.getByText('guest content')).toBeInTheDocument();
  });

  it.each(['/', '/projects/proj-1', '/invoices/inv-1/print'])(
    'marks the signed-in path %s authenticated and renders no header',
    (pathname) => {
      mockPathname = pathname;
      const { container } = render(
        <AppChrome projects={[]}>
          <div>app content</div>
        </AppChrome>,
      );
      expect(container.firstChild).toHaveAttribute(
        'data-portal-shell',
        'authenticated',
      );
      expect(screen.queryByRole('banner')).not.toBeInTheDocument();
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
      expect(screen.getByText('app content')).toBeInTheDocument();
    },
  );
});
