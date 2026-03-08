# Strata Monorepo Bootstrap PRD

> **Purpose**: Initialize a production-ready monorepo foundation for the Patina furniture intelligence platform. This PRD is designed for execution by Claude Code to scaffold the complete project structure, configurations, and initial implementations.

---

## Executive Summary

Patina is a furniture intelligence platform that captures designer expertise and transforms it into AI-powered recommendations. **Strata** is the monorepo that houses all Patina applications and shared packages—named for the layered foundation upon which everything is built.

### What We're Building

| Application | Framework | Purpose |
|-------------|-----------|---------|
| `portal` | Next.js 14 (App Router) | Designer teaching interface & catalog management |
| `extension` | Plasmo | Chrome extension for one-click product capture |
| `mobile` | React Native + Expo | Consumer iOS app (scaffold only for Phase 1) |

### Shared Infrastructure

| Package | Purpose |
|---------|---------|
| `@strata/shared` | TypeScript types, validation schemas, utilities |
| `@strata/ui` | Shared React components (future) |
| `@strata/supabase` | Database client, generated types, React Query hooks |

---

## Project Initialization

### Step 1: Create Monorepo Root

```bash
mkdir strata && cd strata
pnpm init
```

### Step 2: Configure pnpm Workspaces

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### Step 3: Root package.json

```json
{
  "name": "strata",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "type-check": "turbo type-check",
    "clean": "turbo clean && rm -rf node_modules",
    "db:generate": "pnpm --filter @strata/supabase generate",
    "db:push": "pnpm --filter @strata/supabase push",
    "db:studio": "pnpm --filter @strata/supabase studio"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0"
  }
}
```

### Step 4: Turborepo Configuration

Create `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**", "build/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "type-check": {
      "dependsOn": ["^build"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

### Step 5: TypeScript Base Configuration

Create `tsconfig.json` at root:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowJs": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "incremental": true
  },
  "exclude": ["node_modules"]
}
```

### Step 6: ESLint Configuration

Create `eslint.config.mjs`:

```javascript
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/build/**']
  }
);
```

### Step 7: Prettier Configuration

Create `.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

### Step 8: Git Configuration

Create `.gitignore`:

```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Build outputs
dist/
build/
.next/
.turbo/
*.tsbuildinfo

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*

# Testing
coverage/

# Supabase
supabase/.branches
supabase/.temp

