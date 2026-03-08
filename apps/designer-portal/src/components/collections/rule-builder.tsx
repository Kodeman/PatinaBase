'use client';

import { useState } from 'react';
import { Card, CardContent } from '@patina/design-system';
import { Button } from '@patina/design-system';
import { Input } from '@patina/design-system';
import { Badge } from '@patina/design-system';
import { Plus, X, Zap } from 'lucide-react';
import type { RuleCondition } from '@patina/types';

interface RuleBuilderProps {
  rules?: RuleCondition[];
  operator?: 'AND' | 'OR';
  onChange?: (rules: RuleCondition[], operator: 'AND' | 'OR') => void;
  readOnly?: boolean;
}

const FIELD_OPTIONS = [
  { value: 'category', label: 'Category' },
  { value: 'price', label: 'Price' },
  { value: 'brand', label: 'Brand' },
  { value: 'material', label: 'Material' },
  { value: 'color', label: 'Color' },
  { value: 'tag', label: 'Style Tag' },
  { value: 'availability', label: 'Availability' },
];

const OPERATOR_OPTIONS = {
  category: [
    { value: 'equals', label: 'is' },
    { value: 'not_equals', label: 'is not' },
    { value: 'in', label: 'is one of' },
  ],
  price: [
    { value: 'greater_than', label: 'greater than' },
    { value: 'less_than', label: 'less than' },
    { value: 'between', label: 'between' },
  ],
  brand: [
    { value: 'equals', label: 'is' },
    { value: 'in', label: 'is one of' },
  ],
  material: [
    { value: 'contains', label: 'contains' },
    { value: 'in', label: 'is one of' },
  ],
  color: [
    { value: 'equals', label: 'is' },
    { value: 'in', label: 'is one of' },
  ],
  tag: [
    { value: 'contains', label: 'contains' },
    { value: 'in', label: 'includes any of' },
  ],
  availability: [
    { value: 'equals', label: 'is' },
  ],
};

export function RuleBuilder({
  rules = [],
  operator = 'AND',
  onChange,
  readOnly = false,
}: RuleBuilderProps) {
  const [conditions, setConditions] = useState<RuleCondition[]>(
    rules.length > 0 ? rules : [{ field: 'category', operator: 'equals', value: '' }]
  );
  const [logicOperator, setLogicOperator] = useState<'AND' | 'OR'>(operator);

  const handleAddCondition = () => {
    const newConditions = [
      ...conditions,
      { field: 'category', operator: 'equals' as const, value: '' },
    ];
    setConditions(newConditions);
    if (onChange) onChange(newConditions, logicOperator);
  };

  const handleRemoveCondition = (index: number) => {
    const newConditions = conditions.filter((_, i) => i !== index);
    setConditions(newConditions);
    if (onChange) onChange(newConditions, logicOperator);
  };

  const handleConditionChange = (
    index: number,
    field: keyof RuleCondition,
    value: any
  ) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], [field]: value };
    setConditions(newConditions);
    if (onChange) onChange(newConditions, logicOperator);
  };

  const handleOperatorChange = (newOperator: 'AND' | 'OR') => {
    setLogicOperator(newOperator);
    if (onChange) onChange(conditions, newOperator);
  };

  const getOperatorOptions = (field: string) => {
    return OPERATOR_OPTIONS[field as keyof typeof OPERATOR_OPTIONS] || [];
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Collection Rules</h3>
          </div>
          {!readOnly && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Match products that meet:</span>
              <div className="flex gap-1 rounded-lg border p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={logicOperator === 'AND' ? 'default' : 'ghost'}
                  onClick={() => handleOperatorChange('AND')}
                  className="h-7 px-3"
                >
                  All
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={logicOperator === 'OR' ? 'default' : 'ghost'}
                  onClick={() => handleOperatorChange('OR')}
                  className="h-7 px-3"
                >
                  Any
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {conditions.map((condition, index) => (
            <div key={index} className="flex items-start gap-2">
              <div className="flex-1 grid grid-cols-3 gap-2">
                {/* Field */}
                <select
                  value={condition.field}
                  onChange={(e) =>
                    handleConditionChange(index, 'field', e.target.value)
                  }
                  disabled={readOnly}
                  className="px-3 py-2 border rounded-lg bg-background"
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
                  onChange={(e) =>
                    handleConditionChange(index, 'operator', e.target.value)
                  }
                  disabled={readOnly}
                  className="px-3 py-2 border rounded-lg bg-background"
                >
                  {getOperatorOptions(condition.field).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                {/* Value */}
                <Input
                  value={condition.value}
                  onChange={(e) =>
                    handleConditionChange(index, 'value', e.target.value)
                  }
                  placeholder="Enter value..."
                  disabled={readOnly}
                />
              </div>

              {!readOnly && conditions.length > 1 && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => handleRemoveCondition(index)}
                  className="h-10 w-10 shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>

        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddCondition}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Condition
          </Button>
        )}

        {readOnly && (
          <div className="pt-3 border-t">
            <p className="text-sm text-muted-foreground">
              Products will be automatically included if they match{' '}
              <Badge variant="subtle" color="neutral" className="mx-1">
                {logicOperator === 'AND' ? 'all' : 'any'}
              </Badge>
              of the conditions above.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
