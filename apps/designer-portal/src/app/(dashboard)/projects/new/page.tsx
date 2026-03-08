'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  ProgressBar,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@patina/design-system';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  MessageSquare,
  Plus,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react';

type MilestoneStatus = 'draft' | 'in-review' | 'ready' | 'up-next';

interface ProjectBasics {
  name: string;
  code: string;
  client: string;
  location: string;
  targetBudget: string;
  startDate: string;
  endDate: string;
  designStyle: string;
  primaryContact: string;
}

interface Milestone {
  id: string;
  title: string;
  phase: 'Discovery' | 'Planning' | 'Execution' | 'Closeout';
  startDate: string;
  dueDate: string;
  owner: string;
  dependencies: string[];
  deliverables: string[];
  approvals: string[];
  channel: string;
  requiresApproval: boolean;
  status: MilestoneStatus;
  notes: string;
}

type ApprovalStatus = 'pending' | 'scheduled' | 'approved';

interface ApprovalGate {
  id: string;
  gate: string;
  type: 'design' | 'budget' | 'logistics';
  dueDate: string;
  owner: string;
  stakeholders: string[];
  mode: 'sync' | 'async';
  status: ApprovalStatus;
  notes: string;
}

interface CommunicationTrack {
  id: string;
  name: string;
  channel: 'Email' | 'Portal' | 'Meeting' | 'Site Visit';
  cadence: 'daily' | 'twice-weekly' | 'weekly' | 'bi-weekly';
  owner: string;
  recipients: string[];
  focus: string[];
  shareWithClient: boolean;
  nextSync: string;
  notes: string;
}

const phaseOptions: Milestone['phase'][] = ['Discovery', 'Planning', 'Execution', 'Closeout'];

const cadenceCopy: Record<CommunicationTrack['cadence'], string> = {
  daily: 'Daily',
  'twice-weekly': 'Twice weekly',
  weekly: 'Weekly',
  'bi-weekly': 'Bi-weekly',
};

const milestoneStatusStyles: Record<
  MilestoneStatus,
  { label: string; color: 'primary' | 'info' | 'success' | 'warning' }
> = {
  draft: { label: 'Drafting', color: 'info' },
  'in-review': { label: 'In Review', color: 'warning' },
  ready: { label: 'Ready', color: 'success' },
  'up-next': { label: 'Up Next', color: 'primary' },
};

const initialBasics: ProjectBasics = {
  name: 'West Village Penthouse Refresh',
  code: 'PRJ-2048',
  client: 'Lila Hart',
  location: 'NYC · 48 West 11th St',
  targetBudget: '850000',
  startDate: '2024-05-06',
  endDate: '2024-07-01',
  designStyle: 'Modern organic',
  primaryContact: 'ava.patel@patina.studio',
};

const initialMilestones: Milestone[] = [
  {
    id: 'concept',
    title: 'Concept Storyboards',
    phase: 'Discovery',
    startDate: '2024-05-06',
    dueDate: '2024-05-17',
    owner: 'Ava Patel',
    dependencies: [],
    deliverables: ['Mood boards', 'Palette study', '3 hero renderings'],
    approvals: ['Creative Direction', 'Budget Guardrails'],
    channel: 'Weekly Client Sync',
    requiresApproval: true,
    status: 'in-review',
    notes: 'Client wants natural textures + warm metals.',
  },
  {
    id: 'spec-package',
    title: 'Spec & Procurement Package',
    phase: 'Planning',
    startDate: '2024-05-20',
    dueDate: '2024-06-10',
    owner: 'Marco Ruiz',
    dependencies: ['concept'],
    deliverables: ['FF&E schedule', 'Finish schedule', 'Lighting package'],
    approvals: ['Procurement Budget'],
    channel: 'Procurement Handoff',
    requiresApproval: true,
    status: 'draft',
    notes: 'Link vendor shortlist before submitting.',
  },
  {
    id: 'install-window',
    title: 'Install & Styling Window',
    phase: 'Execution',
    startDate: '2024-06-17',
    dueDate: '2024-07-01',
    owner: 'Site Lead',
    dependencies: ['spec-package'],
    deliverables: ['Install calendar', 'Logistics plan', 'QA checklist'],
    approvals: ['Site Access', 'Logistics'],
    channel: 'Daily Site Beat',
    requiresApproval: false,
    status: 'up-next',
    notes: 'Coordinate elevator reservations with building management.',
  },
];

