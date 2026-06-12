/**
 * Default Friday Pulse copy — composed from the week's REAL movement
 * (prototype: "Auto-drafted from this week's stamps"). Pure; the facts are
 * gathered by the caller from caches already on the page.
 */

export interface PulseFacts {
  clientFirstName: string | null;
  /** FF&E lines whose stamp moved this week: name + present-tense state. */
  moved: { name: string; state: string }[];
  /** Decision titles resolved this week. */
  resolved: string[];
  /** Decision titles still waiting on the client. */
  pending: string[];
}

const STATE_PHRASE: Record<string, string> = {
  ordered: 'was ordered',
  production: 'entered production',
  shipped: 'shipped',
  delivered: 'arrived',
  received: 'arrived and was inspected',
  installed: 'was installed',
};

export function composePulseDraft(facts: PulseFacts): string {
  const parts: string[] = [];
  const greeting = facts.clientFirstName ? `Hi ${facts.clientFirstName} — ` : '';

  if (facts.moved.length > 0) {
    const phrases = facts.moved
      .slice(0, 4)
      .map((m) => `${m.name} ${STATE_PHRASE[m.state] ?? `is ${m.state}`}`);
    parts.push(`this week: ${phrases.join('; ')}.`);
  } else {
    parts.push('a quiet week on the project — everything is moving as planned.');
  }

  if (facts.resolved.length > 0) {
    parts.push(`Settled together: ${facts.resolved.join(', ')}.`);
  }
  if (facts.pending.length > 0) {
    parts.push(`Still in your hands: ${facts.pending.join(', ')}.`);
  }
  parts.push('More next Friday.');

  return greeting + parts.join(' ');
}
