// Deno test for the Cowork intake bridge's PURE driveItem classifier.
// Run: deno test --no-check -A supabase/functions/_tests/cowork-intake-delta.test.ts

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { classifyDriveItem, laneFromPath } from '../cowork-intake-bridge/delta.ts';

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    name: 'note.md',
    parentReference: { path: '/drives/D/root:/Ops Inbox/vendor' },
    ...overrides,
  };
}

Deno.test('laneFromPath detects each watched lane', () => {
  assertEquals(laneFromPath('/drives/D/root:/Ops Inbox/scout'), 'scout');
  assertEquals(laneFromPath('/drives/D/root:/Ops Inbox/vendor'), 'vendor');
  assertEquals(laneFromPath('/drives/D/root:/Ops Inbox/event'), 'event');
  assertEquals(laneFromPath('/drives/D/root:/Ops Inbox/content'), 'content');
});

Deno.test('laneFromPath tolerates URL-encoding and case', () => {
  assertEquals(laneFromPath('/drives/D/root:/Ops%20Inbox/vendor'), 'vendor');
  assertEquals(laneFromPath('/drives/D/root:/OPS INBOX/Scout'), 'scout');
  assertEquals(laneFromPath('/drives/D/root:/Ops Inbox/vendor/'), 'vendor'); // trailing slash
});

Deno.test('laneFromPath rejects non-lane and nested paths', () => {
  assertEquals(laneFromPath('/drives/D/root:/Ops Inbox/ingested'), null);
  assertEquals(laneFromPath('/drives/D/root:/Ops Inbox'), null);
  assertEquals(laneFromPath('/drives/D/root:/Ops Inbox/vendor/sub'), null); // nested folder
  assertEquals(laneFromPath('/drives/D/root:/Somewhere/vendor'), null);
  assertEquals(laneFromPath(null), null);
});

Deno.test('classifyDriveItem ingests a .md / .txt in a watched lane', () => {
  assertEquals(classifyDriveItem(item({ name: 'a.md' })), { action: 'ingest', lane: 'vendor' });
  assertEquals(classifyDriveItem(item({ name: 'a.txt' })), { action: 'ingest', lane: 'vendor' });
  assertEquals(
    classifyDriveItem(item({ name: 'A.MD', parentReference: { path: '/drives/D/root:/Ops Inbox/scout' } })),
    { action: 'ingest', lane: 'scout' },
  );
});

Deno.test('classifyDriveItem flags a non-md/txt in a lane as unsupported', () => {
  const c = classifyDriveItem(item({ name: 'deck.pptx' }));
  assertEquals(c.action, 'unsupported');
  assertEquals(c.lane, 'vendor');
});

Deno.test('classifyDriveItem skips folders', () => {
  const c = classifyDriveItem(item({ name: 'scout', folder: { childCount: 3 } }));
  assertEquals(c.action, 'skip');
  assertEquals(c.reason, 'folder');
});

Deno.test('classifyDriveItem skips deleted items', () => {
  const c = classifyDriveItem(item({ deleted: { state: 'deleted' } }));
  assertEquals(c.action, 'skip');
  assertEquals(c.reason, 'deleted');
});

Deno.test('classifyDriveItem skips items outside the watched lanes', () => {
  const c = classifyDriveItem(item({ parentReference: { path: '/drives/D/root:/Ops Inbox/ingested' } }));
  assertEquals(c.action, 'skip');
  assertEquals(c.reason, 'outside_watched_lanes');
});