const initialApprovals: ApprovalGate[] = [
  {
    id: 'concept-approval',
    gate: 'Concept Storyboards',
    type: 'design',
    dueDate: '2024-05-17',
    owner: 'Ava Patel',
    stakeholders: ['Client: Lila Hart', 'Creative Director'],
    mode: 'sync',
    status: 'pending',
    notes: 'Schedule walkthrough once palette is finalized.',
  },
  {
    id: 'budget-approval',
    gate: 'Procurement Budget',
    type: 'budget',
    dueDate: '2024-06-12',
    owner: 'Marco Ruiz',
    stakeholders: ['Client CFO', 'Patina Finance'],
    mode: 'async',
    status: 'scheduled',
    notes: 'Attach vendor quotes and contingency summary.',
  },
  {
    id: 'site-access',
    gate: 'Site Access & Logistics',
    type: 'logistics',
    dueDate: '2024-06-20',
    owner: 'Site Lead',
    stakeholders: ['Building Manager', 'GC'],
    mode: 'sync',
    status: 'pending',
    notes: 'Need updated COI + elevator reservation.',
  },
];

const initialCommunicationTracks: CommunicationTrack[] = [
  {
    id: 'client-sync',
    name: 'Weekly Client Sync',
    channel: 'Meeting',
    cadence: 'weekly',
    owner: 'Program Manager',
    recipients: ['Client principals', 'Creative director'],
    focus: ['Design decisions', 'Risks', 'Next approvals'],
    shareWithClient: true,
    nextSync: '2024-05-10T09:00',
    notes: '45 min Zoom + follow-up recap in portal.',
  },
  {
    id: 'procurement-digest',
    name: 'Procurement Digest',
    channel: 'Email',
    cadence: 'twice-weekly',
    owner: 'Procurement Lead',
    recipients: ['Vendors', 'Finance'],
    focus: ['PO status', 'Budget deltas', 'Lead times'],
    shareWithClient: false,
    nextSync: '2024-05-08T16:00',
    notes: 'Auto-post summary to portal when client-ready.',
  },
  {
    id: 'site-beat',
    name: 'Site Beat Report',
    channel: 'Portal',
    cadence: 'daily',
    owner: 'Site Lead',
    recipients: ['Client team', 'Patina Ops'],
    focus: ['Install progress', 'Issues', 'Photos'],
    shareWithClient: true,
    nextSync: '2024-06-18T18:00',
    notes: 'Use new field log template + attach photos.',
  },
];

