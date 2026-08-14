import { render, screen } from '@testing-library/react';
import { SectionLoadingLine } from './section-loading-line';

describe('SectionLoadingLine', () => {
  it('announces the label to assistive tech via a status region', () => {
    render(<SectionLoadingLine label="Reading the work" />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Reading the work');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-busy', 'true');
  });

  it('renders the label as sr-only text rather than visible prose', () => {
    render(<SectionLoadingLine label="Loading working budget" />);

    const label = screen.getByText('Loading working budget');
    expect(label).toHaveClass('sr-only');
  });

  it('hides the decorative pulse bar from assistive tech', () => {
    const { container } = render(<SectionLoadingLine label="Opening the brief" />);

    const pulse = container.querySelector('[aria-hidden]');
    expect(pulse).not.toBeNull();
    expect(pulse).toHaveClass('animate-pulse');
  });

  it('accepts a className escape hatch for call-site spacing', () => {
    const { container } = render(
      <SectionLoadingLine label="Reading approvals" className="mt-3" />,
    );

    expect(container.firstElementChild).toHaveClass('mt-3');
  });
});
