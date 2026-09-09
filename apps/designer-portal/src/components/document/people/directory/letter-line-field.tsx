'use client';

/**
 * ONE field component, three renderings (lens 2): the add-person sheet gets the
 * full field, the ClientPicker's armed row and the folded checkbox state get
 * the same field behind a "+ A line for {given}" disclosure, and the send sheet
 * gets neither — the proposal's existing personal message IS the note, and
 * nobody writes the same sentence twice in one send.
 *
 * Arrival Arc shape: the facts assembled above in mono, her words below, blank.
 * NOTHING IS PRE-WRITTEN. The placeholder is an instruction, not a draft — a
 * placeholder that sounds sendable teaches the wrong thing, and the Arrival Arc
 * rejected the prefilled specimen by name.
 */

import { useState } from 'react';

const FIELD_LABEL =
  'mb-1 block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';
const FIELD_INPUT =
  'w-full rounded-[7px] border border-[var(--color-pearl)] bg-white px-3.5 py-2.5 text-[0.82rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none';

export const LETTER_NOTE_MAX = 280;

export const LETTER_PLACEHOLDER =
  "Say why you added them and what they'll find. Two lines is plenty.";

export interface LetterLineFacts {
  clientName: string | null;
  clientEmail: string;
  projectName: string | null;
}

/** The name a designer calls her client. First whitespace token, nothing more. */
export function givenNameOf(fullName: string | null | undefined): string | null {
  const first = (fullName ?? '').trim().split(/\s+/)[0];
  return first || null;
}

/**
 * lens-4 §B.2. Middot-separated, no verbs, no persuasion. A missing project or
 * name is STATED, not hidden — a designer about to write a letter should see
 * what the letter will be missing.
 */
export function factsLine(facts: LetterLineFacts): string {
  const parts: string[] = [];
  if (facts.clientName?.trim()) {
    parts.push(facts.clientName.trim().toUpperCase());
    parts.push(facts.clientEmail);
  } else {
    parts.push(facts.clientEmail);
    parts.push('NO NAME');
  }
  parts.push(facts.projectName?.trim() ? facts.projectName.trim().toUpperCase() : 'NO PROJECT YET');
  parts.push('ADDED TODAY');
  return parts.join(' · ');
}

/** lens-4 §B.4. A length, not a violation: no bar, no colour, no red at zero. */
export function counterCopy(length: number): string {
  if (length === 0) return `Up to ${LETTER_NOTE_MAX} characters`;
  if (length >= LETTER_NOTE_MAX) return `That's the whole ${LETTER_NOTE_MAX}.`;
  return `${LETTER_NOTE_MAX - length} left`;
}

/** lens-4 §B.1. Naming the recipient makes her write to a person, not a field. */
export function fieldLabel(givenName: string | null): string {
  return givenName ? `A line for ${givenName}` : 'A line to send with it';
}

/** lens-4 §B.5, replacing "Send a magic-link invite to Patina". */
export function checkboxLabel(givenName: string | null): string {
  return givenName ? `Send ${givenName} the letter` : 'Send them the letter';
}

/**
 * lens-4 §B.5. Deliberately gender-free: the sheet holds a name and an email
 * and has no idea of anyone's gender, and the one place this copy could insult
 * somebody is by guessing. `pronoun` exists for a caller that genuinely knows;
 * nothing passes it today.
 */
export function checkboxHelper(opts: {
  givenName: string | null;
  studioName: string | null;
  pronoun: 'he' | 'she' | null;
}): string {
  const subject = opts.pronoun === 'he' ? 'He' : opts.pronoun === 'she' ? 'She' : 'They';
  const verb = opts.pronoun ? 'gets' : 'get';
  const object = opts.pronoun === 'he' ? 'him' : opts.pronoun === 'she' ? 'her' : 'them';
  const possessive = opts.pronoun === 'he' ? 'he’s' : opts.pronoun === 'she' ? 'she’s' : 'they’re';
  const from = opts.studioName?.trim() || 'you';
  return `${subject} ${verb} one email from ${from} with your line in it and a link that signs ${object} in. Leave it off and ${possessive} on your roster only — you can write later.`;
}

/** lens-4 §B.6. J2 kept in the copy layer. */
export function sendButtonLabel(sendLetter: boolean): string {
  return sendLetter ? 'ADD AND SEND THE LETTER' : 'ADD TO YOUR PEOPLE';
}

/** lens-4 §B.7. No confetti, no "Success!", no green fill. */
export function successLine(opts: {
  label: string;
  email: string;
  sent: boolean;
  alreadyExisted: boolean;
}): string {
  if (opts.alreadyExisted) {
    return `${opts.label} was already on Patina. He's linked to you now; a short letter tells him so.`;
  }
  return opts.sent
    ? `${opts.label} is on your roster. Your letter is on its way to ${opts.email}.`
    : `${opts.label} is on your roster. Nothing was sent.`;
}

export function LetterLineField({
  facts,
  value,
  onChange,
  folded = false,
  disabled = false,
}: {
  facts: LetterLineFacts;
  value: string;
  onChange: (next: string) => void;
  /** Folded starts as the single-line "+ A line for {given}" disclosure. */
  folded?: boolean;
  disabled?: boolean;
}) {
  const given = givenNameOf(facts.clientName);
  const label = fieldLabel(given);
  const [open, setOpen] = useState(!folded);

  if (folded && !open) {
    return (
      <button
        type="button"
        data-testid="letter-line-disclosure"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex min-h-11 items-center text-[0.74rem] text-[var(--color-mocha)] underline underline-offset-4"
      >
        {`+ ${label}`}
      </button>
    );
  }

  const trimmed = value.trim();

  return (
    <div className="mt-4">
      <p
        data-testid="letter-line-facts"
        className="mb-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]"
      >
        {factsLine(facts)}
      </p>

      <label className={FIELD_LABEL} htmlFor="letter-line">
        {label}
      </label>
      <textarea
        id="letter-line"
        aria-label={label}
        value={value}
        maxLength={LETTER_NOTE_MAX}
        disabled={disabled}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        placeholder={LETTER_PLACEHOLDER}
        className={`${FIELD_INPUT} resize-none`}
      />
      <p
        data-testid="letter-line-counter"
        className="mt-1.5 font-mono text-[11px] text-[var(--color-aged-oak)]"
      >
        {counterCopy(value.length)}
      </p>

      {/* A glance check, not a rendered-email preview: the facts line above, her
          words below, in the letter's own callout rule. */}
      {trimmed ? (
        <div className="mt-3 border-l-[3px] border-[var(--color-clay)] bg-[var(--color-linen)]/45 py-2.5 pl-3.5 pr-3">
          <p
            data-testid="letter-line-glance-facts"
            className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]"
          >
            {`${facts.clientName?.trim()?.toUpperCase() ?? facts.clientEmail} · ${facts.clientEmail}`}
          </p>
          <p
            data-testid="letter-line-glance"
            className="mt-1.5 whitespace-pre-line font-heading text-[0.86rem] italic leading-relaxed text-[var(--color-mocha)]"
          >
            {trimmed}
          </p>
        </div>
      ) : null}
    </div>
  );
}
