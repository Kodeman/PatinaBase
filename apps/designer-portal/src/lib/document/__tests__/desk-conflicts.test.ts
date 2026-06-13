/**
 * R28 / R22 — the calendar's intelligence mapped onto the Desk's two tiers.
 *   collision tier → folder need line (an act exists today)
 *   drift tier     → in-motion chip (state carried, never a nag)
 */

import type { DeliveryEvent } from '@patina/supabase';
import { buildDeskConflicts } from '../desk-conflicts';

function ev(
  o: Partial<DeliveryEvent> & {
    event_id: string;
    project_id: string;
    event_date: string;
    event_type: DeliveryEvent['event_type'];
  },
): DeliveryEvent {
  return {
    purchase_order_id: null,
    vendor_id: null,
    vendor_name: null,
    po_status: null,
    delivered_date: null,
    ffe_item_count: null,
    line_total_cents: null,
    inspection_id: null,
    inspection_outcome: null,
    phase_key: null,
    project_name: 'Project ' + o.project_id,
    ...o,
  };
}

const install = (id: string, project: string, date: string) =>
  ev({ event_id: id, project_id: project, event_date: date, event_type: 'install_milestone' });
const delivery = (id: string, project: string, date: string, vendor = 'Verellen') =>
  ev({
    event_id: id,
    project_id: project,
    event_date: date,
    event_type: 'delivery_expected',
    vendor_name: vendor,
    purchase_order_id: id,
  });

describe('buildDeskConflicts', () => {
  it('promotes a cross-project install collision to the collision tier (folder)', () => {
    const map = buildDeskConflicts([
      install('i-a', 'proj-a', '2026-07-14'),
      install('i-b', 'proj-b', '2026-07-16'),
    ]);
    expect(map.get('proj-a')?.collision?.label).toBe('COLLISION');
    expect(map.get('proj-a')?.collision?.text).toBe('Two installs collide — week of Jul 13');
    expect(map.get('proj-b')?.collision).not.toBeNull();
  });

  it('promotes a late arrival (delivery after install) to the collision tier', () => {
    const map = buildDeskConflicts([
      install('i-a', 'proj-a', '2026-07-10'),
      delivery('d-a', 'proj-a', '2026-07-20', 'Cisco'),
    ]);
    const c = map.get('proj-a')?.collision;
    expect(c?.label).toBe('LATE');
    expect(c?.text).toContain('Cisco');
    expect(c?.text).toContain('after the install');
  });

  it('drops a near-but-not-late delivery into the drift tier (chip)', () => {
    // Delivery 5 days BEFORE the install → drift (inside the 14-day buffer),
    // not late.
    const map = buildDeskConflicts([
      install('i-a', 'proj-a', '2026-07-20'),
      delivery('d-a', 'proj-a', '2026-07-15'),
    ]);
    expect(map.get('proj-a')?.collision).toBeNull();
    expect(map.get('proj-a')?.drift).toMatch(/before install/);
  });

  it('a collision outranks drift on the same project', () => {
    const map = buildDeskConflicts([
      install('i-a', 'proj-a', '2026-07-14'),
      install('i-b', 'proj-b', '2026-07-16'),
      // proj-a also has a drift-y delivery — but the collision wins the folder.
      delivery('d-a', 'proj-a', '2026-07-12'),
    ]);
    expect(map.get('proj-a')?.collision?.label).toBe('COLLISION');
  });

  it('returns an empty map when nothing conflicts', () => {
    const map = buildDeskConflicts([
      install('i-a', 'proj-a', '2026-07-14'),
      delivery('d-a', 'proj-a', '2026-06-01'), // months before — no drift
    ]);
    expect(map.get('proj-a')?.collision ?? null).toBeNull();
    expect(map.get('proj-a')?.drift ?? null).toBeNull();
  });
});
