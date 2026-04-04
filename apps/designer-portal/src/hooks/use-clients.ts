/**
 * Client management hooks — re-exports from @patina/supabase
 *
 * The canonical hooks live in packages/supabase/src/hooks/use-clients.ts.
 * This file re-exports them so existing imports within the designer portal
 * continue to work without modification.
 */

export {
  useClients,
  useClient,
  useClientStats,
  useUpdateClientStatus,
  useUpdateClientNotes,
  useClientMessages,
  useSendClientMessage,
  useClientProjects,
  useAddClient,
} from '@patina/supabase';

export type {
  DesignerClient,
  ClientLifecycleStage,
  ClientMessage,
  ClientFilters,
} from '@patina/supabase';
