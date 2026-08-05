import { render, screen } from '@testing-library/react';
import { ClientAuthShell } from '../ClientAuthShell';

describe('ClientAuthShell', () => {
  it('renders the exact client brand contract and inclusive tagline', () => {
    render(
      <ClientAuthShell>
        <p>Form</p>
      </ClientAuthShell>,
    );
    expect(screen.getByText('YOUR HOME')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Good to see you.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Your project, decisions, and orders are ready when you are.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/their clients/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /support@patina.com/ }),
    ).toHaveAttribute('href', 'mailto:support@patina.com');
  });
});
