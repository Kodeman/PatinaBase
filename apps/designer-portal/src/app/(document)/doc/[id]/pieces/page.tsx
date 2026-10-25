"use client";

import { Suspense, use, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BuildRoom } from "@/components/document/pieces/build-room";
import { PiecesSkeleton } from "@/components/loading";
import { useCanSeeMargin } from "@/hooks/use-can-see-margin";
import {
  buildRoomHref,
  buildRoomReturnHref,
  parseBuildRoomSearch,
  type BuildRoomState,
} from "@/lib/document/pieces/build-room-url";

export default function BuildRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense fallback={<PiecesSkeleton />}>
      <BuildRoomRoute docId={id} />
    </Suspense>
  );
}

function BuildRoomRoute({ docId }: { docId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canSeeMoney = useCanSeeMargin();
  const { lens, room } = parseBuildRoomSearch(searchParams, { canSeeMoney });
  const navigate = useCallback(
    (next: BuildRoomState) => router.push(buildRoomHref(docId, next)),
    [router, docId],
  );
  const leave = useCallback(
    () => router.push(buildRoomReturnHref(docId, room)),
    [router, docId, room],
  );
  const redirect = useCallback(
    (projectId: string) =>
      router.replace(buildRoomHref(projectId, { lens, room })),
    [router, lens, room],
  );
  return (
    <BuildRoom
      docId={docId}
      lens={lens}
      room={room}
      line={searchParams.get("line") ?? searchParams.get("ffeItemId")}
      canSeeMoney={canSeeMoney}
      onNavigate={navigate}
      onReturn={leave}
      onRedirect={redirect}
    />
  );
}
