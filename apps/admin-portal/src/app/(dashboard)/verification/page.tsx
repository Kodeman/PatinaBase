'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Check, X, Eye, Clock } from 'lucide-react';
import { usersService } from '@/services/users';
import { formatDate } from '@/lib/utils';
import type { DesignerProfile } from '@/types';

export default function VerificationPage() {
  const [selectedStatus, setSelectedStatus] = useState<string>('in_review');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['verification-queue', selectedStatus],
    queryFn: () =>
      usersService.getVerificationQueue({
        status: selectedStatus,
        pageSize: 50,
      }),
  });

  const approveMutation = useMutation({
    mutationFn: ({ userId, notes }: { userId: string; notes?: string }) =>
      usersService.approveDesigner(userId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verification-queue'] });
      toast.success('Designer approved successfully');
    },
    onError: () => {
      toast.error('Failed to approve designer');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ userId, notes }: { userId: string; notes: string }) =>
      usersService.rejectDesigner(userId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verification-queue'] });
      toast.success('Designer rejected');
    },
    onError: () => {
      toast.error('Failed to reject designer');
    },
  });

  const profiles = data?.data || [];

  const statuses = [
    { value: 'submitted', label: 'Submitted', count: 5 },
    { value: 'in_review', label: 'In Review', count: 12 },
    { value: 'approved', label: 'Approved', count: 234 },
    { value: 'rejected', label: 'Rejected', count: 8 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Designer Verification
        </h1>
        <p className="text-muted-foreground">
          Review and approve designer applications
        </p>
      </div>

      <div className="flex gap-2">
        {statuses.map((status) => (
          <Button
            key={status.value}
            variant={selectedStatus === status.value ? 'default' : 'outline'}
            onClick={() => setSelectedStatus(status.value)}
          >
            {status.label}
            <Badge variant="secondary" className="ml-2">
              {status.count}
            </Badge>
          </Button>
        ))}
      </div>

      <div className="grid gap-4">
        {isLoading ? (
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-muted-foreground">
                Loading verification queue...
              </div>
            </CardContent>
          </Card>
        ) : profiles.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-muted-foreground">
                No designers in this status
              </div>
            </CardContent>
          </Card>
        ) : (
          profiles.map((profile: DesignerProfile & { email?: string }) => (
            <Card key={profile.userId}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {profile.businessName || 'Unnamed Business'}
                    </CardTitle>
                    <CardDescription>
                      {profile.email || profile.userId}
                    </CardDescription>
                  </div>
                  <Badge
                    variant={
                      profile.status === 'approved'
                        ? 'success'
                        : profile.status === 'rejected'
                        ? 'destructive'
                        : 'warning'
                    }
                  >
                    {profile.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium">Website</div>
                      <div className="text-sm text-muted-foreground">
                        {profile.website || 'Not provided'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Submitted</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(profile.createdAt)}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-medium mb-2">Documents</div>
                    <div className="flex gap-2">
                      {profile.documents?.map((doc, idx) => (
                        <Button
                          key={idx}
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(doc.url, '_blank')}
                        >
                          <Eye className="mr-2 h-3 w-3" />
                          {doc.name}
                        </Button>
                      ))}
                      {(!profile.documents || profile.documents.length === 0) && (
                        <span className="text-sm text-muted-foreground">
                          No documents uploaded
                        </span>
                      )}
                    </div>
                  </div>

                  {profile.notes && (
                    <div>
                      <div className="text-sm font-medium mb-1">Notes</div>
                      <div className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
                        {profile.notes}
                      </div>
                    </div>
                  )}

                  {selectedStatus === 'in_review' && (
                    <div className="flex gap-2 pt-2">
                      <Button
                        className="flex-1"
                        onClick={() =>
                          approveMutation.mutate({
                            userId: profile.userId,
                            notes: 'Approved from admin portal',
                          })
                        }
                        disabled={approveMutation.isPending}
                      >
                        <Check className="mr-2 h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={() =>
                          rejectMutation.mutate({
                            userId: profile.userId,
                            notes: 'Rejected from admin portal',
                          })
                        }
                        disabled={rejectMutation.isPending}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
