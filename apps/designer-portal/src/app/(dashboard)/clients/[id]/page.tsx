'use client';

import { use } from 'react';
import Link from 'next/link';
import { useClient, useClientProjects, useClientOrders } from '@/hooks/use-clients';
import { useProposals } from '@/hooks/use-proposals';
import { useStyleProfile } from '@/hooks/use-style-profile';
import { mockData } from '@/data/mock-designer-data';
import {
  Badge,
  Button,
  Card,
  CardContent,
  ProgressBar,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ChurnRiskIndicator,
} from '@patina/design-system';
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  Edit,
  FileText,
  FolderOpen,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  ShoppingBag,
  Sparkles,
  Trash2,
} from 'lucide-react';

import { formatCurrency, formatDate, formatRelativeTime } from '@/lib/utils';
import { MLPredictionsPanel } from '@/components/crm/MLPredictionsPanel';
import { HealthScoreTrendChart } from '@/components/crm/HealthScoreTrendChart';
import { AssociatedRoomScans } from '@/components/rooms/associated-room-scans';

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { data: client, isLoading } = useClient(resolvedParams.id);
  const { data: projects } = useClientProjects(resolvedParams.id);
  const { data: orders } = useClientOrders(resolvedParams.id);
  const { data: proposals } = useProposals({ clientId: resolvedParams.id });
  const { data: styleProfile } = useStyleProfile(client?.styleProfileId || null);

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Client not found</p>
      </div>
    );
  }
  const clientThreads = mockData.getThreads({ clientId: client.id });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/clients">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Clients
              </Button>
            </Link>
            <Badge variant="outline" className="uppercase">
              {client.stage || 'active'}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Link href={`/clients/${client.id}/edit`}>
              <Button variant="outline">
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </Link>
            <Button variant="destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardContent className="p-6 space-y-3">
              <div>
                <h1 className="text-3xl font-bold">
                  {client.name || `${client.firstName} ${client.lastName}`}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Client since {formatDate(client.createdAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  {client.email}
                </span>
                {client.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-4 w-4" />
                    {client.phone}
                  </span>
                )}
                {client.address && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {client.address}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {client.tags?.map((tag: string) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total spent</span>
                <span className="text-xl font-semibold">{formatCurrency(client.totalSpent)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{client.projectsCount} projects</span>
                <span>{client.proposalsCount} proposals</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Last activity {formatRelativeTime(client.lastActivity || client.updatedAt)}
              </div>
              <Link href={`/messages?client=${client.id}`}>
                <Button variant="outline" className="w-full">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Open thread
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="insights">AI Insights</TabsTrigger>
          <TabsTrigger value="health">Health Trends</TabsTrigger>
          <TabsTrigger value="style">Style profile</TabsTrigger>
          <TabsTrigger value="scans">Scans</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="proposals">Proposals</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="insights" className="mt-6">
          <MLPredictionsPanel clientId={client.id} />
        </TabsContent>

        <TabsContent value="health" className="mt-6">
          <div className="space-y-6">
            <HealthScoreTrendChart clientId={client.id} period="30d" />
          </div>
        </TabsContent>

        <TabsContent value="overview" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">Contact Information</h2>
              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" /> {client.email}
                </div>
                {client.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" /> {client.phone}
                  </div>
                )}
                {client.address && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" /> {client.address}
                  </div>
                )}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" /> Next touch in 2 days
                </div>
              </div>
            </Card>

            <Card className="p-6 space-y-2">
              <h2 className="text-lg font-semibold">Quick stats</h2>
              <div className="flex items-center justify-between text-sm">
                <span>Projects</span>
                <span className="font-semibold">{client.projectsCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Proposals</span>
                <span className="font-semibold">{client.proposalsCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Orders</span>
                <span className="font-semibold">{client.ordersCount}</span>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="style" className="mt-6">
          {styleProfile ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="p-6 space-y-3">
                <h2 className="text-lg font-semibold">Style facets</h2>
                {styleProfile.facets.map((facet) => (
                  <div key={facet.label} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{facet.label}</span>
                      <span className="font-semibold">{facet.score}%</span>
                    </div>
                    <ProgressBar value={facet.score} />
                    <p className="text-xs text-muted-foreground">{facet.rationale}</p>
                  </div>
                ))}
              </Card>
              <Card className="p-6 space-y-4">
                <h2 className="text-lg font-semibold">Palette & materials</h2>
                <div className="grid grid-cols-2 gap-3">
                  {styleProfile.palette.map((swatch) => (
                    <div key={swatch.name} className="rounded-lg border">
                      <div className="h-16 rounded-t-lg" style={{ backgroundColor: swatch.hex }} />
                      <div className="p-2">
                        <p className="text-sm font-medium">{swatch.name}</p>
                        <p className="text-xs text-muted-foreground">{swatch.hex}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  {styleProfile.recommendedMaterials.join(', ')}
                </p>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="p-10 text-center">
                <Sparkles className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No style profile yet.</p>
                <Link href={`/style-profile/quiz/new?clientId=${client.id}`}>
                  <Button className="mt-4">Start quiz</Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="scans" className="mt-6">
          <AssociatedRoomScans
            context={{ type: 'client', clientId: client.id }}
          />
        </TabsContent>

        <TabsContent value="projects" className="mt-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Projects</h2>
            {projects && projects.length > 0 ? (
              <div className="space-y-4">
                {projects.map((project: any) => (
                  <div key={project.id} className="p-4 border rounded-lg">
                    <h3 className="font-medium">{project.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
                    <div className="mt-3 text-sm text-muted-foreground">
                      Progress {project.progress}%
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No projects yet</p>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="proposals" className="mt-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Proposals</h2>
            {proposals?.data?.length ? (
              <div className="space-y-3">
                {proposals.data.map((proposal: any) => (
                  <div key={proposal.id} className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <p className="font-medium">{proposal.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Updated {formatRelativeTime(proposal.updatedAt)}
                      </p>
                    </div>
                    <Badge variant="outline">{proposal.status}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No proposals yet</p>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="mt-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Orders</h2>
            {orders && orders.length > 0 ? (
              <div className="space-y-4">
                {orders.map((order: any) => (
                  <div key={order.id} className="p-4 border rounded-lg">
                    <h3 className="font-medium">Order #{order.orderNumber}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatCurrency(order.totalAmount)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No orders yet</p>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="messages" className="mt-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Threads</h2>
            {clientThreads.length ? (
              <div className="space-y-4">
                {clientThreads.map((thread) => (
                  <div key={thread.id} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{thread.title}</p>
                      <Badge variant="outline">{thread.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Updated {formatRelativeTime(thread.updatedAt)}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                      {thread.messages[thread.messages.length - 1]?.body}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No messages yet</p>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Client Notes</h2>
            <p className="text-gray-500">Notes timeline coming soon</p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