# Extension
apps/extension/build/
apps/extension/.plasmo/
```

---

## Directory Structure

Create the following directory structure:

```
strata/
├── apps/
│   ├── portal/              # Next.js Designer Portal
│   ├── extension/           # Plasmo Chrome Extension
│   └── mobile/              # React Native + Expo (scaffold)
├── packages/
│   ├── shared/              # Shared utilities & types
│   ├── ui/                  # Shared UI components
│   └── supabase/            # Database client & types
├── supabase/
│   ├── migrations/          # SQL migrations
│   ├── functions/           # Edge Functions
│   └── seed.sql             # Development seed data
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.json
├── eslint.config.mjs
├── .prettierrc
├── .gitignore
└── README.md
```

---

## Package: @strata/shared

### Location: `packages/shared/`

### package.json

```json
{
  "name": "@strata/shared",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types/index.ts",
    "./validation": "./src/validation/index.ts",
    "./utils": "./src/utils/index.ts"
  },
  "scripts": {
    "type-check": "tsc --noEmit",
    "lint": "eslint src/"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

### tsconfig.json

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

### src/index.ts

```typescript
export * from './types';
export * from './validation';
export * from './utils';
```

### src/types/index.ts

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// CORE DOMAIN TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type UUID = string;

// ─── Product ───────────────────────────────────────────────────────────────

export interface Product {
  id: UUID;
  name: string;
  description: string | null;
  priceRetail: number | null;
  priceTrade: number | null;
  dimensions: ProductDimensions | null;
  materials: string[];
  sourceUrl: string;
  images: string[];
  vendorId: UUID | null;
  capturedBy: UUID;
  capturedAt: string;
  qualityScore: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDimensions {
  width: number | null;
  height: number | null;
  depth: number | null;
  unit: 'in' | 'cm';
}

export interface ProductCreateInput {
  name: string;
  description?: string;
  priceRetail?: number;
  priceTrade?: number;
  dimensions?: ProductDimensions;
  materials?: string[];
  sourceUrl: string;
  images: string[];
  vendorId?: UUID;
}

export interface ProductUpdateInput {
  name?: string;
  description?: string;
  priceRetail?: number;
  priceTrade?: number;
  dimensions?: ProductDimensions;
  materials?: string[];
  qualityScore?: number;
}

// ─── Style ─────────────────────────────────────────────────────────────────

export interface Style {
  id: UUID;
  name: string;
  parentId: UUID | null;
  description: string | null;
  visualMarkers: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StyleCreateInput {
  name: string;
  parentId?: UUID;
  description?: string;
  visualMarkers?: string[];
}

// ─── Product-Style Relationship ────────────────────────────────────────────

export interface ProductStyle {
  id: UUID;
  productId: UUID;
  styleId: UUID;
  confidence: number;
  assignedBy: UUID;
  createdAt: string;
}

// ─── Product Relations ─────────────────────────────────────────────────────

export type RelationType = 'pairs_with' | 'alternative' | 'never_with';

export interface ProductRelation {
  id: UUID;
  productAId: UUID;
  productBId: UUID;
  relationType: RelationType;
  notes: string | null;
  assignedBy: UUID;
  createdAt: string;
}

// ─── Vendor ────────────────────────────────────────────────────────────────

export interface Vendor {
  id: UUID;
  name: string;
  website: string | null;
  tradeTerms: string | null;
  contactInfo: VendorContact | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VendorContact {
  email?: string;
  phone?: string;
  rep?: string;
}

// ─── Client Profile ────────────────────────────────────────────────────────

export interface ClientProfile {
  id: UUID;
  archetype: string | null;
  budgetRange: BudgetRange | null;
  stylePreferences: UUID[];
  quizResponses: Record<string, unknown> | null;
  projectId: UUID | null;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetRange {
  min: number;
  max: number;
  currency: 'USD';
}

// ─── Project ───────────────────────────────────────────────────────────────

export type ProjectStatus = 'active' | 'completed' | 'archived';

export interface Project {
  id: UUID;
  name: string;
  clientProfileId: UUID | null;
  status: ProjectStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Quiz Session ──────────────────────────────────────────────────────────

export interface QuizSession {
  id: UUID;
  userId: UUID | null;
  responses: QuizResponse[];
  computedProfile: Record<string, unknown> | null;
  completedAt: string | null;
  conversionEvent: string | null;
  createdAt: string;
}

export interface QuizResponse {
  questionId: string;
  answer: unknown;
  timestamp: string;
}

// ─── User ──────────────────────────────────────────────────────────────────

export type UserRole = 'designer' | 'admin' | 'consumer';

export interface User {
  id: UUID;
  email: string;
  role: UserRole;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Chrome Extension Types ────────────────────────────────────────────────

export interface CaptureRequest {
  url: string;
  title: string;
  price: string | null;
  images: string[];
  description: string | null;
  dimensions: string | null;
  projectId?: UUID;
  notes?: string;
}

export interface CaptureResult {
  success: boolean;
  productId?: UUID;
  error?: string;
}

// ─── API Response Types ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
```

### src/validation/index.ts

```typescript
import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

export const uuidSchema = z.string().uuid();

// ─── Product Schemas ───────────────────────────────────────────────────────

export const productDimensionsSchema = z.object({
  width: z.number().positive().nullable(),
  height: z.number().positive().nullable(),
  depth: z.number().positive().nullable(),
  unit: z.enum(['in', 'cm']),
});

export const productCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  priceRetail: z.number().positive().optional(),
  priceTrade: z.number().positive().optional(),
  dimensions: productDimensionsSchema.optional(),
  materials: z.array(z.string()).optional(),
  sourceUrl: z.string().url(),
  images: z.array(z.string().url()).min(1),
  vendorId: uuidSchema.optional(),
});

export const productUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  priceRetail: z.number().positive().optional(),
  priceTrade: z.number().positive().optional(),
  dimensions: productDimensionsSchema.optional(),
  materials: z.array(z.string()).optional(),
  qualityScore: z.number().min(0).max(100).optional(),
});

// ─── Style Schemas ─────────────────────────────────────────────────────────

export const styleCreateSchema = z.object({
  name: z.string().min(1).max(100),
  parentId: uuidSchema.optional(),
  description: z.string().max(500).optional(),
  visualMarkers: z.array(z.string()).optional(),
});

// ─── Capture Schemas ───────────────────────────────────────────────────────

export const captureRequestSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1).max(255),
  price: z.string().nullable(),
  images: z.array(z.string().url()),
  description: z.string().nullable(),
  dimensions: z.string().nullable(),
  projectId: uuidSchema.optional(),
  notes: z.string().max(1000).optional(),
});

