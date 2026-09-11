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

  it('names the five states that need the designer', () => {
    expect(deliveryWord(delivery({ state: 'delayed' }))).toEqual({
      text: 'Delayed — still trying dave@okonkwo.net',
      register: 'attention',
    });
    expect(
      deliveryWord(
        delivery({ state: 'bounced', bounceType: 'permanent', bounceReason: 'no such mailbox' }),
      ),
    ).toEqual({
      text: "Bounced — didn't reach dave@okonkwo.net",
      register: 'attention',
      detail: 'no such mailbox',
    });
    expect(deliveryWord(delivery({ state: 'complained' }))).toEqual({
      text: 'Marked as spam by dave@okonkwo.net',
      register: 'attention',
    });
    expect(deliveryWord(delivery({ state: 'failed' }))).toEqual({
      text: "Didn't send",
      register: 'attention',
    });
    expect(deliveryWord(delivery({ state: 'suppressed' }))).toEqual({
      text: 'Not sent — dave@okonkwo.net opted out',
      register: 'attention',
    });
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

  it('falls back to the caller’s address, then to a person we cannot name', () => {
    expect(deliveryWord(delivery({ state: 'failed', recipient: null }), 'ros@studio.test')).toEqual({
      text: "Didn't send",
      register: 'attention',
    });
    expect(
      deliveryWord(delivery({ state: 'complained', recipient: null }), 'ros@studio.test')?.text,
    ).toBe('Marked as spam by ros@studio.test');
    expect(deliveryWord(delivery({ state: 'complained', recipient: null }))?.text).toBe(
      'Marked as spam by them',
    );
    // The row's own address never wins over the log's.
    expect(
      deliveryWord(delivery({ state: 'complained' }), 'someone-else@studio.test')?.text,
    ).toBe('Marked as spam by dave@okonkwo.net');
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
    for (const state of ALL_STATES) {
      const { text } = deliveryWord(delivery({ state }))!;
      // "still trying" is the one permitted present-tense phrase: the provider
      // IS still retrying, which is an event, not a wait we invented.
      const scrubbed = text.replace('still trying', '');
      expect(scrubbed).not.toMatch(/hasn't|has not|not yet|still|days ago|ago/i);
    }
  });

  it('carries no pill, dot, colour fill or ✓ glyph in its copy', () => {
    for (const state of ALL_STATES) {
      expect(deliveryWord(delivery({ state }))!.text).not.toMatch(/[✓✔●•]/);
    }
  });
});

describe('isAttentionState', () => {
  it('names exactly the five that need acting on', () => {
    expect(ALL_STATES.filter(isAttentionState)).toEqual([
      'delayed',
      'bounced',
      'complained',
      'failed',
      'suppressed',
    ]);
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
    expect(word).toHaveTextContent("Bounced — didn't reach dave@okonkwo.net");
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
      'Not sent — dave@okonkwo.net opted out',
    );
  });

  it('prints the remedy after the word', () => {
    render(
      <DeliveryWord
        delivery={delivery({ state: 'bounced' })}
        action={<a href="/people">Fix the address in People</a>}
      />,
    );
    expect(
      screen.getByRole('link', { name: 'Fix the address in People' }),
    ).toBeInTheDocument();
  });
});
