import type { Night, RunStatus } from './types.js';

export type NightCounts = Record<RunStatus, number>;

// Jobs per last status. A row carries no per-line ok/fail tally, so the board counts jobs, not lines.
export function countByLastStatus(night: Night): NightCounts {
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const row of night.rows) counts[row.lastStatus]++;
  return counts;
}
