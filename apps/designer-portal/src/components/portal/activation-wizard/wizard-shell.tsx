'use client';

import { type ReactNode } from 'react';
import { Button } from '@/components/ui/controls';
import {
  STEP_LABELS,
  TOTAL_WIZARD_STEPS,
  useActivationWizard,
  type WizardStep,
} from '@/stores/project-activation-store';

interface WizardShellProps {
  title: string;
  subtitle?: string;
  canAdvance?: boolean;
  onActivate?: () => void;
  isActivating?: boolean;
  children: ReactNode;
}

export function WizardShell({
  title,
  subtitle,
  canAdvance = true,
  onActivate,
  isActivating = false,
  children,
}: WizardShellProps) {
  const { step, nextStep, prevStep, setStep, isDirty, lastSavedAt } = useActivationWizard();

  const isLast = step === TOTAL_WIZARD_STEPS;

  return (
    <div>
      {/* Stepper */}
      <div className="mb-8 flex flex-wrap gap-2">
        {(Array.from({ length: TOTAL_WIZARD_STEPS }, (_, i) => (i + 1) as WizardStep)).map((n) => {
          const state = n === step ? 'active' : n < step ? 'done' : 'future';
          return (
            <button
              key={n}
              type="button"
              onClick={() => setStep(n)}
              className="flex flex-1 min-w-[110px] flex-col gap-1.5 text-left"
              disabled={n > step}
            >
              <span
                className="h-0.5 rounded-full"
                style={{
                  background:
                    state === 'active'
                      ? 'var(--text-primary)'
                      : state === 'done'
                        ? 'var(--color-sage, #A8B5A0)'
                        : 'var(--color-pearl, #E5E2DD)',
                }}
              />
              <span
                className="type-meta-small uppercase tracking-wider"
                style={{
                  color:
                    state === 'active'
                      ? 'var(--text-primary)'
                      : state === 'done'
                        ? 'var(--text-primary)'
                        : 'var(--text-muted)',
                  fontWeight: state === 'active' ? 600 : 400,
                }}
              >
                {String(n).padStart(2, '0')} · {STEP_LABELS[n]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Step header */}
      <div className="mb-6">
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.6rem',
            fontWeight: 400,
            color: 'var(--text-primary)',
            marginBottom: '0.25rem',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="type-label-secondary text-[0.85rem]">{subtitle}</p>
        )}
      </div>

      {/* Step body */}
      <div className="mb-8">{children}</div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t pt-4" style={{ borderColor: 'var(--border-default)' }}>
        <div className="type-meta-small text-[var(--text-muted)]">
          {isDirty
            ? 'Unsaved changes'
            : lastSavedAt
              ? `Saved ${new Date(lastSavedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
              : ''}
        </div>
        <div className="flex gap-2">
          {step > 1 && (
            <Button
              variant="secondary"
              onClick={prevStep}
            >
              ← Back
            </Button>
          )}
          {!isLast ? (
            <Button
              variant="primary"
              onClick={nextStep}
              disabled={!canAdvance}
            >
              Continue →
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={onActivate}
              disabled={isActivating}
            >
              {isActivating ? 'Activating…' : 'Activate Project →'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
