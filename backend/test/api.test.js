import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openStore } from '../src/db.js';

/** Runs fn against a brand-new in-memory database and server, so tests never affect each other. */
async function withFreshServer(fn) {
  const s = openStore(':memory:');
  const srv = createApp(s).listen(0);
  await new Promise((r) => srv.once('listening', r));
  const url = `http://127.0.0.1:${srv.address().port}/api`;
  const c = async (method, path, body) => {
    const res = await fetch(url + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  try {
    await fn(c);
  } finally {
    srv.close();
    s.close();
  }
}

const seeded = (fn) =>
  withFreshServer(async (c) => {
    assert.equal((await c('POST', '/seed')).status, 201);
    const ids = Object.fromEntries((await c('GET', '/movies')).body.map((m) => [m.title, m.id]));
    await fn(c, ids);
  });

test('rewatch order for Doomsday: all 7 others, valid order, target excluded', () =>
  seeded(async (c, ids) => {
    const { status, body } = await c('GET', `/movies/${ids['Avengers: Doomsday']}/rewatch-order`);
    assert.equal(status, 200);
    assert.deepEqual(
      body.order.map((m) => m.title),
      [
        'Iron Man',
        'Captain America: The First Avenger',
        'The Avengers',
        'Captain America: Civil War',
        'Thor: Ragnarok',
        'Avengers: Infinity War',
        'Avengers: Endgame',
      ],
    );
    assert.equal(body.totalMovies, 7);
    assert.equal(body.watchedCount, 0);
    assert.equal(body.remainingRuntimeMinutes, 126 + 124 + 143 + 147 + 130 + 149 + 181);
  }));

test('rewatch order for Civil War and Ragnarok', () =>
  seeded(async (c, ids) => {
    const civil = (await c('GET', `/movies/${ids['Captain America: Civil War']}/rewatch-order`)).body;
    assert.deepEqual(civil.order.map((m) => m.title).sort(), [
      'Captain America: The First Avenger',
      'Iron Man',
      'The Avengers',
    ]);
    assert.equal(civil.order[2].title, 'The Avengers');

    const ragnarok = (await c('GET', `/movies/${ids['Thor: Ragnarok']}/rewatch-order`)).body;
    assert.deepEqual(ragnarok.order, []);
    assert.equal(ragnarok.remainingRuntimeMinutes, 0);
  }));

test('watched movies count as watched and leave the remaining runtime', () =>
  seeded(async (c, ids) => {
    await c('PATCH', `/movies/${ids['Iron Man']}`, { watched: true });
    await c('PATCH', `/movies/${ids['Thor: Ragnarok']}`, { watched: true });
    const { body } = await c('GET', `/movies/${ids['Avengers: Doomsday']}/rewatch-order`);
    assert.equal(body.watchedCount, 2);
    assert.equal(body.remainingRuntimeMinutes, 124 + 143 + 147 + 149 + 181);
  }));

test('Endgame as a prerequisite of Iron Man -> 409 CIRCULAR_DEPENDENCY, and nothing changes', () =>
  seeded(async (c, ids) => {
    const res = await c('PATCH', `/movies/${ids['Iron Man']}`, { prerequisites: [ids['Avengers: Endgame']] });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CIRCULAR_DEPENDENCY');
    assert.ok(res.body.error.details.cycle.length >= 3);
    const im = (await c('GET', '/movies')).body.find((m) => m.title === 'Iron Man');
    assert.deepEqual(im.prerequisites, []);
  }));

test('a movie cannot depend on itself (by id)', () =>
  seeded(async (c, ids) => {
    const res = await c('PATCH', `/movies/${ids['Iron Man']}`, { prerequisites: [ids['Iron Man']] });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CIRCULAR_DEPENDENCY');
  }));

test('prerequisites can be changed later (replace and clear)', () =>
  seeded(async (c, ids) => {
    let res = await c('PATCH', `/movies/${ids['Thor: Ragnarok']}`, { prerequisites: [ids['Iron Man']] });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.prerequisites, [ids['Iron Man']]);
    res = await c('PATCH', `/movies/${ids['Thor: Ragnarok']}`, { prerequisites: [] });
    assert.deepEqual(res.body.prerequisites, []);
  }));

test('movies: validation, defaults and duplicates', () =>
  withFreshServer(async (c) => {
    let res = await c('POST', '/movies', { title: 'Iron Man', releaseYear: 2008, runtime: 126 });
    assert.equal(res.status, 201);
    assert.equal(res.body.watched, false);
    assert.deepEqual(res.body.prerequisites, []);

    res = await c('POST', '/movies', { title: 'iron man', releaseYear: 2008, runtime: 126 });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'DUPLICATE_TITLE');

    for (const runtime of [0, 301, 1.5, '120']) {
      res = await c('POST', '/movies', { title: 'X', releaseYear: 2000, runtime });
      assert.equal(res.status, 400, `runtime ${runtime}`);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
    res = await c('POST', '/movies', { title: '  ', releaseYear: 2000, runtime: 100 });
    assert.equal(res.status, 400);

    res = await c('POST', '/movies', { title: 'Y', releaseYear: 2000, runtime: 100, prerequisites: [999] });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'UNKNOWN_PREREQUISITE');

    res = await c('PATCH', '/movies/1', { watched: 'yes' });
    assert.equal(res.status, 400);
    res = await c('PATCH', '/movies/1', {});
    assert.equal(res.status, 400);
    res = await c('PATCH', '/movies/999', { watched: true });
    assert.equal(res.status, 404);
    res = await c('GET', '/movies/999/rewatch-order');
    assert.equal(res.status, 404);
  }));

