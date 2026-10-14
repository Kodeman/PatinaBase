import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../');
const inventory: Record<string, string[]> = {
  'packages/supabase/src/hooks/use-outbound-drafts.ts': ['useSendOutboundDrafts'],
  'packages/supabase/src/hooks/use-invoices.ts': ['useIssueInvoice', 'useRecordPayment', 'useSendInvoice', 'useChaseInvoice', 'useVoidInvoice', 'useUpsertLineItems', 'useDeleteLineItem'],
  'packages/supabase/src/hooks/use-procurement.ts': ['useRecordVendorPayment', 'useLogPaymentPaid', 'useVoidVendorPayment', 'useSendPurchaseOrder'],
  'packages/supabase/src/hooks/use-buying-phase2.ts': ['useReleasePurchaseOrder', 'useSendBackPurchaseOrder', 'useSendProcurementDraft', 'useAddInvoiceBillingLines'],
  'packages/supabase/src/hooks/use-project-v2.ts': ['useSetFfeLineCommercials'],
  'packages/supabase/src/hooks/use-time-tracking.ts': ['useStopTimer'],
  'packages/supabase/src/hooks/use-plan-room.ts': ['useCreatePlanIssue', 'useCreatePlanTransmittal', 'useReissuePlanTransmittalLink'],
  'packages/supabase/src/hooks/use-party-sms.ts': ['useSendPartySms'],
  'packages/supabase/src/hooks/use-trade-agreements.ts': ['useSendTradeAgreement'],
  'packages/supabase/src/hooks/use-proposals.ts': ['useSendProposal', 'useRetryProposalSend'],
  'packages/supabase/src/hooks/use-scope-changes.ts': ['useSendScopeChangeRequest'],
  'packages/supabase/src/hooks/use-project-notes.ts': ['useSendProjectNote'],
  'packages/supabase/src/hooks/use-decisions.ts': ['useSendDecisionReminder'],
  'packages/supabase/src/hooks/use-clients.ts': ['useSendClientMessage'],
  'packages/supabase/src/hooks/use-campaigns.ts': ['useSendCampaign'],
  'packages/supabase/src/hooks/use-companion.ts': ['useSendCompanionMessage'],
  'apps/designer-portal/src/hooks/use-orders.ts': ['useCreatePaymentIntent', 'useConfirmPayment'],
  'apps/designer-portal/src/hooks/use-amendments.ts': ['useSendAmendment'],
  'apps/designer-portal/src/hooks/use-commercial-documents.ts': ['useSendServiceAgreement', 'useReleaseForAuthorization', 'useSendFurnishingsAuthorization', 'useSendTradeScope', 'useIssueTradeDrawInvoice', 'useSendTradeRfq'],
  'apps/designer-portal/src/hooks/use-account-page.ts': ['useGenerateMilestoneInvoice'],
};

const propertyNamed = (object: ts.ObjectLiteralExpression | undefined, name: string) =>
  object?.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) &&
      (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
      property.name.text === name,
  );

function mutationOptions(source: string, functionName: string) {
  const sf = ts.createSourceFile('hook.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const fn = sf.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === functionName,
  );
  let options: ts.ObjectLiteralExpression | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'useMutation' &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) options = node.arguments[0];
    ts.forEachChild(node, visit);
  };
  if (fn?.body) visit(fn.body);
  return options;
}

describe('send and money mutation retry policy', () => {
  for (const [sourcePath, hookNames] of Object.entries(inventory)) {
    const source = fs.readFileSync(path.join(repoRoot, sourcePath), 'utf8');
    for (const hookName of hookNames) {
      it(`${hookName} never retries automatically`, () => {
        const retry = propertyNamed(mutationOptions(source, hookName), 'retry')?.initializer;
        expect(retry?.kind === ts.SyntaxKind.FalseKeyword).toBe(true);
      });

      // US-34 N12a (PQ15) — the portal's MutationCache refuses a tagged act
      // before any call while offline; an untagged one would pause and fire
      // on reconnect (O3).
      it(`${hookName} is tagged as a send or money act`, () => {
        const meta = propertyNamed(mutationOptions(source, hookName), 'meta')?.initializer;
        const act =
          meta && ts.isObjectLiteralExpression(meta) ? propertyNamed(meta, 'act')?.initializer : undefined;
        expect(act && ts.isStringLiteral(act) ? act.text : null).toMatch(/^(send|money)$/);
      });
    }
  }
});
