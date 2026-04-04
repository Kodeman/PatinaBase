/**
 * Collapsible editable details section for extracted product data.
 * Collapsed by default to keep capture quick; expandable for editing.
 */

import { useState } from 'react';
import type { ExtractedDimensions } from '@patina/shared';
import { StrataMark } from './StrataMark';

interface EditableDetailsProps {
  description: string;
  setDescription: (v: string) => void;
  materials: string[];
  setMaterials: (v: string[]) => void;
  colors: string[];
  setColors: (v: string[]) => void;
  finish: string;
  setFinish: (v: string) => void;
  dimensions: EditableDimensions;
  setDimensions: (v: EditableDimensions) => void;
  setHasInteracted: (v: boolean) => void;
}

export interface EditableDimensions {
  width: string;
  height: string;
  depth: string;
  seatHeight: string;
  seatDepth: string;
  armHeight: string;
  unit: 'in' | 'cm';
}

export function dimensionsFromExtracted(d: ExtractedDimensions | null): EditableDimensions {
  if (!d) return { width: '', height: '', depth: '', seatHeight: '', seatDepth: '', armHeight: '', unit: 'in' };
  return {
    width: d.width != null ? String(d.width) : '',
    height: d.height != null ? String(d.height) : '',
    depth: d.depth != null ? String(d.depth) : '',
    seatHeight: d.seatHeight != null ? String(d.seatHeight) : '',
    seatDepth: d.seatDepth != null ? String(d.seatDepth) : '',
    armHeight: d.armHeight != null ? String(d.armHeight) : '',
    unit: d.unit || 'in',
  };
}

export function dimensionsToPayload(d: EditableDimensions): ExtractedDimensions | null {
  const w = d.width ? parseFloat(d.width) : null;
  const h = d.height ? parseFloat(d.height) : null;
  const dp = d.depth ? parseFloat(d.depth) : null;
  if (w == null && h == null && dp == null) return null;
  return {
    width: w, height: h, depth: dp,
    seatHeight: d.seatHeight ? parseFloat(d.seatHeight) : null,
    seatDepth: d.seatDepth ? parseFloat(d.seatDepth) : null,
    seatWidth: null,
    armHeight: d.armHeight ? parseFloat(d.armHeight) : null,
    backHeight: null, legHeight: null, clearance: null,
    unit: d.unit,
    raw: '',
  };
}

function buildSummary(materials: string[], colors: string[], finish: string, dimensions: EditableDimensions): string {
  const parts: string[] = [];
  if (colors.length > 0) parts.push(`${colors.length} color${colors.length > 1 ? 's' : ''}`);
  if (materials.length > 0) parts.push(materials.slice(0, 2).join(', '));
  if (finish) parts.push(finish);
  if (dimensions.width || dimensions.height || dimensions.depth) {
    const dims = [
      dimensions.width && `${dimensions.width}"W`,
      dimensions.height && `${dimensions.height}"H`,
      dimensions.depth && `${dimensions.depth}"D`,
    ].filter(Boolean).join(' x ');
    parts.push(dims);
  }
  return parts.length > 0 ? parts.join(' · ') : 'No details extracted';
}

