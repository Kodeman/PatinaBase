// deno test --allow-all --config supabase/functions/deno.json supabase/functions/board-deck-import-resolve/
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { decodeBase64 } from 'jsr:@std/encoding@1/base64';
import { cropSignature, isWebp, sha256Hex } from './crop_signature.ts';
import { dHash, hamming, toPgBigint } from './phash.ts';
import { LOOK_THRESHOLDS } from './thresholds.ts';

/** The fixture picture: smooth colour fields, so the hash has structure. */
function pattern(w: number, h: number, flip = false): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = flip ? 1 - x / w : x / w;
      const v = y / h;
      const i = (y * w + x) * 4;
      out[i] = Math.round(255 * (0.5 + 0.5 * Math.sin(6 * u + 2 * v)));
      out[i + 1] = Math.round(255 * v);
      out[i + 2] = Math.round(255 * (0.5 + 0.5 * Math.cos(9 * u * v)));
      out[i + 3] = 255;
    }
  }
  return out;
}

// cwebp -q 60 of pattern(72, 48), of pattern(36, 24) (half size), and of the
// mirrored pattern(72, 48, true).
const LOSSY = decodeBase64(
  'UklGRmoBAABXRUJQVlA4IF4BAACwCwCdASpIADAAPpE2l0mvoyIhO768AfASCWxocEYWMv1b2nzMa9/fN7ANDD3AmWuelJbppbG/E3phdXSUi/a/spHIxuT+757erXrr11HQOyMeiBgVVyRWu3OJRL1rFMRsriAe1gAA/unzY0BYmAam1/9QZHoCz7cQ7/5NJf8hwS10lWt65PWSB60nvmB1V1l0AHqFcEmoGm9h24JfI+uizealzp7eYv7HXm1D78v1YfGYKrHlkj4hAYKoBHvcQ4g82PPTc7uXtLaDfotNSHWFkYXKUybGIlv/t8vogyy66kO5TaylaZ4jR1wgT8fvCHwt68MtnuFsXdniq3F9SWnHvVbrhEw109k3E4sB34Vo6vMaC7NUlF9rbar5HT8fe/WGIhEbt3+jB1OxzFLwlTFNOHYgPLVMHWlysq1vZHA9cXZGXYS7YVvf0WFscTsXDAW1AvJFlb49dqfUiYAAAA==',
);
const SMALL = decodeBase64(
  'UklGRuoAAABXRUJQVlA4IN4AAADQCACdASokABgAPrVEn0onI6KhtVQMAOAWiWwAnTKEc7eRfjt7AlE/suLR1XfVaRny9ssJY/F619d2GsR68zSmEIg1PgHJAPH6meXawzfAAP7c776OHwjuXPV39Hd6f//0JZIuaYvjYf/OV+ZkjcImiW8NhP9mfCU4loPX4a9bx+oz03qduJ5m6t3xVs82yq1b7+o0lTt8+lDjmXM3BjMM6LBhs0h00f0Hk3QSntXvIsZLeiw2ajip67rPjNptrcqQIkSBrc8uuGvvM6QCRHm7OwmQrp7hOo9s1WAAAAA=',
);
const MIRRORED = decodeBase64(
  'UklGRk4BAABXRUJQVlA4IEIBAADwDACdASpIADAAPqVGmUmmJCKhN3ooAMAUiWoArDlBU54x/gPM2sHZvjZw6SM+Ubyt4QTNXMWMxZ36uFrO9oLLpJYdBfLa8ZQhMlZEGbdFOH4VtyyYkHbVophJSZWgPRp6nv4WLkRR7E3mSeZgNpHgAP7u6ByruAdOfnt5Pfx/aPF2aa3d5KCkpXOjQZIOCM4qhfBla2F7v10l3vif/FPutXrqAr9anI6YHgWboJ8cTHiEDu09J8HsKDVGAyawTGEoY6deulDXKfTA4pOFxjxS5XUa/Op3aDdfe4dObe9jFKpNU6Ode5q0sGKETRziJsbz60GWMJuZFLGSc+4NAaDSv8S3rnC6kwl+YLSEWTqOfknAkuArUsuOp1Z/x71uEHtqLPbCXFyZp+qK3rH4e494YVPCv9ge6FoPf1Ui/JrYAAAA',
);

const TRUTH = dHash(pattern(72, 48), 72, 48);

Deno.test('dHash: 64 bits, stable, and Hamming counts differing bits', () => {
  assertEquals(dHash(pattern(72, 48), 72, 48), TRUTH);
  assert(TRUTH < 1n << 64n);
  assertEquals(hamming(0n, 0n), 0);
  assertEquals(hamming(0n, (1n << 64n) - 1n), 64);
  assertEquals(hamming(BigInt.asIntN(64, TRUTH), TRUTH), 0, 'signed and unsigned forms are the same hash');
  assertEquals(BigInt(toPgBigint((1n << 64n) - 1n)), -1n, 'Postgres bigint is signed');
});

Deno.test('dHash flattens transparency onto grey', () => {
  const clear = new Uint8Array(9 * 8 * 4); // all zero, alpha 0
  const grey = new Uint8Array(9 * 8 * 4).map((_, i) => (i % 4 === 3 ? 255 : 128));
  assertEquals(dHash(clear, 9, 8), dHash(grey, 9, 8));
});

Deno.test('cropSignature: a WebP crop decodes; recompression and half size stay within τ_hamming, a mirror does not', async () => {
  const lossy = await cropSignature(LOSSY);
  const small = await cropSignature(SMALL);
  const mirrored = await cropSignature(MIRRORED);
  assertEquals(lossy.image_hash, await sha256Hex(LOSSY));
  assert(lossy.phash && small.phash && mirrored.phash, 'every WebP fixture hashed');
  assert(hamming(BigInt(lossy.phash), TRUTH) <= LOOK_THRESHOLDS.exactHamming, 'q60 recompression is exact');
  assert(hamming(BigInt(small.phash), TRUTH) <= LOOK_THRESHOLDS.exactHamming, 'half size is exact');
  assert(hamming(BigInt(mirrored.phash), TRUTH) > LOOK_THRESHOLDS.exactHamming * 2, 'a mirrored picture is not');
});

Deno.test('cropSignature: bytes that are not WebP keep their sha256 and get no phash', async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  assertEquals(isWebp(png), false);
  assertEquals(await cropSignature(png), { image_hash: await sha256Hex(png), phash: null });
  const broken = LOSSY.slice(0, 40);
  assertEquals((await cropSignature(broken)).phash, null, 'a truncated WebP does not decode');
});
