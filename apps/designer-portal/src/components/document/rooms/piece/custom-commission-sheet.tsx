'use client';

import { useEffect, useMemo, useState } from 'react';
import * as PatinaData from '@patina/supabase';
import {
  CustomCommissionWorkspace,
  type CommissionWorkspaceRevision,
} from './custom-commission-workspace';
import {
  EMPTY_COMMISSION_BRIEF,
  type CommissionBriefDraft,
  type CommissionRevisionTransitionStatus,
} from './custom-commission-model';

interface QueryResult<T> {
  data?: T;
  isLoading: boolean;
  isError?: boolean;
  error?: unknown;
}

interface MutationResult<TInput, TResult = unknown> {
  mutateAsync: (input: TInput) => Promise<TResult>;
  isPending: boolean;
}

interface WireConfiguration {
  id: string;
  productId: string;
  projectId?: string | null;
  version: number;
  status: string;
  name?: string | null;
  customBrief?: Record<string, unknown> | null;
  snapshot: unknown;
  snapshotHash: string;
  issuedAt?: string | null;
  updatedAt: string;
}

interface WireRevision {
  id: string;
  configurationId: string;
  revisionNumber: number;
  status: string;
  brief: Record<string, unknown>;
  drawings?: Array<Record<string, unknown>>;
  quote?: Record<string, unknown>;
  transitionNote?: string | null;
  projectId?: string | null;
  name?: string | null;
  snapshot?: unknown;
  snapshotHash?: string | null;
  configurationSnapshot?: unknown;
  configurationSnapshotHash?: string | null;
  configurationLockedAt?: string | null;
  configurationVersion?: number | null;
  issuedAt?: string | null;
  createdAt: string;
}

interface WireProject {
  id: string;
  name: string | null;
  status?: string | null;
}

interface WireVendor {
  id: string;
  name: string;
}

interface ConfigurationHooks {
  useProjects: () => QueryResult<WireProject[]>;
  useVendors: (
    filters?: unknown,
    pagination?: { page: number; pageSize: number },
  ) => QueryResult<{ data: WireVendor[] }>;
  useSavedProductConfigurations: (
    productId: string,
  ) => QueryResult<WireConfiguration[]>;
  useCustomCommissionRevisions: (
    configurationId: string,
  ) => QueryResult<WireRevision[]>;
  useSaveProductConfiguration: () => MutationResult<
    Record<string, unknown>,
    { configuration: WireConfiguration; customRevision?: WireRevision | null }
  >;
  useTransitionCustomCommissionRevision: () => MutationResult<Record<string, unknown>>;
  usePlaceProductConfiguration: () => MutationResult<Record<string, unknown>>;
  usePromoteConfigurationToLibrary: () => MutationResult<Record<string, unknown>>;
  usePrepareConfigurationQuoteRequest: () => MutationResult<Record<string, unknown>>;
}

// The shared hooks land in the data slice and are consumed here through one
// deliberately narrow seam. Keeping the cast at this boundary prevents
// provisional row shapes from leaking through the designer surface.
const data = PatinaData as unknown as ConfigurationHooks;

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function dollars(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2);
}

