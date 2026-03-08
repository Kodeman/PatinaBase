'use client';

import { useState } from 'react';
import { Plus, X, AlertCircle } from 'lucide-react';
import { Button, Card, CardContent, Badge, Alert, AlertDescription } from '@patina/design-system';
import type { Collection, CollectionRule, RuleCondition } from '@patina/types';

interface CollectionRulesFormProps {
  collection: Partial<Collection>;
  onChange: (updates: Partial<Collection>) => void;
}

const FIELD_OPTIONS = [
  { value: 'category', label: 'Category', type: 'select' },
  { value: 'brand', label: 'Brand', type: 'select' },
  { value: 'price', label: 'Price', type: 'number' },
  { value: 'material', label: 'Material', type: 'text' },
  { value: 'color', label: 'Color', type: 'text' },
  { value: 'tags', label: 'Tags', type: 'text' },
  { value: 'has3D', label: 'Has 3D Model', type: 'boolean' },
  { value: 'customizable', label: 'Customizable', type: 'boolean' },
  { value: 'status', label: 'Status', type: 'select' },
];

const OPERATOR_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  text: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'contains', label: 'Contains' },
  ],
  number: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'greater_than', label: 'Greater Than' },
    { value: 'less_than', label: 'Less Than' },
    { value: 'between', label: 'Between' },
  ],
  select: [
    { value: 'equals', label: 'Is' },
    { value: 'not_equals', label: 'Is Not' },
    { value: 'in', label: 'In' },
    { value: 'not_in', label: 'Not In' },
  ],
  boolean: [
    { value: 'equals', label: 'Is' },
  ],
};

export function CollectionRulesForm({ collection, onChange }: CollectionRulesFormProps) {
  const rule = collection.rule || {
    id: `temp-${Date.now()}`,
    collectionId: collection.id || '',
    operator: 'AND' as const,
    conditions: [],
  };

  const handleAddCondition = () => {
    const newCondition: RuleCondition = {
      field: 'category',
      operator: 'equals',
      value: '',
    };

    onChange({
      rule: {
        ...rule,
        conditions: [...rule.conditions, newCondition],
      },
    });
  };

  const handleUpdateCondition = (index: number, updates: Partial<RuleCondition>) => {
    const conditions = [...rule.conditions];
    conditions[index] = { ...conditions[index], ...updates };

    // Reset operator and value when field changes
    if (updates.field) {
      const fieldOption = FIELD_OPTIONS.find((f) => f.value === updates.field);
      const operators = OPERATOR_OPTIONS[fieldOption?.type || 'text'];
      conditions[index].operator = operators[0].value as any;
      conditions[index].value = '';
    }

    onChange({
      rule: {
        ...rule,
        conditions,
      },
    });
  };

  const handleRemoveCondition = (index: number) => {
    const conditions = rule.conditions.filter((_, i) => i !== index);
    onChange({
      rule: {
        ...rule,
        conditions,
      },
    });
  };

  const handleOperatorChange = (operator: 'AND' | 'OR') => {
    onChange({
      rule: {
        ...rule,
        operator,
      },
    });
  };

  return (
    <div className="space-y-6">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Dynamic collections automatically include products that match your rules. Products will be
          added or removed as they meet or no longer meet the criteria.
        </AlertDescription>
      </Alert>

      {/* Operator Selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Products must match</label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={rule.operator === 'AND' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleOperatorChange('AND')}
          >
            All conditions (AND)
          </Button>
          <Button
            type="button"
            variant={rule.operator === 'OR' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleOperatorChange('OR')}
          >
            Any condition (OR)
          </Button>
        </div>
      </div>

      {/* Conditions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Conditions</h3>
          <Badge variant="secondary">{rule.conditions.length} conditions</Badge>
        </div>

        {rule.conditions.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <AlertCircle className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No conditions defined</h3>
              <p className="text-muted-foreground mb-4">
                Add conditions to automatically include products in this collection
              </p>
              <Button onClick={handleAddCondition}>
                <Plus className="mr-2 h-4 w-4" />
                Add Condition
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {rule.conditions.map((condition, index) => {
              const fieldOption = FIELD_OPTIONS.find((f) => f.value === condition.field);
              const operators = OPERATOR_OPTIONS[fieldOption?.type || 'text'];

              return (
                <div key={index} className="flex items-start gap-2 p-3 rounded-lg border group">
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    {/* Field */}
                    <select
                      value={condition.field}
                      onChange={(e) => handleUpdateCondition(index, { field: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {FIELD_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>

                    {/* Operator */}
                    <select
                      value={condition.operator}
                      onChange={(e) => handleUpdateCondition(index, { operator: e.target.value as any })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {operators.map((op) => (
                        <option key={op.value} value={op.value}>
                          {op.label}
                        </option>
                      ))}
                    </select>

                    {/* Value */}
                    {fieldOption?.type === 'boolean' ? (
                      <select
                        value={condition.value === true ? 'true' : 'false'}
                        onChange={(e) => handleUpdateCondition(index, { value: e.target.value === 'true' })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : fieldOption?.type === 'number' ? (
                      <input
                        type="number"
                        value={condition.value || ''}
                        onChange={(e) => handleUpdateCondition(index, { value: parseFloat(e.target.value) })}
                        placeholder="Enter value..."
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    ) : (
                      <input
                        type="text"
                        value={condition.value || ''}
                        onChange={(e) => handleUpdateCondition(index, { value: e.target.value })}
                        placeholder="Enter value..."
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    )}
                  </div>

                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => handleRemoveCondition(index)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}

            <Button type="button" variant="outline" onClick={handleAddCondition} className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Add Condition
            </Button>
          </div>
        )}
      </div>

      {/* Preview */}
      {rule.conditions.length > 0 && (
        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <h4 className="text-sm font-semibold mb-2">Rule Preview</h4>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>
                Include products where <strong>{rule.operator === 'AND' ? 'all' : 'any'}</strong> of
                the following are true:
              </p>
              <ul className="list-disc list-inside ml-2">
                {rule.conditions.map((condition, index) => {
                  const field = FIELD_OPTIONS.find((f) => f.value === condition.field);
                  const operatorLabel = OPERATOR_OPTIONS[field?.type || 'text']?.find(
                    (o) => o.value === condition.operator
                  )?.label;

                  return (
                    <li key={index}>
                      <strong>{field?.label}</strong> {operatorLabel?.toLowerCase()}{' '}
                      <code className="bg-muted px-1 rounded">{String(condition.value)}</code>
                    </li>
                  );
                })}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