// ─── Search & Filter Schemas ───────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export const productFilterSchema = z.object({
  search: z.string().optional(),
  styleIds: z.array(uuidSchema).optional(),
  vendorIds: z.array(uuidSchema).optional(),
  priceMin: z.number().positive().optional(),
  priceMax: z.number().positive().optional(),
  materials: z.array(z.string()).optional(),
});

// ─── Type Exports ──────────────────────────────────────────────────────────

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type StyleCreateInput = z.infer<typeof styleCreateSchema>;
export type CaptureRequest = z.infer<typeof captureRequestSchema>;
export type Pagination = z.infer<typeof paginationSchema>;
export type ProductFilter = z.infer<typeof productFilterSchema>;
```

### src/utils/index.ts

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format price for display
 */
export function formatPrice(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

/**
 * Parse price string to cents
 */
export function parsePrice(priceString: string): number | null {
  const cleaned = priceString.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : Math.round(parsed * 100);
}

/**
 * Format dimensions for display
 */
export function formatDimensions(
  dimensions: { width: number | null; height: number | null; depth: number | null; unit: string } | null
): string {
  if (!dimensions) return '';
  const parts = [dimensions.width, dimensions.height, dimensions.depth]
    .filter((v) => v !== null)
    .map((v) => `${v}"`);
  return parts.join(' × ');
}

/**
 * Generate a slug from a string
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .trim();
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Deep merge objects
 */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const output = { ...target };
  for (const key in source) {
    if (source[key] !== undefined) {
      if (
        typeof source[key] === 'object' &&
        source[key] !== null &&
        !Array.isArray(source[key])
      ) {
        output[key] = deepMerge(
          (output[key] as Record<string, unknown>) || {},
          source[key] as Record<string, unknown>
        ) as T[Extract<keyof T, string>];
      } else {
        output[key] = source[key] as T[Extract<keyof T, string>];
      }
    }
  }
  return output;
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), wait);
  };
}

/**
 * Generate unique ID (for client-side use only)
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Check if running in browser
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Safe JSON parse
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
```

---

## Package: @strata/supabase

### Location: `packages/supabase/`

### package.json

```json
{
  "name": "@strata/supabase",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./client": "./src/client.ts",
    "./hooks": "./src/hooks/index.ts"
  },
  "scripts": {
    "generate": "supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > src/database.types.ts",
    "push": "supabase db push",
    "studio": "supabase studio",
    "type-check": "tsc --noEmit",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.43.0",
    "@tanstack/react-query": "^5.40.0"
  },
  "devDependencies": {
    "supabase": "^1.170.0",
    "typescript": "^5.4.0"
  },
  "peerDependencies": {
    "react": "^18.0.0"
  }
}
```

### src/index.ts

```typescript
export { createClient, createServerClient } from './client';
export type { Database } from './database.types';
export * from './hooks';
```

### src/client.ts

```typescript
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT FACTORY
// ═══════════════════════════════════════════════════════════════════════════

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser client - for client components
 */
export function createClient() {
  return createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey);
}

/**
 * Server client - for server components and API routes
 * Requires service role key for admin operations
 */
