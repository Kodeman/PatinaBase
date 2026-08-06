/**
 * The ONLY file in the portal that touches a PDF library.
 *
 * Every pdfjs-dist / pdf-lib reference is a dynamic `await import(...)` INSIDE a
 * function on purpose: the module's top level must stay inert so nothing pulls
 * a DOM-dependent PDF runtime into the server or the Cloudflare Worker bundle.
 * A source-text contract test (src/lib/document/__tests__/plan-room-contract.
 * test.ts) pins the absence of any top-level import of either package.
 *
 * The worker file is copied to public/vendor/pdfjs by the `sync-pdf-worker`
 * script, which runs on predev and prebuild — it is generated, never committed.
 */

/** Normalized text run: x/y are 0..1 with the origin at the page's TOP-left. */
export interface ParsedPdfTextItem {
  str: string;
  x: number;
  y: number;
}

export interface ParsedPdfPage {
  pageIndex: number;
  items: ParsedPdfTextItem[];
  /** The joined text layer. Empty when the page carries no text at all. */
  text: string;
}

export interface LoadedPdf {
  bytes: Uint8Array;
  pageCount: number;
  pages: ParsedPdfPage[];
}

const WORKER_SRC = '/vendor/pdfjs/pdf.worker.min.mjs';
let workerConfigured = false;

/** Idempotent: pdfjs keeps one global worker setting per document lifetime. */
export async function configurePdfWorker(): Promise<void> {
  if (workerConfigured) return;
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
  workerConfigured = true;
}

/** Read every page's text layer. The bytes are returned for later page cuts. */
export async function loadPdfPages(file: File): Promise<LoadedPdf> {
  await configurePdfWorker();
  const pdfjs = await import('pdfjs-dist');
  const bytes = new Uint8Array(await file.arrayBuffer());

  // getDocument transfers/detaches the buffer it is handed, so it gets a copy
  // and `bytes` stays usable for extractSinglePagePdf.
  const document = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const pages: ParsedPdfPage[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const width = viewport.width || 1;
    const height = viewport.height || 1;
    const content = await page.getTextContent();

    const items: ParsedPdfTextItem[] = [];
    for (const raw of content.items) {
      const item = raw as { str?: string; transform?: number[] };
      const str = (item.str ?? '').trim();
      if (!str) continue;
      const transform = item.transform ?? [];
      const x = Number(transform[4] ?? 0) / width;
      // pdfjs' origin is bottom-left; the model reads y from the top.
      const y = 1 - Number(transform[5] ?? 0) / height;
      items.push({
        str,
        x: Math.min(1, Math.max(0, x)),
        y: Math.min(1, Math.max(0, y)),
      });
    }

    pages.push({
      pageIndex: pageNumber - 1,
      items,
      text: items.map((item) => item.str).join(' '),
    });
    page.cleanup();
  }

  const pageCount = document.numPages;
  await document.destroy();
  return { bytes, pageCount, pages };
}

/** A display-only thumbnail. The caller owns the blob URL and revokes it. */
export async function renderPageThumbnail(
  bytes: Uint8Array,
  pageIndex: number,
  targetWidth = 280,
): Promise<Blob> {
  await configurePdfWorker();
  const pdfjs = await import('pdfjs-dist');
  const document = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  try {
    const page = await document.getPage(pageIndex + 1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: targetWidth / (base.width || 1) });
    const canvas = window.document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d context for the thumbnail');
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    page.cleanup();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (!blob) throw new Error('the thumbnail could not be drawn');
    return blob;
  } finally {
    await document.destroy();
  }
}

/** One page of a multi-page set, cut out as its own PDF — a print's bytes. */
export async function extractSinglePagePdf(
  bytes: Uint8Array,
  pageIndex: number,
): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const source = await PDFDocument.load(bytes.slice());
  const target = await PDFDocument.create();
  const [page] = await target.copyPages(source, [pageIndex]);
  target.addPage(page);
  return target.save();
}

/** Lowercase hex sha256 — the shape every plan-room CHECK constraint expects. */
export async function sha256Hex(bytes: Uint8Array | string): Promise<string> {
  const data =
    typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
