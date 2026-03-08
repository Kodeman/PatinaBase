'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Download } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

const mockAuditLogs = [
  { id: '1', action: 'designer.approved', actor: 'admin@patina.com', timestamp: new Date().toISOString(), result: 'success' },
  { id: '2', action: 'product.published', actor: 'admin@patina.com', timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), result: 'success' },
  { id: '3', action: 'user.suspended', actor: 'support@patina.com', timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(), result: 'success' },
  { id: '4', action: 'role.assigned', actor: 'admin@patina.com', timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(), result: 'success' },
];

export default function AuditPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
          <p className="text-muted-foreground">
            Immutable audit trail of all privileged actions
          </p>
        </div>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by action, actor, resource..."
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {mockAuditLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between p-4 rounded-lg border"
              >
                <div className="flex items-center gap-4">
                  <div className="font-mono text-sm">{log.id}</div>
                  <div>
                    <div className="font-medium font-mono text-sm">{log.action}</div>
                    <div className="text-sm text-muted-foreground">{log.actor}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    {formatDateTime(log.timestamp)}
                  </div>
                  <Badge variant={log.result === 'success' ? 'success' : 'destructive'}>
                    {log.result}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
