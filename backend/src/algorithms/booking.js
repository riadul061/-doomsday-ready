/**
 * Fewest bundles that add up to exactly `groupSize` seats (hand-written DP).
 *
 * This is the classic unbounded "minimum coin change" problem:
 *   best[n] = fewest bundles summing to exactly n seats  (Infinity if impossible)
 *   best[n] = 1 + min(best[n - size]) over every bundle size <= n
 * Complexity is O(groupSize * bundleSizes), at most 10,000 * 10 steps here.
 *
 * Greedy (always take the biggest bundle) is wrong: sizes 6, 9, 20 for 44 seats
 * would take 20+20 and then get stuck.
 *
 * @param {number[]} sizes distinct positive bundle sizes
 * @param {number} groupSize seats needed, >= 1
 * @returns {{ totalBundles: number, bundles: {size:number,count:number}[] } | null}
 *   bundles are sorted largest first; null when no exact combination exists
 */
export function minBundles(sizes, groupSize) {
  const best = new Array(groupSize + 1).fill(Infinity);
  const lastBundle = new Array(groupSize + 1).fill(0);
  best[0] = 0;

  for (let seats = 1; seats <= groupSize; seats++) {
    for (const size of sizes) {
      if (size > seats) continue;
      const candidate = best[seats - size] + 1;
      if (candidate < best[seats]) {
        best[seats] = candidate;
        lastBundle[seats] = size;
      }
    }
  }

  if (best[groupSize] === Infinity) return null;

  // Walk back through the choices to count how many of each size were used.
  const counts = new Map();
  for (let seats = groupSize; seats > 0; seats -= lastBundle[seats]) {
    const size = lastBundle[seats];
    counts.set(size, (counts.get(size) ?? 0) + 1);
  }

  const bundles = [...counts.entries()]
    .map(([size, count]) => ({ size, count }))
    .sort((a, b) => b.size - a.size);

  return { totalBundles: best[groupSize], bundles };
}
