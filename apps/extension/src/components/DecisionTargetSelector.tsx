/**
 * PT-D-2-T5-1 — Client / Project / Room target selector for the
 * "Send as decision option" capture path.
 *
 * Renders three cascading native <select> dropdowns:
 *   - Client  — populated from `designer_clients` (RLS scopes to the
 *               current designer). The chosen row's id IS the
 *               `designer_client_id` FK that `client_decisions` requires.
 *   - Project — the active projects belonging to the selected client
 *               (joined on projects.client_id = designer_clients.client_id).
 *   - Room    — `project_rooms` for the selected project (migration 00172
 *               room linkage). Optional.
 *
 * Stays purely presentational about its own state — the parent owns the
 * selected ids. Queries Supabase directly (via the extension's client)
 * because Chrome extensions can't import the React Query hooks from
 * @patina/supabase — the same constraint documented on FFESlotPicker and
 * mirrored by ProposalTargetSelector.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface DecisionClientOption {
  /** designer_clients.id — the designer_client_id FK for the decision. */
  id: string;
  /** designer_clients.client_id (profile id) — used to find the client's projects. */
  clientId: string | null;
  label: string;
}

export interface DecisionProjectOption {
  id: string;
  name: string;
}

export interface DecisionRoomOption {
  id: string;
  name: string;
}

interface DecisionTargetSelectorProps {
  /** designer_clients.id */
  designerClientId: string | null;
  projectId: string | null;
  roomId: string | null;
  onDesignerClientChange: (designerClientId: string | null, clientId: string | null) => void;
  onProjectChange: (projectId: string | null) => void;
  onRoomChange: (roomId: string | null) => void;
  /** Disable the whole selector (e.g. while a save is in flight). */
  disabled?: boolean;
}

