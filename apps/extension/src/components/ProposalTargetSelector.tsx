/**
 * Wave 2 — Proposal/Room/Category target selector for the capture form.
 *
 * Renders three native <select> dropdowns:
 *   - Proposal — populated from `list_designer_open_proposals` RPC.
 *   - Room     — populated from proposal_scope_rooms when a proposal is set.
 *   - Category — populated from useFFECategories (system + designer +
 *                proposal-scoped) when a proposal is set.
 *
 * Stays purely presentational — the parent owns state.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface OpenProposal {
  id: string;
  title: string;
  project_name: string | null;
  scope_rooms_count: number;
}

export interface ScopeRoomOption {
  id: string;
  name: string;
}

export interface FFECategoryOption {
  slug: string;
  label: string;
  is_system: boolean;
}

interface ProposalTargetSelectorProps {
  proposalId: string | null;
  scopeRoomId: string | null;
  ffeCategorySlug: string | null;
  onProposalChange: (proposalId: string | null) => void;
  onScopeRoomChange: (scopeRoomId: string | null) => void;
  onCategoryChange: (slug: string | null) => void;
  /** Disable the whole selector (e.g. while a save is in flight). */
  disabled?: boolean;
}

export function ProposalTargetSelector({
  proposalId,
  scopeRoomId,
  ffeCategorySlug,
  onProposalChange,
  onScopeRoomChange,
  onCategoryChange,
  disabled = false,
}: ProposalTargetSelectorProps) {
  const [proposals, setProposals] = useState<OpenProposal[]>([]);
  const [rooms, setRooms] = useState<ScopeRoomOption[]>([]);
  const [categories, setCategories] = useState<FFECategoryOption[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);

  // Load open proposals once on mount.
  useEffect(() => {
    let cancelled = false;
    setLoadingProposals(true);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('list_designer_open_proposals');
        if (cancelled) return;
        if (error || !data) {
          setProposals([]);
        } else {
          setProposals(data as OpenProposal[]);
        }
      } catch {
        if (!cancelled) setProposals([]);
      } finally {
        if (!cancelled) setLoadingProposals(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // When the proposal changes, fetch its scope rooms + categories.
  useEffect(() => {
    if (!proposalId) {
      setRooms([]);
      setCategories([]);
      return;
    }

    let cancelled = false;
    setLoadingRooms(true);
    setLoadingCategories(true);

    Promise.all([
      supabase
        .from('proposal_scope_rooms')
        .select('id, name')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('ffe_categories')
        .select('slug, label, is_system, designer_id, proposal_id, sort_order')
        .order('is_system', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('label', { ascending: true }),
    ])
      .then(([roomsRes, catsRes]) => {
        if (cancelled) return;
        if (roomsRes.data) {
          setRooms(roomsRes.data as ScopeRoomOption[]);
        } else {
          setRooms([]);
        }

        if (catsRes.data) {
          // RLS already filters down to system + my designer rows + the
          // visible proposal-scoped rows. Mirror useFFECategories: drop
          // any proposal-scoped row that doesn't belong to this proposal.
          const filtered = (catsRes.data as Array<FFECategoryOption & {
            designer_id: string | null;
            proposal_id: string | null;
          }>).filter(
            (c) =>
              c.is_system ||
              c.designer_id !== null ||
              c.proposal_id === proposalId
          );
          setCategories(filtered.map(({ slug, label, is_system }) => ({ slug, label, is_system })));
        } else {
          setCategories([]);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setRooms([]);
        setCategories([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingRooms(false);
        setLoadingCategories(false);
      });
    return () => {
      cancelled = true;
    };
  }, [proposalId]);

  // If the selected room becomes invalid (proposal change), clear it.
  useEffect(() => {
    if (!proposalId) {
      if (scopeRoomId) onScopeRoomChange(null);
      if (ffeCategorySlug) onCategoryChange(null);
    } else if (scopeRoomId && rooms.length > 0 && !rooms.some((r) => r.id === scopeRoomId)) {
      onScopeRoomChange(null);
    }
  }, [proposalId, scopeRoomId, rooms, ffeCategorySlug, onScopeRoomChange, onCategoryChange]);

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="block font-mono text-[0.65rem] uppercase tracking-[0.06em] text-aged-oak mb-1">
          Proposal <span className="text-aged-oak">(optional)</span>
        </span>
        <select
          value={proposalId ?? ''}
          disabled={disabled || loadingProposals}
          onChange={(e) => onProposalChange(e.target.value || null)}
          className="w-full px-3 py-2 text-[0.85rem] rounded-[3px] border border-pearl bg-surface text-charcoal outline-none focus:border-clay focus:ring-1 focus:ring-clay disabled:opacity-50"
        >
          <option value="">{loadingProposals ? 'Loading…' : 'No proposal target'}</option>
          {proposals.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
              {p.project_name ? ` — ${p.project_name}` : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="block font-mono text-[0.65rem] uppercase tracking-[0.06em] text-aged-oak mb-1">
          Room
        </span>
        <select
          value={scopeRoomId ?? ''}
          disabled={disabled || !proposalId || loadingRooms}
          onChange={(e) => onScopeRoomChange(e.target.value || null)}
          className="w-full px-3 py-2 text-[0.85rem] rounded-[3px] border border-pearl bg-surface text-charcoal outline-none focus:border-clay focus:ring-1 focus:ring-clay disabled:opacity-50"
        >
          <option value="">
            {!proposalId
              ? 'Select a proposal first'
              : loadingRooms
                ? 'Loading…'
                : rooms.length === 0
                  ? 'No rooms in scope'
                  : 'Select room…'}
          </option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="block font-mono text-[0.65rem] uppercase tracking-[0.06em] text-aged-oak mb-1">
          FF&amp;E Category
        </span>
        <select
          value={ffeCategorySlug ?? ''}
          disabled={disabled || !proposalId || loadingCategories}
          onChange={(e) => onCategoryChange(e.target.value || null)}
          className="w-full px-3 py-2 text-[0.85rem] rounded-[3px] border border-pearl bg-surface text-charcoal outline-none focus:border-clay focus:ring-1 focus:ring-clay disabled:opacity-50"
        >
          <option value="">
            {!proposalId
              ? 'Select a proposal first'
              : loadingCategories
                ? 'Loading…'
                : 'Select category…'}
          </option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
              {c.is_system ? '' : ' (custom)'}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
