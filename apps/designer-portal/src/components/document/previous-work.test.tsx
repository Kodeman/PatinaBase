import { fireEvent, render, screen } from '@testing-library/react';
import { PreviousWork } from './previous-work';

describe('PreviousWork', () => {
  it('is closed by default and exposes an accessible disclosure', () => {
    render(<PreviousWork count={3}><div>Brief recap</div></PreviousWork>);
    const button = screen.getByRole('button', { name: 'Previous work · 3 complete' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Brief recap')).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Brief recap')).toBeInTheDocument();
  });
});
