import { inspectionPhotoLine } from '../orders-book-receiving';

describe('inspectionPhotoLine', () => {
  it('counts the photos iOS logged against the inspection', () => {
    expect(inspectionPhotoLine(['a', 'b', 'c'])).toBe('3 photos logged on the phone');
  });

  it('reads singular for one', () => {
    expect(inspectionPhotoLine(['a'])).toBe('1 photo logged on the phone');
  });

  it('says nothing for an inspection logged without photos', () => {
    expect(inspectionPhotoLine([])).toBeNull();
  });

  it('is total against a column with no client-side shape guarantee', () => {
    for (const value of [null, undefined, 'a', 42, {}]) {
      expect(inspectionPhotoLine(value)).toBeNull();
    }
  });

  it('ignores blank ids rather than counting them', () => {
    expect(inspectionPhotoLine(['a', '', '   ', null])).toBe('1 photo logged on the phone');
  });
});
