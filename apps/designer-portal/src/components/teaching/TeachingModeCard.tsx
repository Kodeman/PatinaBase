'use client';

import Link from 'next/link';

interface TeachingMode {
  id: string;
  title: string;
  description: string;
  icon: string;
  href: string;
  color: string;
  estimate: string;
}

interface TeachingModeCardProps {
  mode: TeachingMode;
}

const ICONS: Record<string, React.ReactNode> = {
  zap: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  microscope: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
      />
    </svg>
  ),
  'check-circle': (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
};

export function TeachingModeCard({ mode }: TeachingModeCardProps) {
  return (
    <Link href={mode.href} className="group block">
      <div className="bg-white rounded-lg border border-patina-clay-beige/30 p-6 h-full hover:border-patina-mocha-brown hover:shadow-md transition-all">
        {/* Icon */}
        <div
          className={`w-12 h-12 rounded-lg ${mode.color} text-white flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
        >
          {ICONS[mode.icon]}
        </div>

        {/* Content */}
        <h3 className="text-lg font-medium text-patina-charcoal mb-2 group-hover:text-patina-mocha-brown transition-colors">
          {mode.title}
        </h3>
        <p className="text-sm text-patina-mocha-brown mb-4">{mode.description}</p>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-patina-mocha-brown/70">{mode.estimate}</span>
          <span className="text-patina-mocha-brown group-hover:translate-x-1 transition-transform">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}
