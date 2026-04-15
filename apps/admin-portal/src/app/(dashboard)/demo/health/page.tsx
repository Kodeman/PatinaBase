'use client';

import {
  PageHeader,
  MetricBlock,
  MetricsRow,
  Section,
  StatusDot,
} from '@/components/portal';

const services = [
  { name: 'API Gateway', status: 'healthy', latency: '45ms', uptime: '99.99%' },
  { name: 'User Service', status: 'healthy', latency: '23ms', uptime: '99.95%' },
  { name: 'Catalog Service', status: 'healthy', latency: '67ms', uptime: '99.98%' },
  { name: 'Media Service', status: 'healthy', latency: '89ms', uptime: '99.92%' },
  { name: 'Orders Service', status: 'healthy', latency: '34ms', uptime: '99.97%' },
  { name: 'Search Service', status: 'healthy', latency: '156ms', uptime: '99.93%' },
  { name: 'PostgreSQL', status: 'healthy', latency: '12ms', uptime: '99.99%' },
  { name: 'Redis', status: 'healthy', latency: '3ms', uptime: '99.98%' },
  { name: 'OpenSearch', status: 'healthy', latency: '78ms', uptime: '99.95%' },
  { name: 'OCI Streaming', status: 'healthy', latency: '45ms', uptime: '99.97%' },
];

export default function HealthPage() {
  return (
    <div>
      <PageHeader
        title="System"
        accent="Health"
        description="Monitor service health and performance metrics."
      />

      <MetricsRow>
        <MetricBlock label="Services" value="10/10" change="All healthy" trend="up" />
        <MetricBlock label="Avg Latency" value="56ms" change="p95: 234ms" trend="neutral" />
        <MetricBlock label="Error Rate" value="0.02%" change="Within SLO" trend="up" />
        <MetricBlock label="Uptime" value="99.96%" change="30 day avg" trend="up" />
      </MetricsRow>

      <Section title="Service Status" className="mt-10">
        <div>
          {services.map((service) => (
            <div
              key={service.name}
              className="flex items-center justify-between border-b border-[var(--border-subtle)] py-4 last:border-b-0"
            >
              <div className="flex items-center gap-3">
                <StatusDot variant="success" />
                <span className="type-item-name">{service.name}</span>
              </div>
              <div className="flex items-center gap-8">
                <div className="text-right">
                  <div className="type-meta-small">Latency</div>
                  <div className="type-body-small font-mono">{service.latency}</div>
                </div>
                <div className="text-right">
                  <div className="type-meta-small">Uptime</div>
                  <div className="type-body-small font-mono">{service.uptime}</div>
                </div>
                <StatusDot variant="success" label="Healthy" />
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
