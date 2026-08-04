import { describe, it, expect, afterEach } from 'vitest';
import { extractColorFinishFromDOM } from '../../lib/extraction/color-finish';

function setBody(html: string) {
  document.body.innerHTML = html;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('extractColorFinishFromDOM — availableFinishes (P2-8)', () => {
  it('collects multiple finishes from a finish selector, mirroring availableColors', () => {
    setBody(`
      <select name="finish">
        <option value="">Choose</option>
        <option value="matte">Matte</option>
        <option value="polished">Polished</option>
        <option value="brushed">Brushed</option>
      </select>
    `);

    const result = extractColorFinishFromDOM();

    expect(result.availableFinishes).toEqual(
      expect.arrayContaining(['Matte', 'Polished', 'Brushed']),
    );
    expect(result.availableFinishes.length).toBe(3);
  });

  it('reads a data-finish attribute selector', () => {
    setBody(`
      <div class="finish-options">
        <span data-finish="Oiled">Oiled</span>
        <span data-finish="Waxed">Waxed</span>
      </div>
    `);

    const result = extractColorFinishFromDOM();

    expect(result.availableFinishes).toEqual(
      expect.arrayContaining(['Oiled', 'Waxed']),
    );
  });

  it('seeds the primary finish from the first selector-derived finish when none found yet', () => {
    setBody(`
      <select name="finish">
        <option value="satin">Satin</option>
        <option value="gloss">Gloss</option>
      </select>
    `);

    const result = extractColorFinishFromDOM();

    expect(result.finishes[0]?.name).toBe('Satin');
  });

  it('does not duplicate a finish already found via a spec table', () => {
    setBody(`
      <table>
        <tr><th>Finish</th><td>Matte</td></tr>
      </table>
      <select name="finish">
        <option value="matte">Matte</option>
      </select>
    `);

    const result = extractColorFinishFromDOM();

    const matteCount = result.finishes.filter(
      (f) => f.name.toLowerCase() === 'matte',
    ).length;
    expect(matteCount).toBe(1);
  });

  it('returns an empty availableFinishes array when no finish selectors are present', () => {
    setBody('<div>No finish info here</div>');

    const result = extractColorFinishFromDOM();

    expect(result.availableFinishes).toEqual([]);
  });

  it('keeps availableColors and availableFinishes independent', () => {
    setBody(`
      <select name="color">
        <option value="walnut">Walnut</option>
        <option value="ebony">Ebony</option>
      </select>
      <select name="finish">
        <option value="matte">Matte</option>
      </select>
    `);

    const result = extractColorFinishFromDOM();

    expect(result.availableColors).toEqual(
      expect.arrayContaining(['Walnut', 'Ebony']),
    );
    expect(result.availableFinishes).toEqual(['Matte']);
  });
});
