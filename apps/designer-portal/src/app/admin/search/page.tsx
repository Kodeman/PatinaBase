'use client';

import { useState, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Input,
} from '@patina/design-system';
import { Search, Plus, RefreshCw, TrendingUp, Clock, Database, X, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatRelativeTime } from '@/lib/utils';

interface SearchIndex {
  name: string;
  documentCount: number;
  lastIndexedAt: string;
  status: 'healthy' | 'indexing' | 'stale';
  sizeBytes: number;
}

interface RecentSearch {
  query: string;
  resultCount: number;
  timestamp: string;
  userId?: string;
}

interface Synonym {
  id: string;
  name: string;
  terms: string[];
}

interface FieldBoost {
  field: string;
  weight: number;
}

const initialIndexes: SearchIndex[] = [
  {
    name: 'products',
    documentCount: 15234,
    lastIndexedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    status: 'healthy',
    sizeBytes: 48_200_000,
  },
  {
    name: 'designers',
    documentCount: 2841,
    lastIndexedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    status: 'healthy',
    sizeBytes: 12_400_000,
  },
  {
    name: 'collections',
    documentCount: 456,
    lastIndexedAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    status: 'stale',
    sizeBytes: 2_100_000,
  },
];

const recentSearches: RecentSearch[] = [
  { query: 'walnut dining table', resultCount: 42, timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString() },
  { query: 'velvet sofa blue', resultCount: 18, timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString() },
  { query: 'brass floor lamp', resultCount: 23, timestamp: new Date(Date.now() - 1000 * 60 * 8).toISOString() },
  { query: 'marble coffee table', resultCount: 31, timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString() },
  { query: 'outdoor furniture', resultCount: 87, timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString() },
  { query: 'mid century modern', resultCount: 156, timestamp: new Date(Date.now() - 1000 * 60 * 20).toISOString() },
  { query: 'accent chair boucle', resultCount: 9, timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString() },
  { query: 'pendant light kitchen', resultCount: 34, timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString() },
];

const initialSynonyms: Synonym[] = [
  { id: '1', name: 'Seating', terms: ['sofa', 'couch', 'settee', 'loveseat'] },
  { id: '2', name: 'Storage', terms: ['dresser', 'chest of drawers', 'bureau', 'armoire'] },
  { id: '3', name: 'Dining', terms: ['dining table', 'dinner table', 'eating table'] },
  { id: '4', name: 'Lighting', terms: ['lamp', 'light fixture', 'chandelier', 'pendant'] },
];

