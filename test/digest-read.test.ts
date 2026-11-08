import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const NIGHT = '2026-11-01';
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeNight(lines: unknown[], trailer = '\n'): void {
  const text = lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n');
  writeFileSync(join(dir, `${NIGHT}.jsonl`), lines.length ? text + trailer : '');
}

describe('readNight on runs/2026-10-28.jsonl', () => {
  it('finds 5 jobs, sorted, and 1 bad line', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    const refresh = night?.rows.find((r) => r.job === 'fixtures/refresh');
    expect(refresh).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });
});

describe('readNight', () => {
  it('returns null when the night has no file', () => {
    expect(readNight(dir, NIGHT)).toBeNull();
  });

  it('returns null for a night name that is not a date', () => {
    expect(readNight(dir, '../etc/passwd')).toBeNull();
  });

  it('reads an empty file as an empty night', () => {
    writeNight([]);
    expect(readNight(dir, NIGHT)).toEqual({ night: NIGHT, rows: [], badLines: 0 });
  });

  it('keeps a null owner, and a missing one as null', () => {
    writeNight([
      { at: '2026-11-01T01:00:00+01:00', job: 'a', status: 'ok', owner: null },
      { at: '2026-11-01T01:00:00+01:00', job: 'b', status: 'ok' },
    ]);
    expect(readNight(dir, NIGHT)?.rows.map((r) => [r.job, r.owner])).toEqual([
      ['a', null],
      ['b', null],
    ]);
  });

  it('counts runs and retries, and takes last status, error, owner and times from file order', () => {
    writeNight([
      { at: '2026-11-01T03:00:00+02:00', job: 'j', status: 'retry', owner: 'x', error: 'e1' },
      { at: '2026-11-01T01:00:00+01:00', job: 'j', status: 'retry', owner: 'x', error: 'e2' },
      { at: '2026-11-01T02:00:00-05:00', job: 'j', status: 'fail', owner: 'y', error: 'boom' },
    ]);
    expect(readNight(dir, NIGHT)?.rows).toEqual([
      {
        job: 'j',
        owner: 'y',
        runs: 3,
        retries: 2,
        lastStatus: 'fail',
        lastError: 'boom',
        firstAt: '2026-11-01T03:00:00+02:00',
        lastAt: '2026-11-01T02:00:00-05:00',
      },
    ]);
  });

  it('clears the last error when the last run has none', () => {
    writeNight([
      { at: 't1', job: 'j', status: 'retry', owner: 'x', error: 'flaky' },
      { at: 't2', job: 'j', status: 'ok', owner: 'x' },
    ]);
    expect(readNight(dir, NIGHT)?.rows[0]?.lastError).toBeNull();
  });

  it('counts unparseable and invalid lines as bad, without throwing, and ignores the trailing newline', () => {
    writeNight([
      '{"at":"t1","job":"j","stat',
      'not json',
      { at: 't2', job: 'j', status: 'skipped', owner: 'x' },
      { at: 't3', status: 'ok', owner: 'x' },
      { at: 't4', job: 'j', status: 'ok', owner: 42 },
      '[1,2]',
      { at: 't5', job: 'j', status: 'ok', owner: 'x' },
    ]);
    const night = readNight(dir, NIGHT);
    expect(night?.badLines).toBe(6);
    expect(night?.rows.map((r) => [r.job, r.runs])).toEqual([['j', 1]]);
  });
});
