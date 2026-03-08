'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@patina/design-system';
import { Sparkles, History, TrendingUp, User } from 'lucide-react';

import { mockData } from '@/data/mock-designer-data';
import { formatRelativeTime } from '@/lib/utils';

function StyleProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId');
  const profileId = searchParams.get('profileId');

  const client = clientId ? mockData.getClientById(clientId) : null;
  const resolvedProfile =
    mockData.getStyleProfile(profileId || client?.styleProfileId || 'style-sarah') ||
    mockData.getStyleProfile('style-sarah');

  const allProfiles = mockData.getClients().data;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Active profile</p>
          <h1 className="text-3xl font-bold tracking-tight">{resolvedProfile?.summary}</h1>
          {client && (
            <p className="text-sm text-muted-foreground">
              Linked to {client.name || `${client.firstName} ${client.lastName}`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => router.push('/clients')}>
            <User className="mr-2 h-4 w-4" /> View clients
          </Button>
          <Link href={`/demo/style-profile/quiz/new${clientId ? `?clientId=${clientId}` : ''}`}>
            <Button>
              <Sparkles className="mr-2 h-4 w-4" /> Start quiz
            </Button>
          </Link>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">
            <TrendingUp className="mr-2 h-4 w-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="mr-2 h-4 w-4" /> History
          </TabsTrigger>
          <TabsTrigger value="clients">
            <User className="mr-2 h-4 w-4" /> Clients
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-5 space-y-2">
                <p className="text-sm text-muted-foreground">Confidence</p>
                <p className="text-3xl font-bold">{Math.round((resolvedProfile?.confidence || 0) * 100)}%</p>
                <p className="text-xs text-muted-foreground">
                  Budget {resolvedProfile?.budgetRange?.min && resolvedProfile?.budgetRange?.max
                    ? `${resolvedProfile.budgetRange.min / 1000}k–${resolvedProfile.budgetRange.max / 1000}k`
                    : '—'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 space-y-3">
                <p className="text-sm text-muted-foreground">Constraints</p>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {resolvedProfile?.constraints.map((constraint) => (
                    <Badge key={constraint} variant="outline">
                      {constraint}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 space-y-3">
                <p className="text-sm text-muted-foreground">Quick signals</p>
                <div className="space-y-1 text-sm text-muted-foreground">
                  {resolvedProfile?.quickSignals.map((signal) => (
                    <p key={signal.label}>
                      <span className="font-medium text-foreground">{signal.label}:</span> {signal.value}
                    </p>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-6 space-y-4">
              <h2 className="text-lg font-semibold">Facets</h2>
              {resolvedProfile?.facets.map((facet) => (
                <div key={facet.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{facet.label}</span>
                    <span className="font-semibold">{facet.score}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${facet.score}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{facet.rationale}</p>
                </div>
              ))}
            </Card>

            <Card className="p-6 space-y-4">
              <h2 className="text-lg font-semibold">Palette</h2>
              <div className="grid grid-cols-2 gap-3">
                {resolvedProfile?.palette.map((swatch) => (
                  <div key={swatch.name} className="rounded-lg border">
                    <div className="h-16 rounded-t-lg" style={{ backgroundColor: swatch.hex }} />
                    <div className="p-2">
                      <p className="text-sm font-medium">{swatch.name}</p>
                      <p className="text-xs text-muted-foreground">{swatch.hex}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card className="p-6 space-y-4">
            <h2 className="text-lg font-semibold">Moodboard</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {resolvedProfile?.moodboard.map((item) => (
                <div key={item.id} className="rounded-lg border overflow-hidden">
                  <img src={item.image} alt={item.note} className="h-32 w-full object-cover" />
                  <div className="p-2 text-sm text-muted-foreground">{item.note}</div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="clients" className="mt-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Profiles</h2>
            <div className="space-y-3">
              {allProfiles.map((profile: any) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => router.push(`/demo/style-profile?clientId=${profile.id}`)}
                  className="w-full rounded-lg border p-4 text-left hover:border-primary"
                >
                  <p className="font-medium">{profile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Updated {formatRelativeTime(profile.updatedAt || profile.createdAt)}
                  </p>
                </button>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StyleProfileLoadingFallback() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Style Profile
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">Loading...</p>
      </div>
    </div>
  );
}

export default function StyleProfilePage() {
  return (
    <Suspense fallback={<StyleProfileLoadingFallback />}>
      <StyleProfileContent />
    </Suspense>
  );
}
