"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui/controls";
import {
  useCommercialDocument,
  useCountersignDesignServicesAgreement,
  useReplayCommercialNotification,
} from "@/hooks/use-commercial-documents";
import { commercialStatusView } from "@/lib/document/commercial-documents";
import { rememberRoomOrigin } from "@/lib/document/room-origin";
import { DocumentAction, DocumentActionGroup } from "../document-action";
import { DocSheet } from "../overlays/doc-sheet";
import { RecordOnPaperSheet } from "./record-on-paper-sheet";
import { ServiceAgreementPreview } from "./service-agreement-preview";
import { ServiceAgreementSendSheet } from "./service-agreement-send-sheet";

const toneColor = {
  quiet: "var(--text-muted)",
  clay: "var(--color-clay)",
  golden: "var(--color-golden-hour)",
  sage: "var(--color-sage)",
  terracotta: "var(--color-terracotta)",
};

export function ServiceAgreementInstruments({
  proposal,
  clientName,
}: {
  proposal: any;
  clientName: string;
}) {
  const proposalId = String(proposal.id);
  const router = useRouter();
  const pathname = usePathname();
  const bundle = useCommercialDocument(proposalId);
  const countersign = useCountersignDesignServicesAgreement(proposalId);
  const replayNotification = useReplayCommercialNotification();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [recordOnPaperOpen, setRecordOnPaperOpen] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [resultProjectId, setResultProjectId] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  if (bundle.isLoading) {
    return (
      <p className="mt-2 text-[11.5px] italic text-[var(--text-muted)]">
        Reading the agreement…
      </p>
    );
  }
  if (bundle.error || !bundle.data) {
    return (
      <p className="mt-2 text-[11.5px] text-[var(--color-terracotta)]">
        Agreement status unavailable.
      </p>
    );
  }

  const { document, terms, rates, signatures } = bundle.data;
  const clientSignedOnPaper = signatures.some(
    (signature) => signature.party === "client" && signature.executedOnPaper,
  );
  const status = commercialStatusView(document.state, { clientSignedOnPaper });
  const projectId = resultProjectId ?? document.projectId;
  const clientEmail =
    typeof proposal.client?.email === "string" ? proposal.client.email : null;

  const enterDrafting = () => {
    rememberRoomOrigin(pathname);
    router.push(`/drafting/${proposalId}`);
  };
  const submitCountersign = async () => {
    setResultMessage(null);
    try {
      const result = await countersign.mutateAsync(signerName);
      setResultProjectId(result.projectId);
      const executionMessage = result.newlyExecuted
        ? "Agreement executed. The project and billing authority are now active."
        : "The existing execution was verified; no duplicate project or authority was created.";
      setResultMessage(
        result.notificationDelivery === "pending_retry"
          ? `${executionMessage} The execution notice is pending; retry it below.`
          : executionMessage,
      );
    } catch (error) {
      setResultMessage(
        error instanceof Error
          ? error.message
          : "The studio signature could not be recorded.",
      );
    }
  };

  return (
    <>
      <DocumentActionGroup
        surfaceKey="open-document"
        regionKey="design-agreement-actions"
        className="mt-2 !block"
        aria-label="Design agreement actions"
      >
        <div
          className="border-l-[3px] bg-[rgba(229,221,208,0.28)] px-4 py-3.5"
          style={{ borderLeftColor: toneColor[status.tone] }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p
                className="font-mono text-[9px] uppercase tracking-[0.1em]"
                style={{ color: toneColor[status.tone] }}
              >
                {status.label}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-charcoal)]">
                {status.description}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {document.state === "draft" && (
                <DocumentAction
                  actionKey="edit-design-agreement"
                  variant="primary"
                  trailing="→"
                  onClick={enterDrafting}
                >
                  Open the Drafting Room
                </DocumentAction>
              )}
              {document.state === "draft" && (
                <DocumentAction
                  actionKey="send-design-agreement"
                  variant="secondary"
                  onClick={() => setSendOpen(true)}
                >
                  Review & send
                </DocumentAction>
              )}
              <DocumentAction
                actionKey="preview-design-agreement"
                variant="secondary"
                onClick={() => setPreviewOpen(true)}
              >
                Preview client copy
              </DocumentAction>
              {status.isExecuted && projectId && (
                <DocumentAction
                  actionKey="open-authorized-project"
                  variant="primary"
                  trailing="→"
                  href={`/doc/${projectId}`}
                >
                  Open the project
                </DocumentAction>
              )}
              {status.isExecuted && (
                <DocumentAction
                  actionKey="replay-execution-notice"
                  variant="secondary"
                  disabled={replayNotification.isPending}
                  onClick={async () => {
                    setResultMessage(null);
                    const delivery = await replayNotification.mutateAsync({
                      documentId: proposalId,
                      transition: "executed",
                    });
                    setResultMessage(
                      delivery === "delivered"
                        ? "The execution notice is confirmed."
                        : "The agreement remains executed, but its notice is still pending. You can retry safely.",
                    );
                  }}
                >
                  {replayNotification.isPending
                    ? "Checking execution notice…"
                    : "Resend execution notice"}
                </DocumentAction>
              )}
            </div>
          </div>

          {document.state === "sent" && (
            <div className="mt-4 border-t border-[var(--doc-ink-border)] pt-3">
              <p className="font-heading text-[1rem] italic text-[var(--color-charcoal)]">
                Record a paper signature
              </p>
              <p className="mt-1 text-[11.5px] text-[var(--text-muted)]">
                For a client who signed a printed copy instead of signing
                here — countersign as usual once it&rsquo;s recorded.
              </p>
              <div className="mt-3">
                <DocumentAction
                  actionKey="open-record-design-agreement-on-paper"
                  variant="secondary"
                  onClick={() => setRecordOnPaperOpen(true)}
                >
                  Record signed on paper
                </DocumentAction>
              </div>
            </div>
          )}

          {status.canCountersign && (
            <div className="mt-4 border-t border-[var(--doc-ink-border)] pt-3">
              <p className="font-heading text-[1rem] italic text-[var(--color-charcoal)]">
                Countersign for the studio
              </p>
              <p className="mt-1 text-[11.5px] text-[var(--text-muted)]">
                This final act creates one project and one billing authority. It
                is safe to retry.
              </p>
              <div className="mt-3 flex max-w-xl flex-col gap-2 sm:flex-row">
                <Input
                  aria-label="Studio signer name"
                  value={signerName}
                  onChange={(event) => setSignerName(event.target.value)}
                  placeholder="Your full name"
                />
                <Button
                  className="shrink-0"
                  disabled={!signerName.trim()}
                  loading={countersign.isPending}
                  onClick={() => void submitCountersign()}
                >
                  Countersign agreement
                </Button>
              </div>
            </div>
          )}

          {resultMessage && (
            <p
              role="status"
              className="mt-3 text-[11.5px] text-[var(--color-mocha)]"
            >
              {resultMessage}
              {resultProjectId && (
                <button
                  type="button"
                  className="ml-2 underline underline-offset-4"
                  onClick={() => router.push(`/doc/${resultProjectId}`)}
                >
                  Open the project →
                </button>
              )}
            </p>
          )}
        </div>
      </DocumentActionGroup>

      {terms && (
        <>
          <DocSheet
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            title="Client copy preview"
          >
            <ServiceAgreementPreview
              document={document}
              terms={terms}
              rates={rates}
              signatures={signatures}
              clientName={clientName}
            />
          </DocSheet>
          <ServiceAgreementSendSheet
            open={sendOpen}
            onClose={() => setSendOpen(false)}
            document={document}
            terms={terms}
            rates={rates}
            recipientEmail={clientEmail}
            recipientName={clientName}
          />
        </>
      )}

      <RecordOnPaperSheet
        kind="design-services"
        proposalId={proposalId}
        clientName={clientName}
        open={recordOnPaperOpen}
        onClose={() => setRecordOnPaperOpen(false)}
        onRecorded={() => {
          setRecordOnPaperOpen(false);
          setResultMessage(
            "Paper signature recorded. Countersign it above once you’re ready.",
          );
        }}
      />
    </>
  );
}
