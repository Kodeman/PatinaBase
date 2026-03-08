'use client';

import { Plus, X, GripVertical } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@patina/design-system';
import type { RuleCondition } from '@patina/types';

interface RuleBuilderProps {
  operator: 'AND' | 'OR';
  conditions: RuleCondition[];
  onChange: (operator: 'AND' | 'OR', conditions: RuleCondition[]) => void;
  className?: string;
}

const FIELD_OPTIONS = [
  { value: 'category', label: 'Category' },
  { value: 'brand', label: 'Brand' },
  { value: 'price', label: 'Price' },
  { value: 'tags', label: 'Tags' },
  { value: 'material', label: 'Material' },
  { value: 'color', label: 'Color' },
  { value: 'styleTags', label: 'Style' },
  { value: 'availability', label: 'Availability' },
];

const OPERATOR_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  default: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'in', label: 'In' },
    { value: 'not_in', label: 'Not In' },
  ],
  numeric: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'greater_than', label: 'Greater Than' },
    { value: 'less_than', label: 'Less Than' },
    { value: 'between', label: 'Between' },
  ],
};

export function RuleBuilder({ operator, conditions, onChange, className }: RuleBuilderProps) {
  const addCondition = () => {
    const newCondition: RuleCondition = {
      field: 'category',
      operator: 'equals',
      value: '',
    };
    onChange(operator, [...conditions, newCondition]);
  };

  const removeCondition = (index: number) => {
    onChange(
      operator,
      conditions.filter((_, i) => i !== index)
    );
  };

  const updateCondition = (index: number, updates: Partial<RuleCondition>) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], ...updates };
    onChange(operator, newConditions);
  };

  const getOperators = (field: string) => {
    if (field === 'price') {
      return OPERATOR_OPTIONS.numeric;
    }
    return OPERATOR_OPTIONS.default;
  };

  return (
    <div className={className}>
      <div className="space-y-4">
        {/* Operator Toggle */}
        <div className="flex items-center gap-2">
          <Label>Match</Label>
          <div className="flex gap-1 rounded-lg border p-1">
            <Button
              type="button"
              variant={operator === 'AND' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onChange('AND', conditions)}
            >
              All (AND)
            </Button>
            <Button
              type="button"
              variant={operator === 'OR' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onChange('OR', conditions)}
            >
              Any (OR)
            </Button>
          </div>
          <span className="text-sm text-muted-foreground">
            of the following conditions
          </span>
        </div>

        {/* Conditions */}
        <div className="space-y-3">
          {conditions.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-sm text-muted-foreground mb-4">
                  No conditions added yet. Click "Add Condition" to get started.
                </p>
                <Button type="button" variant="outline" size="sm" onClick={addCondition}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Condition
                </Button>
              </CardContent>
            </Card>
          ) : (
            conditions.map((condition, index) => (
              <Card key={index}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Drag Handle */}
                    <div className="flex items-center h-10">
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                    </div>

                    {/* Condition Builder */}
                    <div className="flex-1 grid gap-3 sm:grid-cols-3">
                      {/* Field Selector */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">Field</Label>
                        <Select
                          value={condition.field}
                          onValueChange={(value: string) => updateCondition(index, { field: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FIELD_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Operator Selector */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">Operator</Label>
                        <Select
                          value={condition.operator}
                          onValueChange={(value: string) =>
                            updateCondition(index, {
                              operator: value as RuleCondition['operator'],
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {getOperators(condition.field).map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Value Input */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">Value</Label>
                        {condition.operator === 'in' || condition.operator === 'not_in' ? (
                          <Input
                            type="text"
                            placeholder="Enter values separated by commas"
                            value={Array.isArray(condition.value) ? condition.value.join(', ') : condition.value}
                            onChange={(e) => {
                              const values = e.target.value.split(',').map((v) => v.trim());
                              updateCondition(index, { value: values });
                            }}
                          />
                        ) : condition.operator === 'between' ? (
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              placeholder="Min"
                              value={Array.isArray(condition.value) ? condition.value[0] : ''}
                              onChange={(e) => {
                                const value = Array.isArray(condition.value)
                                  ? [Number(e.target.value), condition.value[1]]
                                  : [Number(e.target.value), 0];
                                updateCondition(index, { value });
                              }}
                            />
                            <Input
                              type="number"
                              placeholder="Max"
                              value={Array.isArray(condition.value) ? condition.value[1] : ''}
                              onChange={(e) => {
                                const value = Array.isArray(condition.value)
                                  ? [condition.value[0], Number(e.target.value)]
                                  : [0, Number(e.target.value)];
                                updateCondition(index, { value });
                              }}
                            />
                          </div>
                        ) : (
                          <Input
                            type={condition.field === 'price' ? 'number' : 'text'}
                            placeholder="Enter value"
                            value={condition.value as string | number}
                            onChange={(e) => {
                              const value =
                                condition.field === 'price'
                                  ? Number(e.target.value)
                                  : e.target.value;
                              updateCondition(index, { value });
                            }}
                          />
                        )}
                      </div>
                    </div>

                    {/* Remove Button */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 flex-shrink-0"
                      onClick={() => removeCondition(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Add Condition Button */}
        {conditions.length > 0 && (
          <Button type="button" variant="outline" onClick={addCondition} className="w-full">
            <Plus className="mr-2 h-4 w-4" />
            Add Condition
          </Button>
        )}

        {/* Preview */}
        {conditions.length > 0 && (
          <div className="rounded-lg bg-muted p-4">
            <Label className="text-xs uppercase text-muted-foreground mb-2 block">
              Rule Preview
            </Label>
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant="secondary">
                Include products where
              </Badge>
              {conditions.map((condition, index) => (
                <div key={index} className="flex items-center gap-2">
                  {index > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {operator}
                    </Badge>
                  )}
                  <Badge variant="secondary">
                    <span className="font-semibold">{condition.field}</span>
                    <span className="mx-1">{condition.operator}</span>
                    <span className="font-semibold">
                      {Array.isArray(condition.value)
                        ? condition.value.join(', ')
                        : condition.value}
                    </span>
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
