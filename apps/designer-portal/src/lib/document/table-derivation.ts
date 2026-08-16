/**
 * The Worktable's table selector (Start to Signature, W2 — flag `worktable`).
 *
 * A pure derivation from what the open document already holds — the
 * engagement row's `active_section` and the live proposal's status — to which
 * of the four tables the paper's middle composes as. It is a LAYER over the
 * section grammar (amendment A5): `deriveSections` is untouched and still
 * answers the spine, the Record and the fill state; this reads its input, it
 * does not replace it.
 *
 * The four tables map the job arc:
 *   I   intake    — the lead record / discovery capture
 *   II  speccing  — the direction, and a proposal still in draft
 *   III finalize  — a proposal in the client's hands
 *   IV  delivery  — the project, its install week, its care
 */

import type { SectionKey } from './desk-derivation';

export type TableKey = 'intake' | 'speccing' | 'finalize' | 'delivery';

/** The Delivery table's two settings (Direction B §3, Table IV). */
export type TableSetting = 'procurement' | 'install';

export interface TableInput {
  /** `document_state.active_section` — the section grammar's own answer. */
  activeSection: SectionKey;
  /**
   * The LIVE proposal's status, which can be fresher than the row: the view
   * (00327) derives `direction` from `status='draft'` and `proposal` from
   * anything else, so a proposal read after the row was composed is the only
   * thing that can correct the table. `null` while the read has not answered —
   * and a null never moves the table off what the section already says.
   */
  proposalStatus?: string | null;
}

export interface TableSelection {
  table: TableKey;
  /** Present on the Delivery table only. */
  setting?: TableSetting;
}

/**
 * The one composition identity: which table, and which section's spread stands
 * on it. Both matter — Intake carries brief and discovery, Delivery carries
 * project, install and care, and the paper's middle re-composes when either
 * half changes. This is what stale-table pinning holds still.
 */
export interface TableComposition extends TableSelection {
  section: SectionKey;
}

export function deriveTable(input: TableInput): TableSelection {
  switch (input.activeSection) {
    case 'brief':
    case 'discovery':
      return { table: 'intake' };
    case 'direction':
      return { table: 'speccing' };
    case 'proposal':
      // The seal is the far edge of Finalize: a signed proposal's document
      // becomes the project's (R6 redirects the id), so this table holds the
      // agreement from send until that redirect lands.
      return { table: input.proposalStatus === 'draft' ? 'speccing' : 'finalize' };
    case 'project':
    case 'care':
      return { table: 'delivery', setting: 'procurement' };
    case 'install':
      // The install setting reuses the page's own install condition, which the
      // view already derives from the phase model
      // (`current_phase in ('installation','final_walkthrough')`, 00327).
      return { table: 'delivery', setting: 'install' };
  }
}

export function deriveTableComposition(input: TableInput): TableComposition {
  return { ...deriveTable(input), section: input.activeSection };
}

/** The identity a turn is measured against. */
export function tableCompositionKey(composition: TableComposition): string {
  return `${composition.table}/${composition.section}/${composition.setting ?? '-'}`;
}
