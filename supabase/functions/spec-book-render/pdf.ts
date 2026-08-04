// Deterministic PDF layout for frozen, audience-filtered Spec Book models.
// One entry sheet per page keeps contents numbering stable and auditable.

// deno-lint-ignore-file no-import-prefix

import React from "npm:react@19.1.0";
import {
  Document,
  Image,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from "npm:@react-pdf/renderer@4.3.0";
import type {
  AudienceConfigurationSummary,
  AudienceItem,
  AudienceRenderModel,
} from "./render-model.ts";
import { renderMediaIdentity } from "./render-model.ts";

const h = React.createElement;
const CONTENTS_ROWS_PER_PAGE = 34;
const SCHEDULE_ROWS_PER_PAGE = 22;
const CHANGE_ROWS_PER_PAGE = 28;

export type PagePlanEntry =
  | { kind: "cover"; pageNumber: number }
  | { kind: "contents"; pageNumber: number; rows: ContentsRow[] }
  | { kind: "chapter"; pageNumber: number; chapterId: string; name: string }
  | { kind: "item"; pageNumber: number; item: AudienceItem }
  | {
    kind: "schedule";
    pageNumber: number;
    title: string;
    items: AudienceItem[];
  }
  | { kind: "changes"; pageNumber: number; start: number; end: number };

export interface ContentsRow {
  label: string;
  pageNumber: number;
}

function chunks<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size));
  }
  return out;
}

