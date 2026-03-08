'use client';

import { useState, useEffect } from 'react';
import { Save, FolderOpen, Trash2, Check } from 'lucide-react';
import {
  Button,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Badge,
} from '@patina/design-system';
import type { CatalogFilters } from './catalog-filters';

interface FilterPreset {
  id: string;
  name: string;
  filters: CatalogFilters;
  createdAt: string;
}

interface FilterPresetsProps {
  currentFilters: CatalogFilters;
  onLoadPreset: (filters: CatalogFilters) => void;
}

export function FilterPresets({ currentFilters, onLoadPreset }: FilterPresetsProps) {
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isLoadDialogOpen, setIsLoadDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState('');

  // Load presets from localStorage on mount
  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = () => {
    try {
      const stored = localStorage.getItem('filterPresets');
      if (stored) {
        setPresets(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load filter presets:', error);
    }
  };

  const savePresets = (newPresets: FilterPreset[]) => {
    try {
      localStorage.setItem('filterPresets', JSON.stringify(newPresets));
      setPresets(newPresets);
    } catch (error) {
      console.error('Failed to save filter presets:', error);
    }
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) return;

    const newPreset: FilterPreset = {
      id: Date.now().toString(),
      name: presetName.trim(),
      filters: currentFilters,
      createdAt: new Date().toISOString(),
    };

    savePresets([...presets, newPreset]);
    setPresetName('');
    setIsSaveDialogOpen(false);
  };

  const handleLoadPreset = (preset: FilterPreset) => {
    onLoadPreset(preset.filters);
    setIsLoadDialogOpen(false);
  };

  const handleDeletePreset = (id: string) => {
    savePresets(presets.filter((p) => p.id !== id));
  };

  const getFilterCount = (filters: CatalogFilters) => {
    return Object.keys(filters).filter((key) => {
      const value = filters[key as keyof CatalogFilters];
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== null;
    }).length;
  };

  const hasActiveFilters = getFilterCount(currentFilters) > 0;

  return (
    <>
      {/* Save/Load Buttons */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsSaveDialogOpen(true)}
          disabled={!hasActiveFilters}
        >
          <Save className="mr-2 h-4 w-4" />
          Save Filters
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsLoadDialogOpen(true)}
          disabled={presets.length === 0}
        >
          <FolderOpen className="mr-2 h-4 w-4" />
          Load Preset
          {presets.length > 0 && (
            <Badge variant="solid" className="ml-2">
              {presets.length}
            </Badge>
          )}
        </Button>
      </div>

      {/* Save Dialog */}
      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Filter Preset</DialogTitle>
            <DialogDescription>
              Give your current filter combination a name to save it for later use.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="presetName">Preset Name</Label>
              <Input
                id="presetName"
                placeholder="e.g., Modern Living Room"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSavePreset();
                  }
                }}
                className="mt-2"
              />
            </div>

            <div className="rounded-lg border p-4 bg-muted/50">
              <h4 className="text-sm font-semibold mb-3">Active Filters</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(currentFilters).map(([key, value]) => {
                  if (!value || (Array.isArray(value) && value.length === 0)) return null;
                  return (
                    <Badge key={key} variant="subtle" color="neutral">
                      {key}: {Array.isArray(value) ? value.join(', ') : String(value)}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePreset} disabled={!presetName.trim()}>
              <Save className="mr-2 h-4 w-4" />
              Save Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load Dialog */}
      <Dialog open={isLoadDialogOpen} onOpenChange={setIsLoadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Load Filter Preset</DialogTitle>
            <DialogDescription>
              Choose a saved filter preset to apply to your search.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {presets.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FolderOpen className="mx-auto h-12 w-12 mb-2 opacity-50" />
                <p>No saved presets yet</p>
                <p className="text-sm">Save your current filters to create a preset</p>
              </div>
            ) : (
              presets.map((preset) => (
                <div
                  key={preset.id}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent transition-colors group"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold">{preset.name}</h4>
                      <Badge variant="subtle" color="neutral" className="text-xs">
                        {getFilterCount(preset.filters)} filters
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mb-2">
                      Saved {new Date(preset.createdAt).toLocaleDateString()}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(preset.filters).map(([key, value]) => {
                        if (!value || (Array.isArray(value) && value.length === 0)) return null;
                        return (
                          <Badge key={key} variant="subtle" color="neutral" className="text-xs">
                            {key}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleLoadPreset(preset)}
                    >
                      <Check className="mr-1 h-3 w-3" />
                      Load
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeletePreset(preset.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLoadDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
