'use client';

import { mockData } from '@/data/mock-designer-data';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@patina/design-system';
import { formatRelativeTime } from '@/lib/utils';
import { Brain, Sparkles, Tag } from 'lucide-react';

export default function TeachingPage() {
  const insights = mockData.getTeachingInsights();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Rec intelligence</p>
          <h1 className="text-3xl font-bold tracking-tight">Teaching console</h1>
          <p className="text-muted-foreground">
            Shape recommendations and labels before proposals leave the studio.
          </p>
        </div>
        <Button>
          <Sparkles className="mr-2 h-4 w-4" /> Open rule builder
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Recommendation lift</p>
            <p className="text-3xl font-semibold">+{insights.impact.recLift}%</p>
            <p className="text-xs text-muted-foreground">
              Last sync {formatRelativeTime(insights.impact.lastSync)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Acceptance delta</p>
            <p className="text-3xl font-semibold">+{insights.impact.acceptanceDelta}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Override drop</p>
            <p className="text-3xl font-semibold">-{insights.impact.overrideDrop}%</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Feedback queue</CardTitle>
            <CardDescription>Inline actions waiting for review</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {insights.feedbackQueue.map((item) => (
              <div key={item.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{item.productName}</p>
                    <p className="text-sm text-muted-foreground">{item.clientName}</p>
                  </div>
                  <Badge variant="outline">{item.action}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{item.reason}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {item.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                  <span>Budget {item.budgetFit}</span>
                  <Button size="sm" variant="outline">
                    <Brain className="mr-2 h-4 w-4" /> Apply action
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Label library</CardTitle>
              <CardDescription>Frequently applied designer labels</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {insights.labels.map((label) => (
                <div key={label.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{label.name}</p>
                      <p className="text-xs text-muted-foreground">{label.description}</p>
                    </div>
                    <Badge variant="outline">{label.usage} uses</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Last applied {formatRelativeTime(label.lastApplied)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rules & timeline</CardTitle>
              <CardDescription>Latest automations and signals</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {insights.rules.map((rule) => (
                <div key={rule.id} className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Tag className="h-4 w-4" /> {rule.name}
                  </div>
                  <p className="text-xs text-muted-foreground">{rule.predicate}</p>
                  <p className="text-xs text-muted-foreground">
                    Impact {rule.impact} · triggered {formatRelativeTime(rule.lastTriggered)}
                  </p>
                </div>
              ))}
              <div className="space-y-2 text-sm text-muted-foreground">
                {insights.timeline.map((event) => (
                  <div key={event.id} className="rounded-lg border p-3">
                    <p className="font-medium text-foreground">{event.label}</p>
                    <p className="text-xs">{event.details}</p>
                    <p className="text-xs">{formatRelativeTime(event.timestamp)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
