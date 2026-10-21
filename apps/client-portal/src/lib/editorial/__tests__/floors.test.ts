import { FLOORS, cropBox, heroDesktopLayout, meetsFloor, placeRole } from '../floors';

describe('floors', () => {
  it('takes the largest box of the aspect inside the source', () => {
    expect(cropBox(1.6, 4000, 3000)).toEqual({ w: 4000, h: 2500 });
    expect(cropBox(1.6, 3000, 1000)).toEqual({ w: 1600, h: 1000 });
  });

  it('holds the hero desktop floor at 1600 × 1000 after the crop', () => {
    expect(meetsFloor(FLOORS.heroDesktop, 1600, 1000)).toBe(true);
    expect(meetsFloor(FLOORS.heroDesktop, 1599, 1000)).toBe(false);
  });

  it('refuses a crop that discards more than half the source', () => {
    // a 3000 × 6000 portrait has a 3000 × 1875 wide box: 31 percent kept
    expect(meetsFloor(FLOORS.heroDesktop, 3000, 6000)).toBe(false);
  });

  it('refuses a crop that cannot hold the whole subject box', () => {
    expect(meetsFloor(FLOORS.room, 3000, 3000, [0, 0, 0.5, 0.9])).toBe(false);
    expect(meetsFloor(FLOORS.room, 3000, 3000, [0.2, 0.2, 0.5, 0.5])).toBe(true);
  });

  it('never upscales: a small source misses every photographic floor', () => {
    expect(meetsFloor(FLOORS.heroPhone, 779, 680)).toBe(false);
    expect(meetsFloor(FLOORS.heroPhone, 780, 680)).toBe(true);
  });

  it('sets the desktop hero bleed, measure or portrait template', () => {
    expect(heroDesktopLayout(2400, 1500)).toBe('bleed');
    expect(heroDesktopLayout(1400, 875)).toBe('measure');
    expect(heroDesktopLayout(1200, 1600)).toBe('portrait');
    expect(heroDesktopLayout(1000, 700)).toBeNull();
  });

  it('drops a plate one role below its floor', () => {
    expect(placeRole('hero', 2400, 1600)).toBe('hero');
    // below the bleed floor but wide enough for the 1248 measure plate
    expect(placeRole('hero', 1400, 960)).toBe('hero');
    // no desktop template, and too narrow for a room plate
    expect(placeRole('hero', 1000, 900)).toBe('silhouette');
    expect(placeRole('held', 1080, 2348)).toBe('held');
    expect(placeRole('held', 2048, 1365)).toBe('room');
  });

  it('falls to a silhouette when one role down still misses', () => {
    expect(placeRole('room', 400, 300)).toBe('silhouette');
    expect(placeRole('piece', 300, 300)).toBe('silhouette');
    expect(placeRole('piece', 330, 200)).toBe('piece');
  });

  it('reads sheets and boards across their width, uncropped', () => {
    expect(placeRole('sheet', 2048, 1400)).toBe('sheet');
    expect(placeRole('sheet', 1800, 1400)).toBe('plan');
    expect(placeRole('board', 1600, 1200)).toBe('board');
    expect(placeRole('board', 800, 600)).toBe('piece');
  });
});
