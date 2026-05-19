'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Breadcrumb,
  UploadZone,
  PortalButton,
} from '@/components/portal';
import { SectionIntro, SurfaceKeys } from '@patina/help-system';

type ImportStep = 1 | 2 | 3;

// Per-step intro keys live under DesignerPortal.Products.Capture.Import.*.
// Mapping is local so an empty step doesn't trigger a redundant render.
const STEP_INTRO_SURFACE_KEYS: Record<ImportStep, string> = {
  1: SurfaceKeys.DesignerPortal.Products.Capture.Import.Upload,
  2: SurfaceKeys.DesignerPortal.Products.Capture.Import.Mapping,
  3: SurfaceKeys.DesignerPortal.Products.Capture.Import.Preview,
};

const STEP_INTRO_FALLBACKS: Record<ImportStep, string> = {
  1: 'Drop a CSV or Excel export from your vendor. We map up to 5,000 products per import.',
  2: 'Confirm we read your columns correctly. Anything we can\'t map will land as a draft for teaching.',
  3: 'Review what will be imported. Products land as drafts and queue for teaching automatically.',
};

export default function BulkImportPage() {
  const router = useRouter();
  const [step, setStep] = useState<ImportStep>(1);
  const [file, setFile] = useState<File | null>(null);

  const steps = [
    { num: 1, label: '1. Upload File' },
    { num: 2, label: '2. Map Columns' },
    { num: 3, label: '3. Preview & Import' },
  ];

  const handleFiles = (files: File[]) => {
    if (files.length > 0) {
      setFile(files[0]);
      setStep(2);
    }
  };

  return (
    <div className="pt-8">
      <Breadcrumb
        items={[
          { label: 'Products', href: '/portal/catalog' },
          { label: 'Import Products' },
        ]}
      />

      <h1 className="type-page-title mb-2" style={{ fontSize: '1.5rem' }}>
        Import Products
      </h1>

      {/* Layer 1 · Ambient page intro — sits beneath the page title and gives
          the designer a sense of what the bulk-import flow does before they
          start. */}
      <SectionIntro
        surfaceKey={SurfaceKeys.DesignerPortal.Products.Capture.Import.Root}
        fallback="Bring an existing vendor catalogue into Patina in one go. CSV, TSV, and Excel are supported."
        className="mb-6 max-w-prose"
      />

      {/* Step Indicator */}
      <div className="mb-8 flex gap-0">
        {steps.map((s) => (
          <div
            key={s.num}
            className="flex-1 border-b-[3px] pb-3"
            style={{
              borderColor: step >= s.num ? 'var(--accent-primary)' : 'var(--color-pearl)',
            }}
          >
            <span
              className="font-mono text-[0.68rem] uppercase tracking-[0.06em]"
              style={{
                color: step >= s.num ? 'var(--accent-primary)' : 'var(--text-muted)',
              }}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Per-step intro — surface key changes with the active step so authors
          can write step-specific copy in Sanity. Falls back to inline strings
          until the CMS is populated. */}
      <SectionIntro
        surfaceKey={STEP_INTRO_SURFACE_KEYS[step]}
        fallback={STEP_INTRO_FALLBACKS[step]}
        className="mb-6 max-w-prose"
      />

      {/* Step 1: Upload */}
      {step === 1 && (
        <>
          <UploadZone
            onFiles={handleFiles}
            accept=".csv,.tsv,.xlsx"
            multiple={false}
            description="Drop your CSV file here"
            label="Or click to browse your computer"
            hint="Supported: CSV, TSV, Excel (.xlsx) · Max 5,000 products per import"
            className="mb-6 min-h-[200px]"
          />

          <div className="rounded-md border border-[rgba(139,156,173,0.15)] bg-[rgba(139,156,173,0.06)] p-4">
            <p className="mb-1 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[var(--color-dusty-blue)]">
              Need a template?
            </p>
            <p className="font-body text-[0.82rem] text-[var(--text-body)]">
              Download the{' '}
              <span className="cursor-pointer border-b border-[var(--accent-primary)] text-[var(--accent-primary)]">
                Patina Import Template
              </span>{' '}
              with all required and optional columns pre-configured. Includes a sample row for
              reference.
            </p>
          </div>
        </>
      )}

      {/* Step 2: Column Mapping (stub) */}
      {step === 2 && (
        <div>
          <div className="mb-4 rounded-md border border-[var(--color-pearl)] bg-[var(--bg-surface)] p-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="type-label">File: {file?.name}</span>
              <button
                className="cursor-pointer border-0 bg-transparent font-mono text-[0.62rem] uppercase text-[var(--accent-primary)]"
                onClick={() => {
                  setFile(null);
                  setStep(1);
                }}
              >
                Change File
              </button>
            </div>
            <p className="type-body-small text-[var(--text-muted)]">
              Column mapping will be available in a future update. For now, ensure your CSV columns
              match: Name, Brand, Category, Price, Description, Material, Dimensions.
            </p>
          </div>

          <div className="flex gap-2">
            <PortalButton variant="primary" onClick={() => setStep(3)}>
              Continue to Preview
            </PortalButton>
            <PortalButton variant="ghost" onClick={() => setStep(1)}>
              Back
            </PortalButton>
          </div>
        </div>
      )}

      {/* Step 3: Preview & Import (stub) */}
      {step === 3 && (
        <div>
          <div className="mb-4 rounded-md border border-[var(--color-pearl)] bg-[var(--bg-surface)] p-6">
            <span className="type-label mb-2 block">Ready to Import</span>
            <p className="type-body-small text-[var(--text-muted)]">
              Preview and validation will be available in a future update. Products will be imported
              as drafts and added to the teaching queue automatically.
            </p>
          </div>

          <div className="flex gap-2">
            <PortalButton
              variant="primary"
              onClick={() => {
                // TODO: implement actual import
                router.push('/portal/catalog');
              }}
            >
              Import Products
            </PortalButton>
            <PortalButton variant="ghost" onClick={() => setStep(2)}>
              Back
            </PortalButton>
          </div>
        </div>
      )}
    </div>
  );
}