export function DecisionTargetSelector({
  designerClientId,
  projectId,
  roomId,
  onDesignerClientChange,
  onProjectChange,
  onRoomChange,
  disabled = false,
}: DecisionTargetSelectorProps) {
  const [clients, setClients] = useState<DecisionClientOption[]>([]);
  const [projects, setProjects] = useState<DecisionProjectOption[]>([]);
  const [rooms, setRooms] = useState<DecisionRoomOption[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(false);

  // Load the designer's clients once on mount. RLS scopes to the signed-in
  // designer, so we don't filter by designer_id explicitly.
  useEffect(() => {
    let cancelled = false;
    setLoadingClients(true);
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('designer_clients')
          .select('id, client_id, client_name, client:profiles!client_id(full_name, email)')
          .order('updated_at', { ascending: false });
        if (cancelled) return;
        if (error || !data) {
          setClients([]);
        } else {
          // Supabase types the embedded `profiles` relation as an array; it's a
          // to-one join here, so normalise to the first (only) row.
          const rows = data as unknown as Array<{
            id: string;
            client_id: string | null;
            client_name: string | null;
            client:
              | { full_name: string | null; email: string | null }
              | Array<{ full_name: string | null; email: string | null }>
              | null;
          }>;
          setClients(
            rows.map((c) => {
              const profile = Array.isArray(c.client) ? c.client[0] : c.client;
              return {
                id: c.id,
                clientId: c.client_id,
                label:
                  profile?.full_name ||
                  c.client_name ||
                  profile?.email ||
                  'Unnamed client',
              };
            })
          );
        }
      } catch {
        if (!cancelled) setClients([]);
      } finally {
        if (!cancelled) setLoadingClients(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // When the client changes, fetch that client's active projects.
  useEffect(() => {
    if (!designerClientId) {
      setProjects([]);
      return;
    }
    // Resolve the underlying client profile id so we can scope projects.
    const selected = clients.find((c) => c.id === designerClientId);
    const clientProfileId = selected?.clientId ?? null;
    if (!clientProfileId) {
      setProjects([]);
      return;
    }

    let cancelled = false;
    setLoadingProjects(true);
    supabase
      .from('projects')
      .select('id, name')
      .eq('client_id', clientProfileId)
      .eq('status', 'active')
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setProjects([]);
        } else {
          setProjects(data as DecisionProjectOption[]);
        }
        setLoadingProjects(false);
      });
    return () => {
      cancelled = true;
    };
  }, [designerClientId, clients]);

  // When the project changes, fetch its rooms (migration 00172 linkage).
  useEffect(() => {
    if (!projectId) {
      setRooms([]);
      return;
    }
    let cancelled = false;
    setLoadingRooms(true);
    supabase
      .from('project_rooms')
      .select('id, name')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setRooms([]);
        } else {
          setRooms(data as DecisionRoomOption[]);
        }
        setLoadingRooms(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Clear downstream selections when an upstream one is removed / changed so
  // the parent never holds a stale project/room id.
  useEffect(() => {
    if (!designerClientId) {
      if (projectId) onProjectChange(null);
      if (roomId) onRoomChange(null);
    } else if (
      projectId &&
      projects.length > 0 &&
      !projects.some((p) => p.id === projectId)
    ) {
      onProjectChange(null);
    }
  }, [designerClientId, projectId, projects, roomId, onProjectChange, onRoomChange]);

  useEffect(() => {
    if (!projectId) {
      if (roomId) onRoomChange(null);
    } else if (roomId && rooms.length > 0 && !rooms.some((r) => r.id === roomId)) {
      onRoomChange(null);
    }
  }, [projectId, roomId, rooms, onRoomChange]);

  return (
    <div className="space-y-2">
      {/* Client (required) */}
      <label className="block">
        <span className="block font-mono text-[0.65rem] uppercase tracking-[0.06em] text-aged-oak mb-1">
          Client <span className="text-terracotta">*</span>
        </span>
        <select
          value={designerClientId ?? ''}
          disabled={disabled || loadingClients}
          onChange={(e) => {
            const next = e.target.value || null;
            const match = clients.find((c) => c.id === next) ?? null;
            onDesignerClientChange(next, match?.clientId ?? null);
          }}
          className="w-full px-3 py-2 text-[0.85rem] rounded-[3px] border border-pearl bg-surface text-charcoal outline-none focus:border-clay focus:ring-1 focus:ring-clay disabled:opacity-50"
        >
          <option value="">
            {loadingClients
              ? 'Loading…'
              : clients.length === 0
                ? 'No clients yet'
                : 'Select client…'}
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      {/* Project (optional) */}
      <label className="block">
        <span className="block font-mono text-[0.65rem] uppercase tracking-[0.06em] text-aged-oak mb-1">
          Project <span className="text-aged-oak">(optional)</span>
        </span>
        <select
          value={projectId ?? ''}
          disabled={disabled || !designerClientId || loadingProjects}
          onChange={(e) => onProjectChange(e.target.value || null)}
          className="w-full px-3 py-2 text-[0.85rem] rounded-[3px] border border-pearl bg-surface text-charcoal outline-none focus:border-clay focus:ring-1 focus:ring-clay disabled:opacity-50"
        >
          <option value="">
            {!designerClientId
              ? 'Select a client first'
              : loadingProjects
                ? 'Loading…'
                : projects.length === 0
                  ? 'No active projects'
                  : 'No specific project'}
          </option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      {/* Room (optional) */}
      <label className="block">
        <span className="block font-mono text-[0.65rem] uppercase tracking-[0.06em] text-aged-oak mb-1">
          Room <span className="text-aged-oak">(optional)</span>
        </span>
        <select
          value={roomId ?? ''}
          disabled={disabled || !projectId || loadingRooms}
          onChange={(e) => onRoomChange(e.target.value || null)}
          className="w-full px-3 py-2 text-[0.85rem] rounded-[3px] border border-pearl bg-surface text-charcoal outline-none focus:border-clay focus:ring-1 focus:ring-clay disabled:opacity-50"
        >
          <option value="">
            {!projectId
              ? 'Select a project first'
              : loadingRooms
                ? 'Loading…'
                : rooms.length === 0
                  ? 'No rooms in this project'
                  : 'No specific room'}
          </option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
