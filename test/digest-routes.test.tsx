import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const NIGHT = '2026-11-01';
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function app() {
  return createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir });
}

function writeNight(lines: unknown[]): void {
  const text = lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n');
  writeFileSync(join(dir, `${NIGHT}.jsonl`), lines.length ? `${text}\n` : '');
}

// Jobs written out of order: the routes must list them sorted by job.
const NORMAL = [
  { at: '2026-11-02T01:00:00+01:00', job: 'zeta/fine', status: 'ok', owner: null },
  { at: '2026-11-02T01:05:00+01:00', job: 'alpha/flaky', status: 'retry', owner: 'rook', error: 'timeout' },
  { at: '2026-11-02T01:06:00+01:00', job: 'alpha/flaky', status: 'retry', owner: 'rook', error: 'timeout' },
  { at: '2026-11-02T01:07:00+01:00', job: 'alpha/flaky', status: 'retry', owner: 'rook', error: 'timeout' },
  { at: '2026-11-02T01:08:00+01:00', job: 'alpha/flaky', status: 'ok', owner: 'rook' },
  { at: '2026-11-02T02:00:00-05:00', job: 'mid/broken', status: 'fail', owner: 'kite', error: 'disk full' },
];

type PageRow = { warn: boolean; cells: string[] };

// Body rows of the digest table: those with <td> cells (the header row uses <th>).
function pageRows(html: string): PageRow[] {
  return [...html.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g)]
    .filter(([, , inner]) => /<td\b/.test(inner ?? ''))
    .map(([, attrs, inner]) => ({
      warn: /\bclass="[^"]*\bwarn\b[^"]*"/.test(attrs ?? ''),
      cells: [...(inner ?? '').matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(([, c]) =>
        (c ?? '').replace(/<[^>]*>/g, '').trim(),
      ),
    }));
}

async function getPage(night: string) {
  const res = await app().request(`/digest/${night}`);
  return { status: res.status, html: await res.text() };
}

async function getJson(night: string) {
  const res = await app().request(`/api/digest/${night}`);
  return { status: res.status, body: (await res.json()) as unknown };
}

describe('GET /digest/:night', () => {
  it('lists one row per job, sorted, with — for a null owner and warn on retries >= 3 or fail', async () => {
    writeNight(NORMAL);
    const { status, html } = await getPage(NIGHT);
    expect(status).toBe(200);
    expect(html).toContain(`digest ${NIGHT}`);
    expect(pageRows(html)).toEqual([
      {
        warn: true,
        cells: ['alpha/flaky', 'rook', '4', '3', 'ok', '—', '2026-11-02T01:05:00+01:00', '2026-11-02T01:08:00+01:00'],
      },
      {
        warn: true,
        cells: ['mid/broken', 'kite', '1', '0', 'fail', 'disk full', '2026-11-02T02:00:00-05:00', '2026-11-02T02:00:00-05:00'],
      },
      {
        warn: false,
        cells: ['zeta/fine', '—', '1', '0', 'ok', '—', '2026-11-02T01:00:00+01:00', '2026-11-02T01:00:00+01:00'],
      },
    ]);
    expect(html).not.toContain('bad line');
  });

  it('answers 404 with a page saying there is no run log', async () => {
    const { status, html } = await getPage(NIGHT);
    expect(status).toBe(404);
    expect(html).toContain(`no run log for ${NIGHT}`);
  });

  it('says nothing ran for an empty night, with no table', async () => {
    writeNight([]);
    const { status, html } = await getPage(NIGHT);
    expect(status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table');
  });

  it('keeps the good rows and reports one bad line', async () => {
    writeNight([NORMAL[0], 'not json']);
    const { status, html } = await getPage(NIGHT);
    expect(status).toBe(200);
    expect(pageRows(html).map((r) => r.cells[0])).toEqual(['zeta/fine']);
    expect(html).toContain('1 bad line skipped');
  });

  it('reports bad lines in the plural', async () => {
    writeNight([NORMAL[0], 'not json', '[1]']);
    const { html } = await getPage(NIGHT);
    expect(html).toContain('2 bad lines skipped');
  });
});

describe('GET /api/digest/:night', () => {
  it('answers the night with rows sorted by job', async () => {
    writeNight(NORMAL);
    const { status, body } = await getJson(NIGHT);
    expect(status).toBe(200);
    expect(body).toEqual({
      night: NIGHT,
      badLines: 0,
      rows: [
        {
          job: 'alpha/flaky',
          owner: 'rook',
          runs: 4,
          retries: 3,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-11-02T01:05:00+01:00',
          lastAt: '2026-11-02T01:08:00+01:00',
        },
        {
          job: 'mid/broken',
          owner: 'kite',
          runs: 1,
          retries: 0,
          lastStatus: 'fail',
          lastError: 'disk full',
          firstAt: '2026-11-02T02:00:00-05:00',
          lastAt: '2026-11-02T02:00:00-05:00',
        },
        {
          job: 'zeta/fine',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-11-02T01:00:00+01:00',
          lastAt: '2026-11-02T01:00:00+01:00',
        },
      ],
    });
  });

  it('answers 404 with an error naming the night', async () => {
    const { status, body } = await getJson(NIGHT);
    expect(status).toBe(404);
    expect(body).toEqual({ error: 'no run log', night: NIGHT });
  });

  it('answers an empty night with no rows', async () => {
    writeNight([]);
    const { status, body } = await getJson(NIGHT);
    expect(status).toBe(200);
    expect(body).toEqual({ night: NIGHT, rows: [], badLines: 0 });
  });

  it('keeps the good rows and counts one bad line', async () => {
    writeNight([NORMAL[0], 'not json']);
    const { status, body } = await getJson(NIGHT);
    expect(status).toBe(200);
    expect(body).toMatchObject({ night: NIGHT, badLines: 1, rows: [{ job: 'zeta/fine' }] });
  });
});

describe('page and JSON', () => {
  it('list the same jobs in the same order', async () => {
    writeNight(NORMAL);
    const { html } = await getPage(NIGHT);
    const { body } = await getJson(NIGHT);
    const jsonJobs = (body as { rows: { job: string }[] }).rows.map((r) => r.job);
    expect(jsonJobs).toHaveLength(3);
    expect(pageRows(html).map((r) => r.cells[0])).toEqual(jsonJobs);
  });
});