export default function ProjectCreationDemoPage() {
  const [projectBasics, setProjectBasics] = useState<ProjectBasics>(initialBasics);
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones);
  const [approvals, setApprovals] = useState<ApprovalGate[]>(initialApprovals);
  const [communicationTracks, setCommunicationTracks] = useState<CommunicationTrack[]>(initialCommunicationTracks);
  const [activeTab, setActiveTab] = useState<'milestones' | 'approvals' | 'communications'>('milestones');
  const [deliverableDrafts, setDeliverableDrafts] = useState<Record<string, string>>({});
  const [dependencyDrafts, setDependencyDrafts] = useState<Record<string, string>>({});

  const milestoneWindow = useMemo(() => {
    if (!milestones.length) {
      return null;
    }

    const start = Math.min(...milestones.map((milestone) => new Date(milestone.startDate).getTime()));
    const end = Math.max(...milestones.map((milestone) => new Date(milestone.dueDate).getTime()));
    const totalDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
    const readyCount = milestones.filter((milestone) => milestone.status === 'ready').length;
    const inMotion = readyCount + milestones.filter((milestone) => milestone.status === 'in-review').length;

    return {
      startLabel: formatDateRange(new Date(start)),
      endLabel: formatDateRange(new Date(end)),
      totalDays,
      progress: Math.round((inMotion / milestones.length) * 100),
      readinessCopy: `${readyCount}/${milestones.length} milestones ready`,
    };
  }, [milestones]);

  const approvalStats = useMemo(() => {
    const total = approvals.length;
    const approved = approvals.filter((approval) => approval.status === 'approved').length;
    const scheduled = approvals.filter((approval) => approval.status === 'scheduled').length;

    return {
      total,
      approved,
      scheduled,
      pending: total - approved - scheduled,
    };
  }, [approvals]);

  const nextSync = useMemo(() => {
    if (!communicationTracks.length) {
      return null;
    }

    const upcoming = communicationTracks.reduce<CommunicationTrack | null>((closest, track) => {
      if (!closest) return track;

      return new Date(track.nextSync).getTime() < new Date(closest.nextSync).getTime()
        ? track
        : closest;
    }, null);

    return upcoming;
  }, [communicationTracks]);

  const handleBasicsChange = (field: keyof ProjectBasics, value: string) => {
    setProjectBasics((prev) => ({ ...prev, [field]: value }));
  };

  const handleMilestoneChange = <Key extends keyof Milestone>(id: string, field: Key, value: Milestone[Key]) => {
    setMilestones((prev) =>
      prev.map((milestone) => (milestone.id === id ? { ...milestone, [field]: value } : milestone))
    );
  };

  const handleAddMilestone = () => {
    const newMilestoneNumber = milestones.length + 1;
    setMilestones((prev) => [
      ...prev,
      {
        id: `draft-${newMilestoneNumber}`,
        title: `New Milestone ${newMilestoneNumber}`,
        phase: 'Planning',
        startDate: projectBasics.endDate,
        dueDate: projectBasics.endDate,
        owner: projectBasics.primaryContact,
        dependencies: [],
        deliverables: ['Outline key deliverables'],
        approvals: [],
        channel: 'Weekly Client Sync',
        requiresApproval: false,
        status: 'draft',
        notes: '',
      },
    ]);
  };

  const handleDeliverableAdd = (milestoneId: string) => {
    const value = deliverableDrafts[milestoneId]?.trim();
    if (!value) return;

    setMilestones((prev) =>
      prev.map((milestone) =>
        milestone.id === milestoneId
          ? { ...milestone, deliverables: [...milestone.deliverables, value] }
          : milestone
      )
    );
    setDeliverableDrafts((prev) => ({ ...prev, [milestoneId]: '' }));
  };

  const handleDependencyAdd = (milestoneId: string, dependencyId: string) => {
    if (!dependencyId || dependencyId === milestoneId) {
      return;
    }

    setMilestones((prev) =>
      prev.map((milestone) =>
        milestone.id === milestoneId
          ? {
              ...milestone,
              dependencies: milestone.dependencies.includes(dependencyId)
                ? milestone.dependencies
                : [...milestone.dependencies, dependencyId],
            }
          : milestone
      )
    );
    setDependencyDrafts((prev) => ({ ...prev, [milestoneId]: '' }));
  };

  const handleDependencyRemove = (milestoneId: string, dependencyId: string) => {
    setMilestones((prev) =>
      prev.map((milestone) =>
        milestone.id === milestoneId
          ? {
              ...milestone,
              dependencies: milestone.dependencies.filter((dep) => dep !== dependencyId),
            }
          : milestone
      )
    );
  };

  const handleApprovalChange = <Key extends keyof ApprovalGate>(id: string, field: Key, value: ApprovalGate[Key]) => {
    setApprovals((prev) =>
      prev.map((approval) => (approval.id === id ? { ...approval, [field]: value } : approval))
    );
  };

  const handleCommunicationChange = <Key extends keyof CommunicationTrack>(
    id: string,
    field: Key,
    value: CommunicationTrack[Key]
  ) => {
    setCommunicationTracks((prev) =>
      prev.map((track) => (track.id === id ? { ...track, [field]: value } : track))
    );
  };

  const handleAddCommunicationTrack = () => {
    setCommunicationTracks((prev) => [
      ...prev,
      {
        id: `track-${prev.length + 1}`,
        name: 'New Channel',
        channel: 'Email',
        cadence: 'weekly',
        owner: projectBasics.primaryContact,
        recipients: ['Client stakeholders'],
        focus: ['Status'],
        shareWithClient: true,
        nextSync: projectBasics.startDate,
        notes: '',
      },
    ]);
  };

  return (
    <div className="space-y-6 p-6 lg:p-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-muted-foreground">Project creation demo</p>
          <h1 className="text-3xl font-bold tracking-tight">Build a project launch plan</h1>
          <p className="text-muted-foreground">
            Craft milestones, approvals, and communications before wiring them to live data sources.
          </p>
        </div>
        <Badge variant="subtle" color="warning" className="w-fit">
          Sandbox · no API calls yet
        </Badge>
      </div>

      <Alert variant="info" title="Interface preview only">
        <AlertDescription className="text-sm text-muted-foreground">
          This workspace stores everything in local state so product and design can shape the flow without touching the
          live project service. Once approved, we will swap the mock handlers with the projects API + websocket events.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="space-y-2">
              <CardTitle className="text-2xl">Project blueprint</CardTitle>
              <CardDescription>Capture the headline details that inform scheduling and approvals.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Project name" htmlFor="project-name">
                  <Input
                    id="project-name"
                    value={projectBasics.name}
                    onChange={(event) => handleBasicsChange('name', event.target.value)}
                  />
                </Field>
                <Field label="Project code" htmlFor="project-code">
                  <Input
                    id="project-code"
                    value={projectBasics.code}
                    onChange={(event) => handleBasicsChange('code', event.target.value)}
                  />
                </Field>
                <Field label="Client" htmlFor="project-client">
                  <Input
                    id="project-client"
                    value={projectBasics.client}
                    onChange={(event) => handleBasicsChange('client', event.target.value)}
                  />
                </Field>
                <Field label="Location" htmlFor="project-location">
                  <Input
                    id="project-location"
                    value={projectBasics.location}
                    onChange={(event) => handleBasicsChange('location', event.target.value)}
                  />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <Field label="Start date" htmlFor="project-start">
                  <Input
                    id="project-start"
                    type="date"
                    value={projectBasics.startDate}
                    onChange={(event) => handleBasicsChange('startDate', event.target.value)}
                  />
                </Field>
                <Field label="Target install" htmlFor="project-end">
                  <Input
                    id="project-end"
                    type="date"
                    value={projectBasics.endDate}
                    onChange={(event) => handleBasicsChange('endDate', event.target.value)}
                  />
                </Field>
                <Field label="Budget (USD)" htmlFor="project-budget">
                  <Input
                    id="project-budget"
                    type="number"
                    value={projectBasics.targetBudget}
                    onChange={(event) => handleBasicsChange('targetBudget', event.target.value)}
                  />
                </Field>
                <Field label="Design direction" htmlFor="project-style">
                  <Input
                    id="project-style"
                    value={projectBasics.designStyle}
                    onChange={(event) => handleBasicsChange('designStyle', event.target.value)}
                  />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Primary contact" htmlFor="project-contact">
                  <Input
                    id="project-contact"
                    value={projectBasics.primaryContact}
                    onChange={(event) => handleBasicsChange('primaryContact', event.target.value)}
                  />
                </Field>
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Heads up</p>
                  <p>Once we wire this to the API, project metadata will sync with client + admin portals automatically.</p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-3 pt-0">
              <Button variant="outline">
                <Send className="mr-2 h-4 w-4" />
                Share brief
              </Button>
              <Button>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Mark as ready
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader className="space-y-2">
              <CardTitle>Workflow builder</CardTitle>
              <CardDescription>Milestones, approvals, and communications live side by side for fast planning.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="milestones">Milestones</TabsTrigger>
                  <TabsTrigger value="approvals">Approvals</TabsTrigger>
                  <TabsTrigger value="communications">Communications</TabsTrigger>
                </TabsList>

                <TabsContent value="milestones" className="space-y-4 pt-6">
                  {milestones.map((milestone) => (
                    <div key={milestone.id} className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                          <p className="text-lg font-semibold">{milestone.title}</p>
                          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays className="h-4 w-4" />
                              {formatDateRange(new Date(milestone.startDate))} → {formatDateRange(new Date(milestone.dueDate))}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              {milestone.owner}
                            </span>
                          </div>
                        </div>
                        <Badge variant="subtle" color={milestoneStatusStyles[milestone.status].color}>
                          {milestoneStatusStyles[milestone.status].label}
                        </Badge>
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        <Field label="Phase">
                          <Select
                            value={milestone.phase}
                            onValueChange={(value) => handleMilestoneChange(milestone.id, 'phase', value as Milestone['phase'])}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select phase" />
                            </SelectTrigger>
                            <SelectContent>
                              {phaseOptions.map((phase) => (
                                <SelectItem key={phase} value={phase}>
                                  {phase}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Start">
                          <Input
                            type="date"
                            value={milestone.startDate}
                            onChange={(event) => handleMilestoneChange(milestone.id, 'startDate', event.target.value)}
                          />
                        </Field>
                        <Field label="Due">
                          <Input
                            type="date"
                            value={milestone.dueDate}
                            onChange={(event) => handleMilestoneChange(milestone.id, 'dueDate', event.target.value)}
                          />
                        </Field>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Owner">
                          <Input
                            value={milestone.owner}
                            onChange={(event) => handleMilestoneChange(milestone.id, 'owner', event.target.value)}
                          />
                        </Field>
                        <Field label="Comms channel">
                          <Input
                            value={milestone.channel}
                            onChange={(event) => handleMilestoneChange(milestone.id, 'channel', event.target.value)}
                          />
                        </Field>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">Deliverables</p>
                          <Switch
                            checked={milestone.requiresApproval}
                            onCheckedChange={(checked) => handleMilestoneChange(milestone.id, 'requiresApproval', checked)}
                            label="Requires approval"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {milestone.deliverables.map((deliverable) => (
                            <Badge key={deliverable} variant="subtle" color="neutral">
                              {deliverable}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Add deliverable"
                            value={deliverableDrafts[milestone.id] ?? ''}
                            onChange={(event) =>
                              setDeliverableDrafts((prev) => ({ ...prev, [milestone.id]: event.target.value }))
                            }
                          />
                          <Button variant="secondary" onClick={() => handleDeliverableAdd(milestone.id)}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">Dependencies</p>
                          <div className="w-48">
                            <Select
                              value={dependencyDrafts[milestone.id] ?? ''}
                              onValueChange={(value) => {
                                if (value) {
                                  handleDependencyAdd(milestone.id, value);
                                }
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Link milestone" />
                              </SelectTrigger>
                              <SelectContent>
                                {milestones
                                  .filter((candidate) => candidate.id !== milestone.id)
                                  .map((candidate) => (
                                    <SelectItem key={candidate.id} value={candidate.id}>
                                      {candidate.title}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        {milestone.dependencies.length ? (
                          <div className="flex flex-wrap gap-2">
                            {milestone.dependencies.map((dependencyId) => {
                              const linkedMilestone = milestones.find((item) => item.id === dependencyId);
                              return (
                                <Button
                                  key={dependencyId}
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDependencyRemove(milestone.id, dependencyId)}
                                >
                                  {linkedMilestone?.title ?? dependencyId}
                                  <span className="ml-1 text-xs text-muted-foreground">(remove)</span>
                                </Button>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No dependencies linked yet.</p>
                        )}
                      </div>

                      <Field label="Notes / approvals">
                        <Textarea
                          value={milestone.notes}
                          onChange={(event) => handleMilestoneChange(milestone.id, 'notes', event.target.value)}
                          placeholder="Context, risks, or what you need from the client."
                        />
                      </Field>
                    </div>
                  ))}

                  <Button variant="outline" className="w-full" onClick={handleAddMilestone}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add milestone
                  </Button>
                </TabsContent>

                <TabsContent value="approvals" className="space-y-4 pt-6">
                  {approvals.map((approval) => (
                    <div key={approval.id} className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-lg font-semibold">{approval.gate}</p>
                          <p className="text-sm text-muted-foreground">
                            Stakeholders: {approval.stakeholders.join(', ')}
                          </p>
                        </div>
                        <Badge
                          variant="subtle"
                          color={
                            approval.status === 'approved'
                              ? 'success'
                              : approval.status === 'scheduled'
                              ? 'info'
                              : 'warning'
                          }
                        >
                          {approval.status === 'approved'
                            ? 'Approved'
                            : approval.status === 'scheduled'
                            ? 'Scheduled'
                            : 'Pending'}
                        </Badge>
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        <Field label="Due date">
                          <Input
                            type="date"
                            value={approval.dueDate}
                            onChange={(event) => handleApprovalChange(approval.id, 'dueDate', event.target.value)}
                          />
                        </Field>
                        <Field label="Owner">
                          <Input
                            value={approval.owner}
                            onChange={(event) => handleApprovalChange(approval.id, 'owner', event.target.value)}
                          />
                        </Field>
                        <Field label="Status">
                          <Select
                            value={approval.status}
                            onValueChange={(value) => handleApprovalChange(approval.id, 'status', value as ApprovalStatus)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="scheduled">Scheduled</SelectItem>
                              <SelectItem value="approved">Approved</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Format">
                          <Select
                            value={approval.mode}
                            onValueChange={(value) => handleApprovalChange(approval.id, 'mode', value as ApprovalGate['mode'])}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Choose format" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sync">Live working session</SelectItem>
                              <SelectItem value="async">Async portal workflow</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Notes">
                          <Textarea
                            value={approval.notes}
                            onChange={(event) => handleApprovalChange(approval.id, 'notes', event.target.value)}
                          />
                        </Field>
                      </div>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="communications" className="space-y-4 pt-6">
                  {communicationTracks.map((track) => (
                    <div key={track.id} className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-lg font-semibold">{track.name}</p>
                          <p className="text-sm text-muted-foreground">{track.recipients.join(', ')}</p>
                        </div>
                        <Badge variant="subtle" color="info">
                          {track.channel}
                        </Badge>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Cadence">
                          <Select
                            value={track.cadence}
                            onValueChange={(value) =>
                              handleCommunicationChange(track.id, 'cadence', value as CommunicationTrack['cadence'])
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select cadence" />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(cadenceCopy).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Owner">
                          <Input
                            value={track.owner}
                            onChange={(event) => handleCommunicationChange(track.id, 'owner', event.target.value)}
                          />
                        </Field>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Next sync">
                          <Input
                            type="datetime-local"
                            value={track.nextSync}
                            onChange={(event) => handleCommunicationChange(track.id, 'nextSync', event.target.value)}
                          />
                        </Field>
                        <Field label="Focus">
                          <div className="flex flex-wrap gap-2">
                            {track.focus.map((item) => (
                              <Badge key={item} variant="outline" color="neutral">
                                {item}
                              </Badge>
                            ))}
                          </div>
                        </Field>
                      </div>

                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <Textarea
                          value={track.notes}
                          onChange={(event) => handleCommunicationChange(track.id, 'notes', event.target.value)}
                          placeholder="What happens in this touchpoint?"
                        />
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={track.shareWithClient}
                            onCheckedChange={(checked) => handleCommunicationChange(track.id, 'shareWithClient', checked)}
                            label="Share to client portal"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" className="w-full" onClick={handleAddCommunicationTrack}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add communication lane
                  </Button>
                </TabsContent>
              </Tabs>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-3 pt-0">
              <Button variant="ghost">
                <ClipboardList className="mr-2 h-4 w-4" />
                Export brief
              </Button>
              <Button>
                <ShieldCheck className="mr-2 h-4 w-4" />
                Route for approvals
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl">Timeline snapshot</CardTitle>
              <CardDescription>Auto-updates as you tweak the builder.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {milestoneWindow ? (
                <>
                  <div className="grid gap-4">
                    <div className="rounded-lg border p-3">
                      <p className="text-sm text-muted-foreground">Window</p>
                      <p className="text-lg font-semibold">
                        {milestoneWindow.startLabel} → {milestoneWindow.endLabel}
                      </p>
                      <p className="text-sm text-muted-foreground">{milestoneWindow.totalDays} day span</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-sm text-muted-foreground">Readiness</p>
                      <p className="text-lg font-semibold">{milestoneWindow.readinessCopy}</p>
                    </div>
                  </div>
                  <ProgressBar value={milestoneWindow.progress} showLabel />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Add milestones to see the schedule summary.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl">Approval health</CardTitle>
              <CardDescription>Track how close we are to greenlighting install.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <SummaryPill label="Total" value={approvalStats.total} />
                <SummaryPill label="Approved" value={approvalStats.approved} accent="success" />
                <SummaryPill label="Pending" value={approvalStats.pending} accent="warning" />
              </div>
              <div className="space-y-3">
                {approvals.map((approval) => (
                  <div key={approval.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{approval.gate}</p>
                      <p className="text-xs text-muted-foreground">Due {formatDateRange(new Date(approval.dueDate))}</p>
                    </div>
                    <Badge
                      variant="dot"
                      color={
                        approval.status === 'approved'
                          ? 'success'
                          : approval.status === 'scheduled'
                          ? 'info'
                          : 'warning'
                      }
                    >
                      {approval.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl">Communications</CardTitle>
              <CardDescription>Ensure every stakeholder hears from us on a predictable cadence.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {nextSync ? (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <p className="text-sm text-primary">Next sync · {cadenceCopy[nextSync.cadence]}</p>
                  <p className="text-lg font-semibold">{nextSync.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(nextSync.nextSync)} · Hosted by {nextSync.owner}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Add a communication touchpoint to preview the queue.</p>
              )}
              <div className="space-y-3">
                {communicationTracks.map((track) => (
                  <div key={track.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{track.name}</p>
                      <p className="text-xs text-muted-foreground">{cadenceCopy[track.cadence]} · {track.channel}</p>
                    </div>
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl">Launch checklist</CardTitle>
              <CardDescription>Once these flip green, we can post to the live dashboard.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <ChecklistItem label="Milestones drafted" isComplete={milestones.length >= 3} />
              <ChecklistItem label="Approvals routed" isComplete={approvalStats.approved >= 1} />
              <ChecklistItem label="Communications scheduled" isComplete={Boolean(nextSync)} />
            </CardContent>
            <CardFooter className="flex flex-col gap-3 pt-0">
              <Button className="w-full">
                <ShieldCheck className="mr-2 h-4 w-4" />
                Send for internal review
              </Button>
              <Button variant="outline" className="w-full">
                <AlertCircle className="mr-2 h-4 w-4" />
                Share preview link
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({
  children,
  label,
  htmlFor,
}: {
  children: React.ReactNode;
  label: string;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="space-y-1 text-sm font-medium text-foreground">
      <span className="block text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function SummaryPill({
  label,
  value,
  accent = 'info',
}: {
  label: string;
  value: number;
  accent?: 'info' | 'success' | 'warning';
}) {
  const badgeColor = accent === 'success' ? 'success' : accent === 'warning' ? 'warning' : 'info';

  return (
    <div className="space-y-1 rounded-lg border p-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      <Badge variant="subtle" color={badgeColor}>
        {badgeColor === 'success' ? 'Clear' : badgeColor === 'warning' ? 'Action' : 'Tracking'}
      </Badge>
    </div>
  );
}

function ChecklistItem({ label, isComplete }: { label: string; isComplete: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-dashed p-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className={`h-4 w-4 ${isComplete ? 'text-green-500' : 'text-muted-foreground'}`} />
        <span className="text-sm">{label}</span>
      </div>
      <Badge variant="subtle" color={isComplete ? 'success' : 'warning'}>
        {isComplete ? 'Ready' : 'To do'}
      </Badge>
    </div>
  );
}

function formatDateRange(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatDateTime(dateString: string) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).format(date);
}
