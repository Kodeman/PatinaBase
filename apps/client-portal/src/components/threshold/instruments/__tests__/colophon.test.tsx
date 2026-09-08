import { render, screen } from '@testing-library/react';

import { Colophon } from '../colophon';

describe('Colophon — the house sheet says who prepared the page', () => {
  it('prints the studio and that it came through Patina', () => {
    render(<Colophon studioName="Local Dev Studio" />);

    expect(screen.getByText('Prepared by Local Dev Studio · Sent through Patina')).toBeInTheDocument();
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
