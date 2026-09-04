/* ── The plan key ───────────────────────────────────────────────────────────
   A key on a drawing, not a floor plan. The house is drawn as one band of
   abutting rooms read left to right, the road runs off the right-hand edge,
   and the only things that carry ink are the marks that wait on the client's
   hand: a door where a paper waits for her name, a wall where finished work
   waits for her acceptance.

   The geometry is pure and in user units — the caller scales it with a
   viewBox. Every number here is a drawing decision, held in one place so the
   key cannot drift between the SVG and the list beneath it. ─────────────── */

/** A room as the drawing needs it. `floorAreaSqft` is null when unmeasured. */
export interface KeyRoom {
  id: string;
  name: string;
  sortOrder: number;
  floorAreaSqft: number | null;
}

/** A door waits for a signature; a wall waits for an acceptance. */
export type MarkKind = 'door' | 'wall';

/**
 * Something open, and where it stands. `roomId` null means it belongs to no
 * room on this drawing — it stands on the Doorstep instead, and the key does
 * not draw it.
 */
export interface KeyMark {
  kind: MarkKind;
  roomId: string | null;
  label: string;
  anchor: string;
}

export interface PlanKeyGeometry {
  viewBox: string;
  rects: Array<{ roomId: string; x: number; y: number; w: number; h: number; anchor: string }>;
  labels: Array<{ roomId: string; x: number; y: number; text: string }>;
  road: { x1: number; x2: number; y: number; anchor: 'road' };
  doorMarks: Array<{ roomId: string; x: number; y1: number; y2: number; kind: MarkKind; anchor: string }>;
  leaders: Array<{ fromX: number; fromY: number; toX: number; toY: number; text: string }>;
}

/** The mark's stroke, in the same user units as the geometry. Brass, 3 wide. */
export const PLAN_MARK_STROKE = 3;

const ORIGIN_X = 18;
const BAND_Y = 30;
const BAND_H = 62;
/** No room reads as a room below this, however small its floor area. */
const MIN_ROOM_W = 84;
/** The width a room gets when nothing distinguishes it, and the budget each
 *  room contributes when the widths are scaled to floor area. */
const NOMINAL_ROOM_W = 120;
const ROAD_GAP = 16;
const ROAD_LEN = 50;
const RIGHT_MARGIN = 8;
const VIEW_H = 152;
const LABEL_DX = 4;
const LABEL_DY = 14;
/** How far a mark is held off the band's edges, so it reads as an opening. */
const MARK_INSET = 16;
const DOOR_LEADER_DROP = 32;
const DOOR_LEADER_RUN = 22;
const WALL_LEADER_RISE = 14;
const WALL_LEADER_RUN = 66;

/**
 * Plan order: the studio's own order first, then name, then id — sort_order is
 * uniformly 0 on a great many projects, and a drawing that reshuffles itself
 * between renders is not a drawing.
 *
 * Exported because the key's rects and the page's room bands MUST agree on
 * order; two copies of this comparator is how that drift starts. The locale is
 * pinned so a server pass and a browser pass cannot sort differently.
 */
export function byPlanOrder(a: KeyRoom, b: KeyRoom): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  const byName = a.name.localeCompare(b.name, 'en');
  if (byName !== 0) return byName;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function measuredArea(room: KeyRoom): number | null {
  const area = room.floorAreaSqft;
  return typeof area === 'number' && Number.isFinite(area) && area > 0 ? area : null;
}

function roomWidths(rooms: KeyRoom[]): number[] {
  const areas = rooms.map(measuredArea);
  const measured = areas.every((area): area is number => area !== null);
  if (!measured) return rooms.map(() => NOMINAL_ROOM_W);

  const budget = rooms.length * NOMINAL_ROOM_W;
  const total = areas.reduce<number>((sum, area) => sum + (area as number), 0);
  return areas.map((area) => Math.max(MIN_ROOM_W, Math.round((budget * (area as number)) / total)));
}

export function planKeyGeometry(rooms: KeyRoom[], marks: KeyMark[]): PlanKeyGeometry {
  const ordered = [...rooms].sort(byPlanOrder);
  const widths = roomWidths(ordered);

  const rects: PlanKeyGeometry['rects'] = [];
  let x = ORIGIN_X;
  ordered.forEach((room, index) => {
    rects.push({
      roomId: room.id,
      x,
      y: BAND_Y,
      w: widths[index],
      h: BAND_H,
      anchor: `room-${room.id}`,
    });
    x += widths[index];
  });

  const labels: PlanKeyGeometry['labels'] = rects.map((rect, index) => ({
    roomId: rect.roomId,
    x: rect.x + LABEL_DX,
    y: BAND_Y + BAND_H + LABEL_DY,
    text: ordered[index].name,
  }));

  const houseRight = rects.length > 0 ? x : ORIGIN_X;
  const roadX1 = rects.length > 0 ? houseRight + ROAD_GAP : ORIGIN_X;
  const road: PlanKeyGeometry['road'] = {
    x1: roadX1,
    x2: roadX1 + ROAD_LEN,
    y: BAND_Y + BAND_H / 2,
    anchor: 'road',
  };

  const rectById = new Map(rects.map((rect) => [rect.roomId, rect]));
  const doorMarks: PlanKeyGeometry['doorMarks'] = [];
  const leaders: PlanKeyGeometry['leaders'] = [];

  for (const mark of marks) {
    if (mark.roomId === null) continue;
    const rect = rectById.get(mark.roomId);
    if (!rect) continue;

    doorMarks.push({
      roomId: mark.roomId,
      x: rect.x,
      y1: BAND_Y + MARK_INSET,
      y2: BAND_Y + BAND_H - MARK_INSET,
      kind: mark.kind,
      anchor: mark.anchor,
    });

    leaders.push(
      mark.kind === 'door'
        ? {
            fromX: rect.x,
            fromY: BAND_Y + BAND_H,
            toX: rect.x + DOOR_LEADER_RUN,
            toY: BAND_Y + BAND_H + DOOR_LEADER_DROP,
            text: mark.label,
          }
        : {
            fromX: rect.x,
            fromY: BAND_Y,
            toX: rect.x + WALL_LEADER_RUN,
            toY: BAND_Y - WALL_LEADER_RISE,
            text: mark.label,
          },
    );
  }

  return {
    viewBox: `0 0 ${road.x2 + RIGHT_MARGIN} ${VIEW_H}`,
    rects,
    labels,
    road,
    doorMarks,
    leaders,
  };
}
