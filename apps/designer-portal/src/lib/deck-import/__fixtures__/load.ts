/** Test helpers for the committed fixture decks (see generate.py). */
import { readFileSync } from "fs";
import { join } from "path";
import { webcrypto } from "crypto";

// jsdom has no SubtleCrypto; the parser hashes the deck with crypto.subtle.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}

export function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(__dirname, name)));
}

export interface Truth {
  structure: {
    order: string[];
    slide_size: [number, number];
    elements: Record<
      string,
      {
        key: string;
        bbox?: number[];
        src_rect?: number[];
        remote_url?: string;
        groups?: number[];
      }
    >;
    skipped: Record<string, string>;
    slide4_title: string;
  };
  tickets: {
    elements: Record<string, string>;
    slides: Record<string, string>;
    texts: Record<string, number>;
  };
  keynote: { slide_size: [number, number]; eames: string; second: string };
}

export const truth: Truth = JSON.parse(
  readFileSync(join(__dirname, "truth.json"), "utf8"),
);
