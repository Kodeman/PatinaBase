'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, Plus, RefreshCw } from 'lucide-react';

export default function SearchPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Search Management</h1>
        <p className="text-muted-foreground">
          Configure synonyms, boosts, and manage search indexes
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Synonyms</CardTitle>
                <CardDescription>Manage search synonyms and term mappings</CardDescription>
              </div>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="p-3 bg-muted rounded-md">
                <div className="font-medium text-sm">Furniture Terms</div>
                <div className="text-xs text-muted-foreground mt-1">
                  sofa, couch, settee
                </div>
              </div>
              <div className="p-3 bg-muted rounded-md">
                <div className="font-medium text-sm">Storage Terms</div>
                <div className="text-xs text-muted-foreground mt-1">
                  dresser, chest of drawers, bureau
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Field Boosts</CardTitle>
                <CardDescription>Configure search field weights</CardDescription>
              </div>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2">
                <span className="text-sm">name</span>
                <span className="font-mono text-sm">6x</span>
              </div>
              <div className="flex items-center justify-between p-2">
                <span className="text-sm">brand</span>
                <span className="font-mono text-sm">3x</span>
              </div>
              <div className="flex items-center justify-between p-2">
                <span className="text-sm">category</span>
                <span className="font-mono text-sm">2x</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Index Management</CardTitle>
          <CardDescription>Manage search indexes and reindexing</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Current Index</div>
                <div className="text-sm text-muted-foreground">
                  products_v2 (15,234 documents)
                </div>
              </div>
              <Button variant="outline">
                <RefreshCw className="mr-2 h-4 w-4" />
                Reindex
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
