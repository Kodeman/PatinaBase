'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Mail, Sparkles, UserPlus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';

type AdminLifecycleStage = 'invited' | 'onboarding' | 'verified' | 'flagged';
type UserStatus = 'pending' | 'active' | 'review' | 'suspended';

interface DemoUser {
  id: string;
  name: string;
  email: string;
  stage: AdminLifecycleStage;
  status: UserStatus;
  type: 'designer' | 'client' | 'ops';
  segment: string;
  timezone: string;
  lastSeen: string;
  mfa: 'email' | 'sms' | 'app';
  roles: string[];
  tags: string[];
  risk: 'low' | 'medium' | 'high';
  readiness: number;
  timeline: Array<{ label: string; at: string; type: 'completed' | 'in-progress' | 'upcoming' }>;
  tasks: Array<{ id: string; label: string; due: string; owner: string; status: 'ready' | 'blocked' | 'done' }>;
  sessions: { device: string; location: string; lastActive: string }[];
}

const demoUsers: DemoUser[] = [
  {
    id: 'usr-4812',
    name: 'Leah Kochaver',
    email: 'rowan@studioarcadia.com',
    stage: 'onboarding',
    status: 'pending',
    type: 'designer',
    segment: 'US West',
    timezone: 'PST',
    lastSeen: '2h ago',
    mfa: 'sms',
    roles: ['designer', 'beta'],
    tags: ['portfolio-review', 'preferred'],
    risk: 'low',
    readiness: 62,
    timeline: [
      { label: 'Invite issued', at: 'Apr 12 • 09:14', type: 'completed' },
      { label: 'Identity verified', at: 'Apr 13 • 10:42', type: 'completed' },
      { label: 'Business doc upload', at: 'Apr 15 • 08:10', type: 'in-progress' },
      { label: 'Compliance review', at: 'Due Apr 18', type: 'upcoming' },
    ],
    tasks: [
      { id: 't-1', label: 'Collect trade references', due: 'Due in 1 day', owner: 'Ops', status: 'ready' },
      { id: 't-2', label: 'Enable MFA enforcement', due: 'Due in 2 days', owner: 'Security', status: 'blocked' },
      { id: 't-3', label: 'Assign catalog sandbox', due: 'Queued', owner: 'Programs', status: 'ready' },
    ],
    sessions: [
      { device: 'Mac OS • Chrome', location: 'Portland, OR', lastActive: '2h ago' },
      { device: 'iOS • Safari', location: 'Portland, OR', lastActive: '1d ago' },
    ],
  },
  {
    id: 'usr-3650',
    name: 'Leah Kochaver',
    email: 'elena.marsh@atelierco.com',
    stage: 'verified',
    status: 'active',
    type: 'designer',
    segment: 'EU Central',
    timezone: 'CET',
    lastSeen: '18m ago',
    mfa: 'app',
    roles: ['designer', 'collections'],
    tags: ['eu', 'flagship'],
    risk: 'low',
    readiness: 94,
    timeline: [
      { label: 'Invite issued', at: 'Mar 01 • 11:04', type: 'completed' },
      { label: 'KYC approval', at: 'Mar 02 • 16:31', type: 'completed' },
      { label: 'Team connected', at: 'Mar 05 • 08:15', type: 'completed' },
      { label: 'Beta rollout', at: 'Live', type: 'in-progress' },
    ],
    tasks: [
      { id: 't-4', label: 'Schedule quarterly check-in', due: 'Due Apr 22', owner: 'Success', status: 'ready' },
      { id: 't-5', label: 'Review custom pricing', due: 'Due Apr 30', owner: 'Revenue', status: 'ready' },
    ],
    sessions: [
      { device: 'Mac OS • Arc', location: 'Berlin, Germany', lastActive: '18m ago' },
      { device: 'iOS • Patina App', location: 'Berlin, Germany', lastActive: '1d ago' },
    ],
  },
  {
    id: 'usr-2022',
    name: 'Jamal Ortega',
    email: 'jamal@patternlabs.io',
    stage: 'invited',
    status: 'pending',
    type: 'ops',
    segment: 'Internal',
    timezone: 'CST',
    lastSeen: '—',
    mfa: 'email',
    roles: ['ops', 'support'],
    tags: ['bulk-import'],
    risk: 'medium',
    readiness: 28,
    timeline: [
      { label: 'Invite issued', at: 'Apr 10 • 14:12', type: 'completed' },
      { label: 'Account pending', at: 'Awaiting acceptance', type: 'in-progress' },
      { label: 'Role assignment', at: 'Queued', type: 'upcoming' },
    ],
    tasks: [
      { id: 't-6', label: 'Follow-up invite reminder', due: 'Due today', owner: 'Ops', status: 'ready' },
    ],
    sessions: [],
  },
  {
    id: 'usr-1199',
    name: 'Leah Kochaver',
    email: 'priya@northstarbuilds.com',
    stage: 'flagged',
    status: 'review',
    type: 'designer',
    segment: 'Enterprise',
    timezone: 'EST',
    lastSeen: '4h ago',
    mfa: 'sms',
    roles: ['designer', 'org-admin'],
    tags: ['high-touch', 'compliance-hold'],
    risk: 'high',
    readiness: 48,
    timeline: [
      { label: 'Invite issued', at: 'Mar 22 • 12:00', type: 'completed' },
      { label: 'Org verified', at: 'Mar 23 • 09:34', type: 'completed' },
      { label: 'Large transfer flagged', at: 'Apr 09 • 17:22', type: 'completed' },
      { label: 'Compliance review', at: 'Active', type: 'in-progress' },
    ],
    tasks: [
      { id: 't-7', label: 'Collect updated W-9', due: 'Due tomorrow', owner: 'Compliance', status: 'blocked' },
      { id: 't-8', label: 'Schedule security call', due: 'Due in 3 days', owner: 'Security', status: 'ready' },
    ],
    sessions: [
      { device: 'Windows • Edge', location: 'Atlanta, GA', lastActive: '4h ago' },
    ],
  },
];

