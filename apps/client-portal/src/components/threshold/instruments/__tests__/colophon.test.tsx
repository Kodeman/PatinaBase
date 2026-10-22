import { render, screen } from '@testing-library/react';

import { Colophon } from '../colophon';

describe('Colophon — the house sheet says who prepared the page', () => {
  it('prints the studio and that it came through Patina', () => {
    render(<Colophon studioName="Local Dev Studio" />);

    expect(screen.getByText(/Prepared by Local Dev Studio · Sent through Patina/)).toBeInTheDocument();
  });

  it('links to Privacy beside Sent through Patina in the same colophon', () => {
    render(<Colophon studioName="Local Dev Studio" />);

    const link = screen.getByRole('link', { name: 'Privacy' });
    expect(link).toHaveAttribute('href', '/privacy');
    expect(link).toHaveClass('underline', 'underline-offset-4', 'focus-visible:outline', 'focus-visible:outline-2', 'focus-visible:outline-offset-[3px]', 'focus-visible:outline-[var(--focus-ring)]', 'text-inherit', 'inline-flex', 'min-h-[44px]', 'items-center');
    expect(link).not.toHaveClass('focus-ring');
    expect(link.closest('p')).toHaveTextContent('Sent through Patina · Privacy');
  });

  it('renders nothing at all with no studio name', () => {
    const { container } = render(<Colophon studioName={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a whitespace-only studio name', () => {
    const { container } = render(<Colophon studioName="   " />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the studio name is simply absent', () => {
    const { container } = render(<Colophon />);
    expect(container).toBeEmptyDOMElement();
  });
});
