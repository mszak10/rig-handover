import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus } from './types.js';

type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: Record<RunStatus, true> = { ok: true, retry: true, fail: true };

function isStatus(value: unknown): value is RunStatus {
  return typeof value === 'string' && Object.hasOwn(STATUSES, value);
}

// One log line → a typed run, or null when it doesn't parse or fails validation.
function parseLine(line: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { at, job, status, owner, error } = value as Record<string, unknown>;
  if (typeof at !== 'string' || at === '') return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isStatus(status)) return null;
  if (owner !== undefined && owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && error !== null && typeof error !== 'string') return null;
  return { at, job, status, owner: owner ?? null, error: error ?? null };
}

function readFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export const readNight: ReadNight = (runsDir, night) => {
  // The night names a file; anything that isn't a date can't be one (and can't escape runsDir).
  if (!NIGHT.test(night)) return null;
  const text = readFile(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();

  const byJob = new Map<string, DigestRow>();
  let badLines = 0;
  for (const line of lines) {
    const run = parseLine(line);
    if (run === null) {
      badLines++;
      continue;
    }
    const row = byJob.get(run.job);
    if (row === undefined) {
      byJob.set(run.job, {
        job: run.job,
        owner: run.owner,
        runs: 1,
        retries: run.status === 'retry' ? 1 : 0,
        lastStatus: run.status,
        lastError: run.error,
        firstAt: run.at,
        lastAt: run.at,
      });
      continue;
    }
    row.owner = run.owner;
    row.runs++;
    if (run.status === 'retry') row.retries++;
    row.lastStatus = run.status;
    row.lastError = run.error;
    row.lastAt = run.at;
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines };
};
