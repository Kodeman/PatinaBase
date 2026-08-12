/**
 * Client-portal view of the WP3 workflow-gate fixture.
 *
 * Nothing is reimplemented here. The gate population is one thing both portals
 * read — the studio authors and publishes it, the household responds to it — so
 * it stays single-source in the designer portal's e2e helpers. That also keeps
 * ONE cross-process seed lock: if this module carried its own copy, a client
 * suite and a designer suite running together would each think they were the
 * first caller and rebuild the fixture out from under each other.
 *
 * LOCAL STACK ONLY — the guard lives in the module being re-exported.
 */
export {
  seedWorkflowGateFixture,
  mintRespondableGate,
  teardownWorkflowGateFixture,
  WORKFLOW_GATE_PROJECT_ID,
  EDITION_ONE_TITLE,
  EDITION_TWO_TITLE,
  type WorkflowGateIds,
} from '../../../designer-portal/e2e/helpers/workflow-gate-fixture';
