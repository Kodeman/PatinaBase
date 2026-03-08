'use client';

interface DesignerStats {
  products_taught: number;
  validations_completed: number;
  accuracy_score: number;
  consensus_rate: number;
  total_teaching_minutes: number;
  match_impact_count: number;
}

interface ImpactStatsProps {
  stats: DesignerStats | null | undefined;
  isLoading: boolean;
}

export function ImpactStats({ stats, isLoading }: ImpactStatsProps) {
  const statItems = [
    {
      label: 'Products Taught',
      value: stats?.products_taught ?? 0,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
      ),
    },
    {
      label: 'Validations',
      value: stats?.validations_completed ?? 0,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
    {
      label: 'Accuracy',
      value: stats?.accuracy_score ? `${Math.round(stats.accuracy_score * 100)}%` : '—',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      ),
    },
    {
      label: 'Matches Enabled',
      value: stats?.match_impact_count ?? 0,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg border border-patina-clay-beige/30 p-4 animate-pulse">
            <div className="h-5 w-5 bg-patina-clay-beige/30 rounded mb-2" />
            <div className="h-8 w-16 bg-patina-clay-beige/30 rounded mb-1" />
            <div className="h-4 w-20 bg-patina-clay-beige/30 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {statItems.map((item) => (
        <div
          key={item.label}
          className="bg-white rounded-lg border border-patina-clay-beige/30 p-4"
        >
          <div className="text-patina-mocha-brown/70 mb-2">{item.icon}</div>
          <div className="text-2xl font-semibold text-patina-charcoal">{item.value}</div>
          <div className="text-sm text-patina-mocha-brown">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
