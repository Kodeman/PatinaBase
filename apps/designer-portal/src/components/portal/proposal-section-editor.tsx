'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ProposalSection } from '@/hooks/use-proposals';
import { UploadZone } from './upload-zone';
import { ProposalProductItem } from './proposal-product-item';
import { InvestmentTable } from './investment-table';
import { PaymentSchedule } from './payment-schedule';
import { TimelinePhases } from './timeline-phases';
import { SignatureBlock } from './signature-block';

interface ProposalSectionEditorProps {
  section: ProposalSection;
  onUpdate: (updates: { title?: string; body?: string; metadata?: Record<string, unknown> }) => void;
  proposalItems?: Array<{
    id: string;
    name: string;
    vendor_name?: string | null;
    image_url?: string | null;
    product?: { name?: string; images?: string[] | null; brand?: string | null } | null;
    unit_price: number;
    quantity: number;
    category?: string | null;
  }>;
  totalAmount?: number;
  clientName?: string | null;
  designerName?: string | null;
}

export function ProposalSectionEditor({
  section,
  onUpdate,
  proposalItems = [],
  totalAmount = 0,
  clientName,
  designerName,
}: ProposalSectionEditorProps) {
  const [body, setBody] = useState(section.body || '');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync incoming section changes
  useEffect(() => {
    setBody(section.body || '');
  }, [section.id, section.body]);

  const handleBodyChange = useCallback(
    (newBody: string) => {
      setBody(newBody);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onUpdate({ body: newBody });
      }, 1000);
    },
    [onUpdate]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <section className="py-8">
      {/* Section heading — matching Playfair Display from design spec */}
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: '1.4rem',
          color: 'var(--text-primary)',
          marginBottom: '1.25rem',
        }}
      >
        {section.title}
      </h2>

      {/* Body text — styled textarea matching proposal typography */}
      {section.type !== 'investment' && section.type !== 'timeline' && section.type !== 'terms' && (
        <textarea
          value={body}
          onChange={(e) => handleBodyChange(e.target.value)}
          placeholder={`Write about your ${section.title.toLowerCase()}...`}
          className="w-full resize-none border-0 bg-transparent outline-none"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.92rem',
            lineHeight: 1.75,
            color: 'var(--text-body)',
            maxWidth: 640,
            minHeight: 80,
          }}
          rows={4}
        />
      )}

      {/* Section-specific content */}
      {section.type === 'concept' && (
        <ConceptSection
          metadata={section.metadata}
          onUpdate={onUpdate}
        />
      )}

      {section.type === 'space_plan' && (
        <SpacePlanSection metadata={section.metadata} />
      )}

      {section.type === 'selections' && (
        <SelectionsSection items={proposalItems} />
      )}

      {section.type === 'investment' && (
        <InvestmentSection items={proposalItems} totalAmount={totalAmount} />
      )}

      {section.type === 'timeline' && (
        <TimelineSection metadata={section.metadata} />
      )}

      {section.type === 'terms' && (
        <TermsSection
          body={body}
          onBodyChange={handleBodyChange}
          clientName={clientName}
          designerName={designerName}
        />
      )}
    </section>
  );
}

// ── Concept Section ──
function ConceptSection({
  metadata,
  onUpdate,
}: {
  metadata: Record<string, unknown>;
  onUpdate: (updates: { metadata?: Record<string, unknown> }) => void;
}) {
  const colorPalette = (metadata.color_palette as Array<{ hex: string; name?: string }>) || [];

  return (
    <div className="mt-6">
      <div
        className="mb-3"
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.62rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
        }}
      >
        Mood Board
      </div>
      <UploadZone
        onFiles={(files) => {
          // Upload handling will connect to media service
          console.log('Mood board files:', files);
        }}
        label="Drop mood board images here or click to upload"
        hint="JPG, PNG, WebP"
        className="mb-6"
      />

      <div
        className="mb-2 mt-6"
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.62rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
        }}
      >
        Color Palette
      </div>
      <div className="flex gap-1.5">
        {colorPalette.length > 0
          ? colorPalette.map((c, i) => (
              <div
                key={i}
                className="h-12 w-12 rounded"
                style={{ background: c.hex }}
                title={c.name || c.hex}
              />
            ))
          : ['#E8DDD0', '#C4A57B', '#8B7355', '#A8B5A0', '#FAF7F2'].map((hex, i) => (
              <div
                key={i}
                className="h-12 w-12 cursor-pointer rounded opacity-30 transition-opacity hover:opacity-60"
                style={{ background: hex }}
                onClick={() => {
                  const newPalette = [...colorPalette, { hex }];
                  onUpdate({ metadata: { ...metadata, color_palette: newPalette } });
                }}
              />
            ))}
      </div>
    </div>
  );
}

