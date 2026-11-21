import test from 'node:test';
import assert from 'node:assert/strict';
import { minBundles } from '../src/algorithms/booking.js';
import { findCycle } from '../src/algorithms/cycle.js';
import { rewatchOrder } from '../src/algorithms/rewatch.js';

// ---- booking (examples from the brief) ----
const expectBundles = (sizes, group, total, counts) => {
  const r = minBundles(sizes, group);
  assert.ok(r, `expected a solution for ${sizes} / ${group}`);
  assert.equal(r.totalBundles, total);
  assert.deepEqual(r.bundles, counts);
  // The seats must add up exactly.
  assert.equal(r.bundles.reduce((s, b) => s + b.size * b.count, 0), group);
};

test('booking: 1,3,4 for 6 -> 3 x 2', () => expectBundles([1, 3, 4], 6, 2, [{ size: 3, count: 2 }]));
test('booking: 2,5 for 11 -> 5 x 1, 2 x 3', () =>
  expectBundles([2, 5], 11, 4, [{ size: 5, count: 1 }, { size: 2, count: 3 }]));
test('booking: 6,9,20 for 44 -> 20 x 1, 9 x 2, 6 x 1 (greedy would fail)', () =>
  expectBundles([6, 9, 20], 44, 4, [{ size: 20, count: 1 }, { size: 9, count: 2 }, { size: 6, count: 1 }]));
test('booking: 4,6 for 7 -> not possible', () => assert.equal(minBundles([4, 6], 7), null));

test('booking: edge cases', () => {
  assert.deepEqual(minBundles([1], 1), { totalBundles: 1, bundles: [{ size: 1, count: 1 }] });
  assert.equal(minBundles([500], 1), null);
  assert.equal(minBundles([500, 499], 10000)?.totalBundles, 20); // 500 x 20
  assert.equal(minBundles([2], 9999), null);
  assert.equal(minBundles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 10000).totalBundles, 1000);
});

test('booking: matches brute force for small inputs', () => {
  const brute = (sizes, n) => {
    const best = Array(n + 1).fill(Infinity);
    best[0] = 0;
    for (let i = 1; i <= n; i++) for (const s of sizes) if (s <= i) best[i] = Math.min(best[i], best[i - s] + 1);
    return best[n];
  };
  for (const sizes of [[3, 7], [5, 8, 12], [2, 9, 10], [4, 6, 15]]) {
    for (let n = 1; n <= 60; n++) {
      const r = minBundles(sizes, n);
      const expected = brute(sizes, n);
      assert.equal(r === null ? Infinity : r.totalBundles, expected, `${sizes} / ${n}`);
    }
  }
});

// ---- cycles ----
// ids: 1 Iron Man, 2 First Avenger, 3 Avengers, 4 Civil War, 5 Ragnarok, 6 Infinity War, 7 Endgame, 8 Doomsday
const mcu = () =>
  new Map([
    [3, [1, 2]],
    [4, [3]],
    [6, [4, 5]],
    [7, [6]],
    [8, [7]],
  ]);

test('cycle: self dependency', () => assert.deepEqual(findCycle(new Map(), 1, [1]), [1, 1]));
test('cycle: Endgame as prerequisite of Iron Man is circular', () => {
  const path = findCycle(mcu(), 1, [7]);
  assert.deepEqual(path, [1, 7, 6, 4, 3, 1]);
});
test('cycle: valid changes are allowed', () => {
  assert.equal(findCycle(mcu(), 5, [1]), null); // Ragnarok after Iron Man
  assert.equal(findCycle(mcu(), 8, [7, 5]), null); // extra edge, no cycle
  assert.equal(findCycle(mcu(), 1, []), null);
});
test('cycle: indirect two-step cycle', () => {
  const g = new Map([[2, [1]]]); // 2 needs 1
  assert.deepEqual(findCycle(g, 1, [2]), [1, 2, 1]);
});

test('cycle: very long chain does not overflow the stack', () => {
  const g = new Map();
  for (let i = 2; i <= 50000; i++) g.set(i, [i - 1]);
  assert.ok(findCycle(g, 1, [50000]));
  assert.equal(findCycle(g, 50001, [50000]), null);
});

// ---- rewatch order ----
const assertValidOrder = (order, graph, target) => {
  assert.equal(new Set(order).size, order.length, 'each movie exactly once');
  assert.ok(!order.includes(target), 'target excluded');
  const pos = new Map(order.map((id, i) => [id, i]));
  for (const id of order) for (const dep of graph.get(id) ?? []) assert.ok(pos.get(dep) < pos.get(id), `${dep} before ${id}`);
};

test('rewatch: Doomsday -> all 7 others, valid order', () => {
  const order = rewatchOrder(mcu(), 8);
  assert.deepEqual([...order].sort(), [1, 2, 3, 4, 5, 6, 7]);
  assertValidOrder(order, mcu(), 8);
  assert.deepEqual(order, [1, 2, 3, 4, 5, 6, 7]); // the sample order from the brief
});
test('rewatch: Civil War -> Iron Man, First Avenger, then The Avengers', () => {
  const order = rewatchOrder(mcu(), 4);
  assert.deepEqual(order.slice(0, 2).sort(), [1, 2]);
  assert.equal(order[2], 3);
  assert.equal(order.length, 3);
});
test('rewatch: Ragnarok -> empty', () => assert.deepEqual(rewatchOrder(mcu(), 5), []));
test('rewatch: diamond shape lists shared prerequisite once', () => {
  const g = new Map([[4, [2, 3]], [2, [1]], [3, [1]]]);
  const order = rewatchOrder(g, 4);
  assert.deepEqual(order, [1, 2, 3]);
  assertValidOrder(order, g, 4);
});
test('rewatch: refuses to loop on corrupt cyclic data', () => {
  assert.throws(() => rewatchOrder(new Map([[1, [2]], [2, [1]]]), 1));
});
