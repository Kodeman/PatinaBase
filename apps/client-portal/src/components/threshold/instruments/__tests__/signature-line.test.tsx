import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

import { SIGNATURE_NOTICE } from '../../consent-copy';
import {
  MIN_SIGNATURE_LENGTH,
  SignatureLine,
  signatureIsComplete,
  signedOnLabel,
} from '../signature-line';

function Harness({ on }: { on?: Date }) {
  const [value, setValue] = useState('');
  return (
    <SignatureLine
      id="sign-here"
      value={value}
      onChange={setValue}
      on={on}
      testId="sign-name"
    />
  );
}

describe('SignatureLine — the name on a rule, dated', () => {
  it('draws the word, the rule and the date beside it', () => {
    render(<Harness on={new Date('2026-09-05T12:00:00Z')} />);

    const field = screen.getByTestId('sign-name');
    expect(field).toHaveAttribute('autocomplete', 'name');
    expect(field).toHaveAttribute('id', 'sign-here');
    expect(screen.getByLabelText('Type your full name')).toBe(field);
    // A rule, not a box: the field is bordered on one edge only.
    expect(field).toHaveClass('border-b');
    expect(field).toHaveClass('border-0');

    expect(screen.getByTestId('sign-name-date')).toHaveTextContent('5 September 2026');
    expect(screen.getByTestId('sign-name-date')).toHaveClass('font-mono');
  });

  it('prints the electronic-signature sentence, byte for byte', () => {
    render(<Harness />);
    expect(screen.getByTestId('sign-name-notice')).toHaveTextContent(SIGNATURE_NOTICE);
    expect(SIGNATURE_NOTICE).toBe(
      'Your typed name acts as your electronic signature.',
    );
  });

  it('leaves the sentence out where the act already carries it', () => {
    render(
      <SignatureLine
        id="sign-here"
        value=""
        onChange={jest.fn()}
        notice={false}
        testId="sign-name"
      />,
    );
    expect(screen.queryByTestId('sign-name-notice')).toBeNull();
  });

  it('takes what is typed', () => {
    render(<Harness />);
    fireEvent.change(screen.getByTestId('sign-name'), {
      target: { value: 'Harper Vale' },
    });
    expect(screen.getByTestId('sign-name')).toHaveValue('Harper Vale');
  });

  it('never reports a field as empty or wrong', () => {
    const { container } = render(<Harness />);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toMatch(/required|invalid|must|error/i);
  });

  it('a name is complete at two characters, trimmed', () => {
    expect(MIN_SIGNATURE_LENGTH).toBe(2);
    expect(signatureIsComplete('')).toBe(false);
    expect(signatureIsComplete('   ')).toBe(false);
    expect(signatureIsComplete('H')).toBe(false);
    expect(signatureIsComplete(' H ')).toBe(false);
    expect(signatureIsComplete('Ha')).toBe(true);
    expect(signatureIsComplete('  Harper Vale  ')).toBe(true);
  });

  it('dates a signature with its year', () => {
    expect(signedOnLabel(new Date('2026-01-09T12:00:00Z'))).toBe('9 January 2026');
  });

  it('keeps the day it was drawn on across keystrokes', () => {
    render(<Harness />);
    const first = screen.getByTestId('sign-name-date').textContent;
    fireEvent.change(screen.getByTestId('sign-name'), { target: { value: 'Harper' } });
    expect(screen.getByTestId('sign-name-date')).toHaveTextContent(first as string);
  });

  it('disables the rule when the act is closed', () => {
    render(
      <SignatureLine
        id="sign-here"
        value="Harper Vale"
        onChange={jest.fn()}
        disabled
        testId="sign-name"
      />,
    );
    expect(screen.getByTestId('sign-name')).toBeDisabled();
  });
});
