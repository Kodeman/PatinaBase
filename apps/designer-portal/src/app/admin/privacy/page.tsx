'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@patina/design-system';
// REPLACED: card';
import { Badge } from '@patina/design-system';
// REPLACED: badge';
import { Button } from '@patina/design-system';
// REPLACED: button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@patina/design-system';
// REPLACED: table';
import { ScrollArea } from '@patina/design-system';
// REPLACED: scroll-area';
import { privacyRequests } from '@/data/mock-admin';
import { Shield, Download, Trash2, AlertTriangle } from 'lucide-react';

const statusVariant: Record<string, 'secondary' | 'warning' | 'destructive' | 'success'> = {
  new: 'secondary',
  in_progress: 'warning',
  blocked: 'destructive',
  fulfilled: 'success',
};

const typeCopy: Record<string, string> = {
  export: 'Data export',
  delete: 'Deletion',
  rectify: 'Rectification',
  consent: 'Consent',
};

const riskVariant = {
  low: 'secondary',
  medium: 'warning',
  high: 'destructive',
} as const;

export default function PrivacyPage() {
  const openRequests = privacyRequests.filter((req) => req.status !== 'fulfilled');
  const overdue = privacyRequests.filter((req) => req.slaHoursRemaining < 6 && req.status !== 'fulfilled');
  const exportsCount = privacyRequests.filter((req) => req.type === 'export').length;
  const deletesCount = privacyRequests.filter((req) => req.type === 'delete').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Privacy Operations</h1>
        <p className="text-muted-foreground">
          Manage GDPR/CCPA compliance, data subject requests, and SLAs
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Open Requests
            </CardTitle>
            {overdue.length > 0 && (
              <Badge variant="solid" color="error" className="text-[10px]">
                {overdue.length} near SLA
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openRequests.length}</div>
            <p className="text-xs text-muted-foreground">Auto-prioritized by SLA</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Download className="h-4 w-4" />
              Exports (30d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{exportsCount}</div>
            <p className="text-xs text-muted-foreground">Avg turnaround 26h</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              Deletions (30d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{deletesCount}</div>
            <p className="text-xs text-muted-foreground">Manual review required</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Data Subject Requests</CardTitle>
            <CardDescription>Queued items with SLA countdown</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              Export queue
            </Button>
            <Button size="sm">New request</Button>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>SLA Remaining</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {privacyRequests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <p className="font-medium">{request.user}</p>
                      <p className="text-xs font-mono text-muted-foreground">{request.id}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{typeCopy[request.type]}</Badge>
                    </TableCell>
                    <TableCell>{request.region}</TableCell>
                    <TableCell className="text-sm">
                      {new Date(request.submittedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell>
                      {request.slaHoursRemaining <= 6 && request.status !== 'fulfilled' ? (
                        <div className="flex items-center gap-1 text-destructive">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {request.slaHoursRemaining}h
                        </div>
                      ) : (
                        <span>{request.slaHoursRemaining}h</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{request.owner}</p>
                      <Badge variant={riskVariant[request.risk]} className="mt-1 text-[10px]">
                        {request.risk} risk
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[request.status]}>
                        {request.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm">
                          Review
                        </Button>
                        {request.status !== 'fulfilled' && (
                          <Button size="sm">Complete</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
