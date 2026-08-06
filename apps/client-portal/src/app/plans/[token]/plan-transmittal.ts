import "server-only";

import { createServiceClient } from "@patina/supabase/server";

export const PLAN_TRANSMITTAL_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
export const PLAN_SIGNED_URL_TTL_SECONDS = 120;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const REV_LETTER_PATTERN = /^[A-Z]{1,2}$/;
const PLAN_PURPOSES = new Set([
  "pricing",
  "production",
  "information",
  "record",
] as const);

export type PlanTransmittalPurpose =
  | "pricing"
  | "production"
  | "information"
  | "record";

export interface ResolvedPlanSheet {
  printId: string;
  number: string;
  title: string;
  revLetter: string;
  revDate: string;
  sha256: string;
  sizeBytes: number | null;
  isCurrent: boolean;
}

export interface ResolvedPlanTransmittal {
  studioName: string;
  recipientName: string;
  recipientCompany: string | null;
  purpose: PlanTransmittalPurpose;
  sentAt: string;
  projectLabel: string;
  issueName: string;
  issueDate: string;
  setSha256: string;
  isCurrentSet: boolean;
  supersededByName: string | null;
  supersededAt: string | null;
  sheets: ResolvedPlanSheet[];
}

export interface PlanSignedPrint {
  signedUrl: string;
}

type ServiceClient = ReturnType<typeof createServiceClient>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

// The resolver's contract is metadata-only: printId is the ONLY uuid it may
// carry, and never a storage location. A payload that smuggles one in — under
// any key spelling, at any depth — is not the contract and dies whole.
function carriesStoragePath(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(carriesStoragePath);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, entry]) =>
      key === "storage_path" || key === "storagePath" || carriesStoragePath(entry),
  );
}

function parseResolvedSheet(value: unknown): ResolvedPlanSheet | null {
  if (!isRecord(value)) return null;

  const { printId, number, title, revLetter, revDate, sha256, sizeBytes, isCurrent } =
    value;

  if (
    typeof printId !== "string" ||
    !UUID_PATTERN.test(printId) ||
    typeof number !== "string" ||
    number.trim().length === 0 ||
    typeof title !== "string" ||
    title.trim().length === 0 ||
    typeof revLetter !== "string" ||
    !REV_LETTER_PATTERN.test(revLetter) ||
    !isIsoDate(revDate) ||
    typeof sha256 !== "string" ||
    !SHA256_PATTERN.test(sha256) ||
    (sizeBytes !== null &&
      (typeof sizeBytes !== "number" ||
        !Number.isSafeInteger(sizeBytes) ||
        sizeBytes < 0)) ||
    typeof isCurrent !== "boolean"
  ) {
    return null;
  }

  return {
    printId,
    number: number.trim(),
    title: title.trim(),
    revLetter,
    revDate,
    sha256,
    sizeBytes: sizeBytes as number | null,
    isCurrent,
  };
}

function parseResolvedTransmittal(value: unknown): ResolvedPlanTransmittal | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!isRecord(candidate)) return null;
  if (carriesStoragePath(candidate)) return null;

  const {
    studioName,
    recipientName,
    recipientCompany,
    purpose,
    sentAt,
    projectLabel,
    issueName,
    issueDate,
    setSha256,
    isCurrentSet,
    supersededByName,
    supersededAt,
    sheets,
  } = candidate;

  if (
    typeof studioName !== "string" ||
    studioName.trim().length === 0 ||
    typeof recipientName !== "string" ||
    recipientName.trim().length === 0 ||
    (recipientCompany !== null && typeof recipientCompany !== "string") ||
    typeof purpose !== "string" ||
    !PLAN_PURPOSES.has(purpose as PlanTransmittalPurpose) ||
    !isIsoDate(sentAt) ||
    typeof projectLabel !== "string" ||
    projectLabel.trim().length === 0 ||
    typeof issueName !== "string" ||
    issueName.trim().length === 0 ||
    !isIsoDate(issueDate) ||
    typeof setSha256 !== "string" ||
    !SHA256_PATTERN.test(setSha256) ||
    typeof isCurrentSet !== "boolean" ||
    (supersededByName !== null && typeof supersededByName !== "string") ||
    (supersededAt !== null && !isIsoDate(supersededAt)) ||
    !Array.isArray(sheets) ||
    sheets.length === 0
  ) {
    return null;
  }

  // A current set has by definition not been superseded; a payload claiming
  // both at once is not the resolver speaking.
  if (isCurrentSet && (supersededByName !== null || supersededAt !== null)) {
    return null;
  }

  const parsedSheets: ResolvedPlanSheet[] = [];
  for (const sheet of sheets) {
    const parsed = parseResolvedSheet(sheet);
    if (!parsed) return null;
    parsedSheets.push(parsed);
  }

  return {
    studioName: studioName.trim(),
    recipientName: recipientName.trim(),
    recipientCompany,
    purpose: purpose as PlanTransmittalPurpose,
    sentAt,
    projectLabel: projectLabel.trim(),
    issueName: issueName.trim(),
    issueDate,
    setSha256,
    isCurrentSet,
    supersededByName,
    supersededAt,
    sheets: parsedSheets,
  };
}

