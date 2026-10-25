interface InRead {
  ids: readonly string[];
  read: (ids: string[]) => Promise<void>;
}

/** 100 UUIDs keep PostgREST URLs below 8 KB; all reads share four workers. */
export async function boundedInTransport(reads: readonly InRead[]): Promise<void> {
  const requests: Array<() => Promise<void>> = [];
  for (const { ids, read } of reads) {
    for (let offset = 0; offset < ids.length; offset += 100) {
      const chunk = ids.slice(offset, offset + 100);
      requests.push(() => read(chunk));
    }
  }
  let next = 0;
  const worker = async () => {
    while (next < requests.length) await requests[next++]();
  };
  await Promise.all(Array.from({ length: Math.min(4, requests.length) }, worker));
}
