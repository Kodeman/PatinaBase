import { loadCompositionImage } from "./image-loader.ts";

/**
 * Hydrate a studio logo through the same SSRF-guarded, size-capped PNG/JPEG
 * loader used by composition exports. Unsupported formats such as SVG are
 * omitted from PDFs; the textual studio byline remains in the header.
 */
export async function preparePdfStudioLogo(
  logoUrl: string | undefined,
  loader: (url: string) => Promise<string> = loadCompositionImage,
): Promise<string | undefined> {
  if (!logoUrl) return undefined;
  try {
    return await loader(logoUrl);
  } catch (error) {
    console.warn(
      "spec-pdf: studio logo omitted",
      error instanceof Error ? error.message : String(error),
    );
    return undefined;
  }
}
