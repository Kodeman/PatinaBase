export interface CatalogProductSummary {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  retailCents: number | null;
  imageUrls: string[];
  shortDescription: string | null;
  patinaManaged: boolean;
  status: 'published';
}
