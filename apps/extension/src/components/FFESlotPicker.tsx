/**
 * FFESlotPicker — Sprint 3 / Wave 3.3 capture-to-slot integration.
 *
 * Renders a 3-stage cascading picker (project → room → unassigned FFE slot)
 * that lets the designer attach a freshly captured product to an existing FFE
 * line item on an active project. The product row already exists in `products`
 * (written by the capture flow in sidepanel.tsx). This component performs the
 * follow-on update:
 *
 *   UPDATE project_ffe_items
 *      SET product_id = $productId
 *    WHERE id = $ffeItemId
 *      AND project_id = $projectId
 *
 * Scoping is enforced both by the existing project_ffe_items RLS policy
 * (designer_id = auth.uid() through the projects join) AND by the explicit
 * project_id filter — defense in depth matching the W1.2.6 pattern used by
 * useUpdateFFEItemStatus in @patina/supabase.
 *
 * The hook `useAssignProductToFfeSlot` in @patina/supabase performs the same
 * update from the portal; this component duplicates the call directly via the
 * extension's Supabase client because Chrome extensions can't import React
 * Query hooks (different React tree, different query client).
 *
 * Slots already linked to a different product (product_id IS NOT NULL) are
 * filtered out so the designer can't accidentally overwrite an existing
 * assignment. To replace an existing assignment, the designer reopens the
 * slot in the portal.
 */
import { useEffect, useState } from 'react';
import type { Project, UUID } from '@patina/shared';
import { supabase } from '../lib/supabase';

interface Room {
  id: UUID;
  name: string;
}

interface FFESlot {
  id: UUID;
  name: string;
  ffe_category: string | null;
  quantity: number;
  status: string;
  sort_order: number;
}

interface FFESlotPickerProps {
  productId: UUID;
  productName: string;
  projects: Project[];
  /** Pre-selected project from the main capture form (optional). */
  initialProjectId?: UUID | null;
  onComplete: () => void;
  onCancel: () => void;
}

