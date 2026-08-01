/**
 * The open document can have a warm module-level React Query cache on the
 * browser's first render while SSR always sees an empty cache. Its first paint
 * must therefore stay on the same loading tree until hydration completes.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const page = readFileSync(
  join(__dirname, '..', '..', '..', 'app', '(document)', 'doc', '[id]', 'page.tsx'),
  'utf8',
);

describe('open document hydration render contract', () => {
  it('gates a warm cached engagement behind useHydrated before early returns', () => {
    expect(page).toContain("import { useHydrated } from '@/hooks/use-hydrated';");
    expect(page).toMatch(/const hydrated = useHydrated\(\);/);
    expect(page).toMatch(/if \(!hydrated \|\| resolutionState === 'loading'\)/);

    const hook = page.indexOf('const hydrated = useHydrated()');
    const loadingReturn = page.indexOf("if (!hydrated || resolutionState === 'loading')");
    const missingReturn = page.indexOf("if (resolutionState === 'missing' || !row)");
    expect(hook).toBeGreaterThan(-1);
    expect(loadingReturn).toBeGreaterThan(hook);
    expect(missingReturn).toBeGreaterThan(loadingReturn);
  });
});
