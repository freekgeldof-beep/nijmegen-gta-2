import { nearestRoadPoint, roadDistances, distanceToTarget } from './navigation.js';

export function createCourier(world) {
  const state = { status: 'idle', target: null, remaining: 0, duration: 0, reward: 0, earnings: 0, completed: 0, reason: '' };
  const destinations = world.landmarks.map(lm => {
    const point = nearestRoadPoint(world.roads, lm.cx, lm.cy);
    if (!point || point.distance > 160 || world.collidesBuildingsOrRing(point.x, point.y, 0, 4.2, 4.2)) return null;
    return { ...point, name: lm.name };
  }).filter(Boolean);

  function start(player) {
    if (state.status === 'active' || player.wasted || player.busted) return false;
    const origin = nearestRoadPoint(world.roads, player.x, player.y);
    const distances = roadDistances(world, origin);
    const candidates = destinations.map(target => ({ target, distance: distanceToTarget(target, origin, distances) }))
      .filter(item => item.distance >= 250 && item.distance <= 2200)
      .sort((a, b) => a.distance - b.distance);
    if (!candidates.length) {
      state.status = 'failed'; state.reason = 'Geen bezorgadres bereikbaar. Probeer het vanaf een andere straat.';
      return false;
    }
    const choice = candidates[state.completed % Math.min(candidates.length, 5)];
    state.target = choice.target;
    state.duration = Math.ceil(45 + choice.distance / 9);
    state.remaining = state.duration;
    state.reward = Math.round((150 + choice.distance * 0.2) / 10) * 10;
    state.status = 'active'; state.reason = '';
    return true;
  }
  function update(dt, player) {
    if (state.status !== 'active') return;
    state.remaining = Math.max(0, state.remaining - dt);
    if (player.wasted || player.busted || state.remaining === 0) {
      state.status = 'failed';
      state.reason = player.wasted ? 'Lading verloren.' : player.busted ? 'Lading in beslag genomen.' : 'De bezorgtijd is verstreken.';
    } else if (player.mode === 'car' && Math.abs(player.speed) < 2 && !player.wanted && Math.hypot(player.x - state.target.x, player.y - state.target.y) < 12) {
      state.status = 'complete'; state.earnings += state.reward; state.completed++;
    }
  }
  return { state, start, update };
}
