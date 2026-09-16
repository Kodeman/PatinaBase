import { render, screen } from '@testing-library/react';
import type { EmailDelivery, EmailDeliveryState } from '@patina/supabase';
import { deliveryWord, isAttentionState } from '@/lib/delivery-ui';
import { DeliveryWord } from '../delivery-word';

function delivery(over: Partial<EmailDelivery> = {}): EmailDelivery {
  return {
    logId: 'log-1',
    refId: 'ref-1',
    recipient: 'dave@okonkwo.net',
    state: 'sent',
    status: 'sent',
    sentAt: '2026-09-08T14:00:00.000Z',
    deliveredAt: null,
    bouncedAt: null,
    bounceType: null,
    bounceReason: null,
    delayedAt: null,
    lastEvent: null,
    lastEventAt: null,
    createdAt: '2026-09-08T14:00:00.000Z',
    ...over,
  };
}

const ALL_STATES: EmailDeliveryState[] = [
  'sending',
  'sent',
  'delivered',
  'opened',
  'delayed',
  'bounced',
  'complained',
  'failed',
  'suppressed',
];

describe('deliveryWord — the nine states, as dated prose', () => {
  it('says nothing about an email that was never sent', () => {
    expect(deliveryWord(null)).toBeNull();
    expect(deliveryWord(undefined)).toBeNull();
  });

  it('names the four quiet states', () => {
    expect(deliveryWord(delivery({ state: 'sending' }))).toEqual({
      text: 'Sending',
      register: 'quiet',
    });
    expect(deliveryWord(delivery({ state: 'sent' }))).toEqual({
      text: 'Sent 8 Sept',
      register: 'quiet',
    });
    expect(
      deliveryWord(delivery({ state: 'delivered', deliveredAt: '2026-09-08T15:00:00.000Z' })),
    ).toEqual({ text: 'Delivered 8 Sept', register: 'quiet' });
    expect(
      deliveryWord(
        delivery({ state: 'opened', deliveredAt: null, lastEventAt: '2026-09-09T09:00:00.000Z' }),
      ),
    ).toEqual({ text: 'Opened 9 Sept', register: 'quiet' });
  });

  it('names the four states that need the designer, each with its date', () => {
    expect(
      deliveryWord(delivery({ state: 'delayed', delayedAt: '2026-09-09T09:00:00.000Z' })),
    ).toEqual({
      text: 'Delayed 9 Sept — still trying dave@okonkwo.net',
      register: 'attention',
    });
    expect(
      deliveryWord(
        delivery({
          state: 'bounced',
          bouncedAt: '2026-09-09T09:00:00.000Z',
          bounceType: 'permanent',
          bounceReason: 'no such mailbox',
        }),
      ),
    ).toEqual({
      text: "Bounced 9 Sept — didn't reach dave@okonkwo.net",
      register: 'attention',
      detail: 'no such mailbox',
    });
    expect(
      deliveryWord(
        delivery({ state: 'complained', lastEventAt: '2026-09-09T09:00:00.000Z' }),
      ),
    ).toEqual({
      text: 'Marked as spam 9 Sept by dave@okonkwo.net',
      register: 'attention',
    });
    expect(
      deliveryWord(
        delivery({ state: 'suppressed', lastEventAt: '2026-09-09T09:00:00.000Z' }),
      ),
    ).toEqual({
      text: 'Not sent 9 Sept — dave@okonkwo.net opted out',
      register: 'attention',
    });
  });

  it('dates an attention line from the event that caused it, not from a delivery', () => {
    // bouncedAt wins over every other stamp on the row.
    expect(
      deliveryWord(
        delivery({
          state: 'bounced',
          bouncedAt: '2026-09-10T09:00:00.000Z',
          delayedAt: '2026-09-09T09:00:00.000Z',
          lastEventAt: '2026-09-08T09:00:00.000Z',
        }),
      )?.text,
    ).toBe("Bounced 10 Sept — didn't reach dave@okonkwo.net");
    // delayedAt is next, ahead of the quiet line's deliveredAt.
    expect(
      deliveryWord(
        delivery({
          state: 'delayed',
          deliveredAt: '2026-09-11T09:00:00.000Z',
          delayedAt: '2026-09-09T09:00:00.000Z',
        }),
      )?.text,
    ).toBe('Delayed 9 Sept — still trying dave@okonkwo.net');
  });

  it('says nothing about a send that never left Patina', () => {
    // `failed` is ambiguous — it may yet have gone out — so the surface is
    // silent rather than reporting "Didn't send".
    expect(deliveryWord(delivery({ state: 'failed' }))).toBeNull();
  });

  it('falls back to the bounce type when the provider gave no reason', () => {
    expect(
      deliveryWord(delivery({ state: 'bounced', bounceType: 'permanent', bounceReason: null }))
        ?.detail,
    ).toBe('permanent');
    expect(
      deliveryWord(delivery({ state: 'bounced', bounceType: null, bounceReason: null }))?.detail,
    ).toBeUndefined();
  });

  it('falls back to the caller’s address when the log carries none', () => {
    expect(
      deliveryWord(delivery({ state: 'complained', recipient: null }), 'ros@studio.test')?.text,
    ).toBe('Marked as spam 8 Sept by ros@studio.test');
    // The row's own address never wins over the log's.
    expect(
      deliveryWord(delivery({ state: 'complained' }), 'someone-else@studio.test')?.text,
    ).toBe('Marked as spam 8 Sept by dave@okonkwo.net');
  });

  it('names nobody at all rather than "them" where a name would read as one', () => {
    expect(deliveryWord(delivery({ state: 'complained', recipient: null }))?.text).toBe(
      'Marked as spam 8 Sept',
    );
    expect(deliveryWord(delivery({ state: 'suppressed', recipient: null }))?.text).toBe(
      'Not sent 8 Sept — opted out',
    );
    // `them` survives only where the sentence needs an object.
    expect(deliveryWord(delivery({ state: 'bounced', recipient: null }))?.text).toBe(
      "Bounced 8 Sept — didn't reach them",
    );
    expect(deliveryWord(delivery({ state: 'delayed', recipient: null }))?.text).toBe(
      'Delayed 8 Sept — still trying them',
    );
  });

  it('reads the date it has, in order of preference', () => {
    expect(
      deliveryWord(
        delivery({ state: 'sent', sentAt: null, lastEventAt: null, createdAt: '2026-09-07T00:00:00.000Z' }),
      )?.text,
    ).toBe('Sent 7 Sept');
    expect(
      deliveryWord(
        delivery({ state: 'sent', sentAt: '2026-09-08T14:00:00.000Z', lastEventAt: '2026-09-09T14:00:00.000Z' }),
      )?.text,
    ).toBe('Sent 9 Sept');
  });

  it('never phrases a state as an absence or a duration', () => {
    // The ONE permitted present-tense phrase, allowed by name rather than
    // scrubbed out of the string before the check.
    const PERMITTED_PRESENT_TENSE = ['still trying'];
    for (const state of ALL_STATES) {
      const word = deliveryWord(delivery({ state }));
      if (!word) continue;
      const present = word.text.match(/hasn't|has not|not yet|still|days ago|ago/gi) ?? [];
      for (const hit of present) {
        expect(
          PERMITTED_PRESENT_TENSE.some((phrase) => word.text.includes(phrase)),
        ).toBe(true);
        // and the hit is part of that phrase, not a second offence
        expect('still trying').toContain(hit.toLowerCase());
      }
    }
    // The permitted phrase really is present where it is claimed.
    expect(deliveryWord(delivery({ state: 'delayed' }))?.text).toContain('still trying');
  });

  it('carries no pill, dot, colour fill or ✓ glyph in its copy', () => {
    for (const state of ALL_STATES) {
      expect(deliveryWord(delivery({ state }))?.text ?? '').not.toMatch(/[✓✔●•]/);
    }
  });
});

describe('isAttentionState', () => {
  it('names exactly the four that need acting on', () => {
    expect(ALL_STATES.filter(isAttentionState)).toEqual([
      'delayed',
      'bounced',
      'complained',
      'suppressed',
    ]);
  });

  it('leaves `failed` out — an ambiguous send is not a thing to act on', () => {
    expect(isAttentionState('failed')).toBe(false);
  });
});

describe('DeliveryWord', () => {
  it('prints the word with no chrome, and carries the reason as a title', () => {
    render(
      <DeliveryWord
        delivery={delivery({ state: 'bounced', bounceReason: 'no such mailbox' })}
      />,
    );
    const word = screen.getByTestId('delivery-word');
    expect(word).toHaveTextContent("Bounced 8 Sept — didn't reach dave@okonkwo.net");
    expect(word).toHaveAttribute('role', 'status');
    expect(word).toHaveAttribute('title', 'no such mailbox');
    expect(word.querySelector('svg')).toBeNull();
    expect(word.className).not.toMatch(/rounded-full|bg-(red|green|amber)/);
  });

  it('renders nothing at all without a delivery', () => {
    const { container } = render(<DeliveryWord delivery={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('stays silent in attention mode while the mail is behaving', () => {
    const { container } = render(
      <DeliveryWord delivery={delivery({ state: 'delivered' })} mode="attention" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('speaks in attention mode when the mail needs the designer', () => {
    render(<DeliveryWord delivery={delivery({ state: 'suppressed' })} mode="attention" />);
    expect(screen.getByTestId('delivery-word')).toHaveTextContent(
      'Not sent 8 Sept — dave@okonkwo.net opted out',
    );
  });

  it('says nothing at all about a send that never left Patina', () => {
    const { container } = render(<DeliveryWord delivery={delivery({ state: 'failed' })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is a live region only in the attention register', () => {
    const { rerender } = render(
      <DeliveryWord delivery={delivery({ state: 'delivered' })} />,
    );
    const quiet = screen.getByTestId('delivery-word');
    expect(quiet).not.toHaveAttribute('role');
    // The readable muted step (R126), not --color-aged-oak, which fails AA at 11px.
    expect(quiet.className).toContain('text-[var(--text-muted)]');

    rerender(<DeliveryWord delivery={delivery({ state: 'bounced' })} />);
    const loud = screen.getByTestId('delivery-word');
    expect(loud).toHaveAttribute('role', 'status');
    expect(loud.className).toContain('text-[var(--color-terracotta-ink)]');
  });

  it('prints the remedy after the word, outside the live region, on an en-space', () => {
    const { container } = render(
      <DeliveryWord
        delivery={delivery({ state: 'bounced' })}
        action={<a href="/people">Fix the address in People</a>}
      />,
    );
    const link = screen.getByRole('link', { name: 'Fix the address in People' });
    expect(link).toBeInTheDocument();
    // The remedy is standing advice, not news — it must not be announced.
    const word = screen.getByTestId('delivery-word');
    expect(word).not.toContainElement(link);
    expect(word.textContent).not.toMatch(/Fix the address/);
    expect(container.textContent).toContain('\u2002Fix the address in People');
  });
});
