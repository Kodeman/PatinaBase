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
                px-2 py-1 text-xs rounded-full transition-all
                ${isSelected
                  ? 'bg-patina-mocha-brown text-white shadow-patina-sm'
                  : isDetected
                    ? 'bg-patina-sage-green/20 text-patina-sage-green border border-patina-sage-green/40 hover:bg-patina-sage-green/30'
                    : 'bg-white border border-patina-clay-beige/50 text-patina-mocha-brown/70 hover:border-patina-mocha-brown hover:text-patina-mocha-brown'
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
        <p className="text-[10px] text-patina-mocha-brown/60">
          ✓ = Auto-detected from page
        </p>
      )}
    </div>
  );
}
