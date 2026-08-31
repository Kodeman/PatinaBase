/**
 * photoPathsByCapture — the reducer under the Work block's punch thumbnails.
 * field_captures.photos is a jsonb array of {path, publicUrl, isPrimary, …}
 * (00235:27) and primary_photo_path is the first isPrimary path (00235:126-128).
 * The strip wants storage KEYS, in capture order, with the primary first —
 * useCaptureMediaUrls signs them; this never mints a URL.
 */
import { photoPathsByCapture } from '../use-field-capture-photos';

describe('photoPathsByCapture', () => {
  it('returns an empty map for no captures', () => {
    expect(photoPathsByCapture([])).toEqual({});
  });

  it('keys the storage paths by capture id', () => {
    expect(
      photoPathsByCapture([
        { id: 'cap-1', photos: [{ path: 'a.heic' }, { path: 'b.heic' }], primary_photo_path: null },
      ]),
    ).toEqual({ 'cap-1': ['a.heic', 'b.heic'] });
  });

  it('puts the primary photo first so the strip leads with what she framed', () => {
    expect(
      photoPathsByCapture([
        {
          id: 'cap-1',
          photos: [{ path: 'a.heic' }, { path: 'b.heic' }],
          primary_photo_path: 'b.heic',
        },
      ]),
    ).toEqual({ 'cap-1': ['b.heic', 'a.heic'] });
  });

  it('drops entries with no path rather than emitting a blank', () => {
    expect(
      photoPathsByCapture([
        { id: 'cap-1', photos: [{ isPrimary: true }, { path: '' }, { path: 'a.heic' }], primary_photo_path: null },
      ]),
    ).toEqual({ 'cap-1': ['a.heic'] });
  });

  it('omits a capture whose photos are missing or malformed', () => {
    expect(
      photoPathsByCapture([
        { id: 'cap-1', photos: null, primary_photo_path: null },
        { id: 'cap-2', photos: 'not-an-array', primary_photo_path: null },
      ]),
    ).toEqual({});
  });

  it('omits a capture whose photos array holds bare strings rather than {path} objects', () => {
    expect(
      photoPathsByCapture([
        { id: 'cap-1', photos: ['a.heic', 'b.heic'], primary_photo_path: null },
      ]),
    ).toEqual({});
  });
});
