import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// ═══════════════════════════════════════════════════════════════════════════
// API KEY MANAGEMENT HOOKS (Phase 4: Enterprise)
// ═══════════════════════════════════════════════════════════════════════════

// Lazy client getter
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ApiKeyEnvironment = 'live' | 'test';
export type ApiKeyStatus = 'active' | 'revoked';

export interface ApiKey {
  id: string;
  organizationId: string;
  name: string;
  keyPrefix: string;
  // keyHash is not exposed to clients for security
  scopes: string[];
  rateLimit: number;
  environment: ApiKeyEnvironment;
  status: ApiKeyStatus;
  revokedAt: string | null;
  revokedBy: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  createdAt: string;
  createdBy: string;
  expiresAt: string | null;
}

export interface CreateApiKeyInput {
  organizationId: string;
  name: string;
  scopes: string[];
  rateLimit?: number;
  environment?: ApiKeyEnvironment;
  expiresAt?: string;
}

export interface CreateApiKeyResult {
  apiKey: ApiKey;
  rawKey: string; // Only returned once at creation time
}

// Available API key scopes
export const API_KEY_SCOPES = {
  // Product operations
  PRODUCTS_READ: 'products:read',
  PRODUCTS_WRITE: 'products:write',

  // Order operations
  ORDERS_READ: 'orders:read',
  ORDERS_WRITE: 'orders:write',

  // Inventory operations
  INVENTORY_READ: 'inventory:read',
  INVENTORY_WRITE: 'inventory:write',

  // Analytics
  ANALYTICS_READ: 'analytics:read',

  // Webhooks
  WEBHOOKS_MANAGE: 'webhooks:manage',
} as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[keyof typeof API_KEY_SCOPES];

// ═══════════════════════════════════════════════════════════════════════════
// QUERY HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all API keys for an organization
 */
export function useOrganizationApiKeys(organizationId: string) {
  return useQuery({
    queryKey: ['api-keys', organizationId],
    queryFn: async () => {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map(key => ({
        id: key.id,
        organizationId: key.organization_id,
        name: key.name,
        keyPrefix: key.key_prefix,
        scopes: key.scopes,
        rateLimit: key.rate_limit,
        environment: key.environment,
        status: key.status,
        revokedAt: key.revoked_at,
        revokedBy: key.revoked_by,
        lastUsedAt: key.last_used_at,
        lastUsedIp: key.last_used_ip as string | null,
        createdAt: key.created_at,
        createdBy: key.created_by,
        expiresAt: key.expires_at,
      })) as ApiKey[];
    },
    enabled: !!organizationId,
  });
}

/**
 * Get a single API key by ID
 */
export function useApiKey(keyId: string) {
  return useQuery({
    queryKey: ['api-key', keyId],
    queryFn: async () => {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .eq('id', keyId)
        .single();

      if (error) throw error;

      return {
        id: data.id,
        organizationId: data.organization_id,
        name: data.name,
        keyPrefix: data.key_prefix,
        scopes: data.scopes,
        rateLimit: data.rate_limit,
        environment: data.environment,
        status: data.status,
        revokedAt: data.revoked_at,
        revokedBy: data.revoked_by,
        lastUsedAt: data.last_used_at,
        lastUsedIp: data.last_used_ip,
        createdAt: data.created_at,
        createdBy: data.created_by,
        expiresAt: data.expires_at,
      } as ApiKey;
    },
    enabled: !!keyId,
  });
}

/**
 * Get API key usage statistics
 */
export function useApiKeyStats(organizationId: string) {
  return useQuery({
    queryKey: ['api-key-stats', organizationId],
    queryFn: async () => {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from('api_keys')
        .select('status, environment')
        .eq('organization_id', organizationId);

      if (error) throw error;

      return {
        total: data.length,
        active: data.filter(k => k.status === 'active').length,
        revoked: data.filter(k => k.status === 'revoked').length,
        live: data.filter(k => k.environment === 'live' && k.status === 'active')
          .length,
        test: data.filter(k => k.environment === 'test' && k.status === 'active')
          .length,
      };
    },
    enabled: !!organizationId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MUTATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new API key
 * Returns the raw key only once - it cannot be retrieved later
 */
export function useCreateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateApiKeyInput): Promise<CreateApiKeyResult> => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Generate a secure random key
      const rawKey = generateApiKey(input.environment || 'test');
      const keyPrefix = rawKey.substring(0, 12);
      const keyHash = await hashApiKey(rawKey);

      const { data, error } = await supabase
        .from('api_keys')
        .insert({
          organization_id: input.organizationId,
          name: input.name,
          key_prefix: keyPrefix,
          key_hash: keyHash,
          scopes: input.scopes,
          rate_limit: input.rateLimit || 1000,
          environment: input.environment || 'test',
          status: 'active',
          created_by: user.id,
          expires_at: input.expiresAt,
        })
        .select()
        .single();

      if (error) throw error;

      return {
        apiKey: {
          id: data.id,
          organizationId: data.organization_id,
          name: data.name,
          keyPrefix: data.key_prefix,
          scopes: data.scopes,
          rateLimit: data.rate_limit,
          environment: data.environment,
          status: data.status,
          revokedAt: data.revoked_at,
          revokedBy: data.revoked_by,
          lastUsedAt: data.last_used_at,
          lastUsedIp: data.last_used_ip as string | null,
          createdAt: data.created_at,
          createdBy: data.created_by,
          expiresAt: data.expires_at,
        },
        rawKey, // Only returned once!
      };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['api-keys', variables.organizationId],
      });
      queryClient.invalidateQueries({
        queryKey: ['api-key-stats', variables.organizationId],
      });
    },
  });
}

