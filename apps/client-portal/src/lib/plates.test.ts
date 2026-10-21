import { PLATE_SIZES, PLATE_WIDTHS, plateSrcSet, plateUrl } from './plates';

const SCOPE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SHA = 'b'.repeat(64);

describe('plate helpers', () => {
  it('builds a scope-private URL in either format', () => {
    expect(plateUrl(SCOPE, SHA, 'wide', 1280, 'avif')).toBe(`/plates/${SCOPE}/${SHA}/wide-1280.avif`);
    expect(plateUrl(SCOPE, SHA, 'piece', 256, 'webp')).toBe(`/plates/${SCOPE}/${SHA}/piece-256.webp`);
  });

  it('builds an ordered width srcset without mutating the ladder', () => {
    const widths = [640, 828] as const;
    expect(plateSrcSet(SCOPE, SHA, 'cover_phone', widths, 'avif')).toBe(
      `/plates/${SCOPE}/${SHA}/cover_phone-640.avif 640w, /plates/${SCOPE}/${SHA}/cover_phone-828.avif 828w`,
    );
    expect(widths).toEqual([640, 828]);
    expect(plateSrcSet(SCOPE, SHA, 'piece', [], 'webp')).toBe('');
  });

  it('keeps every crop width ladder and responsive size from the plan', () => {
    expect(PLATE_WIDTHS).toEqual({
      cover_phone: [640, 828, 1080, 1242], tall: [640, 828, 1080, 1242],
      wide: [1280, 1600, 2048, 2560], wide32: [768, 1024, 1600, 2048],
      pair: [768, 1024, 1600, 2048], sheet: [768, 1024, 1600, 2048],
      board: [768, 1024, 1600, 2048], piece: [256, 512, 768],
    });
    expect(PLATE_SIZES).toEqual({
      cover_phone: '100vw', tall: '100vw', wide: '100vw',
      wide32: '(min-width:1296px) 1248px, calc(100vw - 32px)',
      pair: '(min-width:1296px) 1248px, calc(100vw - 32px)',
      sheet: '(min-width:1296px) 1248px, calc(100vw - 32px)',
      board: '(min-width:1296px) 1248px, calc(100vw - 32px)',
    });
  });
});
