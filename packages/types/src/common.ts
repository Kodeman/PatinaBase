/**
 * UUID type alias
 * Represents a universally unique identifier as a string
 */
export type UUID = string;

/**
 * Timestamps interface
 * Standard created/updated timestamps for entities
 */
export interface Timestamps {
  /** Record creation timestamp */
  createdAt: Date;

  /** Record last update timestamp */
  updatedAt: Date;
}

/**
 * Pagination parameters for list requests
 */
export interface PaginationParams {
  /** Page number (1-indexed) */
  page: number;

  /** Number of items per page */
  limit: number;

  /** Field to sort by */
  sortBy?: string;

  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated response wrapper
 * Standard format for paginated API responses
 */
export interface PaginatedResponse<T> {
  /** Array of data items */
  data: T[];

  /** Pagination metadata */
  meta: {
    /** Total number of items across all pages */
    total: number;

    /** Current page number */
    page: number;

    /** Number of items per page */
    limit: number;

    /** Total number of pages */
    totalPages: number;
  };
}

/**
 * Generic Status type
 * Used for various entities (products, orders, etc.)
 *
 * Note: User accounts use a more specific UserStatus type
 * defined in user.ts with values: ACTIVE, PENDING, SUSPENDED, BANNED, DELETED
 */
export type Status = 'active' | 'inactive' | 'pending' | 'archived';

/**
 * Address interface
 * Standard address representation
 *
 * Note: For value object pattern with validation,
 * see AddressVO in value-objects/address.vo.ts
 */
export interface Address {
  /** Street address line */
  street: string;

  /** City name */
  city: string;

  /** State/Province/Region code */
  state: string;

  /** Postal/ZIP code */
  zipCode: string;

  /** ISO country code */
  country: string;
}

/**
 * Soft Delete interface
 * For entities that support soft deletion
 */
export interface SoftDelete {
  /** Soft delete timestamp (null if not deleted) */
  deletedAt?: Date;
}

/**
 * Cursor-based Pagination Parameters
 * For efficient pagination of large datasets
 */
export interface CursorPaginationParams {
  /** Cursor for next page */
  cursor?: string;

  /** Number of items to return */
  limit: number;

  /** Sort direction */
  direction?: 'forward' | 'backward';
}

/**
 * Cursor-based Paginated Response
 */
export interface CursorPaginatedResponse<T> {
  /** Array of data items */
  data: T[];

  /** Pagination metadata */
  meta: {
    /** Cursor for next page (null if last page) */
    nextCursor?: string;

    /** Cursor for previous page (null if first page) */
    prevCursor?: string;

    /** Whether there are more items */
    hasMore: boolean;

    /** Number of items returned */
    count: number;
  };
}
