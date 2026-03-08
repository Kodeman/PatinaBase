/**
 * Hooks for client management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mockData } from '@/data/mock-designer-data';
import { userManagementApi } from '@/lib/api-client';
import { withMockData } from '@/lib/mock-data';
import { queryKeys } from '@/lib/react-query';

interface ClientListParams {
  designerId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

interface CreateClientData {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  address?: Record<string, unknown>;
  designerId?: string;
  metadata?: Record<string, unknown>;
}

export function useClients(params: ClientListParams = {}) {
  return useQuery({
    queryKey: queryKeys.clients.list(params),
    queryFn: () =>
      withMockData(
        () => userManagementApi.getClients(params),
        () => mockData.getClients(params)
      ),
  });
}

export function useClient(clientId: string | null) {
  return useQuery({
    queryKey: queryKeys.clients.detail(clientId || ''),
    queryFn: () => {
      if (!clientId) throw new Error('Client ID required');
      return withMockData(
        () => userManagementApi.getClient(clientId),
        () => {
          const client = mockData.getClientById(clientId);
          if (!client) {
            throw new Error('Client not found');
          }
          return client;
        }
      );
    },
    enabled: !!clientId,
  });
}

export function useClientProjects(clientId: string | null) {
  return useQuery({
    queryKey: clientId ? ['clients', clientId, 'projects'] : ['clients', 'null', 'projects'],
    queryFn: () => {
      if (!clientId) throw new Error('Client ID required');
      return withMockData(
        () => userManagementApi.getClientProjects(clientId),
        () => mockData.getClientProjects(clientId)
      );
    },
    enabled: !!clientId,
  });
}

export function useClientOrders(clientId: string | null) {
  return useQuery({
    queryKey: clientId ? ['clients', clientId, 'orders'] : ['clients', 'null', 'orders'],
    queryFn: () => {
      if (!clientId) throw new Error('Client ID required');
      return withMockData(
        () => userManagementApi.getClientOrders(clientId),
        () => mockData.getClientOrders(clientId)
      );
    },
    enabled: !!clientId,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateClientData) => userManagementApi.createClient(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.all });
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      userManagementApi.updateClient(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.clients.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.all });
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => userManagementApi.deleteClient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.all });
    },
  });
}
