import qrcode from 'qrcode-generator'

/**
 * The pinned symbol version. Version 9 is a 53×53 grid (17 + 4·9), and at
 * error-correction level Q it holds 130 bytes of byte-mode data — comfortably
 * more than the ~128-byte `patina://auth?…` payload the QR rail mints.
 *
 * Pinning the version matters visually: the badge's geometry (quiet zone,
 * finder marks, monogram disc) is drawn against a known module count, so the
 * art stays identical from one refresh to the next.
 */
const PINNED_TYPE_NUMBER = 9

/**
 * Level Q recovers ~25% of the symbol. That budget is what lets the monogram
 * disc sit over the middle without excavating modules underneath it.
 */
const ERROR_CORRECTION_LEVEL = 'Q'

/** Module count of the pinned version — 17 + 4 × 9. */
export const PINNED_QR_MODULE_COUNT = 53

export interface QrMatrix {
  /** Modules per side. 53 whenever the payload fits the pinned version. */
  size: number
  /** Row-major dark-module flags: `rows[row][col]` is true where the module is dark. */
  rows: boolean[][]
  /** False when the payload overflowed the pinned version and an auto version was used. */
  pinned: boolean
}

function encode(typeNumber: 0 | 9, value: string) {
  const code = qrcode(typeNumber, ERROR_CORRECTION_LEVEL)
  code.addData(value)
  code.make()
  return code
}

/**
 * Pure, deterministic QR encoder: the same string always yields the same grid.
 *
 * No React, no DOM, no time — the badge memoizes on the url and draws whatever
 * comes back. If a payload ever outgrows the pinned version, the encoder falls
 * back to an auto-sized symbol rather than throwing at render time; callers
 * read `size` instead of assuming 53.
 */
export function buildQrMatrix(value: string): QrMatrix {
  let code: ReturnType<typeof encode>
  let pinned = true
  try {
    code = encode(PINNED_TYPE_NUMBER, value)
  } catch {
    pinned = false
    code = encode(0, value)
  }

  const size = code.getModuleCount()
  const rows: boolean[][] = []
  for (let row = 0; row < size; row += 1) {
    const cells: boolean[] = []
    for (let column = 0; column < size; column += 1) {
      cells.push(code.isDark(row, column))
    }
    rows.push(cells)
  }

  return { size, rows, pinned }
}
