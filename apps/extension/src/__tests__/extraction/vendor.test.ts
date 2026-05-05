import { describe, expect, it, beforeEach } from 'vitest';
import {
  extractContact,
  extractFoundedYear,
  extractHeadquarters,
  extractSocialLinks,
  extractAboutSnippet,
} from '../../lib/extraction/vendor';

function setBody(html: string) {
  document.body.innerHTML = html;
}

function setHead(html: string) {
  document.head.innerHTML = html;
}

describe('vendor.extractContact', () => {
  beforeEach(() => {
    setBody('');
    setHead('');
  });

  it('prefers trade@ over hello@ when both are present', () => {
    setBody(`
      <footer>
        <a href="mailto:hello@brand.com">say hi</a>
        <a href="mailto:trade@brand.com">trade</a>
      </footer>
    `);

    const result = extractContact();
    expect(result.email).toBe('trade@brand.com');
  });

  it('prefers sales@ over info@', () => {
    setBody(`
      <footer>
        <a href="mailto:info@brand.com">info</a>
        <a href="mailto:sales@brand.com">sales</a>
      </footer>
    `);

    const result = extractContact();
    expect(result.email).toBe('sales@brand.com');
  });

  it('falls back to first mailto when no priority address present', () => {
    setBody(`
      <a href="mailto:press@brand.com">press</a>
      <a href="mailto:legal@brand.com">legal</a>
    `);

    const result = extractContact();
    expect(result.email).toBe('press@brand.com');
  });

  it('extracts phone from tel: link', () => {
    setBody(`<a href="tel:+1-555-123-4567">call us</a>`);
    const result = extractContact();
    expect(result.phone).toMatch(/555/);
  });
});

describe('vendor.extractFoundedYear', () => {
  beforeEach(() => setBody(''));

  it.each([
    ['Est. 1985 in Brooklyn', 1985],
    ['Since 1992, we have crafted', 1992],
    ['Founded in 2010 by John Smith', 2010],
    ['Established 1948 — three generations', 1948],
  ])('parses "%s" → %i', (text, expected) => {
    setBody(`<footer><p>${text}</p></footer>`);
    expect(extractFoundedYear()).toBe(expected);
  });

  it('rejects out-of-range years', () => {
    setBody('<footer>Est. 1700</footer>');
    expect(extractFoundedYear()).toBeNull();
  });
});

describe('vendor.extractHeadquarters', () => {
  beforeEach(() => setBody(''));

  it.each([
    ['Based in Brooklyn, NY', 'Brooklyn, NY'],
    ['Headquartered in San Francisco', 'San Francisco'],
    ['Located in Portland', 'Portland'],
  ])('parses "%s" → "%s"', (text, expected) => {
    setBody(`<div class="about"><p>${text}</p></div>`);
    expect(extractHeadquarters()).toBe(expected);
  });
});

describe('vendor.extractSocialLinks', () => {
  beforeEach(() => setBody(''));

  it('grabs the first instagram/pinterest/facebook profile link', () => {
    setBody(`
      <footer>
        <a href="https://instagram.com/brand">ig</a>
        <a href="https://pinterest.com/brand">pin</a>
        <a href="https://facebook.com/brandpage">fb</a>
      </footer>
    `);
    const result = extractSocialLinks();
    expect(result.instagram).toContain('instagram.com/brand');
    expect(result.pinterest).toContain('pinterest.com/brand');
    expect(result.facebook).toContain('facebook.com/brandpage');
  });
});

describe('vendor.extractAboutSnippet', () => {
  beforeEach(() => {
    setBody('');
    setHead('');
  });

  it('reads meta description first', () => {
    setHead(`<meta name="description" content="A modern furniture studio crafting heirloom-quality pieces from sustainable hardwoods." />`);
    expect(extractAboutSnippet()).toMatch(/modern furniture studio/);
  });

  it('falls back to og:description', () => {
    setHead(`<meta property="og:description" content="Independent design house from Copenhagen since 1972." />`);
    expect(extractAboutSnippet()).toMatch(/Copenhagen/);
  });

  it('caps output at 200 chars', () => {
    const long = 'X'.repeat(500);
    setHead(`<meta name="description" content="${long}" />`);
    expect(extractAboutSnippet()?.length).toBeLessThanOrEqual(200);
  });
});
