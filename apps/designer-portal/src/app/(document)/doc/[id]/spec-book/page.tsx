"use client";

import { use } from "react";
import { SpecBookWorkspace } from "@/components/document/spec-books/spec-book-workspace";

export default function SpecBookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <SpecBookWorkspace projectId={id} />;
}