export function buildPagePlan(model: AudienceRenderModel): PagePlanEntry[] {
  const contentsTargets: Array<{ label: string; key: string }> = [];
  const chapterItems = new Map<string, AudienceItem[]>();
  const unassigned: AudienceItem[] = [];
  for (const item of model.items) {
    if (item.chapterId) {
      const entries = chapterItems.get(item.chapterId) ?? [];
      entries.push(item);
      chapterItems.set(item.chapterId, entries);
    } else {
      unassigned.push(item);
    }
  }
  for (const chapter of model.chapters) {
    if ((chapterItems.get(chapter.id) ?? []).length > 0) {
      contentsTargets.push({
        label: chapter.name,
        key: `chapter:${chapter.id}`,
      });
    }
  }
  if (unassigned.length) {
    contentsTargets.push({ label: "Unassigned", key: "chapter:unassigned" });
  }
  if (model.allowances.length) {
    contentsTargets.push({ label: "Allowances", key: "schedule:allowances" });
  }
  if (model.tbd.length) {
    contentsTargets.push({ label: "To Be Determined", key: "schedule:tbd" });
  }
  if (model.changes.length) {
    contentsTargets.push({ label: "Revision Changes", key: "changes" });
  }

  const contentsPageCount = Math.max(
    1,
    Math.ceil(contentsTargets.length / CONTENTS_ROWS_PER_PAGE),
  );
  let pageNumber = 1 + contentsPageCount + 1;
  const pageByKey = new Map<string, number>();

  for (const chapter of model.chapters) {
    const items = chapterItems.get(chapter.id) ?? [];
    if (!items.length) continue;
    pageByKey.set(`chapter:${chapter.id}`, pageNumber);
    pageNumber += 1 + items.length;
  }
  if (unassigned.length) {
    pageByKey.set("chapter:unassigned", pageNumber);
    pageNumber += 1 + unassigned.length;
  }
  if (model.allowances.length) {
    pageByKey.set("schedule:allowances", pageNumber);
    pageNumber += Math.ceil(model.allowances.length / SCHEDULE_ROWS_PER_PAGE);
  }
  if (model.tbd.length) {
    pageByKey.set("schedule:tbd", pageNumber);
    pageNumber += Math.ceil(model.tbd.length / SCHEDULE_ROWS_PER_PAGE);
  }
  if (model.changes.length) {
    pageByKey.set("changes", pageNumber);
  }

  const rows: ContentsRow[] = contentsTargets.map((target) => ({
    label: target.label,
    pageNumber: pageByKey.get(target.key)!,
  }));
  const plan: PagePlanEntry[] = [{ kind: "cover", pageNumber: 1 }];
  const contentsChunks = chunks(rows, CONTENTS_ROWS_PER_PAGE);
  if (!contentsChunks.length) contentsChunks.push([]);
  contentsChunks.forEach((pageRows, index) => {
    plan.push({ kind: "contents", pageNumber: 2 + index, rows: pageRows });
  });

  let cursor = 2 + contentsPageCount;
  for (const chapter of model.chapters) {
    const items = chapterItems.get(chapter.id) ?? [];
    if (!items.length) continue;
    plan.push({
      kind: "chapter",
      pageNumber: cursor++,
      chapterId: chapter.id,
      name: chapter.name,
    });
    for (const item of items) {
      plan.push({ kind: "item", pageNumber: cursor++, item });
    }
  }
  if (unassigned.length) {
    plan.push({
      kind: "chapter",
      pageNumber: cursor++,
      chapterId: "unassigned",
      name: "Unassigned",
    });
    for (const item of unassigned) {
      plan.push({ kind: "item", pageNumber: cursor++, item });
    }
  }
  for (
    const [title, items] of [
      ["Allowances", model.allowances],
      ["To Be Determined", model.tbd],
    ] as const
  ) {
    for (const pageItems of chunks(items, SCHEDULE_ROWS_PER_PAGE)) {
      plan.push({
        kind: "schedule",
        pageNumber: cursor++,
        title,
        items: pageItems,
      });
    }
  }
  chunks(model.changes, CHANGE_ROWS_PER_PAGE).forEach((pageChanges, index) => {
    const start = index * CHANGE_ROWS_PER_PAGE;
    plan.push({
      kind: "changes",
      pageNumber: cursor++,
      start,
      end: start + pageChanges.length,
    });
  });
  return plan;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    color: "#2C2926",
    backgroundColor: "#FAF8F4",
    paddingTop: 50,
    paddingBottom: 46,
    paddingHorizontal: 50,
    fontSize: 9,
  },
  cover: {
    justifyContent: "center",
    alignItems: "center",
  },
  eyebrow: {
    color: "#8A735F",
    fontSize: 9,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 20,
  },
  coverTitle: {
    fontSize: 29,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 14,
  },
  coverProject: {
    fontSize: 16,
    color: "#5C4A3C",
    marginBottom: 38,
  },
  title: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 10,
  },
  muted: { color: "#6F665F" },
  rule: {
    height: 1,
    backgroundColor: "#D8D1C8",
    marginVertical: 12,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E2DD",
    paddingVertical: 7,
  },
  rowLabel: { flexGrow: 1 },
  rowPage: { width: 34, textAlign: "right", fontFamily: "Helvetica-Bold" },
  itemHeader: { marginBottom: 14 },
  itemCode: {
    color: "#8A735F",
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginBottom: 5,
  },
  itemName: { fontFamily: "Helvetica-Bold", fontSize: 20, marginBottom: 5 },
  itemMeta: { color: "#6F665F", fontSize: 9 },
  imageBox: {
    height: 230,
    borderWidth: 1,
    borderColor: "#D8D1C8",
    backgroundColor: "#F1EDE7",
    marginBottom: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  image: { width: "100%", height: "100%", objectFit: "contain" },
  fieldGrid: { flexDirection: "row", flexWrap: "wrap" },
  field: {
    width: "50%",
    paddingRight: 14,
    paddingBottom: 10,
  },
  fieldLabel: {
    color: "#8A735F",
    fontSize: 7,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  fieldValue: { fontSize: 10 },
  notes: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#F1EDE7",
  },
  configurationBlock: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#D8D1C8",
  },
  configurationRow: {
    flexDirection: "row",
    paddingVertical: 2,
  },
  configurationLabel: {
    width: 132,
    paddingRight: 10,
    color: "#8A735F",
    fontSize: 9,
  },
  configurationValue: { flexGrow: 1, fontSize: 9 },
  footer: {
    position: "absolute",
    left: 50,
    right: 50,
    bottom: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    color: "#8A817A",
    fontSize: 7,
  },
  badge: {
    borderWidth: 1,
    borderColor: "#BBAA9A",
    paddingVertical: 4,
    paddingHorizontal: 8,
    color: "#6F5847",
  },
});

function valueText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (
    typeof value === "string" || typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(valueText).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.na === true) {
      return `N/A${record.naReason ? ` — ${record.naReason}` : ""}`;
    }
    if ("value" in record) return valueText(record.value);
    return Object.values(record).map(valueText).filter(Boolean).join(", ");
  }
  return "";
}

const DIMENSION_AXES = ["width", "depth", "height"] as const;

function configurationDimensionsText(
  dimensions: Record<string, string | number | boolean>,
): string {
  const axes = DIMENSION_AXES
    .map((key) => dimensions[key])
    .filter((value) => value !== undefined && value !== "")
    .map(String);
  const unit = dimensions.unit ?? dimensions.units;
  const rest = Object.entries(dimensions)
    .filter(([key]) =>
      !DIMENSION_AXES.includes(key as typeof DIMENSION_AXES[number]) &&
      key !== "unit" && key !== "units"
    )
    .map(([key, value]) =>
      `${key.replace(/([A-Z])/g, " $1").toLowerCase()} ${value}`
    );
  const primary = axes.length
    ? [axes.join(" × "), unit === undefined ? "" : String(unit)]
      .filter(Boolean).join(" ")
    : "";
  return [primary, ...rest].filter(Boolean).join(" · ");
}

