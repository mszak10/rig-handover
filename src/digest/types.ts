export type RunStatus = 'ok' | 'retry' | 'fail';
export type DigestRow = {
  job: string;
  owner: string | null;      // null kept; views render '—'
  runs: number;              // lines for this job
  retries: number;           // lines with status 'retry'
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;           // 'at' as in the log, offset kept
  lastAt: string;
};
export type Night = { night: string; rows: DigestRow[]; badLines: number };
// Returns null when runs/<night>.jsonl does not exist. Rows sorted by job.
export type ReadNight = (runsDir: string, night: string) => Night | null;