// ── Space Plan Section ──
function SpacePlanSection({ metadata }: { metadata: Record<string, unknown> }) {
  const floorPlanUrl = metadata.floor_plan_url as string | undefined;

  return (
    <div className="mt-4">
      <div
        className="relative mb-4 flex h-[220px] items-center justify-center overflow-hidden rounded-lg"
        style={{ background: 'var(--color-pearl)' }}
      >
        {floorPlanUrl ? (
          <img src={floorPlanUrl} alt="Space plan" className="h-full w-full object-contain" />
        ) : (
          <span
            className="z-10"
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.55rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-muted)',
            }}
          >
            3D Room View &mdash; Imported from Room Scan
          </span>
        )}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, transparent, transparent 30px, rgba(196,165,123,0.04) 30px, rgba(196,165,123,0.04) 60px)',
          }}
        />
      </div>
    </div>
  );
}

// ── Selections Section ──
function SelectionsSection({
  items,
}: {
  items: Array<{
    id: string;
    name: string;
    vendor_name?: string | null;
    image_url?: string | null;
    product?: { name?: string; images?: string[] | null; brand?: string | null } | null;
    unit_price: number;
    quantity: number;
    category?: string | null;
  }>;
}) {
  // Group items by category
  const groups: Record<string, typeof items> = {};
  for (const item of items) {
    const cat = item.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }

  const categoryLabels: Record<string, string> = {
    furniture: 'Anchor Pieces',
    lighting: 'Supporting Pieces',
    decor: 'Finishing Details',
    textile: 'Finishing Details',
    service: 'Services',
    other: 'Other Items',
  };

  const orderedCategories = ['furniture', 'lighting', 'decor', 'textile', 'service', 'other'];

  return (
    <div className="mt-4">
      {orderedCategories.map((cat) => {
        const catItems = groups[cat];
        if (!catItems || catItems.length === 0) return null;
        return (
          <div key={cat} className="mb-6">
            <div
              className="mb-2"
              style={{
                fontFamily: 'var(--font-meta)',
                fontSize: '0.62rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
              }}
            >
              {categoryLabels[cat] || cat}
            </div>
            {catItems.map((item) => (
              <ProposalProductItem
                key={item.id}
                name={item.name || item.product?.name || 'Product'}
                maker={item.vendor_name || item.product?.brand}
                imageUrl={item.image_url || item.product?.images?.[0]}
                price={item.unit_price}
                quantity={item.quantity}
              />
            ))}
          </div>
        );
      })}
      {items.length === 0 && (
        <p
          className="py-8 text-center italic"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            color: 'var(--text-muted)',
          }}
        >
          No products selected yet. Add items from the catalog.
        </p>
      )}
    </div>
  );
}

// ── Investment Section ──
function InvestmentSection({
  items,
  totalAmount,
}: {
  items: Array<{
    id: string;
    name: string;
    product?: { name?: string } | null;
    unit_price: number;
    quantity: number;
    category?: string | null;
  }>;
  totalAmount: number;
}) {
  // Build investment rows from items, grouped
  const rows = items.map((item) => ({
    label: item.name || item.product?.name || 'Item',
    amount: item.unit_price * item.quantity,
  }));

  const defaultMilestones = [
    { label: 'Deposit', percent: 30, description: 'due on signing' },
    { label: 'Procurement', percent: 40, description: 'due before ordering' },
    { label: 'Completion', percent: 30, description: 'due on final walkthrough' },
  ];

  return (
    <div>
      <InvestmentTable rows={rows} totalAmount={totalAmount} />
      <div className="mt-6">
        <PaymentSchedule milestones={defaultMilestones} totalAmount={totalAmount} />
      </div>
    </div>
  );
}

// ── Timeline Section ──
function TimelineSection({ metadata }: { metadata: Record<string, unknown> }) {
  const phases = (metadata.phases as Array<{ dateRange: string; name: string }>) || [
    { dateRange: 'Weeks 1\u20132', name: 'Consultation & site documentation' },
    { dateRange: 'Weeks 3\u20136', name: 'Concept development & design presentation' },
    { dateRange: 'Weeks 7\u201310', name: 'Refinement, final selections, client approvals' },
    { dateRange: 'Weeks 11\u201316', name: 'Procurement & order management' },
    { dateRange: 'Weeks 17\u201318', name: 'Delivery, installation & styling' },
    { dateRange: 'Week 19', name: 'Final walkthrough & photography' },
  ];

  return <TimelinePhases phases={phases} />;
}

// ── Terms Section ──
function TermsSection({
  body,
  onBodyChange,
  clientName,
  designerName,
}: {
  body: string;
  onBodyChange: (body: string) => void;
  clientName?: string | null;
  designerName?: string | null;
}) {
  return (
    <div>
      <textarea
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        placeholder="Enter terms and agreement text..."
        className="w-full resize-none border-0 bg-transparent outline-none"
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.82rem',
          lineHeight: 1.75,
          color: 'var(--text-muted)',
          maxWidth: 640,
          minHeight: 60,
        }}
        rows={3}
      />

      <div className="mt-8 grid grid-cols-2 gap-8">
        <SignatureBlock
          label="Client Signature"
          name={clientName || 'Client'}
        />
        <SignatureBlock
          label="Designer Signature"
          name={designerName || 'Designer'}
          preSignedName={designerName || undefined}
        />
      </div>
    </div>
  );
}
