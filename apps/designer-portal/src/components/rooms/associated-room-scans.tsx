'use client';

import { useState } from 'react';
import {
  useRoomScanAssociations,
  useDesignerSharedScans,
  useAssociateRoomScanWithProject,
} from '@patina/supabase';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@patina/design-system';
import {
  Box,
  Camera,
  Check,
  Loader2,
  Maximize2,
  Plus,
  Ruler,
  ScanLine,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type AssociationContext =
  | { type: 'client'; clientId: string }
  | { type: 'project'; projectId: string; clientId?: string };

interface AssociatedRoomScansProps {
  /** Determines whether scans are filtered by client or project */
  context: AssociationContext;
  /** Callback when user wants to view a scan */
  onViewScan?: (scanId: string) => void;
}

/**
 * Reusable component that lists room scans associated with a client or project.
 * Includes a picker dialog to associate new scans from the designer's shared collection.
 */
export function AssociatedRoomScans({ context, onViewScan }: AssociatedRoomScansProps) {
  const [showPicker, setShowPicker] = useState(false);

  // Build filters based on context
  const filters =
    context.type === 'client'
      ? { consumerId: context.clientId, status: 'active' as const }
      : { projectId: context.projectId, status: 'active' as const };

  const { data: associations = [], isLoading } = useRoomScanAssociations(filters);

  const scanCount = associations.length;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <ScanLine className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Room Scans</h2>
          </div>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Room Scans</h2>
              {scanCount > 0 && (
                <Badge variant="secondary">{scanCount}</Badge>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowPicker(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Associate Scan
            </Button>
          </div>

          {scanCount === 0 ? (
            <div className="text-center py-8">
              <Box className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="font-medium text-sm mb-1">No scans associated</p>
              <p className="text-sm text-muted-foreground">
                {context.type === 'client'
                  ? 'Associate room scans shared by this client.'
                  : 'Link room scans from the client to this project.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {associations.map((assoc) => {
                const scan = assoc.scan;
                if (!scan) return null;

                return (
                  <div
                    key={assoc.id}
                    className="relative rounded-lg border overflow-hidden hover:border-primary/40 transition-colors"
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-video bg-muted">
                      {scan.thumbnailUrl ? (
                        <img
                          src={scan.thumbnailUrl}
                          alt={scan.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Camera className="h-10 w-10 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <h3 className="font-medium text-sm truncate mb-1">
                        {scan.name}
                      </h3>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                        {scan.roomType && (
                          <span className="capitalize">
                            {scan.roomType.replace('_', ' ')}
                          </span>
                        )}
                        {scan.floorArea && (
                          <span className="flex items-center gap-1">
                            <Ruler className="h-3 w-3" />
                            {scan.floorArea.toFixed(0)} m²
                          </span>
                        )}
                        {scan.dimensions && (
                          <span className="text-xs">
                            {scan.dimensions.width}&times;{scan.dimensions.length}&times;{scan.dimensions.height}{' '}
                            {scan.dimensions.unit}
                          </span>
                        )}
                      </div>

                      {/* Shared-at date */}
                      {assoc.sharedAt && (
                        <p className="text-xs text-muted-foreground mb-3">
                          Shared {new Date(assoc.sharedAt).toLocaleDateString()}
                        </p>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => onViewScan?.(scan.id)}
                      >
                        <Maximize2 className="h-4 w-4 mr-2" />
                        View Scan
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scan picker dialog */}
      <ScanPickerDialog
        open={showPicker}
        onOpenChange={setShowPicker}
        context={context}
        existingScanIds={associations.map((a) => a.scanId)}
      />
    </>
  );
}

// ─── Scan Picker Dialog ──────────────────────────────────────────────────────

interface ScanPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: AssociationContext;
  existingScanIds: string[];
}

function ScanPickerDialog({
  open,
  onOpenChange,
  context,
  existingScanIds,
}: ScanPickerDialogProps) {
  const { data: sharedScans = [], isLoading } = useDesignerSharedScans();
  const associateWithProject = useAssociateRoomScanWithProject();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAssociating, setIsAssociating] = useState(false);

  // Filter out already-associated scans, and for project context filter to the client
  const availableScans = sharedScans.filter((assoc) => {
    if (!assoc.scan) return false;
    if (existingScanIds.includes(assoc.scanId)) return false;
    if (context.type === 'project' && context.clientId && assoc.consumerId !== context.clientId) {
      return false;
    }
    return true;
  });

  const toggleScan = (scanId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(scanId)) {
        next.delete(scanId);
      } else {
        next.add(scanId);
      }
      return next;
    });
  };

  const handleAssociate = async () => {
    if (selectedIds.size === 0) return;
    setIsAssociating(true);

    try {
      if (context.type === 'project') {
        // Associate each selected scan with the project via the project_id column
        await Promise.all(
          Array.from(selectedIds).map((scanId) =>
            associateWithProject.mutateAsync({
              scanId,
              projectId: context.projectId,
            })
          )
        );
      }
      // For client context, the scans are already associated via the consumer_id
      // on the room_scan_associations table. No additional mutation is needed since
      // the designer already has a shared association with the client's scans.

      setSelectedIds(new Set());
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to associate scans:', err);
    } finally {
      setIsAssociating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {context.type === 'client'
              ? 'Scans Shared With You'
              : 'Associate Scans with Project'}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[400px] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : availableScans.length === 0 ? (
            <div className="text-center py-12">
              <ScanLine className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {context.type === 'project'
                  ? 'No additional scans available to associate.'
                  : 'No shared scans available.'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Scans must be shared with you by the client first.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {availableScans.map((assoc) => {
                const scan = assoc.scan!;
                const isSelected = selectedIds.has(assoc.scanId);

                return (
                  <button
                    key={assoc.id}
                    type="button"
                    onClick={() => toggleScan(assoc.scanId)}
                    className={cn(
                      'flex items-center gap-4 p-3 rounded-lg border text-left transition-colors w-full',
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'
                    )}
                  >
                    {/* Thumbnail */}
                    <div className="relative h-16 w-24 flex-shrink-0 rounded bg-muted overflow-hidden">
                      {scan.thumbnailUrl ? (
                        <img
                          src={scan.thumbnailUrl}
                          alt={scan.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <Camera className="h-6 w-6 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{scan.name}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        {scan.roomType && (
                          <span className="capitalize">
                            {scan.roomType.replace('_', ' ')}
                          </span>
                        )}
                        {scan.floorArea && (
                          <span className="flex items-center gap-1">
                            <Ruler className="h-3 w-3" />
                            {scan.floorArea.toFixed(0)} m²
                          </span>
                        )}
                      </div>
                      {assoc.consumer && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          From: {assoc.consumer.fullName || assoc.consumer.email}
                        </p>
                      )}
                    </div>

                    {/* Selection indicator */}
                    <div
                      className={cn(
                        'flex-shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors',
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground/30'
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {context.type === 'project' && availableScans.length > 0 && (
            <Button
              onClick={handleAssociate}
              disabled={selectedIds.size === 0 || isAssociating}
            >
              {isAssociating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Associate {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
