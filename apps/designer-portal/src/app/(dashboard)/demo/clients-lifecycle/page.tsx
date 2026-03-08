'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ProgressBar,
  ScrollArea,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@patina/design-system';
import { cn } from '@/lib/utils';
import { CalendarCheck2, MessageSquare, NotebookPen, Sparkles, Users } from 'lucide-react';

type ClientStage = 'discovery' | 'onboarding' | 'active' | 'care';

interface DemoClient {
  id: string;
  name: string;
  company: string;
  segment: 'Residential' | 'Commercial' | 'Hospitality';
  stage: ClientStage;
  health: 'excellent' | 'watch' | 'at-risk';
  budget: string;
  velocity: string;
  lastTouch: string;
  pointOfContact: string;
  avatar?: string;
  touchpoints: Array<{ label: string; at: string; type: 'workshop' | 'site' | 'call' }>;
  roadmap: Array<{ label: string; due: string; status: 'done' | 'in-progress' | 'blocked' }>;
  sessions: Array<{ title: string; owner: string; date: string; status: 'scheduled' | 'draft' | 'completed' }>;
}

const demoClients: DemoClient[] = [
  {
    id: 'cl-104',
    name: 'Thompson Family',
    company: 'Private residential',
    segment: 'Residential',
    stage: 'onboarding',
    health: 'watch',
    budget: '$420k FF&E',
    velocity: 'Sprint 2 of 6',
    lastTouch: '2h ago • digital mood board',
    pointOfContact: 'Sophie',
    touchpoints: [
      { label: 'Lifestyle intake', at: 'Apr 08 • Virtual', type: 'workshop' },
      { label: 'Material kit drop', at: 'Apr 10 • On-site', type: 'site' },
      { label: 'Budget alignment', at: 'Apr 12 • Call', type: 'call' },
    ],
    roadmap: [
      { label: 'Finalize palette', due: 'Due tomorrow', status: 'in-progress' },
      { label: 'Confirm millwork shop', due: 'Due Apr 22', status: 'blocked' },
      { label: 'Client sign-off', due: 'Due Apr 30', status: 'in-progress' },
    ],
    sessions: [
      { title: 'Room-by-room review', owner: 'Marin', date: 'Apr 18 • 10:00', status: 'scheduled' },
      { title: 'Procurement kick', owner: 'Leo', date: 'Apr 25 • 13:00', status: 'draft' },
    ],
  },
  {
    id: 'cl-220',
    name: 'Helix Bio HQ',
    company: 'Helix Bio',
    segment: 'Commercial',
    stage: 'active',
    health: 'excellent',
    budget: '$1.2M capsule',
    velocity: 'Milestone 4 of 8',
    lastTouch: 'Today • Lab visit',
    pointOfContact: 'Marcus',
    touchpoints: [
      { label: 'Lab immersion', at: 'Apr 05 • On-site', type: 'site' },
      { label: 'Executive deck', at: 'Apr 09 • Call', type: 'call' },
      { label: 'Finish lock', at: 'Apr 15 • Workshop', type: 'workshop' },
    ],
    roadmap: [
      { label: 'Executive approvals', due: 'Complete', status: 'done' },
      { label: 'Build documentation', due: 'Due Apr 26', status: 'in-progress' },
      { label: 'Ops training', due: 'Queued', status: 'in-progress' },
    ],
    sessions: [
      { title: 'Innovation hub review', owner: 'Aya', date: 'Apr 17 • 09:00', status: 'scheduled' },
      { title: 'Furniture alignment', owner: 'Blaire', date: 'Apr 28 • 16:00', status: 'scheduled' },
    ],
  },
  {
    id: 'cl-305',
    name: 'Nova Boutique',
    company: 'Nova Hospitality',
    segment: 'Hospitality',
    stage: 'discovery',
    health: 'watch',
    budget: '$650k concept',
    velocity: 'Briefing',
    lastTouch: 'Apr 11 • Intake form',
    pointOfContact: 'Dylan',
    touchpoints: [
      { label: 'Brand immersion', at: 'Apr 02 • Virtual', type: 'workshop' },
      { label: 'Ops constraints', at: 'Apr 09 • Call', type: 'call' },
    ],
    roadmap: [
      { label: 'Define guest archetypes', due: 'Due Apr 19', status: 'in-progress' },
      { label: 'Mood film', due: 'Due Apr 24', status: 'in-progress' },
    ],
    sessions: [
      { title: 'Workshop: Guest journeys', owner: 'Tessa', date: 'Apr 19 • 11:00', status: 'draft' },
    ],
  },
  {
    id: 'cl-410',
    name: 'Greenway Developments',
    company: 'Greenway',
    segment: 'Commercial',
    stage: 'care',
    health: 'at-risk',
    budget: '$300k refresh',
    velocity: 'Warranty',
    lastTouch: 'Apr 07 • Support ticket',
    pointOfContact: 'Imani',
    touchpoints: [
      { label: 'Warranty review', at: 'Apr 01 • Call', type: 'call' },
      { label: 'Photo capture', at: 'Apr 04 • On-site', type: 'site' },
    ],
    roadmap: [
      { label: 'Resolve punchlist', due: 'Due Apr 20', status: 'blocked' },
      { label: 'Capture testimonials', due: 'Due Apr 28', status: 'in-progress' },
    ],
    sessions: [
      { title: 'Care follow-up', owner: 'Nora', date: 'Apr 16 • 15:00', status: 'scheduled' },
    ],
  },
];

