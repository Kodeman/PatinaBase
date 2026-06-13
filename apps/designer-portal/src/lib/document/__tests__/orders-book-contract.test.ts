/**
 * R28 source contracts for the Orders book — held mechanically (the R16/F6
 * shadow-lint precedent), not by convention:
 *   1. one component, two doors — the Receiving page and the line unfold mount
 *      the SAME LogInspectionDrawer, so inspecting from the queue and from an
 *      unfold write identical rows;
 *   2. the book's pages are DM-mono text links, never a tab/Tabs primitive;
 *   3. Brief-a-vendor pre-addresses the Vendors page with the project (R29).
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const COMPONENTS = join(__dirname, '..', '..', '..', 'components', 'document');
const read = (f: string) => readFileSync(join(COMPONENTS, f), 'utf8');

const receiving = read('orders-book-receiving.tsx');
const unfold = read('line-unfold.tsx');
const ledger = read('orders-ledger.tsx');
const colophon = read('doc-colophon.tsx');

const DRAWER_IMPORT = '@/components/portal/procurement/log-inspection-drawer';

describe('R28 — one inspection component, two doors', () => {
  it('Receiving and the line unfold mount the same LogInspectionDrawer', () => {
    expect(receiving).toContain(DRAWER_IMPORT);
    expect(unfold).toContain(DRAWER_IMPORT);
    expect(receiving).toContain('LogInspectionDrawer');
    expect(unfold).toContain('LogInspectionDrawer');
  });
});

describe('R28 — the book pages are text links, never tabs', () => {
  it('the page nav uses <button> links and a DM-mono font, not a Tabs primitive', () => {
    // No design-system Tabs / TabsList / role="tab" in the Orders book.
    expect(ledger).not.toMatch(/TabsList|TabsTrigger|role=["']tab["']/);
    // The page links carry the mono face (DM-mono tracking).
    expect(ledger).toMatch(/font-mono/);
    // The four pages exist as a typed list.
    for (const label of ['Ledger', 'The Week', 'Receiving', 'Vendors']) {
      expect(ledger).toContain(`label: '${label}'`);
    }
  });
});

describe('R29 — Brief a vendor pre-addresses the Vendors page', () => {
  it('the colophon opens the Orders book onto Vendors with the project in hand', () => {
    expect(colophon).toMatch(/openLedger\('orders',\s*\{\s*page:\s*'vendors',\s*projectId\s*\}\)/);
  });
});
