/**
 * RoomWalls — the room's wall facts as ledger rows (US-28 S10a; uplift.md (c)
 * area 3; specimens/rooms-1440.html frame p2, "The walls"). Each wall is a
 * row: its name, what stands in it, and its length. The figure reads in one
 * glance with the maker on the line. A Section that closes on its own rule.
 */

import { ftIn, type RoomGeometry } from '@/lib/room-view/geometry';

/** Feet to whole inches, "47″". */
function inches(ft: number): string {
  return `${Math.round(ft * 12)}″`;
}

/** What stands in wall `index`: "Window 47″ × 57″, sill at 30″; Door 36″ × 84″". */
export function wallSentence(geometry: RoomGeometry, index: number): string {
  const parts: string[] = [];
  for (const win of geometry.windows) {
    if (win.wall !== index) continue;
    parts.push(
      `Window ${inches(win.to - win.from)} × ${inches(win.head - win.sill)}, sill at ${inches(win.sill)}`,
    );
  }
  for (const door of geometry.doors) {
    if (door.wall !== index) continue;
    parts.push(`Door ${inches(door.to - door.from)} × ${inches(door.h)}`);
  }
  for (const opening of geometry.openings) {
    if (opening.wall !== index) continue;
    parts.push(
      opening.h != null
        ? `Opening ${inches(opening.to - opening.from)} × ${inches(opening.h)}`
        : `Opening ${inches(opening.to - opening.from)}`,
    );
  }
  return parts.length > 0 ? parts.join('; ') : 'No windows or openings';
}

export function RoomWalls({ geometry }: { geometry: RoomGeometry }) {
  if (geometry.walls.length === 0) return null;
  return (
    <section className="section ledger" aria-labelledby="room-walls-eb" data-room-walls>
      <div className="sec-head">
        <p className="eb" id="room-walls-eb">
          <svg className="orn" viewBox="0 0 34 12" aria-hidden="true" focusable="false">
            <path d="M0 2h34M0 6h28M0 10h20" />
          </svg>
          <span>The walls</span>
        </p>
      </div>
      <div className="rows">
        {geometry.walls.map((wall, i) => (
          <div className="lrow plain" key={`${wall.name}-${i}`} data-wall-row>
            <div className="lname">
              <span className="t-d4">{wall.name}</span>
            </div>
            <span className="lsent t-body-sm">
              {wallSentence(geometry, i)}
              {wall.conf === 'low' ? ' · confirm on site' : ''}
            </span>
            <span className="lfig">{ftIn(wall.len)}</span>
          </div>
        ))}
        <div className="lrow plain" data-wall-row>
          <div className="lname">
            <span className="t-d4">Wall height</span>
          </div>
          <span className="lsent t-body-sm">Inferred from the walls; the ceiling is not captured</span>
          <span className="lfig">{ftIn(geometry.wallH)}</span>
        </div>
      </div>
    </section>
  );
}