const stageColumns: Array<{ id: ClientStage; label: string; hint: string }> = [
  { id: 'discovery', label: 'Discovery', hint: 'Briefing & intake' },
  { id: 'onboarding', label: 'Onboarding', hint: 'Questionnaires, palette' },
  { id: 'active', label: 'Active program', hint: 'Milestones + sourcing' },
  { id: 'care', label: 'Care', hint: 'Warranty + delight' },
];

const clientHealthMap: Record<DemoClient['health'], { label: string; badge: 'success' | 'destructive' | 'secondary' }> = {
  excellent: { label: 'Excellent', badge: 'success' },
  watch: { label: 'Watch', badge: 'secondary' },
  'at-risk': { label: 'At risk', badge: 'destructive' },
};

export default function ClientsLifecycleDemoPage() {
  const [selectedClientId, setSelectedClientId] = useState(demoClients[0]?.id ?? '');
  const selectedClient = useMemo(
    () => demoClients.find((client) => client.id === selectedClientId) ?? demoClients[0],
    [selectedClientId]
  );

  const stats = useMemo(() => {
    const active = demoClients.filter((client) => client.stage === 'active').length;
    const onboarding = demoClients.filter((client) => client.stage === 'onboarding').length;
    const risk = demoClients.filter((client) => client.health === 'at-risk').length;
    return { active, onboarding, risk };
  }, []);

  return (
    <div className="space-y-6">
      <ClientsHero stats={stats} />

      <div className="grid gap-6 xl:grid-cols-3">
        <PipelineBoard selectedClientId={selectedClient?.id} onSelectClient={setSelectedClientId} className="xl:col-span-2" />
        <EngagementPanel />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <ClientDetail client={selectedClient} className="xl:col-span-2" />
        <SessionPanel client={selectedClient} />
      </div>
    </div>
  );
}

function ClientsHero({ stats }: { stats: { active: number; onboarding: number; risk: number } }) {
  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background">
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
            <Sparkles className="h-4 w-4" />
            Client lifecycle demo
          </div>
          <CardTitle className="text-3xl">Relationship cockpit</CardTitle>
          <CardDescription className="text-base max-w-2xl">
            Use this sandbox to simulate everything from intake to post-install care before we wire it up to CRM data.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline">
            <NotebookPen className="mr-2 h-4 w-4" />
            Launch intake brief
          </Button>
          <Button>
            <Users className="mr-2 h-4 w-4" />
            Invite collaborator
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        <HeroMetric label="Active programs" value={stats.active} hint="Across studios" />
        <HeroMetric label="In onboarding" value={stats.onboarding} hint="Questionnaires in-flight" />
        <HeroMetric label="Attention needed" value={stats.risk} hint="Escalate care kits" />
      </CardContent>
    </Card>
  );
}

