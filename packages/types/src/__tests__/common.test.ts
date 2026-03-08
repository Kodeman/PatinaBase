/**
 * Common Types Validation Tests
 * Tests utility types used across the application
 */

import { UUID, Timestamps, PaginationParams, PaginatedResponse, Status, Address } from '../common';

describe('Common Types', () => {
  describe('UUID type', () => {
    it('should accept valid UUID string', () => {
      const uuid: UUID = '123e4567-e89b-12d3-a456-426614174000';

      expect(uuid).toBeDefined();
      expect(typeof uuid).toBe('string');
    });

    it('should validate UUID v4 format', () => {
      const uuid: UUID = '550e8400-e29b-41d4-a716-446655440000';

      // UUID v4 format regex
      const uuidV4Regex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      expect(uuid).toMatch(uuidV4Regex);
    });

    it('should accept lowercase UUID', () => {
      const uuid: UUID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

      expect(uuid).toBe(uuid.toLowerCase());
    });

    it('should accept uppercase UUID', () => {
      const uuid: UUID = 'A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D';

      expect(uuid).toBe(uuid.toUpperCase());
    });
  });

  describe('Timestamps interface', () => {
    it('should validate timestamps with createdAt and updatedAt', () => {
      const timestamps: Timestamps = {
        createdAt: new Date('2024-01-15T10:00:00Z'),
        updatedAt: new Date('2024-01-15T10:00:00Z'),
      };

      expect(timestamps.createdAt).toBeInstanceOf(Date);
      expect(timestamps.updatedAt).toBeInstanceOf(Date);
    });

    it('should allow updatedAt to be after createdAt', () => {
      const timestamps: Timestamps = {
        createdAt: new Date('2024-01-15T10:00:00Z'),
        updatedAt: new Date('2024-01-20T15:30:00Z'),
      };

      expect(timestamps.updatedAt.getTime()).toBeGreaterThan(timestamps.createdAt.getTime());
    });

    it('should allow updatedAt to equal createdAt for newly created entities', () => {
      const now = new Date();
      const timestamps: Timestamps = {
        createdAt: now,
        updatedAt: now,
      };

      expect(timestamps.createdAt.getTime()).toBe(timestamps.updatedAt.getTime());
    });

    it('should support ISO string date parsing', () => {
      const isoString = '2024-03-15T14:30:00.000Z';
      const timestamps: Timestamps = {
        createdAt: new Date(isoString),
        updatedAt: new Date(isoString),
      };

      expect(timestamps.createdAt.toISOString()).toBe(isoString);
    });

    it('should support timestamp operations', () => {
      const timestamps: Timestamps = {
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-15'),
      };

      const daysSinceCreation = Math.floor(
        (timestamps.updatedAt.getTime() - timestamps.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );

      expect(daysSinceCreation).toBe(14);
    });
  });

  describe('PaginationParams interface', () => {
    it('should validate basic pagination params', () => {
      const params: PaginationParams = {
        page: 1,
        limit: 20,
      };

      expect(params.page).toBe(1);
      expect(params.limit).toBe(20);
    });

    it('should support sorting parameters', () => {
      const params: PaginationParams = {
        page: 2,
        limit: 50,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      };

      expect(params.sortBy).toBe('createdAt');
      expect(params.sortOrder).toBe('desc');
    });

    it('should support ascending sort order', () => {
      const params: PaginationParams = {
        page: 1,
        limit: 10,
        sortBy: 'name',
        sortOrder: 'asc',
      };

      expect(params.sortOrder).toBe('asc');
    });

    it('should support descending sort order', () => {
      const params: PaginationParams = {
        page: 1,
        limit: 10,
        sortBy: 'price',
        sortOrder: 'desc',
      };

      expect(params.sortOrder).toBe('desc');
    });

    it('should validate typical pagination scenarios', () => {
      const firstPage: PaginationParams = {
        page: 1,
        limit: 25,
      };

      const secondPage: PaginationParams = {
        page: 2,
        limit: 25,
      };

      const largePageSize: PaginationParams = {
        page: 1,
        limit: 100,
      };

      expect(firstPage.page).toBe(1);
      expect(secondPage.page).toBe(2);
      expect(largePageSize.limit).toBe(100);
    });

    it('should support common sorting fields', () => {
      const sortFields = ['name', 'createdAt', 'updatedAt', 'price', 'status'];

      sortFields.forEach((field) => {
        const params: PaginationParams = {
          page: 1,
          limit: 20,
          sortBy: field,
        };

        expect(params.sortBy).toBe(field);
      });
    });
  });

  describe('PaginatedResponse interface', () => {
    it('should validate paginated response structure', () => {
      const response: PaginatedResponse<string> = {
        data: ['item1', 'item2', 'item3'],
        meta: {
          total: 100,
          page: 1,
          limit: 20,
          totalPages: 5,
        },
      };

      expect(response.data).toHaveLength(3);
      expect(response.meta.total).toBe(100);
      expect(response.meta.totalPages).toBe(5);
    });

    it('should support generic data types', () => {
      interface Product {
        id: string;
        name: string;
      }

      const products: Product[] = [
        { id: '1', name: 'Product 1' },
        { id: '2', name: 'Product 2' },
      ];

      const response: PaginatedResponse<Product> = {
        data: products,
        meta: {
          total: 2,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      };

      expect(response.data[0].name).toBe('Product 1');
      expect(response.data).toHaveLength(2);
    });

    it('should validate pagination metadata calculations', () => {
      const total = 95;
      const limit = 20;
      const totalPages = Math.ceil(total / limit);

      const response: PaginatedResponse<unknown> = {
        data: [],
        meta: {
          total,
          page: 1,
          limit,
          totalPages,
        },
      };

      expect(response.meta.totalPages).toBe(5);
    });

    it('should support empty results', () => {
      const response: PaginatedResponse<unknown> = {
        data: [],
        meta: {
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        },
      };

      expect(response.data).toHaveLength(0);
      expect(response.meta.total).toBe(0);
      expect(response.meta.totalPages).toBe(0);
    });

    it('should support last page with partial results', () => {
      const response: PaginatedResponse<string> = {
        data: ['item1', 'item2', 'item3'],
        meta: {
          total: 43,
          page: 3,
          limit: 20,
          totalPages: 3,
        },
      };

      // Last page with only 3 items (43 - 40 = 3)
      expect(response.data).toHaveLength(3);
      expect(response.meta.page).toBe(3);
    });

    it('should validate pagination boundaries', () => {
      const firstPage: PaginatedResponse<unknown> = {
        data: [],
        meta: {
          total: 100,
          page: 1,
          limit: 20,
          totalPages: 5,
        },
      };

      const lastPage: PaginatedResponse<unknown> = {
        data: [],
        meta: {
          total: 100,
          page: 5,
          limit: 20,
          totalPages: 5,
        },
      };

      expect(firstPage.meta.page).toBe(1);
      expect(lastPage.meta.page).toBe(lastPage.meta.totalPages);
    });
  });

  describe('Status type', () => {
    it('should support all status values', () => {
      const statuses: Status[] = ['active', 'inactive', 'pending', 'archived'];

      statuses.forEach((status) => {
        const entity: { status: Status } = { status };
        expect(entity.status).toBe(status);
      });
    });

    it('should validate active status', () => {
      const status: Status = 'active';
      expect(status).toBe('active');
    });

    it('should validate inactive status', () => {
      const status: Status = 'inactive';
      expect(status).toBe('inactive');
    });

    it('should validate pending status', () => {
      const status: Status = 'pending';
      expect(status).toBe('pending');
    });

    it('should validate archived status', () => {
      const status: Status = 'archived';
      expect(status).toBe('archived');
    });

    it('should support status transitions', () => {
      const statuses: Status[] = ['pending', 'active', 'inactive', 'archived'];

      // Simulating a lifecycle: pending -> active -> inactive -> archived
      let currentStatus: Status = statuses[0];
      expect(currentStatus).toBe('pending');

      currentStatus = statuses[1];
      expect(currentStatus).toBe('active');

      currentStatus = statuses[2];
      expect(currentStatus).toBe('inactive');

      currentStatus = statuses[3];
      expect(currentStatus).toBe('archived');
    });
  });

  describe('Address interface', () => {
    it('should validate address with all mandatory fields', () => {
      const address: Address = {
        street: '123 Main Street',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        country: 'USA',
      };

      expect(address.street).toBe('123 Main Street');
      expect(address.city).toBe('New York');
      expect(address.state).toBe('NY');
      expect(address.zipCode).toBe('10001');
      expect(address.country).toBe('USA');
    });

    it('should support US addresses', () => {
      const usAddress: Address = {
        street: '456 Oak Avenue',
        city: 'Los Angeles',
        state: 'CA',
        zipCode: '90001',
        country: 'USA',
      };

      expect(usAddress.country).toBe('USA');
      expect(usAddress.zipCode).toMatch(/^\d{5}$/);
    });

    it('should support international addresses', () => {
      const ukAddress: Address = {
        street: '10 Downing Street',
        city: 'London',
        state: 'England',
        zipCode: 'SW1A 2AA',
        country: 'United Kingdom',
      };

      expect(ukAddress.country).toBe('United Kingdom');
      expect(ukAddress.zipCode).toBe('SW1A 2AA');
    });

    it('should support apartment/unit numbers in street field', () => {
      const address: Address = {
        street: '789 Maple Drive, Apt 4B',
        city: 'Chicago',
        state: 'IL',
        zipCode: '60601',
        country: 'USA',
      };

      expect(address.street).toContain('Apt 4B');
    });

    it('should support full address formatting', () => {
      const address: Address = {
        street: '321 Pine Street',
        city: 'Seattle',
        state: 'WA',
        zipCode: '98101',
        country: 'USA',
      };

      const formatted = `${address.street}, ${address.city}, ${address.state} ${address.zipCode}, ${address.country}`;
      expect(formatted).toBe('321 Pine Street, Seattle, WA 98101, USA');
    });

    it('should validate zip code formats', () => {
      const usZip5: Address = {
        street: '100 Test St',
        city: 'Test',
        state: 'TX',
        zipCode: '12345',
        country: 'USA',
      };

      const usZipPlus4: Address = {
        street: '100 Test St',
        city: 'Test',
        state: 'TX',
        zipCode: '12345-6789',
        country: 'USA',
      };

      expect(usZip5.zipCode).toMatch(/^\d{5}$/);
      expect(usZipPlus4.zipCode).toMatch(/^\d{5}-\d{4}$/);
    });

    it('should support state abbreviations', () => {
      const commonStates = ['CA', 'NY', 'TX', 'FL', 'IL', 'PA'];

      commonStates.forEach((state) => {
        const address: Partial<Address> = {
          state,
        };
        expect(address.state).toHaveLength(2);
        expect(address.state).toBe(address.state?.toUpperCase());
      });
    });
  });

  describe('Type composition', () => {
    it('should support entities with both Timestamps and Status', () => {
      interface Entity extends Timestamps {
        id: UUID;
        status: Status;
      }

      const entity: Entity = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(entity.id).toBeDefined();
      expect(entity.status).toBe('active');
      expect(entity.createdAt).toBeInstanceOf(Date);
    });

    it('should support combining multiple common types', () => {
      interface User extends Timestamps {
        id: UUID;
        email: string;
        status: Status;
        address?: Address;
      }

      const user: User = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'user@example.com',
        status: 'active',
        address: {
          street: '123 Main St',
          city: 'Boston',
          state: 'MA',
          zipCode: '02101',
          country: 'USA',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(user.id).toBeDefined();
      expect(user.status).toBe('active');
      expect(user.address?.city).toBe('Boston');
    });
  });

  describe('Utility type usage patterns', () => {
    it('should support pagination of typed entities', () => {
      interface Product extends Timestamps {
        id: UUID;
        name: string;
        price: number;
        status: Status;
      }

      const products: Product[] = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Product 1',
          price: 99.99,
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const paginatedProducts: PaginatedResponse<Product> = {
        data: products,
        meta: {
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        },
      };

      expect(paginatedProducts.data[0].name).toBe('Product 1');
      expect(paginatedProducts.data[0].status).toBe('active');
    });

    it('should support entities with addresses', () => {
      interface Vendor extends Timestamps {
        id: UUID;
        name: string;
        address: Address;
        status: Status;
      }

      const vendor: Vendor = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Manufacturer',
        address: {
          street: '456 Factory Rd',
          city: 'Detroit',
          state: 'MI',
          zipCode: '48201',
          country: 'USA',
        },
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(vendor.address.city).toBe('Detroit');
      expect(vendor.status).toBe('active');
    });
  });
});