const initialBoosts: FieldBoost[] = [
  { field: 'name', weight: 6 },
  { field: 'brand', weight: 3 },
  { field: 'category', weight: 2 },
  { field: 'description', weight: 1 },
  { field: 'sku', weight: 4 },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function getStatusColor(status: SearchIndex['status']): 'success' | 'info' | 'warning' {
  switch (status) {
    case 'healthy':
      return 'success';
    case 'indexing':
      return 'info';
    case 'stale':
      return 'warning';
  }
}

export default function SearchPage() {
  const [indexes, setIndexes] = useState(initialIndexes);
  const [synonyms, setSynonyms] = useState(initialSynonyms);
  const [boosts, setBoosts] = useState(initialBoosts);
  const [reindexingName, setReindexingName] = useState<string | null>(null);
  const [showAddSynonym, setShowAddSynonym] = useState(false);
  const [newSynonym, setNewSynonym] = useState({ name: '', terms: '' });
  const [editingBoost, setEditingBoost] = useState<string | null>(null);
  const [editBoostValue, setEditBoostValue] = useState('');

  const handleReindex = useCallback((indexName: string) => {
    setReindexingName(indexName);
    setIndexes((prev) =>
      prev.map((idx) =>
        idx.name === indexName ? { ...idx, status: 'indexing' as const } : idx
      )
    );
    toast.success(`Reindexing "${indexName}" started`);

    // Simulate reindex completion
    setTimeout(() => {
      setIndexes((prev) =>
        prev.map((idx) =>
          idx.name === indexName
            ? { ...idx, status: 'healthy' as const, lastIndexedAt: new Date().toISOString() }
            : idx
        )
      );
      setReindexingName(null);
      toast.success(`"${indexName}" reindex complete`);
    }, 3000);
  }, []);

  const handleAddSynonym = useCallback(() => {
    if (!newSynonym.name || !newSynonym.terms) {
      toast.error('Name and terms are required');
      return;
    }
    const terms = newSynonym.terms.split(',').map((t) => t.trim()).filter(Boolean);
    if (terms.length < 2) {
      toast.error('At least 2 terms required');
      return;
    }
    setSynonyms((prev) => [
      ...prev,
      { id: String(Date.now()), name: newSynonym.name, terms },
    ]);
    setNewSynonym({ name: '', terms: '' });
    setShowAddSynonym(false);
    toast.success('Synonym group added');
  }, [newSynonym]);

  const handleDeleteSynonym = useCallback((id: string) => {
    setSynonyms((prev) => prev.filter((s) => s.id !== id));
    toast.success('Synonym group removed');
  }, []);

  const handleSaveBoost = useCallback((field: string) => {
    const weight = parseInt(editBoostValue, 10);
    if (isNaN(weight) || weight < 1 || weight > 10) {
      toast.error('Weight must be between 1 and 10');
      return;
    }
    setBoosts((prev) => prev.map((b) => (b.field === field ? { ...b, weight } : b)));
    setEditingBoost(null);
    toast.success(`Boost for "${field}" updated to ${weight}x`);
  }, [editBoostValue]);

  const totalDocs = indexes.reduce((sum, idx) => sum + idx.documentCount, 0);
  const totalSize = indexes.reduce((sum, idx) => sum + idx.sizeBytes, 0);
  const avgResults = Math.round(recentSearches.reduce((sum, s) => sum + s.resultCount, 0) / recentSearches.length);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Search Management</h1>
        <p className="text-muted-foreground">
          Configure synonyms, boosts, and manage search indexes
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Documents</span>
            </div>
            <div className="text-2xl font-bold mt-1">{totalDocs.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Avg. Results</span>
            </div>
            <div className="text-2xl font-bold mt-1">{avgResults}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Synonym Groups</span>
            </div>
            <div className="text-2xl font-bold mt-1">{synonyms.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Index Size</span>
            </div>
            <div className="text-2xl font-bold mt-1">{formatBytes(totalSize)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Index Management */}
      <Card>
        <CardHeader>
          <CardTitle>Index Management</CardTitle>
          <CardDescription>Monitor and manage search indexes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {indexes.map((index) => (
              <div
                key={index.name}
                className="flex items-center justify-between p-4 rounded-lg border"
              >
                <div className="flex items-center gap-4">
                  <Database className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="font-medium">{index.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {index.documentCount.toLocaleString()} documents | {formatBytes(index.sizeBytes)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Last indexed {formatRelativeTime(index.lastIndexedAt)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="subtle" color={getStatusColor(index.status)}>
                    {index.status === 'indexing' && (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    )}
                    {index.status}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={reindexingName === index.name}
                    onClick={() => handleReindex(index.name)}
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${reindexingName === index.name ? 'animate-spin' : ''}`} />
                    Reindex
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Synonyms */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Synonyms</CardTitle>
                <CardDescription>Manage search synonyms and term mappings</CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => setShowAddSynonym(!showAddSynonym)}
              >
                {showAddSynonym ? (
                  <X className="mr-2 h-4 w-4" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                {showAddSynonym ? 'Cancel' : 'Add'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {showAddSynonym && (
              <div className="mb-4 p-3 border rounded-lg space-y-3 bg-muted/30">
                <Input
                  placeholder="Group name (e.g. Seating)"
                  value={newSynonym.name}
                  onChange={(e) => setNewSynonym({ ...newSynonym, name: e.target.value })}
                />
                <Input
                  placeholder="Comma-separated terms (e.g. sofa, couch, settee)"
                  value={newSynonym.terms}
                  onChange={(e) => setNewSynonym({ ...newSynonym, terms: e.target.value })}
                />
                <Button size="sm" onClick={handleAddSynonym}>
                  <Check className="mr-2 h-4 w-4" />
                  Save
                </Button>
              </div>
            )}
            <div className="space-y-2">
              {synonyms.map((synonym) => (
                <div key={synonym.id} className="flex items-start justify-between p-3 bg-muted/50 rounded-md group">
                  <div>
                    <div className="font-medium text-sm">{synonym.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {synonym.terms.join(', ')}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                    onClick={() => handleDeleteSynonym(synonym.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Field Boosts */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Field Boosts</CardTitle>
                <CardDescription>Configure search field weights</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {boosts.map((boost) => (
                <div
                  key={boost.field}
                  className="flex items-center justify-between p-3 rounded-md border group"
                >
                  <span className="text-sm font-medium">{boost.field}</span>
                  <div className="flex items-center gap-2">
                    {editingBoost === boost.field ? (
                      <>
                        <Input
                          className="w-16 h-8 text-center"
                          value={editBoostValue}
                          onChange={(e) => setEditBoostValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveBoost(boost.field);
                            if (e.key === 'Escape') setEditingBoost(null);
                          }}
                          autoFocus
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSaveBoost(boost.field)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="w-full bg-muted rounded-full h-2 max-w-[80px]">
                          <div
                            className="bg-primary rounded-full h-2 transition-all"
                            style={{ width: `${(boost.weight / 10) * 100}%` }}
                          />
                        </div>
                        <span
                          className="font-mono text-sm w-8 text-right cursor-pointer hover:text-primary"
                          onClick={() => {
                            setEditingBoost(boost.field);
                            setEditBoostValue(String(boost.weight));
                          }}
                        >
                          {boost.weight}x
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Searches */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Searches</CardTitle>
          <CardDescription>Latest user search queries across the platform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {recentSearches.map((search, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-md hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{search.query}</span>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant="outline">{search.resultCount} results</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(search.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
