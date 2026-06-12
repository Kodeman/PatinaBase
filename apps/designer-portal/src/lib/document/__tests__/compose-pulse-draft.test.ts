import { composePulseDraft } from '../compose-pulse-draft';

describe('composePulseDraft', () => {
  it('narrates movement, resolutions, and pending asks in the prototype voice', () => {
    const draft = composePulseDraft({
      clientFirstName: 'Sarah',
      moved: [
        { name: 'Heirloom Oak Dining Table', state: 'production' },
        { name: 'Shaker Dining Chairs', state: 'shipped' },
      ],
      resolved: ['Concept direction'],
      pending: ['Rug color'],
    });
    expect(draft).toBe(
      'Hi Sarah — this week: Heirloom Oak Dining Table entered production; ' +
        'Shaker Dining Chairs shipped. Settled together: Concept direction. ' +
        'Still in your hands: Rug color. More next Friday.',
    );
  });

  it('quiet week without movement', () => {
    const draft = composePulseDraft({
      clientFirstName: null,
      moved: [],
      resolved: [],
      pending: [],
    });
    expect(draft).toBe(
      'a quiet week on the project — everything is moving as planned. More next Friday.',
    );
  });

  it('caps the movement list at four lines', () => {
    const moved = Array.from({ length: 6 }, (_, i) => ({
      name: `Item ${i + 1}`,
      state: 'shipped',
    }));
    const draft = composePulseDraft({ clientFirstName: 'A', moved, resolved: [], pending: [] });
    expect(draft).toContain('Item 4 shipped.');
    expect(draft).not.toContain('Item 5');
  });
});
