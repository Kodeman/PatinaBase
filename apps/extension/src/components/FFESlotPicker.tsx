import { useEffect, useState } from 'react';
import type { Project, UUID } from '@patina/shared';
import { supabase } from '../lib/supabase';
import {
  placeProductInProject,
  saveSpecBookPlacementContext,
  type SpecBookPlacementContext,
  type PlacementOutcome,
  type SpecBookPlacementRoute,
} from '../lib/spec-book-placement';

interface Room {
  id: UUID;
  name: string;
}

interface FFESlot {
  id: UUID;
  name: string;
  ffe_category: string | null;
  quantity: number;
}

type RouteKind = SpecBookPlacementRoute['kind'];

interface FFESlotPickerProps {
  projects: Project[];
  initialContext?: SpecBookPlacementContext;
  /**
   * Present only on the legacy post-save surface. Selection mode is used in
   * the capture form and defers the RPC until the Product is durable.
   */
  productId?: UUID;
  productName?: string;
  onRouteChange?: (route: SpecBookPlacementRoute | null, valid: boolean) => void;
  onComplete?: () => void;
  onCancel?: () => void;
}

function messageFor(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const value = error as {
      message?: string;
      details?: string;
      hint?: string;
    };
    return value.message || value.details || value.hint || 'Could not place the product';
  }
  return 'Could not place the product';
}

