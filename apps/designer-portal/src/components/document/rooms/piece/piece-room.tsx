'use client';

/**
 * The Piece (R40 grammar, view + edit of one library item). You pull a piece off
 * the shelf and lay it on your worktable: a full-bleed paper Room reached at
 * /library/[id]. A letterhead hero (folio + the piece named in the hand + the
 * Strata Mark completeness) sits over three Movements — the record / the catalog
 * / the eye — and a quiet colophon of provenance. Every facet self-saves where
 * you may edit (personal you own, studio you're in, catalog if super-admin);
 * elsewhere it reads as an immutable specimen sheet with Save / Add / Nominate.
 * Zero shadows (D4); the Strata Mark is the only progress device.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  useProduct,
  useUserWithRoles,
  useOrganizations,
  useCaptureProduct,
  useCaptureFromUrl,
} from '@patina/supabase';
import { buildRefreshDiff, type RefreshFieldChange } from '@patina/utils';
import { usePieceField } from '@/hooks/use-piece-field';
import { DocumentAction, DocumentActionGroup } from '../../document-action';
import { useMobilePrimaryAction } from '../../mobile/mobile-shell';
import { RoomShell } from '../room-shell';
import { StrataMark } from '@/components/document/strata-mark';
import { StrataSweep } from '@/components/ui/strata-sweep';
import { PieceFacet } from './piece-facet';
import {
  FacetText,
  FacetTextarea,
  FacetNumber,
  FacetMoney,
  FacetSelect,
  FacetChips,
  FacetDimensions,
  FacetVendorContact,
  FacetVendorPicker,
} from './facet-field';
import { PieceFolio } from './piece-folio';
import { AddToProjectSheet } from './add-to-project-sheet';
import { DeepAnalysisSheet } from '../library/deep-analysis-sheet';
import { PromoteToStudioModal } from '@/components/products/promotion/promote-to-studio-modal';
import { NominateToCatalogModal } from '@/components/products/nomination/nominate-to-catalog-modal';
import {
  pieceSections,
  pieceFill,
  piecePct,
  pieceStateLabel,
  type PieceRow,
} from '@/lib/document/piece-progress';

type Layer = 'personal' | 'studio' | 'catalog';

interface PieceProduct extends PieceRow {
  id: string;
  name: string;
  brand: string | null;
  sku: string | null;
  slug: string | null;
  source_url: string | null;
  description: string | null;
  short_description: string | null;
  category: string | null;
  subcategory: string | null;
  tags: string[] | null;
  style_tags: string[] | null;
  material_tags: string[] | null;
  dimensions: unknown;
  materials: string[] | null;
  colors: string[] | null;
  available_colors: string[] | null;
  finish: string | null;
  price_retail: number | null;
  price_trade: number | null;
  commission_rate: number | null;
  lead_time_weeks: number | null;
  payment_terms: string | null;
  vendor_id: string | null;
  retailer_id: string | null;
  vendor_contact: unknown;
  usage_notes: string | null;
  images: string[] | null;
  seo_title: string | null;
  seo_description: string | null;
  status: string;
  layer: string;
  owner_user_id: string | null;
  studio_id: string | null;
  patina_managed: boolean;
  quality_score: number | null;
  promoted_at: string | null;
  promoted_from_id: string | null;
  catalog_equivalent_id: string | null;
  captured_at: string | null;
  captured_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  published_at: string | null;
  embedding_updated_at: string | null;
  vendor?: { id: string; name: string } | null;
  retailer?: { id: string; name: string } | null;
  product_styles?: Array<{ style: { id: string; name: string } | null }> | null;
}

const LAYER_LABEL: Record<Layer, string> = {
  personal: 'My Library',
  studio: 'Studio Library',
  catalog: 'Patina Catalog',
};

const CATEGORY_OPTIONS = [
  'sofa',
  'chair',
  'table',
  'bed',
  'storage',
  'lighting',
  'decor',
  'outdoor',
].map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }));

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'in_review', label: 'In review' },
  { value: 'published', label: 'Published' },
  { value: 'deprecated', label: 'Deprecated' },
  { value: 'archived', label: 'Archived' },
];

const PAYMENT_OPTIONS = [
  { value: 'fifty_fifty', label: '50 / 50' },
  { value: 'thirty_seventy', label: '30 / 70' },
  { value: 'full_upfront', label: 'Full upfront' },
  { value: 'net_30', label: 'Net 30' },
  { value: 'custom_milestones', label: 'Custom milestones' },
];

const ALL_FACETS = [
  'identity',
  'piece',
  'story',
  'categorization',
  'commerce',
  'lifecycle',
  'sourcing',
  'seo',
  'eye',
];

export function PieceRoom({ productId }: { productId: string }) {
  const { data, isLoading, error, refetch } = useProduct(productId);
  const { user, isSuperAdmin } = useUserWithRoles();
  const { data: orgs } = useOrganizations();
  const capture = useCaptureProduct();

  const p = data as PieceProduct | undefined;
  const layer = (p?.layer ?? 'personal') as Layer;

  // Only non-guest memberships may write a studio row (matches the
  // products_studio_update RLS policy in 00152) — guests can read but not edit,
  // so they must see the immutable specimen view, not dead inputs.
  const studioIds = useMemo(
    () =>
      new Set(
        (
          (orgs ?? []) as Array<{
            id?: string;
            organization_id?: string;
            membership?: { role?: string };
          }>
        )
          .filter((o) =>
            ['owner', 'admin', 'member'].includes(o.membership?.role ?? ''),
          )
          .map((o) => o.id ?? o.organization_id)
          .filter(Boolean) as string[],
      ),
    [orgs],
  );
  const studioId = useMemo(() => {
    const list = (orgs ?? []) as Array<{
      id?: string;
      organization_id?: string;
      type?: string;
    }>;
    const studio = list.find((o) => o.type === 'design_studio') ?? list[0];
    return studio?.id ?? studio?.organization_id ?? null;
  }, [orgs]);

  const canEdit = useMemo(() => {
    if (!p) return false;
    if (isSuperAdmin) return true;
    if (p.layer === 'personal') return !!user && p.owner_user_id === user.id;
    if (p.layer === 'studio')
      return !!p.studio_id && studioIds.has(p.studio_id);
    return false;
  }, [p, isSuperAdmin, user, studioIds]);
  const readOnly = !canEdit;

  const [open, setOpen] = useState<Set<string>>(new Set(ALL_FACETS));
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const [deepOpen, setDeepOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [nominateOpen, setNominateOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useMobilePrimaryAction(
    p
      ? {
          actionKey: 'add-piece-to-project',
          surfaceKey: 'piece',
          regionKey: 'piece-head',
          label: 'Add to a project',
          target: { kind: 'press', onPress: () => setAddOpen(true) },
        }
      : null,
  );
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(t);
  }, [toast]);

  // ── Loading / not found ───────────────────────────────────────────────────
  if (isLoading) {
    return (
      <RoomShell title="A piece" backTo="/library" backLabel="the Library">
        <div className="flex min-h-[40vh] items-center justify-center">
          <StrataSweep size="sm" label="Pulling the piece from the shelf" />
        </div>
      </RoomShell>
    );
  }
  if (error || !p) {
    return (
      <RoomShell title="A piece" backTo="/library" backLabel="the Library">
        <div
          role="alert"
          className="mx-auto max-w-[520px] px-6 pt-16 text-center"
        >
          <p className="font-heading text-[1.3rem] italic text-[var(--color-charcoal)]">
            This piece isn’t on a shelf.
          </p>
          <p className="mt-2 text-[0.84rem] text-[var(--color-aged-oak)]">
            It may have been merged or removed, or it failed to load. Try again,
            or head back to the Library.
          </p>
          <DocumentActionGroup
            surfaceKey="piece"
            regionKey="load-error"
            className="mt-4 justify-center"
          >
            <DocumentAction
              actionKey="retry-piece"
              variant="primary"
              onClick={() => void refetch()}
            >
              Try again
            </DocumentAction>
          </DocumentActionGroup>
        </div>
      </RoomShell>
    );
  }

  const hasTeaching = (p.product_styles?.length ?? 0) > 0;
  const sections = pieceSections(p, hasTeaching);
  const fill = pieceFill(sections);
  const pct = piecePct(fill);
  const state = pieceStateLabel(pct);

  const retail =
    p.price_retail != null
      ? (p.price_retail / 100).toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
        })
      : null;
  const trade =
    p.price_trade != null
      ? (p.price_trade / 100).toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
        })
      : null;

  const taughtStyles = (p.product_styles ?? [])
    .map((s) => s.style?.name)
    .filter(Boolean) as string[];

  const showSeo = layer === 'catalog' || isSuperAdmin;
  const studioNeeds = layer === 'studio';

  const saveToMyLibrary = async () => {
    if (!user) {
      setToast('Sign in to save to your library.');
      return;
    }
    try {
      await capture.mutateAsync({
        name: p.name,
        images: p.images ?? undefined,
        imageUrl: p.images?.[0] ?? undefined,
        sourceUrl: p.source_url ?? undefined,
        priceRetailCents: p.price_retail ?? undefined,
        description: p.description ?? undefined,
        detectedVendorName: p.vendor?.name ?? p.brand ?? undefined,
        ownerUserId: user.id,
        captureSource: 'manual',
      });
      setToast(
        'Saved to My Library — a copy is on your shelf to edit and teach.',
      );
    } catch {
      setToast('Could not save to your library just now.');
    }
  };

  return (
    <RoomShell
      title={p.name || 'A piece'}
      count={`${LAYER_LABEL[layer]} · ${pct}%`}
      backTo="/library"
      backLabel="the Library"
    >
      <div className="mx-auto max-w-[1080px] px-6 pb-12 sm:px-9">
        {/* ── Letterhead hero ── */}
        <section className="grid gap-7 pt-7 min-[900px]:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
          <PieceFolio productId={p.id} images={p.images} readOnly={readOnly} />

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Chip>{LAYER_LABEL[layer]}</Chip>
              <Chip tone={p.status === 'published' ? 'sage' : 'oak'}>
                {labelStatus(p.status)}
              </Chip>
              {readOnly && layer === 'catalog' && (
                <Chip tone="oak">read only</Chip>
              )}
            </div>

            <h1 className="mt-3 font-heading text-[2rem] leading-tight text-[var(--color-charcoal)]">
              {p.name}
            </h1>
            {p.brand && (
              <p className="mt-0.5 font-heading text-[1.05rem] italic text-[var(--color-aged-oak)]">
                {p.brand}
              </p>
            )}
            {(p.category || p.subcategory) && (
              <p className="mt-1 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-[var(--color-aged-oak)]">
                {[p.category, p.subcategory].filter(Boolean).join(' · ')}
              </p>
            )}

            {(retail || trade) && (
              <p className="mt-3 text-[0.92rem] text-[var(--color-charcoal)]">
                {retail && <span className="font-medium">{retail}</span>}
                {retail && (
                  <span className="text-[0.7rem] text-[var(--color-aged-oak)]">
                    {' '}
                    retail
                  </span>
                )}
                {trade && (
                  <span className="text-[var(--color-aged-oak)]">
                    {retail ? '  ·  ' : ''}
                    {trade} <span className="text-[0.7rem]">trade</span>
                  </span>
                )}
              </p>
            )}

            <div className="mt-4 flex items-center gap-3">
              <StrataMark size="lg" fill={fill} label={`${pct}% complete`} />
              <span className="font-mono text-[0.6rem] tracking-[0.04em] text-[var(--color-aged-oak)]">
                <b className="font-heading text-[0.95rem] text-[var(--color-charcoal)]">
                  {pct}
                </b>
                % · {state}
              </span>
            </div>

            {/* Action rail */}
            <DocumentActionGroup
              surfaceKey="piece"
              regionKey="piece-head"
              className="mt-5"
            >
              <DocumentAction
                actionKey="add-piece-to-project"
                variant="primary"
                onClick={() => setAddOpen(true)}
              >
                Add to a project
              </DocumentAction>
              {layer !== 'personal' && (
                <DocumentAction
                  actionKey="save-to-my-library"
                  variant="secondary"
                  loading={capture.isPending}
                  loadingLabel="Saving…"
                  onClick={() => void saveToMyLibrary()}
                >
                  Save to My Library
                </DocumentAction>
              )}
              {layer === 'personal' && canEdit && (
                <DocumentAction
                  actionKey="promote-to-studio"
                  variant="secondary"
                  onClick={() => setPromoteOpen(true)}
                >
                  Promote to Studio
                </DocumentAction>
              )}
              {layer === 'studio' && canEdit && (
                <DocumentAction
                  actionKey="nominate-maker"
                  variant="secondary"
                  onClick={() => {
                    if (!p.vendor_id) {
                      setToast('This piece has no maker on file to nominate.');
                      return;
                    }
                    if (!studioId) {
                      setToast('Nominating a maker needs a studio on file.');
                      return;
                    }
                    setNominateOpen(true);
                  }}
                >
                  Nominate maker
                </DocumentAction>
              )}
            </DocumentActionGroup>
            {readOnly && layer === 'catalog' && (
              <p className="mt-3 max-w-[44ch] text-[0.72rem] italic text-[var(--color-aged-oak)]">
                A maker’s piece, curated by Patina. Save a copy to your library
                to adapt it, or add it straight to a project.
              </p>
            )}
          </div>
        </section>

        {/* ── Movement 1 · The record ── */}
        <Movement
          name="The record"
          meta="Line 1 · what it is"
          hue="var(--color-mocha)"
        >
          <PieceFacet
            name="Identity"
            status={sections.identity ? 'on file' : 'partly written'}
            done={sections.identity}
            open={open.has('identity')}
            onToggle={() => toggle('identity')}
            readOnly={readOnly}
          >
            <FacetText
              productId={p.id}
              column="name"
              serverValue={p.name}
              label="Name"
              readOnly={readOnly}
            />
            <div className="flex flex-col gap-0 sm:flex-row sm:gap-3">
              <div className="flex-1">
                <FacetText
                  productId={p.id}
                  column="brand"
                  serverValue={p.brand}
                  label="Maker"
                  placeholder="Nordic Atelier"
                  readOnly={readOnly}
                />
              </div>
              <div className="flex-1">
                <FacetText
                  productId={p.id}
                  column="sku"
                  serverValue={p.sku}
                  label="SKU"
                  placeholder="optional"
                  readOnly={readOnly}
                />
              </div>
            </div>
            <FacetText
              productId={p.id}
              column="source_url"
              serverValue={p.source_url}
              label="Source URL"
              placeholder="paste, or from a capture"
              readOnly={readOnly}
            />
            {p.slug && (
              <div className="mt-3">
                <span className="mb-1 block font-mono text-[0.5rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
                  Slug
                </span>
                <p className="font-mono text-[0.72rem] text-[var(--color-aged-oak)]">
                  {p.slug}
                </p>
              </div>
            )}
          </PieceFacet>

          <PieceFacet
            name="The piece"
            status={sections.piece ? 'measured' : 'not yet measured'}
            done={sections.piece}
            open={open.has('piece')}
            onToggle={() => toggle('piece')}
            readOnly={readOnly}
          >
            <FacetDimensions
              productId={p.id}
              serverValue={p.dimensions}
              readOnly={readOnly}
            />
            <FacetChips
              productId={p.id}
              column="materials"
              serverValue={p.materials}
              label="Materials"
              placeholder="solid white oak…"
              readOnly={readOnly}
            />
            <FacetChips
              productId={p.id}
              column="colors"
              serverValue={p.colors}
              label="Colors"
              swatch
              readOnly={readOnly}
            />
            <FacetChips
              productId={p.id}
              column="available_colors"
              serverValue={p.available_colors}
              label="Available colors"
              swatch
              readOnly={readOnly}
            />
            <FacetText
              productId={p.id}
              column="finish"
              serverValue={p.finish}
              label="Finish"
              placeholder="matte, hand-rubbed oil…"
              readOnly={readOnly}
            />
          </PieceFacet>

          <PieceFacet
            name="The story"
            status={
              p.short_description || p.description ? 'written' : 'unwritten'
            }
            done={!!(p.short_description || p.description)}
            open={open.has('story')}
            onToggle={() => toggle('story')}
            readOnly={readOnly}
          >
            <FacetTextarea
              productId={p.id}
              column="short_description"
              serverValue={p.short_description}
              label="Short description"
              placeholder="the card blurb"
              rows={2}
              readOnly={readOnly}
            />
            <FacetTextarea
              productId={p.id}
              column="description"
              serverValue={p.description}
              label="Description"
              placeholder="the full story of the piece"
              rows={4}
              readOnly={readOnly}
            />
          </PieceFacet>

          <PieceFacet
            name="Categorization"
            status={p.category ? p.category : 'uncategorized'}
            done={!!p.category}
            open={open.has('categorization')}
            onToggle={() => toggle('categorization')}
            readOnly={readOnly}
          >
            <FacetSelect
              productId={p.id}
              column="category"
              serverValue={p.category}
              label="Category"
              options={CATEGORY_OPTIONS}
              needed={studioNeeds}
              readOnly={readOnly}
            />
            <FacetText
              productId={p.id}
              column="subcategory"
              serverValue={p.subcategory}
              label="Subcategory"
              readOnly={readOnly}
            />
            <FacetChips
              productId={p.id}
              column="tags"
              serverValue={p.tags}
              label="Tags"
              readOnly={readOnly}
            />
            <FacetChips
              productId={p.id}
              column="material_tags"
              serverValue={p.material_tags}
              label="Material tags"
              readOnly={readOnly}
            />
            <FacetChips
              productId={p.id}
              column="style_tags"
              serverValue={p.style_tags}
              label="Style tags"
              readOnly={readOnly}
            />
          </PieceFacet>
        </Movement>

        {/* ── Movement 2 · The catalog ── */}
        <Movement
          name="The catalog"
          meta="Line 2 · into the marketplace"
          hue="var(--color-clay)"
        >
          <PieceFacet
            name="Commerce"
            status={sections.commerce ? 'priced' : 'no price yet'}
            done={sections.commerce}
            open={open.has('commerce')}
            onToggle={() => toggle('commerce')}
            readOnly={readOnly}
          >
            <div className="flex flex-col gap-0 sm:flex-row sm:gap-3">
              <div className="flex-1">
                <FacetMoney
                  productId={p.id}
                  column="price_trade"
                  serverCents={p.price_trade}
                  label="Trade price"
                  note="On the maker’s side, this is theirs — one page, two authors."
                  readOnly={readOnly}
                />
              </div>
              <div className="flex-1">
                <FacetMoney
                  productId={p.id}
                  column="price_retail"
                  serverCents={p.price_retail}
                  label="Retail price"
                  readOnly={readOnly}
                />
              </div>
            </div>
            <FacetNumber
              productId={p.id}
              column="commission_rate"
              serverValue={p.commission_rate}
              label="Commission rate"
              suffix="%"
              step="0.01"
              min={0}
              max={99.99}
              readOnly={readOnly}
            />
          </PieceFacet>

          {canEdit && (
            <PieceFacet
              name="Lifecycle"
              status={labelStatus(p.status)}
              done={p.status === 'published'}
              open={open.has('lifecycle')}
              onToggle={() => toggle('lifecycle')}
              readOnly={false}
            >
              <FacetSelect
                productId={p.id}
                column="status"
                serverValue={p.status}
                label="Status"
                options={STATUS_OPTIONS}
                required
                readOnly={false}
              />
            </PieceFacet>
          )}

          <PieceFacet
            name="Sourcing"
            status={
              p.vendor_id || p.lead_time_weeks
                ? 'sourced'
                : studioNeeds
                  ? 'needed to share'
                  : 'optional'
            }
            done={!!(p.vendor_id && p.lead_time_weeks && p.payment_terms)}
            open={open.has('sourcing')}
            onToggle={() => toggle('sourcing')}
            readOnly={readOnly}
          >
            <FacetVendorPicker
              productId={p.id}
              column="vendor_id"
              label="Maker"
              currentVendorId={p.vendor_id}
              currentVendorName={p.vendor?.name ?? null}
              readOnly={readOnly}
            />
            <FacetVendorPicker
              productId={p.id}
              column="retailer_id"
              label="Where to buy"
              currentVendorId={p.retailer_id}
              currentVendorName={p.retailer?.name ?? null}
              readOnly={readOnly}
            />
            <FacetVendorContact
              productId={p.id}
              serverValue={p.vendor_contact}
              needed={studioNeeds}
              readOnly={readOnly}
            />
            <div className="flex flex-col gap-0 sm:flex-row sm:gap-3">
              <div className="flex-1">
                <FacetNumber
                  productId={p.id}
                  column="lead_time_weeks"
                  serverValue={p.lead_time_weeks}
                  label="Lead time"
                  suffix="weeks"
                  needed={studioNeeds}
                  readOnly={readOnly}
                />
              </div>
              <div className="flex-1">
                <FacetSelect
                  productId={p.id}
                  column="payment_terms"
                  serverValue={p.payment_terms}
                  label="Payment terms"
                  options={PAYMENT_OPTIONS}
                  needed={studioNeeds}
                  readOnly={readOnly}
                />
              </div>
            </div>
            <FacetTextarea
              productId={p.id}
              column="usage_notes"
              serverValue={p.usage_notes}
              label="Usage notes"
              placeholder="how a designer should use this piece"
              rows={3}
              needed={studioNeeds}
              readOnly={readOnly}
            />
            {canEdit && (
              <RefreshFromSource product={p} onRefetch={() => void refetch()} />
            )}
          </PieceFacet>

          {showSeo && (
            <PieceFacet
              name="Listing metadata"
              status={p.seo_title ? 'set' : 'optional'}
              done={!!p.seo_title}
              open={open.has('seo')}
              onToggle={() => toggle('seo')}
              readOnly={readOnly}
            >
              <FacetText
                productId={p.id}
                column="seo_title"
                serverValue={p.seo_title}
                label="SEO title"
                readOnly={readOnly}
              />
              <FacetTextarea
                productId={p.id}
                column="seo_description"
                serverValue={p.seo_description}
                label="SEO description"
                rows={2}
                readOnly={readOnly}
              />
            </PieceFacet>
          )}
        </Movement>

        {/* ── Movement 3 · The eye ── */}
        <Movement
          name="The eye"
          meta="Line 3 · the teaching"
          hue="var(--color-dusty-blue)"
        >
          <PieceFacet
            name="Style & character"
            status={
              hasTeaching
                ? `taught · ${taughtStyles.length} trait${taughtStyles.length > 1 ? 's' : ''}`
                : 'untaught'
            }
            done={hasTeaching}
            open={open.has('eye')}
            onToggle={() => toggle('eye')}
            readOnly={false}
          >
            {taughtStyles.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {taughtStyles.map((s) => (
                  <span
                    key={s}
                    className="rounded-[14px] border border-[var(--color-clay)] bg-[rgba(196,165,123,0.1)] px-2.5 py-1 text-[0.7rem] text-[var(--color-mocha)]"
                  >
                    {s}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[0.8rem] italic text-[var(--color-aged-oak)]">
                Untaught. Teach its character so the Engine can place it well.
              </p>
            )}
            <DocumentActionGroup
              surfaceKey="piece"
              regionKey="teaching"
              className="mt-4 items-center"
            >
              <DocumentAction
                actionKey={
                  hasTeaching ? 'deepen-piece-teaching' : 'teach-piece'
                }
                variant="primary"
                onClick={() => setDeepOpen(true)}
              >
                {hasTeaching ? 'Deepen the eye →' : 'Teach this piece →'}
              </DocumentAction>
              {p.quality_score != null && (
                <span className="font-mono text-[0.6rem] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
                  Aesthete read · {p.quality_score}
                </span>
              )}
            </DocumentActionGroup>
            <p className="mt-3 border-t border-[var(--doc-ink-border)] pt-2.5 text-[0.7rem] italic text-[var(--color-aged-oak)]">
              The teaching is the same act as Quick Tags on the shelf — here,
              the full sitting.
            </p>
          </PieceFacet>
        </Movement>

        <Colophon p={p} />
      </div>

      {/* ── Sheets over the Room ── */}
      {deepOpen && (
        <DeepAnalysisSheet
          productId={p.id}
          productName={p.name}
          onClose={() => setDeepOpen(false)}
          onSaved={() =>
            setToast(`Taught — “${p.name}” is mapped. Your eye, learned.`)
          }
        />
      )}
      <PromoteToStudioModal
        open={promoteOpen}
        productId={promoteOpen ? p.id : null}
        asSheet
        onClose={() => setPromoteOpen(false)}
        onSuccess={() =>
          setToast(
            'Promoted to the Studio Library — proven, and shared with the studio.',
          )
        }
      />
      <NominateToCatalogModal
        open={nominateOpen}
        vendorId={nominateOpen ? p.vendor_id : null}
        studioId={studioId}
        asSheet
        onClose={() => setNominateOpen(false)}
        onSubmitted={() => setToast('Maker nominated to the Patina Catalog.')}
      />
      <AddToProjectSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        piece={{
          id: p.id,
          name: p.name,
          price_trade: p.price_trade,
          price_retail: p.price_retail,
        }}
        onAdded={(name) => setToast(`Added “${p.name}” to ${name}.`)}
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-[72px] left-1/2 z-[65] -translate-x-1/2 rounded-[8px] border border-[rgba(196,165,123,0.3)] bg-[var(--color-charcoal)] px-4 py-2.5 text-[0.74rem] text-[var(--color-off-white)] motion-safe:animate-[doc-fade_200ms_ease-out]"
        >
          {toast}
        </div>
      )}
    </RoomShell>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────
