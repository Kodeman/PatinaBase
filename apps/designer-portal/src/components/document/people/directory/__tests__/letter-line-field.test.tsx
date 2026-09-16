import { render, screen, fireEvent } from '@testing-library/react';
import {
  LetterLineField,
  checkboxHelper,
  checkboxLabel,
  counterCopy,
  factsLine,
  fieldLabel,
  sendButtonLabel,
  successLine,
} from '../letter-line-field';

describe('lens-4 §B.2 — the facts line states what the letter will be missing', () => {
  it('assembles every fact it has', () => {
    expect(
      factsLine({
        clientName: 'Dave Okonkwo',
        clientEmail: 'dave@okonkwo.net',
        projectName: 'Van Hise kitchen and back hall',
      }),
    ).toBe(
      'DAVE OKONKWO · dave@okonkwo.net · VAN HISE KITCHEN AND BACK HALL · ADDED TODAY',
    );
  });

  it('states a missing project rather than hiding it', () => {
    expect(
      factsLine({
        clientName: 'Priya Raman',
        clientEmail: 'priya@ramanhouse.com',
        projectName: null,
      }),
    ).toBe('PRIYA RAMAN · priya@ramanhouse.com · NO PROJECT YET · ADDED TODAY');
  });

  it('states a missing name rather than inventing one', () => {
    expect(
      factsLine({
        clientName: null,
        clientEmail: 'dave@okonkwo.net',
        projectName: 'Van Hise kitchen and back hall',
      }),
    ).toBe(
      'dave@okonkwo.net · NO NAME · VAN HISE KITCHEN AND BACK HALL · ADDED TODAY',
    );
  });
});

describe('lens-4 §B.4 — a plain count, no bar, no colour, no violation', () => {
  it('counts down and stops', () => {
    expect(counterCopy(0)).toBe('Up to 280 characters');
    expect(counterCopy(184)).toBe('96 left');
    expect(counterCopy(280)).toBe("That's the whole 280.");
  });
});

describe('lens-4 §B.1 / §B.5 / §B.6 — the words the designer reads', () => {
  it('names the recipient in the label, and falls back without one', () => {
    expect(fieldLabel('Dave')).toBe('A line for Dave');
    expect(fieldLabel(null)).toBe('A line to send with it');
  });

  it('replaces "Send a magic-link invite to Patina"', () => {
    expect(checkboxLabel('Dave')).toBe('Send Dave the letter');
    expect(checkboxLabel(null)).toBe('Send them the letter');
    for (const label of [checkboxLabel('Dave'), checkboxLabel(null)]) {
      expect(label).not.toMatch(/magic-link|invite|Patina/i);
    }
  });

  it('names the studio as sender and the off-state as a real choice', () => {
    expect(
      checkboxHelper({ givenName: 'Dave', studioName: 'Middle West Studio', pronoun: null }),
    ).toBe(
      'They get one email from Middle West Studio with your line in it and a link that signs them in. Leave it off and they’re on your roster only — you can write later.',
    );
    expect(checkboxHelper({ givenName: null, studioName: null, pronoun: null })).toBe(
      'They get one email from you with your line in it and a link that signs them in. Leave it off and they’re on your roster only — you can write later.',
    );
  });

  it('never sends under a label that did not say so (J2)', () => {
    expect(sendButtonLabel(true)).toBe('ADD AND SEND THE LETTER');
    expect(sendButtonLabel(false)).toBe('ADD TO YOUR PEOPLE');
  });
});

describe('lens-4 §B.7 — the success line names the address it went to', () => {
  it('says where the letter went', () => {
    expect(
      successLine({ label: 'Dave', email: 'dave@okonkwo.net', sent: true, alreadyExisted: false }),
    ).toBe('Dave is on your roster. Your letter is on its way to dave@okonkwo.net.');
  });

  it('says plainly when nothing was sent', () => {
    expect(
      successLine({ label: 'Dave', email: 'dave@okonkwo.net', sent: false, alreadyExisted: false }),
    ).toBe('Dave is on your roster. Nothing was sent.');
  });

  it('stops the already-on-Patina branch lying by omission (R13)', () => {
    expect(
      successLine({ label: 'Dave', email: 'dave@okonkwo.net', sent: true, alreadyExisted: true }),
    ).toBe('Dave was already on Patina — linked to your roster now; a short letter tells them so.');
  });

  it('does not claim a letter went when none did, on the already-on-Patina branch', () => {
    expect(
      successLine({ label: 'Dave', email: 'dave@okonkwo.net', sent: false, alreadyExisted: true }),
    ).toBe('Dave was already on Patina — linked to your roster now; no letter was sent.');
  });

  it('never guesses a gender for the already-on-Patina branch', () => {
    const sent = successLine({
      label: 'Priya Raman',
      email: 'priya@ramanhouse.com',
      sent: true,
      alreadyExisted: true,
    });
    const notSent = successLine({
      label: 'Priya Raman',
      email: 'priya@ramanhouse.com',
      sent: false,
      alreadyExisted: true,
    });
    for (const line of [sent, notSent]) {
      expect(line).not.toMatch(/\b(he|him|his|she|her|hers)\b/i);
    }
  });
});

describe('LetterLineField', () => {
  const facts = {
    clientName: 'Dave Okonkwo',
    clientEmail: 'dave@okonkwo.net',
    projectName: 'Van Hise kitchen and back hall',
  };

  it('opens empty, with an instruction that cannot be mistaken for a draft', () => {
    render(<LetterLineField facts={facts} value="" onChange={() => {}} />);
    const field = screen.getByLabelText('A line for Dave') as HTMLTextAreaElement;
    expect(field.value).toBe('');
    expect(field.placeholder).toBe(
      "Say why you added them and what they'll find. Two lines is plenty.",
    );
  });

  it('stops at 280 and says so without turning red', () => {
    const onChange = jest.fn();
    render(<LetterLineField facts={facts} value={'x'.repeat(280)} onChange={onChange} />);
    expect(screen.getByTestId('letter-line-counter')).toHaveTextContent(
      "That's the whole 280.",
    );
    const field = screen.getByLabelText('A line for Dave') as HTMLTextAreaElement;
    expect(field.maxLength).toBe(280);
  });

  it('shows the glance check in the letter’s callout style as she types', () => {
    render(<LetterLineField facts={facts} value="Dave — the drawings are in." onChange={() => {}} />);
    expect(screen.getByTestId('letter-line-glance')).toHaveTextContent(
      'Dave — the drawings are in.',
    );
    expect(screen.getByTestId('letter-line-glance-facts')).toHaveTextContent(
      'DAVE OKONKWO · dave@okonkwo.net',
    );
  });

  it('prints nothing where there is nothing to glance at', () => {
    render(<LetterLineField facts={facts} value="   " onChange={() => {}} />);
    expect(screen.queryByTestId('letter-line-glance')).toBeNull();
  });

  it('folds to a single disclosure line, and opening it reveals the field', () => {
    render(<LetterLineField facts={facts} value="" onChange={() => {}} folded />);
    expect(screen.queryByLabelText('A line for Dave')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '+ A line for Dave' }));
    expect(screen.getByLabelText('A line for Dave')).toBeInTheDocument();
  });
});
