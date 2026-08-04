/**
 * Product Types Validation Tests
 * Tests type structure, mandatory fields, and type safety for product-related types
 */

import {
  Product,
  ProductImage,
  Dimensions,
  Weight,
  ProductAttribute,
  VendorProduct,
  ProductStatus,
  AttributeType,
} from '../product';

describe('Product Types', () => {
  describe('Product interface', () => {
    it('should allow valid product with all mandatory fields', () => {
      const validProduct: Product = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        slug: 'modern-sofa',
        name: 'Modern Sofa',
        brand: 'TestBrand',
        shortDescription: 'A modern comfortable sofa',
        category: 'sofa',
        categoryId: '123e4567-e89b-12d3-a456-426614174001',
        manufacturerId: '123e4567-e89b-12d3-a456-426614174002',
        price: 999.99,
        currency: 'USD',
        materials: ['fabric', 'wood'],
        colors: ['gray', 'beige'],
        styleTags: ['modern', 'minimalist'],
        status: 'published',
        has3D: false,
        arSupported: false,
        customizable: true,
        images: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(validProduct.id).toBeDefined();
      expect(validProduct.name).toBe('Modern Sofa');
      expect(validProduct.status).toBe('published');
    });

    it('should allow optional fields to be undefined', () => {
      const minimalProduct: Product = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        slug: 'minimal-product',
        name: 'Minimal Product',
        brand: 'TestBrand',
        shortDescription: 'Short desc',
        category: 'chair',
        manufacturerId: '123e4567-e89b-12d3-a456-426614174002',
        price: 99.99,
        currency: 'USD',
        materials: [],
        colors: [],
        styleTags: [],
        status: 'draft',
        has3D: false,
        arSupported: false,
        customizable: false,
        images: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(minimalProduct.longDescription).toBeUndefined();
      expect(minimalProduct.dimensions).toBeUndefined();
      expect(minimalProduct.coverImage).toBeUndefined();
    });

    it('should support all ProductStatus values', () => {
      const statuses: ProductStatus[] = ['draft', 'in_review', 'published', 'deprecated'];

      statuses.forEach((status) => {
        const product: Partial<Product> = {
          status,
        };
        expect(product.status).toBe(status);
      });
    });

    it('should support pricing fields correctly', () => {
      const productWithSale: Partial<Product> = {
        price: 999.99,
        msrp: 1299.99,
        salePrice: 799.99,
        salePriceStart: new Date('2024-01-01'),
        salePriceEnd: new Date('2024-12-31'),
        currency: 'USD',
      };

      expect(productWithSale.salePrice).toBeLessThan(productWithSale.price!);
      expect(productWithSale.salePrice).toBeLessThan(productWithSale.msrp!);
    });

    it('should support compliance fields', () => {
      const productWithCompliance: Partial<Product> = {
        fragile: true,
        flammability: 'low',
        careInstructions: 'Clean with damp cloth',
        ageRestricted: false,
      };

      expect(productWithCompliance.fragile).toBe(true);
      expect(productWithCompliance.ageRestricted).toBe(false);
    });

    it('should support SEO fields', () => {
      const productWithSEO: Partial<Product> = {
        seoTitle: 'Buy Modern Sofa Online',
        seoDescription: 'Shop our collection of modern sofas',
        seoKeywords: ['sofa', 'modern', 'furniture'],
      };

      expect(productWithSEO.seoKeywords).toHaveLength(3);
    });
  });

  describe('ProductImage interface', () => {
    it('should validate product image structure', () => {
      const image: ProductImage = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        url: 'https://cdn.example.com/sofa-1.jpg',
        alt: 'Modern gray sofa front view',
        order: 1,
        isPrimary: true,
      };

      expect(image.id).toBeDefined();
      expect(image.url).toContain('https://');
      expect(image.isPrimary).toBe(true);
    });
  });

  describe('Dimensions interface', () => {
    it('should validate dimensions in cm', () => {
      const dimensions: Dimensions = {
        width: 200,
        height: 80,
        depth: 90,
        unit: 'cm',
      };

      expect(dimensions.unit).toBe('cm');
      expect(dimensions.width).toBeGreaterThan(0);
    });

    it('should validate dimensions in inches', () => {
      const dimensions: Dimensions = {
        width: 84,
        height: 32,
        depth: 36,
        unit: 'inch',
      };

      expect(dimensions.unit).toBe('inch');
    });
  });

  describe('Weight interface', () => {
    it('should validate weight in kg', () => {
      const weight: Weight = {
        value: 50,
        unit: 'kg',
      };

      expect(weight.unit).toBe('kg');
      expect(weight.value).toBeGreaterThan(0);
    });

    it('should validate weight in lb', () => {
      const weight: Weight = {
        value: 110,
        unit: 'lb',
      };

      expect(weight.unit).toBe('lb');
    });
  });

  describe('ProductAttribute interface', () => {
    it('should validate product attribute structure', () => {
      const attribute: ProductAttribute = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        productId: '123e4567-e89b-12d3-a456-426614174001',
        definitionId: '123e4567-e89b-12d3-a456-426614174002',
        value: '32 inches',
      };

      expect(attribute.productId).toBeDefined();
      expect(attribute.definitionId).toBeDefined();
      expect(attribute.value).toBe('32 inches');
    });

    it('should support optional variant association', () => {
      const variantAttribute: ProductAttribute = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        productId: '123e4567-e89b-12d3-a456-426614174001',
        variantId: '123e4567-e89b-12d3-a456-426614174003',
        definitionId: '123e4567-e89b-12d3-a456-426614174002',
        value: 'Navy Blue',
      };

      expect(variantAttribute.variantId).toBeDefined();
    });

    it('should support populated definition relation', () => {
      const attributeWithDef: ProductAttribute = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        productId: '123e4567-e89b-12d3-a456-426614174001',
        definitionId: '123e4567-e89b-12d3-a456-426614174002',
        value: 84,
        definition: {
          code: 'seat_width',
          name: 'Seat Width',
          type: 'NUMBER',
          unit: 'cm',
          displayUnit: 'cm',
        },
      };

      expect(attributeWithDef.definition?.code).toBe('seat_width');
      expect(attributeWithDef.definition?.type).toBe('NUMBER');
    });
  });

  describe('AttributeType', () => {
    it('should support all modern attribute types', () => {
      const types: AttributeType[] = [
        'TEXT',
        'NUMBER',
        'BOOLEAN',
        'SELECT',
        'MULTISELECT',
        'COLOR',
        'DIMENSION',
        'DATE',
        'URL',
        'EMAIL',
      ];

      types.forEach((type) => {
        const attr: Partial<ProductAttribute> = {
          definition: {
            code: 'test',
            name: 'Test',
            type,
          },
        };
        expect(attr.definition?.type).toBe(type);
      });
    });

    it('should support legacy attribute types for backward compatibility', () => {
      const legacyTypes: AttributeType[] = [
        'string',
        'number',
        'boolean',
        'enum',
        'color',
        'dimension',
        'json',
      ];

      legacyTypes.forEach((type) => {
        const attr: Partial<ProductAttribute> = {
          definition: {
            code: 'legacy',
            name: 'Legacy',
            type,
          },
        };
        expect(attr.definition?.type).toBe(type);
      });
    });
  });

  describe('VendorProduct interface', () => {
    it('should validate vendor product link', () => {
      const vendorProduct: VendorProduct = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        vendorId: '123e4567-e89b-12d3-a456-426614174001',
        productId: '123e4567-e89b-12d3-a456-426614174002',
        vendorSku: 'VENDOR-SKU-123',
      };

      expect(vendorProduct.vendorSku).toBe('VENDOR-SKU-123');
    });

    it('should support optional fields for vendor products', () => {
      const vendorProduct: VendorProduct = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        vendorId: '123e4567-e89b-12d3-a456-426614174001',
        productId: '123e4567-e89b-12d3-a456-426614174002',
        vendorSku: 'VENDOR-SKU-123',
        vendorName: 'Test Vendor',
        variantId: '123e4567-e89b-12d3-a456-426614174003',
        cost: 500.0,
        availabilityStatus: 'in_stock',
        leadTimeDays: 14,
        lastSyncedAt: new Date(),
      };

      expect(vendorProduct.vendorName).toBe('Test Vendor');
      expect(vendorProduct.leadTimeDays).toBe(14);
      expect(vendorProduct.cost).toBe(500.0);
    });
  });

  describe('Type safety validations', () => {
    it('should ensure Product category is type-safe', () => {
      const product: Partial<Product> = {
        category: 'sofa',
      };

      // This should compile - valid category
      expect(['sofa', 'chair', 'table', 'bed', 'storage', 'lighting', 'decor', 'outdoor']).toContain(
        product.category,
      );
    });

    it('should ensure arrays are properly typed', () => {
      const product: Partial<Product> = {
        materials: ['wood', 'fabric', 'metal'],
        colors: ['gray', 'beige', 'navy'],
        styleTags: ['modern', 'minimalist'],
        tags: ['bestseller', 'new'],
      };

      expect(product.materials).toBeInstanceOf(Array);
      expect(product.colors).toBeInstanceOf(Array);
      expect(product.styleTags).toBeInstanceOf(Array);
      expect(product.tags).toBeInstanceOf(Array);
    });
  });
});
