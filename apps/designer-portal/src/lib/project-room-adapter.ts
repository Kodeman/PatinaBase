import type { MockRoom } from '@/types/project-ui';

const ORDERED_STATUSES: ReadonlySet<string> = new Set([
  'ordered',
  'production',
  'shipped',
  'delivered',
  'installed',
]);

interface ProjectRoomDbRow {
  id: string;
  project_id: string;
  name: string;
  dimensions: string | null;
  notes: string | null;
  budget_cents: number;
}

interface ProjectFFEItemDbRow {
  id: string;
  project_room_id: string | null;
  name: string;
  status: string;
}

function isDbRoomRow(row: unknown): row is ProjectRoomDbRow {
  return (
    typeof row === 'object' &&
    row !== null &&
    'budget_cents' in row &&
    'project_id' in row
  );
}

export function adaptProjectRooms(
  rooms: readonly unknown[],
  items: readonly unknown[],
): MockRoom[] {
  if (rooms.length === 0) return [];
  // Slug/mock projects: useProjectRooms returns MockRoom directly — pass through.
  if (!isDbRoomRow(rooms[0])) return rooms as MockRoom[];

  const dbRooms = rooms as readonly ProjectRoomDbRow[];
  const dbItems = items as readonly ProjectFFEItemDbRow[];

  const itemsByRoom = new Map<string, ProjectFFEItemDbRow[]>();
  for (const it of dbItems) {
    if (!it?.project_room_id) continue;
    let list = itemsByRoom.get(it.project_room_id);
    if (!list) {
      list = [];
      itemsByRoom.set(it.project_room_id, list);
    }
    list.push(it);
  }

  return dbRooms.map((row) => {
    const list = itemsByRoom.get(row.id) ?? [];
    const ordered = list.filter((it) => ORDERED_STATUSES.has(it.status)).length;
    const total = list.length;
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      dimensions: row.dimensions ?? '',
      notes: row.notes ?? '',
      budget: row.budget_cents,
      itemCount: total,
      orderedCount: ordered,
      progress: total > 0 ? Math.round((ordered / total) * 100) : 0,
      itemNames: list.map((it) => it.name),
    };
  });
}
