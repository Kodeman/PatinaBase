/**
 * The agent queue's own word for a compliance chase.
 *
 * CR-1: a Next App Router route module may export only the HTTP verb handlers
 * plus a fixed config set, and `tsconfig.json` includes `.next/types/**` — so
 * the constant living beside the POST handler failed `type-check` with TS2344
 * the moment the generated validator existed. It sits here instead: a plain
 * module with no `use client`, importable from both the route and the hook.
 */
export const COMPLIANCE_CHASE_TASK_TYPE = "compliance_chase";