function cents(value: string): number | null {
  const normalized = value.replace(/[$,\s]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}

function measurement(
  measurements: Array<Record<string, unknown>>,
  label: string,
): { value: string; unit: 'in' | 'mm' } {
  const found = measurements.find(
    (entry) => stringValue(entry.label).toLowerCase() === label,
  );
  return {
    value:
      found && (typeof found.value === 'number' || typeof found.value === 'string')
        ? String(found.value)
        : '',
    unit: found?.unit === 'mm' ? 'mm' : 'in',
  };
}

function briefFromWire(
  configuration: WireConfiguration,
  revision: WireRevision,
): CommissionBriefDraft {
  const brief = recordValue(revision.brief ?? configuration.customBrief);
  const measurements = Array.isArray(brief.measurements)
    ? brief.measurements.map(recordValue)
    : [];
  const width = measurement(measurements, 'width');
  const depth = measurement(measurements, 'depth');
  const height = measurement(measurements, 'height');
  const materials = Array.isArray(brief.materials)
    ? brief.materials.filter((value): value is string => typeof value === 'string')
    : [];
  const drawings = Array.isArray(revision.drawings)
    ? revision.drawings
    : Array.isArray(brief.drawings)
      ? brief.drawings.map(recordValue)
      : [];
  const quote = recordValue(revision.quote);
  const designerApproval = recordValue(brief.designerApproval);
  const clientApproval = recordValue(brief.clientApproval);
  const quoteCents =
    numberValue(quote.tradePriceCents) ?? numberValue(quote.retailPriceCents);
  return {
    ...EMPTY_COMMISSION_BRIEF,
    projectId: revision.projectId ?? configuration.projectId ?? '',
    name: revision.name ?? configuration.name ?? stringValue(brief.summary),
    scope: stringValue(brief.intent),
    dimensions: {
      width: width.value,
      depth: depth.value,
      height: height.value,
      unit: width.unit ?? depth.unit ?? height.unit,
      siteNotes: stringValue(brief.siteConditions),
    },
    material: materials.join(', '),
    finish: stringValue(brief.finish),
    fabricatorVendorId: stringValue(brief.fabricatorVendorId),
    fabricator: stringValue(brief.fabricatorName),
    drawingReferences: drawings
      .map((drawing) => stringValue(drawing.url) || stringValue(drawing.name))
      .filter(Boolean),
    allowance: dollars(
      numberValue(brief.allowanceCents) ?? numberValue(brief.budgetCents),
    ),
    priceOnRequest: brief.priceOnRequest !== false,
    quote: {
      reference: stringValue(quote.quoteNumber),
      amount: dollars(quoteCents),
      validUntil: stringValue(quote.validUntil),
      leadTimeWeeks:
        numberValue(quote.leadTimeWeeks)?.toString() ?? '',
    },
    designerApproval:
      designerApproval.status === 'approved' ? 'approved' : 'pending',
    clientApproval:
      clientApproval.status === 'approved' ? 'approved' : 'pending',
  };
}

function drawingAttachment(reference: string): Record<string, unknown> {
  const isUrl = /^(https?:\/\/|\/)/.test(reference);
  const lastSegment = reference.split('/').filter(Boolean).pop();
  return {
    name: isUrl ? lastSegment || 'Drawing' : reference,
    url: isUrl ? reference : '',
    ...(isUrl ? {} : { revision: reference }),
  };
}

function briefToWire(brief: CommissionBriefDraft): Record<string, unknown> {
  const parsedMeasurements = (
    [
      ['width', brief.dimensions.width],
      ['depth', brief.dimensions.depth],
      ['height', brief.dimensions.height],
    ] as const
  ).map(([label, value]) => ({
    label,
    value: Number(value),
    unit: brief.dimensions.unit,
    source: 'designer_field_measurement',
  }));
  return {
    summary: brief.name.trim(),
    intent: brief.scope.trim() || undefined,
    siteConditions: brief.dimensions.siteNotes.trim() || undefined,
    measurements: parsedMeasurements,
    requirements: [],
    materials: brief.material
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    finish: brief.finish.trim(),
    fabricatorVendorId: brief.fabricatorVendorId || undefined,
    fabricatorName: brief.fabricator.trim(),
    budgetCents: cents(brief.allowance) ?? undefined,
    allowanceCents: cents(brief.allowance) ?? undefined,
    priceOnRequest: brief.priceOnRequest,
    drawings: brief.drawingReferences.map(drawingAttachment),
    designerApproval: { status: brief.designerApproval },
    clientApproval: { status: brief.clientApproval },
  };
}

function quoteToWire(quote: CommissionBriefDraft['quote']): Record<string, unknown> {
  return {
    quoteNumber: quote.reference.trim() || undefined,
    tradePriceCents: cents(quote.amount) ?? undefined,
    currency: 'USD',
    leadTimeWeeks: quote.leadTimeWeeks ? Number(quote.leadTimeWeeks) : undefined,
    validUntil: quote.validUntil || undefined,
    receivedAt: new Date().toISOString(),
  };
}

function mutationError(...values: unknown[]): string | null {
  const value = values.find(Boolean);
  return value instanceof Error ? value.message : value ? String(value) : null;
}

export function CustomCommissionSheet({
  open,
  onClose,
  productId,
  productName,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
}) {
  const projectsQuery = data.useProjects();
  const vendorsQuery = data.useVendors(undefined, { page: 1, pageSize: 100 });
  const configurationsQuery = data.useSavedProductConfigurations(productId);
  const [selectedConfigurationId, setSelectedConfigurationId] = useState<string | null>(null);
  const configurations = useMemo(
    () => configurationsQuery.data ?? [],
    [configurationsQuery.data],
  );
  const activeConfiguration = selectedConfigurationId
    ? configurations.find((item) => item.id === selectedConfigurationId) ?? null
    : [...configurations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ??
      null;
  const revisionsQuery = data.useCustomCommissionRevisions(
    activeConfiguration?.id ?? '',
  );
  const saveConfiguration = data.useSaveProductConfiguration();
  const transitionRevision = data.useTransitionCustomCommissionRevision();
  const placeConfiguration = data.usePlaceProductConfiguration();
  const promoteConfiguration = data.usePromoteConfigurationToLibrary();
  const prepareQuoteRequest = data.usePrepareConfigurationQuoteRequest();

  useEffect(() => {
    if (!open || selectedConfigurationId || configurations.length === 0) return;
    setSelectedConfigurationId(
      [...configurations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0].id,
    );
  }, [configurations, open, selectedConfigurationId]);

  const revisions = useMemo<CommissionWorkspaceRevision[]>(() => {
    if (!activeConfiguration) return [];
    return (revisionsQuery.data ?? []).map((revision) => ({
      id: revision.id,
      configurationId: revision.configurationId,
      revisionNumber: revision.revisionNumber,
      status: revision.status,
      brief: briefFromWire(activeConfiguration, revision),
      snapshot: {
        name: revision.name ?? activeConfiguration.name,
        customBrief: revision.brief,
        drawings: revision.drawings,
        quote: revision.quote,
        revisionNumber: revision.revisionNumber,
        snapshot:
          revision.configurationSnapshot ??
          revision.snapshot ??
          activeConfiguration.snapshot,
        snapshotHash:
          revision.configurationSnapshotHash ??
          revision.snapshotHash ??
          activeConfiguration.snapshotHash,
      },
      snapshotHash:
        revision.configurationSnapshotHash ??
        revision.snapshotHash ??
        activeConfiguration.snapshotHash,
      lockedAt:
        revision.configurationLockedAt ??
        revision.issuedAt ??
        (revision.status === 'issued' ? activeConfiguration.issuedAt ?? null : null),
      transitionNote: revision.transitionNote,
      createdAt: revision.createdAt,
    }));
  }, [activeConfiguration, revisionsQuery.data]);

  const projects = (projectsQuery.data ?? [])
    .filter(
      (project) =>
        !['completed', 'archived', 'cancelled'].includes(project.status ?? ''),
    )
    .map((project) => ({ id: project.id, name: project.name ?? 'Untitled project' }));
  const vendors = (vendorsQuery.data?.data ?? []).map((vendor) => ({
    id: vendor.id,
    name: vendor.name,
  }));

  const saveDraft = async (brief: CommissionBriefDraft) => {
    const sameProjectConfiguration =
      activeConfiguration?.projectId === brief.projectId
        ? activeConfiguration
        : null;
    const wireBrief = briefToWire(brief);
    const result = await saveConfiguration.mutateAsync({
      productId,
      configurationId: sameProjectConfiguration?.id,
      expectedVersion: sameProjectConfiguration?.version,
      projectId: brief.projectId,
      name: brief.name.trim(),
      notes: brief.scope.trim() || undefined,
      selections: {},
      components: [],
      customBrief: wireBrief,
    });
    const configuration = result.configuration;
    const created = result.customRevision;
    if (!created) {
      throw new Error(
        'The configuration saved without its commission revision. Refresh and try again.',
      );
    }
    setSelectedConfigurationId(configuration.id);
    return { configurationId: configuration.id, revisionId: created.id };
  };

  const transition = async (
    revisionId: string,
    target: CommissionRevisionTransitionStatus,
    payload?: {
      note?: string;
      quote?: CommissionBriefDraft['quote'];
      approval?: { designerApproved: boolean; clientApproved: boolean };
    },
  ) => {
    await transitionRevision.mutateAsync({
      revisionId,
      targetStatus: target,
      note: payload?.note,
      quote: payload?.quote ? quoteToWire(payload.quote) : undefined,
      approval: payload?.approval,
    });
  };

  const isBusy = [
    saveConfiguration,
    transitionRevision,
    placeConfiguration,
    promoteConfiguration,
    prepareQuoteRequest,
  ].some((mutation) => mutation.isPending);

  return (
    <CustomCommissionWorkspace
      open={open}
      onClose={onClose}
      productName={productName}
      projects={projects}
      vendors={vendors}
      revisions={revisions}
      initialProjectId={activeConfiguration?.projectId ?? null}
      isLoading={
        projectsQuery.isLoading ||
        configurationsQuery.isLoading ||
        (!!activeConfiguration && revisionsQuery.isLoading)
      }
      isBusy={isBusy}
      error={mutationError(
        projectsQuery.error,
        vendorsQuery.error,
        configurationsQuery.error,
        revisionsQuery.error,
      )}
      onSaveDraft={saveDraft}
      onTransition={transition}
      onPrepareQuoteRequest={async (configurationId, _revisionId, brief) => {
        if (!brief.fabricatorVendorId) {
          return {
            draftCreated: false,
            message:
              'Commission submitted. Match the named fabricator to a maker before creating the RFQ draft.',
          };
        }
        await prepareQuoteRequest.mutateAsync({
          configurationId,
          vendorId: brief.fabricatorVendorId,
          scope: brief.scope.trim() || brief.name.trim(),
          timeline: brief.quote.leadTimeWeeks
            ? `${brief.quote.leadTimeWeeks} weeks`
            : undefined,
          message: [
            brief.name.trim(),
            `${brief.dimensions.width} × ${brief.dimensions.depth} × ${brief.dimensions.height} ${brief.dimensions.unit}`,
            `${brief.material.trim()} · ${brief.finish.trim()}`,
            brief.drawingReferences.length
              ? `${brief.drawingReferences.length} drawing reference${brief.drawingReferences.length === 1 ? '' : 's'} attached to the commission record.`
              : null,
          ]
            .filter(Boolean)
            .join('\n'),
        });
        return {
          draftCreated: true,
          message:
            'Commission submitted and RFQ draft saved for review. Nothing was sent.',
        };
      }}
      onPlaceApproved={async (configurationId, projectId) => {
        await placeConfiguration.mutateAsync({
          projectId,
          configurationId,
          source: {
            surface: 'designer_piece_custom_commission',
            explicitDesignerAction: true,
          },
        });
      }}
      onPromote={async (configurationId) => {
        await promoteConfiguration.mutateAsync({
          configurationId,
          name: `${productName} · proven custom pattern`,
        });
      }}
      onStartNewCommission={() => setSelectedConfigurationId('__new__')}
    />
  );
}
