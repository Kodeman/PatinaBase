/**
 * Public piece route (SP-03).
 *
 * A homeowner sharing a chair with her husband handed him a sheet titled
 * "Patina Designer Portal" / "app.patina.cloud" — the designer portal's Library
 * route, whose Open Graph title is the portal. There was no client-facing piece
 * route anywhere. This is it: the title is the piece and its maker, and with the
 * app installed the universal link (see the AASA route beside this one) opens on
 * the piece instead.
 *
 * No session. The read goes through the ANON client, so the gate is the RLS
 * policy `products_catalog_select_anon` (00152:298, `layer = 'catalog'`) rather
 * than a service key — a page that must be readable by a stranger should be
 * enforced as such, not trusted to remember a filter.
 *
 * Deliberately NOT filtered on `status`: `get_recommendations` does not filter
 * on it either, so every piece the app can show and share must resolve here, or
 * the share is a dead link.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@patina/supabase/client";
import {
  pieceMetadata,
  toPieceView,
  type PieceRow,
  type PieceView,
} from "./piece-content";

// Catalog rows change under us; the OG card must not be baked at build time.
export const dynamic = "force-dynamic";

const PIECE_SELECT =
  "id, name, brand, description, price_retail, images, dimensions, lead_time_weeks, vendors(name)";

async function loadPiece(id: string): Promise<PieceView | null> {
  // A malformed id would be a 22P02 from Postgres; treat it as "no such piece"
  // rather than an error page, and never say whether an id ever existed.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .select(PIECE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return toPieceView(data as unknown as PieceRow);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const piece = await loadPiece(id);
  if (!piece) {
    return { title: "Piece not found" };
  }
  return pieceMetadata(piece);
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 border-t border-[var(--border-subtle,#e7e2da)] py-3">
      <dt className="type-body-small text-[var(--text-muted,#8a8175)]">
        {label}
      </dt>
      <dd className="type-body-small text-right text-[var(--text-primary,#221f1a)]">
        {value}
      </dd>
    </div>
  );
}

export default async function PiecePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const piece = await loadPiece(id);
  if (!piece) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      {piece.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={piece.imageUrl}
          alt={piece.name}
          className="mb-8 w-full rounded-sm object-cover"
        />
      ) : null}

      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.6rem",
          fontWeight: 400,
        }}
        className="text-[var(--text-primary,#221f1a)]"
      >
        {piece.name}
      </h1>

      {/* Each of these is omitted entirely when its column is null — a piece
          says what it is, and says nothing about what nobody has recorded. */}
      {piece.maker ? (
        <p className="type-body-small mt-1 text-[var(--text-muted,#8a8175)]">
          by {piece.maker}
        </p>
      ) : null}

      {piece.price ? (
        <p className="type-body mt-4 text-[var(--text-primary,#221f1a)]">
          {piece.price}
        </p>
      ) : null}

      {piece.blurb ? (
        <p className="type-body mt-6 text-[var(--text-primary,#221f1a)]">
          {piece.blurb}
        </p>
      ) : null}

      {piece.size ? (
        <dl className="mt-8">
          <SpecRow label="Size" value={piece.size} />
        </dl>
      ) : null}

      {/* The sentence alone (SP-10). "Lead time · Ships in about 10 weeks"
          labelled the sentence with its own subject. */}
      {piece.leadTime ? (
        <p className="type-body-small mt-6 text-[var(--text-muted,#8a8175)]">
          {piece.leadTime}
        </p>
      ) : null}

      <a
        href={piece.appLink}
        className="type-body-small mt-10 inline-block underline text-[var(--text-primary,#221f1a)]"
      >
        Open in Patina
      </a>
    </main>
  );
}