const automationPlaybooks = [
  {
    name: 'Designer onboarding (US)',
    owner: 'Ops',
    steps: 12,
    avgTime: '3.2 days',
    status: 'Operational',
  },
  {
    name: 'Compliance review - enterprise',
    owner: 'Compliance',
    steps: 9,
    avgTime: '1.6 days',
    status: 'Needs attention',
  },
  {
    name: 'Dormant user guardrail',
    owner: 'Security',
    steps: 4,
    avgTime: 'Automated',
    status: 'Operational',
  },
];

const invitationQueue = [
  { email: 'vera@studio88.com', role: 'designer', sent: '2h ago', status: 'waiting' },
  { email: 'ops@ateliernorth.com', role: 'org-admin', sent: '1d ago', status: 'reminded' },
  { email: 'finance@ardenhouse.com', role: 'billing', sent: '4d ago', status: 'expired' },
];

const lifecycleColumns: Array<{
  id: AdminLifecycleStage;
  label: string;
  description: string;
  hint: string;
}> = [
  {
    id: 'invited',
    label: 'Invited',
    description: 'Awaiting acceptance',
    hint: 'Auto-reminders every 48h',
  },
  {
    id: 'onboarding',
    label: 'Onboarding',
    description: 'Docs + verification',
    hint: 'Ops owning handoffs',
  },
  {
    id: 'verified',
    label: 'Verified',
    description: 'Ready for production',
    hint: 'Monitored by success',
  },
  {
    id: 'flagged',
    label: 'In review',
    description: 'Compliance & trust',
    hint: 'Requires manual action',
  },
];

export default function UsersDemoPage() {
  const [selectedUserId, setSelectedUserId] = useState(demoUsers[0]?.id ?? '');
  const selectedUser = useMemo(
    () => demoUsers.find((user) => user.id === selectedUserId) ?? demoUsers[0],
    [selectedUserId]
  );

  const metrics = useMemo(() => {
    const totals = demoUsers.reduce(
      (acc, user) => {
        if (user.status === 'active') acc.active += 1;
        if (user.stage === 'invited') acc.invites += 1;
        if (user.risk === 'high') acc.flags += 1;
        return acc;
      },
      { active: 0, invites: 0, flags: 0 }
    );
    return totals;
  }, []);

  return (
    <div className="space-y-6">
      <DemoHero metrics={metrics} />

      <div className="grid gap-6 xl:grid-cols-3">
        <LifecycleBoard selectedUserId={selectedUser?.id} onSelectUser={setSelectedUserId} className="xl:col-span-2" />
        <ActionQueue />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <UserDetailPanel user={selectedUser} className="xl:col-span-2" />
        <AutomationPanel />
      </div>

      <InvitationTable />
    </div>
  );
}

