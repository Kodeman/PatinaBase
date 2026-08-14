import { render, screen } from '@testing-library/react';
import { SectionLoadingLine } from './section-loading-line';

describe('SectionLoadingLine', () => {
  it('announces the label to assistive tech via a status region', () => {
    render(<SectionLoadingLine label="Reading the work" />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Reading the work');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).not.toHaveAttribute('aria-busy');
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

  it('paints the pulse bar with a token this app actually defines', () => {
    const { container } = render(<SectionLoadingLine label="Opening the brief" />);

    const pulse = container.querySelector('[aria-hidden]');
    // --bg-muted does not exist anywhere in this app's CSS (globals.css
    // defines --bg-primary/--bg-surface/--bg-hover/--bg-subtle/--bg-warm,
    // never --bg-muted) — an undefined custom property makes
    // background-color invalid at computed-value time, so the bar renders
    // transparent. Pin the class to a token globals.css actually declares.
    expect(pulse).toHaveClass('bg-[var(--color-pearl)]');
    expect(pulse?.className).not.toMatch(/--bg-muted/);
  });

  it('accepts a className escape hatch for call-site spacing', () => {
    const { container } = render(
      <SectionLoadingLine label="Reading approvals" className="mt-3" />,
    );

    expect(container.firstElementChild).toHaveClass('mt-3');
  });
});
