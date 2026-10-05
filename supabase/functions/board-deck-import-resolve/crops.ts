// Signing pin pictures for the embedder (pairing and the look tier).
//
// The signature is made with the service role, so a picture is signed only
// where its board keeps it (resolveBoardCropReference): the proposal bucket
// for a proposal board, `{project}/boards/{board}/…` in the working bucket for
// a project board. The board and its project come from the database.

import { type BoardCropScope, resolveBoardCropReference } from "../board-asset-cleanup/core.ts";

export type SignObject = (bucket: string, path: string) => Promise<string | null>;

export interface CropRow {
  item_id: string;
  import_id: string;
  /** The pin's stored image reference, as read from the database. */
  image: unknown;
}

/** item_id → signed URL, for the rows whose picture resolves and signs. */
export async function signCrops(
  rows: CropRow[],
  scopeFor: (importId: string) => Promise<BoardCropScope>,
  sign: SignObject,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const row of rows) {
    const crop = resolveBoardCropReference(row.image, await scopeFor(row.import_id));
    if (!crop) continue;
    const url = await sign(crop.bucket, crop.path);
    if (url) out.set(row.item_id, url);
  }
  return out;
}
