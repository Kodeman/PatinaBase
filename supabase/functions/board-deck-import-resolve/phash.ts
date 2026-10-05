// board-deck-import-resolve · the crop's perceptual hash (PURE).
//
// Choice: a 64-bit difference hash (dHash), not the DCT pHash. The picture is
// reduced to 9×8 luma by box averaging (each cell is the mean of its source
// rectangle) and each bit says whether a cell is darker than its right-hand
// neighbour. It needs no DCT, is a few dozen lines, survives the rescaling and
// recompression a picture goes through between a retailer page and a deck,
// and its Hamming distance reads on the same ≤6-of-64 scale the plan's T1
// rule uses. Transparent pixels are flattened onto neutral grey first (the
// same treatment the pipeline plan gives the embed copy), so a cut-out
// product on alpha hashes the same over any background.
//
// The 64 bits travel as a signed decimal string: Postgres bigint is signed,
// and a JS number cannot hold 64 bits.

/** A crop's identity (crop_signature.ts computes it from the bytes). */
export interface CropSignature {
  /** sha256 of the crop bytes, hex. */
  image_hash: string;
  /** 64-bit dHash as Postgres bigint text; null when the bytes did not decode
   *  or the hash is degenerate (isDegenerateHash). */
  phash: string | null;
}

const GREY = 128;
const COLS = 9;
const ROWS = 8;

/** RGBA pixels (row-major, 4 bytes each) → 64-bit dHash as an unsigned bigint. */
export function dHash(rgba: ArrayLike<number>, width: number, height: number): bigint {
  if (!(width > 0 && height > 0) || rgba.length < width * height * 4) {
    throw new Error('dHash needs width × height RGBA pixels');
  }
  const cells = new Float64Array(COLS * ROWS);
  for (let row = 0; row < ROWS; row++) {
    const y0 = Math.min(Math.floor((row * height) / ROWS), height - 1);
    const y1 = Math.max(Math.floor(((row + 1) * height) / ROWS), y0 + 1);
    for (let col = 0; col < COLS; col++) {
      const x0 = Math.min(Math.floor((col * width) / COLS), width - 1);
      const x1 = Math.max(Math.floor(((col + 1) * width) / COLS), x0 + 1);
      let sum = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          const a = rgba[i + 3] / 255;
          const r = rgba[i] * a + GREY * (1 - a);
          const g = rgba[i + 1] * a + GREY * (1 - a);
          const b = rgba[i + 2] * a + GREY * (1 - a);
          sum += 0.299 * r + 0.587 * g + 0.114 * b;
        }
      }
      cells[row * COLS + col] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  let hash = 0n;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS - 1; col++) {
      hash = (hash << 1n) | (cells[row * COLS + col] < cells[row * COLS + col + 1] ? 1n : 0n);
    }
  }
  return hash;
}

/** Number of differing bits between two 64-bit hashes. */
export function hamming(a: bigint, b: bigint): number {
  let x = BigInt.asUintN(64, a ^ b);
  let count = 0;
  while (x) {
    x &= x - 1n;
    count++;
  }
  return count;
}

/** A uniform or low-entropy picture (a paint chip, a solid swatch) hashes to
 *  0, all ones or nearly so: such a hash says nothing about which product it
 *  is, so it is never an identity. Mirrored in SQL (00686): teach stores NULL
 *  and board_deck_import_match_phash skips popcount outside 8..56. */
export function isDegenerateHash(hash: bigint): boolean {
  const bits = hamming(hash, 0n);
  return bits < 8 || bits > 56;
}

/** The hash as Postgres bigint text (signed two's complement). */
export function toPgBigint(hash: bigint): string {
  return BigInt.asIntN(64, hash).toString();
}
