'use client';

import Image from 'next/image';

interface VendorLogoProps {
  logoUrl: string | null;
  vendorName: string;
  size: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_MAP = {
  sm: 32,
  md: 48,
  lg: 64,
  xl: 96,
} as const;

const TEXT_SIZE_MAP = {
  sm: 'text-sm',
  md: 'text-lg',
  lg: 'text-2xl',
  xl: 'text-4xl',
} as const;

export function VendorLogo({ logoUrl, vendorName, size, className = '' }: VendorLogoProps) {
  const dimension = SIZE_MAP[size];
  const textSize = TEXT_SIZE_MAP[size];
  const firstLetter = vendorName.trim().charAt(0).toUpperCase();

  return (
    <div
      className={`relative flex-shrink-0 rounded-lg border border-patina-clay-beige/30 overflow-hidden ${className}`}
      style={{ width: dimension, height: dimension }}
    >
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt={`${vendorName} logo`}
          fill
          className="object-contain p-1"
          sizes={`${dimension}px`}
        />
      ) : (
        <div
          className={`w-full h-full flex items-center justify-center bg-patina-clay-beige/20 ${textSize} font-semibold text-patina-mocha-brown`}
        >
          {firstLetter}
        </div>
      )}
    </div>
  );
}