function labelStatus(s: string): string {
  return STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;
}

function Chip({
  children,
  tone = 'oak',
}: {
  children: React.ReactNode;
  tone?: 'oak' | 'sage';
}) {
  return (
    <span
      className="rounded-[3px] border px-2 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.1em]"
      style={
        tone === 'sage'
          ? {
              color: 'var(--color-sage)',
              borderColor: 'var(--color-sage)',
              background: 'rgba(168,181,160,0.12)',
            }
          : {
              color: 'var(--color-aged-oak)',
              borderColor: 'var(--color-pearl)',
            }
      }
    >
      {children}
    </span>
  );
}

/** Render a diff value for the per-field accept list (before → after). */
function formatChangeValue(
  field: string,
  value: string | number | string[] | null,
): string {
  if (value == null) return '—';
  if (Array.isArray(value)) {
    return value.length === 0
      ? '—'
      : `${value.length} image${value.length > 1 ? 's' : ''}`;
  }
  if (field === 'price_retail' && typeof value === 'number') {
    return (value / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  }
  const s = String(value);
  return s.length > 80 ? `${s.slice(0, 79)}…` : s;
}

/**
 * Refresh-from-source (A3, refresh mode). Re-reads the piece's stored source
 * URL through the SSRF-guarded `capture-from-url` edge function, diffs the
 * result against what's on file (buildRefreshDiff — only fields the page
 * carries AND that differ), and offers a per-field Accept. Never auto-applies;
 * each accept commits through the same self-save the facets use (usePieceField),
 * then refetches. Inline errors, no toast, no shadow (R83 / D4). Rendered only
 * when the caller may edit — accepting is a write.
 */
function RefreshFromSource({
  product,
  onRefetch,
}: {
  product: PieceProduct;
  onRefetch: () => void;
}) {
  const refresh = useCaptureFromUrl();
  const field = usePieceField(product.id);
  const [changes, setChanges] = useState<RefreshFieldChange[] | null>(null);
  const [ranOnce, setRanOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [applyError, setApplyError] = useState<string | null>(null);

  const source = product.source_url?.trim() || '';
  const disabled = !source || refresh.isPending;

  const run = async () => {
    if (!source) return;
    setError(null);
    setApplyError(null);
    setChanges(null);
    setAccepted(new Set());
    setRanOnce(false);
    try {
      const extracted = await refresh.mutateAsync({
        url: source,
        mode: 'refresh',
        productId: product.id,
      });
      const diff = buildRefreshDiff(
        {
          name: product.name,
          brand: product.brand,
          description: product.description,
          price_retail: product.price_retail,
          images: product.images,
        },
        extracted,
      );
      setChanges(diff);
      setRanOnce(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not read the source just now.',
      );
    }
  };

  const accept = async (change: RefreshFieldChange) => {
    setApplyError(null);
    try {
      await field.mutateAsync({ [change.field]: change.after });
      setAccepted((prev) => new Set(prev).add(change.field));
      onRefetch();
    } catch (e) {
      setApplyError(
        e instanceof Error ? e.message : 'Could not apply that change.',
      );
    }
  };

  return (
    <div className="mt-4 border-t border-[var(--doc-ink-border)] pt-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="mb-1 block font-mono text-[0.5rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
            Refresh from source
          </span>
          <p className="text-[0.72rem] text-[var(--color-aged-oak)]">
            {source
              ? 'Re-read the source page and choose what to update.'
              : 'Add a source URL to enable a refresh.'}
          </p>
        </div>
        <DocumentAction
          actionKey="refresh-piece-from-source"
          surfaceKey="piece"
          regionKey="source-refresh"
          variant="secondary"
          onClick={() => void run()}
          disabled={disabled}
          loading={refresh.isPending}
          loadingLabel="Reading…"
        >
          Refresh from source
        </DocumentAction>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-2 text-[0.72rem] text-[var(--color-clay)]"
        >
          {error}
        </p>
      )}

      {ranOnce && changes && changes.length === 0 && (
        <p className="mt-3 text-[0.72rem] italic text-[var(--color-aged-oak)]">
          Already up to date with the source.
        </p>
      )}

      {changes && changes.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {changes.map((c, index) => {
            const isAccepted = accepted.has(c.field);
            return (
              <li
                key={c.field}
                className="flex items-start justify-between gap-3 rounded-[5px] border border-[var(--doc-ink-border)] p-2.5"
              >
                <div className="min-w-0">
                  <span className="mb-1 block font-mono text-[0.5rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
                    {c.label}
                  </span>
                  <div className="text-[0.76rem] leading-snug text-[var(--color-charcoal)]">
                    <span className="text-[var(--color-aged-oak)] line-through">
                      {formatChangeValue(c.field, c.before)}
                    </span>
                    <span
                      aria-hidden
                      className="px-1.5 text-[var(--color-aged-oak)]"
                    >
                      →
                    </span>
                    <span>{formatChangeValue(c.field, c.after)}</span>
                  </div>
                </div>
                {isAccepted ? (
                  <span className="shrink-0 self-center font-mono text-[0.5rem] uppercase tracking-[0.08em] text-[var(--color-sage)]">
                    Accepted
                  </span>
                ) : (
                  <DocumentAction
                    actionKey="accept-source-change"
                    surfaceKey="piece"
                    regionKey={`source-change-${index + 1}`}
                    variant="primary"
                    onClick={() => void accept(c)}
                    disabled={field.isPending}
                    loading={field.isPending}
                    loadingLabel="Accepting…"
                  >
                    Accept
                  </DocumentAction>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {applyError && (
        <p
          role="alert"
          className="mt-2 text-[0.72rem] text-[var(--color-clay)]"
        >
          {applyError}
        </p>
      )}
    </div>
  );
}

function Movement({
  name,
  meta,
  hue,
  children,
}: {
  name: string;
  meta: string;
  hue: string;
  children: React.ReactNode;
}) {
  return (
    <section className="pb-1 pt-9">
      <div className="mb-1 flex items-baseline gap-3">
        <span
          aria-hidden
          className="h-[4px] w-[34px] shrink-0 self-center rounded-[2px]"
          style={{ background: hue }}
        />
        <h2 className="font-heading text-[1.2rem] font-medium italic text-[var(--color-charcoal)]">
          {name}
        </h2>
        <span className="ml-auto font-mono text-[0.5rem] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
          {meta}
        </span>
      </div>
      <div className="mb-4 h-px bg-[var(--doc-ink-border)]" />
      {children}
    </section>
  );
}

/** The quiet imprint at the foot — provenance & lifecycle, collapsed by default. */
function Colophon({ p }: { p: PieceProduct }) {
  const [open, setOpen] = useState(false);
  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-US', { dateStyle: 'medium' }) : null;

  const rows: Array<[string, string | null]> = [
    ['Layer', LAYER_LABEL[(p.layer as Layer) ?? 'personal']],
    ['Status', labelStatus(p.status)],
    ['Patina-managed', p.patina_managed ? 'yes' : 'no'],
    ['Captured', fmt(p.captured_at)],
    ['Created', fmt(p.created_at)],
    ['Updated', fmt(p.updated_at)],
    ['Published', fmt(p.published_at)],
    ['Promoted', fmt(p.promoted_at)],
    ['Aesthete read', p.quality_score != null ? String(p.quality_score) : null],
    ['Embedding refreshed', fmt(p.embedding_updated_at)],
  ];

  return (
    <section className="mt-10 border-t border-[var(--doc-ink-border)] pt-5">
      {/* The imprint opens on a word, not a plate (I107): the score draws in
          under the label on hover/focus and stays down, in charcoal, for as
          long as the colophon is open. The 44px target is padding only. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex min-h-11 min-w-11 items-center gap-2 font-mono text-[0.5rem] font-semibold uppercase tracking-[0.1em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] ${
          open
            ? 'text-[var(--color-charcoal)]'
            : 'text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]'
        }`}
      >
        <span
          aria-hidden
          className={`transition-transform ${open ? 'rotate-90' : ''}`}
        >
          ▸
        </span>
        <span className={`da-score-hover ${open ? 'da-score-on' : ''}`}>
          Colophon · provenance &amp; lifecycle
        </span>
      </button>
      {open && (
        <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
          {rows
            .filter(([, v]) => v != null)
            .map(([k, v]) => (
              <div key={k}>
                <dt className="font-mono text-[0.46rem] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
                  {k}
                </dt>
                <dd className="text-[0.78rem] text-[var(--color-mocha)]">
                  {v}
                </dd>
              </div>
            ))}
        </dl>
      )}
    </section>
  );
}
