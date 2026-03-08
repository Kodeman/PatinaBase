/**
 * Catalog Types Validation Tests
 * Tests type structure for categories, collections, vendors, attributes, and media
 */

import {
  Category,
  Collection,
  CollectionType,
  CollectionItem,
  CollectionRule,
  RuleCondition,
  MediaAsset,
  MediaType,
  MediaRole,
  MediaStatus,
  MediaRendition,
  Vendor,
  ManufacturerAddress,
  AttributeGroup,
  AttributeDefinition,
  AttributeValidation,
  AttributeOption,
  ImportJob,
  ImportSource,
  ImportStatus,
  ImportStats,
  ImportError,
  SearchQuery,
  DimensionFilter,
  AttributeFilter,
  SortOption,
  SearchResult,
  SearchFacets,
  CatalogRecommendationRequest,
  RecommendationStrategy,
  RecommendationResult,
  ValidationIssue,
} from '../catalog';

describe('Catalog Types', () => {
  describe('Category interface', () => {
    it('should validate category with all mandatory fields', () => {
      const category: Category = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Sectionals',
        slug: 'sectionals',
        path: '/living-room/sofas/sectionals',
        depth: 2,
        order: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(category.name).toBe('Sectionals');
      expect(category.depth).toBe(2);
      expect(category.isActive).toBe(true);
    });

    it('should support hierarchical structure', () => {
      const parentCategory: Category = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Living Room',
        slug: 'living-room',
        path: '/living-room',
        depth: 0,
        order: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const childCategory: Category = {
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Sofas',
        slug: 'sofas',
        parentId: parentCategory.id,
        parent: parentCategory,
        path: '/living-room/sofas',
        depth: 1,
        order: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(childCategory.parentId).toBe(parentCategory.id);
      expect(childCategory.depth).toBe(parentCategory.depth + 1);
    });

    it('should support SEO fields', () => {
      const category: Partial<Category> = {
        seoTitle: 'Shop Sectional Sofas | Custom Furniture',
        seoDescription: 'Browse our collection of sectional sofas',
      };

      expect(category.seoTitle).toBeDefined();
      expect(category.seoDescription).toBeDefined();
    });

    it('should support required attributes', () => {
      const category: Partial<Category> = {
        requiredAttributes: ['seat_depth', 'seat_width', 'arm_height'],
      };

      expect(category.requiredAttributes).toHaveLength(3);
    });
  });

  describe('Collection interface', () => {
    it('should validate manual collection', () => {
      const collection: Collection = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Summer Sale 2024',
        slug: 'summer-sale-2024',
        type: 'manual',
        status: 'published',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(collection.type).toBe('manual');
      expect(collection.status).toBe('published');
    });

    it('should support all CollectionType values', () => {
      const types: CollectionType[] = ['manual', 'rule', 'smart'];

      types.forEach((type) => {
        const collection: Partial<Collection> = { type };
        expect(collection.type).toBe(type);
      });
    });

    it('should support all collection statuses', () => {
      const statuses: ('draft' | 'published' | 'scheduled')[] = ['draft', 'published', 'scheduled'];

      statuses.forEach((status) => {
        const collection: Partial<Collection> = { status };
        expect(collection.status).toBe(status);
      });
    });

    it('should support scheduled publishing', () => {
      const collection: Partial<Collection> = {
        status: 'scheduled',
        scheduledPublishAt: new Date('2024-06-01'),
      };

      expect(collection.status).toBe('scheduled');
      expect(collection.scheduledPublishAt).toBeDefined();
    });

    it('should support collection items for manual collections', () => {
      const item: CollectionItem = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        collectionId: '123e4567-e89b-12d3-a456-426614174001',
        productId: '123e4567-e89b-12d3-a456-426614174002',
        displayOrder: 1,
        addedAt: new Date(),
      };

      expect(item.displayOrder).toBe(1);
      expect(item.productId).toBeDefined();
    });

    it('should support collection rules for rule-based collections', () => {
      const rule: CollectionRule = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        collectionId: '123e4567-e89b-12d3-a456-426614174001',
        operator: 'AND',
        conditions: [],
      };

      expect(rule.operator).toBe('AND');
    });
  });

  describe('RuleCondition interface', () => {
    it('should validate equals condition', () => {
      const condition: RuleCondition = {
        field: 'category',
        operator: 'equals',
        value: 'sofa',
      };

      expect(condition.operator).toBe('equals');
    });

    it('should support all operators', () => {
      const operators: RuleCondition['operator'][] = [
        'equals',
        'not_equals',
        'contains',
        'in',
        'not_in',
        'greater_than',
        'less_than',
        'between',
      ];

      operators.forEach((operator) => {
        const condition: RuleCondition = {
          field: 'price',
          operator,
          value: 1000,
        };
        expect(condition.operator).toBe(operator);
      });
    });

    it('should support complex value types', () => {
      const conditionWithArray: RuleCondition = {
        field: 'brand',
        operator: 'in',
        value: ['BrandA', 'BrandB', 'BrandC'],
      };

      const conditionWithRange: RuleCondition = {
        field: 'price',
        operator: 'between',
        value: { min: 500, max: 1000 },
      };

      expect(Array.isArray(conditionWithArray.value)).toBe(true);
      expect(conditionWithRange.value.min).toBe(500);
    });
  });

  describe('MediaAsset interface', () => {
    it('should validate media asset with all mandatory fields', () => {
      const media: MediaAsset = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'image',
        role: 'hero',
        originalUrl: 'https://storage.example.com/original/sofa.jpg',
        storageKey: 'products/sofa-hero-1.jpg',
        filename: 'sofa.jpg',
        mimeType: 'image/jpeg',
        size: 1024000,
        status: 'ready',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(media.type).toBe('image');
      expect(media.status).toBe('ready');
    });

    it('should support all MediaType values', () => {
      const types: MediaType[] = ['image', 'video', 'model3d', 'document'];

      types.forEach((type) => {
        const media: Partial<MediaAsset> = { type };
        expect(media.type).toBe(type);
      });
    });

    it('should support all MediaRole values', () => {
      const roles: MediaRole[] = [
        'hero',
        'angle',
        'lifestyle',
        'detail',
        'ar_preview',
        'thumbnail',
        'swatch',
      ];

      roles.forEach((role) => {
        const media: Partial<MediaAsset> = { role };
        expect(media.role).toBe(role);
      });
    });

    it('should support all MediaStatus values', () => {
      const statuses: MediaStatus[] = ['pending', 'processing', 'ready', 'failed', 'expired'];

      statuses.forEach((status) => {
        const media: Partial<MediaAsset> = { status };
        expect(media.status).toBe(status);
      });
    });

    it('should support image-specific properties', () => {
      const media: Partial<MediaAsset> = {
        width: 1920,
        height: 1080,
        phash: 'abc123def456',
        palette: ['#FFFFFF', '#000000', '#808080'],
      };

      expect(media.width).toBe(1920);
      expect(media.palette).toHaveLength(3);
    });

    it('should support video-specific properties', () => {
      const media: Partial<MediaAsset> = {
        type: 'video',
        duration: 120,
        format: 'mp4',
      };

      expect(media.type).toBe('video');
      expect(media.duration).toBe(120);
    });

    it('should support CDN and renditions', () => {
      const rendition: MediaRendition = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        mediaAssetId: '123e4567-e89b-12d3-a456-426614174001',
        name: 'thumbnail',
        url: 'https://cdn.example.com/thumb.jpg',
        width: 200,
        height: 200,
        size: 10240,
        format: 'jpeg',
      };

      const media: Partial<MediaAsset> = {
        cdnUrl: 'https://cdn.example.com/sofa.jpg',
        thumbnailUrl: 'https://cdn.example.com/sofa-thumb.jpg',
        renditions: [rendition],
      };

      expect(media.renditions).toHaveLength(1);
      expect(media.renditions![0].name).toBe('thumbnail');
    });
  });

  describe('Vendor interface', () => {
    it('should validate vendor with all mandatory fields', () => {
      const vendor: Vendor = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Manufacturer',
        slug: 'test-manufacturer',
        code: 'TEST-001',
        apiEnabled: false,
        syncEnabled: false,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(vendor.code).toBe('TEST-001');
      expect(vendor.status).toBe('active');
    });

    it('should support all vendor statuses', () => {
      const statuses: ('active' | 'inactive' | 'suspended')[] = ['active', 'inactive', 'suspended'];

      statuses.forEach((status) => {
        const vendor: Partial<Vendor> = { status };
        expect(vendor.status).toBe(status);
      });
    });

    it('should support contact information', () => {
      const vendor: Partial<Vendor> = {
        contactName: 'John Doe',
        contactEmail: 'john@manufacturer.com',
        contactPhone: '+1-555-0100',
      };

      expect(vendor.contactEmail).toContain('@');
    });

    it('should support business terms', () => {
      const vendor: Partial<Vendor> = {
        leadTimeDays: 14,
        minimumOrderValue: 1000,
        shippingTerms: 'FOB',
        paymentTerms: 'Net 30',
        returnPolicyUrl: 'https://manufacturer.com/returns',
      };

      expect(vendor.leadTimeDays).toBe(14);
      expect(vendor.paymentTerms).toBe('Net 30');
    });

    it('should support API integration', () => {
      const vendor: Partial<Vendor> = {
        apiEnabled: true,
        apiEndpoint: 'https://api.manufacturer.com/v1',
        syncEnabled: true,
        lastSyncAt: new Date(),
      };

      expect(vendor.apiEnabled).toBe(true);
      expect(vendor.syncEnabled).toBe(true);
    });

    it('should support address', () => {
      const address: ManufacturerAddress = {
        street1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'USA',
      };

      const vendor: Partial<Vendor> = {
        address,
      };

      expect(vendor.address?.city).toBe('New York');
    });
  });

  describe('AttributeDefinition and AttributeGroup', () => {
    it('should validate attribute group', () => {
      const group: AttributeGroup = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        code: 'dimensions',
        name: 'Dimensions',
        sortOrder: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(group.code).toBe('dimensions');
      expect(group.isActive).toBe(true);
    });

    it('should validate attribute definition', () => {
      const definition: AttributeDefinition = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        code: 'seat_depth',
        name: 'Seat Depth',
        type: 'DIMENSION',
        isRequired: false,
        requiredCategories: [],
        sortOrder: 1,
        isFilterable: true,
        isSearchable: false,
        showInDetails: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(definition.code).toBe('seat_depth');
      expect(definition.type).toBe('DIMENSION');
      expect(definition.isFilterable).toBe(true);
    });

    it('should support validation rules', () => {
      const validation: AttributeValidation = {
        min: 0,
        max: 1000,
        precision: 2,
        allowNegative: false,
        customMessage: 'Value must be between 0 and 1000',
      };

      const definition: Partial<AttributeDefinition> = {
        validation,
      };

      expect(definition.validation?.min).toBe(0);
      expect(definition.validation?.max).toBe(1000);
    });

    it('should support attribute options for SELECT types', () => {
      const options: AttributeOption[] = [
        { value: 'sm', label: 'Small', order: 1 },
        { value: 'md', label: 'Medium', order: 2 },
        { value: 'lg', label: 'Large', order: 3 },
      ];

      const definition: Partial<AttributeDefinition> = {
        type: 'SELECT',
        allowedValues: options,
      };

      expect(definition.allowedValues).toHaveLength(3);
    });
  });

  describe('ImportJob interface', () => {
    it('should validate import job', () => {
      const job: ImportJob = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Product Import - Jan 2024',
        source: 'csv',
        mapping: {
          productFields: {
            name: 'Product Name',
            price: 'Price',
          },
        },
        options: {
          updateExisting: true,
          skipDuplicates: false,
          validateOnly: false,
          publishAfterImport: false,
        },
        status: 'draft',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(job.source).toBe('csv');
      expect(job.status).toBe('draft');
    });

    it('should support all ImportSource values', () => {
      const sources: ImportSource[] = ['csv', 'json', 'xml', 'api', 'vendor'];

      sources.forEach((source) => {
        const job: Partial<ImportJob> = { source };
        expect(job.source).toBe(source);
      });
    });

    it('should support all ImportStatus values', () => {
      const statuses: ImportStatus[] = [
        'draft',
        'validating',
        'mapping',
        'running',
        'completed',
        'failed',
        'cancelled',
      ];

      statuses.forEach((status) => {
        const job: Partial<ImportJob> = { status };
        expect(job.status).toBe(status);
      });
    });

    it('should support import stats', () => {
      const stats: ImportStats = {
        productsCreated: 100,
        productsUpdated: 50,
        variantsCreated: 200,
        variantsUpdated: 75,
        imagesProcessed: 500,
        duplicatesFound: 10,
        validationErrors: 5,
      };

      expect(stats.productsCreated).toBe(100);
      expect(stats.duplicatesFound).toBe(10);
    });

    it('should support import errors', () => {
      const error: ImportError = {
        row: 42,
        field: 'price',
        value: 'invalid',
        error: 'Price must be a positive number',
        severity: 'error',
      };

      expect(error.row).toBe(42);
      expect(error.severity).toBe('error');
    });
  });

  describe('SearchQuery interface', () => {
    it('should validate basic search query', () => {
      const query: SearchQuery = {
        q: 'modern sofa',
        page: 1,
        pageSize: 20,
      };

      expect(query.q).toBe('modern sofa');
    });

    it('should support filters', () => {
      const query: SearchQuery = {
        category: ['sofa', 'chair'],
        brand: 'TestBrand',
        priceMin: 500,
        priceMax: 2000,
        colors: ['gray', 'beige'],
        materials: ['fabric', 'leather'],
        has3D: true,
        customizable: true,
      };

      expect(query.priceMin).toBe(500);
      expect(query.colors).toHaveLength(2);
    });

    it('should support dimension filters', () => {
      const dimensionFilter: DimensionFilter = {
        widthMin: 180,
        widthMax: 220,
        heightMin: 70,
        heightMax: 90,
        unit: 'cm',
      };

      const query: SearchQuery = {
        dimensions: dimensionFilter,
      };

      expect(query.dimensions?.unit).toBe('cm');
    });

    it('should support attribute filters', () => {
      const attributeFilters: AttributeFilter[] = [
        { code: 'seat_depth', operator: 'greater_than', value: 50 },
        { code: 'material', operator: 'in', value: ['leather', 'fabric'] },
      ];

      const query: SearchQuery = {
        attributes: attributeFilters,
      };

      expect(query.attributes).toHaveLength(2);
    });

    it('should support sorting', () => {
      const sort: SortOption = {
        field: 'price',
        direction: 'asc',
      };

      const query: SearchQuery = {
        sort,
      };

      expect(query.sort?.field).toBe('price');
      expect(query.sort?.direction).toBe('asc');
    });
  });

  describe('SearchResult interface', () => {
    it('should validate search result structure', () => {
      const result: SearchResult<unknown> = {
        data: [],
        meta: {
          total: 100,
          page: 1,
          pageSize: 20,
          totalPages: 5,
          took: 45,
        },
      };

      expect(result.meta.total).toBe(100);
      expect(result.meta.totalPages).toBe(5);
    });

    it('should support facets', () => {
      const facets: SearchFacets = {
        categories: [
          { key: 'sofa', label: 'Sofas', count: 50 },
          { key: 'chair', label: 'Chairs', count: 30 },
        ],
        brands: [{ key: 'BrandA', count: 25 }],
        colors: [{ key: 'gray', count: 40 }],
        materials: [{ key: 'fabric', count: 35 }],
        priceRanges: [
          { key: '0-500', label: 'Under $500', count: 20 },
          { key: '500-1000', label: '$500-$1000', count: 30 },
        ],
        attributes: {},
      };

      const result: SearchResult<unknown> = {
        data: [],
        facets,
        meta: {
          total: 100,
          page: 1,
          pageSize: 20,
          totalPages: 5,
          took: 45,
        },
      };

      expect(result.facets?.categories).toHaveLength(2);
    });
  });

  describe('Recommendation types', () => {
    it('should validate recommendation request', () => {
      const request: CatalogRecommendationRequest = {
        productId: '123e4567-e89b-12d3-a456-426614174000',
        userId: '123e4567-e89b-12d3-a456-426614174001',
        limit: 10,
        strategy: 'similar_visual',
      };

      expect(request.strategy).toBe('similar_visual');
    });

    it('should support all recommendation strategies', () => {
      const strategies: RecommendationStrategy[] = [
        'similar_visual',
        'similar_style',
        'complementary',
        'trending',
        'personalized',
        'cross_sell',
        'up_sell',
      ];

      strategies.forEach((strategy) => {
        const request: Partial<CatalogRecommendationRequest> = { strategy };
        expect(request.strategy).toBe(strategy);
      });
    });

    it('should validate recommendation result', () => {
      const result: RecommendationResult = {
        products: [],
        strategy: 'similar_visual',
        score: 0.85,
        reason: 'Visually similar products based on style and color',
      };

      expect(result.score).toBeGreaterThan(0);
      expect(result.strategy).toBe('similar_visual');
    });
  });

  describe('ValidationIssue interface', () => {
    it('should validate validation issue structure', () => {
      const issue: ValidationIssue = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        productId: '123e4567-e89b-12d3-a456-426614174001',
        code: 'MISSING_DIMENSION',
        severity: 'error',
        field: 'dimensions',
        message: 'Product dimensions are required for this category',
        resolved: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(issue.severity).toBe('error');
      expect(issue.resolved).toBe(false);
    });

    it('should support all severity levels', () => {
      const severities: ('error' | 'warning' | 'info')[] = ['error', 'warning', 'info'];

      severities.forEach((severity) => {
        const issue: Partial<ValidationIssue> = { severity };
        expect(issue.severity).toBe(severity);
      });
    });

    it('should support resolution tracking', () => {
      const issue: Partial<ValidationIssue> = {
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy: '123e4567-e89b-12d3-a456-426614174000',
        resolution: 'Dimensions added by admin',
      };

      expect(issue.resolved).toBe(true);
      expect(issue.resolution).toBeDefined();
    });
  });
});
