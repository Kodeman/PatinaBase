const DEFAULT_LIST_PAGE = 1;
const DEFAULT_LIST_LIMIT = 20;

type JsonPrimitive = string | number | boolean | null;

function isDate(value: unknown): value is Date {
  return value instanceof Date;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (isDate(value)) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));

    const content = entries
      .map(([key, val]) => `"${key}":${stableStringify(val)}`)
      .join(',');

    return `{${content}}`;
  }

  return JSON.stringify(value as JsonPrimitive);
}

function ensureValue<T>(value: T | undefined, message: string): T {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
  return value;
}

export type ProductCacheScope =
  | 'detail'
  | 'list'
  | 'search'
  | 'recommendations';

export interface ProductCacheKeyOptions {
  productId?: string;
  filters?: Record<string, unknown>;
  page?: number;
  limit?: number;
  query?: string;
  userId?: string;
  locale?: string;
}

export function buildProductCacheKey(
  scope: ProductCacheScope,
  options: ProductCacheKeyOptions = {},
): string {
  const segments = ['product', scope];

  switch (scope) {
    case 'detail': {
      const productId = ensureValue(options.productId, 'productId is required for product detail cache keys');
      segments.push(productId);
      break;
    }
    case 'list': {
      segments.push(`filters:${stableStringify(options.filters ?? {})}`);
      segments.push(`page:${options.page ?? DEFAULT_LIST_PAGE}`);
      segments.push(`limit:${options.limit ?? DEFAULT_LIST_LIMIT}`);
      break;
    }
    case 'search': {
      segments.push(`query:${options.query ?? ''}`);
      segments.push(`filters:${stableStringify(options.filters ?? {})}`);
      segments.push(`page:${options.page ?? DEFAULT_LIST_PAGE}`);
      segments.push(`limit:${options.limit ?? DEFAULT_LIST_LIMIT}`);
      segments.push(`locale:${options.locale ?? 'default'}`);
      break;
    }
    case 'recommendations': {
      segments.push(`user:${options.userId ?? 'anon'}`);
      segments.push(`context:${stableStringify(options.filters ?? {})}`);
      break;
    }
    default: {
      const exhaustive: never = scope;
      throw new Error(`Unsupported product cache scope: ${exhaustive}`);
    }
  }

  return segments.join(':');
}

export type ProjectCacheScope =
  | 'detail'
  | 'list'
  | 'stats'
  | 'client-view'
  | 'progress'
  | 'activity'
  | 'upcoming';

export interface ProjectCacheKeyOptions {
  projectId?: string;
  userId?: string;
  role?: string;
  filters?: Record<string, unknown>;
  page?: number;
  limit?: number;
  offset?: number;
  daysAhead?: number;
  clientId?: string;
}

export function buildProjectCacheKey(
  scope: ProjectCacheScope,
  options: ProjectCacheKeyOptions = {},
): string {
  const segments = ['project', scope];

  switch (scope) {
    case 'detail': {
      const projectId = ensureValue(options.projectId, 'projectId is required for project detail cache keys');
      segments.push(projectId);
      break;
    }
    case 'list': {
      segments.push(`user:${options.userId ?? 'anon'}`);
      segments.push(`role:${options.role ?? 'unknown'}`);
      const filters = {
        ...(options.filters ?? {}),
        page: options.page ?? DEFAULT_LIST_PAGE,
        limit: options.limit ?? DEFAULT_LIST_LIMIT,
      };
      segments.push(`filters:${stableStringify(filters)}`);
      break;
    }
    case 'stats': {
      const projectId = ensureValue(options.projectId, 'projectId is required for project stats cache keys');
      segments.push(projectId);
      break;
    }
    case 'client-view': {
      const projectId = ensureValue(options.projectId, 'projectId is required for project client-view cache keys');
      const clientId = ensureValue(options.clientId, 'clientId is required for client-view cache keys');
      segments.push(projectId);
      segments.push(`client:${clientId}`);
      break;
    }
    case 'progress': {
      const projectId = ensureValue(options.projectId, 'projectId is required for project progress cache keys');
      segments.push(projectId);
      break;
    }
    case 'activity': {
      const projectId = ensureValue(options.projectId, 'projectId is required for project activity cache keys');
      segments.push(projectId);
      segments.push(`limit:${options.limit ?? 50}`);
      segments.push(`offset:${options.offset ?? 0}`);
      break;
    }
    case 'upcoming': {
      const projectId = ensureValue(options.projectId, 'projectId is required for project upcoming cache keys');
      segments.push(projectId);
      segments.push(`days:${options.daysAhead ?? 30}`);
      break;
    }
    default: {
      const exhaustive: never = scope;
      throw new Error(`Unsupported project cache scope: ${exhaustive}`);
    }
  }

  return segments.join(':');
}

export type StyleProfileCacheScope = 'detail' | 'versions' | 'version';

export interface StyleProfileCacheKeyOptions {
  profileId?: string;
  versionNo?: number;
}

export function buildStyleProfileCacheKey(
  scope: StyleProfileCacheScope,
  options: StyleProfileCacheKeyOptions = {},
): string {
  const segments = ['style-profile', scope];

  switch (scope) {
    case 'detail': {
      const profileId = ensureValue(options.profileId, 'profileId is required for profile detail cache keys');
      segments.push(profileId);
      break;
    }
    case 'versions': {
      const profileId = ensureValue(options.profileId, 'profileId is required for profile versions cache keys');
      segments.push(profileId);
      break;
    }
    case 'version': {
      const profileId = ensureValue(options.profileId, 'profileId is required for profile version cache keys');
      const versionNo = ensureValue(options.versionNo, 'versionNo is required for profile version cache keys');
      segments.push(profileId);
      segments.push(`no:${versionNo}`);
      break;
    }
    default: {
      const exhaustive: never = scope;
      throw new Error(`Unsupported style profile cache scope: ${exhaustive}`);
    }
  }

  return segments.join(':');
}

export { stableStringify };
