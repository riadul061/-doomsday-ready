/**
 * Rewatch order (hand-written topological sort).
 *
 * Returns every movie the target depends on, directly or indirectly, each
 * exactly once, so that each movie appears after all of its own prerequisites.
 * The target itself is not included.
 *
 * Method: depth-first search that emits a movie only after all of its
 * prerequisites have been emitted (post-order). Prerequisites are visited in
 * the order given (the API passes them sorted by id) so the output is
 * deterministic. It is iterative to stay safe on long chains.
 *
 * @param {Map<number, number[]>} prereqMap movieId -> prerequisite ids
 * @param {number} targetId
 * @returns {number[]} ids in watch order
 */
export function rewatchOrder(prereqMap, targetId) {
  const VISITING = 1;
  const DONE = 2;
  const state = new Map();
  const order = [];

  state.set(targetId, VISITING);
  const stack = [{ id: targetId, deps: prereqMap.get(targetId) ?? [], next: 0 }];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];

    if (frame.next < frame.deps.length) {
      const dep = frame.deps[frame.next++];
      const seen = state.get(dep);
      if (seen === DONE) continue;
      if (seen === VISITING) {
        // Cannot happen while writes are validated, but never loop forever on bad data.
        throw new Error(`Circular dependency detected at movie ${dep}`);
      }
      state.set(dep, VISITING);
      stack.push({ id: dep, deps: prereqMap.get(dep) ?? [], next: 0 });
    } else {
      stack.pop();
      state.set(frame.id, DONE);
      if (frame.id !== targetId) order.push(frame.id);
    }
  }
  return order;
}
