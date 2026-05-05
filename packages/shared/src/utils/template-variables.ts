import type { TemplateVariable, TemplateVariableInput } from '../types/notifications';

const NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function isValidVariableName(name: string): boolean {
  return NAME_PATTERN.test(name);
}

export function normalizeTemplateVariable(input: TemplateVariableInput): TemplateVariable {
  if (typeof input === 'string') {
    return {
      name: input,
      label: input,
      sample: '',
      required: false,
    };
  }
  return {
    name: input.name,
    label: input.label || input.name,
    sample: input.sample ?? '',
    required: !!input.required,
  };
}

export function normalizeTemplateVariables(
  input: TemplateVariableInput[] | null | undefined
): TemplateVariable[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((v) => {
      try {
        return normalizeTemplateVariable(v);
      } catch {
        return null;
      }
    })
    .filter((v): v is TemplateVariable => v !== null && !!v.name);
}

export function buildSampleData(
  variables: TemplateVariableInput[] | null | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of normalizeTemplateVariables(variables)) {
    out[v.name] = v.sample;
  }
  return out;
}