export function EditableDetails({
  description, setDescription,
  materials, setMaterials,
  colors, setColors,
  finish, setFinish,
  dimensions, setDimensions,
  setHasInteracted,
}: EditableDetailsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newMaterial, setNewMaterial] = useState('');
  const [newColor, setNewColor] = useState('');
  const [showFurnitureDims, setShowFurnitureDims] = useState(
    !!(dimensions.seatHeight || dimensions.seatDepth || dimensions.armHeight)
  );

  const summary = buildSummary(materials, colors, finish, dimensions);

  const handleAddChip = (
    value: string,
    setter: (v: string) => void,
    list: string[],
    listSetter: (v: string[]) => void,
  ) => {
    const trimmed = value.trim();
    if (trimmed && !list.includes(trimmed)) {
      setHasInteracted(true);
      listSetter([...list, trimmed]);
    }
    setter('');
  };

  const handleRemoveChip = (index: number, list: string[], listSetter: (v: string[]) => void) => {
    setHasInteracted(true);
    listSetter(list.filter((_, i) => i !== index));
  };

  const dimInput = (label: string, field: keyof EditableDimensions) => (
    <div className="flex-1">
      <label className="block font-mono text-[0.55rem] uppercase tracking-[0.06em] text-aged-oak mb-0.5">{label}</label>
      <input
        type="text"
        inputMode="decimal"
        value={dimensions[field]}
        onChange={(e) => {
          setHasInteracted(true);
          setDimensions({ ...dimensions, [field]: e.target.value.replace(/[^0-9.]/g, '') });
        }}
        placeholder="—"
        className="w-full px-2 py-1 text-[0.85rem] rounded-[3px] border border-pearl focus:border-clay focus:ring-1 focus:ring-clay outline-none"
      />
    </div>
  );

  return (
    <div className="rounded-md border border-pearl overflow-hidden">
      {/* Header / toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between bg-off-white hover:bg-pearl/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.06em] text-aged-oak">Details</p>
          {!isExpanded && (
            <p className="text-[0.78rem] text-aged-oak truncate max-w-[220px]">{summary}</p>
          )}
        </div>
        <svg className={`w-4 h-4 text-aged-oak transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-3 py-3 space-y-3">
          {/* Description */}
          <div>
            <label className="block font-mono text-[0.65rem] uppercase tracking-[0.06em] text-aged-oak mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => { setHasInteracted(true); setDescription(e.target.value.slice(0, 1000)); }}
              placeholder="Product description..."
              rows={3}
              maxLength={1000}
              className="w-full px-2 py-1.5 text-[0.88rem] rounded-[3px] border border-pearl focus:border-clay focus:ring-1 focus:ring-clay outline-none resize-none"
            />
            <p className="text-right font-mono text-[0.55rem] text-aged-oak">{description.length}/1000</p>
          </div>

          <StrataMark variant="micro" />

          {/* Materials */}
          <div>
            <label className="block font-mono text-[0.65rem] uppercase tracking-[0.06em] text-aged-oak mb-1">Materials</label>
            <div className="flex flex-wrap gap-1 mb-1.5">
              {materials.map((m, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-off-white border border-pearl rounded-sm text-[0.78rem] text-charcoal">
                  {m}
                  <button onClick={() => handleRemoveChip(i, materials, setMaterials)} className="text-aged-oak hover:text-terracotta">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={newMaterial}
              onChange={(e) => setNewMaterial(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddChip(newMaterial, setNewMaterial, materials, setMaterials); } }}
              placeholder="Add material (Enter)"
              className="w-full px-2 py-1 text-[0.85rem] rounded-[3px] border border-pearl focus:border-clay focus:ring-1 focus:ring-clay outline-none"
            />
          </div>

          {/* Colors */}
          <div>
            <label className="block font-mono text-[0.65rem] uppercase tracking-[0.06em] text-aged-oak mb-1">Colors</label>
            <div className="flex flex-wrap gap-1 mb-1.5">
              {colors.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-off-white border border-pearl rounded-sm text-[0.78rem] text-charcoal">
                  {c}
                  <button onClick={() => handleRemoveChip(i, colors, setColors)} className="text-aged-oak hover:text-terracotta">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddChip(newColor, setNewColor, colors, setColors); } }}
              placeholder="Add color (Enter)"
              className="w-full px-2 py-1 text-[0.85rem] rounded-[3px] border border-pearl focus:border-clay focus:ring-1 focus:ring-clay outline-none"
            />
          </div>

          <StrataMark variant="micro" />

          {/* Finish */}
          <div>
            <label className="block font-mono text-[0.65rem] uppercase tracking-[0.06em] text-aged-oak mb-1">Finish</label>
            <input
              type="text"
              value={finish}
              onChange={(e) => { setHasInteracted(true); setFinish(e.target.value); }}
              placeholder="e.g., Matte, Polished, Natural"
              className="w-full px-2 py-1 text-[0.85rem] rounded-[3px] border border-pearl focus:border-clay focus:ring-1 focus:ring-clay outline-none"
            />
          </div>

          {/* Dimensions */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-mono text-[0.65rem] uppercase tracking-[0.06em] text-aged-oak">Dimensions</label>
              <select
                value={dimensions.unit}
                onChange={(e) => { setHasInteracted(true); setDimensions({ ...dimensions, unit: e.target.value as 'in' | 'cm' }); }}
                className="font-mono text-[0.65rem] px-1 py-0.5 rounded-[3px] border border-pearl outline-none"
              >
                <option value="in">inches</option>
                <option value="cm">cm</option>
              </select>
            </div>
            <div className="flex gap-2">
              {dimInput('W', 'width')}
              <span className="self-end pb-1 text-[0.78rem] text-aged-oak">x</span>
              {dimInput('H', 'height')}
              <span className="self-end pb-1 text-[0.78rem] text-aged-oak">x</span>
              {dimInput('D', 'depth')}
            </div>

            {/* Furniture-specific dimensions */}
            <button
              onClick={() => setShowFurnitureDims(!showFurnitureDims)}
              className="mt-1.5 font-mono text-[0.62rem] uppercase tracking-[0.04em] text-aged-oak hover:text-mocha"
            >
              {showFurnitureDims ? '- Hide' : '+ Show'} furniture details
            </button>
            {showFurnitureDims && (
              <div className="flex gap-2 mt-1.5">
                {dimInput('Seat H', 'seatHeight')}
                {dimInput('Seat D', 'seatDepth')}
                {dimInput('Arm H', 'armHeight')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
