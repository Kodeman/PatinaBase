'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateAudienceSegment, useEstimateAudienceSize } from '@patina/supabase/hooks';
import { ChevronLeft, Plus, Trash2, Users, Save } from 'lucide-react';
import type { SegmentField, SegmentOperator, SegmentRules } from '@patina/shared/types';
import { cn } from '@/lib/utils';

const fieldOptions: { value: SegmentField; label: string; type: 'string' | 'number' | 'boolean' | 'date' }[] = [
  { value: 'role', label: 'Role', type: 'string' },
  { value: 'founding_circle', label: 'Founding Circle', type: 'boolean' },
  { value: 'engagement_score', label: 'Engagement Score', type: 'number' },
  { value: 'engagement_tier', label: 'Engagement Tier', type: 'string' },
  { value: 'last_active_at', label: 'Last Active', type: 'date' },
  { value: 'created_at', label: 'Signup Date', type: 'date' },
  { value: 'channels_email', label: 'Email Subscribed', type: 'boolean' },
  { value: 'city', label: 'City', type: 'string' },
  { value: 'state', label: 'State', type: 'string' },
  { value: 'country', label: 'Country', type: 'string' },
  { value: 'has_completed_quiz', label: 'Completed Style Quiz', type: 'boolean' },
  { value: 'has_active_project', label: 'Has Active Project', type: 'boolean' },
  { value: 'total_orders', label: 'Total Orders', type: 'number' },
  { value: 'total_spent', label: 'Total Spent', type: 'number' },
  { value: 'last_purchase_at', label: 'Last Purchase', type: 'date' },
];

const operatorsByType: Record<string, { value: SegmentOperator; label: string }[]> = {
  string: [
    { value: 'eq', label: 'equals' },
    { value: 'neq', label: 'not equals' },
    { value: 'contains', label: 'contains' },
    { value: 'not_contains', label: 'does not contain' },
    { value: 'is_set', label: 'is set' },
    { value: 'is_not_set', label: 'is not set' },
  ],
  number: [
    { value: 'eq', label: 'equals' },
    { value: 'gt', label: 'greater than' },
    { value: 'gte', label: 'at least' },
    { value: 'lt', label: 'less than' },
    { value: 'lte', label: 'at most' },
  ],
  boolean: [
    { value: 'eq', label: 'is' },
  ],
  date: [
    { value: 'older_than', label: 'older than (days)' },
    { value: 'newer_than', label: 'newer than (days)' },
    { value: 'is_set', label: 'is set' },
    { value: 'is_not_set', label: 'is not set' },
  ],
};

interface RuleRow {
  id: string;
  field: SegmentField;
  operator: SegmentOperator;
  value: unknown;
}

