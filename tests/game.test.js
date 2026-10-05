import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildWorld } from '../src/world.js';
import { createGameState } from '../src/entities.js';
import { createStepper } from '../src/timing.js';
import { nearestRoadPoint, roadDistances, distanceToTarget } from '../src/navigation.js';

const read = name => JSON.parse(fs.readFileSync(new URL(`../test/fixtures/eindhoven/${name}.json`, import.meta.url)));
const world = buildWorld({ osm: read('osm-data'), green: read('green-data'), extra: read('extra-data'), landmarks: read('landmarks'), rails: read('rails') });

test('water centre-lines stay narrow instead of filling across the city', () => {
  assert.ok(world.waterLines.length >= 4);
  assert.ok(world.waters.length < 20);
  assert.ok(world.groundPatches.length > 100);
});

test('Philips Stadion has reachable shirts and streets have furniture', () => {
  const stadium = world.landmarks.find(l => l.name === 'Philips Stadion');
  assert.ok(stadium);
  assert.ok(world.streetFurniture.length > 100);
  assert.equal(world.stadiumShirts.length, 3);
  assert.ok(world.caseStops.length >= 4);
  assert.equal(world.landmarkDecor.length, world.caseStops.length);
  for (const shirt of world.stadiumShirts) {
    assert.ok(Math.hypot(shirt.x - stadium.cx, shirt.y - stadium.cy) < 115);
    assert.equal(world.overlappingBuilding(shirt.x, shirt.y, 0, 2, 2), null);
  }
  const sim = createGameState(world);
  sim.state.traffic.length = 0; sim.state.police.length = 0;
  const shirt = sim.state.pickups.find(p => p.type === 'shirt');
  sim.state.player.x = shirt.x; sim.state.player.y = shirt.y;
  sim.update(1 / 60);
  assert.ok(sim.state.player.shirtImmuneT > 39);
  assert.equal(shirt.alive, false);
});

test('solo checkpoint race extends the clock and finishes in order', () => {
  const sim = createGameState(world);
  assert.equal(sim.startRace(), true);
  const { race, player } = sim.state;
  assert.ok(race.checkpoints.length >= 3);
  assert.equal(sim.startMission(), false);
  sim.state.police.length = 0; sim.state.traffic.length = 0;
  let previous = race.remaining;
  for (const point of race.checkpoints) {
    player.x = point.x; player.y = point.y; player.speed = 0;
    sim.update(1 / 60);
    if (race.status === 'active') { assert.ok(race.remaining > previous); previous = race.remaining; }
  }
  assert.equal(race.status, 'complete');
  assert.ok(race.best > 0);
});

test('pickup timers use elapsed time at 30, 60 and 144 FPS', () => {
  for (const fps of [30, 60, 144]) {
    const sim = createGameState(world);
    const pickup = sim.state.pickups.find(p => p.type === 'beer');
    pickup.alive = false; pickup.respawnT = 90;
    for (let i = 0; i < fps; i++) sim.update(1 / fps);
    assert.ok(Math.abs(pickup.respawnT - 89) < 1e-8);
  }
});

test('fixed simulation steps are independent of rendering frequency', () => {
  for (const fps of [30, 60, 144]) {
    const clock = createStepper(); let steps = 0, elapsed = 0;
    for (let i = 0; i < fps; i++) clock.advance(1 / fps, dt => { steps++; elapsed += dt; });
    assert.equal(steps, 60); assert.ok(Math.abs(elapsed - 1) < 1e-8);
    clock.advance(10, () => { steps++; }); assert.equal(steps, 68);
    clock.reset(); assert.equal(clock.advance(0, () => assert.fail('Unexpected step')), 0);
  }
});

test('events drain and keys clear without retaining old input', () => {
  const sim = createGameState(world);
  for (let i = 0; i < 100; i++) { sim.resetGame(); assert.equal(sim.drainEvents().length, 1); }
  assert.equal(sim.state.events.length, 0);
  sim.setKey('ArrowUp', true); sim.setKey('w', true); sim.clearKeys();
  assert.deepEqual(sim.keys, {});
});

test('weapons trigger wanted status and restart escape progress', () => {
  const sim = createGameState(world);
  sim.shoot(); assert.equal(sim.state.player.wanted, true);
  sim.state.player.wantedClearTimer = 10; sim.placeMine();
  assert.equal(sim.state.player.wantedClearTimer, 0);
});