export function FFESlotPicker({
  productId,
  productName,
  projects,
  initialProjectId,
  onComplete,
  onCancel,
}: FFESlotPickerProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<UUID | null>(
    initialProjectId ?? null
  );
  const [selectedRoomId, setSelectedRoomId] = useState<UUID | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<UUID | null>(null);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [slots, setSlots] = useState<FFESlot[]>([]);

  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string>('');
  const [assignSuccess, setAssignSuccess] = useState(false);

  // Load rooms whenever the chosen project changes.
  useEffect(() => {
    if (!selectedProjectId) {
      setRooms([]);
      setSelectedRoomId(null);
      return;
    }
    let cancelled = false;
    setIsLoadingRooms(true);
    supabase
      .from('project_rooms')
      .select('id, name')
      .eq('project_id', selectedProjectId)
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setRooms([]);
        } else {
          setRooms((data ?? []) as Room[]);
        }
        setIsLoadingRooms(false);
        // Reset downstream selection.
        setSelectedRoomId(null);
        setSelectedSlotId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  // Load unassigned FFE slots for the chosen project + room.
  useEffect(() => {
    if (!selectedProjectId || !selectedRoomId) {
      setSlots([]);
      setSelectedSlotId(null);
      return;
    }
    let cancelled = false;
    setIsLoadingSlots(true);
    supabase
      .from('project_ffe_items')
      .select('id, name, ffe_category, quantity, status, sort_order, product_id')
      .eq('project_id', selectedProjectId)
      .eq('project_room_id', selectedRoomId)
      .is('product_id', null)
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setSlots([]);
        } else {
          setSlots((data ?? []) as FFESlot[]);
        }
        setIsLoadingSlots(false);
        setSelectedSlotId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, selectedRoomId]);

  const canSubmit =
    !!selectedProjectId && !!selectedRoomId && !!selectedSlotId && !isAssigning;

  const handleAssign = async () => {
    if (!selectedProjectId || !selectedSlotId) return;

    setIsAssigning(true);
    setAssignError('');

    try {
      const { error } = await supabase
        .from('project_ffe_items')
        .update({ product_id: productId })
        .eq('id', selectedSlotId)
        .eq('project_id', selectedProjectId)
        .select('id, product_id')
        .single();

      if (error) throw error;
      setAssignSuccess(true);
      // Brief delay so the success state is visible before we dismiss.
      setTimeout(() => onComplete(), 600);
    } catch (err) {
      let message = 'Failed to assign product to slot';
      if (err instanceof Error) {
        message = err.message;
      } else if (err && typeof err === 'object') {
        const e = err as { message?: string; details?: string; hint?: string };
        message = e.message || e.details || e.hint || message;
      }
      setAssignError(message);
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <div className="space-y-3 p-3 border border-pearl rounded-md bg-surface">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[0.95rem] text-charcoal">
          Assign to FFE slot
        </h3>
        <button
          type="button"
          onClick={onCancel}
          disabled={isAssigning}
          className="font-mono text-[0.62rem] uppercase tracking-[0.06em] text-aged-oak hover:text-charcoal disabled:opacity-40"
        >
          Cancel
        </button>
      </div>

      <p className="text-[0.78rem] text-aged-oak">
        Placing <span className="font-medium text-charcoal">{productName}</span>{' '}
        in a project room slot.
      </p>

      {/* Project select */}
      <div>
        <label className="font-mono text-[0.62rem] uppercase tracking-[0.06em] text-aged-oak block mb-1">
          Project
        </label>
        <select
          value={selectedProjectId ?? ''}
          onChange={(e) => setSelectedProjectId(e.target.value || null)}
          disabled={isAssigning}
          className="w-full p-2 text-[0.85rem] border border-pearl rounded-md bg-off-white text-charcoal focus:border-clay focus:outline-none disabled:opacity-50"
        >
          <option value="">— Select project —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Room select */}
      {selectedProjectId && (
        <div>
          <label className="font-mono text-[0.62rem] uppercase tracking-[0.06em] text-aged-oak block mb-1">
            Room
          </label>
          <select
            value={selectedRoomId ?? ''}
            onChange={(e) => setSelectedRoomId(e.target.value || null)}
            disabled={isAssigning || isLoadingRooms || rooms.length === 0}
            className="w-full p-2 text-[0.85rem] border border-pearl rounded-md bg-off-white text-charcoal focus:border-clay focus:outline-none disabled:opacity-50"
          >
            <option value="">
              {isLoadingRooms
                ? 'Loading rooms…'
                : rooms.length === 0
                ? 'No rooms in this project'
                : '— Select room —'}
            </option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* FFE slot select */}
      {selectedProjectId && selectedRoomId && (
        <div>
          <label className="font-mono text-[0.62rem] uppercase tracking-[0.06em] text-aged-oak block mb-1">
            Unassigned FFE slot
          </label>
          <select
            value={selectedSlotId ?? ''}
            onChange={(e) => setSelectedSlotId(e.target.value || null)}
            disabled={isAssigning || isLoadingSlots || slots.length === 0}
            className="w-full p-2 text-[0.85rem] border border-pearl rounded-md bg-off-white text-charcoal focus:border-clay focus:outline-none disabled:opacity-50"
          >
            <option value="">
              {isLoadingSlots
                ? 'Loading slots…'
                : slots.length === 0
                ? 'No unassigned slots in this room'
                : '— Select slot —'}
            </option>
            {slots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.ffe_category ? ` · ${s.ffe_category}` : ''}
                {s.quantity > 1 ? ` · qty ${s.quantity}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Error */}
      {assignError && (
        <div className="p-2 bg-off-white border-l-[3px] border-terracotta rounded-md">
          <p className="text-[0.82rem] text-terracotta">{assignError}</p>
        </div>
      )}

      {/* Confirm button */}
      <button
        type="button"
        onClick={handleAssign}
        disabled={!canSubmit}
        className={`w-full py-2.5 px-4 rounded-[3px] text-[0.85rem] font-medium transition-all ${
          assignSuccess
            ? 'bg-sage text-white shadow-md'
            : 'bg-charcoal text-off-white hover:bg-mocha shadow-md hover:shadow-lg'
        } disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none`}
      >
        {isAssigning
          ? 'Assigning…'
          : assignSuccess
          ? 'Assigned to slot'
          : 'Assign to slot'}
      </button>
    </div>
  );
}
