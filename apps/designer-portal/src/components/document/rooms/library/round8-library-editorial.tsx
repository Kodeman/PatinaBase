"use client";

import type { ReactNode } from "react";
import { RoomShell } from "../room-shell";
import "../../paper/round8.css";

export default function Round8LibraryEditorial({
  children,
  action,
  count,
}: {
  children: ReactNode;
  action: ReactNode;
  count?: string;
}) {
  return (
    <div data-paper-renderer="round8" data-library-room>
      <RoomShell
        title="Resource library"
        topLevel
        measure="mx-auto max-w-[1240px] px-4 sm:px-9"
        count={count}
        action={action}
        heading={
          <div className="r8-library-intro">
            <p className="eb">Library</p>
            <h1 className="t-d1">A library with a point of view.</h1>
            <p className="t-body-sm">
              Materials, pieces and makers worth returning to. A reference becomes
              a job selection only when you place and configure it.
            </p>
            <p className="t-meta">
              Personal captures, not yet reviewed · Studio library · Patina catalog
            </p>
          </div>
        }
      >
        {children}
        <p className="r8-library-note t-body-sm mx-auto max-w-[1240px] px-4 sm:px-9">
          Reference prices and lead times need confirmation. Saving or placing a
          reference does not approve it, reserve stock or authorize a purchase.
        </p>
      </RoomShell>
    </div>
  );
}