export async function resolvePlanTransmittal(
  token: string,
  client?: ServiceClient,
): Promise<ResolvedPlanTransmittal | null> {
  if (!PLAN_TRANSMITTAL_TOKEN_PATTERN.test(token)) return null;

  try {
    const admin = client ?? createServiceClient();
    const { data, error } = await admin.rpc("resolve_plan_transmittal", {
      p_token: token,
    });
    if (error) return null;
    return parseResolvedTransmittal(data);
  } catch {
    return null;
  }
}

function singleRowQuery<T>(
  client: ServiceClient,
  table: "plan_prints" | "project_documents",
  columns: string,
  id: string,
): Promise<{ data: T | null; error: unknown }> {
  return client
    .from(table)
    .select(columns)
    .eq("id", id)
    .maybeSingle() as unknown as Promise<{ data: T | null; error: unknown }>;
}

interface PlanPrintRow {
  id: string;
  project_document_id: string | null;
  sheet_id: string | null;
}

interface ProjectDocumentRow {
  id: string;
  storage_path: string | null;
  doc_type: string;
  status: string | null;
}

export async function signResolvedPlanPrint(
  token: string,
  printId: string,
  download: boolean,
  client?: ServiceClient,
): Promise<PlanSignedPrint | null> {
  if (!PLAN_TRANSMITTAL_TOKEN_PATTERN.test(token)) return null;

  try {
    const admin = client ?? createServiceClient();
    // Always re-resolved: a link revoked between page load and click must die
    // here, so a previously rendered page is never trusted as a capability.
    const transmittal = await resolvePlanTransmittal(token, admin);
    if (!transmittal) return null;

    const sheet = transmittal.sheets.find((entry) => entry.printId === printId);
    if (!sheet) return null;

    const { data: print, error: printError } = await singleRowQuery<PlanPrintRow>(
      admin,
      "plan_prints",
      "id, project_document_id, sheet_id",
      sheet.printId,
    );
    if (
      printError ||
      !print ||
      print.id !== sheet.printId ||
      !print.project_document_id ||
      !print.sheet_id
    ) {
      return null;
    }

    const { data: document, error: documentError } =
      await singleRowQuery<ProjectDocumentRow>(
        admin,
        "project_documents",
        "id, storage_path, doc_type, status",
        print.project_document_id,
      );
    if (
      documentError ||
      !document ||
      document.id !== print.project_document_id ||
      !document.storage_path ||
      document.status !== "ready"
    ) {
      return null;
    }

    const options = download
      ? {
          download: `${`${sheet.number} Rev ${sheet.revLetter}`
            .replace(/[^\w .()-]+/g, "")
            .trim() || "drawing"}.pdf`,
        }
      : undefined;
    const { data: signed, error: signedError } = await admin.storage
      .from("project-documents")
      .createSignedUrl(
        document.storage_path,
        PLAN_SIGNED_URL_TTL_SECONDS,
        options,
      );
    if (signedError || !signed?.signedUrl) return null;

    return { signedUrl: signed.signedUrl };
  } catch {
    return null;
  }
}
