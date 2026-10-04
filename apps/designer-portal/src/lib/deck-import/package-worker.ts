/**
 * Web Worker entry for the package pass (SQ-351: filtered `unzipSync` in a
 * worker, two passes). The worker holds the archive bytes; the main thread
 * asks for the XML names first, then for the referenced media, and gets the
 * inflated parts back as transferred buffers.
 */
import {
  DeckImportError,
  checkDeckFile,
  openPackage,
  type PackageReader,
  type ZipEntryInfo,
} from "./read-package";

export type PackageRequest =
  | { type: "open"; name: string; file: Blob }
  | { type: "read"; id: number; names: string[] };

export type PackageResponse =
  | {
      type: "opened";
      entries: ZipEntryInfo[];
      mainPart: string;
      deck_sha256: string;
    }
  | { type: "files"; id: number; files: Array<[string, Uint8Array]> }
  | { type: "error"; id?: number; reason: string; detail?: string };

type Post = (message: PackageResponse, transfer?: Transferable[]) => void;

function errorResponse(error: unknown, id?: number): PackageResponse {
  if (error instanceof DeckImportError)
    return { type: "error", id, reason: error.reason, detail: error.detail };
  return {
    type: "error",
    id,
    reason: "zip_corrupt",
    detail: error instanceof Error ? error.message : String(error),
  };
}

export function createPackageWorkerHandler(post: Post) {
  let reader: PackageReader | null = null;
  return async (message: PackageRequest): Promise<void> => {
    if (message.type === "open") {
      try {
        checkDeckFile({ name: message.name, size: message.file.size });
        reader = await openPackage(
          message.name,
          new Uint8Array(await message.file.arrayBuffer()),
        );
        post({
          type: "opened",
          entries: reader.entries,
          mainPart: reader.mainPart,
          deck_sha256: reader.deck_sha256,
        });
      } catch (error) {
        post(errorResponse(error));
      }
      return;
    }
    try {
      if (!reader)
        throw new DeckImportError("zip_corrupt", "package is not open");
      const files = [...(await reader.read(message.names)).entries()];
      post(
        { type: "files", id: message.id, files },
        files.map(([, data]) => data.buffer as ArrayBuffer),
      );
    } catch (error) {
      post(errorResponse(error, message.id));
    }
  };
}

interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<PackageRequest>) => void) | null;
}

const scope = globalThis as unknown as WorkerScope & {
  WorkerGlobalScope?: unknown;
  document?: unknown;
};
if (
  typeof scope.WorkerGlobalScope !== "undefined" &&
  typeof scope.document === "undefined"
) {
  const handle = createPackageWorkerHandler((message, transfer) =>
    scope.postMessage(message, transfer ?? []),
  );
  scope.onmessage = (event) => void handle(event.data);
}