test('creating several movies at once is all-or-nothing', () =>
  withFreshServer(async (c) => {
    let res = await c('POST', '/movies', [
      { title: 'A', releaseYear: 2001, runtime: 90 },
      { title: 'B', releaseYear: 2002, runtime: 90, prerequisites: ['A'] },
    ]);
    assert.equal(res.status, 201);
    assert.equal(res.body.length, 2);
    assert.equal(res.body[1].prerequisites[0], res.body[0].id);

    res = await c('POST', '/movies', [
      { title: 'C', releaseYear: 2003, runtime: 90 },
      { title: 'D', releaseYear: 2004, runtime: 0 },
    ]);
    assert.equal(res.status, 400);
    assert.equal((await c('GET', '/movies')).body.length, 2); // C was rolled back
  }));

test('invalid JSON -> 400 INVALID_JSON', () =>
  withFreshServer(async () => {
    // Uses a raw request so the body really is malformed.
    const s = openStore(':memory:');
    const srv = createApp(s).listen(0);
    await new Promise((r) => srv.once('listening', r));
    const res = await fetch(`http://127.0.0.1:${srv.address().port}/api/movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{nope',
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'INVALID_JSON');
    srv.close();
    s.close();
  }));

test('cinemas: create, validate, duplicate names', () =>
  withFreshServer(async (c) => {
    let res = await c('POST', '/cinemas', { name: 'Odeon', bundleSizes: [5, 2] });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.bundleSizes, [2, 5]);

    res = await c('POST', '/cinemas', { name: 'ODEON', bundleSizes: [3] });
    assert.equal(res.status, 409);

    const bad = [
      { name: 'A', bundleSizes: [] },
      { name: 'A', bundleSizes: [0] },
      { name: 'A', bundleSizes: [501] },
      { name: 'A', bundleSizes: [2, 2] },
      { name: 'A', bundleSizes: Array.from({ length: 11 }, (_, i) => i + 1) },
      { name: 'A', bundleSizes: [1.5] },
      { name: '', bundleSizes: [2] },
      { bundleSizes: [2] },
    ];
    for (const body of bad) assert.equal((await c('POST', '/cinemas', body)).status, 400, JSON.stringify(body));

    res = await c('POST', '/cinemas', { name: 'Ten', bundleSizes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 500] });
    assert.equal(res.status, 201);
  }));

test('booking quotes match the brief', () =>
  withFreshServer(async (c) => {
    const make = async (name, sizes) => (await c('POST', '/cinemas', { name, bundleSizes: sizes })).body.id;
    const a = await make('A', [1, 3, 4]);
    const b = await make('B', [2, 5]);
    const d = await make('D', [6, 9, 20]);
    const e = await make('E', [4, 6]);

    let q = (await c('GET', `/cinemas/${a}/booking?groupSize=6`)).body;
    assert.equal(q.possible, true);
    assert.equal(q.totalBundles, 2);
    assert.deepEqual(q.bundles, [{ size: 3, count: 2 }]);

    q = (await c('GET', `/cinemas/${b}/booking?groupSize=11`)).body;
    assert.equal(q.totalBundles, 4);
    assert.deepEqual(q.bundles, [{ size: 5, count: 1 }, { size: 2, count: 3 }]);

    q = (await c('GET', `/cinemas/${d}/booking?groupSize=44`)).body;
    assert.equal(q.totalBundles, 4);
    assert.deepEqual(q.bundles, [{ size: 20, count: 1 }, { size: 9, count: 2 }, { size: 6, count: 1 }]);

    const res = await c('GET', `/cinemas/${e}/booking?groupSize=7`);
    assert.equal(res.status, 200);
    assert.equal(res.body.possible, false);
    assert.deepEqual(res.body.bundles, []);
    assert.match(res.body.message, /exactly 7/);
  }));

test('booking: groupSize validation and unknown cinema', () =>
  withFreshServer(async (c) => {
    const id = (await c('POST', '/cinemas', { name: 'A', bundleSizes: [2] })).body.id;
    for (const v of ['0', '10001', '-3', '2.5', 'abc', '']) {
      const res = await c('GET', `/cinemas/${id}/booking?groupSize=${v}`);
      assert.equal(res.status, 400, `groupSize=${v}`);
    }
    assert.equal((await c('GET', `/cinemas/${id}/booking`)).status, 400);
    assert.equal((await c('GET', `/cinemas/${id}/booking?groupSize=10000`)).status, 200);
    assert.equal((await c('GET', '/cinemas/999/booking?groupSize=4')).status, 404);
  }));

test('seed only works on an empty database; unknown routes return JSON 404', () =>
  withFreshServer(async (c) => {
    assert.equal((await c('POST', '/seed')).status, 201);
    const again = await c('POST', '/seed');
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'NOT_EMPTY');
    const nope = await c('GET', '/nope');
    assert.equal(nope.status, 404);
    assert.equal(nope.body.error.code, 'NOT_FOUND');
  }));