export function createServerClient(serviceRoleKey?: string) {
  const key = serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createSupabaseClient<Database>(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
```

### src/database.types.ts (placeholder)

```typescript
// This file will be auto-generated by `supabase gen types typescript`
// Placeholder for type safety during initial development

export interface Database {
  public: {
    Tables: {
      products: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          price_retail: number | null;
          price_trade: number | null;
          dimensions: unknown | null;
          materials: string[];
          source_url: string;
          images: string[];
          vendor_id: string | null;
          captured_by: string;
          captured_at: string;
          quality_score: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['products']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['products']['Insert']>;
      };
      styles: {
        Row: {
          id: string;
          name: string;
          parent_id: string | null;
          description: string | null;
          visual_markers: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['styles']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['styles']['Insert']>;
      };
      vendors: {
        Row: {
          id: string;
          name: string;
          website: string | null;
          trade_terms: string | null;
          contact_info: unknown | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['vendors']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['vendors']['Insert']>;
      };
      projects: {
        Row: {
          id: string;
          name: string;
          client_profile_id: string | null;
          status: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['projects']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['projects']['Insert']>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
```

### src/hooks/index.ts

```typescript
export { useProducts, useProduct, useCreateProduct, useUpdateProduct } from './use-products';
export { useStyles, useCreateStyle } from './use-styles';
export { useProjects, useCreateProject } from './use-projects';
```

### src/hooks/use-products.ts

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '../client';
import type { ProductFilter, Pagination } from '@strata/shared/validation';

const supabase = createClient();

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT HOOKS
// ═══════════════════════════════════════════════════════════════════════════

export function useProducts(filters?: ProductFilter, pagination?: Pagination) {
  return useQuery({
    queryKey: ['products', filters, pagination],
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select('*, vendor:vendors(*), product_styles(style:styles(*))', { count: 'exact' });

      // Apply filters
      if (filters?.search) {
        query = query.ilike('name', `%${filters.search}%`);
      }
      if (filters?.vendorIds?.length) {
        query = query.in('vendor_id', filters.vendorIds);
      }
      if (filters?.priceMin) {
        query = query.gte('price_retail', filters.priceMin);
      }
      if (filters?.priceMax) {
        query = query.lte('price_retail', filters.priceMax);
      }

      // Apply pagination
      const page = pagination?.page ?? 1;
      const pageSize = pagination?.pageSize ?? 20;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      query = query.range(from, to).order('created_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: data ?? [],
        pagination: {
          page,
          pageSize,
          total: count ?? 0,
          totalPages: Math.ceil((count ?? 0) / pageSize),
        },
      };
    },
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, vendor:vendors(*), product_styles(style:styles(*))')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      source_url: string;
      images: string[];
      description?: string;
      price_retail?: number;
      captured_by: string;
    }) => {
      const { data, error } = await supabase
        .from('products')
        .insert({
          ...input,
          materials: [],
          captured_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: unknown }) => {
      const { data, error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', data.id] });
    },
  });
}
```

### src/hooks/use-styles.ts

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '../client';

const supabase = createClient();

export function useStyles() {
  return useQuery({
    queryKey: ['styles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('styles')
        .select('*')
        .order('name');

      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateStyle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string; parent_id?: string; description?: string }) => {
      const { data, error } = await supabase
        .from('styles')
        .insert({ ...input, visual_markers: [] })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['styles'] });
    },
  });
}
```

### src/hooks/use-projects.ts

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '../client';

const supabase = createClient();

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string; notes?: string }) => {
      const { data, error } = await supabase
        .from('projects')
        .insert({ ...input, status: 'active' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
```

---

## App: Portal (Next.js)

### Location: `apps/portal/`

### Initialize with Next.js

```bash
cd apps
pnpm create next-app@latest portal --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

### Update package.json

After initialization, update `apps/portal/package.json`:

```json
{
  "name": "@strata/portal",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@strata/shared": "workspace:*",
    "@strata/supabase": "workspace:*",
    "@supabase/ssr": "^0.3.0",
    "@tanstack/react-query": "^5.40.0",
    "next": "14.2.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "lucide-react": "^0.379.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3",
    "typescript": "^5.4.0"
  }
}
```

### tailwind.config.ts

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        patina: {
          'off-white': '#EDE9E4',
          'clay-beige': '#A3927C',
          'mocha-brown': '#655B52',
          charcoal: '#3F3B37',
          'soft-cream': '#F5F2ED',
          'warm-white': '#FAF7F2',
          success: '#7A9C85',
          warning: '#D4A574',
          error: '#B87969',
          info: '#6B8FAD',
        },
      },
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
```

### src/app/layout.tsx

```tsx
import type { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
});

export const metadata: Metadata = {
  title: 'Patina | Designer Portal',
  description: 'Catalog management and teaching interface for Patina',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <body className="bg-patina-off-white text-patina-charcoal font-body">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### src/app/providers.tsx

```tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

### src/app/globals.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --patina-off-white: #ede9e4;
  --patina-clay-beige: #a3927c;
  --patina-mocha-brown: #655b52;
  --patina-charcoal: #3f3b37;
}

body {
  font-family: var(--font-inter), system-ui, sans-serif;
}

h1,
h2,
h3,
h4 {
  font-family: var(--font-playfair), Georgia, serif;
}
```

### src/app/page.tsx

```tsx
import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-12">
          <h1 className="text-4xl font-display font-medium text-patina-mocha-brown mb-2">
            Patina
          </h1>
          <p className="text-patina-clay-beige">Designer Portal</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link
            href="/products"
            className="block p-6 bg-white rounded-xl border border-patina-clay-beige/20 hover:shadow-lg transition-shadow"
          >
            <h2 className="text-xl font-display font-medium mb-2">Products</h2>
            <p className="text-patina-clay-beige text-sm">
              Browse and manage your product catalog
            </p>
          </Link>

          <Link
            href="/styles"
            className="block p-6 bg-white rounded-xl border border-patina-clay-beige/20 hover:shadow-lg transition-shadow"
          >
            <h2 className="text-xl font-display font-medium mb-2">Styles</h2>
            <p className="text-patina-clay-beige text-sm">
              Manage your style taxonomy
            </p>
          </Link>

          <Link
            href="/projects"
            className="block p-6 bg-white rounded-xl border border-patina-clay-beige/20 hover:shadow-lg transition-shadow"
          >
            <h2 className="text-xl font-display font-medium mb-2">Projects</h2>
            <p className="text-patina-clay-beige text-sm">
              Organize products by client project
            </p>
          </Link>

          <Link
            href="/teaching"
            className="block p-6 bg-white rounded-xl border border-patina-clay-beige/20 hover:shadow-lg transition-shadow"
          >
            <h2 className="text-xl font-display font-medium mb-2">Teaching</h2>
            <p className="text-patina-clay-beige text-sm">
              Train the Aesthete Engine
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
```

### src/app/products/page.tsx

```tsx
'use client';

import { useProducts } from '@strata/supabase/hooks';

export default function ProductsPage() {
  const { data, isLoading, error } = useProducts();

  if (isLoading) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-6xl mx-auto">
          <p className="text-patina-clay-beige">Loading products...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-6xl mx-auto">
          <p className="text-patina-error">Error loading products</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-medium text-patina-mocha-brown">
              Products
            </h1>
            <p className="text-patina-clay-beige">
              {data?.pagination.total ?? 0} products in catalog
            </p>
          </div>
        </header>

        {data?.data.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-patina-clay-beige/20">
            <p className="text-patina-clay-beige mb-4">No products yet</p>
            <p className="text-sm text-patina-mocha-brown">
              Use the Chrome extension to capture your first product
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data?.data.map((product) => (
              <div
                key={product.id}
                className="bg-white rounded-xl border border-patina-clay-beige/20 overflow-hidden hover:shadow-lg transition-shadow"
              >
                {product.images[0] && (
                  <div className="aspect-square bg-patina-soft-cream">
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="p-4">
                  <h3 className="font-medium text-patina-charcoal mb-1">
                    {product.name}
                  </h3>
                  {product.price_retail && (
                    <p className="text-patina-clay-beige text-sm">
                      ${(product.price_retail / 100).toFixed(2)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
```

### Environment Variables

Create `apps/portal/.env.local.example`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

---

## App: Extension (Plasmo)

### Location: `apps/extension/`

### Initialize with Plasmo

```bash
cd apps
pnpm create plasmo extension --with-tailwindcss
```

### Update package.json

```json
{
  "name": "@strata/extension",
  "displayName": "Patina Capture",
  "version": "0.0.1",
  "description": "Capture furniture products for your Patina catalog",
  "author": "Patina",
  "scripts": {
    "dev": "plasmo dev",
    "build": "plasmo build",
    "package": "plasmo package",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@strata/shared": "workspace:*",
    "@supabase/supabase-js": "^2.43.0",
    "plasmo": "^0.88.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.268",
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3",
    "typescript": "^5.4.0"
  },
  "manifest": {
    "permissions": [
      "activeTab",
      "storage",
      "contextMenus"
    ],
    "host_permissions": [
      "https://*/*"
    ]
  }
}
```

### popup.tsx

```tsx
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { CaptureRequest } from '@strata/shared';

import './style.css';

const supabase = createClient(
  process.env.PLASMO_PUBLIC_SUPABASE_URL!,
  process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY!
);

function Popup() {
  const [pageData, setPageData] = useState<Partial<CaptureRequest> | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureSuccess, setCaptureSuccess] = useState(false);

  useEffect(() => {
    // Get current tab info
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (tab?.url && tab?.title) {
        setPageData({
          url: tab.url,
          title: tab.title,
          images: [],
        });
      }
    });
  }, []);

  const handleCapture = async () => {
    if (!pageData?.url || !pageData?.title) return;

    setIsCapturing(true);

    try {
      // Execute content script to extract images
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: () => {
          const images = Array.from(document.querySelectorAll('img'))
            .map((img) => img.src)
            .filter((src) => src.startsWith('http') && src.includes('/'));
          return images.slice(0, 5);
        },
      });

      const images = results[0]?.result || [];

      // Save to Supabase
      const { error } = await supabase.from('products').insert({
        name: pageData.title,
        source_url: pageData.url,
        images,
        materials: [],
        captured_by: 'extension-user', // TODO: Get from auth
        captured_at: new Date().toISOString(),
      });

      if (error) throw error;

      setCaptureSuccess(true);
      setTimeout(() => setCaptureSuccess(false), 2000);
    } catch (error) {
      console.error('Capture failed:', error);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="w-80 p-4 bg-[#EDE9E4]">
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-[#655B52]">Patina</h1>
        <p className="text-sm text-[#A3927C]">Capture to catalog</p>
      </header>

      {pageData && (
        <div className="mb-4 p-3 bg-white rounded-lg border border-[#A3927C]/20">
          <p className="text-sm font-medium text-[#3F3B37] truncate">{pageData.title}</p>
          <p className="text-xs text-[#A3927C] truncate">{pageData.url}</p>
        </div>
      )}

      <button
        onClick={handleCapture}
        disabled={isCapturing || !pageData}
        className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
          captureSuccess
            ? 'bg-[#7A9C85] text-white'
            : 'bg-[#A3927C] text-white hover:bg-[#655B52]'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isCapturing ? 'Capturing...' : captureSuccess ? '✓ Captured!' : 'Capture Product'}
      </button>
    </div>
  );
}

export default Popup;
```

### style.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Environment Variables

Create `apps/extension/.env.local.example`:

```bash
PLASMO_PUBLIC_SUPABASE_URL=your-project-url
PLASMO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## Database: Supabase Migrations

### Location: `supabase/migrations/`

### 00001_initial_schema.sql

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- PATINA DATABASE SCHEMA
-- Initial migration - Core tables for product catalog and teaching system
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable vector extension for future ML features
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── VENDORS ───────────────────────────────────────────────────────────────

CREATE TABLE vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    website TEXT,
    trade_terms TEXT,
    contact_info JSONB,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vendors_name ON vendors(name);

-- ─── PRODUCTS ──────────────────────────────────────────────────────────────

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    price_retail INTEGER, -- Stored in cents
    price_trade INTEGER,  -- Stored in cents
    dimensions JSONB,     -- { width, height, depth, unit }
    materials TEXT[] DEFAULT '{}',
    source_url TEXT NOT NULL,
    images TEXT[] DEFAULT '{}',
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    captured_by UUID NOT NULL, -- Will reference auth.users
    captured_at TIMESTAMPTZ NOT NULL,
    quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100),
    embedding vector(1536), -- For future ML similarity search
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_vendor ON products(vendor_id);
CREATE INDEX idx_products_captured_at ON products(captured_at DESC);
CREATE INDEX idx_products_embedding ON products USING ivfflat (embedding vector_cosine_ops);

-- ─── STYLES ────────────────────────────────────────────────────────────────

CREATE TABLE styles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    parent_id UUID REFERENCES styles(id) ON DELETE SET NULL,
    description TEXT,
    visual_markers TEXT[] DEFAULT '{}',
    embedding vector(1536), -- For style similarity
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_styles_name ON styles(name);
CREATE INDEX idx_styles_parent ON styles(parent_id);

-- ─── PRODUCT-STYLE RELATIONSHIPS ───────────────────────────────────────────

CREATE TABLE product_styles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    style_id UUID NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
    confidence REAL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
    assigned_by UUID NOT NULL, -- Will reference auth.users
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, style_id)
);

CREATE INDEX idx_product_styles_product ON product_styles(product_id);
CREATE INDEX idx_product_styles_style ON product_styles(style_id);

-- ─── PRODUCT RELATIONS ─────────────────────────────────────────────────────

CREATE TYPE relation_type AS ENUM ('pairs_with', 'alternative', 'never_with');

CREATE TABLE product_relations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_a_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    product_b_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    relation_type relation_type NOT NULL,
    notes TEXT,
    assigned_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_a_id, product_b_id, relation_type),
    CHECK (product_a_id != product_b_id)
);

CREATE INDEX idx_product_relations_a ON product_relations(product_a_id);
CREATE INDEX idx_product_relations_b ON product_relations(product_b_id);

-- ─── PROJECTS ──────────────────────────────────────────────────────────────

CREATE TYPE project_status AS ENUM ('active', 'completed', 'archived');

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    client_profile_id UUID, -- Will reference client_profiles
    status project_status DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_status ON projects(status);

-- ─── PROJECT-PRODUCT RELATIONSHIPS ─────────────────────────────────────────

CREATE TABLE project_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    notes TEXT,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, product_id)
);

CREATE INDEX idx_project_products_project ON project_products(project_id);
CREATE INDEX idx_project_products_product ON project_products(product_id);

-- ─── CLIENT PROFILES ───────────────────────────────────────────────────────

CREATE TABLE client_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    archetype TEXT,
    budget_range JSONB, -- { min, max, currency }
    style_preferences UUID[] DEFAULT '{}', -- Array of style IDs
    quiz_responses JSONB,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key from projects to client_profiles
ALTER TABLE projects 
ADD CONSTRAINT fk_projects_client_profile 
FOREIGN KEY (client_profile_id) REFERENCES client_profiles(id) ON DELETE SET NULL;

-- ─── QUIZ SESSIONS ─────────────────────────────────────────────────────────

CREATE TABLE quiz_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID, -- Nullable for anonymous users
    responses JSONB DEFAULT '[]',
    computed_profile JSONB,
    completed_at TIMESTAMPTZ,
    conversion_event TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quiz_sessions_user ON quiz_sessions(user_id);
CREATE INDEX idx_quiz_sessions_completed ON quiz_sessions(completed_at);

-- ─── UPDATED_AT TRIGGER ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_vendors_updated_at
    BEFORE UPDATE ON vendors
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_styles_updated_at
    BEFORE UPDATE ON styles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_client_profiles_updated_at
    BEFORE UPDATE ON client_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ─── ROW LEVEL SECURITY ────────────────────────────────────────────────────

-- Enable RLS on all tables
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY;

-- For development: Allow all authenticated users full access
-- TODO: Implement proper role-based policies before production

CREATE POLICY "Allow authenticated access to vendors"
    ON vendors FOR ALL
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated access to products"
    ON products FOR ALL
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated access to styles"
    ON styles FOR ALL
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated access to product_styles"
    ON product_styles FOR ALL
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated access to product_relations"
    ON product_relations FOR ALL
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated access to projects"
    ON projects FOR ALL
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated access to project_products"
    ON project_products FOR ALL
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated access to client_profiles"
    ON client_profiles FOR ALL
    TO authenticated
    USING (true);

CREATE POLICY "Allow all access to quiz_sessions"
    ON quiz_sessions FOR ALL
    TO anon, authenticated
    USING (true);
```

### supabase/seed.sql

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- SEED DATA FOR DEVELOPMENT
-- ═══════════════════════════════════════════════════════════════════════════

-- Insert initial style taxonomy
INSERT INTO styles (name, description, visual_markers) VALUES
    ('Modern', 'Clean lines, minimal ornamentation, functional design', ARRAY['clean lines', 'minimal', 'functional']),
    ('Traditional', 'Classic design elements, ornate details, rich woods', ARRAY['ornate', 'classic', 'wood grain']),
    ('Transitional', 'Blend of traditional and contemporary elements', ARRAY['balanced', 'timeless']),
    ('Industrial', 'Raw materials, exposed elements, urban aesthetic', ARRAY['metal', 'exposed', 'raw']),
    ('Scandinavian', 'Light woods, minimalism, hygge comfort', ARRAY['light wood', 'minimal', 'cozy']),
    ('Bohemian', 'Eclectic mix, global influences, layered textures', ARRAY['eclectic', 'textured', 'colorful']),
    ('Coastal', 'Beach-inspired, light colors, natural materials', ARRAY['light', 'natural', 'breezy']),
    ('Farmhouse', 'Rustic charm, practical design, warm materials', ARRAY['rustic', 'warm', 'practical']);

-- Insert child styles
INSERT INTO styles (name, parent_id, description, visual_markers)
SELECT 'Mid-Century Modern', id, 'Post-war design movement, organic forms, iconic pieces', ARRAY['tapered legs', 'organic curves', 'teak']
FROM styles WHERE name = 'Modern';

INSERT INTO styles (name, parent_id, description, visual_markers)
SELECT 'Contemporary', id, 'Current trends, evolving aesthetics, innovative materials', ARRAY['current', 'innovative', 'fresh']
FROM styles WHERE name = 'Modern';

INSERT INTO styles (name, parent_id, description, visual_markers)
SELECT 'Danish Modern', id, 'Danish design principles, craftsmanship, functionality', ARRAY['danish', 'crafted', 'oak']
FROM styles WHERE name = 'Scandinavian';

-- Insert sample vendor
INSERT INTO vendors (name, website, trade_terms, notes) VALUES
    ('Sample Manufacturer', 'https://example.com', 'Net 30, 40% trade discount', 'Development seed data');

-- Insert sample project
INSERT INTO projects (name, status, notes) VALUES
    ('Sample Project', 'active', 'Development seed data - feel free to delete');
```

---

## README.md

Create `README.md` at project root:

```markdown
# Strata

> The foundation for Patina — Where Time Adds Value

Strata is the monorepo housing all Patina applications: a furniture intelligence platform that captures designer expertise and transforms it into AI-powered recommendations.

## Architecture

```
strata/
├── apps/
│   ├── portal/        # Next.js Designer Portal (PWA)
│   ├── extension/     # Plasmo Chrome Extension
│   └── mobile/        # React Native + Expo (Phase 4)
├── packages/
│   ├── shared/        # TypeScript types, validation, utilities
│   ├── ui/            # Shared React components
│   └── supabase/      # Database client & hooks
└── supabase/
    ├── migrations/    # SQL migrations
    └── functions/     # Edge Functions
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Supabase CLI

### Setup

1. **Clone and install dependencies:**

   ```bash
   git clone git@github.com:middlewest/strata.git
   cd strata
   pnpm install
   ```

2. **Configure environment variables:**

   ```bash
   cp apps/portal/.env.local.example apps/portal/.env.local
   cp apps/extension/.env.local.example apps/extension/.env.local
   ```

   Fill in your Supabase credentials.

3. **Initialize the database:**

   ```bash
   pnpm db:push
   ```

4. **Start development servers:**

   ```bash
   pnpm dev
   ```

   This starts:
   - Portal: http://localhost:3000
   - Extension: Load unpacked from `apps/extension/build/chrome-mv3-dev`

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all apps for production |
| `pnpm lint` | Run ESLint across all packages |
| `pnpm type-check` | Run TypeScript type checking |
| `pnpm db:generate` | Generate TypeScript types from Supabase |
| `pnpm db:push` | Push migrations to Supabase |
| `pnpm db:studio` | Open Supabase Studio |

## Development Workflow

### Adding a New Feature

1. Create shared types in `@strata/shared`
2. Add database migration if needed
3. Generate updated types: `pnpm db:generate`
4. Implement in target app(s)

### Chrome Extension Development

1. Run `pnpm --filter @strata/extension dev`
2. Open `chrome://extensions`
3. Enable Developer mode
4. Click "Load unpacked"
5. Select `apps/extension/build/chrome-mv3-dev`

## Tech Stack

- **Framework:** Next.js 14 (App Router), Plasmo, Expo
- **Language:** TypeScript
- **Database:** PostgreSQL (Supabase) + pgvector
- **Styling:** Tailwind CSS
- **State:** TanStack Query
- **Monorepo:** Turborepo + pnpm

## License

Private - All rights reserved
```

---

## Execution Checklist

When Claude Code executes this PRD, verify each step:

- [ ] Root directory `strata/` created
- [ ] `pnpm-workspace.yaml` configured
- [ ] `turbo.json` configured
- [ ] Root `package.json` with workspace scripts
- [ ] Root `tsconfig.json` base configuration
- [ ] ESLint and Prettier configured
- [ ] `.gitignore` created
- [ ] `@strata/shared` package with types, validation, utils
- [ ] `@strata/supabase` package with client and hooks
- [ ] `@strata/portal` Next.js app initialized
- [ ] `@strata/extension` Plasmo app initialized
- [ ] Supabase migrations created
- [ ] Seed data file created
- [ ] README.md documentation
- [ ] All packages can resolve workspace dependencies
- [ ] `pnpm install` completes without errors
- [ ] `pnpm type-check` passes
- [ ] `pnpm dev` starts both portal and extension

---

## Success Criteria

The monorepo is considered successfully bootstrapped when:

1. **Builds pass:** `pnpm build` completes without errors
2. **Types work:** Shared types import correctly in all apps
3. **Portal runs:** http://localhost:3000 shows the home page
4. **Extension loads:** Chrome extension popup renders
5. **Database connected:** Portal can query empty products table
6. **Hot reload works:** Changes in any app reflect immediately

---

*This PRD is designed for execution by Claude Code. Each section is self-contained and can be implemented incrementally.*