/**
 * Update an API key (name, scopes, rate limit)
 */
export function useUpdateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      keyId,
      name,
      scopes,
      rateLimit,
    }: {
      keyId: string;
      name?: string;
      scopes?: string[];
      rateLimit?: number;
    }) => {
      const supabase = getSupabase();

      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (scopes !== undefined) updates.scopes = scopes;
      if (rateLimit !== undefined) updates.rate_limit = rateLimit;

      const { data, error } = await supabase
        .from('api_keys')
        .update(updates)
        .eq('id', keyId)
        .eq('status', 'active') // Can only update active keys
        .select('organization_id')
        .single();

      if (error) throw error;
      return { organizationId: data.organization_id };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['api-key', variables.keyId] });
      queryClient.invalidateQueries({
        queryKey: ['api-keys', data.organizationId],
      });
    },
  });
}

/**
 * Revoke an API key
 */
export function useRevokeApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ keyId }: { keyId: string }) => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('api_keys')
        .update({
          status: 'revoked',
          revoked_at: new Date().toISOString(),
          revoked_by: user.id,
        })
        .eq('id', keyId)
        .eq('status', 'active')
        .select('organization_id')
        .single();

      if (error) throw error;
      return { organizationId: data.organization_id };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['api-key', variables.keyId] });
      queryClient.invalidateQueries({
        queryKey: ['api-keys', data.organizationId],
      });
      queryClient.invalidateQueries({
        queryKey: ['api-key-stats', data.organizationId],
      });
    },
  });
}

/**
 * Regenerate an API key (creates new key, revokes old one)
 */
export function useRegenerateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ keyId }: { keyId: string }): Promise<CreateApiKeyResult> => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get the existing key details
      const { data: existingKey, error: fetchError } = await supabase
        .from('api_keys')
        .select('*')
        .eq('id', keyId)
        .single();

      if (fetchError) throw fetchError;

      // Revoke the old key
      const { error: revokeError } = await supabase
        .from('api_keys')
        .update({
          status: 'revoked',
          revoked_at: new Date().toISOString(),
          revoked_by: user.id,
        })
        .eq('id', keyId);

      if (revokeError) throw revokeError;

      // Create a new key with the same settings
      const rawKey = generateApiKey(existingKey.environment);
      const keyPrefix = rawKey.substring(0, 12);
      const keyHash = await hashApiKey(rawKey);

      const { data: newKey, error: createError } = await supabase
        .from('api_keys')
        .insert({
          organization_id: existingKey.organization_id,
          name: existingKey.name,
          key_prefix: keyPrefix,
          key_hash: keyHash,
          scopes: existingKey.scopes,
          rate_limit: existingKey.rate_limit,
          environment: existingKey.environment,
          status: 'active',
          created_by: user.id,
          expires_at: existingKey.expires_at,
        })
        .select()
        .single();

      if (createError) throw createError;

      return {
        apiKey: {
          id: newKey.id,
          organizationId: newKey.organization_id,
          name: newKey.name,
          keyPrefix: newKey.key_prefix,
          scopes: newKey.scopes,
          rateLimit: newKey.rate_limit,
          environment: newKey.environment,
          status: newKey.status,
          revokedAt: newKey.revoked_at,
          revokedBy: newKey.revoked_by,
          lastUsedAt: newKey.last_used_at,
          lastUsedIp: newKey.last_used_ip as string | null,
          createdAt: newKey.created_at,
          createdBy: newKey.created_by,
          expiresAt: newKey.expires_at,
        },
        rawKey,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: ['api-keys', result.apiKey.organizationId],
      });
      queryClient.invalidateQueries({
        queryKey: ['api-key-stats', result.apiKey.organizationId],
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a secure API key
 * Format: pk_live_xxxx or pk_test_xxxx
 */
function generateApiKey(environment: ApiKeyEnvironment): string {
  const prefix = environment === 'live' ? 'pk_live_' : 'pk_test_';
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const randomString = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}${randomString}`;
}

/**
 * Hash an API key for secure storage
 */
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
