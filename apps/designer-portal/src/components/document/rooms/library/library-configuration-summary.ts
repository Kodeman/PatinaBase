import {
  formatMoney,
  type ConfigurationMode,
} from "../piece/piece-configuration-model";

export type LibraryCapabilityFilter =
  | "all"
  | "standard"
  | "variant"
  | "configured"
  | "modular"
  | "custom";

export interface LibraryConfigurationSummary {
  mode: ConfigurationMode;
  optionGroupCount: number;
  optionValueCount: number;
  variantCount: number;
  componentCount: number;
  primaryOptionName: string | null;
  primaryOptionValueCount: number;
  minRetailPriceCents: number | null;
  maxRetailPriceCents: number | null;
  minLeadTimeWeeks: number | null;
  maxLeadTimeWeeks: number | null;
}

export interface LibraryConfigurationProduct {
  configuration_mode?: ConfigurationMode | null;
  configuration_summary?: unknown;
  price_retail?: number | null;
}

export function readLibraryConfigurationSummary(
  product: LibraryConfigurationProduct,
): LibraryConfigurationSummary {
  const raw = isRecord(product.configuration_summary)
    ? product.configuration_summary
    : {};
  const mode = normalizeMode(product.configuration_mode ?? raw.mode);
  return {
    mode,
    optionGroupCount: readNumber(
      raw,
      "groupCount",
      "optionGroupCount",
      "option_group_count",
    ),
    optionValueCount: readNumber(
      raw,
      "valueCount",
      "optionValueCount",
      "option_value_count",
    ),
    variantCount: readNumber(
      raw,
      "activeVariantCount",
      "variantCount",
      "variant_count",
    ),
    componentCount: readNumber(
      raw,
      "activeComponentCount",
      "componentCount",
      "component_count",
    ),
    primaryOptionName: readString(
      raw,
      "primaryOptionName",
      "primary_option_name",
      "primaryGroupName",
      "primary_group_name",
    ),
    primaryOptionValueCount: readNumber(
      raw,
      "primaryOptionValueCount",
      "primary_option_value_count",
      "primaryGroupValueCount",
      "primary_group_value_count",
    ),
    minRetailPriceCents:
      readNullableNumber(
        raw,
        "minRetailPriceCents",
        "min_retail_price_cents",
        "retailPriceMinCents",
        "retail_price_min_cents",
      ) ??
      product.price_retail ??
      null,
    maxRetailPriceCents:
      readNullableNumber(
        raw,
        "maxRetailPriceCents",
        "max_retail_price_cents",
        "retailPriceMaxCents",
        "retail_price_max_cents",
      ) ??
      product.price_retail ??
      null,
    minLeadTimeWeeks: readNullableNumber(
      raw,
      "minLeadTimeWeeks",
      "min_lead_time_weeks",
      "leadTimeMinWeeks",
      "lead_time_min_weeks",
    ),
    maxLeadTimeWeeks: readNullableNumber(
      raw,
      "maxLeadTimeWeeks",
      "max_lead_time_weeks",
      "leadTimeMaxWeeks",
      "lead_time_max_weeks",
    ),
  };
}

export function matchesCapabilityFilter(
  summary: LibraryConfigurationSummary,
  filter: LibraryCapabilityFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "modular") {
    return summary.mode === "configured" && summary.componentCount > 0;
  }
  if (filter === "configured") {
    return summary.mode === "configured" && summary.componentCount === 0;
  }
  return summary.mode === filter;
}

export function capabilityLabels(
  summary: LibraryConfigurationSummary,
): string[] {
  if (summary.mode === "custom") return ["Custom", "Price on request"];
  if (summary.mode === "standard") {
    return [
      "One specification",
      ...(summary.minRetailPriceCents == null
        ? ["Price on request"]
        : [formatMoney(summary.minRetailPriceCents)!]),
    ];
  }

  const labels: string[] = [];
  if (summary.mode === "variant") {
    const primary = summary.primaryOptionName?.toLowerCase() ?? "";
    if (summary.primaryOptionValueCount > 0 && primary.includes("size")) {
      labels.push(
        `${summary.primaryOptionValueCount} size${summary.primaryOptionValueCount === 1 ? "" : "s"}`,
      );
    } else if (summary.variantCount > 0) {
      labels.push(
        `${summary.variantCount} variant${summary.variantCount === 1 ? "" : "s"}`,
      );
    } else {
      labels.push("Variants");
    }
  }

  if (summary.mode === "configured") {
    labels.push(summary.componentCount > 0 ? "Modular" : "Configurable");
  }

  if (summary.minRetailPriceCents != null) {
    labels.push(`From ${formatMoney(summary.minRetailPriceCents)}`);
  } else {
    labels.push("Price on request");
  }
  return labels;
}

function normalizeMode(value: unknown): ConfigurationMode {
  return value === "variant" || value === "configured" || value === "custom"
    ? value
    : "standard";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readNumber(
  record: Record<string, unknown>,
  ...keys: string[]
): number {
  return readNullableNumber(record, ...keys) ?? 0;
}

function readNullableNumber(
  record: Record<string, unknown>,
  ...keys: string[]
): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function readString(
  record: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