function HeroMetric({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-2xl border bg-card/60 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function PipelineBoard({
  selectedClientId,
  onSelectClient,
  className,
}: {
  selectedClientId?: string;
  onSelectClient: (id: string) => void;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Lifecycle pipeline</CardTitle>
        <CardDescription>Columns are mock data; we'll bind to CRM events next.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-4">
          {stageColumns.map((column) => {
            const clients = demoClients.filter((client) => client.stage === column.id);
            return (
              <div key={column.id} className="rounded-xl border bg-card/70 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{column.label}</p>
                    <p className="text-xs text-muted-foreground">{column.hint}</p>
                  </div>
                  <Badge variant="subtle" color="neutral">{clients.length}</Badge>
                </div>
                <ScrollArea className="mt-3 h-48 pr-2">
                  <div className="space-y-3">
                    {clients.map((client) => (
                      <button
                        key={client.id}
                        onClick={() => onSelectClient(client.id)}
                        className={cn(
                          'w-full rounded-lg border px-3 py-2 text-left text-sm transition hover:border-primary',
                          selectedClientId === client.id && 'border-primary bg-primary/5'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-semibold">{client.name}</p>
                          <Badge variant={clientHealthMap[client.health].badge}>{clientHealthMap[client.health].label}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{client.segment}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{client.lastTouch}</p>
                      </button>
                    ))}
                    {clients.length === 0 && <p className="text-xs text-muted-foreground">No clients here yet.</p>}
                  </div>
                </ScrollArea>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function EngagementPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Engagement cockpit</CardTitle>
        <CardDescription>Demo of signals we want before connecting analytics.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="font-semibold">Inbox response SLA</p>
              <p className="text-xs text-muted-foreground">Rolling 24h</p>
            </div>
            <Badge variant="outline">92%</Badge>
          </div>
          <ProgressBar value={92} showLabel={false} className="mt-3" />
        </div>
        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="font-semibold">Open decisions</p>
              <p className="text-xs text-muted-foreground">Awaiting client feedback</p>
            </div>
            <Badge variant="subtle" color="neutral">5</Badge>
          </div>
        </div>
        <div className="space-y-3 text-sm">
          <p className="font-medium">Playbooks in motion</p>
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">Care kit follow-up</p>
                <p className="text-xs text-muted-foreground">Triggered for 2 clients</p>
              </div>
              <Badge variant="outline">Prototype</Badge>
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">Discovery reminder</p>
                <p className="text-xs text-muted-foreground">Automation placeholder</p>
              </div>
              <Badge variant="subtle" color="neutral">Queued</Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ClientDetail({ client, className }: { client?: DemoClient; className?: string }) {
  if (!client) {
    return (
      <Card className={className}>
        <CardContent className="p-8 text-center text-muted-foreground">Select a client to preview their journey.</CardContent>
      </Card>
    );
  }

  const healthMeta = clientHealthMap[client.health];

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-2xl">{client.name}</CardTitle>
            <CardDescription>{client.company}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={healthMeta.badge}>{healthMeta.label}</Badge>
            <Badge variant="outline" className="capitalize">
              {client.stage}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="timeline" className="space-y-4">
          <TabsList>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="roadmap">Roadmap</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline">
            <ScrollArea className="h-64 pr-4">
              <ol className="space-y-3 text-sm">
                {client.touchpoints.map((touchpoint, index) => (
                  <li key={`${touchpoint.label}-${index}`} className="flex items-start gap-3">
                    <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
                    <div>
                      <p className="font-medium">{touchpoint.label}</p>
                      <p className="text-xs text-muted-foreground">{touchpoint.at}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="roadmap">
            <div className="space-y-3">
              {client.roadmap.map((item) => (
                <div key={item.label} className={cn('rounded-lg border p-3 text-sm', item.status === 'blocked' && 'border-destructive/60 bg-destructive/5')}>
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{item.label}</p>
                    <Badge variant={item.status === 'blocked' ? 'destructive' : 'outline'} className="capitalize">
                      {item.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.due}</p>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="notes">
            <Textarea rows={6} placeholder="Capture decisions, risks, or reminders…" defaultValue="Demo text only. Hook up to real notes after design review." />
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-3 text-sm">
        <Badge variant="outline">{client.segment}</Badge>
        <Badge variant="outline">{client.budget}</Badge>
        <Badge variant="outline">{client.velocity}</Badge>
      </CardFooter>
    </Card>
  );
}

function SessionPanel({ client }: { client?: DemoClient }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessions & rituals</CardTitle>
        <CardDescription>Prototype view of workshops, reviews, and support calls.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Session</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(client?.sessions ?? []).map((session) => (
              <TableRow key={`${session.title}-${session.date}`}>
                <TableCell className="font-medium">{session.title}</TableCell>
                <TableCell>{session.owner}</TableCell>
                <TableCell>{session.date}</TableCell>
                <TableCell className="text-right">
                  <Badge variant={session.status === 'completed' ? 'success' : session.status === 'draft' ? 'outline' : 'secondary'}>
                    {session.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {(!client || client.sessions.length === 0) && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  No upcoming sessions yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter className="flex gap-3">
        <Button variant="outline" className="flex-1">
          <CalendarCheck2 className="mr-2 h-4 w-4" />
          Schedule touchpoint
        </Button>
        <Button className="flex-1">
          <MessageSquare className="mr-2 h-4 w-4" />
          Draft recap
        </Button>
      </CardFooter>
    </Card>
  );
}
