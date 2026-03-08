'use client';

import { Leaf, Shield, Heart, Award, CheckCircle } from 'lucide-react';

interface CertificationBadgeProps {
  certification: 'fsc' | 'greenguard' | 'bcorp' | 'fairtrade' | 'custom';
  level?: string;
  isVerified: boolean;
  size?: 'sm' | 'md';
}

const CERTIFICATION_CONFIG = {
  fsc: {
    label: 'FSC Certified',
    icon: Leaf,
    color: 'bg-green-100 text-green-700 border-green-200',
  },
  greenguard: {
    label: 'GREENGUARD',
    icon: Shield,
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  bcorp: {
    label: 'B Corp',
    icon: Award,
    color: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  fairtrade: {
    label: 'Fair Trade',
    icon: Heart,
    color: 'bg-teal-100 text-teal-700 border-teal-200',
  },
  custom: {
    label: 'Certified',
    icon: Award,
    color: 'bg-patina-clay-beige/30 text-patina-mocha-brown border-patina-clay-beige',
  },
} as const;

const SIZE_STYLES = {
  sm: {
    container: 'px-2 py-0.5 gap-1',
    icon: 'w-3 h-3',
    text: 'text-xs',
    check: 'w-3 h-3',
  },
  md: {
    container: 'px-2.5 py-1 gap-1.5',
    icon: 'w-4 h-4',
    text: 'text-sm',
    check: 'w-3.5 h-3.5',
  },
} as const;

export function CertificationBadge({
  certification,
  level,
  isVerified,
  size = 'md',
}: CertificationBadgeProps) {
  const config = CERTIFICATION_CONFIG[certification];
  const styles = SIZE_STYLES[size];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center rounded-full border ${config.color} ${styles.container}`}
    >
      <Icon className={styles.icon} aria-hidden="true" />
      <span className={`font-medium ${styles.text}`}>
        {config.label}
        {level && <span className="ml-0.5 font-normal">({level})</span>}
      </span>
      {isVerified && (
        <CheckCircle
          className={`${styles.check} text-green-600 ml-0.5`}
          aria-label="Verified"
        />
      )}
    </span>
  );
}
