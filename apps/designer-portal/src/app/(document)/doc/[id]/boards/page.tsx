"use client";

import { use } from "react";
import { ProjectBoardsView } from "@/components/document/boards/project-boards-view";

export default function ProjectBoardsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ProjectBoardsView routeId={id} />;
}
