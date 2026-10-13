'use client';

/**
 * RoomCard and RoomRow — one room in a job's Section of Measured rooms
 * (US-28 S10a; uplift.md (c) area 3; specimens/rooms-1440.html frame p1).
 *
 * The Card (L2): on --paper-doc with one 1px --card-edge (`.card`, the S1
 * block). Its upper block is the hit area: the room's name is a real link to
 * `/room/[id]` whose `::after` covers the eyebrow and name (`.card-up`). The
 * plate slot holds the drawn plan or the A10 silhouette, captioned with the
 * ink word AWAITING DRAWING when the plan is not drawn yet. Size and quality
 * are facts; quality is the ink word "Quality good", never a graded dot.
 * The client and the job's Document link stand in the Section's eyebrow and
 * title, so the Card names only the room.
 *
 * The Row (ledger row): the fourth room on in a Section, the same facts in
 * one line.
 *
 * Both links stash the Rooms origin on click, the same mechanism
 * studio-drawer.tsx's `enterRoom` uses (`rememberRoomOrigin`), so leaving a
 * room opened from `/rooms` returns here rather than to the Desk.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { RoomRosterEntry } from '@/lib/room-view/geometry';
import { rememberRoomOrigin } from '@/lib/document/room-origin';
import { RoomPlanThumb } from './room-plan-thumb';
import { qualityWord, roomName, roomSize, scanDay } from './rooms-by-job';

const AWAITING_DRAWING = 'Awaiting drawing';

export function RoomCard({ entry }: { entry: RoomRosterEntry }) {
  const pathname = usePathname();
  const name = roomName(entry);
  const day = scanDay(entry.scanDate);
  const size = roomSize(entry);
  const quality = qualityWord(entry.quality.grade);
  const drawn = entry.geometry != null;

  return (
    <article className="card" data-room-card>
      <div className="card-up">
        <p className="eb">{day ? `Room · scanned ${day}` : 'Room'}</p>
        <h3 className="name-h t-d3">
          <Link
            href={`/room/${entry.roomId}`}
            className="name"
            onClick={() => rememberRoomOrigin(pathname)}
          >
            {name}
          </Link>
        </h3>
      </div>

      <figure className="room-fig">
        <RoomPlanThumb
          geometry={entry.geometry}
          dims={entry.dims}
          label={
            drawn
              ? `Plan of the ${name.toLowerCase()}, drawn from the scan`
              : `Scanned outline of the ${name.toLowerCase()}, not yet drawn`
          }
        />
        {drawn ? (
          <figcaption className="cap t-meta">{name} · plan drawn from the scan</figcaption>
        ) : (
          <figcaption className="cap">
            <span className="word">{AWAITING_DRAWING}</span>{' '}
            <span className="t-meta">· the scan is in; the plan is drawn next</span>
          </figcaption>
        )}
      </figure>

      <dl className="room-facts">
        <dt>Size</dt>
        <dd className="t-money">{size ?? 'Geometry pending'}</dd>
        {quality && (
          <>
            <dt>Scan</dt>
            <dd>
              <span className="word">{quality}</span>
            </dd>
          </>
        )}
      </dl>
    </article>
  );
}

export function RoomRow({ entry }: { entry: RoomRosterEntry }) {
  const pathname = usePathname();
  const name = roomName(entry);
  const day = scanDay(entry.scanDate);
  const size = roomSize(entry);
  const quality = qualityWord(entry.quality.grade);
  const drawn = entry.geometry != null;

  return (
    <div className="lrow plain" data-room-row>
      <div className="lname">
        <Link
          href={`/room/${entry.roomId}`}
          className="name t-d4"
          onClick={() => rememberRoomOrigin(pathname)}
        >
          {name}
        </Link>
      </div>
      <span className="lsent t-body-sm">
        <span className={drawn ? 'word word--quiet' : 'word'}>
          {drawn ? 'Plan drawn' : AWAITING_DRAWING}
        </span>
        {quality && (
          <>
            {' · '}
            <span className="word">{quality}</span>
          </>
        )}
      </span>
      <span className="lfig">{size ?? 'Geometry pending'}</span>
      <span className="lwhen t-body-sm">{day ? `Scanned ${day}` : ''}</span>
    </div>
  );
}
