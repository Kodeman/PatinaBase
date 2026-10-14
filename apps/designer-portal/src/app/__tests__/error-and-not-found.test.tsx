import { Component, type ErrorInfo, type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DocumentError from '../(document)/error';
import NotFound from '../not-found';

class ChildBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {}

  render() {
    if (this.state.error) {
      return <DocumentError error={this.state.error} reset={() => {}} />;
    }
    return this.props.children;
  }
}

describe('document error boundary', () => {
  it('keeps the document chrome around a failed child', () => {
    const ThrowingChild = () => {
      throw new Error('failed paper section');
    };

    render(
      <div>
        <nav aria-label="Document chrome">Studio drawer and command bar</nav>
        <ChildBoundary>
          <ThrowingChild />
        </ChildBoundary>
      </div>,
    );

    expect(screen.getByRole('navigation', { name: 'Document chrome' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('This part of the paper could not be read.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('renders the unknown-page destination back to the Desk', () => {
    render(<NotFound />);

    expect(screen.getByText('This page isn’t on the Desk.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the Desk' })).toHaveAttribute('href', '/desk');
  });
});
