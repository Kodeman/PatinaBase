export class UpstreamTimeoutError extends Error {
  constructor() {
    super('upstream timeout');
    this.name = 'UpstreamTimeoutError';
  }
}

export class UpstreamAbortError extends Error {
  constructor() {
    super('upstream request aborted');
    this.name = 'UpstreamAbortError';
  }
}

export async function withDeadline<T>(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let removeCallerAbort: (() => void) | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new UpstreamTimeoutError());
    }, timeoutMs);
  });
  const callerAbort = new Promise<never>((_, reject) => {
    if (!callerSignal) return;
    const abort = () => {
      controller.abort();
      reject(new UpstreamAbortError());
    };
    if (callerSignal.aborted) {
      abort();
      return;
    }
    callerSignal.addEventListener('abort', abort, { once: true });
    removeCallerAbort = () => callerSignal.removeEventListener('abort', abort);
  });

  try {
    return await Promise.race([
      work(controller.signal),
      timeout,
      callerAbort,
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    removeCallerAbort?.();
  }
}

export async function fetchWithDeadline(
  fetcher: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<Response> {
  return withDeadline(callerSignal, timeoutMs, (signal) =>
    fetcher(input, { ...init, signal }),
  );
}
