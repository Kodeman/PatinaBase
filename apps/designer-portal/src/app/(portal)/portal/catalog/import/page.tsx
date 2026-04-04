'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Breadcrumb,
  UploadZone,
  PortalButton,
} from '@/components/portal';

type ImportStep = 1 | 2 | 3;

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

      <h1 className="type-page-title mb-6" style={{ fontSize: '1.5rem' }}>
        Import Products
      </h1>

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