export function FFESlotPicker({
  projects,
  initialContext,
  productId,
  productName = 'Captured piece',
  onRouteChange,
  onComplete,
  onCancel,
}: FFESlotPickerProps) {
  const assigningExisting = !!productId;
  const [routeKind, setRouteKind] = useState<RouteKind>(
    assigningExisting ? 'fill_slot' : (initialContext?.routeKind ?? 'library')
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialContext?.projectId ?? null
  );
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(
    initialContext?.roomId ?? null
  );
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [slots, setSlots] = useState<FFESlot[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<PlacementOutcome | null>(null);

  // Self-heal a stale sticky project selection (e.g. archived/completed since
  // it was remembered) the same way the rooms effect below self-heals a
  // stale room: if it's not in the active projects list, drop it.
  useEffect(() => {
    if (selectedProjectId && !projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(null);
      setSelectedRoomId(null);
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setRooms([]);
      return;
    }
    let active = true;
    setLoadingRooms(true);
    void supabase
      .from('project_rooms')
      .select('id, name')
      .eq('project_id', selectedProjectId)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        if (!active) return;
        const next = (data ?? []) as Room[];
        setRooms(next);
        if (selectedRoomId && !next.some((room) => room.id === selectedRoomId)) {
          setSelectedRoomId(null);
        }
        setLoadingRooms(false);
      });
    return () => {
      active = false;
    };
  }, [selectedProjectId, selectedRoomId]);

  useEffect(() => {
    if (routeKind !== 'fill_slot' || !selectedProjectId || !selectedRoomId) {
      setSlots([]);
      setSelectedSlotId(null);
      return;
    }
    let active = true;
    setLoadingSlots(true);
    void supabase
      .from('project_ffe_items')
      .select('id, name, ffe_category, quantity, product_id')
      .eq('project_id', selectedProjectId)
      .eq('project_room_id', selectedRoomId)
      .is('product_id', null)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        if (!active) return;
        setSlots((data ?? []) as FFESlot[]);
        setLoadingSlots(false);
      });
    return () => {
      active = false;
    };
  }, [routeKind, selectedProjectId, selectedRoomId]);

  const currentRoute = (): SpecBookPlacementRoute | null => {
    if (routeKind === 'library') return { kind: 'library' };
    if (!selectedProjectId) return null;
    if (routeKind === 'project_inbox') {
      return {
        kind: 'project_inbox',
        projectId: selectedProjectId,
        roomId: selectedRoomId,
      };
    }
    if (!selectedRoomId) return null;
    if (routeKind === 'fill_slot') {
      return selectedSlotId
        ? {
            kind: 'fill_slot',
            projectId: selectedProjectId,
            roomId: selectedRoomId,
            slotId: selectedSlotId,
          }
        : null;
    }
    return category.trim()
      ? {
          kind: 'create_line',
          projectId: selectedProjectId,
          roomId: selectedRoomId,
          category: category.trim(),
        }
      : null;
  };

  const publish = () => {
    const route = currentRoute();
    onRouteChange?.(route, route !== null);
  };

  useEffect(publish, [routeKind, selectedProjectId, selectedRoomId, selectedSlotId, category]);

  const remember = (projectId: string | null, roomId: string | null, kind: RouteKind) => {
    void saveSpecBookPlacementContext({ projectId, roomId, routeKind: kind });
  };

  const handleAssign = async () => {
    const route = currentRoute();
    if (!productId || !route || route.kind === 'library') return;
    setAssigning(true);
    setError('');
    try {
      const placed = await placeProductInProject(productId, route, {
        sourceUrl: '',
        captureKind: 'post_save',
      }, { duplicateMode: 'reuse' });
      if (!placed) throw new Error('Project placement returned no outcome');
      setOutcome(placed);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-line bg-paper-2 p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-ink-soft">
          {assigningExisting ? `Place ${productName}` : 'Capture destination'}
        </span>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={assigning}
            className="min-h-11 px-2 font-mono text-[0.58rem] uppercase tracking-[0.06em] text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
          >
            Cancel
          </button>
        )}
      </div>

      {!assigningExisting && (
        <select
          aria-label="Capture destination"
          value={routeKind}
          onChange={(event) => {
            const kind = event.target.value as RouteKind;
            setRouteKind(kind);
            remember(selectedProjectId, selectedRoomId, kind);
          }}
          className="min-h-11 w-full rounded-md border border-line bg-paper-3 px-2.5 py-2 text-[0.85rem] text-ink outline-none focus:border-verdigris focus-visible:ring-2 focus-visible:ring-verdigris"
        >
          <option value="library">Library</option>
          <option value="project_inbox">Project inbox</option>
          <option value="fill_slot">An open spot in a room</option>
          <option value="create_line">A new item in a room</option>
        </select>
      )}

      {routeKind !== 'library' && (
        <select
          aria-label="Project"
          value={selectedProjectId ?? ''}
          onChange={(event) => {
            const projectId = event.target.value || null;
            setSelectedProjectId(projectId);
            setSelectedRoomId(null);
            setSelectedSlotId(null);
            remember(projectId, null, routeKind);
          }}
          disabled={assigning}
          className="min-h-11 w-full rounded-md border border-line bg-paper-3 px-2.5 py-2 text-[0.85rem] text-ink outline-none focus:border-verdigris focus-visible:ring-2 focus-visible:ring-verdigris"
        >
          <option value="">Select project…</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      )}

      {routeKind !== 'library' && selectedProjectId && (
        <select
          aria-label="Room"
          value={selectedRoomId ?? ''}
          onChange={(event) => {
            const roomId = event.target.value || null;
            setSelectedRoomId(roomId);
            setSelectedSlotId(null);
            remember(selectedProjectId, roomId, routeKind);
          }}
          disabled={assigning || loadingRooms}
          className="min-h-11 w-full rounded-md border border-line bg-paper-3 px-2.5 py-2 text-[0.85rem] text-ink outline-none focus:border-verdigris focus-visible:ring-2 focus-visible:ring-verdigris disabled:opacity-50"
        >
          <option value="">{loadingRooms ? 'Loading rooms…' : 'Project inbox / no room'}</option>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
            </option>
          ))}
        </select>
      )}

      {routeKind === 'fill_slot' && selectedRoomId && (
        <select
          aria-label="Open spot"
          value={selectedSlotId ?? ''}
          onChange={(event) => setSelectedSlotId(event.target.value || null)}
          disabled={assigning || loadingSlots}
          className="min-h-11 w-full rounded-md border border-line bg-paper-3 px-2.5 py-2 text-[0.85rem] text-ink outline-none focus:border-verdigris focus-visible:ring-2 focus-visible:ring-verdigris disabled:opacity-50"
        >
          <option value="">{loadingSlots ? 'Loading slots…' : 'Choose an open spot…'}</option>
          {slots.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {slot.name}
              {slot.ffe_category ? ` · ${slot.ffe_category}` : ''}
              {slot.quantity > 1 ? ` · qty ${slot.quantity}` : ''}
            </option>
          ))}
        </select>
      )}

      {routeKind === 'create_line' && selectedRoomId && (
        <input
          aria-label="Item category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          maxLength={200}
          placeholder="Category, e.g. seating"
          className="w-full rounded-md border border-line bg-paper-3 px-2.5 py-2 text-[0.85rem] text-ink outline-none placeholder:text-ink-faint focus:border-verdigris"
        />
      )}

      {error && (
        <p role="alert" className="text-[0.78rem] text-rust">
          {error}. The product is safe in your library; retry this placement.
        </p>
      )}

      {outcome && (
        <div role="status" className="rounded-md border border-verdigris/40 bg-verdigris/5 p-3 text-[0.78rem] text-ink">
          {outcome.outcome === 'reused'
            ? 'Reused the existing project selection.'
            : outcome.outcome === 'filled'
              ? 'Filled the selected project need.'
              : outcome.outcome === 'held'
                ? 'Held the project placement for review.'
                : 'Created a new project selection.'}
          <button type="button" onClick={onComplete} className="mt-2 block font-mono text-[0.62rem] uppercase tracking-[0.08em] text-verdigris">
            Done
          </button>
        </div>
      )}

      {assigningExisting && !outcome && (
        <button
          type="button"
          onClick={handleAssign}
          disabled={!currentRoute() || assigning}
          className="min-h-11 w-full rounded-md bg-verdigris-ink py-2.5 text-[0.82rem] font-medium text-paper hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris focus-visible:ring-offset-2 disabled:opacity-50"
        >
          {assigning ? 'Placing…' : error ? 'Retry placement' : 'Place product'}
        </button>
      )}
    </div>
  );
}
