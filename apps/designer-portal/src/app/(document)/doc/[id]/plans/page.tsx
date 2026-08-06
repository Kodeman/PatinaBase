"use client";

import { use } from "react";
import { PlanRoomWorkspace } from "@/components/document/plans/plan-room-workspace";

export default function PlanRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <PlanRoomWorkspace routeId={id} />;
}
