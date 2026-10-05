export const isDriveable = road => road.len > 0 && road.hw !== 'pedestrian' && road.hw !== 'living_street';

export function nearestRoadPoint(roads, x, y) {
  let best = null;
  for (const road of roads) {
    if (!isDriveable(road)) continue;
    for (let i = 1; i < road.pts.length; i++) {
      const a = road.pts[i - 1], b = road.pts[i];
      const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
      if (!length2) continue;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length2));
      const px = a.x + dx * t, py = a.y + dy * t;
      const distance = Math.hypot(x - px, y - py);
      if (!best || distance < best.distance) best = { road, x: px, y: py, distance, dist: road.cum[i - 1] + Math.sqrt(length2) * t };
    }
  }
  return best;
}

// One reverse shortest-path field is shared by all pursuing vehicles.
export function roadDistances(world, target) {
  const distances = new Map();
  if (!target) return distances;
  const heap = [];
  function push(id, cost) {
    let i = heap.length;
    heap.push({ id, cost });
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent].cost <= cost) break;
      heap[i] = heap[parent]; i = parent;
    }
    heap[i] = { id, cost };
  }
  function pop() {
    const first = heap[0], last = heap.pop();
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].cost < heap[child].cost) child++;
        if (heap[child].cost >= last.cost) break;
        heap[i] = heap[child]; i = child;
      }
      heap[i] = last;
    }
    return first;
  }
  for (const [id, cost] of [[target.road.nodeStart, target.dist], [target.road.nodeEnd, target.road.len - target.dist]]) {
    if (cost < (distances.get(id) ?? Infinity)) { distances.set(id, cost); push(id, cost); }
  }
  while (heap.length) {
    const { id, cost } = pop();
    if (cost !== distances.get(id)) continue;
    for (const road of world.nodesById.get(id).edges) {
      if (!isDriveable(road)) continue;
      const next = road.nodeStart === id ? road.nodeEnd : road.nodeStart;
      const candidate = cost + road.len;
      if (candidate < (distances.get(next) ?? Infinity)) { distances.set(next, candidate); push(next, candidate); }
    }
  }
  return distances;
}

export function distanceToTarget(point, target, distances) {
  if (!point || !target) return Infinity;
  return Math.min(
    point.road === target.road ? Math.abs(point.dist - target.dist) : Infinity,
    point.dist + (distances.get(point.road.nodeStart) ?? Infinity),
    point.road.len - point.dist + (distances.get(point.road.nodeEnd) ?? Infinity),
  );
}
