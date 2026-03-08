'use client';

import { useClientArchetypes, useAppealSignals } from '@patina/supabase';
import type { AppealCategory } from '@patina/types';

interface ClientArchetype {
  id: string;
  name: string;
  description: string | null;
  visual_cues: string[];
  display_order: number | null;
}

interface AppealSignal {
  id: string;
  name: string;
  category: string;
  description: string | null;
}

interface ClientMatchingPanelProps {
  idealClientIds: string[];
  avoidanceClientIds: string[];
  appealSignalIds: string[];
  onIdealClientsChange: (ids: string[]) => void;
  onAvoidanceClientsChange: (ids: string[]) => void;
  onAppealSignalsChange: (ids: string[]) => void;
  disabled?: boolean;
}

const APPEAL_CATEGORIES: { id: AppealCategory; label: string; description: string }[] = [
  { id: 'visual', label: 'Visual', description: 'Aesthetic appeal factors' },
  { id: 'functional', label: 'Functional', description: 'Practical benefits' },
  { id: 'emotional', label: 'Emotional', description: 'Feelings evoked' },
  { id: 'lifestyle', label: 'Lifestyle', description: 'Identity expression' },
];

export function ClientMatchingPanel({
  idealClientIds,
  avoidanceClientIds,
  appealSignalIds,
  onIdealClientsChange,
  onAvoidanceClientsChange,
  onAppealSignalsChange,
  disabled = false,
}: ClientMatchingPanelProps) {
  const { data: archetypes, isLoading: archetypesLoading } = useClientArchetypes();
  const { data: signals, isLoading: signalsLoading } = useAppealSignals();

  const idealSet = new Set(idealClientIds);
  const avoidanceSet = new Set(avoidanceClientIds);
  const signalSet = new Set(appealSignalIds);

  const toggleIdealClient = (id: string) => {
    if (disabled) return;

    // If currently in avoidance, remove from there
    if (avoidanceSet.has(id)) {
      onAvoidanceClientsChange(avoidanceClientIds.filter((i) => i !== id));
    }

    // Toggle in ideal
    if (idealSet.has(id)) {
      onIdealClientsChange(idealClientIds.filter((i) => i !== id));
    } else {
      onIdealClientsChange([...idealClientIds, id]);
    }
  };

  const toggleAvoidanceClient = (id: string) => {
    if (disabled) return;

    // If currently in ideal, remove from there
    if (idealSet.has(id)) {
      onIdealClientsChange(idealClientIds.filter((i) => i !== id));
    }

    // Toggle in avoidance
    if (avoidanceSet.has(id)) {
      onAvoidanceClientsChange(avoidanceClientIds.filter((i) => i !== id));
    } else {
      onAvoidanceClientsChange([...avoidanceClientIds, id]);
    }
  };

  const toggleSignal = (id: string) => {
    if (disabled) return;

    if (signalSet.has(id)) {
      onAppealSignalsChange(appealSignalIds.filter((i) => i !== id));
    } else {
      onAppealSignalsChange([...appealSignalIds, id]);
    }
  };

  const groupedSignals = APPEAL_CATEGORIES.map((category) => ({
    ...category,
    signals: ((signals as AppealSignal[]) || []).filter((s) => s.category === category.id),
  }));

  return (
    <div className="space-y-8">
      {/* Client Archetypes */}
      <section>
        <h3 className="font-medium text-patina-charcoal mb-2">Client Matching</h3>
        <p className="text-sm text-patina-mocha-brown/70 mb-4">
          Select client types this product would appeal to, or mark as not suitable.
        </p>

        {archetypesLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-20 bg-patina-clay-beige/30 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {((archetypes as ClientArchetype[]) || []).map((archetype) => {
              const isIdeal = idealSet.has(archetype.id);
              const isAvoidance = avoidanceSet.has(archetype.id);

              return (
                <div
                  key={archetype.id}
                  className={`relative p-3 rounded-lg border-2 transition-all ${
                    isIdeal
                      ? 'border-green-500 bg-green-50'
                      : isAvoidance
                      ? 'border-red-400 bg-red-50'
                      : 'border-patina-clay-beige/50 bg-white'
                  }`}
                >
                  <p className="text-sm font-medium text-patina-charcoal mb-2">{archetype.name}</p>

                  <div className="flex gap-1">
                    <button
                      onClick={() => toggleIdealClient(archetype.id)}
                      disabled={disabled}
                      className={`flex-1 py-1 text-xs rounded transition-colors ${
                        isIdeal
                          ? 'bg-green-500 text-white'
                          : 'bg-patina-clay-beige/30 text-patina-mocha-brown hover:bg-green-100'
                      } disabled:opacity-50`}
                      title="Mark as ideal for this client type"
                    >
                      Ideal
                    </button>
                    <button
                      onClick={() => toggleAvoidanceClient(archetype.id)}
                      disabled={disabled}
                      className={`flex-1 py-1 text-xs rounded transition-colors ${
                        isAvoidance
                          ? 'bg-red-500 text-white'
                          : 'bg-patina-clay-beige/30 text-patina-mocha-brown hover:bg-red-100'
                      } disabled:opacity-50`}
                      title="Mark as not suitable for this client type"
                    >
                      Avoid
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Selection summary */}
        {(idealClientIds.length > 0 || avoidanceClientIds.length > 0) && (
          <div className="mt-3 flex gap-4 text-sm">
            {idealClientIds.length > 0 && (
              <span className="text-green-700">
                {idealClientIds.length} ideal {idealClientIds.length === 1 ? 'match' : 'matches'}
              </span>
            )}
            {avoidanceClientIds.length > 0 && (
              <span className="text-red-600">
                {avoidanceClientIds.length} to avoid
              </span>
            )}
          </div>
        )}
      </section>

      {/* Appeal Signals */}
      <section>
        <h3 className="font-medium text-patina-charcoal mb-2">Appeal Signals</h3>
        <p className="text-sm text-patina-mocha-brown/70 mb-4">
          What makes this product appealing? Select all that apply.
        </p>

        {signalsLoading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 w-24 bg-patina-clay-beige/30 rounded mb-2" />
                <div className="flex gap-2">
                  {[...Array(4)].map((_, j) => (
                    <div key={j} className="h-8 w-20 bg-patina-clay-beige/30 rounded-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {groupedSignals.map((category) => (
              <div key={category.id}>
                <p className="text-xs font-medium text-patina-mocha-brown mb-2">
                  {category.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {category.signals.map((signal) => {
                    const isSelected = signalSet.has(signal.id);

                    return (
                      <button
                        key={signal.id}
                        onClick={() => toggleSignal(signal.id)}
                        disabled={disabled}
                        className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                          isSelected
                            ? 'bg-patina-mocha-brown text-white'
                            : 'bg-patina-clay-beige/30 text-patina-charcoal hover:bg-patina-clay-beige/50'
                        } disabled:opacity-50`}
                        title={signal.description || undefined}
                      >
                        {signal.name}
                      </button>
                    );
                  })}
                  {category.signals.length === 0 && (
                    <span className="text-sm text-patina-mocha-brown/50">No signals defined</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Signal count */}
        {appealSignalIds.length > 0 && (
          <p className="mt-3 text-sm text-patina-mocha-brown">
            {appealSignalIds.length} appeal signal{appealSignalIds.length !== 1 ? 's' : ''} selected
          </p>
        )}
      </section>
    </div>
  );
}
