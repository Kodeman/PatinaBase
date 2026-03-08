'use client';

import { use } from 'react';
import { useStyleProfile, useAddSignals } from '@/hooks/use-style-profile';
import { Card } from '@patina/design-system';
import { Button } from '@patina/design-system';
import { Badge } from '@patina/design-system';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@patina/design-system';
import { Skeleton } from '@patina/design-system';
import {
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  TrendingUp,
  TrendingDown,
  Ban,
  History,
  BarChart3,
  Heart,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

interface StyleProfileDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function StyleProfileDetailPage({ params }: StyleProfileDetailPageProps) {
  const { id } = use(params);
  const { data: profile, isLoading } = useStyleProfile(id);
  const addSignals = useAddSignals();
  const [teachingMode, setTeachingMode] = useState(false);

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Card className="p-12 text-center">
          <p className="text-gray-500">Profile not found</p>
        </Card>
      </div>
    );
  }

  // Mock data - replace with real profile data
  const facets = [
    { name: 'Modern', score: 85, color: 'bg-blue-500' },
    { name: 'Minimalist', score: 72, color: 'bg-purple-500' },
    { name: 'Natural', score: 68, color: 'bg-green-500' },
    { name: 'Warm', score: 45, color: 'bg-orange-500' },
    { name: 'Industrial', score: 32, color: 'bg-gray-500' },
  ];

  const preferences = {
    materials: ['Wood', 'Metal', 'Glass'],
    colors: ['Neutral Tones', 'Earth Tones'],
    rooms: ['Living Room', 'Bedroom', 'Kitchen'],
    budget: '$5,000 - $15,000',
    sustainability: 8,
  };

  const teachingHistory = [
    { id: '1', action: 'liked', product: 'Mid-Century Sofa', date: '2 days ago' },
    { id: '2', action: 'disliked', product: 'Victorian Chair', date: '3 days ago' },
    { id: '3', action: 'boosted', rule: 'Prefer wooden furniture', date: '1 week ago' },
  ];

  const handleTeachingAction = async (action: 'like' | 'dislike' | 'boost' | 'block', data: any) => {
    try {
      await addSignals.mutateAsync({
        id,
        signals: [{ action, ...data, timestamp: new Date().toISOString() }],
      });
    } catch (error) {
      console.error('Failed to add signal:', error);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Style Profile
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Client: {profile.clientName || 'Unknown'}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={`/demo/style-profile/quiz/new?clientId=${id}`}>
              <Button variant="outline">
                <Sparkles className="h-4 w-4 mr-2" />
                Retake Quiz
              </Button>
            </Link>
            <Button
              variant={teachingMode ? 'default' : 'outline'}
              onClick={() => setTeachingMode(!teachingMode)}
            >
              <Heart className="h-4 w-4 mr-2" />
              {teachingMode ? 'Exit Teaching Mode' : 'Teaching Mode'}
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="facets">
            <TrendingUp className="h-4 w-4 mr-2" />
            Style Facets
          </TabsTrigger>
          <TabsTrigger value="teaching">
            <Heart className="h-4 w-4 mr-2" />
            Teaching
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-2" />
            History
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Top Style Facets */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">Top Style Facets</h2>
              <div className="space-y-4">
                {facets.slice(0, 5).map((facet) => (
                  <div key={facet.name}>
                    <div className="flex justify-between mb-2">
                      <span className="font-medium">{facet.name}</span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {facet.score}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={`${facet.color} h-2 rounded-full transition-all`}
                        style={{ width: `${facet.score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Preferences Summary */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">Preferences</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Preferred Materials
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {preferences.materials.map((material) => (
                      <Badge key={material} variant="subtle" color="neutral">
                        {material}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Color Palettes</p>
                  <div className="flex flex-wrap gap-2">
                    {preferences.colors.map((color) => (
                      <Badge key={color} variant="subtle" color="neutral">
                        {color}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Room Priorities</p>
                  <div className="flex flex-wrap gap-2">
                    {preferences.rooms.map((room) => (
                      <Badge key={room} variant="subtle" color="neutral">
                        {room}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Budget Range</p>
                  <Badge variant="solid">{preferences.budget}</Badge>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Sustainability Score
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full"
                        style={{ width: `${preferences.sustainability * 10}%` }}
                      />
                    </div>
                    <span className="font-bold text-green-600">{preferences.sustainability}/10</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card className="mt-6 p-6">
            <h2 className="text-lg font-semibold mb-4">Recommendations</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Based on this style profile, we recommend modern minimalist furniture with natural
              wood accents and neutral color palettes.
            </p>
            <div className="flex gap-2">
              <Link href="/catalog">
                <Button>Browse Recommended Products</Button>
              </Link>
              <Link href="/proposals/new">
                <Button variant="outline">Create Proposal</Button>
              </Link>
            </div>
          </Card>
        </TabsContent>

        {/* Style Facets Tab */}
        <TabsContent value="facets" className="mt-6">
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-6">Style Facet Analysis</h2>

            {/* Radar Chart Placeholder */}
            <div className="aspect-square max-w-md mx-auto mb-8">
              <div className="w-full h-full bg-gradient-to-br from-purple-50 to-pink-50 dark:from-gray-800 dark:to-gray-700 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <BarChart3 className="h-16 w-16 mx-auto mb-4 text-purple-400" />
                  <p className="text-gray-600 dark:text-gray-400">
                    Radar Chart Visualization
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-500">
                    (Integration with Recharts pending)
                  </p>
                </div>
              </div>
            </div>

            {/* Detailed Facets */}
            <div className="space-y-6">
              {facets.map((facet) => (
                <div key={facet.name} className="border-b pb-4 last:border-b-0">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-lg">{facet.name}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Strength: {facet.score}%
                      </p>
                    </div>
                    <Badge variant={facet.score > 70 ? 'solid' : 'subtle'} color={facet.score > 70 ? 'success' : 'neutral'}>
                      {facet.score > 70 ? 'Strong' : 'Moderate'}
                    </Badge>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div
                      className={`${facet.color} h-3 rounded-full transition-all`}
                      style={{ width: `${facet.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* Teaching Tab */}
        <TabsContent value="teaching" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Teaching Actions */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">Teaching Actions</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Provide feedback on products to refine this style profile
              </p>

              <div className="space-y-4">
                <div className="border rounded-lg p-4">
                  <h3 className="font-medium mb-3">Product Feedback</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="h-auto flex-col py-3"
                      onClick={() => setTeachingMode(true)}
                    >
                      <ThumbsUp className="h-6 w-6 mb-2 text-green-600" />
                      <span>Like Products</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-auto flex-col py-3"
                      onClick={() => setTeachingMode(true)}
                    >
                      <ThumbsDown className="h-6 w-6 mb-2 text-red-600" />
                      <span>Dislike Products</span>
                    </Button>
                  </div>
                </div>

                <div className="border rounded-lg p-4">
                  <h3 className="font-medium mb-3">Advanced Rules</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="h-auto flex-col py-3">
                      <TrendingUp className="h-6 w-6 mb-2 text-blue-600" />
                      <span>Boost Feature</span>
                    </Button>
                    <Button variant="outline" className="h-auto flex-col py-3">
                      <Ban className="h-6 w-6 mb-2 text-orange-600" />
                      <span>Block Feature</span>
                    </Button>
                    <Button variant="outline" className="h-auto flex-col py-3">
                      <TrendingDown className="h-6 w-6 mb-2 text-purple-600" />
                      <span>Bury Feature</span>
                    </Button>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <p className="text-sm text-purple-900 dark:text-purple-300">
                  <strong>Tip:</strong> Enable Teaching Mode and browse products to provide
                  quick feedback. Each interaction helps improve recommendations.
                </p>
              </div>
            </Card>

            {/* Recent Teaching Activity */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
              <div className="space-y-3">
                {teachingHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    {item.action === 'liked' && (
                      <ThumbsUp className="h-5 w-5 text-green-600 mt-0.5" />
                    )}
                    {item.action === 'disliked' && (
                      <ThumbsDown className="h-5 w-5 text-red-600 mt-0.5" />
                    )}
                    {item.action === 'boosted' && (
                      <TrendingUp className="h-5 w-5 text-blue-600 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {item.action === 'liked' && 'Liked'}
                        {item.action === 'disliked' && 'Disliked'}
                        {item.action === 'boosted' && 'Boosted'}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                        {item.product || item.rule}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{item.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Profile Evolution</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              View how this style profile has changed over time
            </p>

            <div className="space-y-4">
              <div className="border-l-4 border-purple-600 pl-4 py-2">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">Current Version (v3)</h3>
                  <Badge>Active</Badge>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Updated 2 days ago - Added teaching signals from product feedback
                </p>
              </div>

              <div className="border-l-4 border-gray-300 pl-4 py-2">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">Version 2</h3>
                  <Button variant="ghost" size="sm">
                    Restore
                  </Button>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Updated 1 week ago - Quiz retaken with updated preferences
                </p>
              </div>

              <div className="border-l-4 border-gray-300 pl-4 py-2">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">Version 1</h3>
                  <Button variant="ghost" size="sm">
                    View
                  </Button>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Created 3 weeks ago - Initial quiz completion
                </p>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
