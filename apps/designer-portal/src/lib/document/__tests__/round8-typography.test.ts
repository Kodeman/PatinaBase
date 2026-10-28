import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';

const src = join(__dirname, '../../..');
const scope = '[data-paper-renderer="round8"]';
const sheet = postcss.parse(readFileSync(join(src, 'components/document/paper/round8.css'), 'utf8'));

function documentSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : documentSources(path);
    return entry.name.endsWith('.tsx') ? [readFileSync(path, 'utf8')] : [];
  });
}

const sources = documentSources(join(src, 'components/document'));

describe('Round-8 typography (18px root)', () => {
  it('keeps every scoped type declaration at or above the 12px floor', () => {
    let declarations = 0;
    sheet.walkDecls('font-size', (decl) => {
      const value = decl.value.replace('var(--r8-type-min)', '12px');
      const sizes = [...value.matchAll(/([\d.]+)(px|rem)/g)];
      expect(sizes.length).toBeGreaterThan(0);
      for (const [, value, unit] of sizes) {
        expect(Number(value) * (unit === 'rem' ? 18 : 1)).toBeGreaterThanOrEqual(12);
      }
      declarations++;
    });
    expect(declarations).toBeGreaterThan(0);
  });

  it('raises every inherited sub-12px utility used by Document components to 12px', () => {
    const utilities = new Set(sources.flatMap((source) =>
      [...source.matchAll(/text-\[([\d.]+)(px|rem)\]/g)]
        .filter(([, value, unit]) => Number(value) * (unit === 'rem' ? 18 : 1) < 12)
        .map(([utility]) => utility),
    ));
    expect(utilities.size).toBeGreaterThan(0);
    for (const utility of utilities) {
      let found = false;
      sheet.walkRules((rule) => {
        if (!rule.selector.includes(`[class~="${utility}"]`)) return;
        expect(rule.selector.startsWith(scope)).toBe(true);
        rule.walkDecls('font-size', (decl) => {
          expect(decl.value).toBe('var(--r8-type-min)');
          found = true;
        });
      });
      expect({ utility, raised: found }).toEqual({ utility, raised: true });
    }
    expect(sheet.toString()).toContain('--r8-type-min: 12px');
  });

  it('uses sentence-case body type for paper metadata without changing drafting stock', () => {
    let found = false;
    sheet.walkRules((rule) => {
      if (!rule.selector.includes('[data-paper-chapter]') || !rule.selector.includes('.font-mono')) return;
      expect(rule.selector).toContain(':not([data-build-room-embedded] *)');
      const values = new Map<string, string>();
      rule.walkDecls((decl) => { values.set(decl.prop, decl.value); });
      expect(values.get('font-family')).toBe('var(--font-body)');
      expect(values.get('text-transform')).toBe('none');
      expect(values.get('letter-spacing')).toBe('0');
      found = true;
    });
    expect(found).toBe(true);
  });
});