test('courier mission has a reachable target and pays once only after a safe stop', () => {
  const sim = createGameState(world);
  assert.equal(sim.startMission(), true);
  const { mission, player } = sim.state;
  const origin = nearestRoadPoint(world.roads, player.x, player.y);
  assert.ok(Number.isFinite(distanceToTarget(mission.target, origin, roadDistances(world, origin))));
  assert.equal(sim.startMission(), false);
  player.x = mission.target.x; player.y = mission.target.y;
  player.mode = 'foot'; sim.update(1 / 60); assert.equal(mission.status, 'active');
  player.mode = 'car'; player.wanted = true; sim.update(1 / 60); assert.equal(mission.status, 'active');
  player.wanted = false; player.speed = 0;
  sim.state.police.length = 0; sim.state.traffic.length = 0;
  sim.update(1 / 60); assert.equal(mission.status, 'complete');
  assert.equal(mission.earnings, mission.reward);
  sim.update(1 / 60); assert.equal(mission.earnings, mission.reward);
});

test('timeout, arrest and reset fail a mission without awarding money', () => {
  for (const failure of ['timeout', 'busted', 'reset']) {
    const sim = createGameState(world); assert.equal(sim.startMission(), true);
    if (failure === 'timeout') sim.state.mission.remaining = .001;
    if (failure === 'busted') sim.state.player.busted = true;
    if (failure === 'reset') sim.resetGame();
    sim.update(1 / 60);
    assert.equal(sim.state.mission.status, 'failed'); assert.equal(sim.state.mission.earnings, 0);
  }
});

test('shortest paths route around a detour and exclude disconnected roads', () => {
  const nodesById = new Map([0,1,2,3,4,5].map(id => [id, { id, edges: [] }]));
  const road = (a,b,len) => { const r = {nodeStart:a,nodeEnd:b,len,hw:'residential'}; nodesById.get(a).edges.push(r); nodesById.get(b).edges.push(r); return r; };
  const a = road(0,1,10), b = road(1,2,20), c = road(2,3,10), isolated = road(4,5,5);
  const target = {road:c,dist:5}; const distances = roadDistances({nodesById},target);
  assert.equal(distanceToTarget({road:a,dist:5},target,distances), 30);
  assert.equal(distanceToTarget({road:isolated,dist:2},target,distances), Infinity);
  assert.equal(distances.get(b.nodeStart), 25);
});

test('turning beside a building never rotates the car into its footprint', () => {
  const sim = createGameState(world);
  sim.state.traffic.length = 0; sim.state.police.length = 0;
  const p = sim.state.player;
  Object.assign(p, { x: -36.465556249459475, y: -291.36133200002075, angle: 0, speed: 12 });
  assert.equal(world.collidesBuildingsOrRing(p.x, p.y, p.angle, p.w, p.h), false);
  assert.equal(world.collidesBuildingsOrRing(p.x, p.y, p.angle + sim.CAR_PHYS.turnSpeed / 60, p.w, p.h), true);
  sim.setKey('ArrowRight', true);
  sim.update(1 / 60);
  assert.equal(p.angle, 0);
  assert.equal(world.collidesBuildingsOrRing(p.x, p.y, p.angle, p.w, p.h), false);
});

test('cars and buses stop before a parked vehicle in both directions', () => {
  for (const [vtype, w, h] of [['car', 4.2, 1.9], ['bus', 8.2, 2.5]]) {
    for (const direction of [1, -1]) {
      const sim = createGameState(world);
      sim.state.traffic.length = 0; sim.state.police.length = 0;
      const p = sim.state.player;
      Object.assign(p, { vtype, w, h });
      const parked = { x: p.x + Math.cos(p.angle) * (w + 1.5) * direction,
        y: p.y + Math.sin(p.angle) * (w + 1.5) * direction,
        angle: p.angle, w, h, vtype };
      assert.equal(world.collidesBuildingsOrRing(parked.x, parked.y, parked.angle, w, h), false);
      sim.state.parkedCars.push(parked);
      sim.setKey(direction > 0 ? 'ArrowUp' : 'ArrowDown', true);
      for (let i = 0; i < 240; i++) {
        sim.update(1 / 60);
        assert.equal(world.polysIntersect(world.carCorners(p.x, p.y, p.angle, w, h),
          world.carCorners(parked.x, parked.y, parked.angle, w, h)), false);
        assert.equal(world.collidesBuildingsOrRing(p.x, p.y, p.angle, w, h), false);
      }
    }
  }
});

test('exit chooses a clear side when the first door faces a building', () => {
  const sim = createGameState(world);
  const p = sim.state.player;
  Object.assign(p, { x: 433.3190599423024, y: -399.6905319998468, angle: -1.726465503418116 });
  const nx = -Math.sin(p.angle), ny = Math.cos(p.angle);
  assert.ok([2.2, 2.8, 3.4].every(d => world.collidesBuildingsOrRing(p.x + nx * d, p.y + ny * d, 0, 0.6, 0.6)));
  sim.toggleEnterExit();
  assert.equal(p.mode, 'foot');
  assert.equal(world.collidesBuildingsOrRing(p.x, p.y, 0, 0.6, 0.6), false);
  assert.equal(sim.state.parkedCars.length, 1);
});