export default function NewAudiencePage() {
  const router = useRouter();
  const createSegment = useCreateAudienceSegment();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [logic, setLogic] = useState<'and' | 'or'>('and');
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const segmentRules: SegmentRules = {
    logic,
    conditions: rules.map(({ field, operator, value }) => ({ field, operator, value })),
  };

  const { data: estimatedSize } = useEstimateAudienceSize(
    rules.length > 0 ? segmentRules : null
  );

  const addRule = () => {
    setRules([...rules, {
      id: crypto.randomUUID(),
      field: 'role',
      operator: 'eq',
      value: '',
    }]);
  };

  const updateRule = (id: string, updates: Partial<RuleRow>) => {
    setRules(rules.map((r) => r.id === id ? { ...r, ...updates } : r));
  };

  const removeRule = (id: string) => {
    setRules(rules.filter((r) => r.id !== id));
  };

  const handleCreate = async () => {
    if (!name || rules.length === 0) return;
    setIsCreating(true);
    try {
      await createSegment.mutateAsync({ name, description, rules: segmentRules });
      router.push('/communications/audiences');
    } catch {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-patina-off-white">
      <div className="bg-white border-b border-patina-clay-beige/20 px-8 py-6">
        <button
          onClick={() => router.push('/communications/audiences')}
          className="flex items-center gap-1 text-sm text-patina-clay-beige hover:text-patina-charcoal mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Audiences
        </button>
        <h1 className="text-2xl font-display font-semibold text-patina-charcoal">New Segment</h1>
        <p className="text-sm text-patina-clay-beige mt-1">Define rules to create an audience segment</p>
      </div>

      <div className="px-8 py-6 max-w-4xl space-y-6">
        {/* Name & description */}
        <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-patina-charcoal mb-1">Segment Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Active Designers in NYC"
              className="w-full px-3 py-2.5 text-sm border border-patina-clay-beige/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-patina-charcoal mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              className="w-full px-3 py-2.5 text-sm border border-patina-clay-beige/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20"
            />
          </div>
        </div>

        {/* Rules */}
        <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-patina-charcoal">Segment Rules</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-patina-clay-beige">Match</span>
              <div className="flex gap-1 bg-patina-off-white rounded-lg p-0.5">
                <button
                  onClick={() => setLogic('and')}
                  className={cn('px-3 py-1 text-xs font-medium rounded-md', logic === 'and' ? 'bg-white shadow-sm text-patina-charcoal' : 'text-patina-clay-beige')}
                >
                  ALL
                </button>
                <button
                  onClick={() => setLogic('or')}
                  className={cn('px-3 py-1 text-xs font-medium rounded-md', logic === 'or' ? 'bg-white shadow-sm text-patina-charcoal' : 'text-patina-clay-beige')}
                >
                  ANY
                </button>
              </div>
              <span className="text-xs text-patina-clay-beige">rules</span>
            </div>
          </div>

          {rules.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-patina-clay-beige mb-3">No rules defined yet.</p>
              <button
                onClick={addRule}
                className="inline-flex items-center gap-1 text-sm text-patina-mocha-brown hover:underline"
              >
                <Plus className="w-4 h-4" /> Add first rule
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule, index) => {
                const fieldConfig = fieldOptions.find((f) => f.value === rule.field);
                const operators = operatorsByType[fieldConfig?.type || 'string'];
                const needsValue = !['is_set', 'is_not_set'].includes(rule.operator);

                return (
                  <div key={rule.id} className="flex items-center gap-2">
                    {index > 0 && (
                      <span className="text-xs text-patina-clay-beige w-8 text-center shrink-0">
                        {logic === 'and' ? 'AND' : 'OR'}
                      </span>
                    )}
                    {index === 0 && <span className="w-8 shrink-0" />}

                    <select
                      value={rule.field}
                      onChange={(e) => updateRule(rule.id, { field: e.target.value as SegmentField, operator: 'eq', value: '' })}
                      className="px-2 py-1.5 text-sm border border-patina-clay-beige/30 rounded-lg flex-1 min-w-[140px]"
                    >
                      {fieldOptions.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>

                    <select
                      value={rule.operator}
                      onChange={(e) => updateRule(rule.id, { operator: e.target.value as SegmentOperator })}
                      className="px-2 py-1.5 text-sm border border-patina-clay-beige/30 rounded-lg flex-1 min-w-[130px]"
                    >
                      {operators.map((op) => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </select>

                    {needsValue && (
                      fieldConfig?.type === 'boolean' ? (
                        <select
                          value={String(rule.value)}
                          onChange={(e) => updateRule(rule.id, { value: e.target.value === 'true' })}
                          className="px-2 py-1.5 text-sm border border-patina-clay-beige/30 rounded-lg flex-1"
                        >
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      ) : (
                        <input
                          type={fieldConfig?.type === 'number' ? 'number' : 'text'}
                          value={String(rule.value || '')}
                          onChange={(e) => updateRule(rule.id, {
                            value: fieldConfig?.type === 'number' ? Number(e.target.value) : e.target.value
                          })}
                          placeholder="Value"
                          className="px-2 py-1.5 text-sm border border-patina-clay-beige/30 rounded-lg flex-1 min-w-[100px]"
                        />
                      )
                    )}

                    <button
                      onClick={() => removeRule(rule.id)}
                      className="p-1.5 text-patina-clay-beige hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              <button
                onClick={addRule}
                className="flex items-center gap-1 text-xs text-patina-mocha-brown hover:underline"
              >
                <Plus className="w-3 h-3" /> Add rule
              </button>
            </div>
          )}
        </div>

        {/* Audience estimate + save */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-patina-mocha-brown" />
            <div>
              <p className="text-sm font-medium text-patina-charcoal">
                Estimated recipients: {estimatedSize !== undefined ? estimatedSize.toLocaleString() : '--'}
              </p>
              <p className="text-xs text-patina-clay-beige">
                {rules.length === 0 ? 'Add rules to estimate audience size' : 'Count updates in real-time'}
              </p>
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={!name || rules.length === 0 || isCreating}
            className="flex items-center gap-2 px-6 py-2.5 bg-patina-mocha-brown text-white rounded-lg text-sm font-medium hover:bg-patina-charcoal transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isCreating ? 'Creating...' : 'Save Segment'}
          </button>
        </div>
      </div>
    </div>
  );
}
