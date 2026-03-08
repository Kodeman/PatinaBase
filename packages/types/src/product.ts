import { UUID, Timestamps } from './common';

export type ProductCategory =
  | 'sofa'
  | 'chair'
  | 'table'
  | 'bed'
  | 'storage'
  | 'lighting'
  | 'decor'
  | 'outdoor';

export type ProductStatus = 'draft' | 'in_review' | 'published' | 'deprecated';

export type AvailabilityStatus = 'in_stock' | 'out_of_stock' | 'preorder' | 'discontinued' | 'backorder';

export interface Product extends Timestamps {
  id: UUID;
  slug: string;
  externalId?: string;
  name: string;
  brand: string;
  shortDescription: string;
  longDescription?: string;
  category: ProductCategory;
  categoryId?: UUID;
  manufacturerId: UUID;

  // Pricing
  price: number;
  msrp?: number;
  salePrice?: number;
  salePriceStart?: Date;
  salePriceEnd?: Date;
  currency: string;

  // Physical properties
  dimensions?: Dimensions;
  weight?: Weight;
  materials: string[];
  colors: string[];
  styleTags: string[];

  // Features
  status: ProductStatus;
  has3D: boolean;
  arSupported: boolean;
  customizable: boolean;
  customizationOptions?: CustomizationOption[];

  // Media
  images: ProductImage[];
  coverImage?: string;

  // SEO
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string[];

  // Publishing
  publishedAt?: Date;
  version?: number;

  // Lifecycle management
  reviewedBy?: UUID;
  reviewedAt?: Date;
  reviewNotes?: string;
  scheduledPublishAt?: Date;
  scheduledUnpublishAt?: Date;
  restoredFromVersion?: number;

  // Compliance
  fragile?: boolean;
  flammability?: string;
  careInstructions?: string;
  ageRestricted?: boolean;

  // Relations
  variants?: Variant[];
  attributes?: ProductAttribute[];
  vendorLinks?: VendorProduct[];
  tags?: string[];
  versions?: ProductVersion[];
}

export interface ProductImage {
  id: UUID;
  url: string;
  alt: string;
  order: number;
  isPrimary: boolean;
}

export interface Dimensions {
  width: number;
  height: number;
  depth: number;
  unit: 'cm' | 'inch';
}

export interface Weight {
  value: number;
  unit: 'kg' | 'lb';
}

export interface Variant {
  id: UUID;
  productId: UUID;
  sku: string;
  barcode?: string;
  name?: string;
  options: Record<string, string>; // { color: "Walnut", size: "84in", fabric: "Linen" }

  // Pricing overrides
  price?: number;
  salePrice?: number;
  currency?: string;

  // Availability
  availabilityStatus: AvailabilityStatus;
  quantity?: number;
  leadTimeDays?: number;

  // Physical overrides
  dimensions?: Dimensions;
  weight?: Weight;
  materials?: string[];
  colors?: string[];

  // Media
  images?: ProductImage[];
  has3D?: boolean;
  arSupported?: boolean;
}

export interface ProductAttribute {
  id: UUID;
  productId: UUID;
  variantId?: UUID;
  definitionId: UUID; // References AttributeDefinition
  value: any; // Typed value based on AttributeDefinition
  createdAt?: Date;
  updatedAt?: Date;
  // Optional populated relations
  definition?: {
    code: string;
    name: string;
    type: AttributeType;
    unit?: string;
    displayUnit?: string;
  };
}

export type AttributeType =
  | 'TEXT'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'SELECT'
  | 'MULTISELECT'
  | 'COLOR'
  | 'DIMENSION'
  | 'DATE'
  | 'URL'
  | 'EMAIL'
  // Legacy support
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'color'
  | 'dimension'
  | 'json';

export interface VendorProduct {
  id: UUID;
  vendorId: UUID;
  vendorName?: string;
  productId: UUID;
  variantId?: UUID;
  vendorSku: string;
  cost?: number;
  availabilityStatus?: AvailabilityStatus;
  leadTimeDays?: number;
  lastSyncedAt?: Date;
}

export interface CustomizationOption {
  id: UUID;
  name: string;
  type: 'color' | 'material' | 'size' | 'finish';
  options: CustomizationValue[];
  priceModifier?: number;
}

export interface CustomizationValue {
  id: UUID;
  value: string;
  displayName: string;
  priceModifier: number;
  imageUrl?: string;
}

export interface ProductVersion {
  id: UUID;
  productId: UUID;
  version: number;
  snapshotData: Record<string, any>; // Full product data at this version
  createdAt: Date;
  createdBy?: UUID;
  parentVersion?: number; // Previous version number
  product?: Product;
}