function DemoHero({ metrics }: { metrics: { active: number; invites: number; flags: number } }) {
  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background">
      <CardHeader className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
            <Sparkles className="h-4 w-4" />
            Lifecycle demo
          </div>
          <CardTitle className="text-3xl">User management flight deck</CardTitle>
          <CardDescription className="text-base max-w-2xl">
            Prototype the full invite → verification → activation lifecycle before we connect to the user-management service.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline">
            <Mail className="mr-2 h-4 w-4" />
            Launch invite wizard
          </Button>
          <Button>
            <UserPlus className="mr-2 h-4 w-4" />
            Provision org admin
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Active users" value={metrics.active} hint="+4 this week" icon={Users} />
        <MetricCard label="Pending invites" value={metrics.invites} hint="Auto-reminders queued" icon={Mail} />
        <MetricCard label="Flags & holds" value={metrics.flags} hint="Compliance queue" icon={AlertTriangle} />
      </CardContent>
    </Card>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: number;
  hint: string;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-2xl border bg-card/60 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function LifecycleBoard({
  selectedUserId,
  onSelectUser,
  className,
}: {
  selectedUserId?: string;
  onSelectUser: (id: string) => void;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>User lifecycle</CardTitle>
        <CardDescription>Preview the journey from invite through full activation.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-4">
          {lifecycleColumns.map((column) => {
            const columnUsers = demoUsers.filter((user) => user.stage === column.id);
            return (
              <div key={column.id} className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{column.label}</p>
                    <p className="text-xs text-muted-foreground">{column.description}</p>
                  </div>
                  <Badge variant="outline">{columnUsers.length}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{column.hint}</p>
                <Separator className="my-3" />
                <ScrollArea className="h-48 pr-2">
                  <div className="space-y-3">
                    {columnUsers.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => onSelectUser(user.id)}
                        className={cn(
                          'w-full rounded-lg border px-3 py-2 text-left text-sm transition hover:border-primary',
                          selectedUserId === user.id && 'border-primary bg-primary/5'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{user.name}</span>
                          <Badge variant="secondary" className="text-[11px]">
                            {user.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Last seen {user.lastSeen || '—'}</p>
                      </button>
                    ))}
                    {columnUsers.length === 0 && (
                      <p className="text-xs text-muted-foreground">No users in this stage.</p>
                    )}
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

function ActionQueue() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ops queue</CardTitle>
        <CardDescription>Lifecycle actions queued behind the scenes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="font-medium">Auto-reminders</p>
              <p className="text-xs text-muted-foreground">Next run in 2h</p>
            </div>
            <Badge variant="secondary">7 pending</Badge>
          </div>
        </div>
        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="font-medium">Compliance review</p>
              <p className="text-xs text-muted-foreground">2 users in manual hold</p>
            </div>
            <Badge variant="destructive">Action needed</Badge>
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Upcoming automations</p>
          <ScrollArea className="h-48 rounded-lg border bg-muted/10 p-3">
            <ul className="space-y-3 text-sm">
              <li className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Provision beta features</p>
                  <p className="text-xs text-muted-foreground">Triggered for 3 designers</p>
                </div>
                <Badge variant="outline">Queued</Badge>
              </li>
              <li className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Re-run sanctions screening</p>
                  <p className="text-xs text-muted-foreground">Nightly job</p>
                </div>
                <Badge variant="secondary">Scheduled</Badge>
              </li>
              <li className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Dormant session cleanup</p>
                  <p className="text-xs text-muted-foreground">Rolling every 6h</p>
                </div>
                <Badge variant="outline">Automated</Badge>
              </li>
            </ul>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}

function UserDetailPanel({ user, className }: { user?: DemoUser; className?: string }) {
  if (!user) {
    return (
      <Card className={className}>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">Select a user from the lifecycle board to inspect their journey.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-2xl">{user.name}</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="capitalize">
              {user.stage}
            </Badge>
            <Badge variant={user.risk === 'high' ? 'destructive' : 'outline'} className="capitalize">
              {user.risk} risk
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4">
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Lifecycle readiness</p>
                  <p className="text-2xl font-semibold">{user.readiness}%</p>
                </div>
                <Progress value={user.readiness} className="w-40" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Roles</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {user.roles.map((role) => (
                    <Badge key={role} variant="outline">
                      {role}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Tags</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {user.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3 text-sm">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Segment</p>
                <p className="font-medium">{user.segment}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Timezone</p>
                <p className="font-medium">{user.timezone}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Last seen</p>
                <p className="font-medium">{user.lastSeen || '—'}</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="security">
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">MFA enrollment</p>
                    <p className="text-xs text-muted-foreground">Current factor: {user.mfa.toUpperCase()}</p>
                  </div>
                  <Badge variant="outline">Enforced</Badge>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Last active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {user.sessions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-sm text-muted-foreground">
                        No active sessions
                      </TableCell>
                    </TableRow>
                  ) : (
                    user.sessions.map((session) => (
                      <TableRow key={`${session.device}-${session.lastActive}`}>
                        <TableCell>{session.device}</TableCell>
                        <TableCell>{session.location}</TableCell>
                        <TableCell className="text-right">{session.lastActive}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="activity">
            <ScrollArea className="h-64 pr-4">
              <ol className="space-y-3 text-sm">
                {user.timeline.map((event, index) => (
                  <li key={`${event.label}-${index}`} className="flex items-start gap-3">
                    <span
                      className={cn('mt-1 h-2 w-2 rounded-full', {
                        'bg-emerald-500': event.type === 'completed',
                        'bg-amber-500': event.type === 'in-progress',
                        'bg-muted-foreground/40': event.type === 'upcoming',
                      })}
                    />
                    <div>
                      <p className="font-medium">{event.label}</p>
                      <p className="text-xs text-muted-foreground">{event.at}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <div className="mt-6 space-y-3">
          <p className="text-xs uppercase text-muted-foreground">Playbook tasks</p>
          {user.tasks.map((task) => (
            <div
              key={task.id}
              className={cn(
                'rounded-lg border p-3 text-sm',
                task.status === 'blocked' && 'border-destructive/60 bg-destructive/5'
              )}
            >
              <div className="flex items-center justify-between">
                <p className="font-medium">{task.label}</p>
                <Badge variant={task.status === 'done' ? 'secondary' : 'outline'} className="capitalize">
                  {task.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {task.due} • Owner: {task.owner}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AutomationPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Automation playbooks</CardTitle>
        <CardDescription>How we shepherd users through every lifecycle checkpoint.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {automationPlaybooks.map((playbook) => (
          <div key={playbook.name} className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{playbook.name}</p>
                <p className="text-xs text-muted-foreground">
                  Owner: {playbook.owner} • {playbook.steps} steps • Avg {playbook.avgTime}
                </p>
              </div>
              <Badge variant={playbook.status === 'Needs attention' ? 'destructive' : 'outline'}>
                {playbook.status}
              </Badge>
            </div>
          </div>
        ))}
        <div className="rounded-xl border border-dashed bg-muted/10 p-4 text-center">
          <p className="text-sm font-medium">Need another flow?</p>
          <p className="text-xs text-muted-foreground mb-3">
            Plug new automation ideas here before wiring into the rules engine.
          </p>
          <Button variant="outline">
            <Sparkles className="mr-2 h-4 w-4" />
            Prototype new playbook
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function InvitationTable() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invitation queue</CardTitle>
        <CardDescription>Static data for design review. Backend wiring comes next.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitationQueue.map((invite) => (
              <TableRow key={invite.email}>
                <TableCell>{invite.email}</TableCell>
                <TableCell className="capitalize">{invite.role}</TableCell>
                <TableCell>{invite.sent}</TableCell>
                <TableCell className="text-right">
                  <Badge variant={invite.status === 'expired' ? 'destructive' : 'outline'} className="capitalize">
                    {invite.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
