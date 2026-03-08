'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@patina/design-system';
// REPLACED: card';
import { Badge } from '@patina/design-system';
// REPLACED: badge';
import { CheckCircle2, AlertCircle } from 'lucide-react';

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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">System Health</h1>
        <p className="text-muted-foreground">
          Monitor service health and performance metrics
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Services</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">10/10</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <CheckCircle2 className="h-3 w-3 text-success" />
              All healthy
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">56ms</div>
            <p className="text-xs text-muted-foreground">p95: 234ms</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0.02%</div>
            <p className="text-xs text-muted-foreground">Within SLO</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Uptime</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">99.96%</div>
            <p className="text-xs text-muted-foreground">30 day average</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Service Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {services.map((service) => (
              <div
                key={service.name}
                className="flex items-center justify-between p-3 rounded-lg border"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <span className="font-medium">{service.name}</span>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">Latency</div>
                    <div className="font-mono text-sm">{service.latency}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">Uptime</div>
                    <div className="font-mono text-sm">{service.uptime}</div>
                  </div>
                  <Badge variant="solid" color="success">Healthy</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
