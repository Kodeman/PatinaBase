import { render, screen } from '@testing-library/react';
import { SettledBar } from './settled-bar';

describe('SettledBar focus and disclosure contracts', () => {
  it('provides a focus target for a settled section without a review body', () => {
    render(<SettledBar name="Project" anchorId="section-project" />);
    expect(screen.getByText('Project').closest('[data-settled-heading]')).toHaveAttribute('tabindex', '-1');
  });

  it('keeps the controlled review target mounted while collapsed', () => {
    render(<SettledBar name="Brief" anchorId="section-brief" onToggle={jest.fn()}>Recap</SettledBar>);
    const button = screen.getByRole('button', { name: /Brief/ });
    const review = document.getElementById(button.getAttribute('aria-controls')!);
    expect(review).toBeInTheDocument();
    expect(review).not.toBeVisible();
  });
});
