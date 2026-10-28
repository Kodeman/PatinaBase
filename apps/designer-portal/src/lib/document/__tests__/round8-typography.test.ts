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

  it('excludes only aria-hidden 13px square tick stamps from the inherited utility floor', () => {
    const floors: string[] = [];
    sheet.walkDecls('font-size', (decl) => {
      if (decl.value !== 'var(--r8-type-min)' || decl.parent?.type !== 'rule') return;
      floors.push(decl.parent.selector);
      expect(decl.parent.selector).toContain('):not([aria-hidden][class~="h-[13px]"][class~="w-[13px]"])');
      expect(decl.parent.selector).not.toContain(':not([aria-hidden])');
    });
    expect(floors).toHaveLength(1);

    const stamps = sources.flatMap((source) => [...source.matchAll(/<span\s+aria-hidden\b[^>]*className="([^"]*h-\[13px\][^"]*text-\[(?:8|9)px\][^"]*)"/g)]);
    expect(stamps).toHaveLength(6);
    for (const [, classes] of stamps) {
      expect(classes.split(' ')).toContain('w-[13px]');
    }
  });

  it('keeps the milestone name beside its diamond with a shrinkable 12rem basis', () => {
    const milestone = readFileSync(join(src, 'components/document/schedule/milestone-row.tsx'), 'utf8');
    expect(milestone).toMatch(/<span\s+className=\{`min-w-0 truncate[^]*?\{milestone\.name\}\s*<\/span>/);
    const names: string[] = [];
    sheet.walkRules(`${scope} [data-schedule-milestone] > .truncate`, (rule) => {
      expect(rule.parent?.type).toBe('root');
      rule.walkDecls('flex', (decl) => { names.push(decl.value); });
    });
    expect(names).toEqual(['1 1 12rem']);
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
      expect(values.get('font-variant-numeric')).toBe('tabular-nums');
      found = true;
    });
    expect(found).toBe(true);
  });
});
