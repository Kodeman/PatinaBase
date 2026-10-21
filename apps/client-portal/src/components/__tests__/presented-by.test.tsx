import { render, screen, within } from '@testing-library/react';
import { toPresentationIdentity } from '@patina/supabase';
import { ContactDesigner, PresentedBy, hasPresentation } from '../presented-by';

// US-37 #6 (contract D8). The server (00812) resolves each field (the firm's
// public email before the lead's, the lead's phone before the firm's, R178)
// and omits blanks; `toPresentationIdentity` is the client's allowlist over
// that payload; `PresentedBy` draws only what is present.

const FULL = {
  firmName: 'Hart Studio',
  logoUrl: 'https://cdn.test/hart-logo.png',
  website: 'https://www.hart.test/',
  designerName: 'Leah Hart',
  email: 'leah@hart.test',
  phone: '+1 (555) 0101',
};

describe('PresentedBy', () => {
  it('full profile: mark, firm, and the lead’s name, email, phone and the website', () => {
    render(<PresentedBy identity={FULL} />);

    const block = screen.getByTestId('presented-by');
    const logo = within(block).getByTestId('presented-by-logo');
    expect(logo).toHaveAttribute('src', 'https://cdn.test/hart-logo.png');
    // Natural ratio, height-capped.
    expect(logo).toHaveStyle({ maxHeight: '32px', width: 'auto' });
    expect(within(block).getByTestId('presented-by-firm')).toHaveTextContent('Hart Studio');

    const contact = within(block).getByTestId('presented-by-contact');
    expect(contact).toHaveTextContent('Leah Hart · leah@hart.test · +1 (555) 0101 · hart.test');
    expect(within(block).getByTestId('presented-by-email')).toHaveAttribute('href', 'mailto:leah@hart.test');
    expect(within(block).getByTestId('presented-by-phone')).toHaveAttribute('href', 'tel:+15550101');
    expect(within(block).getByTestId('presented-by-website')).toHaveAttribute('href', 'https://www.hart.test/');
    expect(within(block).getAllByTestId('presented-by-separator')).toHaveLength(3);
  });

  it('a separator never opens a line, and a phone number never wraps inside itself', () => {
    const { rerender } = render(<PresentedBy identity={FULL} />);

    // A no-break space (U+00A0), never an ordinary space, binds each dot to
    // the part before it.
    const separators = screen.getAllByTestId('presented-by-separator');
    expect(separators.map((separator) => separator.textContent)).toEqual([
      ' ·',
      ' ·',
      ' ·',
    ]);
    expect(screen.getByTestId('presented-by-phone')).toHaveClass('whitespace-nowrap');

    // The unlinked phone (no dialable digits) holds together too.
    rerender(<PresentedBy identity={{ designerName: 'Leah Hart', phone: 'ask the studio' }} />);
    const unlinked = screen.getByTestId('presented-by-phone');
    expect(unlinked.tagName).toBe('SPAN');
    expect(unlinked).toHaveClass('whitespace-nowrap');
    expect(screen.getByTestId('presented-by-separator').textContent).toBe(' ·');
  });

  it('preserves a phone extension in the dial link and leaves prose unlinked', () => {
    const { rerender } = render(
      <PresentedBy identity={{ phone: '+1 (212) 555-0100 ext. 123' }} />,
    );
    expect(screen.getByTestId('presented-by-phone')).toHaveAttribute(
      'href',
      'tel:+12125550100;ext=123',
    );
    expect(screen.getByTestId('presented-by-phone')).toHaveTextContent(
      '+1 (212) 555-0100 ext. 123',
    );

    rerender(<PresentedBy identity={{ phone: 'call the studio x123' }} />);
    expect(screen.getByTestId('presented-by-phone').tagName).toBe('SPAN');
    expect(screen.getByTestId('presented-by-phone')).toHaveTextContent('call the studio x123');
  });

  it('designer fields empty → the firm’s email and phone, as the server falls back', () => {
    // What 00812 returns for a lead with blank email/phone: the firm's, per field.
    const identity = toPresentationIdentity({
      firmName: 'Hart Studio',
      designerName: 'Dana Low',
      email: 'studio@hart.test',
      phone: '+1 555 0100',
    });
    render(<PresentedBy identity={identity} />);

    expect(screen.getByTestId('presented-by-contact')).toHaveTextContent(
      'Dana Low · studio@hart.test · +1 555 0100',
    );
    expect(screen.queryByTestId('presented-by-logo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('presented-by-website')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('presented-by-separator')).toHaveLength(2);
  });

  it('everything empty → nothing rendered at all', () => {
    const { container: empty } = render(<PresentedBy identity={{}} />);
    expect(empty).toBeEmptyDOMElement();

    const { container: absent } = render(<PresentedBy identity={null} />);
    expect(absent).toBeEmptyDOMElement();

    const { container: blank } = render(
      <PresentedBy identity={{ firmName: '  ', email: '', phone: ' ' }} />,
    );
    expect(blank).toBeEmptyDOMElement();
    expect(hasPresentation({ firmName: '  ' })).toBe(false);
  });

  it('no stray separators or empty labels when only some fields are present', () => {
    render(<PresentedBy identity={{ firmName: 'Hart Studio', phone: '+1 555 0100' }} />);

    expect(screen.getByTestId('presented-by-contact').textContent).toBe('+1 555 0100');
    expect(screen.queryByTestId('presented-by-separator')).not.toBeInTheDocument();

    const { container } = render(<PresentedBy identity={{ logoUrl: 'https://cdn.test/mark.png' }} />);
    expect(container.querySelector('[data-testid="presented-by-contact"]')).toBeNull();
    expect(container.querySelector('[data-testid="presented-by-firm"]')).toBeNull();
    // Alone, the mark carries the name for a screen reader.
    expect(container.querySelector('img')).toHaveAttribute('alt', 'Studio mark');
  });

  it('a website typed without a scheme still links over https, and a non-web scheme does not link', () => {
    const { rerender } = render(<PresentedBy identity={{ website: 'hart.test' }} />);
    expect(screen.getByTestId('presented-by-website')).toHaveAttribute('href', 'https://hart.test/');

    rerender(<PresentedBy identity={{ website: 'javascript:alert(1)' }} />);
    expect(screen.getByTestId('presented-by-website').tagName).toBe('SPAN');
  });
});

describe('ContactDesigner (CPUX-06 · A18)', () => {
  it('names the designer, offers the presented phone, and points at the existing reply', () => {
    render(
      <ContactDesigner
        identity={{ designerName: 'Maren Holt', phone: '(608) 555-0148' }}
        writeAnchor="write-back"
      />,
    );
    expect(screen.getByRole('heading', { name: 'Contact Maren Holt' })).toBeInTheDocument();
    expect(screen.getByTestId('contact-designer')).toHaveTextContent(
      'Call (608) 555-0148, or write here.',
    );
    expect(screen.getByTestId('contact-phone')).toHaveAttribute('href', 'tel:6085550148');
    expect(screen.getByRole('link', { name: 'write here' })).toHaveAttribute('href', '#write-back');
  });

  /* R6 (SQ-1530): each way in is a 44px target (CPUX-07) that still reads as
     an underlined text link. */
  it('gives every contact link a 44px target and keeps it a text link', () => {
    render(
      <ContactDesigner
        identity={{
          designerName: 'Maren Holt',
          phone: '(608) 555-0148',
          email: 'maren@birchwood.studio',
        }}
        writeAnchor="write-back"
      />,
    );
    for (const id of ['contact-phone', 'contact-email', 'contact-write']) {
      const link = screen.getByTestId(id);
      expect(link.tagName).toBe('A');
      expect(link).toHaveClass('inline-flex', 'min-h-11', 'items-center', 'underline');
    }
  });

  it('with no thread, offers only what the studio presented', () => {
    render(
      <ContactDesigner identity={{ designerName: 'Maren Holt', email: 'maren@birchwood.studio' }} />,
    );
    expect(screen.getByTestId('contact-designer')).toHaveTextContent('Email maren@birchwood.studio.');
    expect(screen.getByTestId('contact-email')).toHaveAttribute(
      'href',
      'mailto:maren@birchwood.studio',
    );
    expect(screen.queryByTestId('contact-write')).toBeNull();
  });

  it('with nothing presented and no thread, invents no channel and no name', () => {
    render(<ContactDesigner identity={{}} />);
    expect(screen.getByRole('heading', { name: 'Contact your designer' })).toBeInTheDocument();
    expect(screen.getByTestId('contact-designer')).toHaveTextContent(
      'Contact your designer using the phone number or email you already use.',
    );
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('toPresentationIdentity', () => {
  it('keeps only the six allowlisted keys, as non-blank strings', () => {
    expect(
      toPresentationIdentity({
        ...FULL,
        email: '  ',
        description: 'not allowlisted',
        tax_id: '12-3456789',
        phone: 42,
      }),
    ).toEqual({
      firmName: 'Hart Studio',
      logoUrl: 'https://cdn.test/hart-logo.png',
      website: 'https://www.hart.test/',
      designerName: 'Leah Hart',
    });
    expect(toPresentationIdentity(null)).toEqual({});
    expect(toPresentationIdentity([FULL])).toEqual({});
  });
});
