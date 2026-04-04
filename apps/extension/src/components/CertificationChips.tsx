/**
 * Multi-select certification chips for vendor capture
 * Shows predefined certifications with toggle selection
 */

import type { VendorCertification, CertificationInfo } from '@patina/shared/types';
import { CERTIFICATION_OPTIONS } from '@patina/shared/types';

interface CertificationChipsProps {
  selected: VendorCertification[];
  onChange: (certifications: VendorCertification[]) => void;
  /** Show only detected certifications initially, with option to show all */
  detected?: VendorCertification[];
}

export function CertificationChips({
  selected,
  onChange,
  detected = [],
}: CertificationChipsProps) {
  const toggleCertification = (cert: VendorCertification) => {
    if (selected.includes(cert)) {
      onChange(selected.filter((c) => c !== cert));
    } else {
      onChange([...selected, cert]);
    }
  };

  // Sort: detected first, then selected, then rest
  const sortedOptions = [...CERTIFICATION_OPTIONS].sort((a, b) => {
    const aDetected = detected.includes(a.key);
    const bDetected = detected.includes(b.key);
    const aSelected = selected.includes(a.key);
    const bSelected = selected.includes(b.key);

    if (aDetected && !bDetected) return -1;
    if (!aDetected && bDetected) return 1;
    if (aSelected && !bSelected) return -1;
    if (!aSelected && bSelected) return 1;
    return 0;
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {sortedOptions.map((cert) => {
          const isSelected = selected.includes(cert.key);
          const isDetected = detected.includes(cert.key);

          return (
            <button
              key={cert.key}
              type="button"
              onClick={() => toggleCertification(cert.key)}
              title={cert.description}
              className={`
                px-2 py-1 text-[0.78rem] font-medium rounded-sm transition-all border
                ${isSelected
                  ? 'border-clay bg-off-white text-charcoal'
                  : isDetected
                    ? 'bg-sage/15 text-sage border-sage/40 hover:bg-sage/25'
                    : 'bg-off-white border-pearl text-mocha hover:border-clay/50'
                }
              `}
            >
              {isDetected && !isSelected && (
                <span className="mr-1 text-[10px]" title="Auto-detected">✓</span>
              )}
              {cert.label}
            </button>
          );
        })}
      </div>
      {detected.length > 0 && (
        <p className="font-mono text-[0.55rem] uppercase tracking-[0.06em] text-aged-oak">
          ✓ = Auto-detected from page
        </p>
      )}
    </div>
  );
}
