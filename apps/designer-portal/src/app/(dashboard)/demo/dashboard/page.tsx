import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ProgressBar,
} from '@patina/design-system';
import {
  AlertTriangle,
  CheckCircle2,
  Flame,
  Layers,
  MessageSquare,
  Sparkles,
  Target,
} from 'lucide-react';

import { mockData } from '@/data/mock-designer-data';
import { auth } from '@/lib/auth';
import { formatRelativeTime } from '@/lib/utils';

export default async function DashboardPage() {
  const session = await auth();
  if (!session) {
    redirect('/auth/signin');
  }

  const snapshot = mockData.getDashboardSnapshot();
  const teaching = mockData.getTeachingInsights();

  const heroGreeting = snapshot.hero.greeting.replace(
    'Jane',
    session.user.name?.split(' ')[0] ?? 'there'
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{snapshot.hero.focus}</p>
          <h1 className="text-3xl font-bold tracking-tight">{heroGreeting}</h1>
          <p className="text-muted-foreground">{snapshot.hero.nextAction}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/messages">
              <MessageSquare className="mr-2 h-4 w-4" />
              Open messages
            </Link>
          </Button>
          <Button asChild>
            <Link href="/demo/teaching">
              <Sparkles className="mr-2 h-4 w-4" />
              Teaching workspace
            </Link>
          </Button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {snapshot.stats.map((stat) => (
          <Card key={stat.id} className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-semibold">{stat.value}</p>
                <p className="text-xs text-emerald-600">{stat.delta}</p>
              </div>
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                {stat.id === 'clients' && <Layers className="h-5 w-5" />}
                {stat.id === 'proposals' && <Target className="h-5 w-5" />}
                {stat.id === 'teaching' && <Sparkles className="h-5 w-5" />}
                {stat.id === 'messages' && <MessageSquare className="h-5 w-5" />}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline focus</CardTitle>
            <CardDescription>Key accounts across the studio</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {snapshot.pipeline.map((entry) => (
              <div
                key={entry.id}
                className="rounded-lg border p-4 hover:border-primary/30"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{entry.clientName}</p>
                    <p className="text-xs text-muted-foreground">{entry.stage}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {entry.dueLabel}
                  </Badge>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Flame className="h-4 w-4" />
                    {entry.milestone}
                  </div>
                  <span
                    className={
                      entry.status === 'blocked'
                        ? 'text-red-500'
                        : entry.status === 'at-risk'
                        ? 'text-yellow-600'
                        : 'text-emerald-600'
                    }
                  >
                    {entry.status.replace('-', ' ')}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Teaching impact</CardTitle>
                <CardDescription>
                  Last sync {formatRelativeTime(teaching.impact.lastSync)}
                </CardDescription>
              </div>
              <Badge variant="subtle" color="neutral">+{teaching.impact.recLift}% lift</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm">
                <span>Acceptance delta</span>
                <span className="font-semibold text-emerald-600">
                  +{teaching.impact.acceptanceDelta}%
                </span>
              </div>
              <ProgressBar className="mt-2" value={teaching.impact.acceptanceDelta} />
            </div>
            <div>
              <div className="flex items-center justify-between text-sm">
                <span>Override drop</span>
                <span className="font-semibold text-emerald-600">
                  -{teaching.impact.overrideDrop}%
                </span>
              </div>
              <ProgressBar className="mt-2" value={teaching.impact.overrideDrop} />
            </div>
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Quick queue
              </p>
              <div className="mt-2 space-y-3">
                {teaching.feedbackQueue.slice(0, 2).map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">{item.clientName}</p>
                    </div>
                    <Badge variant="outline">{item.action}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <div>
              <CardTitle>Alerts & blockers</CardTitle>
              <CardDescription>Inventory and delivery guards</CardDescription>
            </div>
            <Badge variant="destructive" className="text-xs">
              {snapshot.alerts.length} urgent
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {snapshot.alerts.map((alert) => (
              <div key={alert.id} className="rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <p className="font-medium">{alert.title}</p>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{alert.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest activity</CardTitle>
            <CardDescription>Notable signals from the last 24h</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {snapshot.updates.map((update) => (
              <div key={update.id} className="flex gap-3">
                <div className="mt-1 rounded-full bg-primary/10 p-1 text-primary">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">{update.label}</p>
                  <p className="text-sm text-muted-foreground">{update.detail}</p>
                  <p className="text-xs text-muted-foreground">{update.timestamp}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
