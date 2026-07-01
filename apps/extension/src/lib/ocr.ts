/**
 * OCR for snapshots / image-only captures (X1 + R2). The text→fields mapping
 * reuses the existing pure string parsers; the recognizer lazy-loads
 * tesseract.js from bundled assets (CDN is CSP-blocked) and degrades silently if
 * the assets aren't present, so OCR is strictly additive pre-fill.
 *
 * NOTE: runtime OCR needs the `tesseract/` assets (worker.min.js, the SIMD wasm
 * core, and eng.traineddata.gz) bundled via web_accessible_resources, plus a
 * device pass — until then runOcr returns null and capture is unaffected.
 */
import { extractPriceFromString } from './extraction/price';
import { extractWxHxD, extractLabeledDimensions } from './extraction/dimensions';
import { extractMaterialsFromText } from './extraction/materials';

export interface OcrFields {
  name?: string;
  price?: NonNullable<ReturnType<typeof extractPriceFromString>>;
  // extractWxHxD returns full dims, extractLabeledDimensions a partial set.
  dimensions?: NonNullable<ReturnType<typeof extractLabeledDimensions>>;
  materials?: string[];
}

/** Map raw OCR text onto the same field parsers the DOM extractor uses. */
export function ocrTextToFields(text: string): OcrFields {
  const fields: OcrFields = {};

  const price = extractPriceFromString(text);
  if (price) fields.price = price;

  const dims = extractWxHxD(text) ?? extractLabeledDimensions(text);
  if (dims) fields.dimensions = dims;

  const materials = extractMaterialsFromText(text);
  if (materials.length) fields.materials = materials;

  const name = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 3 && !l.includes('$') && !/^[\d.]/.test(l));
  if (name) fields.name = name;

  return fields;
}

const TIMEOUT_MS = 15000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('OCR timed out')), ms)),
  ]);
}

/**
 * Recognize text in an image and map it to fields. Returns null on any
 * failure (missing assets, unsupported wasm, timeout, low-quality scan).
 */
export async function runOcr(imageSource: string | Blob): Promise<OcrFields | null> {
  try {
    const tesseract = (await import('tesseract.js')) as typeof import('tesseract.js');
    const worker = await tesseract.createWorker('eng', 1, {
      workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
      corePath: chrome.runtime.getURL('tesseract/'),
      langPath: chrome.runtime.getURL('tesseract/lang'),
      workerBlobURL: false,
      cacheMethod: 'none',
    });
    try {
      const { data } = await withTimeout(worker.recognize(imageSource), TIMEOUT_MS);
      return ocrTextToFields(data.text ?? '');
    } finally {
      await worker.terminate();
    }
  } catch (e) {
    console.warn('[Patina] OCR unavailable:', e);
    return null;
  }
}
