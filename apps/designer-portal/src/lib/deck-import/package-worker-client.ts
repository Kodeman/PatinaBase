/**
 * Main-thread client for `package-worker.ts`. Separate from read-package.ts
 * because `import.meta.url` (the bundler's worker URL) does not load under jest.
 */
import type { PackageRequest, PackageResponse } from "./package-worker";
import {
  DeckImportError,
  checkDeckFile,
  type DeckRejectReason,
  type PackageReader,
} from "./read-package";

export async function openPackageInWorker(
  file: File,
): Promise<PackageReader & { close(): void }> {
  checkDeckFile(file);
  const worker = new Worker(new URL("./package-worker.ts", import.meta.url), {
    type: "module",
  });
  const pending = new Map<
    number,
    {
      resolve: (files: Map<string, Uint8Array>) => void;
      reject: (e: Error) => void;
    }
  >();
  let nextId = 1;
  let opened:
    | ((r: Extract<PackageResponse, { type: "opened" }>) => void)
    | null = null;
  let openFailed: ((e: Error) => void) | null = null;
  const toError = (r: Extract<PackageResponse, { type: "error" }>) =>
    new DeckImportError(r.reason as DeckRejectReason, r.detail);

  worker.onmessage = (event: MessageEvent<PackageResponse>) => {
    const r = event.data;
    if (r.type === "opened") opened?.(r);
    else if (r.type === "files") pending.get(r.id)?.resolve(new Map(r.files));
    else if (r.id == null) openFailed?.(toError(r));
    else pending.get(r.id)?.reject(toError(r));
    if (r.type !== "opened" && r.id != null) pending.delete(r.id);
  };
  const send = (message: PackageRequest) => worker.postMessage(message);

  try {
    const info = await new Promise<
      Extract<PackageResponse, { type: "opened" }>
    >((resolve, reject) => {
      opened = resolve;
      openFailed = reject;
      worker.onerror = (event) =>
        reject(new DeckImportError("zip_corrupt", event.message));
      send({ type: "open", name: file.name, file });
    });
    return {
      entries: info.entries,
      entryNames: new Set(info.entries.map((e) => e.name)),
      mainPart: info.mainPart,
      deck_sha256: info.deck_sha256,
      read: (names) =>
        new Promise((resolve, reject) => {
          const id = nextId++;
          pending.set(id, { resolve, reject });
          send({ type: "read", id, names: [...names] });
        }),
      close: () => worker.terminate(),
    };
  } catch (error) {
    worker.terminate();
    throw error;
  }
}
