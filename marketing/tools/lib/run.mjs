import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// marketing/tools/lib -> marketing -> repo root
export const REPO_ROOT = path.resolve(__dirname, '../../..');

const CHANNELS_PATH = path.join(REPO_ROOT, 'marketing/canon/channels.json');

export const CHANNELS = JSON.parse(fs.readFileSync(CHANNELS_PATH, 'utf8'));

const PIECE_KINDS = [
  'social',
  'pin',
  'email',
  'one-pager',
  'deck',
  'pr-pitch',
  'poster',
  'video',
];

const STREAMS = ['subscription', 'margin', 'both'];
const JOB_KINDS = ['still', 'video'];

export function runPaths(runDir) {
  return {
    root: runDir,
    brief: path.join(runDir, 'brief.md'),
    plan: path.join(runDir, 'plan.json'),
    copy: path.join(runDir, 'copy'),
    critique: path.join(runDir, 'critique'),
    mj: path.join(runDir, 'mj'),
    inbox: path.join(runDir, 'mj', 'inbox'),
    flux: path.join(runDir, 'flux'),
    compose: path.join(runDir, 'compose'),
    out: path.join(runDir, 'out'),
    approved: path.join(runDir, 'approved'),
    board: path.join(runDir, 'board.html'),
    ledger: path.join(runDir, 'ledger.json'),
  };
}

export function readPlan(runDir) {
  const { plan } = runPaths(runDir);
  const raw = fs.readFileSync(plan, 'utf8');
  return JSON.parse(raw);
}

export function validatePlan(plan) {
  const errors = [];

  if (!plan || typeof plan !== 'object') {
    return ['plan must be an object'];
  }

  if (plan.version !== 1) {
    errors.push('version must be 1');
  }

  if (typeof plan.runId !== 'string' || !/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(plan.runId)) {
    errors.push('runId must match ^\\d{4}-\\d{2}-\\d{2}-[a-z0-9-]+$');
  }

  const contentTest = plan.contentTest;
  if (!contentTest || typeof contentTest !== 'object') {
    errors.push('contentTest is required');
  } else {
    if (typeof contentTest.pass !== 'boolean') {
      errors.push('contentTest.pass must be a boolean');
    }
    for (const field of ['audience', 'moment', 'stream', 'promise']) {
      if (typeof contentTest[field] !== 'string') {
        errors.push(`contentTest.${field} must be a string`);
      }
    }
    if (!STREAMS.includes(contentTest.stream)) {
      errors.push(`contentTest.stream must be one of ${STREAMS.join('|')}`);
    }
  }

  const pieces = Array.isArray(plan.pieces) ? plan.pieces : [];
  const jobs = Array.isArray(plan.jobs) ? plan.jobs : [];

  const pieceIds = new Set();
  for (const piece of pieces) {
    if (typeof piece.id !== 'string' || !/^P\d{2}$/.test(piece.id)) {
      errors.push(`piece id "${piece.id}" must match P\\d{2}`);
    } else if (pieceIds.has(piece.id)) {
      errors.push(`duplicate piece id ${piece.id}`);
    } else {
      pieceIds.add(piece.id);
    }

    if (!PIECE_KINDS.includes(piece.kind)) {
      errors.push(`piece ${piece.id} kind "${piece.kind}" must be one of ${PIECE_KINDS.join('|')}`);
    }

    if (!(piece.channel in CHANNELS)) {
      errors.push(`piece ${piece.id} channel "${piece.channel}" is not in CHANNELS`);
    }
  }

  const jobIds = new Set();
  for (const job of jobs) {
    if (typeof job.id !== 'string' || !/^J\d{2}$/.test(job.id)) {
      errors.push(`job id "${job.id}" must match J\\d{2}`);
    } else if (jobIds.has(job.id)) {
      errors.push(`duplicate job id ${job.id}`);
    } else {
      jobIds.add(job.id);
    }
  }

  // Second pass: cross references, now that id sets are complete.
  for (const piece of pieces) {
    const visuals = Array.isArray(piece.visuals) ? piece.visuals : [];
    for (const jobId of visuals) {
      if (!jobIds.has(jobId)) {
        errors.push(`piece ${piece.id} visuals references unknown job "${jobId}"`);
      }
    }
  }

  for (const job of jobs) {
    const pieceRefs = Array.isArray(job.pieceIds) ? job.pieceIds : [];
    for (const pid of pieceRefs) {
      if (!pieceIds.has(pid)) {
        errors.push(`job ${job.id} pieceIds references unknown piece "${pid}"`);
      }
    }

    if (!JOB_KINDS.includes(job.kind)) {
      errors.push(`job ${job.id} kind "${job.kind}" must be one of ${JOB_KINDS.join('|')}`);
    }

    if (job.kind === 'video') {
      if (typeof job.startFrom !== 'string' || !jobIds.has(job.startFrom)) {
        errors.push(`job ${job.id} is a video job and needs startFrom referencing an existing still job`);
      } else {
        const startJob = jobs.find((j) => j.id === job.startFrom);
        if (!startJob || startJob.kind !== 'still') {
          errors.push(`job ${job.id} startFrom "${job.startFrom}" must reference a still job`);
        }
      }
    }

    if (!Number.isInteger(job.variants) || job.variants < 1 || job.variants > 4) {
      errors.push(`job ${job.id} variants must be an integer 1-4`);
    }
  }

  return errors;
}

export function readFinal(runDir, pieceId) {
  const { copy } = runPaths(runDir);
  const filePath = path.join(copy, `${pieceId}.final.md`);
  const raw = fs.readFileSync(filePath, 'utf8');

  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: raw };
  }

  const [, frontmatter, body] = match;
  const data = YAML.parse(frontmatter) || {};
  return { data, body: body.replace(/^\r?\n/, '') };
}

export function appendLedger(runDir, entry) {
  const { ledger } = runPaths(runDir);
  let entries = [];
  if (fs.existsSync(ledger)) {
    try {
      const raw = fs.readFileSync(ledger, 'utf8');
      entries = JSON.parse(raw);
      if (!Array.isArray(entries)) {
        entries = [];
      }
    } catch {
      entries = [];
    }
  }

  const record = { ts: new Date().toISOString(), ...entry };
  entries.push(record);

  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  fs.writeFileSync(ledger, JSON.stringify(entries, null, 2) + '\n');

  return record;
}

export function parseClaims(claimsPath = path.join(REPO_ROOT, 'marketing/canon/claims.md')) {
  const claims = new Map();

  if (!fs.existsSync(claimsPath)) {
    return claims;
  }

  const raw = fs.readFileSync(claimsPath, 'utf8');
  const lines = raw.split(/\r?\n/);

  let headerSeen = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;

    const cells = trimmed
      .slice(1, trimmed.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((cell) => cell.trim());

    if (!headerSeen) {
      const header = cells.map((c) => c.toLowerCase());
      if (header[0] === 'id' && header[1] === 'claim' && header[2] === 'source' && header[3] === 'status') {
        headerSeen = true;
      }
      continue;
    }

    // Skip markdown separator rows like |---|---|---|---|
    if (cells.every((c) => /^:?-+:?$/.test(c))) {
      continue;
    }

    const [id, claim, source, status] = cells;
    if (!id) continue;

    const normalizedStatus = (status || '').toLowerCase();
    if (normalizedStatus !== 'verified' && normalizedStatus !== 'todo') {
      continue;
    }

    claims.set(id, { claim, source, status: normalizedStatus });
  }

  return claims;
}
