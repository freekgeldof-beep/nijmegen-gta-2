import { nearestRoadPoint, roadDistances, distanceToTarget, isDriveable } from './navigation.js';

export function createCheckpointRace(world) {
  const state = { status: 'idle', checkpoints: [], index: 0, remaining: 0, elapsed: 0, best: null, reason: '' };
  const candidates = [];
  for (const road of world.roads) {
    if (!isDriveable(road) || road.len < 20) continue;
    for (let i = 1; i < road.pts.length; i += Math.max(1, Math.ceil(road.pts.length / 10)))
      candidates.push({ road, dist: road.cum[i], x: road.pts[i].x, y: road.pts[i].y });
  }
  function start(player) {
    if (player.mode !== 'car' || player.wasted || player.busted) { state.reason = 'Stap eerst in een auto.'; return false; }
    let origin = nearestRoadPoint(world.roads, player.x, player.y);
    if (!origin) { state.reason = 'Geen weg in de buurt.'; return false; }
    const points = [];
    for (let index = 0; index < 5; index++) {
      const distances = roadDistances(world, origin);
      const options = candidates.map(point => ({ point, route: distanceToTarget(point, origin, distances),
        direct: Math.hypot(point.x - origin.x, point.y - origin.y) }))
        .filter(item => item.route >= 260 && item.route <= 560 && item.direct >= 180 &&
          points.every(old => Math.hypot(item.point.x - old.x, item.point.y - old.y) > 130));
      if (!options.length) break;
      options.sort((a, b) => Math.abs(a.route - (380 + (index % 2) * 65)) - Math.abs(b.route - (380 + (index % 2) * 65)));
      const choice = options[Math.min(options.length - 1, (index * 13) % Math.min(15, options.length))].point;
      points.push({ x: choice.x, y: choice.y, name: index === 4 ? 'FINISH' : `CHECKPOINT ${index + 1}` });
      origin = choice;
    }
    if (points.length < 3) { state.reason = 'Geen raceparcours beschikbaar.'; return false; }
    Object.assign(state, { status: 'active', checkpoints: points, index: 0, remaining: 45,
      elapsed: 0, reason: '' });
    return true;
  }
  function update(dt, player) {
    if (state.status !== 'active') return null;
    state.elapsed += dt; state.remaining = Math.max(0, state.remaining - dt);
    if (player.wasted || player.busted || state.remaining <= 0 || player.mode !== 'car') {
      state.status = 'failed'; state.reason = player.wasted ? 'Auto verloren.' : 'Tijd op!'; return 'failed';
    }
    const checkpoint = state.checkpoints[state.index];
    if (Math.hypot(player.x - checkpoint.x, player.y - checkpoint.y) < 14) {
      state.index++;
      if (state.index === state.checkpoints.length) {
        state.status = 'complete';
        if (state.best === null || state.elapsed < state.best) state.best = state.elapsed;
        return 'complete';
      }
      state.remaining += 22;
      return 'checkpoint';
    }
    return null;
  }
  function reset() { if (state.status === 'active') { state.status = 'failed'; state.reason = 'Race afgebroken.'; } }
  return { state, start, update, reset };
}
