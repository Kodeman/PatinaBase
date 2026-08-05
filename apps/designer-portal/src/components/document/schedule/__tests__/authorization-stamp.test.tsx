import { render, screen } from '@testing-library/react';
import { AuthorizationStamp, authorizationStampFace } from '../authorization-stamp';

describe('AuthorizationStamp', () => {
  it('draws absence as absence for an unreleased line', () => {
    render(<AuthorizationStamp auth={{ track: 'none' }} />);
    const mark = screen.getByLabelText('Not yet released for authorization');
    expect(mark).toHaveTextContent('—');
    expect(mark.dataset.authorizationTrack).toBe('none');
  });

  it('can be silent entirely when the column is not drawn', () => {
    const { container } = render(
      <AuthorizationStamp auth={{ track: 'none' }} showAbsence={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('names the draft instrument', () => {
    render(<AuthorizationStamp auth={{ track: 'draft', number: 3 }} />);
    expect(screen.getByText('Draft · A3')).toBeInTheDocument();
  });

  it('waits in golden hour', () => {
    render(<AuthorizationStamp auth={{ track: 'awaiting', number: 3 }} />);
    const stamp = screen.getByText('Awaiting signature · A3');
    expect(stamp).toHaveStyle({ borderColor: 'var(--color-golden-hour)' });
  });

  it('settles into sage once it is signed', () => {
    render(
      <AuthorizationStamp
        auth={{
          track: 'authorized',
          number: 2,
          signedLineTotalCents: 390000,
          depositClear: true,
          deltaCents: null,
        }}
      />,
    );
    const stamp = screen.getByText('Authorized · A2');
    expect(stamp).toHaveStyle({ borderColor: 'var(--color-sage)' });
  });

  it('borrows the Stamp grammar — mono, uppercase, rotated, unfilled', () => {
    render(<AuthorizationStamp auth={{ track: 'draft', number: 1 }} />);
    const stamp = screen.getByText('Draft · A1');
    expect(stamp.className).toContain('font-mono');
    expect(stamp.className).toContain('uppercase');
    expect(stamp.className).toContain('-rotate-[1.5deg]');
    expect(stamp.className).toContain('bg-transparent');
    expect(stamp.className).not.toMatch(/shadow/);
  });

  it('exposes the face for surfaces that draw their own mark', () => {
    expect(authorizationStampFace({ track: 'none' })).toBeNull();
    expect(authorizationStampFace({ track: 'awaiting', number: 9 })).toMatchObject(
      { label: 'Awaiting signature · A9' },
    );
  });
});
