/**
 * Free-text → product fields. Used by selection capture (right-click a block of
 * text on a page) and reuses the same pure string parsers as the DOM extractor.
 */
import { extractPriceFromString } from './extraction/price';
import { extractWxHxD, extractLabeledDimensions } from './extraction/dimensions';
import { extractMaterialsFromText } from './extraction/materials';

export interface TextFields {
  name?: string;
  price?: NonNullable<ReturnType<typeof extractPriceFromString>>;
  // extractWxHxD returns full dims, extractLabeledDimensions a partial set.
  dimensions?: NonNullable<ReturnType<typeof extractLabeledDimensions>>;
  materials?: string[];
}

export function textToFields(text: string): TextFields {
  const fields: TextFields = {};

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
