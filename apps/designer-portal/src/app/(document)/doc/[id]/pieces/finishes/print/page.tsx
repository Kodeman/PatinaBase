"use client";

/**
 * The painter's print (US-21 T-57; S8, D16, Q10; CONTRACT §3.4): the paint
 * and finish schedule, one page per room, addressed to the painter. Each
 * page carries the job, the room and its finishes, `SURFACE · PRODUCT ·
 * SHEEN · SWATCH`. Nothing else prints on it.
 *
 * It prints with the `#…-print-root` visibility pattern the invoice print
 * uses (`app/invoices/[invoiceId]/print`), which out-specifies globals.css's
 * `@media print { body * { visibility: hidden } }`.
 */

import { use, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useProjectPalettes } from "@patina/supabase";
import {
  finishesPrintHref,
  roomFinishesByRoom,
} from "@/components/document/pieces/finishes-lens";
import {
  FinishSwatch,
  swatchLabel,
} from "@/components/document/pieces/finish-swatch";
import { useDocumentRooms } from "@/hooks/use-document-rooms";
import { useDocumentEngagement } from "@/hooks/use-document-state";
import { buildRoomHref } from "@/lib/document/pieces/build-room-url";

export default function FinishesPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <FinishesPrint docId={id} />;
}

const HEAD_CELL =
  "border-b border-[var(--ink)] py-2 pr-4 text-left font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink)]";
const CELL =
  "border-b border-[var(--hairline-strong)] py-3 pr-4 align-middle text-[14px] text-[var(--ink)]";
const BACK_CLS =
  "inline-flex min-h-[44px] items-center font-mono text-[12px] font-medium uppercase tracking-[0.06em] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clay-ink)]";

function FinishesPrint({ docId }: { docId: string }) {
  const router = useRouter();
  // The place the lens was in, so `← Back to Finishes` lands there again.
  const room = useSearchParams()?.get("room")?.trim() || null;
  const { data: resolution } = useDocumentEngagement(docId);
  const row = resolution?.kind === "engagement" ? resolution.row : null;
  const projectId = row?.project_id ?? null;
  const { data: rooms } = useDocumentRooms(projectId);
  const { data: palettes } = useProjectPalettes(projectId ?? "");

  // An activated proposal's or accepted lead's id answers at its project (R6, F1).
  useEffect(() => {
    if (resolution?.kind !== "redirect") return;
    router.replace(finishesPrintHref(resolution.projectId, room));
  }, [resolution, router, room]);

  const pages = useMemo(() => {
    const byRoom = roomFinishesByRoom(palettes);
    return (rooms ?? [])
      .map((room) => ({ room, finishes: byRoom.get(room.id) ?? [] }))
      .filter((page) => page.finishes.length > 0);
  }, [rooms, palettes]);

  const backHref = buildRoomHref(docId, { lens: "finishes", room });

  // Still finding the document, or on the way to its project.
  if (resolution == null || resolution.kind === "redirect") {
    return <main aria-busy="true" />;
  }

  if (!row || !projectId) {
    return (
      <main className="mx-auto max-w-[56ch] px-6 py-12 text-[14px] leading-[1.5] text-[var(--ink)]">
        <p>
          {row
            ? "The paint and finish schedule is kept on a project. This document has none yet."
            : "No document answers to this name, so there is no schedule to print."}
        </p>
        <a
          href={row ? `/doc/${docId}` : "/desk"}
          className={`mt-3 ${BACK_CLS}`}
        >
          {row ? "← Back to the document" : "← Back to the desk"}
        </a>
      </main>
    );
  }

  return (
    <div
      id="finishes-print-root"
      className="fixed inset-0 z-[60] overflow-auto bg-[var(--paper-doc,#FFFFFF)] text-[var(--ink)]"
    >
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #finishes-print-root, #finishes-print-root * { visibility: visible; }
          #finishes-print-root {
            position: absolute !important;
            inset: auto !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            overflow: visible !important;
            background: #FFFFFF !important;
          }
          .finishes-print-toolbar { display: none !important; }
          .finishes-print-page { break-after: page; }
          .finishes-print-page:last-child { break-after: auto; }
          .finishes-print-page svg { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          @page { margin: 0.75in; }
        }
      `}</style>

      <div className="finishes-print-toolbar sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--hairline-strong)] bg-[var(--paper-doc,#FFFFFF)] px-6 py-2">
        <a href={backHref} className={BACK_CLS}>
          ← Back to Finishes
        </a>
        {pages.length > 0 && (
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-[44px] items-center font-mono text-[12px] font-medium uppercase tracking-[0.06em] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clay-ink)]"
          >
            Print
          </button>
        )}
      </div>

      {rooms && palettes && pages.length === 0 ? (
        <p className="mx-auto max-w-[56ch] px-6 py-12 text-[14px] leading-[1.5]">
          No finishes are noted yet. Note each room’s surfaces in the Finishes
          lens, then print them here.
        </p>
      ) : (
        <div className="mx-auto max-w-[760px] px-6 py-8">
          {pages.map(({ room, finishes }) => (
            <section
              key={room.id}
              data-testid="finishes-print-page"
              aria-label={`${room.name}, for the painter`}
              className="finishes-print-page mb-16"
            >
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--ink-faint)]">
                Paint and finish schedule · For the painter
              </p>
              <p className="mt-1 text-[14px]">{row.title}</p>
              <h1 className="mt-4 font-heading text-[28px] italic leading-[1.2]">
                {room.name}
              </h1>
              <table className="mt-6 w-full border-collapse">
                <thead>
                  <tr>
                    <th scope="col" className={HEAD_CELL}>
                      Surface
                    </th>
                    <th scope="col" className={HEAD_CELL}>
                      Product
                    </th>
                    <th scope="col" className={HEAD_CELL}>
                      Sheen
                    </th>
                    <th scope="col" className={HEAD_CELL}>
                      Swatch
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {finishes.map((finish, index) => (
                    <tr key={index}>
                      {/* An emptied surface prints a dash, as every empty cell does. */}
                      <td className={CELL}>{finish.surface || "—"}</td>
                      <td className={CELL}>{finish.product ?? "—"}</td>
                      <td className={CELL}>{finish.sheen ?? "—"}</td>
                      <td className={CELL}>
                        {/* The hex prints beside the swatch: it survives a black-and-white print. */}
                        <span className="flex items-center gap-2">
                          <span className="text-[var(--ink-faint)]">
                            <FinishSwatch
                              hex={finish.hex}
                              label={swatchLabel(finish)}
                            />
                          </span>
                          <span className="font-mono text-[12px] uppercase">
                            {finish.hex ?? "—"}
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