/** Client-edition selection summary rows: labels, never pricing. */
function configurationRows(
  configuration: AudienceConfigurationSummary,
  skipDimensions: boolean,
): Array<readonly [string, string]> {
  const rows: Array<readonly [string, string]> = [];
  if (configuration.variantName) {
    rows.push(["Variant", configuration.variantName]);
  }
  for (const selection of configuration.selections) {
    rows.push([selection.group, selection.value]);
  }
  if (configuration.components?.length) {
    rows.push([
      "Components",
      configuration.components
        .map((component) =>
          component.quantity > 1
            ? `${component.name} ×${component.quantity}`
            : component.name
        )
        .join(" · "),
    ]);
  }
  const dimensions = configuration.dimensions && !skipDimensions
    ? configurationDimensionsText(configuration.dimensions)
    : "";
  if (dimensions) rows.push(["Dimensions", dimensions]);
  if (configuration.comFabric) {
    rows.push(["COM fabric", configuration.comFabric]);
  }
  return rows;
}

function configurationBlock(item: AudienceItem) {
  if (!item.configuration) return null;
  // The spec sheet already prints a Dimensions field when the frozen spec
  // carries one; the configuration resolves to the same measurements, so
  // repeating them would read as a contradiction waiting to happen.
  const rows = configurationRows(
    item.configuration,
    Boolean(valueText(item.selection.dimensions).trim()),
  );
  if (!rows.length) return null;
  return h(
    View,
    { style: styles.configurationBlock },
    h(Text, { style: styles.fieldLabel }, "Selections"),
    ...rows.map(([label, value], index) =>
      h(
        View,
        { key: `${label}-${index}`, style: styles.configurationRow },
        h(Text, { style: styles.configurationLabel }, label),
        h(Text, { style: styles.configurationValue }, value),
      )
    ),
  );
}

function pageFooter(
  model: AudienceRenderModel,
  pageNumber: number,
  totalPages: number,
) {
  return h(
    View,
    { style: styles.footer, fixed: true },
    h(Text, null, `${model.book.title} · ${model.editionLabel}`),
    h(Text, null, `${pageNumber} / ${totalPages}`),
  );
}

function itemPage(
  model: AudienceRenderModel,
  item: AudienceItem,
  pageNumber: number,
  totalPages: number,
  imageData: ReadonlyMap<string, string>,
) {
  const firstImage = item.media
    .map((media) => imageData.get(renderMediaIdentity(media)))
    .find(Boolean);
  const fields = [
    ...Object.entries(item.selection),
    ...Object.entries(item.vendor).map(([key, value]) =>
      [`Vendor ${key}`, value] as const
    ),
    ...Object.entries(item.commercial).map(([key, value]) =>
      [
        key === "clientPriceCents" && typeof value === "number"
          ? "Client price"
          : key,
        key === "clientPriceCents" && typeof value === "number"
          ? `$${(value / 100).toFixed(2)}`
          : value,
      ] as const
    ),
  ].filter(([, value]) => valueText(value));
  return h(
    Page,
    {
      key: `item-${item.id}`,
      size: model.template.page.size,
      style: styles.page,
      wrap: false,
    },
    h(
      View,
      { style: styles.itemHeader },
      h(
        Text,
        { style: styles.itemCode },
        item.documentCode ?? "UNASSIGNED CODE",
      ),
      h(Text, { style: styles.itemName }, item.name),
      h(
        Text,
        { style: styles.itemMeta },
        [
          item.roomName,
          item.category,
          item.quantity === null ? null : `Quantity ${item.quantity}`,
        ].filter(
          Boolean,
        ).join("  ·  "),
      ),
    ),
    h(
      View,
      { style: styles.imageBox },
      firstImage
        ? h(Image, { src: firstImage, style: styles.image })
        : h(Text, { style: styles.muted }, "Image unavailable"),
    ),
    h(
      View,
      { style: styles.fieldGrid },
      ...fields.map(([label, value]) =>
        h(
          View,
          { key: String(label), style: styles.field },
          h(
            Text,
            { style: styles.fieldLabel },
            String(label).replace(/([A-Z])/g, " $1"),
          ),
          h(Text, { style: styles.fieldValue }, valueText(value)),
        )
      ),
    ),
    configurationBlock(item),
    Object.keys(item.notes).length
      ? h(
        View,
        { style: styles.notes },
        h(Text, { style: styles.fieldLabel }, "Notes"),
        ...Object.entries(item.notes).map(([key, value]) =>
          h(Text, { key }, `${key}: ${value}`)
        ),
      )
      : null,
    pageFooter(model, pageNumber, totalPages),
  );
}

