import test from 'node:test';
import assert from 'node:assert/strict';
import { createArena } from '../server/arena.js';

const world = {
  roads: [{ pts: [{ x: 10, y: 10 }], len: 1 }],
  findSpawnNear: (x, y) => ({ x, y }),
  pointInPoly: () => true,
  overlappingBuilding: () => false,
  collidesBuildingsOrRing: () => false,
  carCorners: () => [], polysIntersect: () => false,
  SPAWN_CENTER: { x: 10, y: 10 }, ringPts: [],
};
const user = id => ({ id, username: id, avatar: 'driver', country: 'NL',
  stats: { kills: 0, deaths: 0, distanceKm: 0, secondsPlayed: 0 } });

test('online combat applies server damage and persists kills/deaths', () => {
  const saved = [];
  const arena = createArena(world, p => saved.push(p.id));
  const a = arena.add(user('a'), { close() {} }), b = arena.add(user('b'), { close() {} });
  a.x = 0; a.y = 0; a.angle = 0; b.x = 8; b.y = 0;
  arena.input('a', { type: 'shoot' });
  arena.tick(.05);
  assert.equal(b.health, 75);
  arena.input('a', { type: 'mine' });
  b.x = -4; b.y = 0;
  for (let i = 0; i < 20; i++) arena.tick(.05);
  assert.equal(b.health, 0);
  assert.equal(a.stats.kills, 1);
  assert.equal(b.stats.deaths, 1);
  assert.deepEqual(new Set(saved), new Set(['a', 'b']));
});

test('cloak hides a player from snapshots and prevents target lock', () => {
  const arena = createArena(world);
  const a = arena.add(user('a'), { close() {} }), b = arena.add(user('b'), { close() {} });
  a.x = 0; a.y = 0; a.angle = 0; a.rockets = 1; b.x = 20; b.y = 0;
  b.cloakUntil = 30;
  assert.deepEqual(arena.snapshot(a).players.map(p => p.id), ['a']);
  arena.input('a', { type: 'input', lock: true });
  assert.equal(a.lockId, null);
  b.cloakUntil = 0;
  arena.input('a', { type: 'input', lock: true });
  assert.equal(a.lockId, 'b');
  for (let i = 0; i < 25; i++) arena.tick(.05);
  arena.input('a', { type: 'input', lock: false });
  for (let i = 0; i < 25; i++) arena.tick(.05);
  assert.equal(a.rockets, 0);
  assert.equal(b.health, 25);
});

test('stadium shirt protects a player from damage and respawns later', () => {
  const arena = createArena({ ...world, stadiumShirts: [{ x: 0, y: 0 }] });
  const a = arena.add(user('a'), { close() {} }), b = arena.add(user('b'), { close() {} });
  a.x = 0; a.y = 0; b.x = -8; b.y = 0; b.angle = 0;
  arena.tick(.05);
  assert.equal(arena.snapshot(a).players[0].shield, 40);
  assert.equal(arena.snapshot(a).shirts.length, 0);
  arena.input('b', { type: 'shoot' });
  arena.tick(.05);
  assert.equal(a.health, 100);
  a.shieldUntil = 0;
  for (let i = 0; i < 7; i++) arena.tick(.05);
  arena.input('b', { type: 'shoot' });
  for (let i = 0; i < 8; i++) arena.tick(.05);
  assert.equal(a.health, 75);
});

test('case delivery rewards the carrier and enters cooldown', () => {
  const saved = [];
  const arena = createArena({ ...world, caseStops: [
    { name: 'Stadhuis', x: 0, y: 0 }, { name: 'PSV', x: 400, y: 0 },
  ] }, p => saved.push(p.id));
  const a = arena.add(user('a'), { close() {} });
  arena.tick(.05);
  assert.equal(arena.caseRun.phase, 'ground');
  a.x = arena.caseRun.x; a.y = arena.caseRun.y;
  arena.tick(.05);
  assert.equal(arena.caseRun.phase, 'carried');
  assert.equal(arena.snapshot(a).case.carrierId, 'a');
  a.x = arena.caseRun.target.x; a.y = arena.caseRun.target.y; a.speed = 0;
  arena.tick(.05);
  assert.equal(arena.caseRun.phase, 'cooldown');
  assert.equal(a.stats.casesDelivered, 1);
  assert.deepEqual(saved, ['a']);
});

test('case carrier stays visible and drops the case when destroyed', () => {
  const arena = createArena({ ...world, caseStops: [
    { name: 'Centraal', x: 0, y: 0 }, { name: 'Evoluon', x: 400, y: 0 },
  ] });
  const a = arena.add(user('a'), { close() {} }), b = arena.add(user('b'), { close() {} });
  arena.tick(.05);
  a.x = arena.caseRun.x; a.y = arena.caseRun.y; b.x = -100; b.y = -100;
  arena.tick(.05);
  a.cloakUntil = 100;
  assert.equal(arena.snapshot(b).players.some(p => p.id === 'a'), true);
  a.health = 25;
  b.x = a.x - 8; b.y = a.y; b.angle = 0;
  arena.input('b', { type: 'shoot' });
  arena.tick(.05);
  assert.equal(arena.caseRun.phase, 'ground');
  assert.equal(arena.caseRun.carrierId, null);
  assert.equal(arena.snapshot(b).case.x, a.x);
});
