'use client';

import { StrataMark } from '@/components/portal/strata-mark';

const resourceCategories = [
  {
    label: 'Getting Started',
    items: [
      { title: 'Platform Overview', description: 'How Patina connects designers with clients' },
      { title: 'Setting Up Your Profile', description: 'Complete your designer profile and style preferences' },
      { title: 'Understanding Lead Matching', description: 'How the match score algorithm works' },
    ],
  },
  {
    label: 'Working with Clients',
    items: [
      { title: 'Creating Proposals', description: 'Build compelling design proposals for clients' },
      { title: 'Managing Projects', description: 'Track project phases from consultation to completion' },
      { title: 'Communication Best Practices', description: 'Tips for effective client communication' },
    ],
  },
  {
    label: 'Business Tools',
    items: [
      { title: 'Earnings & Payments', description: 'Understanding commissions and payout schedules' },
      { title: 'Product Sourcing', description: 'Using the catalog and vendor directory' },
      { title: 'Room Scanning Guide', description: 'How to use 3D room scans in your workflow' },
    ],
  },
];

export default function ResourcesPage() {
  return (
    <div className="pt-8">
      <h1 className="type-section-head mb-6">Resources</h1>

      {resourceCategories.map((category, i) => (
        <div key={category.label}>
          <h2 className="type-meta mb-4">{category.label}</h2>
          <div className="mb-2">
            {category.items.map((item) => (
              <div
                key={item.title}
                className="cursor-pointer border-b border-[var(--border-subtle)] py-4 transition-colors hover:bg-[var(--bg-hover)]"
              >
                <span className="type-label">{item.title}</span>
                <p className="type-body-small mt-1">{item.description}</p>
              </div>
            ))}
          </div>
          {i < resourceCategories.length - 1 && <StrataMark variant="mini" />}
        </div>
      ))}
    </div>
  );
}