function documentNode(
  model: AudienceRenderModel,
  imageData: ReadonlyMap<string, string>,
) {
  const plan = buildPagePlan(model);
  const totalPages = plan.length;
  const metadataDate = new Date(model.issue.createdAt);
  const pages = plan.map((entry) => {
    if (entry.kind === "cover") {
      return h(
        Page,
        {
          key: "cover",
          size: model.template.page.size,
          style: [styles.page, styles.cover],
          wrap: false,
        },
        h(Text, { style: styles.eyebrow }, model.editionLabel),
        h(Text, { style: styles.coverTitle }, model.book.title),
        h(Text, { style: styles.coverProject }, model.project.name),
        h(
          Text,
          { style: styles.badge },
          `${model.issue.type.toUpperCase()} · REVISION ${model.issue.revisionNumber}`,
        ),
        model.template.branding.studioName
          ? h(
            Text,
            { style: [styles.muted, { marginTop: 36 }] },
            model.template.branding.studioName,
          )
          : null,
        pageFooter(model, entry.pageNumber, totalPages),
      );
    }
    if (entry.kind === "contents") {
      return h(
        Page,
        {
          key: `contents-${entry.pageNumber}`,
          size: model.template.page.size,
          style: styles.page,
          wrap: false,
        },
        h(Text, { style: styles.title }, "Contents"),
        ...entry.rows.map((row) =>
          h(
            View,
            { key: `${row.label}-${row.pageNumber}`, style: styles.row },
            h(Text, { style: styles.rowLabel }, row.label),
            h(Text, { style: styles.rowPage }, row.pageNumber),
          )
        ),
        pageFooter(model, entry.pageNumber, totalPages),
      );
    }
    if (entry.kind === "chapter") {
      return h(
        Page,
        {
          key: `chapter-${entry.chapterId}`,
          size: model.template.page.size,
          style: [styles.page, styles.cover],
          wrap: false,
        },
        h(Text, { style: styles.eyebrow }, "Room"),
        h(Text, { style: styles.coverTitle }, entry.name),
        pageFooter(model, entry.pageNumber, totalPages),
      );
    }
    if (entry.kind === "item") {
      return itemPage(
        model,
        entry.item,
        entry.pageNumber,
        totalPages,
        imageData,
      );
    }
    if (entry.kind === "schedule") {
      return h(
        Page,
        {
          key: `${entry.title}-${entry.pageNumber}`,
          size: model.template.page.size,
          style: styles.page,
          wrap: false,
        },
        h(Text, { style: styles.title }, entry.title),
        ...entry.items.map((item) =>
          h(
            View,
            { key: item.id, style: styles.row },
            h(
              Text,
              { style: [{ width: 72 }, styles.muted] },
              item.documentCode ?? "—",
            ),
            h(Text, { style: styles.rowLabel }, item.name),
            h(
              Text,
              { style: { width: 48, textAlign: "right" } },
              item.quantity === null ? "" : `Qty ${item.quantity}`,
            ),
          )
        ),
        pageFooter(model, entry.pageNumber, totalPages),
      );
    }
    const changes = model.changes.slice(entry.start, entry.end);
    return h(
      Page,
      {
        key: `changes-${entry.pageNumber}`,
        size: model.template.page.size,
        style: styles.page,
        wrap: false,
      },
      h(Text, { style: styles.title }, "Revision Changes"),
      model.issue.reason
        ? h(
          Text,
          { style: [styles.muted, { marginBottom: 14 }] },
          model.issue.reason,
        )
        : null,
      ...changes.map((change) =>
        h(
          View,
          { key: `${change.kind}-${change.id}`, style: styles.row },
          h(
            Text,
            { style: [{ width: 70 }, styles.muted] },
            change.documentCode ?? "—",
          ),
          h(Text, { style: styles.rowLabel }, change.name),
          h(Text, { style: styles.badge }, change.kind.toUpperCase()),
        )
      ),
      pageFooter(model, entry.pageNumber, totalPages),
    );
  });

  return h(
    Document,
    {
      title: `${model.book.title} — ${model.editionLabel}`,
      author: model.template.branding.studioName ?? "Patina",
      subject: `${model.issue.type} revision ${model.issue.revisionNumber}`,
      creator: "Patina Spec Books",
      producer: "Patina Spec Books",
      creationDate: metadataDate,
      modificationDate: metadataDate,
      language: "en-US",
      pdfVersion: "1.7",
    },
    ...pages,
  );
}

export async function renderSpecBookPdf(
  model: AudienceRenderModel,
  imageData: ReadonlyMap<string, string> = new Map(),
): Promise<Uint8Array> {
  const buffer = await renderToBuffer(documentNode(model, imageData));
  return new Uint8Array(buffer);
}
