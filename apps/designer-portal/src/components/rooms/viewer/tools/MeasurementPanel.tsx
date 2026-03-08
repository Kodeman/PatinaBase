'use client';

import { useState } from 'react';
import { Ruler, Trash2, Save, X } from 'lucide-react';
import { useViewerStore } from '@/stores/viewer-store';

export function MeasurementPanel() {
  const {
    measurementPoints,
    currentMeasurement,
    savedMeasurements,
    saveMeasurement,
    clearMeasurement,
    deleteMeasurement,
    unitSystem,
    setUnitSystem,
  } = useViewerStore();

  const [labelInput, setLabelInput] = useState('');
  const [showLabelInput, setShowLabelInput] = useState(false);

  const formatDistance = (meters: number): string => {
    if (unitSystem === 'imperial') {
      const feet = meters * 3.28084;
      const wholeFeet = Math.floor(feet);
      const inches = Math.round((feet - wholeFeet) * 12);
      return inches === 12 ? `${wholeFeet + 1}' 0"` : `${wholeFeet}' ${inches}"`;
    }
    return `${meters.toFixed(2)} m`;
  };

  const handleSave = () => {
    if (showLabelInput && labelInput.trim()) {
      saveMeasurement(labelInput.trim());
      setLabelInput('');
      setShowLabelInput(false);
    } else if (!showLabelInput) {
      setShowLabelInput(true);
    }
  };

  const handleSaveWithoutLabel = () => {
    saveMeasurement();
    setLabelInput('');
    setShowLabelInput(false);
  };

  return (
    <div className="p-4 border-b border-white/10">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium flex items-center gap-2">
          <Ruler className="w-4 h-4" />
          Measurements
        </h3>
        <div className="flex gap-1">
          <button
            onClick={() => setUnitSystem('metric')}
            className={`px-2 py-0.5 text-xs rounded ${
              unitSystem === 'metric'
                ? 'bg-white/20 text-white'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            m
          </button>
          <button
            onClick={() => setUnitSystem('imperial')}
            className={`px-2 py-0.5 text-xs rounded ${
              unitSystem === 'imperial'
                ? 'bg-white/20 text-white'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            ft
          </button>
        </div>
      </div>

      {/* Current measurement */}
      {measurementPoints.length > 0 && (
        <div className="mb-4 p-3 bg-blue-500/20 rounded-lg border border-blue-500/30">
          <div className="text-sm text-blue-300 mb-1">
            {measurementPoints.length === 1 ? 'Click second point' : 'Current measurement'}
          </div>
          {currentMeasurement !== null && (
            <>
              <div className="text-2xl font-bold text-white mb-2">
                {formatDistance(currentMeasurement)}
              </div>

              {showLabelInput ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={labelInput}
                    onChange={(e) => setLabelInput(e.target.value)}
                    placeholder="Label (optional)"
                    className="flex-1 px-2 py-1 text-sm bg-white/10 border border-white/20 rounded text-white placeholder:text-white/40"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSave();
                      if (e.key === 'Escape') {
                        setShowLabelInput(false);
                        setLabelInput('');
                      }
                    }}
                  />
                  <button
                    onClick={handleSave}
                    className="p-1.5 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setShowLabelInput(false);
                      setLabelInput('');
                    }}
                    className="p-1.5 text-white/40 rounded hover:text-white/60"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveWithoutLabel}
                    className="flex-1 px-3 py-1.5 text-sm bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleSave}
                    className="px-3 py-1.5 text-sm bg-white/10 text-white/60 rounded hover:bg-white/20"
                  >
                    + Label
                  </button>
                  <button
                    onClick={clearMeasurement}
                    className="px-3 py-1.5 text-sm text-white/40 rounded hover:text-white/60"
                  >
                    Clear
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Saved measurements */}
      {savedMeasurements.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-white/40 uppercase tracking-wide">
            Saved ({savedMeasurements.length})
          </div>
          {savedMeasurements.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between p-2 bg-white/5 rounded-lg"
            >
              <div>
                {m.label && (
                  <div className="text-sm text-white/80">{m.label}</div>
                )}
                <div className={`font-mono ${m.label ? 'text-xs text-white/40' : 'text-sm'}`}>
                  {unitSystem === 'imperial'
                    ? m.distanceFormatted.imperial
                    : m.distanceFormatted.metric}
                </div>
              </div>
              <button
                onClick={() => deleteMeasurement(m.id)}
                className="p-1.5 text-white/30 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {measurementPoints.length === 0 && savedMeasurements.length === 0 && (
        <div className="text-sm text-white/40 text-center py-4">
          Click on the model to start measuring
        </div>
      )}
    </div>
  );
}
