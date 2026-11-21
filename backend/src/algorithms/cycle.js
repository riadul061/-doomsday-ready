/**
 * Circular-dependency detection (hand-written, no graph libraries).
 *
 * The graph is a Map<movieId, prerequisiteId[]>: an edge A -> B means
 * "A needs B watched first".
 *
 * Giving `movieId` the prerequisites `newPrereqIds` creates a cycle exactly when
 * `movieId` can already be reached by following prerequisite edges from one of
 * the new prerequisites (or when a new prerequisite is the movie itself).
 *
 * Returns the cycle as a list of ids that starts and ends with `movieId`
 * (for example [Iron Man, Endgame, Infinity War, ..., Iron Man]) or `null`
 * when the change is safe. Iterative DFS, so deep chains cannot overflow the stack.
 */
export function findCycle(prereqMap, movieId, newPrereqIds) {
  // `cameFrom` doubles as the visited set and lets us rebuild the path.
  const cameFrom = new Map();
  const stack = [];

  for (const id of newPrereqIds) {
    if (id === movieId) return [movieId, movieId];
    if (!cameFrom.has(id)) {
      cameFrom.set(id, null);
      stack.push(id);
    }
  }

  while (stack.length > 0) {
    const current = stack.pop();
    for (const next of prereqMap.get(current) ?? []) {
      if (next === movieId) {
        const chain = [];
        for (let node = current; node !== null; node = cameFrom.get(node)) chain.push(node);
        chain.reverse();
        return [movieId, ...chain, movieId];
      }
      if (!cameFrom.has(next)) {
        cameFrom.set(next, current);
        stack.push(next);
      }
    }
  }
  return null;
}
