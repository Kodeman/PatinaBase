/**
 * Hand-built RoomGeometry mirroring the prototype's ROOM object
 * (docs/design/the-document/room-view-prototype.html L365–386), expressed in the
 * generalized contract (doors[] instead of a single door; wall indices instead of
 * compass letters). Used to assert the plan-primitive port matches the prototype's
 * drawing intent.
 *
 * Lives in __fixtures__/ (not __tests__/) so Jest's testMatch does not treat it as a
 * test-less suite.
 */

import type { RoomGeometry } from '../geometry';

/** The prototype ROOM as RoomGeometry. The 2nd wall ("east run") is the low-confidence one. */
export function prototypeRoom(): RoomGeometry {
  return {
    width: 19,
    depth: 14,
    wallH: 8,
    thick: 0.45,
    walls: [
      { x1: 0, z1: 0, x2: 13, z2: 0, conf: 'high', name: 'North wall (west run)', len: 13 },
      { x1: 13, z1: 0, x2: 19, z2: 0, conf: 'low', name: 'North wall (east run)', len: 6 },
      { x1: 19, z1: 0, x2: 19, z2: 14, conf: 'high', name: 'East wall', len: 14 },
      { x1: 0, z1: 14, x2: 19, z2: 14, conf: 'high', name: 'South wall', len: 19 },
      { x1: 0, z1: 0, x2: 0, z2: 14, conf: 'high', name: 'West wall', len: 14 },
    ],
    // two windows on the west wall (index 4)
    windows: [
      { wall: 4, from: 2.5, to: 6.5, sill: 2.5, head: 7 },
      { wall: 4, from: 8.5, to: 12.5, sill: 2.5, head: 7 },
    ],
    // one door on the south wall (index 3) — swing unknown → NO arc (I73b)
    doors: [{ wall: 3, from: 15.5, to: 18.5, h: 7 }],
    // detected furniture — x,z are the top-left corners (as in the prototype)
    objects: [
      { x: 15.6, z: 3.5, w: 3.0, d: 7.0, h: 2.6, cat: 'sofa', label: 'sofa · 84″ × 36″' },
      { x: 12.6, z: 5.5, w: 2.0, d: 4.0, h: 1.4, cat: 'table', label: 'coffee table · 48″ × 24″' },
      { x: 6.0, z: 1.6, w: 2.6, d: 2.6, h: 2.5, cat: 'chair', label: 'chair · 31″ × 31″' },
      { x: 6.0, z: 9.8, w: 2.6, d: 2.6, h: 2.5, cat: 'chair', label: 'chair · 31″ × 31″' },
      { x: 0.6, z: 5.6, w: 1.5, d: 5.0, h: 1.8, cat: 'television', label: 'media console · 60″ × 18″' },
    ],
    floor: [],
  };
}
