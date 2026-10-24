import { galleryCropPosition, GALLERY_DESKTOP_ASPECT, GALLERY_PHONE_ASPECT } from './gallery-crop';

describe('Gallery crop geometry', () => {
  it('positions tall and wide crops separately around the stored focal point without losing the subject', () => {
    const photo = { width: 2400, height: 1600, subjectBox: [0.6, 0.3, 0.2, 0.4] as const, focal: [0.7, 0.6] as const };
    expect(galleryCropPosition(photo.width, photo.height, GALLERY_PHONE_ASPECT, photo.subjectBox, photo.focal)).toBe('79.7% 50%');
    expect(galleryCropPosition(photo.width, photo.height, GALLERY_DESKTOP_ASPECT, photo.subjectBox, photo.focal)).toBe('50% 100%');
    expect(galleryCropPosition(2400, 1600, GALLERY_PHONE_ASPECT, [0, 0, 1, 1])).toBeNull();
    expect(galleryCropPosition(0, 1600, GALLERY_PHONE_ASPECT)).toBeNull();
  });
});
