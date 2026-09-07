"use client";

/**
 * Package — a named offering, its price, and what it includes.
 *
 * Record only (R9): nothing here projects into terms or authority in Wave 2.
 */

import { Button, Input } from "@/components/ui/controls";
import { dollars, readCents, toCentsOrNull } from "../part-kinds";
import type { ScheduleEditorProps } from "./index";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";

function readIncludes(payload: Record<string, unknown>): string[] {
  if (!Array.isArray(payload.includes)) return [];
  return payload.includes.map((entry) =>
    typeof entry === "string" ? entry : "",
  );
}

export function PackageEditor({
  payload,
  onChange,
  readOnly,
}: ScheduleEditorProps) {
  const includes = readIncludes(payload);
  const writeIncludes = (next: string[]) =>
    onChange({ ...payload, includes: next });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={LABEL}>
          Package name
          <Input
            className="mt-2"
            disabled={readOnly}
            value={typeof payload.name === "string" ? payload.name : ""}
            onChange={(event) =>
              onChange({ ...payload, name: event.target.value })
            }
            placeholder="One room, start to install"
          />
        </label>
        <label className={LABEL}>
          Price · dollars
          <Input
            className="mt-2"
            inputMode="decimal"
            disabled={readOnly}
            value={dollars(readCents(payload.priceCents))}
            onChange={(event) =>
              onChange({
                ...payload,
                priceCents: toCentsOrNull(event.target.value),
              })
            }
          />
        </label>
      </div>
      <div className={LABEL}>
        What it includes
        <div className="mt-2 space-y-2 normal-case tracking-normal">
          {includes.map((entry, index) => (
            <div
              key={index}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
            >
              <Input
                aria-label={`Included ${index + 1}`}
                disabled={readOnly}
                value={entry}
                onChange={(event) =>
                  writeIncludes(
                    includes.map((row, rowIndex) =>
                      rowIndex === index ? event.target.value : row,
                    ),
                  )
                }
                placeholder="Concept presentation"
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={readOnly}
                onClick={() =>
                  writeIncludes(
                    includes.filter((_, rowIndex) => rowIndex !== index),
                  )
                }
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            disabled={readOnly}
            onClick={() => writeIncludes([...includes, ""])}
          >
            + Add a line
          </Button>
        </div>
      </div>
    </div>
  );
}
