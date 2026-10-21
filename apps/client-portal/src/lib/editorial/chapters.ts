/* Chapter order per PLAN (Chapters table). The order is fixed, the anchors are
   an external contract, and Phase 1 headlines are written here, in code, from
   the record alone. */

import { getPhaseLabel } from '@patina/types';

import type { EditorialProject, EditorialRoom } from './types';

export type ChapterKey =
  | 'cover'
  | 'invoices'
  | 'approvals'
  | 'house'
  | 'room'
  | 'progress'
  | 'updates'
  | 'earlier'
  | 'documents';

export interface Chapter {
  /** Two-digit wayfinding numeral, "01". */
  number: string;
  key: ChapterKey;
  /** The chapter's existing anchor; the cover has none of its own. */
  anchor: string | null;
  roomId?: string;
  /** The eyebrow after its numeral: "Living room". */
  label: string;
  /** Numeral and label, "05 · Living room"; capitals come from CSS. */
  eyebrow: string;
  headline: string;
}

/** Materials read from item names, in the order they first appear. */
const MATERIALS: readonly string[] = [
  'walnut', 'oak', 'ash', 'maple', 'cherry', 'birch', 'elm', 'hickory', 'pine', 'cedar', 'teak',
  'linen', 'wool', 'bouclé', 'boucle', 'leather', 'velvet', 'mohair', 'cotton', 'silk', 'jute',
  'cane', 'rattan', 'brass', 'bronze', 'copper', 'iron', 'steel', 'marble', 'travertine',
  'limestone', 'slate', 'stone', 'terrazzo', 'plaster', 'glass', 'ceramic', 'concrete',
];

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

const IN_TRANSIT = /order|production|transit|ship|fabricat/i;

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function series(words: readonly string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

const MATERIAL_PATTERNS = MATERIALS.map((material) => ({
  word: material === 'boucle' ? 'bouclé' : material,
  pattern: new RegExp(`(^|[^\\p{L}])${material}([^\\p{L}]|$)`, 'u'),
}));

function itemMaterials(nameAsSigned: string): string[] {
  const name = nameAsSigned.toLowerCase();
  return MATERIAL_PATTERNS.filter(({ pattern }) => pattern.test(name)).map(({ word }) => word);
}

export function roomMaterials(room: Pick<EditorialRoom, 'items'>): string[] {
  const found = room.items.flatMap((item) => itemMaterials(item.nameAsSigned));
  return [...new Set(found)].slice(0, 3);
}

export function roomHeadline(room: Pick<EditorialRoom, 'name' | 'items'>): string {
  const materials = roomMaterials(room);
  return materials.length ? capitalise(series(materials)) : room.name;
}

function coverHeadline(project: EditorialProject, rooms: readonly EditorialRoom[]): string {
  switch (project.phase) {
    case 'procurement': {
      const moving = rooms.find((r) => r.items.some((i) => i.status && IN_TRANSIT.test(i.status)));
      return moving ? `The ${moving.name.toLowerCase()} is on its way` : 'The pieces are on their way';
    }
    case 'installation':
      return 'The rooms are going in';
    case 'final_walkthrough':
      return 'The house, as finished';
    default:
      return 'The rooms, as drawn';
  }
}

function houseHeadline(count: number): string {
  if (count === 1) return 'One room, read from the front door';
  const word = NUMBER_WORDS[count] ?? 'The';
  return `${word} rooms, read from the front door`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function chapterOrder(project: EditorialProject, rooms: readonly EditorialRoom[]): Chapter[] {
  const phase = getPhaseLabel(project.phase, 'client');
  type Row = [head: string, chapter: Omit<Chapter, 'number' | 'eyebrow' | 'label'>];
  const rows: Row[] = [
    [`${project.name} · ${phase}`, { key: 'cover', anchor: null, headline: coverHeadline(project, rooms) }],
    ['Invoices', { key: 'invoices', anchor: 'doorstep', headline: 'Your invoices' }],
    ['Approvals', { key: 'approvals', anchor: 'approvals', headline: 'Waiting for your approval' }],
    ['The house', { key: 'house', anchor: 'key', headline: houseHeadline(rooms.length) }],
    ...rooms.map(
      (room): Row => [room.name, { key: 'room', anchor: room.anchor, roomId: room.id, headline: roomHeadline(room) }],
    ),
    ['Progress', { key: 'progress', anchor: 'road', headline: 'In production, then on the truck, then here' }],
    ['Updates', { key: 'updates', anchor: 'note', headline: 'A note from the studio' }],
    ['Earlier', { key: 'earlier', anchor: 'previously', headline: 'What has already been settled' }],
    ['Documents and contact', { key: 'documents', anchor: 'mat', headline: 'Who to call, and the documents' }],
  ];
  return rows.map(([head, chapter], i) => ({
    ...chapter,
    number: pad(i + 1),
    label: head,
    eyebrow: `${pad(i + 1)} · ${head}`,
  }));
}
