'use client';

import * as React from 'react';
import { AlertTriangle, AlertCircle, Info, CheckCircle, RefreshCw, X } from 'lucide-react';
import { Button, Badge, Card, CardContent, Alert, AlertDescription, Textarea } from '@patina/design-system';
import { cn } from '@/lib/utils';
import type { ValidationIssue } from '@patina/types';
import { catalogApi } from '@/lib/api-client';
import { toast } from '@patina/design-system';

interface ValidationIssuesPanelProps {
  productId: string;
  className?: string;
}

const SEVERITY_ICONS = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_COLORS = {
  error: 'text-red-600 bg-red-50 border-red-200',
  warning: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  info: 'text-blue-600 bg-blue-50 border-blue-200',
};

const SEVERITY_BADGE_VARIANTS = {
  error: 'destructive' as const,
  warning: 'default' as const,
  info: 'secondary' as const,
};

export function ValidationIssuesPanel({ productId, className }: ValidationIssuesPanelProps) {
  const [issues, setIssues] = React.useState<ValidationIssue[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRevalidating, setIsRevalidating] = React.useState(false);
  const [resolvingIssueId, setResolvingIssueId] = React.useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = React.useState<Record<string, string>>({});
  const [expandedIssues, setExpandedIssues] = React.useState<Set<string>>(new Set());

  // Load validation issues
  const loadIssues = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await catalogApi.getProductValidation(productId);
      setIssues(response.data || []);
    } catch (error) {
      console.error('Failed to load validation issues:', error);
      toast({
        title: 'Error',
        description: 'Failed to load validation issues.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [productId]);

  React.useEffect(() => {
    if (productId) {
      loadIssues();
    }
  }, [productId, loadIssues]);

  // Revalidate product
  const handleRevalidate = async () => {
    setIsRevalidating(true);
    try {
      await catalogApi.revalidateProduct(productId);
      await loadIssues();
      toast({
        title: 'Validation complete',
        description: 'Product has been revalidated.',
      });
    } catch (error) {
      console.error('Failed to revalidate:', error);
      toast({
        title: 'Error',
        description: 'Failed to revalidate product.',
        variant: 'destructive',
      });
    } finally {
      setIsRevalidating(false);
    }
  };

  // Resolve issue
  const handleResolve = async (issueId: string) => {
    const notes = resolutionNotes[issueId] || 'Resolved';
    try {
      await catalogApi.resolveValidationIssue(productId, issueId, notes);
      await loadIssues();
      setResolutionNotes((prev) => {
        const next = { ...prev };
        delete next[issueId];
        return next;
      });
      setExpandedIssues((prev) => {
        const next = new Set(prev);
        next.delete(issueId);
        return next;
      });
      toast({
        title: 'Issue resolved',
        description: 'Validation issue has been marked as resolved.',
      });
    } catch (error) {
      console.error('Failed to resolve issue:', error);
      toast({
        title: 'Error',
        description: 'Failed to resolve validation issue.',
        variant: 'destructive',
      });
    }
  };

  // Unresolve issue
  const handleUnresolve = async (issueId: string) => {
    try {
      await catalogApi.unresolveValidationIssue(productId, issueId);
      await loadIssues();
      toast({
        title: 'Issue unresolved',
        description: 'Validation issue has been marked as unresolved.',
      });
    } catch (error) {
      console.error('Failed to unresolve issue:', error);
      toast({
        title: 'Error',
        description: 'Failed to unresolve validation issue.',
        variant: 'destructive',
      });
    }
  };

  // Toggle issue expansion
  const toggleExpanded = (issueId: string) => {
    setExpandedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(issueId)) {
        next.delete(issueId);
      } else {
        next.add(issueId);
      }
      return next;
    });
  };

  // Group issues by resolved status
  const unresolvedIssues = issues.filter((issue) => !issue.resolved);
  const resolvedIssues = issues.filter((issue) => issue.resolved);

  // Count by severity
  const errorCount = unresolvedIssues.filter((i) => i.severity === 'error').length;
  const warningCount = unresolvedIssues.filter((i) => i.severity === 'warning').length;
  const infoCount = unresolvedIssues.filter((i) => i.severity === 'info').length;

  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading validation issues...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header with Summary */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Validation Issues</h3>
          <p className="text-sm text-muted-foreground">
            {unresolvedIssues.length === 0 ? (
              <span className="text-green-600 font-medium">No issues found - product is valid</span>
            ) : (
              <span>
                {errorCount > 0 && <span className="text-red-600 font-medium">{errorCount} errors</span>}
                {warningCount > 0 && <span className="text-yellow-600 font-medium ml-2">{warningCount} warnings</span>}
                {infoCount > 0 && <span className="text-blue-600 font-medium ml-2">{infoCount} info</span>}
              </span>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRevalidate}
          disabled={isRevalidating}
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', isRevalidating && 'animate-spin')} />
          Revalidate
        </Button>
      </div>

      {/* No Issues - Success State */}
      {unresolvedIssues.length === 0 && resolvedIssues.length === 0 && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-900">
            This product passes all validation checks. It's ready to be published.
          </AlertDescription>
        </Alert>
      )}

      {/* Unresolved Issues */}
      {unresolvedIssues.length > 0 && (
        <div className="space-y-3">
          {unresolvedIssues.map((issue) => {
            const Icon = SEVERITY_ICONS[issue.severity];
            const isExpanded = expandedIssues.has(issue.id);

            return (
              <Card
                key={issue.id}
                className={cn(
                  'border-2',
                  issue.severity === 'error' && 'border-red-200',
                  issue.severity === 'warning' && 'border-yellow-200',
                  issue.severity === 'info' && 'border-blue-200'
                )}
              >
                <CardContent className="p-4 space-y-3">
                  {/* Issue Header */}
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'rounded-full p-2',
                        issue.severity === 'error' && 'bg-red-100',
                        issue.severity === 'warning' && 'bg-yellow-100',
                        issue.severity === 'info' && 'bg-blue-100'
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4',
                          issue.severity === 'error' && 'text-red-600',
                          issue.severity === 'warning' && 'text-yellow-600',
                          issue.severity === 'info' && 'text-blue-600'
                        )}
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={SEVERITY_BADGE_VARIANTS[issue.severity]}>
                              {issue.severity}
                            </Badge>
                            {issue.field && (
                              <Badge variant="outline" className="text-xs">
                                {issue.field}
                              </Badge>
                            )}
                            <code className="text-xs bg-muted px-2 py-0.5 rounded">
                              {issue.code}
                            </code>
                          </div>
                          <p className="text-sm font-medium">{issue.message}</p>
                          {issue.details && Object.keys(issue.details).length > 0 && (
                            <button
                              onClick={() => toggleExpanded(issue.id)}
                              className="text-xs text-muted-foreground hover:text-foreground mt-1"
                            >
                              {isExpanded ? 'Hide details' : 'Show details'}
                            </button>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setResolvingIssueId(issue.id);
                            toggleExpanded(issue.id);
                          }}
                        >
                          Resolve
                        </Button>
                      </div>

                      {/* Details */}
                      {isExpanded && issue.details && (
                        <div className="mt-3 p-3 bg-muted/50 rounded text-xs">
                          <pre className="whitespace-pre-wrap">
                            {JSON.stringify(issue.details, null, 2)}
                          </pre>
                        </div>
                      )}

                      {/* Resolution Form */}
                      {resolvingIssueId === issue.id && isExpanded && (
                        <div className="mt-3 space-y-2">
                          <Textarea
                            placeholder="Resolution notes (optional)"
                            value={resolutionNotes[issue.id] || ''}
                            onChange={(e) =>
                              setResolutionNotes((prev) => ({
                                ...prev,
                                [issue.id]: e.target.value,
                              }))
                            }
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleResolve(issue.id)}
                            >
                              Confirm Resolve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setResolvingIssueId(null);
                                toggleExpanded(issue.id);
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Resolved Issues */}
      {resolvedIssues.length > 0 && (
        <details className="space-y-3">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
            Resolved Issues ({resolvedIssues.length})
          </summary>
          <div className="space-y-2 mt-3">
            {resolvedIssues.map((issue) => {
              const Icon = SEVERITY_ICONS[issue.severity];
              return (
                <Card key={issue.id} className="opacity-60">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            {issue.severity}
                          </Badge>
                          {issue.field && (
                            <Badge variant="outline" className="text-xs">
                              {issue.field}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm line-through">{issue.message}</p>
                        {issue.resolutionNotes && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Resolution: {issue.resolutionNotes}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleUnresolve(issue.id)}
                      >
                        Unresolve
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
