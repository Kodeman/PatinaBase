// The plate lane: at most one `plate_ingest` job at a time, each in a process
// of its own (plate-job.mjs). The container has one vCPU, so a second job would
// only push both past their deadlines; it gets 503 busy before any work starts.
//
// A job's deadline counts from the request's arrival, before its body is read.
// At the deadline, or when the Worker hangs up, the job's process is SIGKILLed:
// that stops native libvips work, which no in-process abort can reach. A result
// that lands after the deadline is discarded. The answer is sent, and the slot
// freed, only once the process has exited.

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { disconnectSignal, jobBudgetMs } from './plates.mjs';

const JOB_SCRIPT = fileURLToPath(new URL('./plate-job.mjs', import.meta.url));

function sendJson(res, status, body) {
  if (res.destroyed) return;
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const failure = (error) => ({ success: false, error });

/**
 * The /process handler for plate_ingest jobs.
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse,
 *   job: {budgetMs?: unknown}, receivedAt: number) => void} `receivedAt` is performance.now() on arrival.
 */
export function createPlateLane() {
  let busy = false;

  return function runPlateJob(req, res, job, receivedAt) {
    if (busy) {
      req.resume();
      sendJson(res, 503, { error: 'busy' });
      return;
    }
    busy = true;
    const budget = jobBudgetMs(job.budgetMs);
    const pastDeadline = failure(`job deadline of ${budget} ms passed`);
    const child = fork(JOB_SCRIPT, [], { serialization: 'advanced', stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    let answer = null;
    let released = false;
    let timer;

    // The first answer wins and the process is killed either way; the reply waits for its exit.
    const settle = (status, body) => {
      if (answer) return;
      answer = { status, body };
      clearTimeout(timer);
      child.kill('SIGKILL');
    };
    const release = () => {
      if (released) return;
      released = true;
      busy = false;
      sendJson(res, answer.status, answer.body);
    };

    timer = setTimeout(() => settle(504, pastDeadline), Math.max(0, budget - (performance.now() - receivedAt)));
    disconnectSignal(res).addEventListener('abort', () => settle(504, failure('client disconnected')));
    child.on('message', (reply) => {
      if (performance.now() - receivedAt >= budget) settle(504, pastDeadline);
      else if (reply?.ok) settle(200, reply.result);
      else settle(500, failure(String(reply?.error ?? 'plate job failed')));
    });
    child.on('error', (err) => {
      settle(500, failure(String(err?.message || err)));
      // A process that never started has no exit to wait for.
      if (child.pid === undefined) release();
    });
    child.on('exit', () => {
      settle(500, failure('plate job exited without an answer'));
      release();
    });

    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (!answer) child.send({ job, body: Buffer.concat(chunks) });
    });
  };
}
