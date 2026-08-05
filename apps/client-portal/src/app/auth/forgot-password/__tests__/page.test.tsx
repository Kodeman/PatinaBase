import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ForgotPasswordPage from '../page';

const resetPassword = jest.fn();
jest.mock('@patina/supabase', () => ({
  useResetPassword: () => ({ mutateAsync: resetPassword, isPending: false }),
}));

describe('ForgotPasswordPage', () => {
  it('uses the same non-enumerating success response when the request fails', async () => {
    resetPassword.mockRejectedValueOnce(new Error('user not found'));
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'unknown@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send recovery link' }));
    await waitFor(() =>
      expect(screen.getByText(/If an account exists/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/user not found/i)).not.toBeInTheDocument();
  });
});
